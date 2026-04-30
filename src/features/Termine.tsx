import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, ChevronLeft, ChevronRight, Bell, Wallet, FileText } from "lucide-react";
import { useArchive } from "../lib/store";
import { fmtDate } from "../lib/format";
import { saveAppointment, deleteAppointment, uid, type Appointment } from "../lib/db";
import { toast } from "sonner";

export default function TerminePage() {
  const { appointments, payments, documents, refresh } = useArchive();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<Date | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Combined events
  const events = useMemo(() => {
    const list: { id: string; date: string; title: string; type: "zahlung"|"erinnerung"|"sonstiges"|"ablauf"; appointment?: Appointment }[] = [];
    appointments.forEach((a) => list.push({ id: a.id, date: a.datum, title: a.titel, type: a.typ, appointment: a }));
    payments.filter((p) => p.status !== "bezahlt").forEach((p) => list.push({ id: "p_"+p.id, date: p.faelligkeit, title: `${p.absender} — Fälligkeit`, type: "zahlung" }));
    documents.forEach((d) => { if (d.ablaufdatum) list.push({ id: "d_"+d.id, date: d.ablaufdatum, title: `Ablauf: ${d.filename}`, type: "ablauf" }); });
    return list.sort((a, b) => +new Date(a.date) - +new Date(b.date));
  }, [appointments, payments, documents]);

  const monthLabel = cursor.toLocaleString("de-DE", { month: "long", year: "numeric" });
  const firstDayIdx = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDayIdx).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const eventsForDay = (d: number) => {
    return events.filter((e) => {
      const dt = new Date(e.date);
      return dt.getFullYear() === cursor.getFullYear() && dt.getMonth() === cursor.getMonth() && dt.getDate() === d;
    });
  };

  const upcoming = useMemo(() => events.filter((e) => +new Date(e.date) >= Date.now() - 86400000).slice(0, 12), [events]);

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Termine</h1>
        <p className="mt-1 text-sm text-muted-foreground">Fälligkeiten, Erinnerungen und Dokumentenabläufe.</p>
      </div>

      <div className="glass border-glow rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>
          <div className="flex gap-1">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><ChevronLeft className="h-4 w-4"/></button>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><ChevronRight className="h-4 w-4"/></button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
          {["Mo","Di","Mi","Do","Fr","Sa","So"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <motion.div key={monthLabel} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="mt-1 grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const evs = eventsForDay(d);
            const isToday = (() => { const t = new Date(); return t.getFullYear()===cursor.getFullYear() && t.getMonth()===cursor.getMonth() && t.getDate()===d; })();
            return (
              <button key={i} onClick={() => setSelected(new Date(cursor.getFullYear(), cursor.getMonth(), d))}
                className={`relative aspect-square rounded-lg p-1.5 text-left text-xs transition hover:bg-muted ${isToday ? "border border-primary" : "border border-transparent"} glass`}>
                <span className={isToday ? "font-bold text-primary" : ""}>{d}</span>
                <div className="absolute bottom-1 left-1 flex gap-0.5">
                  {evs.slice(0,3).map((e, j) => (
                    <span key={j} className={`h-1.5 w-1.5 rounded-full ${
                      e.type==="zahlung"?"bg-rose-400":e.type==="erinnerung"?"bg-amber-400":e.type==="ablauf"?"bg-fuchsia-400":"bg-cyan-400"
                    }`}/>
                  ))}
                </div>
              </button>
            );
          })}
        </motion.div>
      </div>

      <div className="glass border-glow rounded-2xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Bald anstehend</h3>
        <div className="mt-3 space-y-2">
          {upcoming.length === 0 && <div className="text-sm text-muted-foreground">Keine kommenden Termine.</div>}
          {upcoming.map((e) => {
            const Icon = e.type==="zahlung"?Wallet:e.type==="erinnerung"?Bell:FileText;
            return (
              <div key={e.id} className="glass flex items-center gap-3 rounded-xl p-2.5">
                <div className={`grid h-8 w-8 place-items-center rounded-lg ${
                  e.type==="zahlung"?"bg-rose-500/20 text-rose-300":
                  e.type==="erinnerung"?"bg-amber-500/20 text-amber-300":
                  e.type==="ablauf"?"bg-fuchsia-500/20 text-fuchsia-300":"bg-cyan-500/20 text-cyan-300"
                }`}><Icon className="h-4 w-4"/></div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm ${e.appointment?.done?"line-through text-muted-foreground":""}`}>{e.title}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtDate(e.date)}</div>
                </div>
                {e.appointment && (
                  <button onClick={async () => {
                    await saveAppointment({ ...e.appointment!, done: !e.appointment!.done });
                    refresh();
                  }} className={`grid h-7 w-7 place-items-center rounded-lg ${e.appointment.done?"bg-emerald-500/20 text-emerald-300":"glass"}`}>
                    <Check className="h-3.5 w-3.5"/>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={() => setAddOpen(true)}
        className="fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-3 text-sm font-medium text-white shadow-[0_0_30px_oklch(0.62_0.24_290/0.5)] transition hover:scale-[1.03] md:bottom-6">
        <Plus className="h-4 w-4" /> Termin
      </button>

      <AnimatePresence>
        {selected && (
          <DayPanel date={selected} events={events.filter((e) => {
            const dt = new Date(e.date);
            return dt.toDateString() === selected.toDateString();
          })} onClose={() => setSelected(null)} onDelete={async (id: string) => { await deleteAppointment(id); refresh(); toast.success("Gelöscht"); }} />
        )}
        {addOpen && <AddTerminModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refresh(); }} />}
      </AnimatePresence>
    </div>
  );
}

function DayPanel({ date, events, onClose, onDelete }: any) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28 }}
        className="ml-auto h-full w-full max-w-md glass-strong border-l border-border/40 p-5 overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{fmtDate(date)}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4"/></button>
        </div>
        <div className="mt-4 space-y-2">
          {events.length === 0 && <div className="text-sm text-muted-foreground">Keine Termine an diesem Tag.</div>}
          {events.map((e: any) => (
            <div key={e.id} className="glass flex items-center justify-between rounded-xl p-3">
              <div>
                <div className="text-sm font-medium">{e.title}</div>
                <div className="text-[11px] text-muted-foreground">{e.type}</div>
              </div>
              {e.appointment && (
                <button onClick={() => onDelete(e.appointment.id)} className="text-xs text-rose-300 hover:underline">Löschen</button>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddTerminModal({ onClose, onSaved }: any) {
  const [titel, setTitel] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0,16));
  const [typ, setTyp] = useState<Appointment["typ"]>("erinnerung");
  const [notiz, setNotiz] = useState("");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="glass-strong w-full max-w-md rounded-2xl border-glow p-5" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Neuer Termin</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4"/></button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          await saveAppointment({ id: uid(), titel, datum: new Date(datum).toISOString(), typ, notiz });
          toast.success("Termin gespeichert"); onSaved();
        }}>
          <input required placeholder="Titel" value={titel} onChange={(e)=>setTitel(e.target.value)} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
          <input type="datetime-local" value={datum} onChange={(e)=>setDatum(e.target.value)} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
          <select value={typ} onChange={(e)=>setTyp(e.target.value as any)} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm outline-none focus:border-primary">
            <option value="erinnerung">Erinnerung</option><option value="zahlung">Zahlung</option><option value="sonstiges">Sonstiges</option>
          </select>
          <textarea placeholder="Notiz" value={notiz} onChange={(e)=>setNotiz(e.target.value)} rows={3} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm outline-none focus:border-primary"/>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg glass px-4 py-2 text-sm">Abbrechen</button>
            <button type="submit" className="rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white">Speichern</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}