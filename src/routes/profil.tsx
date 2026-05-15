import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Check, CheckCircle, Copy, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

type ProfileData = {
  email: string;
  role: "admin" | "user";
  displayName: string | null;
  calendarToken: string | null;
  calendarLeadDays: number | null;
  caldavLastSync: string | null;
};

export const Route = createFileRoute("/profil")({
  component: ProfilePage,
});

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [caldavPasswordCopyOk, setCaldavPasswordCopyOk] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [calendarLeadDays, setCalendarLeadDays] = useState(2);
  const [calendarToken, setCalendarToken] = useState("");
  const [caldavLastSync, setCaldavLastSync] = useState<string | null>(null);

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
          calendarLeadDays: typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : 2,
          caldavLastSync: data.caldavLastSync || null,
        };

        setProfile(nextProfile);
        setCaldavLastSync(nextProfile.caldavLastSync || null);
        setDisplayName(nextProfile.displayName || "");
        setCalendarToken(nextProfile.calendarToken || "");
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


  const onCopyCaldavPassword = async () => {
    if (!calendarToken) return;
    try {
      await navigator.clipboard.writeText(calendarToken);
      setCaldavPasswordCopyOk(true);
      window.setTimeout(() => setCaldavPasswordCopyOk(false), 1500);
    } catch {
      setError("Passwort konnte nicht kopiert werden");
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
      setProfile((prev) => prev ? {
        ...prev,
        displayName: nextDisplayName,
        calendarLeadDays: typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : calendarLeadDays,
        calendarToken: data.calendarToken || prev.calendarToken,
      } : prev);
      setDisplayName(nextDisplayName);
      setCalendarToken(data.calendarToken || calendarToken);
      setCalendarLeadDays(typeof data.calendarLeadDays === "number" ? data.calendarLeadDays : calendarLeadDays);
      setSuccess("Profil gespeichert");

      window.dispatchEvent(
        new CustomEvent("autoarchiv:profile-updated", {
          detail: {
            displayName: nextDisplayName,
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
          <p className="text-sm text-muted-foreground">
            Dein Name und Kalender-Synchronisation.
          </p>
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
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground/80">
                Anzeigename
              </label>
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

            <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Kalender synchronisieren</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Zahlungserinnerungen und Termine auf iPhone und Android</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${caldavLastSync ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                  <CheckCircle className="h-3 w-3" />
                  {caldavLastSync
                    ? `Verbunden · ${new Date(caldavLastSync + "Z").toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`
                    : "Nicht verbunden"}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground/80">
                    Erinnerungsfrist
                  </label>
                  <select
                    value={calendarLeadDays}
                    onChange={(e) => setCalendarLeadDays(Number(e.target.value) || 2)}
                    className="w-full rounded-xl border border-border/40 bg-background/55 px-4 py-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value={1}>1 Tag vorher</option>
                    <option value={2}>2 Tage vorher</option>
                    <option value={7}>7 Tage vorher</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground/80">
                    Verbindungsmethode
                  </label>
                  <div className="rounded-xl border border-border/40 bg-background/55 px-4 py-3 text-sm text-foreground/80">
                    CalDAV (iOS & Android)
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border/40 bg-background/45 p-3 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground/60">Server</span>
                  <span className="font-mono font-medium text-foreground">nextkm.de</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground/60">Benutzername</span>
                  <span className="font-mono font-medium text-foreground break-all">{profile.email}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-foreground/60 shrink-0">Passwort</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] break-all text-foreground/50 select-all">{calendarToken || "…"}</span>
                    <button
                      type="button"
                      onClick={onCopyCaldavPassword}
                      disabled={!calendarToken}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border/40 bg-background/50 px-2 py-1 text-[11px] text-foreground/70 disabled:opacity-50 hover:bg-background/70 transition-colors"
                    >
                      {caldavPasswordCopyOk ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {caldavPasswordCopyOk ? "Kopiert" : "Kopieren"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border/30 bg-background/40 p-3 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground/80">iPhone:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Einstellungen → Kalender → Accounts → Account hinzufügen</li>
                  <li><strong className="text-foreground/70">Andere</strong> → <strong className="text-foreground/70">CalDAV-Account hinzufügen</strong></li>
                  <li>Server, Benutzername, Passwort eintragen (oben kopieren)</li>
                  <li>Speichern und SSL bestätigen</li>
                </ol>

                <p className="font-medium text-foreground/80 pt-2">Android:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>CalDAV-App installieren (z.B. <strong className="text-foreground/70">CalDAV Sync</strong> oder <strong className="text-foreground/70">Fruux Sync</strong>)</li>
                  <li>App öffnen → Account hinzufügen → Server, E-Mail, Passwort</li>
                  <li>Mit deinem Kalender synchronisieren</li>
                </ol>
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

