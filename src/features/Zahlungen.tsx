import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, CheckCircle2, CalendarPlus, Info, ChevronLeft, ChevronRight, BellRing, Copy, Check } from "lucide-react";
import { useArchive } from "../lib/store";
import { fmtEUR, fmtDate, daysUntil } from "../lib/format";
import { savePayment, deletePayment, saveAppointment, uid, type PaymentEntry } from "../lib/db";
import { checkAuthStatus, readAuthCache, writeAuthCache } from "../lib/auth";
import QRCode from "qrcode";
import { toast } from "sonner";

export default function ZahlungenPage() {
  const { payments, refresh, documents } = useArchive();
  const [addOpen, setAddOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [active, setActive] = useState<PaymentEntry | null>(null);

  const sorted = useMemo(() => {
    return [...payments].sort((a, b) => {
      const sa = a.status === "bezahlt" ? 1 : 0;
      const sb = b.status === "bezahlt" ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return +new Date(a.faelligkeit) - +new Date(b.faelligkeit);
    });
  }, [payments]);

  // Monthly chart
  const monthly = useMemo(() => {
    const now = new Date();
    const arr: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const total = payments.reduce((s, p) => {
        const pd = new Date(p.faelligkeit);
        return `${pd.getFullYear()}-${pd.getMonth()}` === key ? s + p.betrag : s;
      }, 0);
      arr.push({ label: d.toLocaleString("de-DE", { month: "short" }), total });
    }
    return arr;
  }, [payments]);
  const chartMax = Math.max(1, ...monthly.map((m) => m.total));

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Zahlungen</h1>
          <p className="mt-1 text-sm text-muted-foreground">Im Blick, was raus muss.</p>
        </div>
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-2 text-xs sm:px-4 sm:text-sm font-medium text-foreground shadow-sm transition hover:bg-muted shrink-0"
        >
          <Info className="h-4 w-4" />
          <span className="hidden sm:inline">Zahlungserinnerung einrichten</span>
          <span className="sm:hidden">Erinnerung</span>
        </button>
      </div>

      {/* Monthly chart */}
      <div className="glass border-glow rounded-2xl p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Letzte 6 Monate</div>
        <div className="mt-4 grid grid-cols-6 items-end gap-3 h-32">
          {monthly.map((m, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <motion.div initial={{ height: 0 }} animate={{ height: `${(m.total / chartMax) * 100}%` }}
                transition={{ delay: i * 0.05, duration: 0.6, ease: "easeOut" }}
                className="w-full rounded-md bg-gradient-to-t from-violet-500 to-cyan-400"
                style={{ minHeight: m.total ? 6 : 2, opacity: m.total ? 1 : 0.2 }} />
              <div className="text-[10px] text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="grid gap-2">
        {sorted.length === 0 && <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">Noch keine Zahlungen erfasst.</div>}
        {sorted.map((p) => {
          const dleft = daysUntil(p.faelligkeit);
          const overdue = dleft != null && dleft < 0 && p.status !== "bezahlt";
          const tone = p.status === "bezahlt" ? "emerald" : overdue ? "rose" : dleft != null && dleft < 7 ? "amber" : "cyan";
          return (
            <motion.button
              key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              whileHover={{ x: 2 }} onClick={() => setActive(p)}
              className="glass border-glow flex items-center gap-3 rounded-xl p-3 text-left">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                tone==="emerald" ? "bg-emerald-400" :
                tone==="rose" ? "bg-rose-400 animate-pulse" :
                tone==="amber" ? "bg-amber-400" : "bg-cyan-400"
              }`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.absender} <span className="text-muted-foreground">— {p.beschreibung}</span></div>
                <div className="text-[11px] text-muted-foreground">{fmtDate(p.faelligkeit)} {overdue && <span className="text-rose-300">· überfällig</span>}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{fmtEUR(p.betrag)}</div>
                <StatusBadge status={p.status} />
              </div>
            </motion.button>
          );
        })}
      </div>

      <button onClick={() => setAddOpen(true)}
        className="fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-3 text-sm font-medium text-white shadow-[0_0_30px_oklch(0.62_0.24_290/0.5)] transition hover:scale-[1.03] md:bottom-6">
        <Plus className="h-4 w-4" /> Zahlung
      </button>

      <AnimatePresence>
        {addOpen && <AddPaymentModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refresh(); }} />}
        {setupOpen && <PaymentReminderSetupModal onClose={() => setSetupOpen(false)} />}
        {active && <PaymentDetail payment={active} documents={documents} onClose={() => setActive(null)} onChanged={() => { refresh(); }} />}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }: { status: PaymentEntry["status"] }) {
  const map = {
    offen: "bg-rose-500/20 text-rose-300",
    teilbezahlt: "bg-amber-500/20 text-amber-300",
    bezahlt: "bg-emerald-500/20 text-emerald-300",
  } as const;
  return <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] ${map[status]}`}>{status}</span>;
}

function AddPaymentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [absender, setAbsender] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [betrag, setBetrag] = useState("");
  const [faelligkeit, setFaelligkeit] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }));
  const [reminderEnabled, setReminderEnabled] = useState(true);
  return (
    <ModalShell onClose={onClose} title="Neue Zahlung">
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await savePayment({
            id: uid(), absender, beschreibung, betrag: Number(betrag) || 0,
            faelligkeit: new Date(faelligkeit).toISOString(),
            status: "offen", paid: [], createdAt: new Date().toISOString(),
            reminderEnabled,
          });
          toast.success("Zahlung gespeichert");
          onSaved();
        } catch (err: any) {
          toast.error(err?.message || "Zahlung konnte nicht gespeichert werden");
        }
      }} className="space-y-3">
        <Field label="Absender"><input required value={absender} onChange={(e)=>setAbsender(e.target.value)} className={inputCls} /></Field>
        <Field label="Beschreibung"><input value={beschreibung} onChange={(e)=>setBeschreibung(e.target.value)} className={inputCls} /></Field>
        <Field label="Betrag (€)"><input required type="number" step="0.01" value={betrag} onChange={(e)=>setBetrag(e.target.value)} className={inputCls} /></Field>
        <Field label="Fälligkeit"><input type="date" value={faelligkeit} onChange={(e)=>setFaelligkeit(e.target.value)} className={inputCls} /></Field>
        <div className="text-xs text-muted-foreground">
          Für einen schnellen Start heute als Fälligkeit wählen. Morgen fällige Zahlungen erinnern erst am nächsten Tag.
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-input/30 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={reminderEnabled}
            onChange={(e) => setReminderEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Erinnerung aktiv
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg glass px-4 py-2 text-sm">Abbrechen</button>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white">Speichern</button>
        </div>
      </form>
    </ModalShell>
  );
}

function PaymentReminderSetupModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [copyOk, setCopyOk] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [testError, setTestError] = useState("");
  const [config, setConfig] = useState<NtfySetupConfig | null>(null);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const cachedAuth = readAuthCache();

  const appStoreUrl = "https://apps.apple.com/us/app/ntfy/id1625396347";
  const playStoreUrl = "https://play.google.com/store/apps/details?id=io.heckel.ntfy";
  const docsUrl = "https://docs.ntfy.sh/subscribe/phone/";
  const cachedTopic = cachedAuth?.email ? buildUserTopic(cachedAuth.email, cachedAuth.displayName || undefined) : "";
  const savedTopic = authInfo?.ntfyTopic?.trim() || cachedAuth?.ntfyTopic?.trim() || "";
  const suggestedTopic = authInfo?.ntfySuggestedTopic?.trim() || config?.suggestedTopic?.trim() || cachedTopic || "";
  const topic = savedTopic || suggestedTopic || config?.topic?.trim() || "";
  const baseUrl = config?.baseUrl?.trim() || "https://ntfy.sh";
  const publicAppUrl = config?.publicAppUrl?.trim() || "https://nextkm.de";
  const topicUrl = topic ? `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(topic)}` : "";
  const iphoneSetupUrl = topic ? `${publicAppUrl.replace(/\/+$/, "")}/ntfy-setup?topic=${encodeURIComponent(topic)}&source=zahlungen` : "";
  const subscriptionUrl = topic ? buildNtfySubscriptionUrl(baseUrl, topic) : "";
  const hasServerTopic = Boolean(config?.topic?.trim());
  const hasSuggestedTopic = Boolean(config?.suggestedTopic?.trim());
  const hasTopic = Boolean(topic);
  const connectionName = authInfo?.displayName?.trim() || cachedAuth?.displayName?.trim() || authInfo?.email || cachedAuth?.email || "dein Konto";
  const isConnected = Boolean(savedTopic);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [authResult, configResult] = await Promise.allSettled([
          checkAuthStatus(),
          fetch("/api/notifications/ntfy-config", { credentials: "include" }).then(async (res) => {
            if (!res.ok) throw new Error("Konfiguration nicht geladen");
            return res.json();
          }),
        ]);
        if (!alive) return;
        if (authResult.status === "fulfilled" && authResult.value.authenticated) {
          setAuthInfo(authResult.value);
        }
        if (configResult.status === "fulfilled") {
          setConfig(configResult.value as NtfySetupConfig);
        }
      } catch (err) {
        if (alive) {
          setConfig(null);
          setAuthInfo(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setTestState("idle");
    setTestError("");
  }, [topic]);

  const steps = [
    "Start",
    "App installieren",
    "Topic abonnieren",
    "Zahlung anlegen",
    "Fertig",
  ];

  const onCopyTopic = async () => {
    try {
      await navigator.clipboard.writeText(topic);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      toast.error("Topic konnte nicht kopiert werden");
    }
  };

  const onTestConnection = async () => {
    if (!hasTopic) {
      setTestState("error");
      setTestError("Kein Topic verfügbar");
      return;
    }
    setTestState("sending");
    setTestError("");
    try {
      const saveRes = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ntfyTopic: topic }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        throw new Error(saveData.error || "Topic konnte nicht gespeichert werden");
      }
      const res = await fetch("/api/notifications/test-ntfy-personal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Verbindungstest fehlgeschlagen");
      }
      if (data.topic) {
        setAuthInfo((prev) => ({
          authenticated: true,
          email: prev?.email || cachedAuth?.email || undefined,
          role: prev?.role || undefined,
          displayName: prev?.displayName || cachedAuth?.displayName || null,
          ntfyTopic: data.topic || topic,
          ntfySuggestedTopic: prev?.ntfySuggestedTopic || null,
        }));
        writeAuthCache(
          cachedAuth?.email || authInfo?.email || null,
          cachedAuth?.role || authInfo?.role || null,
          cachedAuth?.displayName || authInfo?.displayName || null,
          data.topic || topic
        );
      }
      setTestState("ok");
      toast.success("Test-Push gesendet");
    } catch (err: any) {
      setTestState("error");
      setTestError(err?.message || "Verbindungstest fehlgeschlagen");
      toast.error(err?.message || "Verbindungstest fehlgeschlagen");
    }
  };

  const onSaveConnection = async () => {
    if (!hasTopic) {
      setTestState("error");
      setTestError("Kein Topic verfügbar");
      return;
    }
    setTestState("sending");
    setTestError("");
    try {
      const saveRes = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ntfyTopic: topic }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        throw new Error(saveData.error || "Topic konnte nicht gespeichert werden");
      }
      setAuthInfo((prev) => ({
        authenticated: true,
        email: prev?.email || cachedAuth?.email || undefined,
        role: prev?.role || cachedAuth?.role || undefined,
        displayName: prev?.displayName || cachedAuth?.displayName || null,
        ntfyTopic: saveData.ntfyTopic || topic,
        ntfySuggestedTopic: prev?.ntfySuggestedTopic || null,
      }));
      writeAuthCache(
        cachedAuth?.email || authInfo?.email || null,
        cachedAuth?.role || authInfo?.role || null,
        cachedAuth?.displayName || authInfo?.displayName || null,
        saveData.ntfyTopic || topic
      );
      setTestState("ok");
      toast.success("Topic im Konto gespeichert");
    } catch (err: any) {
      setTestState("error");
      setTestError(err?.message || "Topic konnte nicht gespeichert werden");
      toast.error(err?.message || "Topic konnte nicht gespeichert werden");
    }
  };

  return (
    <ModalShell onClose={onClose} title="Zahlungserinnerung einrichten" sizeClass="max-w-4xl">
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>Geführtes Onboarding</div>
          <div>{step + 1}/{steps.length}</div>
        </div>
        <div className="mb-4 grid grid-cols-6 gap-2">
          {steps.map((label, index) => (
            <div key={label} className={`h-1.5 rounded-full ${index <= step ? "bg-cyan-400" : "bg-border"}`} />
          ))}
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {steps.map((label, index) => (
            <div key={label} className={`rounded-full px-3 py-1 text-[11px] whitespace-nowrap ${index === step ? "bg-cyan-400 text-black" : index < step ? "bg-emerald-500/20 text-emerald-200" : "bg-border/60 text-muted-foreground"}`}>
              {index + 1}. {label}
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {step === 0 && (
            <StepIntro />
          )}

          {step === 1 && (
            <div className="space-y-4 text-sm leading-6">
              <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Zuerst brauchst du die ntfy-App auf deinem Handy. Ohne App kann AutoArchiv dir keine Push senden.
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <QrInstallCard
                  platform="iPhone"
                  title="ntfy im App Store"
                  description="Für das iPhone ist das die reguläre ntfy-App."
                  qrUrl={appStoreUrl}
                  linkUrl={appStoreUrl}
                />
                <QrInstallCard
                  platform="Android"
                  title="ntfy im Google Play Store"
                  description="Für Android ist das die reguläre ntfy-App."
                  qrUrl={playStoreUrl}
                  linkUrl={playStoreUrl}
                />
              </div>

              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">So installierst du die App</div>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Scanne mit deinem Handy den QR-Code für dein Gerät oder tippe auf den Store-Button.</li>
                  <li>Installiere die App.</li>
                  <li>Öffne sie einmal direkt nach der Installation.</li>
                </ol>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 text-sm leading-6">
              <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Jetzt verbinden wir die App mit deinem persönlichen AutoArchiv-Topic. Das Topic ist dein „Passwort“ für Benachrichtigungen und gehört nur zu deinem Konto.
              </div>

                <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
                  <div className="grid gap-3">
                    <QrInstallCard
                      platform="iPhone"
                      title={!hasTopic ? "Topic wird geladen..." : "iPhone-Onboarding"}
                      description="Dieser QR-Code öffnet die saubere AutoArchiv-Hilfeseite mit deinem Topic und den genauen Schritten."
                      qrUrl={iphoneSetupUrl}
                      linkUrl={iphoneSetupUrl}
                    />
                    <QrInstallCard
                      platform="Android"
                      title={!hasTopic ? "Topic wird geladen..." : hasServerTopic ? "Topic als App-Link" : hasSuggestedTopic ? "Topic vorgeschlagen" : "Topic"}
                      description="Dieser QR-Code öffnet auf Android direkt die ntfy-App mit dem Topic."
                      qrUrl={subscriptionUrl}
                      linkUrl={topicUrl}
                    />
                </div>
                <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Was du jetzt tun musst</div>
                  <ol className="mt-2 list-decimal space-y-2 pl-5">
                    <li>Öffne die ntfy-App auf dem Handy.</li>
                    <li>Füge ein neues Topic hinzu oder scanne den QR-Code.</li>
                    <li>Trage genau dieses Topic ein, falls du es manuell machen willst.</li>
                  </ol>
                  <div className="mt-3 space-y-2">
                    <input
                      readOnly
                      value={topic}
                      className={`${inputCls} font-mono text-xs`}
                      aria-label="ntfy topic"
                      placeholder={loading ? "Topic wird geladen..." : "Kein Topic verfügbar"}
                      disabled={!hasTopic}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={onCopyTopic} disabled={!hasTopic} className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-xs disabled:opacity-50">
                        {copyOk ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copyOk ? "Kopiert" : "Topic kopieren"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                      Anleitung öffnen
                    </a>
                    <button
                      type="button"
                      onClick={onSaveConnection}
                      disabled={!hasTopic || testState === "sending"}
                      className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 disabled:opacity-50"
                    >
                      {isConnected ? <Check className="h-3.5 w-3.5" /> : <CircleCheckBig className="h-3.5 w-3.5" />}
                      {isConnected ? "Verbunden" : "Verbindung speichern"}
                    </button>
                    <button
                      type="button"
                      onClick={onTestConnection}
                      disabled={!hasTopic || testState === "sending"}
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-400 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {testState === "sending" ? "Teste..." : testState === "ok" ? "Getestet" : "Verbindung testen"}
                    </button>
                  </div>
                  {testState === "ok" && (
                    <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                      Verbunden: Der Test-Push wurde an dein persönliches Topic gesendet.
                    </div>
                  )}
                  {testState === "error" && testError && (
                    <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100">
                      {testError}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Das Topic ist dein geheimer Kanal. Wenn noch kein Konto-Topic gespeichert ist, wird dir automatisch ein stabiler Vorschlag im Format `autoarchiv-&lt;name&gt;-...` angezeigt. Lege ihn dann im Profil als dein persönliches ntfy-Topic ab.
                  </p>
                  <div className="mt-3 rounded-xl border border-border/70 bg-background/40 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Verbindungsstatus</div>
                    <div className={`mt-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${isConnected ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                      <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
                      {isConnected ? `Verbunden mit ${connectionName}` : "Noch nicht verbunden"}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {isConnected
                        ? "AutoArchiv kennt dein persönliches Topic und sendet an dieses Konto."
                        : "Sobald dein Topic im Profil gespeichert ist, zeigt die Seite hier automatisch den verbundenen Status an."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-sm leading-6">
              <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Jetzt legen wir die eigentliche Zahlung an, die später automatisch erinnert wird.
              </div>
              <Section title="Zahlung anlegen">
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Klicke unten rechts auf <strong>Zahlung</strong>.</li>
                  <li>Trage <strong>Absender</strong>, <strong>Beschreibung</strong> und <strong>Betrag</strong> ein.</li>
                  <li>Setze das <strong>Fälligkeitsdatum</strong>.</li>
                  <li>Lass <strong>Erinnerung aktiv</strong> eingeschaltet.</li>
                  <li>Wenn du sofort starten willst, nimm <strong>heute</strong> als Fälligkeit.</li>
                  <li>Wenn du die Erinnerung einen Tag vorher sehen willst, nimm <strong>morgen</strong> als Fälligkeit.</li>
                </ol>
              </Section>
              <Section title="Wichtig beim Bezahlen">
                <ul className="list-disc space-y-1 pl-5">
                  <li>Sobald du die Zahlung auf <strong>bezahlt</strong> setzt, werden weitere Erinnerungen automatisch abgeschaltet.</li>
                  <li>Es kommt dann keine Push mehr für genau diese Zahlung.</li>
                </ul>
              </Section>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-sm leading-6">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                Wenn du bis hierhin alles gemacht hast, hat jeder Benutzer seinen eigenen ntfy-Kanal und keine Fremdbenachrichtigungen mehr.
              </div>
              <Section title="Was jetzt passieren soll">
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Die Zahlung ist offen.</li>
                  <li>Die Erinnerung ist aktiv.</li>
                  <li>Das Fälligkeitsdatum ist gesetzt.</li>
                  <li>Der Worker läuft jede Minute.</li>
                  <li>Auf dem iPhone ist das richtige Topic abonniert.</li>
                </ol>
              </Section>
              <Section title="Erfolgscheck">
                <ul className="list-disc space-y-1 pl-5">
                  <li>Du siehst die Zahlung im Tab <strong>Zahlungen</strong>.</li>
                  <li>Im Detail steht im Abschnitt <strong>Erinnerung</strong> der Status.</li>
                  <li>Am Handy kommt die ntfy-Push an.</li>
                </ul>
              </Section>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {step === 0 && "Wir gehen alles zusammen Schritt für Schritt durch."}
            {step === 1 && "Installiere zuerst die App, dann abonnieren wir das Topic."}
            {step === 2 && "Jetzt kommt der entscheidende Teil: dein geheimer Topic-Kanal oder der Kalender-Feed im Profil."}
            {step === 3 && "Danach ist die Zahlung selbst an der Reihe."}
            {step === 4 && "Wenn das passt, ist die Einrichtung abgeschlossen."}
          </div>
          <div className="flex gap-2">
            {step > 0 ? (
              <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} className="inline-flex items-center gap-2 rounded-lg glass px-4 py-2 text-sm">
                <ChevronLeft className="h-4 w-4" />
                Zurück
              </button>
            ) : null}
            {step < steps.length - 1 ? (
              <button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white">
                Weiter
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={onClose} className="rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white">
                Fertig
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function StepIntro() {
  return (
    <div className="space-y-4 text-sm leading-6">
      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
          <BellRing className="h-4 w-4" />
          Ziel dieses Assistenten
        </div>
        <p className="mt-2 text-sm text-cyan-50/90">
          Hier richtest du die optionale ntfy-Push ein. Für iPhone-Zahlungserinnerungen über den Kalender findest du den persönlichen Kalender-Feed jetzt im Profil.
          Wir gehen das komplett durch: App installieren, Topic abonnieren, Zahlung anlegen und prüfen.
        </p>
      </div>
      <Section title="Was du am Ende haben wirst">
        <ul className="list-disc space-y-1 pl-5">
          <li>Die ntfy-App auf iPhone oder Android, wenn du Push zusätzlich nutzen willst.</li>
          <li>Ein abonniertes, geheim gehaltenes AutoArchiv-Topic pro Benutzerkonto.</li>
          <li>Eine Zahlung, die dich bei Fälligkeit automatisch erinnert.</li>
        </ul>
      </Section>
      <Section title="Wichtiger Hinweis">
        <p>
          Das Topic ist wie ein Passwort. Teile es nur mit Personen, die Benachrichtigungen für AutoArchiv bekommen sollen.
          Später kannst du die Installation auch auf eine eigene ntfy-Instanz umstellen, aber der Ablauf bleibt derselbe.
        </p>
      </Section>
    </div>
  );
}

function QrInstallCard({
  platform,
  title,
  description,
  qrUrl,
  linkUrl,
}: {
  platform: string;
  title: string;
  description: string;
  qrUrl: string;
  linkUrl: string;
}) {
  const qr = useQrDataUrl(qrUrl);
  return (
    <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{platform}</div>
      <div className="mt-1 text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 grid place-items-center">
        <div className="rounded-2xl bg-white p-3 shadow-lg">
          {qr ? <img src={qr} alt={title} className="h-40 w-40" /> : <div className="grid h-40 w-40 place-items-center text-xs text-muted-foreground">QR wird geladen...</div>}
        </div>
      </div>
      {linkUrl ? (
        <a href={linkUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center rounded-lg glass px-3 py-2 text-xs">
          Web-Link öffnen
        </a>
      ) : (
        <div className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
          Warte auf Topic
        </div>
      )}
    </div>
  );
}

function buildNtfySubscriptionUrl(baseUrl: string, topic: string) {
  try {
    const url = new URL(baseUrl);
    const prefix = url.pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    const path = [prefix, encodeURIComponent(topic)].filter(Boolean).join("/");
    return `ntfy://${url.host}/${path}`;
  } catch {
    return `ntfy://ntfy.sh/${encodeURIComponent(topic)}`;
  }
}

function buildUserTopic(email?: string, displayName?: string | null) {
  const emailValue = (email || "").trim().toLowerCase();
  const localPart = emailValue.includes("@") ? emailValue.split("@")[0] : "";
  const namePart = slugifyTopicPart(displayName || localPart || emailValue || "konto");
  const userPart = slugifyTopicPart(emailValue || localPart || displayName || "konto");
  const seed = hashTopicSeed(`${emailValue}:${displayName || ""}`);
  return `autoarchiv-${namePart}-${userPart}-${seed}`;
}

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

function useQrDataUrl(value: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!value) {
      setDataUrl(null);
      return;
    }
    void QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((next) => {
        if (alive) setDataUrl(next);
      })
      .catch(() => {
        if (alive) setDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [value]);
  return dataUrl;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function PaymentDetail({ payment, documents, onClose, onChanged }: { payment: PaymentEntry; documents: any[]; onClose: () => void; onChanged: () => void }) {
  const [partial, setPartial] = useState("");
  const linkedDoc = documents.find((d) => d.id === payment.documentId);
  const paidSum = payment.paid?.reduce((s, x) => s + x.amount, 0) || 0;
  const remaining = Math.max(0, payment.betrag - paidSum);
  const pct = Math.min(100, (paidSum / Math.max(1, payment.betrag)) * 100);

  const markPaid = async () => {
    try {
      await savePayment({ ...payment, status: "bezahlt", paid: [...payment.paid, { date: new Date().toISOString(), amount: remaining }] });
      toast.success("Als bezahlt markiert"); onChanged(); onClose();
    } catch (err: any) {
      toast.error(err?.message || "Zahlung konnte nicht gespeichert werden");
    }
  };
  const addPartial = async () => {
    const amt = Number(partial); if (!amt) return;
    const newPaid = [...payment.paid, { date: new Date().toISOString(), amount: amt }];
    const total = newPaid.reduce((s,x)=>s+x.amount,0);
    const status = total >= payment.betrag ? "bezahlt" : "teilbezahlt";
    try {
      await savePayment({ ...payment, paid: newPaid, status });
      toast.success("Teilzahlung gespeichert"); onChanged(); onClose();
    } catch (err: any) {
      toast.error(err?.message || "Zahlung konnte nicht gespeichert werden");
    }
  };
  const setReminder = async () => {
    try {
      await saveAppointment({
        id: uid(), titel: `Wiedervorlage: ${payment.absender}`,
        datum: new Date(Date.now() + 7*24*3600*1000).toISOString(),
        typ: "erinnerung", documentId: payment.documentId,
      });
      toast.success("Wiedervorlage in 7 Tagen gesetzt"); onChanged();
    } catch (err: any) {
      toast.error(err?.message || "Wiedervorlage konnte nicht gespeichert werden");
    }
  };
  const remove = async () => {
    try {
      await deletePayment(payment.id); toast.success("Zahlung gelöscht"); onChanged(); onClose();
    } catch (err: any) {
      toast.error(err?.message || "Zahlung konnte nicht gelöscht werden");
    }
  };

  return (
    <ModalShell onClose={onClose} title={payment.absender}>
      <p className="text-sm text-muted-foreground">{payment.beschreibung || "—"}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Betrag" value={fmtEUR(payment.betrag)} />
        <Stat label="Bezahlt" value={fmtEUR(paidSum)} />
        <Stat label="Offen" value={fmtEUR(remaining)} />
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${pct}%` }} />
      </div>
      {linkedDoc && (
        <div className="mt-4 glass rounded-xl p-3 text-sm">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Verknüpftes Dokument</div>
          <div className="mt-0.5 truncate font-medium">{linkedDoc.filename}</div>
        </div>
      )}
      <div className="mt-4 glass rounded-xl p-3 text-sm">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Erinnerung</div>
        <div className="mt-0.5 font-medium">{payment.reminderEnabled === false ? "deaktiviert" : "aktiv"}</div>
        {payment.reminder1dSentAt && (
          <div className="mt-1 text-xs text-muted-foreground">1 Tag vorher gesendet: {fmtDate(payment.reminder1dSentAt)}</div>
        )}
        {payment.reminderSameDaySentAt && (
          <div className="mt-1 text-xs text-muted-foreground">Am selben Tag gesendet: {fmtDate(payment.reminderSameDaySentAt)}</div>
        )}
      </div>
      {payment.paid?.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Verlauf</div>
          <ul className="mt-1.5 space-y-1">
            {payment.paid.map((p, i) => (
              <li key={i} className="flex justify-between text-xs">
                <span>{fmtDate(p.date)}</span><span className="font-mono">{fmtEUR(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 grid gap-2">
        <div className="flex gap-2">
          <input type="number" step="0.01" placeholder="Teilzahlung €" value={partial} onChange={(e)=>setPartial(e.target.value)} className={inputCls} />
          <button onClick={addPartial} className="rounded-lg glass px-3 text-sm">+ Teil</button>
        </div>
        <button onClick={markPaid} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2 text-sm font-medium text-black"><CheckCircle2 className="h-4 w-4" /> Als bezahlt</button>
        <button onClick={setReminder} className="inline-flex items-center justify-center gap-2 rounded-lg glass px-4 py-2 text-sm"><CalendarPlus className="h-4 w-4" /> Wiedervorlage +7T</button>
        <button onClick={remove} className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">Löschen</button>
      </div>
    </ModalShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="glass rounded-xl p-2.5"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-sm font-semibold">{value}</div></div>;
}
function Field({ label, children }: any) {
  return <label className="block text-sm"><span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
const inputCls = "w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm outline-none focus:border-primary";

function ModalShell({ children, onClose, title, sizeClass = "max-w-md" }: any) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 backdrop-blur-md p-2 sm:p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        className={`glass-strong flex w-full flex-col rounded-2xl border-glow p-4 sm:p-5 ${sizeClass} max-h-[92vh] sm:max-h-[88vh]`} onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4"/></button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">{children}</div>
      </motion.div>
    </motion.div>
  );
}

interface NtfySetupConfig {
  enabled: boolean;
  baseUrl: string;
  topic: string;
  suggestedTopic: string;
  publicAppUrl: string;
}

interface AuthInfo {
  authenticated: true;
  email?: string;
  role?: "admin" | "user";
  displayName?: string | null;
  ntfyTopic?: string | null;
  ntfySuggestedTopic?: string | null;
  calendarFeedUrl?: string | null;
  calendarLeadDays?: number | null;
}
