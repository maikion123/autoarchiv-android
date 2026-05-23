import { useEffect, useState, useCallback } from "react";
import {
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

async function fetchServerCollection<T>(path: string, key: string): Promise<T[]> {
  const res = await fetch(path, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`${key} konnte nicht geladen werden`);
  }
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.[key]) ? (data[key] as T[]) : [];
}

export async function refreshAll() {
  if (typeof window === "undefined") return;
  const [documentsResult, paymentsResult, appointmentsResult] = await Promise.allSettled([
    fetchServerCollection<ArchivedDoc>("/api/documents", "documents"),
    fetchServerCollection<PaymentEntry>("/api/payments", "payments"),
    fetchServerCollection<Appointment>("/api/appointments", "appointments"),
  ]);

  const next = { ...cache };
  let changed = false;

  if (documentsResult.status === "fulfilled") {
    next.documents = documentsResult.value;
    changed = true;
  }
  if (paymentsResult.status === "fulfilled") {
    next.payments = paymentsResult.value;
    changed = true;
  }
  if (appointmentsResult.status === "fulfilled") {
    next.appointments = appointmentsResult.value;
    changed = true;
  }

  if (changed) {
    next.loaded = true;
    cache = next;
    notify();
  }
}

export function removeDocumentsFromCache(ids: string[]) {
  const idSet = new Set(ids);
  cache = { ...cache, documents: cache.documents.filter((d) => !idSet.has(d.id)) };
  notify();
}

export function resetArchiveCache() {
  cache = {
    documents: [],
    payments: [],
    appointments: [],
    loaded: false,
  };
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
