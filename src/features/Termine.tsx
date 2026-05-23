import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  FileText,
  PencilLine,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { fmtDate, fmtDateTime, fmtEUR, daysUntil } from "../lib/format";
import {
  deleteAppointment,
  deleteDocument,
  deletePayment,
  patchDocument,
  saveAppointment,
  savePayment,
  uid,
  type Appointment,
  type ArchivedDoc,
  type PaymentEntry,
} from "../lib/db";
import { useArchive } from "../lib/store";

type ItemKind = "appointment" | "payment" | "document";

type CalendarItem = {
  id: string;
  kind: ItemKind;
  date: string;
  title: string;
  subtitle: string;
  tone: "cyan" | "rose" | "amber" | "fuchsia" | "emerald";
  appointment?: Appointment;
  payment?: PaymentEntry;
  document?: ArchivedDoc;
};

type EditorTarget =
  | { kind: "appointment"; mode: "new" | "edit"; dayKey: string; item?: Appointment }
  | { kind: "payment"; mode: "new" | "edit"; dayKey: string; item?: PaymentEntry }
  | { kind: "document"; mode: "edit"; dayKey: string; item: ArchivedDoc };

const pad = (value: number) => String(value).padStart(2, "0");

function parseDateLike(value: string | Date) {
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  return new Date(raw);
}

