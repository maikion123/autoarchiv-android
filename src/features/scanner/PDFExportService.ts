// PDF export service
// Generates PDF from scanned pages using jsPDF

import type { ScannedPage } from "./types";

export async function generatePDFFromPages(pages: ScannedPage[], filename: string): Promise<File> {
  if (pages.length === 0) {
    throw new Error("Keine Seiten zum Exportieren");
  }

  // Dynamic import of jsPDF
  const { jsPDF } = await import("jspdf");

  // Create PDF in A4 portrait (210mm × 297mm)
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // Create temporary image to get dimensions
    const img = await loadImage(page.dataUrl);
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    const aspectRatio = imgHeight / imgWidth;

    // A4 page dimensions: 210mm × 297mm
    const pageWidth = 210 - 20; // 20mm margins
    const pageHeight = 297 - 20;

    // Calculate dimensions to fit page while maintaining aspect ratio
    let finalWidth = pageWidth;
    let finalHeight = finalWidth * aspectRatio;

    if (finalHeight > pageHeight) {
      finalHeight = pageHeight;
      finalWidth = finalHeight / aspectRatio;
    }

    // Center image on page
    const x = (210 - finalWidth) / 2;
    const y = (297 - finalHeight) / 2;

    // Add image to PDF
    pdf.addImage(page.dataUrl, "JPEG", x, y, finalWidth, finalHeight);

    // Add new page for next image (except last one)
    if (i < pages.length - 1) {
      pdf.addPage();
    }
  }

  // Generate PDF blob
  const pdfBlob = pdf.output("blob");

  // Create File object
  const file = new File([pdfBlob], filename, { type: "application/pdf" });

  return file;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
    img.crossOrigin = "anonymous";
  });
}

export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
}
