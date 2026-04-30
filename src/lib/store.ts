import { useEffect, useState, useCallback } from "react";
import {
  listDocuments, listPayments, listAppointments,
  type ArchivedDoc, type PaymentEntry, type Appointment,
} from "./db";

/** Module-level cache + subscriber pattern so all tabs stay in sync. */
let cache = {
  documents: [] as ArchivedDoc[],
  payments: [] as PaymentEntry[],
  appointments: [] as Appointment[],
  loaded: false,
};
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export async function refreshAll() {
  if (typeof window === "undefined") return;
  const [documents, payments, appointments] = await Promise.all([
    listDocuments(), listPayments(), listAppointments(),
  ]);
  cache = { documents, payments, appointments, loaded: true };
  notify();
}

export function useArchive() {
  const [, setV] = useState(0);

  useEffect(() => {
    const f = () => setV((v) => v + 1);
    subs.add(f);
    if (!cache.loaded) refreshAll();
    return () => { subs.delete(f); };
  }, []);

  const refresh = useCallback(() => refreshAll(), []);
  return { ...cache, refresh };
}