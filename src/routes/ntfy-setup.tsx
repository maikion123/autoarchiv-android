import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, Check, BellRing, Smartphone, CircleCheckBig, CircleAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ntfy-setup")({
  validateSearch: (search: Record<string, unknown>) => ({
    topic: typeof search.topic === "string" ? search.topic : "",
    source: typeof search.source === "string" ? search.source : "",
    kind: typeof search.kind === "string" ? search.kind : "ntfy",
    calendarToken: typeof search.calendarToken === "string" ? search.calendarToken : "",
  }),
  component: NtfySetupPage,
});

function NtfySetupPage() {
  const { topic, source, kind, calendarToken: initialCalendarToken } = Route.useSearch();
  const [copyOk, setCopyOk] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [calendarToken, setCalendarToken] = useState(initialCalendarToken);
  const [tokenLoaded, setTokenLoaded] = useState(!!initialCalendarToken);
  const safeTopic = useMemo(() => topic.trim(), [topic]);
  const isCalendarMode = kind === "calendar";
  const calendarIcsUrl = useMemo(
    () => (isCalendarMode && calendarToken ? `/calendar/${encodeURIComponent(calendarToken)}.ics` : ""),
    [calendarToken, isCalendarMode],
  );
  const calendarWebcalUrl = useMemo(
    () => (calendarIcsUrl ? `webcal://${typeof window !== "undefined" ? window.location.host : "nextkm.de"}${calendarIcsUrl}` : ""),
    [calendarIcsUrl],
  );
  const isConnected = saveState === "saved";

  useEffect(() => {
    setCopyOk(false);
    setSaveError("");
  }, [safeTopic]);

  useEffect(() => {
    if (isCalendarMode && !tokenLoaded) {
      setTokenLoaded(true);
      (async () => {
        try {
          const res = await fetch("/api/auth/me", { credentials: "include" });
          const data = await res.json();
          if (data?.calendarToken) {
            setCalendarToken(data.calendarToken);
          } else if (data?.calendarFeedUrl) {
            const tokenMatch = data.calendarFeedUrl.match(/\/calendar\/([^.]+)\.ics/);
            if (tokenMatch?.[1]) {
              setCalendarToken(decodeURIComponent(tokenMatch[1]));
            }
          }
        } catch (err) {
          console.warn("Failed to load calendar token:", err);
        }
      })();
    }
  }, [isCalendarMode, tokenLoaded]);

  const onCopy = async () => {
    if (!safeTopic) return;
    try {
      await navigator.clipboard.writeText(safeTopic);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      toast.error("Topic konnte nicht kopiert werden");
    }
  };

  const onSave = async () => {
    if (isCalendarMode) {
      setSaveState("saved");
      setLastSyncAt(new Date().toISOString());
      toast.success("Kalender im Konto gespeichert");
      return;
    }
    if (!safeTopic) {
      setSaveError("Topic ist erforderlich");
      setSaveState("error");
      return;
    }
    setSaveState("saving");
    setSaveError("");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ntfyTopic: safeTopic }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Topic konnte nicht gespeichert werden");
      }
      setSaveState("saved");
      setLastSyncAt(new Date().toISOString());
      toast.success("Topic im Konto gespeichert");
    } catch (err: any) {
      setSaveState("error");
      setSaveError(err?.message || "Topic konnte nicht gespeichert werden");
      toast.error(err?.message || "Topic konnte nicht gespeichert werden");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-6 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
            <BellRing className="h-4 w-4" />
            {isCalendarMode ? "iPhone Kalender verbinden" : "ntfy-Einrichtung"}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {isCalendarMode ? "Zahlungserinnerungen in den iPhone Kalender übernehmen" : "Dein AutoArchiv-Topic"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-cyan-50/90">
            {isCalendarMode
              ? "Diese Seite führt dich auf nextKM direkt zum persönlichen Kalender-Feed. Der Feed gehört nur zu deinem Konto und enthält nur deine Zahlungserinnerungen."
              : "Diese Seite ist nur dafür da, dein persönliches Topic sauber zu übernehmen. Du brauchst dafür kein ntfy-Konto."}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-strong border-glow rounded-3xl p-6">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Schritt 1</div>
            <h2 className="mt-1 text-lg font-semibold">
              {isCalendarMode ? "Kalender abonnieren" : "Topic kopieren"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isCalendarMode
                ? "Tippe auf den Button, um den Kalender-Feed direkt in der Kalender-App zu öffnen. Falls das nicht klappt, kannst du die Feed-URL kopieren."
                : "Das Topic ist mit deinem AutoArchiv-Konto verbunden und enthält deinen angemeldeten Namen. Kopiere es in die ntfy-App und abonniere es dort."}
            </p>

            <div className="mt-4 rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {isCalendarMode ? "Kalender-Feed" : "Dein Topic"}
              </div>
              <div className="mt-2 break-all rounded-xl border border-border/50 bg-background/70 px-3 py-2 font-mono text-sm">
                {isCalendarMode ? (calendarIcsUrl || "Kein Kalender-Token übergeben") : (safeTopic || "Kein Topic übergeben")}
              </div>
              <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${isConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                {isConnected ? <CircleCheckBig className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                {isConnected ? "Verbunden" : "Noch nicht verbunden"}
              </div>
              <div className="mt-3 grid gap-2 rounded-xl border border-border/40 bg-background/40 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground/60">{isCalendarMode ? "Kalender-Status" : "Topic-Status"}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${isConnected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                    <Check className="h-3 w-3" />
                    {isConnected
                      ? (isCalendarMode ? 'Kalender im Konto gespeichert' : 'Topic im Konto gespeichert')
                      : (isCalendarMode ? 'Kalender noch nicht gespeichert' : 'Topic noch nicht gespeichert')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-foreground/60">Letzter Sync</span>
                  <span className="font-medium text-foreground/80">
                    {lastSyncAt ? `erfolgreich am ${new Date(lastSyncAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : 'Noch nicht bestätigt'}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isCalendarMode ? (
                  <a
                    href={calendarWebcalUrl || calendarIcsUrl || "#"}
                    className={`inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-3 py-2 text-xs font-medium text-white ${!calendarIcsUrl ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Kalender jetzt öffnen
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={onCopy}
                    disabled={!safeTopic}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {copyOk ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copyOk ? "Kopiert" : "Topic kopieren"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSave}
                  disabled={(!safeTopic && !isCalendarMode) || saveState === "saving"}
                  className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 disabled:opacity-50"
                >
                  {saveState === "saved" ? <Check className="h-3.5 w-3.5" /> : <CircleCheckBig className="h-3.5 w-3.5" />}
                  {saveState === "saved" ? "Verbunden" : saveState === "saving" ? "Speichere..." : "Verbindung speichern"}
                </button>
              </div>
              {saveState === "error" && saveError && (
                <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100">
                  {saveError}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Schritt 2</div>
              {isCalendarMode ? (
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6">
                  <li>Tippe auf <strong>Kalender jetzt öffnen</strong>.</li>
                  <li>Falls iPhone fragt, bestätige das Kalender-Abo.</li>
                  <li>Aktiviere in der Kalender-App die Hinweise für diesen Kalender.</li>
                </ol>
              ) : (
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6">
                  <li>Öffne die ntfy-App auf dem iPhone.</li>
                  <li>Füge ein neues Topic hinzu.</li>
                  <li>Füge das Topic oben ein.</li>
                  <li>Speichere die Subscription.</li>
                </ol>
              )}
            </div>
          </div>

          <div className="glass border-glow rounded-3xl p-6">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Hinweis</div>
            <h2 className="mt-1 text-lg font-semibold">
              {isCalendarMode ? "Kein extra Kalender-Konto nötig" : "Kein Konto bei ntfy nötig"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isCalendarMode
                ? "Der Kalender läuft direkt über nextKM. Du öffnest nur den persönlichen Feed und bestätigst das Abo in der Kalender-App."
                : "Wenn du auf ntfy.sh auf einen Konto-Dialog stößt, ist das nicht erforderlich für AutoArchiv. Du brauchst nur die App und dein Topic. Sobald dieses Topic in der App gespeichert ist, ist AutoArchiv-seitig die Verbindung hergestellt."}
            </p>

            <div className="mt-4 rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Smartphone className="h-4 w-4 text-cyan-400" />
                {isCalendarMode ? "Warum diese Seite?" : "Warum diese Seite?"}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {isCalendarMode
                  ? "Die Profilseite leitet dich zuerst auf diese nextKM-Seite, damit der Kalender-Flow sichtbar und eindeutig klickbar ist."
                  : "iPhone-QRs sollen nicht direkt auf ntfy.sh springen. Diese Seite zeigt dir nur das Topic und die Schritte, damit das Onboarding sauber bleibt."}
              </p>
            </div>

            {source && (
              <div className="mt-4 rounded-2xl border border-border/70 bg-background/40 p-4 text-xs text-muted-foreground">
                Quelle: {source}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
