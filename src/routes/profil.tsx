import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Check, CheckCircle, Copy, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

type ProfileData = {
  email: string;
  role: "admin" | "user";
  displayName: string | null;
  calendarToken: string | null;
  calendarFeedUrl: string | null;
  calendarLeadDays: number | null;
};

export const Route = createFileRoute("/profil")({
  component: ProfilePage,
});

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingToken, setResettingToken] = useState(false);
  const [feedCopyOk, setFeedCopyOk] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [calendarLeadDays, setCalendarLeadDays] = useState(2);
  const [calendarFeedUrl, setCalendarFeedUrl] = useState("");

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
          calendarToken: data.calendarToken || null,
          calendarFeedUrl: data.calendarFeedUrl || null,
          calendarLeadDays: typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : 2,
        };

        setProfile(nextProfile);
        setDisplayName(nextProfile.displayName || "");
        setCalendarFeedUrl(nextProfile.calendarFeedUrl || "");
        setCalendarLeadDays(nextProfile.calendarLeadDays || 2);
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

  const onCopyFeedUrl = async () => {
    const url = calendarFeedUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setFeedCopyOk(true);
      window.setTimeout(() => setFeedCopyOk(false), 2000);
    } catch {
      setError("Link konnte nicht kopiert werden");
    }
  };

  const onResetToken = async () => {
    setResettingToken(true);
    setError("");
    setSuccess("");
    setShowResetWarning(false);
    try {
      const response = await fetch("/api/auth/reset-calendar-token", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Token konnte nicht erneuert werden");
      setCalendarFeedUrl(data.calendarFeedUrl || "");
      setProfile((prev) =>
        prev ? { ...prev, calendarToken: data.calendarToken || null, calendarFeedUrl: data.calendarFeedUrl || null } : prev
      );
      setSuccess("Neuer Kalender-Link generiert. Bitte trage ihn in deinem Kalender neu ein.");
    } catch (err: any) {
      setError(err?.message || "Token konnte nicht erneuert werden");
    } finally {
      setResettingToken(false);
    }
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
          calendarLeadDays,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Fehler beim Speichern");
      }

      const nextDisplayName = data.displayName || trimmedName;
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              displayName: nextDisplayName,
              calendarLeadDays: typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : calendarLeadDays,
              calendarFeedUrl: data.calendarFeedUrl || prev.calendarFeedUrl,
            }
          : prev
      );
      setDisplayName(nextDisplayName);
      if (data.calendarFeedUrl) setCalendarFeedUrl(data.calendarFeedUrl);
      setCalendarLeadDays(typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : calendarLeadDays);
      setSuccess("Profil gespeichert");

      window.dispatchEvent(
        new CustomEvent("autoarchiv:profile-updated", {
          detail: { displayName: nextDisplayName },
        })
      );
    } catch (err: any) {
      setError(err?.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
        <div className="glass-strong rounded-3xl border-glow p-6">
          <div className="skeleton h-7 w-52" />
          <div className="mt-4 space-y-4">
            <div className="skeleton h-32 rounded-2xl" />
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
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8 overflow-x-hidden">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to="/" className="inline-flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-sm font-medium">
          <ArrowLeft className="h-4 w-4" />
          Zur Übersicht
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Profil bearbeiten</h1>
          <p className="text-sm text-muted-foreground">Dein Name und Kalender-Synchronisation.</p>
        </div>
      </div>

      <section className="glass-strong border-glow rounded-3xl p-6 md:p-8 min-w-0">
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

        <div className="mt-6 space-y-6">
          {/* ── Display name ─────────────────────────────────────────── */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground/80">Anzeigename</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              autoComplete="name"
              placeholder="z.B. Kevin"
              className="w-full rounded-xl glass border border-border/40 bg-background/50 px-4 py-3 text-base text-foreground placeholder:text-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Dieser Name wird in der App und im Profil verwendet.</span>
              <span>{displayName.length}/50</span>
            </div>
          </div>

          {/* ── Kalender-Synchronisation ─────────────────────────────── */}
          <div className="rounded-2xl border border-border/40 bg-background/35 p-4 space-y-4">
            <div>
              <p className="text-sm font-medium">Kalender-Synchronisation</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Zahlungserinnerungen und Termine automatisch in iPhone oder Android-Kalender einbinden.
              </p>
            </div>

            {/* Feed URL + copy */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground/80">Dein persönlicher Kalender-Link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={calendarFeedUrl}
                  className="min-w-0 flex-1 rounded-xl border border-border/40 bg-background/55 px-3 py-2.5 font-mono text-xs text-foreground/80 select-all focus:outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={onCopyFeedUrl}
                  disabled={!calendarFeedUrl}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-border/40 bg-background/50 px-3 py-2.5 text-sm font-medium text-foreground/80 disabled:opacity-50 hover:bg-background/70 transition-colors whitespace-nowrap"
                >
                  {feedCopyOk ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  {feedCopyOk ? "Kopiert" : "Link kopieren"}
                </button>
              </div>
            </div>

            {/* Lead days */}
            <div className="max-w-xs">
              <label className="mb-2 block text-sm font-medium text-foreground/80">Erinnerungsfrist</label>
              <select
                value={calendarLeadDays}
                onChange={(e) => setCalendarLeadDays(Number(e.target.value) || 2)}
                className="w-full rounded-xl border border-border/40 bg-background/55 px-4 py-2.5 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value={1}>1 Tag vorher</option>
                <option value={2}>2 Tage vorher</option>
                <option value={7}>7 Tage vorher</option>
              </select>
            </div>

            {/* Reset token */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
              {showResetWarning ? (
                <>
                  <p className="text-xs text-amber-300 font-medium">
                    ⚠️ Achtung: Nach dem Erneuern funktioniert dein bisheriges Kalender-Abo nicht mehr. Du musst den neuen Link auf allen Geräten neu eintragen.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onResetToken}
                      disabled={resettingToken}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-amber-700"
                    >
                      {resettingToken ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                      {resettingToken ? "Wird erneuert…" : "Ja, neuen Link generieren"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResetWarning(false)}
                      className="inline-flex items-center rounded-xl border border-border/40 bg-background/50 px-3 py-2 text-xs font-medium text-foreground/70"
                    >
                      Abbrechen
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Link kompromittiert oder verloren? Erzeuge einen neuen sicheren Link.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowResetWarning(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Neuen Link generieren
                  </button>
                </div>
              )}
            </div>

            {/* Setup instructions */}
            <div className="rounded-xl border border-border/30 bg-background/40 p-4 space-y-4 text-xs text-muted-foreground">
              <div>
                <p className="font-semibold text-foreground/80 mb-1.5">📱 Android / Google Kalender</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    Öffne den{" "}
                    <a
                      href="https://calendar.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 underline inline-flex items-center gap-0.5"
                    >
                      Google Kalender im Webbrowser
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Links unter <strong className="text-foreground/70">„Weitere Kalender"</strong> auf das <strong className="text-foreground/70">+</strong>-Symbol klicken</li>
                  <li><strong className="text-foreground/70">„Per URL"</strong> auswählen</li>
                  <li>Deinen Kalender-Link oben einfügen und bestätigen</li>
                  <li>Fertig — der Kalender synchronisiert automatisch</li>
                </ol>
              </div>

              <div className="border-t border-border/30 pt-3">
                <p className="font-semibold text-foreground/80 mb-1.5">🍎 iPhone / iOS</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Öffne <strong className="text-foreground/70">Einstellungen</strong> → <strong className="text-foreground/70">Kalender</strong> → <strong className="text-foreground/70">Accounts</strong></li>
                  <li><strong className="text-foreground/70">Account hinzufügen</strong> → <strong className="text-foreground/70">Andere</strong></li>
                  <li><strong className="text-foreground/70">Kalenderabo hinzufügen</strong> wählen</li>
                  <li>Deinen Kalender-Link oben einfügen</li>
                  <li>Speichern — iOS synchronisiert automatisch alle paar Stunden</li>
                </ol>
              </div>

              <p className="text-[11px] text-muted-foreground/70 pt-1 border-t border-border/20">
                Der Link enthält kein Passwort und ist nur dir bekannt. Gib ihn nicht weiter.
              </p>
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

          <div className="flex flex-col gap-2 sm:flex-row pt-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-400 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 sm:w-auto sm:flex-1"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Speichert..." : "Speichern"}
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
    </div>
  );
}