function localDayKey(value: string | Date) {
  const d = parseDateLike(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayKeyToDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function toDateInput(value: string | Date) {
  const d = parseDateLike(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateTimeInput(value: string | Date) {
  const d = parseDateLike(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDateTimeForDay(dayKey: string, fallback = new Date()) {
  if (dayKey) return `${dayKey}T09:00`;
  const d = new Date(fallback);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toDateTimeInput(d);
}

function relativeDueLabel(value: string) {
  const days = daysUntil(value);
  if (days === null) return "";
  if (days < 0) return `überfällig seit ${Math.abs(days)} Tagen`;
  if (days === 0) return "heute fällig";
  if (days === 1) return "morgen fällig";
  return `in ${days} Tagen fällig`;
}

function eventColorClass(item: CalendarItem) {
  if (item.kind === "payment") {
    if (item.payment?.status === "bezahlt") return "bg-emerald-500/15 text-emerald-300";
    if (item.payment?.status === "teilbezahlt") return "bg-amber-500/15 text-amber-300";
    return "bg-rose-500/15 text-rose-300";
  }
  if (item.kind === "document") return "bg-fuchsia-500/15 text-fuchsia-300";
  if (item.appointment?.done) return "bg-emerald-500/15 text-emerald-300";
  if (item.appointment?.typ === "zahlung") return "bg-rose-500/15 text-rose-300";
  if (item.appointment?.typ === "sonstiges") return "bg-fuchsia-500/15 text-fuchsia-300";
  return "bg-cyan-500/15 text-cyan-300";
}

function eventIcon(item: CalendarItem) {
  if (item.kind === "payment") return Wallet;
  if (item.kind === "document") return FileText;
  return CalendarDays;
}

function isBusyItem(item: CalendarItem, busyId: string | null) {
  return Boolean(
    busyId &&
    (busyId === item.id ||
      (item.kind === "appointment" && busyId === item.appointment?.id) ||
      (item.kind === "payment" && busyId === item.payment?.id))
  );
}

function editorTitle(target: EditorTarget) {
  if (target.kind === "appointment") {
    return target.mode === "new" ? "Neuer Termin" : "Termin bearbeiten";
  }
  if (target.kind === "payment") return target.mode === "new" ? "Neue Zahlung" : "Zahlung bearbeiten";
  return "Dokument bearbeiten";
}

export default function TerminePage() {
  const { appointments, payments, documents, refresh } = useArchive();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [selectedKey, setSelectedKey] = useState(() => localDayKey(new Date()));
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = useMemo<CalendarItem[]>(() => {
    const list: CalendarItem[] = [];

    for (const appointment of appointments) {
      list.push({
        id: `a:${appointment.id}`,
        kind: "appointment",
        date: appointment.datum,
        title: appointment.titel || "Unbenannter Termin",
        subtitle: appointment.notiz?.trim()
          ? appointment.notiz.trim()
          : appointment.typ === "zahlung"
            ? "Zahlungstermin"
            : appointment.typ === "erinnerung"
              ? "Erinnerung"
              : "Sonstiges",
        tone: appointment.done ? "emerald" : appointment.typ === "zahlung" ? "rose" : appointment.typ === "sonstiges" ? "fuchsia" : "cyan",
        appointment,
      });
    }

    for (const payment of payments) {
      const status = payment.status;
      list.push({
        id: `p:${payment.id}`,
        kind: "payment",
        date: payment.faelligkeit,
        title: payment.absender || "Unbekannter Absender",
        subtitle: [payment.beschreibung?.trim(), fmtEUR(payment.betrag)].filter(Boolean).join(" · "),
        tone: status === "bezahlt" ? "emerald" : status === "teilbezahlt" ? "amber" : "rose",
        payment,
      });
    }

    for (const document of documents) {
      if (!document.ablaufdatum) continue;
      list.push({
        id: `d:${document.id}`,
        kind: "document",
        date: document.ablaufdatum,
        title: document.filename || "Dokument",
        subtitle: `Ablauf ${fmtDate(document.ablaufdatum)}`,
        tone: "fuchsia",
        document,
      });
    }

    return list.sort((a, b) => +parseDateLike(a.date) - +parseDateLike(b.date));
  }, [appointments, payments, documents]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = localDayKey(item.date);
      if (!key) continue;
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    }
    for (const value of map.values()) {
      value.sort((a, b) => +parseDateLike(a.date) - +parseDateLike(b.date));
    }
    return map;
  }, [items]);

  const monthLabel = cursor.toLocaleString("de-DE", { month: "long", year: "numeric" });
  const firstDayIdx = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDayIdx).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];

  const todayKey = localDayKey(new Date());
  const selectedDate = dayKeyToDate(selectedKey);
  const selectedItems = itemsByDay.get(selectedKey) || [];
  const upcoming = useMemo(() => {
    const now = Date.now() - 24 * 60 * 60 * 1000;
    return items
      .filter((item) => +parseDateLike(item.date) >= now)
      .slice(0, 12);
  }, [items]);

  const counts = useMemo(() => {
    const all = itemsByDay.get(selectedKey) || [];
    return all.reduce(
      (acc, item) => {
        acc[item.kind] += 1;
        return acc;
      },
      { appointment: 0, payment: 0, document: 0 },
    );
  }, [itemsByDay, selectedKey]);

  const totalUpcomingPayments = useMemo(
    () => payments.filter((payment) => payment.status !== "bezahlt").length,
    [payments],
  );

  const goMonth = (delta: number) => {
    const currentDay = Number(selectedKey.slice(8, 10)) || 1;
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1, 12, 0, 0, 0);
    const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const clampedDay = Math.min(currentDay, maxDay);
    setCursor(next);
    setSelectedKey(localDayKey(new Date(next.getFullYear(), next.getMonth(), clampedDay, 12, 0, 0, 0)));
  };

  const openNewAppointment = () => setEditor({ kind: "appointment", mode: "new", dayKey: selectedKey, item: undefined });
  const openNewPayment = () => setEditor({ kind: "payment", mode: "new", dayKey: selectedKey, item: undefined });
  const jumpToToday = () => {
    const d = new Date();
    d.setDate(1);
    d.setHours(12, 0, 0, 0);
    setCursor(d);
    setSelectedKey(todayKey);
  };

  const toggleAppointmentDone = async (appointment: Appointment) => {
    setBusyId(appointment.id);
    try {
      await saveAppointment({ ...appointment, done: !appointment.done });
      refresh();
      toast.success(appointment.done ? "Termin wieder offen" : "Termin erledigt");
    } catch (err: any) {
      toast.error(err?.message || "Termin konnte nicht gespeichert werden");
    } finally {
      setBusyId(null);
    }
  };

  const markPaymentPaid = async (payment: PaymentEntry) => {
    setBusyId(payment.id);
    try {
      const paidSum = payment.paid?.reduce((sum, entry) => sum + entry.amount, 0) || 0;
      const remaining = Math.max(0, payment.betrag - paidSum);
      const paid = remaining > 0
        ? [...(payment.paid || []), { date: new Date().toISOString(), amount: remaining }]
        : payment.paid || [];

      await savePayment({
        ...payment,
        paid,
        status: "bezahlt",
      });
      refresh();
      toast.success("Zahlung als bezahlt markiert");
    } catch (err: any) {
      toast.error(err?.message || "Zahlung konnte nicht gespeichert werden");
    } finally {
      setBusyId(null);
    }
  };

  const deleteItem = async (item: CalendarItem) => {
    const confirmText = item.kind === "payment"
      ? `Zahlung "${item.title}" wirklich löschen?`
      : item.kind === "appointment"
        ? `Termin "${item.title}" wirklich löschen?`
        : `Dokument "${item.title}" wirklich löschen?`;
    if (!window.confirm(confirmText)) return;

    setBusyId(item.id);
    try {
      if (item.kind === "payment" && item.payment) {
        await deletePayment(item.payment.id);
        toast.success("Zahlung gelöscht");
      } else if (item.kind === "appointment" && item.appointment) {
        await deleteAppointment(item.appointment.id);
        toast.success("Termin gelöscht");
      } else if (item.kind === "document" && item.document) {
        await deleteDocument(item.document.id);
        toast.success("Dokument gelöscht");
      }
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Eintrag konnte nicht gelöscht werden");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Termine</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Termine, Zahlungen und Fristen in einem Kalender. Direkt ansehen, bearbeiten, löschen und neu anlegen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={jumpToToday}
              className="rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium transition hover:bg-muted">
              Heute
            </button>
            <button type="button" onClick={openNewAppointment}
              className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20">
              + Termin
            </button>
            <button type="button" onClick={openNewPayment}
              className="rounded-full border border-rose-400/40 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20">
              + Zahlung
            </button>
            <button type="button" onClick={refresh}
              className="rounded-full border border-border bg-background/60 px-4 py-2 text-sm font-medium transition hover:bg-muted">
              Aktualisieren
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:min-w-[22rem]">
          <SummaryCard label="Offen" value={String(totalUpcomingPayments)} tone="rose" />
          <SummaryCard label="Gewählt" value={fmtDate(selectedDate)} tone="cyan" />
          <SummaryCard label="Heute" value={String(counts.appointment + counts.payment + counts.document)} tone="emerald" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)]">
        <section className="glass border-glow rounded-2xl p-3 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>
              <p className="hidden sm:block text-xs text-muted-foreground">Monatsansicht mit Markierungen für Termine, Zahlungen und Fristen.</p>
            </div>
            <div className="flex gap-1">
              <NavIconButton onClick={() => goMonth(-1)} label="Vorheriger Monat">
                <ChevronLeft className="h-4 w-4" />
              </NavIconButton>
              <NavIconButton onClick={() => goMonth(1)} label="Nächster Monat">
                <ChevronRight className="h-4 w-4" />
              </NavIconButton>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => <div key={label}>{label}</div>)}
          </div>

          <motion.div key={monthLabel} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
            {cells.map((day, index) => {
              if (!day) return <div key={index} />;
              const dayKey = localDayKey(new Date(cursor.getFullYear(), cursor.getMonth(), day, 12, 0, 0, 0));
              const dayItems = itemsByDay.get(dayKey) || [];
              const kindCounts = dayItems.reduce(
                (acc, item) => {
                  acc[item.kind] += 1;
                  return acc;
                },
                { appointment: 0, payment: 0, document: 0 },
              );
              const isToday = dayKey === todayKey;
              const isSelected = dayKey === selectedKey;
              const total = dayItems.length;

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedKey(dayKey)}
                  className={`relative flex aspect-square flex-col rounded-lg sm:rounded-xl border p-1 sm:p-2 text-left text-xs transition hover:bg-muted/60 ${
                    isSelected ? "border-primary bg-primary/5" : "border-border/50 glass"
                  } ${isToday ? "ring-1 ring-primary/30" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] sm:text-sm leading-none ${isToday ? "font-bold text-primary" : ""}`}>{day}</span>
                    {total > 0 && (
                      <span className="hidden sm:inline-block rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {total}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto hidden sm:flex flex-wrap gap-1">
                    {kindCounts.appointment > 0 && <DayChip tone="cyan" label={`T ${kindCounts.appointment}`} />}
                    {kindCounts.payment > 0 && <DayChip tone="rose" label={`Z ${kindCounts.payment}`} />}
                    {kindCounts.document > 0 && <DayChip tone="fuchsia" label={`F ${kindCounts.document}`} />}
                  </div>
                  <div className="mt-auto sm:hidden flex gap-0.5 flex-wrap">
                    {kindCounts.appointment > 0 && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
                    {kindCounts.payment > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                    {kindCounts.document > 0 && <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />}
                  </div>
                </button>
              );
            })}
          </motion.div>
        </section>

        <aside className="space-y-6">
          <section className="glass border-glow rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{selectedDate.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedItems.length === 0
                    ? "Keine Einträge an diesem Tag."
                    : `${selectedItems.length} Einträge an diesem Tag`}
                </p>
              </div>
              <div className="flex gap-1">
                <NavIconButton onClick={openNewAppointment} label="Neuen Termin an diesem Tag anlegen">
                  <Plus className="h-4 w-4" />
                </NavIconButton>
                <NavIconButton onClick={openNewPayment} label="Neue Zahlung an diesem Tag anlegen">
                  <Wallet className="h-4 w-4" />
                </NavIconButton>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <EventGroup
                title="Termine"
                count={counts.appointment}
                items={selectedItems.filter((item) => item.kind === "appointment")}
                onEdit={(item) => item.appointment && setEditor({ kind: "appointment", mode: "edit", dayKey: selectedKey, item: item.appointment })}
                onDelete={deleteItem}
                onToggleDone={toggleAppointmentDone}
                onMarkPaid={markPaymentPaid}
                busyId={busyId}
              />
              <EventGroup
                title="Zahlungen"
                count={counts.payment}
                items={selectedItems.filter((item) => item.kind === "payment")}
                onEdit={(item) => item.payment && setEditor({ kind: "payment", mode: "edit", dayKey: selectedKey, item: item.payment })}
                onDelete={deleteItem}
                onToggleDone={toggleAppointmentDone}
                onMarkPaid={markPaymentPaid}
                busyId={busyId}
              />
              <EventGroup
                title="Fristen"
                count={counts.document}
                items={selectedItems.filter((item) => item.kind === "document")}
                onEdit={(item) => item.document && setEditor({ kind: "document", mode: "edit", dayKey: selectedKey, item: item.document })}
                onDelete={deleteItem}
                onToggleDone={toggleAppointmentDone}
                onMarkPaid={markPaymentPaid}
                busyId={busyId}
              />
            </div>
          </section>

          <section className="glass border-glow rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Bald anstehend</h3>
                <p className="text-xs text-muted-foreground">Die nächsten Einträge quer über alle Kategorien.</p>
              </div>
              <button type="button" onClick={refresh} className="text-xs text-primary hover:text-cyan-300">
                Neu laden
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {upcoming.length === 0 && (
                <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
                  Keine kommenden Einträge.
                </div>
              )}
              {upcoming.map((item) => (
                <TimelineRow
                  key={item.id}
                  item={item}
                  compact
                  onEdit={
                    item.kind === "appointment"
                      ? () => item.appointment && setEditor({ kind: "appointment", mode: "edit", dayKey: localDayKey(item.date), item: item.appointment })
                      : item.kind === "payment"
                        ? () => item.payment && setEditor({ kind: "payment", mode: "edit", dayKey: localDayKey(item.date), item: item.payment })
                        : () => item.document && setEditor({ kind: "document", mode: "edit", dayKey: localDayKey(item.date), item: item.document })
                  }
                  onDelete={() => deleteItem(item)}
                  onToggleDone={item.kind === "appointment" ? () => item.appointment && toggleAppointmentDone(item.appointment) : undefined}
                  onMarkPaid={item.kind === "payment" ? () => item.payment && markPaymentPaid(item.payment) : undefined}
                  busy={isBusyItem(item, busyId)}
                />
              ))}
            </div>
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {editor && (
          <EntryEditorModal
            target={editor}
            onClose={() => setEditor(null)}
            onSaved={async () => {
              setEditor(null);
              refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "cyan" | "rose" | "emerald" }) {
  const toneClass = {
    cyan: "from-cyan-400/20 to-cyan-500/5 text-cyan-100",
    rose: "from-rose-400/20 to-rose-500/5 text-rose-100",
    emerald: "from-emerald-400/20 to-emerald-500/5 text-emerald-100",
  }[tone];

  return (
    <div className={`rounded-2xl border border-border/60 bg-gradient-to-br p-2 sm:p-4 ${toneClass}`}>
      <div className="text-[9px] sm:text-[11px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
      <div className="mt-0.5 sm:mt-1 text-sm sm:text-lg font-semibold leading-tight truncate">{value}</div>
    </div>
  );
}

function DayChip({ label, tone }: { label: string; tone: "cyan" | "rose" | "fuchsia" }) {
  const toneClass = {
    cyan: "bg-cyan-500/15 text-cyan-200",
    rose: "bg-rose-500/15 text-rose-200",
    fuchsia: "bg-fuchsia-500/15 text-fuchsia-200",
  }[tone];
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${toneClass}`}>{label}</span>;
}

function NavIconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background/60 text-foreground transition hover:bg-muted"
    >
      {children}
    </button>
  );
}

function EventGroup({
  title,
  count,
  items,
  onEdit,
  onDelete,
  onToggleDone,
  onMarkPaid,
  busyId,
  readOnly,
}: {
  title: string;
  count: number;
  items: CalendarItem[];
  onEdit?: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
  onToggleDone: (appointment: Appointment) => void;
  onMarkPaid: (payment: PaymentEntry) => void;
  busyId: string | null;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        <div className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
          {count}
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Keine Einträge.
          </div>
        )}
        {items.map((item) => (
          <TimelineRow
            key={item.id}
            item={item}
            onEdit={onEdit ? () => onEdit(item) : undefined}
            onDelete={readOnly ? undefined : () => onDelete(item)}
            onToggleDone={item.kind === "appointment" && item.appointment ? () => onToggleDone(item.appointment!) : undefined}
            onMarkPaid={item.kind === "payment" && item.payment ? () => onMarkPaid(item.payment!) : undefined}
            busy={isBusyItem(item, busyId)}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineRow({
  item,
  compact = false,
  onEdit,
  onDelete,
  onToggleDone,
  onMarkPaid,
  busy,
}: {
  item: CalendarItem;
  compact?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleDone?: () => void;
  onMarkPaid?: () => void;
  busy?: boolean;
}) {
  const Icon = eventIcon(item);
  const dueLabel = item.kind === "payment" ? relativeDueLabel(item.date) : "";
  const statusLabel = item.kind === "payment"
    ? item.payment?.status || "offen"
    : item.kind === "appointment"
      ? item.appointment?.done ? "erledigt" : item.appointment?.typ || "Termin"
      : "Frist";

  const clickable = Boolean(onEdit);

  return (
    <div
      className={`group rounded-xl border border-border/60 bg-background/50 ${compact ? "p-2.5" : "p-3"} transition hover:bg-muted/40 ${clickable ? "cursor-pointer hover:border-primary/30" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onEdit : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEdit?.();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${eventColorClass(item)}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm font-medium ${item.kind === "appointment" && item.appointment?.done ? "line-through text-muted-foreground" : ""}`}>
            {item.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{item.kind === "appointment" ? fmtDateTime(item.date) : fmtDate(item.date)}</span>
            <span>·</span>
            <span>{item.subtitle}</span>
            {dueLabel && (
              <>
                <span>·</span>
                <span>{dueLabel}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {statusLabel}
          </span>
          {onToggleDone && (
            <button
              type="button"
              onClick={onToggleDone}
              disabled={busy}
              className={`grid h-7 w-7 place-items-center rounded-lg ${item.appointment?.done ? "bg-emerald-500/20 text-emerald-300" : "glass"} disabled:opacity-60`}
              aria-label="Erledigt umschalten"
              title="Erledigt umschalten"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          {onMarkPaid && item.kind === "payment" && item.payment?.status !== "bezahlt" && (
            <button
              type="button"
              onClick={onMarkPaid}
              disabled={busy}
              className="rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 disabled:opacity-60"
            >
              Bezahlt
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              disabled={busy}
              className="grid h-7 w-7 place-items-center rounded-lg text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
              aria-label="Löschen"
              title="Löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              disabled={busy}
              className="grid h-7 w-7 place-items-center rounded-lg glass disabled:opacity-60"
              aria-label="Bearbeiten"
              title="Bearbeiten"
            >
              <PencilLine className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EntryEditorModal({
  target,
  onClose,
  onSaved,
}: {
  target: EditorTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isPayment = target.kind === "payment";
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(
    target.kind === "payment"
      ? target.item?.absender || ""
      : target.kind === "appointment"
        ? target.item?.titel || ""
        : target.item.filename || ""
  );
  const [dateTime, setDateTime] = useState(
    target.kind === "payment"
      ? toDateInput(target.item?.faelligkeit || target.dayKey)
      : target.kind === "appointment"
        ? toDateTimeInput(target.item?.datum || defaultDateTimeForDay(target.dayKey))
        : toDateInput(target.item.dueDate || target.item.faelligkeitsdatum || target.item.ablaufdatum || target.dayKey),
  );
  const [type, setType] = useState<Appointment["typ"]>(target.kind === "appointment" ? (target.item?.typ || "erinnerung") : "erinnerung");
  const [note, setNote] = useState(
    target.kind === "appointment"
      ? (target.item?.notiz || "")
      : target.kind === "payment"
        ? (target.item?.beschreibung || "")
        : (target.item.reminderNote || "")
  );
  const [folderPath, setFolderPath] = useState(target.kind === "document" ? (target.item.folderPath || "") : "");
  const [amount, setAmount] = useState(target.kind === "payment" ? String(target.item?.betrag ?? "") : "");
  const [status, setStatus] = useState<PaymentEntry["status"]>(target.kind === "payment" ? (target.item?.status || "offen") : "offen");
  const [done, setDone] = useState(target.kind === "appointment" ? Boolean(target.item?.done) : false);
  const [reminderEnabled, setReminderEnabled] = useState(target.kind === "payment" ? target.item?.reminderEnabled !== false : true);
  const [expiryDate, setExpiryDate] = useState(target.kind === "document" ? toDateInput(target.item.ablaufdatum || target.item.faelligkeitsdatum || target.item.dueDate || target.dayKey) : "");

  const save = async () => {
    setSaving(true);
    try {
      if (target.kind === "appointment") {
        const next: Appointment = {
          id: target.item?.id || uid(),
          titel: title.trim(),
          datum: new Date(dateTime).toISOString(),
          typ: type,
          notiz: note.trim(),
          documentId: target.item?.documentId ?? null,
          done,
        };
        await saveAppointment(next);
        toast.success(target.mode === "new" ? "Termin gespeichert" : "Termin aktualisiert");
      } else if (target.kind === "payment") {
        const existing = target.item;
        const paid = existing?.paid || [];
        const next: PaymentEntry = {
          id: existing?.id || uid(),
          documentId: existing?.documentId ?? null,
          absender: title.trim(),
          beschreibung: note.trim(),
          betrag: Number(amount) || 0,
          faelligkeit: new Date(dateTime).toISOString(),
          status,
          paid,
          createdAt: existing?.createdAt || new Date().toISOString(),
          kategorie: existing?.kategorie,
          reminderEnabled,
          reminder1dSentAt: existing?.reminder1dSentAt ?? null,
          reminderSameDaySentAt: existing?.reminderSameDaySentAt ?? null,
          reminderChannel: existing?.reminderChannel ?? null,
        };
        await savePayment(next);
        toast.success(target.mode === "new" ? "Zahlung gespeichert" : "Zahlung aktualisiert");
      } else {
        await patchDocument(target.item.id, {
          filename: title.trim(),
          folderPath: folderPath.trim() || undefined,
          dueDate: dateTime ? new Date(dateTime).toISOString() : null,
          ablaufdatum: expiryDate ? new Date(expiryDate).toISOString() : null,
          reminderNote: note.trim(),
        });
        toast.success("Dokument aktualisiert");
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Eintrag konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const confirmText = target.kind === "payment"
      ? `Zahlung "${target.item.absender}" wirklich löschen?`
      : target.kind === "appointment"
        ? `Termin "${target.item.titel}" wirklich löschen?`
        : `Dokument "${target.item.filename}" wirklich löschen?`;
    if (!window.confirm(confirmText)) return;

    try {
      if (target.kind === "payment") {
        await deletePayment(target.item.id);
        toast.success("Zahlung gelöscht");
      } else if (target.kind === "document") {
        await deleteDocument(target.item.id);
        toast.success("Dokument gelöscht");
      } else {
        await deleteAppointment(target.item.id);
        toast.success("Termin gelöscht");
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Eintrag konnte nicht gelöscht werden");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 8 }}
        className="glass-strong w-full max-w-2xl overflow-hidden rounded-2xl border-glow"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">{editorTitle(target)}</h3>
            <p className="text-xs text-muted-foreground">
              {target.kind === "appointment"
                ? "Termin im Kalender bearbeiten"
                : "Zahlung und Erinnerungsdaten bearbeiten"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted" aria-label="Schließen">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await save();
            }}
          >
            {target.kind === "appointment" ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Titel">
                    <input
                      required
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className={inputCls}
                      placeholder="z. B. TÜV, Arzttermin, Erinnerung"
                    />
                  </Field>
                  <Field label="Datum & Uhrzeit">
                    <input
                      type="datetime-local"
                      value={dateTime}
                      onChange={(event) => setDateTime(event.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Art">
                    <select value={type} onChange={(event) => setType(event.target.value as Appointment["typ"])} className={inputCls}>
                      <option value="erinnerung">Erinnerung</option>
                      <option value="zahlung">Zahlung</option>
                      <option value="sonstiges">Sonstiges</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-input/40 px-3 text-sm">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={(event) => setDone(event.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                      Erledigt
                    </label>
                  </Field>
                </div>

                <Field label="Notiz">
                  <textarea
                    rows={4}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={inputCls}
                    placeholder="Zusätzliche Informationen, Ansprechpartner oder Hinweise"
                  />
                </Field>
              </>
            ) : target.kind === "payment" ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Absender">
                    <input
                      required
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className={inputCls}
                      placeholder="z. B. Versicherung, Vermieter, Stromanbieter"
                    />
                  </Field>
                  <Field label="Fälligkeit">
                    <input
                      type="date"
                      value={dateTime}
                      onChange={(event) => setDateTime(event.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Betrag (€)">
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Status">
                    <select value={status} onChange={(event) => setStatus(event.target.value as PaymentEntry["status"])} className={inputCls}>
                      <option value="offen">Offen</option>
                      <option value="teilbezahlt">Teilbezahlt</option>
                      <option value="bezahlt">Bezahlt</option>
                    </select>
                  </Field>
                </div>

                <Field label="Beschreibung">
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={inputCls}
                    placeholder="Rechnungszweck, Vertragsnummer oder Notiz"
                  />
                </Field>

                <label className="flex items-center gap-2 rounded-lg border border-border bg-input/40 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(event) => setReminderEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Zahlungserinnerung aktiv
                </label>
              </>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Dateiname">
                    <input
                      required
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className={inputCls}
                      placeholder="Dokumentname"
                    />
                  </Field>
                  <Field label="Ordnerpfad">
                    <input
                      value={folderPath}
                      onChange={(event) => setFolderPath(event.target.value)}
                      className={inputCls}
                      placeholder="z. B. 01_Fahrzeug/TÜV & HU"
                    />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Fälligkeitsdatum">
                    <input
                      type="date"
                      value={dateTime}
                      onChange={(event) => setDateTime(event.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Ablaufdatum">
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(event) => setExpiryDate(event.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Hinweis">
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={inputCls}
                    placeholder="Notiz oder Erinnerungsdetails"
                  />
                </Field>
              </>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                {target.item && (
                  <button
                    type="button"
                    onClick={remove}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100"
                  >
                    Löschen
                  </button>
                )}
              </div>
              <div className="flex gap-2 sm:justify-end">
                <button type="button" onClick={onClose} className="rounded-lg glass px-4 py-2 text-sm">
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? "Speichert..." : "Speichern"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm outline-none focus:border-primary";
