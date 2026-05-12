// Centralized auth checking without component context

const AUTH_CACHE_KEY = "autoarchiv.auth.cache";
const AUTH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function readAuthCache(): {
  email: string | null;
  role: "admin" | "user" | null;
  displayName: string | null;
  ntfyTopic: string | null;
  at: number;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY) || window.sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const email = typeof parsed.email === "string" ? parsed.email : null;
    const role = parsed.role === "admin" || parsed.role === "user" ? parsed.role : null;
    const displayName = typeof parsed.displayName === "string" ? parsed.displayName : null;
    const ntfyTopic = typeof parsed.ntfyTopic === "string" ? parsed.ntfyTopic : null;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (!email || !at) return null;
    if (Date.now() - at > AUTH_CACHE_TTL_MS) return null;
    return { email, role, displayName, ntfyTopic, at };
  } catch {
    return null;
  }
}

export function writeAuthCache(
  email: string | null,
  role: "admin" | "user" | null = null,
  displayName: string | null = null,
  ntfyTopic: string | null = null
) {
  if (typeof window === "undefined") return;
  try {
    if (!email) {
      window.localStorage.removeItem(AUTH_CACHE_KEY);
      window.sessionStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }
    const payload = JSON.stringify({
      email,
      role,
      displayName,
      ntfyTopic,
      at: Date.now(),
    });
    window.localStorage.setItem(AUTH_CACHE_KEY, payload);
    window.sessionStorage.setItem(AUTH_CACHE_KEY, payload);
  } catch {
    // Ignore storage failures; auth still works via server check.
  }
}

export function clearAuthCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_CACHE_KEY);
    window.sessionStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export async function checkAuthStatus(): Promise<
  | {
      authenticated: true;
      email?: string;
      role?: "admin" | "user";
      displayName?: string | null;
      ntfyTopic?: string | null;
      ntfySuggestedTopic?: string | null;
      calendarFeedUrl?: string | null;
      calendarLeadDays?: number | null;
    }
  | { authenticated: false; status: 'unauthorized' | 'error'; error?: string }
> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });

    if (!res.ok) {
      return { authenticated: false, status: 'unauthorized' };
    }

    const data = await res.json();
    return {
      authenticated: true,
      email: data.email,
      role: data.role === 'admin' ? 'admin' : 'user',
      displayName: data.displayName,
      ntfyTopic: data.ntfyTopic,
      ntfySuggestedTopic: data.ntfySuggestedTopic,
      calendarFeedUrl: data.calendarFeedUrl,
      calendarLeadDays: data.calendarLeadDays,
    };
  } catch (err) {
    console.error("[Auth] checkAuthStatus error:", err);
    return {
      authenticated: false,
      status: 'error',
      error: err instanceof Error ? err.message : String(err || 'Unbekannter Fehler'),
    };
  }
}
