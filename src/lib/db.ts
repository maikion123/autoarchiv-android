import { openDB, type IDBPDatabase } from "idb";

export type Importance = "hoch" | "mittel" | "niedrig";

export interface ArchivedDoc {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  folderPath: string;     // e.g. "01_Fahrzeug/TÜV & HU"
  uploadedAt: string;     // ISO
  absender: string;
  dokumenttyp: string;
  zusammenfassung: string;
  zahlungsbetrag: number | null;
  faelligkeitsdatum: string | null;
  ablaufdatum: string | null;
  wichtigkeit: Importance;
  tags: string[];
  // file blob stored separately
}

export interface PaymentEntry {
  id: string;
  documentId?: string | null;
  absender: string;
  beschreibung: string;
  betrag: number;
  faelligkeit: string;     // ISO date
  status: "offen" | "teilbezahlt" | "bezahlt";
  paid: { date: string; amount: number; note?: string }[];
  createdAt: string;
  kategorie?: string;
}

export interface Appointment {
  id: string;
  titel: string;
  datum: string; // ISO
  typ: "zahlung" | "erinnerung" | "sonstiges";
  notiz?: string;
  documentId?: string | null;
  done?: boolean;
}

const DB_NAME = "autoarchiv";
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDB() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB only in browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
        if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
        if (!db.objectStoreNames.contains("payments")) db.createObjectStore("payments", { keyPath: "id" });
        if (!db.objectStoreNames.contains("appointments")) db.createObjectStore("appointments", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// Documents
export async function saveDocument(doc: ArchivedDoc, blob: Blob) {
  const db = await getDB();
  const tx = db.transaction(["documents", "blobs"], "readwrite");
  await tx.objectStore("documents").put(doc);
  await tx.objectStore("blobs").put(blob, doc.id);
  await tx.done;
}
export async function listDocuments(): Promise<ArchivedDoc[]> {
  const db = await getDB();
  return (await db.getAll("documents")) as ArchivedDoc[];
}
export async function getDocumentBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  return (await db.get("blobs", id)) as Blob | undefined;
}
export async function deleteDocument(id: string) {
  const db = await getDB();
  const tx = db.transaction(["documents", "blobs"], "readwrite");
  await tx.objectStore("documents").delete(id);
  await tx.objectStore("blobs").delete(id);
  await tx.done;
}
export async function updateDocument(doc: ArchivedDoc) {
  const db = await getDB();
  await db.put("documents", doc);
}

// Payments
export async function listPayments(): Promise<PaymentEntry[]> {
  const db = await getDB();
  return (await db.getAll("payments")) as PaymentEntry[];
}
export async function savePayment(p: PaymentEntry) {
  const db = await getDB();
  await db.put("payments", p);
}
export async function deletePayment(id: string) {
  const db = await getDB();
  await db.delete("payments", id);
}

// Appointments
export async function listAppointments(): Promise<Appointment[]> {
  const db = await getDB();
  return (await db.getAll("appointments")) as Appointment[];
}
export async function saveAppointment(a: Appointment) {
  const db = await getDB();
  await db.put("appointments", a);
}
export async function deleteAppointment(id: string) {
  const db = await getDB();
  await db.delete("appointments", id);
}