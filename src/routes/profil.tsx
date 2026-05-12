import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Check, CheckCircle, Copy, RefreshCw, User, Link2, Unlink } from "lucide-react";
import { useEffect, useState } from "react";

type ProfileData = {
  email: string;
  role: "admin" | "user";
  displayName: string | null;
  ntfyTopic: string | null;
  ntfySuggestedTopic: string | null;
  calendarToken: string | null;
  calendarFeedUrl: string | null;
  calendarLeadDays: number | null;
};

function slugifyTopicPart(value: string, fallback = "konto") {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || fallback;
}

function hashTopicSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

function makeUserNtfyTopic(email?: string, displayName?: string | null) {
  const emailValue = (email || "").trim().toLowerCase();
  const localPart = emailValue.includes("@") ? emailValue.split("@")[0] : "";
  const namePart = slugifyTopicPart(displayName || localPart || emailValue || "konto");
  const userPart = slugifyTopicPart(emailValue || localPart || displayName || "konto");
  const seed = hashTopicSeed(`${emailValue}:${displayName || ""}`);
  return `autoarchiv-${namePart}-${userPart}-${seed}`;
}

function formatStatusTime(iso: string | null): string {
  if (!iso) return "Noch nicht bestätigt";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unbekannt";
  return date.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export const Route = createFileRoute("/profil")({
  component: ProfilePage,
});

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [calendarCopyOk, setCalendarCopyOk] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [ntfyTopic, setNtfyTopic] = useState("");
  const [calendarLeadDays, setCalendarLeadDays] = useState(2);
  const [calendarFeedUrl, setCalendarFeedUrl] = useState("");
  const [calendarToken, setCalendarToken] = useState("");
  const [topicDeleted, setTopicDeleted] = useState(false);
  const [topicDeleteArmed, setTopicDeleteArmed] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadProfile = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Profil konnte nicht geladen werden");
        }

        const data = (await response.json()) as Partial<ProfileData>;
        if (!alive) return;

        const nextProfile: ProfileData = {
          email: data.email || "",
          role: data.role === "admin" ? "admin" : "user",
          displayName: data.displayName || null,
          ntfyTopic: data.ntfyTopic || null,
          ntfySuggestedTopic: data.ntfySuggestedTopic || null,
          calendarToken: data.calendarToken || null,
          calendarFeedUrl: data.calendarFeedUrl || null,
          calendarLeadDays: typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : 2,
        };

        setProfile(nextProfile);
        setDisplayName(nextProfile.displayName || "");
        setNtfyTopic(nextProfile.ntfyTopic || nextProfile.ntfySuggestedTopic || makeUserNtfyTopic(nextProfile.email, nextProfile.displayName));
        setCalendarToken(nextProfile.calendarToken || "");
        setCalendarLeadDays(nextProfile.calendarLeadDays || 2);
        setCalendarFeedUrl(nextProfile.calendarFeedUrl || buildCalendarFeedUrlFromToken(nextProfile.calendarToken) || "");
        setTopicDeleted(false);
        setTopicDeleteArmed(false);
        setLastSyncAt(nextProfile.ntfyTopic ? new Date().toISOString() : null);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Profil konnte nicht geladen werden");
      } finally {
        if (alive) setLoading(false);
      }
    };

    void loadProfile();

    return () => {
      alive = false;
    };
  }, []);

  const hasSavedTopic = Boolean(profile?.ntfyTopic) && !topicDeleted;
  const currentTopic = hasSavedTopic ? profile?.ntfyTopic || "" : ntfyTopic;
  const topicPreview = currentTopic || (profile ? makeUserNtfyTopic(profile.email, profile.displayName) : "");
  const hasCalendarFeed = Boolean(calendarToken || calendarFeedUrl);
  const resolvedCalendarFeedUrl = calendarFeedUrl || buildCalendarFeedUrlFromToken(calendarToken);

  const onCopyTopic = async () => {
    try {
      await navigator.clipboard.writeText(topicPreview.trim());
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 1500);
    } catch {
      setError("Topic konnte nicht kopiert werden");
    }
  };

  const onCopyCalendarFeed = async () => {
    if (!resolvedCalendarFeedUrl) {
      setError("Kalender-Feed ist noch nicht verfügbar");
      return;
    }
    try {
      await navigator.clipboard.writeText(resolvedCalendarFeedUrl.trim());
      setCalendarCopyOk(true);
      window.setTimeout(() => setCalendarCopyOk(false), 1500);
    } catch {
      setError("Kalender-Feed konnte nicht kopiert werden");
    }
  };

  const onGenerateTopic = () => {
    if (!profile) return;
    setNtfyTopic(makeUserNtfyTopic(profile.email, displayName || profile.displayName));
    setTopicDeleted(false);
    setTopicDeleteArmed(false);
    setError("");
  };

  const onSave = async () => {
    if (!profile) return;
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError("Anzeigename ist erforderlich");
      return;
    }
    if (trimmedName.length > 50) {
      setError("Anzeigename darf max. 50 Zeichen sein");
      return;
    }
    if (!topicPreview.trim() && !topicDeleted) {
      setError("ntfy-Topic ist erforderlich");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName: trimmedName,
          ntfyTopic: topicDeleted ? null : topicPreview.trim(),
          calendarLeadDays,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Fehler beim Speichern");
      }

      const nextDisplayName = data.displayName || trimmedName;
      const nextTopic = data.ntfyTopic ?? (topicDeleted ? null : topicPreview.trim());
      setProfile((prev) => prev ? {
        ...prev,
        displayName: nextDisplayName,
        ntfyTopic: nextTopic,
        calendarLeadDays: typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : calendarLeadDays,
        calendarFeedUrl: data.calendarFeedUrl || prev.calendarFeedUrl,
        calendarToken: data.calendarToken || prev.calendarToken,
      } : prev);
      setDisplayName(nextDisplayName);
      setNtfyTopic(nextTopic || makeUserNtfyTopic(profile.email, nextDisplayName));
      setCalendarToken(data.calendarToken || calendarToken);
      setCalendarLeadDays(typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : calendarLeadDays);
      setCalendarFeedUrl(data.calendarFeedUrl || buildCalendarFeedUrlFromToken(data.calendarToken || calendarToken) || "");
      setTopicDeleted(false);
      setTopicDeleteArmed(false);
      setLastSyncAt(new Date().toISOString());
      setSuccess("Profil gespeichert");

      window.dispatchEvent(
        new CustomEvent("autoarchiv:profile-updated", {
          detail: {
            displayName: nextDisplayName,
            ntfyTopic: nextTopic,
          },
        }),
      );
    } catch (err: any) {
      setError(err?.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="glass-strong rounded-3xl border-glow p-6">
          <div className="skeleton h-7 w-52" />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="skeleton h-80 rounded-2xl" />
            <div className="skeleton h-80 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
        <div className="glass-strong rounded-3xl border-glow p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <h1 className="text-xl font-semibold">Profil nicht geladen</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {error || "Bitte lade die Seite neu oder melde dich erneut an."}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/" className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium">
              <ArrowLeft className="h-4 w-4" />
              Zur Übersicht
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-400 px-4 py-2.5 text-sm font-medium text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }

  const initials = (displayName || profile.email)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 overflow-x-hidden">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to="/" className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium">
          <ArrowLeft className="h-4 w-4" />
          Zur Übersicht
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Profil bearbeiten</h1>
          <p className="text-sm text-muted-foreground">
            Anzeigename und persönliches ntfy-Topic für dein Konto.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="glass-strong border-glow rounded-3xl p-6 min-w-0">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-lg font-semibold text-white shadow-[0_0_18px_oklch(0.62_0.24_290/0.28)]">
              {initials || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Konto</p>
              <h2 className="truncate text-xl font-semibold">{displayName || profile.email.split("@")[0]}</h2>
              <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground/80">
                Anzeigename in AutoArchiv
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                autoComplete="name"
                placeholder="Zum Beispiel Kevin"
                className="w-full rounded-xl glass border border-border/40 bg-background/50 px-4 py-3 text-base text-foreground placeholder:text-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Dieser Name erscheint in der Oberfläche und im Profil.</span>
                <span>{displayName.length}/50</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Aktuelle Verbindung</p>
                  <p className="text-xs text-muted-foreground">Dein persönlicher Benachrichtigungskanal</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${hasSavedTopic ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                  <CheckCircle className="h-3 w-3" />
                  {hasSavedTopic ? "Verbunden" : "Noch nicht verbunden"}
                </span>
              </div>

              <textarea
                value={topicPreview}
                onChange={(e) => setNtfyTopic(e.target.value)}
                readOnly={hasSavedTopic}
                rows={3}
                className="w-full resize-none rounded-xl border border-border/40 bg-background/55 px-3 py-3 font-mono text-sm leading-5 text-foreground placeholder:text-foreground/45 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 break-all"
                aria-label="ntfy-Topic"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onCopyTopic}
                  disabled={!topicPreview.trim()}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-lg glass px-3 py-2 text-sm text-foreground/80 disabled:opacity-50"
                >
                  {copyOk ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copyOk ? "Kopiert" : "Kopieren"}
                </button>
                {hasSavedTopic ? (
                  <button
                    type="button"
                    onClick={() => setTopicDeleteArmed(true)}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
                  >
                    <Unlink className="h-4 w-4" />
                    Verbindung lösen
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onGenerateTopic}
                    className="inline-flex min-h-[40px] items-center gap-1 rounded-lg glass px-3 py-2 text-sm text-foreground/80"
                  >
                    <Link2 className="h-4 w-4" />
                    Topic erzeugen
                  </button>
                )}
              </div>

              {topicDeleteArmed && hasSavedTopic && (
                <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p className="font-medium">Verbindung lösen?</p>
                  <p className="mt-1 text-xs text-amber-100/80">
                    AutoArchiv sendet dann keine Erinnerungen mehr, bis du ein neues Topic speicherst.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTopicDeleteArmed(false)}
                      className="rounded-lg glass px-3 py-2 text-xs text-foreground/80 min-h-[40px]"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTopicDeleted(true);
                        setTopicDeleteArmed(false);
                        setNtfyTopic("");
                        setError("");
                      }}
                      className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-black min-h-[40px]"
                    >
                      Verbindung jetzt lösen
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-2 rounded-xl border border-border/40 bg-background/40 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground/60">Topic-Status</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${hasSavedTopic ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                    <CheckCircle className="h-3 w-3" />
                    {hasSavedTopic ? "Topic im Konto gespeichert" : "Topic noch nicht gespeichert"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground/60">Letzter Sync</span>
                  <span className="font-medium text-foreground/80">
                    {lastSyncAt ? `erfolgreich am ${formatStatusTime(lastSyncAt)}` : "Noch nicht bestätigt"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">iPhone Kalender</p>
                  <p className="text-xs text-muted-foreground">Zahlungserinnerungen als abonnierter Kalender</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${hasCalendarFeed ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                  <CheckCircle className="h-3 w-3" />
                  {hasCalendarFeed ? "Kalender bereit" : "Wird geladen"}
                </span>
              </div>

              <div className="grid gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground/80">
                    Erinnerung {calendarLeadDays === 1 ? "1 Tag" : `${calendarLeadDays} Tage`} vor Fälligkeit
                  </label>
                  <select
                    value={calendarLeadDays}
                    onChange={(e) => setCalendarLeadDays(Number(e.target.value) || 2)}
                    className="w-full rounded-xl border border-border/40 bg-background/55 px-4 py-3 text-base text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value={1}>1 Tag vorher</option>
                    <option value={2}>2 Tage vorher</option>
                    <option value={7}>7 Tage vorher</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Der Kalenderfeed übernimmt diesen Vorlauf für alle offenen Zahlungserinnerungen deines Kontos.
                  </p>
                </div>

                <div className="rounded-xl border border-border/40 bg-background/45 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Kalender-Feed</p>
                      <p className="text-xs text-muted-foreground">Direkt auf iPhone öffnen und abonnieren</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">Read-only</span>
                  </div>
                    <textarea
                    value={resolvedCalendarFeedUrl}
                    readOnly
                    rows={2}
                    className="mt-3 w-full resize-none rounded-xl border border-border/40 bg-background/55 px-3 py-3 font-mono text-xs leading-5 text-foreground break-all"
                    aria-label="Kalender-Feed URL"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to="/ntfy-setup"
                      search={{ topic: "", kind: "calendar", calendarToken: calendarToken || "", source: "profil" }}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-400 px-3 py-2 text-sm font-medium text-white"
                    >
                      Kalender verbinden
                    </Link>
                    <button
                      type="button"
                      onClick={onCopyCalendarFeed}
                      disabled={!resolvedCalendarFeedUrl}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg glass px-3 py-2 text-sm text-foreground/80 disabled:opacity-50"
                    >
                      {calendarCopyOk ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {calendarCopyOk ? "Kopiert" : "Kalender-Link kopieren"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    iPhone: Auf <strong>Kalender verbinden</strong> tippen. nextKM zeigt dir dann die Kalender-Seite mit dem Abo-Button.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Falls iPhone nicht direkt öffnet, nutze den kopierbaren Feed-Link oben.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                <p className="text-sm text-emerald-400">{success}</p>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-400 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 sm:w-auto sm:flex-1"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Speichert..." : "Profil speichern"}
              </button>
              <Link
                to="/"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl glass px-4 py-3 text-sm font-medium sm:w-auto sm:flex-1"
              >
                Zur Übersicht
              </Link>
            </div>
          </div>
        </section>

        <aside className="glass-strong border-glow rounded-3xl p-6 min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Hinweis</p>
          <h3 className="mt-2 text-xl font-semibold">So bleibt dein Konto sauber getrennt</h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>Jeder Benutzer hat sein eigenes Login und sein eigenes ntfy-Topic.</li>
            <li>Jeder Benutzer hat zusätzlich einen eigenen iPhone-Kalender-Feed für Zahlungserinnerungen.</li>
            <li>Das Topic und der Kalender-Feed sind mit deinem Konto verbunden und werden nur für deine Erinnerungen verwendet.</li>
            <li>Wenn du die Verbindung löst, musst du danach ein neues Topic speichern, bevor Erinnerungen wieder kommen.</li>
            <li>Der Kalender-Feed übernimmt den Vorlauf aus dem Profil und aktualisiert sich beim nächsten Abruf.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

function buildCalendarFeedUrlFromToken(token?: string | null) {
  const cleaned = String(token || "").trim();
  if (!cleaned) return "";
  if (typeof window === "undefined") return "";
  return `${window.location.origin.replace(/\/+$/, "")}/calendar/${encodeURIComponent(cleaned)}.ics`;
}
