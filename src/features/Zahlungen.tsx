import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, CheckCircle2, CalendarPlus } from "lucide-react";
import { useArchive } from "../lib/store";
import { fmtEUR, fmtDate, daysUntil } from "../lib/format";
import { savePayment, deletePayment, saveAppointment, uid, type PaymentEntry } from "../lib/db";
import { toast } from "sonner";

export default function ZahlungenPage() {
  const { payments, refresh, documents } = useArchive();
  const [addOpen, setAddOpen] = useState(false);
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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Zahlungen</h1>
          <p className="mt-1 text-sm text-muted-foreground">Im Blick, was raus muss.</p>
        </div>
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
  const [faelligkeit, setFaelligkeit] = useState(new Date().toISOString().slice(0, 10));
  return (
    <ModalShell onClose={onClose} title="Neue Zahlung">
      <form onSubmit={async (e) => {
        e.preventDefault();
        await savePayment({
          id: uid(), absender, beschreibung, betrag: Number(betrag) || 0,
          faelligkeit: new Date(faelligkeit).toISOString(),
          status: "offen", paid: [], createdAt: new Date().toISOString(),
        });
        toast.success("Zahlung gespeichert");
        onSaved();
      }} className="space-y-3">
        <Field label="Absender"><input required value={absender} onChange={(e)=>setAbsender(e.target.value)} className={inputCls} /></Field>
        <Field label="Beschreibung"><input value={beschreibung} onChange={(e)=>setBeschreibung(e.target.value)} className={inputCls} /></Field>
        <Field label="Betrag (€)"><input required type="number" step="0.01" value={betrag} onChange={(e)=>setBetrag(e.target.value)} className={inputCls} /></Field>
        <Field label="Fälligkeit"><input type="date" value={faelligkeit} onChange={(e)=>setFaelligkeit(e.target.value)} className={inputCls} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg glass px-4 py-2 text-sm">Abbrechen</button>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white">Speichern</button>
        </div>
      </form>
    </ModalShell>
  );
}

function PaymentDetail({ payment, documents, onClose, onChanged }: { payment: PaymentEntry; documents: any[]; onClose: () => void; onChanged: () => void }) {
  const [partial, setPartial] = useState("");
  const linkedDoc = documents.find((d) => d.id === payment.documentId);
  const paidSum = payment.paid?.reduce((s, x) => s + x.amount, 0) || 0;
  const remaining = Math.max(0, payment.betrag - paidSum);
  const pct = Math.min(100, (paidSum / Math.max(1, payment.betrag)) * 100);

  const markPaid = async () => {
    await savePayment({ ...payment, status: "bezahlt", paid: [...payment.paid, { date: new Date().toISOString(), amount: remaining }] });
    toast.success("Als bezahlt markiert"); onChanged(); onClose();
  };
  const addPartial = async () => {
    const amt = Number(partial); if (!amt) return;
    const newPaid = [...payment.paid, { date: new Date().toISOString(), amount: amt }];
    const total = newPaid.reduce((s,x)=>s+x.amount,0);
    const status = total >= payment.betrag ? "bezahlt" : "teilbezahlt";
    await savePayment({ ...payment, paid: newPaid, status });
    toast.success("Teilzahlung gespeichert"); onChanged(); onClose();
  };
  const setReminder = async () => {
    await saveAppointment({
      id: uid(), titel: `Wiedervorlage: ${payment.absender}`,
      datum: new Date(Date.now() + 7*24*3600*1000).toISOString(),
      typ: "erinnerung", documentId: payment.documentId,
    });
    toast.success("Wiedervorlage in 7 Tagen gesetzt"); onChanged();
  };
  const remove = async () => {
    await deletePayment(payment.id); toast.success("Zahlung gelöscht"); onChanged(); onClose();
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

function ModalShell({ children, onClose, title }: any) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        className="glass-strong w-full max-w-md rounded-2xl border-glow p-5" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4"/></button>
        </div>
        <div className="mt-4">{children}</div>
      </motion.div>
    </motion.div>
  );
}