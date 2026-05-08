import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Activity, Bot, CheckCircle2, CircleDot, Clock3, RefreshCw, UserRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime } from "../lib/format";

type AgentStatus = "active" | "idle" | "blocked" | "done";
type AgentType = "ai" | "human";

interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  responsibility: string;
  currentTask: string;
  currentFiles: string[];
  nextSteps: string;
  blockers: string;
  updatedAt: string;
}

interface AgentEvent {
  id: string;
  agentId: string;
  agentName: string;
  agentType: AgentType;
  eventType: string;
  message: string;
  files: string[];
  createdAt: string;
}

const statusMeta: Record<AgentStatus, { label: string; cls: string; Icon: any }> = {
  active: { label: "Aktiv", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30", Icon: Activity },
  idle: { label: "Bereit", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-400/30", Icon: CircleDot },
  blocked: { label: "Blockiert", cls: "bg-rose-500/15 text-rose-300 border-rose-400/30", Icon: AlertTriangle },
  done: { label: "Fertig", cls: "bg-violet-500/15 text-violet-200 border-violet-400/30", Icon: CheckCircle2 },
};

const blankForm = {
  agentId: "kevin",
  status: "active" as AgentStatus,
  currentTask: "",
  currentFiles: "",
  nextSteps: "",
  blockers: "",
  message: "",
};

const teamPairs = [
  { id: "kevin-codex", owner: "Kevin", other: "Maik", title: "Kevin + Codex", humanId: "kevin", aiId: "codex", purpose: "Kevin arbeitet mit Codex." },
  { id: "maik-claude", owner: "Maik", other: "Kevin", title: "Maik + Claude Code", humanId: "maik", aiId: "claude-code", purpose: "Maik arbeitet mit Claude Code." },
];

async function fetchAgents() {
  const stamp = String(Date.now());
  const [agentsRes, eventsRes] = await Promise.all([
    fetch(`/api/agents?t=${stamp}`, { credentials: "include", cache: "no-store" }),
    fetch(`/api/agents/events?t=${stamp}`, { credentials: "include", cache: "no-store" }),
  ]);
  if (!agentsRes.ok || !eventsRes.ok) throw new Error("Agentenstatus konnte nicht geladen werden");
  const [agentsData, eventsData] = await Promise.all([agentsRes.json(), eventsRes.json()]);
  return {
    agents: (agentsData.agents || []) as Agent[],
    events: (eventsData.events || []) as AgentEvent[],
  };
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm);

  const load = async ({ silent = false } = {}) => {
    try {
      if (!silent) setRefreshing(true);
      const data = await fetchAgents();
      setAgents(data.agents);
      setEvents(data.events);
      if (!silent) toast.success("Agentenstatus aktualisiert");
    } catch (err: any) {
      if (!silent) toast.error(err?.message || "Agentenstatus konnte nicht geladen werden");
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const fallback = window.setInterval(() => load({ silent: true }), 30_000);
    const source = new EventSource("/api/agents/stream");

    source.addEventListener("open", () => setConnected(true));
    source.addEventListener("agents", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setAgents(data.agents || []);
        setEvents(data.events || []);
        setConnected(true);
        setLoading(false);
      } catch {
        setConnected(false);
      }
    });
    source.addEventListener("error", () => setConnected(false));

    return () => {
      window.clearInterval(fallback);
      source.close();
    };
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === form.agentId),
    [agents, form.agentId],
  );

  const agentById = useMemo(() => {
    return new Map(agents.map((agent) => [agent.id, agent]));
  }, [agents]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/agents/activity", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: form.agentId,
          status: form.status,
          currentTask: form.currentTask,
          currentFiles: form.currentFiles,
          nextSteps: form.nextSteps,
          blockers: form.blockers,
          message: form.message || form.currentTask || `Status: ${form.status}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Status konnte nicht gespeichert werden");
      setAgents(data.agents || agents);
      setEvents(data.events || events);
      setForm((prev) => ({ ...blankForm, agentId: prev.agentId, status: prev.status }));
      toast.success("Agentenstatus gespeichert");
    } catch (err: any) {
      toast.error(err?.message || "Status konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Team-Liveboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sofort sehen, was Kevin mit Codex macht und was Maik mit Claude Code macht.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
            connected ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300" : "border-amber-400/30 bg-amber-500/15 text-amber-300"
          }`}>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"}`} />
            {connected ? "Live verbunden" : "Fallback aktiv"}
          </span>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => load()}
            className="inline-flex items-center gap-1 rounded-full glass px-3 py-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Lädt..." : "Aktualisieren"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(loading ? [] : teamPairs).map((team) => (
          <TeamCard
            key={team.id}
            title={team.title}
            owner={team.owner}
            other={team.other}
            purpose={team.purpose}
            human={agentById.get(team.humanId)}
            ai={agentById.get(team.aiId)}
            events={events.filter((event) => event.agentId === team.humanId || event.agentId === team.aiId).slice(0, 4)}
          />
        ))}
        {loading && [0, 1].map((i) => <div key={i} className="glass h-80 animate-pulse rounded-2xl border-glow" />)}
      </div>

      <details className="glass rounded-2xl border-glow p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Technischer Einzelstatus anzeigen</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
        </div>
      </details>

      <div className="glass rounded-2xl border-glow p-4 text-sm text-muted-foreground">
        <div className="font-medium text-foreground">So liest du diese Seite:</div>
        <div className="mt-1">Maik sieht links/rechts sofort, woran Kevin gerade mit Codex arbeitet. Kevin sieht genauso, woran Maik gerade mit Claude Code arbeitet. Die KI-Agenten schreiben ihre Terminal-Updates live in diese Teamkarten.</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="glass rounded-2xl border-glow p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Status eintragen</h2>
            {selectedAgent && <span className="text-xs text-muted-foreground">{selectedAgent.name}</span>}
          </div>
          <div className="mt-4 space-y-3">
            <Field label="Agent">
              <select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })} className={inputCls}>
                {agents.map((agent) => {
                  const teamLabel = agent.id === "codex" || agent.id === "kevin" ? "Kevin + Codex" : agent.id === "claude-code" || agent.id === "maik" ? "Maik + Claude Code" : "";
                  return <option key={agent.id} value={agent.id}>{agent.name}{teamLabel ? ` (${teamLabel})` : ""}</option>;
                })}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AgentStatus })} className={inputCls}>
                <option value="active">Aktiv</option>
                <option value="idle">Bereit</option>
                <option value="blocked">Blockiert</option>
                <option value="done">Fertig</option>
              </select>
            </Field>
            <Field label="Was macht das Team gerade?">
              <input value={form.currentTask} onChange={(e) => setForm({ ...form, currentTask: e.target.value })} className={inputCls} placeholder="z.B. Maik testet Upload mit Claude Code" />
            </Field>
            <Field label="Welche Dateien/Bereiche sind betroffen?">
              <textarea value={form.currentFiles} onChange={(e) => setForm({ ...form, currentFiles: e.target.value })} rows={2} className={inputCls} placeholder="api-server.mjs, src/features/..." />
            </Field>
            <Field label="Nächste Schritte">
              <textarea value={form.nextSteps} onChange={(e) => setForm({ ...form, nextSteps: e.target.value })} rows={2} className={inputCls} />
            </Field>
            <Field label="Blocker">
              <textarea value={form.blockers} onChange={(e) => setForm({ ...form, blockers: e.target.value })} rows={2} className={inputCls} />
            </Field>
            <Field label="Event-Nachricht">
              <input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={inputCls} placeholder="z.B. Claude Code hat Backend geprüft" />
            </Field>
          </div>
          <button disabled={saving} className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
            {saving ? "Speichert..." : "Event speichern"}
          </button>
        </form>

        <section className="glass rounded-2xl border-glow p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Live-Timeline</h2>
            <span className="text-xs text-muted-foreground">{events.length} Events</span>
          </div>
          <div className="mt-4 space-y-3">
            {events.length === 0 && <div className="text-sm text-muted-foreground">Noch keine Agenten-Events vorhanden.</div>}
            {events.map((event) => <EventRow key={event.id} event={event} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

function TeamCard({ title, owner, other, purpose, human, ai, events }: {
  title: string;
  owner: string;
  other: string;
  purpose: string;
  human?: Agent;
  ai?: Agent;
  events: AgentEvent[];
}) {
  const primary = pickPrimaryAgent(human, ai);
  const files = Array.from(new Set([...(human?.currentFiles || []), ...(ai?.currentFiles || [])]));
  const blockers = [human?.blockers, ai?.blockers].filter(Boolean).join("\n");
  const nextSteps = [human?.nextSteps, ai?.nextSteps].filter(Boolean).join("\n");
  const task = primary?.currentTask || human?.currentTask || ai?.currentTask || "Noch keine laufende Aufgabe eingetragen.";
  const updatedAt = [human?.updatedAt, ai?.updatedAt].filter(Boolean).sort().at(-1);

  return (
    <article className="glass rounded-2xl border-glow p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{purpose} {other} sieht hier live die Zusammenfassung.</p>
        </div>
        {primary && <StatusPill status={primary.status} />}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {human && <MiniPerson agent={human} />}
        {ai && <MiniPerson agent={ai} />}
      </div>

      <div className="mt-5 space-y-4 text-sm">
        <div className="rounded-xl border border-primary/25 bg-primary/10 p-4">
          <div className="text-[11px] uppercase tracking-wider text-primary">{owner} macht gerade</div>
          <p className="mt-1 text-base font-medium leading-relaxed">{task}</p>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Betroffene Dateien/Bereiche</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {files.length === 0 && <span className="text-xs text-muted-foreground">Keine Dateien eingetragen</span>}
            {files.map((file) => <span key={file} className="rounded-full glass px-2 py-0.5 font-mono text-[11px]">{file}</span>)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Nächste Schritte" value={nextSteps || "Noch nicht eingetragen"} />
          <Info label="Blocker" value={blockers || "Keine Blocker"} tone={blockers ? "warn" : undefined} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Letzte Live-Einträge</div>
          <div className="mt-2 space-y-2">
            {events.length === 0 && <div className="text-xs text-muted-foreground">Noch keine Events für dieses Team.</div>}
            {events.map((event) => (
              <div key={event.id} className="rounded-xl bg-muted/25 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{event.agentName}</span>
                  <span className="text-muted-foreground">{fmtDateTime(event.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-sm">{event.message}</div>
              </div>
            ))}
          </div>
        </div>
        {updatedAt && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" /> Letzte Aktivität: {fmtDateTime(updatedAt)}
          </div>
        )}
      </div>
    </article>
  );
}

function pickPrimaryAgent(human?: Agent, ai?: Agent) {
  const order: AgentStatus[] = ["blocked", "active", "done", "idle"];
  return [human, ai]
    .filter(Boolean)
    .sort((a, b) => order.indexOf(a!.status) - order.indexOf(b!.status))[0];
}

function MiniPerson({ agent }: { agent: Agent }) {
  const Icon = agent.type === "ai" ? Bot : UserRound;
  return (
    <div className="rounded-xl bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">{agent.name}</div>
            <div className="text-[11px] text-muted-foreground">{agent.type === "ai" ? "KI-Agent" : "Mensch"}</div>
          </div>
        </div>
        <StatusPill status={agent.status} compact />
      </div>
      <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">{agent.currentTask || "Keine Aufgabe eingetragen"}</div>
    </div>
  );
}

function StatusPill({ status, compact }: { status: AgentStatus; compact?: boolean }) {
  const meta = statusMeta[status];
  const StatusIcon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${meta.cls}`}>
      <StatusIcon className="h-3.5 w-3.5" /> {!compact && meta.label}{compact && <span className="sr-only">{meta.label}</span>}
    </span>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const meta = statusMeta[agent.status];
  const Icon = agent.type === "ai" ? Bot : UserRound;
  return (
    <article className="glass rounded-2xl border-glow p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">{agent.name}</h2>
            <p className="text-xs text-muted-foreground">{agent.type === "ai" ? "KI-Agent" : "Mensch"}</p>
          </div>
        </div>
        <StatusPill status={agent.status} />
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <Info label="Aufgabe" value={agent.currentTask || "Keine aktuelle Aufgabe eingetragen"} />
        <Info label="Zuständigkeit" value={agent.responsibility || "-"} />
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Dateien/Bereiche</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {agent.currentFiles.length === 0 && <span className="text-xs text-muted-foreground">-</span>}
            {agent.currentFiles.map((file) => <span key={file} className="rounded-full glass px-2 py-0.5 font-mono text-[11px]">{file}</span>)}
          </div>
        </div>
        <Info label="Nächste Schritte" value={agent.nextSteps || "-"} />
        <Info label="Blocker" value={agent.blockers || "-"} tone={agent.blockers ? "warn" : undefined} />
        <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" /> {fmtDateTime(agent.updatedAt)}
        </div>
      </div>
    </article>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  const Icon = event.agentType === "ai" ? Bot : UserRound;
  return (
    <div className="glass flex gap-3 rounded-xl p-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/70">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{event.agentName}</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">{event.eventType}</span>
          <span className="text-[11px] text-muted-foreground">{fmtDateTime(event.createdAt)}</span>
        </div>
        <p className="mt-1 text-sm text-foreground/90">{event.message}</p>
        {event.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {event.files.map((file) => <span key={file} className="rounded-full glass px-2 py-0.5 font-mono text-[11px]">{file}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <p className={`mt-1 leading-relaxed ${tone === "warn" ? "text-rose-300" : "text-foreground/90"}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}

const inputCls = "w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm outline-none focus:border-primary";
