const DEFAULT_TIMEOUT_MS = 8000;

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function normalizeBaseUrl(value) {
  const base = String(value || "").trim();
  if (!base) return "";
  return base.replace(/\/+$/, "");
}

export function normalizeTopic(value) {
  return String(value || "").trim().replace(/^\/+/, "");
}

function normalizeTags(tags) {
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(",");
  return Array.from(
    new Set(
      list
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  );
}

function encodeRfc2047(value) {
  const text = String(value || "");
  if (!/[^\x20-\x7E]/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function buildTopicUrl(baseUrl, topic) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  const prefix = url.pathname.replace(/\/+$/, "");
  url.pathname = `${prefix}/${normalizeTopic(topic)}`.replace(/\/{2,}/g, "/");
  return url.toString();
}

export function resolveNtfyConfig(overrides = {}) {
  const enabled = overrides.enabled ?? envFlag("NTFY_ENABLED", false);
  const baseUrl = normalizeBaseUrl(overrides.baseUrl ?? process.env.NTFY_BASE_URL ?? "https://ntfy.sh");
  const topic = normalizeTopic(overrides.topic ?? process.env.NTFY_TOPIC ?? "");
  const token = String(overrides.token ?? process.env.NTFY_TOKEN ?? "").trim();
  const defaultPriority = String(overrides.defaultPriority ?? process.env.NTFY_DEFAULT_PRIORITY ?? "default").trim() || "default";

  return {
    enabled,
    baseUrl,
    topic,
    token,
    defaultPriority,
  };
}

export async function notifyNtfy({
  title,
  message,
  priority,
  tags,
  clickUrl,
  enabled,
  baseUrl,
  topic,
  token,
  defaultPriority,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const config = resolveNtfyConfig({ enabled, baseUrl, topic, token, defaultPriority });

  if (!config.enabled) {
    return { ok: false, skipped: true, error: "NTFY ist deaktiviert" };
  }
  if (!config.topic) {
    const error = "NTFY_TOPIC fehlt";
    console.error("[ntfy] send failed:", error);
    return { ok: false, error };
  }

  const nextTitle = String(title || "").trim();
  const nextMessage = String(message || "").trim();
  const nextPriority = String(priority || config.defaultPriority || "default").trim() || "default";
  const nextTags = normalizeTags(tags);
  const nextClickUrl = String(clickUrl || "").trim();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
    const headers = {
      "Content-Type": "text/plain; charset=utf-8",
      Priority: nextPriority,
    };
    if (nextTitle) headers.Title = encodeRfc2047(nextTitle);
    if (nextTags.length) headers.Tags = nextTags.join(",");
    if (nextClickUrl) headers.Click = nextClickUrl;
    if (config.token) headers.Authorization = `Bearer ${config.token}`;

    const response = await fetch(buildTopicUrl(config.baseUrl, config.topic), {
      method: "POST",
      headers,
      body: nextMessage,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `ntfy HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`;
      console.error("[ntfy] send failed:", error);
      return { ok: false, error };
    }

    console.log("[ntfy] sent", {
      baseUrl: config.baseUrl,
      topic: config.topic,
      title: nextTitle || "(no title)",
      priority: nextPriority,
      tags: nextTags,
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[ntfy] send failed:", error);
    return { ok: false, error };
  }
}
