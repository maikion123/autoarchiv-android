"""
Document Scanner Microservice
Endpoint: http://localhost:3002

Routes:
  POST /detect  - detect document corners in a frame (base64 JPEG)
  POST /process - perspective-correct captured image
  POST /adjust  - rotate / crop / colorize image
  GET  /health  - liveness check
"""

import base64
import io
import json
import logging
import math

import numpy as np
from flask import Flask, jsonify, request
from PIL import Image, ImageEnhance, ImageFilter
from skimage import color, feature, filters, morphology, transform
from skimage.measure import label, regionprops

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB


# ─── helpers ──────────────────────────────────────────────────────────────────

def _b64_to_pil(b64: str) -> Image.Image:
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")


def _pil_to_b64(img: Image.Image, fmt: str = "JPEG", quality: int = 90) -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _order_corners(pts):
    """Order 4 points: top-left, top-right, bottom-right, bottom-left."""
    pts = np.array(pts, dtype=np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def _four_point_transform(img_np: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """Perspective-warp the image to a top-down view of the document."""
    rect = _order_corners(pts)
    (tl, tr, br, bl) = rect

    # Compute output dimensions
    w_bottom = np.linalg.norm(br - bl)
    w_top = np.linalg.norm(tr - tl)
    w = int(max(w_bottom, w_top))

    h_right = np.linalg.norm(tr - br)
    h_left = np.linalg.norm(tl - bl)
    h = int(max(h_right, h_left))

    if w < 10 or h < 10:
        return img_np

    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)

    tform = transform.ProjectiveTransform()
    tform.estimate(dst, rect)
    warped = transform.warp(
        img_np, tform, output_shape=(h, w), order=1, preserve_range=True
    )
    return warped.astype(np.uint8)


def _detect_document_corners(img: Image.Image):
    """
    Detect the 4 corners of a document in the image.
    Returns (corners, confidence) where corners is [[x,y], ...] or None.
    """
    iw, ih = img.size
    # Downscale for speed
    scale = min(640 / iw, 640 / ih, 1.0)
    work_w, work_h = int(iw * scale), int(ih * scale)
    work = img.resize((work_w, work_h), Image.LANCZOS)

    gray = np.array(work.convert("L"), dtype=np.float64) / 255.0

    # Gaussian blur to reduce noise
    blurred = filters.gaussian(gray, sigma=1.5)

    # Canny edges
    edges = feature.canny(blurred, sigma=1.0, low_threshold=0.05, high_threshold=0.15)

    # Dilate edges to connect broken lines
    edges = morphology.binary_dilation(edges, morphology.disk(2))

    # Label connected regions — find the largest closed region
    labeled = label(edges)
    regions = regionprops(labeled)

    # Sort by area descending
    regions.sort(key=lambda r: r.area, reverse=True)

    best_corners = None
    best_score = 0.0

    for region in regions[:10]:
        # Filter tiny regions
        area_frac = region.area / (work_w * work_h)
        if area_frac < 0.01:
            break

        # Use convex hull of the region as a proxy for document corners
        coords = region.coords  # (row, col)
        if len(coords) < 4:
            continue

        # Get bounding box
        min_r, min_c, max_r, max_c = region.bbox
        bbox_w = max_c - min_c
        bbox_h = max_r - min_r

        if bbox_w < work_w * 0.1 or bbox_h < work_h * 0.1:
            continue

        # Approximate as 4 corners (TL, TR, BR, BL from bbox)
        corners_scaled = np.array([
            [min_c, min_r],
            [max_c, min_r],
            [max_c, max_r],
            [min_c, max_r],
        ], dtype=np.float32)

        # Score: area fraction × aspect-ratio proximity to A4
        a4_ratio = 297 / 210
        ar = bbox_h / max(bbox_w, 1)
        ar_score = 1.0 - min(abs(ar - a4_ratio), abs(ar - 1 / a4_ratio)) / a4_ratio
        score = area_frac * max(ar_score, 0.3)

        if score > best_score:
            best_score = score
            best_corners = corners_scaled / scale  # back to original scale

    confidence = min(best_score * 2.0, 1.0)
    return best_corners, confidence


# ─── routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "document-scanner"})


@app.post("/detect")
def detect():
    """
    Input:  { "image": "data:image/jpeg;base64,..." }
    Output: { "detected": bool, "corners": [[x,y]x4]|null,
              "confidence": 0-1, "quality": "poor"|"ok"|"good" }
    """
    try:
        data = request.get_json(force=True)
        img = _b64_to_pil(data["image"])
        corners, confidence = _detect_document_corners(img)

        quality = "poor"
        if confidence > 0.55:
            quality = "good"
        elif confidence > 0.30:
            quality = "ok"

        return jsonify(
            {
                "detected": corners is not None and confidence > 0.25,
                "corners": corners.tolist() if corners is not None else None,
                "confidence": round(float(confidence), 3),
                "quality": quality,
            }
        )
    except Exception as exc:
        log.exception("detect error")
        return jsonify({"error": str(exc)}), 500


@app.post("/process")
def process():
    """
    Input:  { "image": "data:image/jpeg;base64,...",
              "corners": [[x,y]x4] | null,
              "enhance": true }
    Output: { "image": "data:image/jpeg;base64,..." }
    """
    try:
        data = request.get_json(force=True)
        img = _b64_to_pil(data["image"])
        corners = data.get("corners")
        enhance = data.get("enhance", True)

        img_np = np.array(img)

        if corners and len(corners) == 4:
            img_np = _four_point_transform(img_np, np.array(corners, dtype=np.float32))

        result = Image.fromarray(img_np)

        if enhance:
            result = ImageEnhance.Contrast(result).enhance(1.15)
            result = ImageEnhance.Sharpness(result).enhance(1.3)

        return jsonify({"image": _pil_to_b64(result)})
    except Exception as exc:
        log.exception("process error")
        return jsonify({"error": str(exc)}), 500


@app.post("/adjust")
def adjust():
    """
    Input:  { "image": "data:image/jpeg;base64,...",
              "rotate": 0|90|180|270,
              "grayscale": false,
              "enhance": true,
              "brightness": 1.0,
              "contrast": 1.0,
              "crop": {"x":0,"y":0,"w":100,"h":100} | null }
    Output: { "image": "data:image/jpeg;base64,..." }
    """
    try:
        data = request.get_json(force=True)
        img = _b64_to_pil(data["image"])

        rotate = int(data.get("rotate", 0))
        if rotate in (90, 180, 270):
            img = img.rotate(-rotate, expand=True)

        crop = data.get("crop")
        if crop:
            iw, ih = img.size
            x = max(0, int(crop["x"]))
            y = max(0, int(crop["y"]))
            w = min(int(crop["w"]), iw - x)
            h = min(int(crop["h"]), ih - y)
            if w > 10 and h > 10:
                img = img.crop((x, y, x + w, y + h))

        brightness = float(data.get("brightness", 1.0))
        if brightness != 1.0:
            img = ImageEnhance.Brightness(img).enhance(brightness)

        contrast = float(data.get("contrast", 1.0))
        if contrast != 1.0:
            img = ImageEnhance.Contrast(img).enhance(contrast)

        if data.get("enhance", False):
            img = ImageEnhance.Sharpness(img).enhance(1.3)

        if data.get("grayscale", False):
            img = img.convert("L").convert("RGB")

        return jsonify({"image": _pil_to_b64(img)})
    except Exception as exc:
        log.exception("adjust error")
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    log.info("Document Scanner service starting on port 3002")
    app.run(host="0.0.0.0", port=3002, debug=False)
