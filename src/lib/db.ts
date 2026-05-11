import { openDB, type IDBPDatabase } from "idb";

export type Importance = "hoch" | "mittel" | "niedrig";

export interface AnalysisHint {
  value: string | number | null;
  ruleId: string;
  sourceText: string;
  confidence: number;
}

export interface LayoutPageImage {
  pageNumber: number;
  imagePath: string;
  width: number;
  height: number;
}

export interface LayoutAnalysisInput {
  filename: string;
  mimeType: string;
  pageCount: number;
  extractedText: string;
  regexAnalysis: Record<string, unknown>;
  pageImages: LayoutPageImage[];
}

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
  analysisHints?: Record<string, AnalysisHint | null>;
  regexAnalysis?: Record<string, unknown>;
  aiAnalysis?: Record<string, unknown> | null;
  visionAnalysis?: Record<string, unknown> | null;
  finalAnalysis?: Record<string, unknown>;
  layoutAnalysisInput?: LayoutAnalysisInput | Record<string, unknown> | null;
  reviewStatus?: "auto_ready" | "review_required" | "analysis_failed";
  reviewReason?: string | null;
  shouldAutoArchive?: boolean;
  analysisMode?: "llm" | "regex" | "regex_ai" | "regex_vision_ai" | "regex_vision_fallback" | "fallback";
  confidence?: number | null;
  wichtigkeitsgrund?: string | null;
  status?: "uploaded" | "analyzed" | "review" | "archived" | "failed" | "deleted";
  storageLocation?: string | null;
  // file blob stored separately
}

export interface DocumentText {
  extracted_text: string;
  ocr_engine: string;
}

export interface DocumentDetails {
  document: ArchivedDoc;
  text: DocumentText | null;
}

export interface DocumentStatusSummary {
  total: number;
  analyzed: number;
  review: number;
  archived: number;
  deleted: number;
  visible: number;
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
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/documents", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        return (data.documents || []) as ArchivedDoc[];
      }
    } catch {
      // Fallback to legacy browser archive below.
    }
  }
  const db = await getDB();
  return (await db.getAll("documents")) as ArchivedDoc[];
}

export async function getDocumentStatusSummary(): Promise<DocumentStatusSummary> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/documents/summary", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        return data.summary as DocumentStatusSummary;
      }
    } catch {
      // Fallback to legacy browser archive below.
    }
  }
  const db = await getDB();
  const documents = (await db.getAll("documents")) as ArchivedDoc[];
  const counts = documents.reduce((acc, doc) => {
    acc.total += 1;
    if (doc.status === "analyzed") acc.analyzed += 1;
    else if (doc.status === "review") acc.review += 1;
    else if (doc.status === "archived") acc.archived += 1;
    else if (doc.status === "deleted") acc.deleted += 1;
    return acc;
  }, { total: 0, analyzed: 0, review: 0, archived: 0, deleted: 0 });
  return { ...counts, visible: counts.total - counts.deleted };
}
export async function getDocumentBlob(id: string): Promise<Blob | undefined> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}/file`, { credentials: "include" });
      if (res.ok) return await res.blob();
    } catch {
      // Fallback to legacy browser archive below.
    }
  }
  const db = await getDB();
  return (await db.get("blobs", id)) as Blob | undefined;
}
export async function getDocumentDetails(id: string): Promise<DocumentDetails | null> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        return {
          document: data.document as ArchivedDoc,
          text: data.text || null,
        };
      }
    } catch {
      // Fallback to legacy browser archive below.
    }
  }
  const db = await getDB();
  const document = (await db.get("documents", id)) as ArchivedDoc | undefined;
  return document ? { document, text: null } : null;
}
export async function deleteDocument(id: string) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) return;
    } catch {
      // Fallback to legacy browser archive below.
    }
  }
  const db = await getDB();
  const tx = db.transaction(["documents", "blobs"], "readwrite");
  await tx.objectStore("documents").delete(id);
  await tx.objectStore("blobs").delete(id);
  await tx.done;
}
export async function patchDocument(id: string, patch: Partial<ArchivedDoc>) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return (data.document || null) as ArchivedDoc | null;
      throw new Error(data?.error || "Dokument konnte nicht gespeichert werden");
    } catch {
      // Fallback to legacy browser archive below.
    }
  }
  const db = await getDB();
  const current = (await db.get("documents", id)) as ArchivedDoc | undefined;
  const next = { ...(current ?? ({ id } as ArchivedDoc)), ...patch, id } as ArchivedDoc;
  await db.put("documents", next);
  return next;
}
export async function updateDocument(doc: ArchivedDoc) {
  return patchDocument(doc.id, doc);
}

// Payments
export async function listPayments(): Promise<PaymentEntry[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/payments", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        return (data.payments || []) as PaymentEntry[];
      }
    } catch {
      // Fallback to legacy browser payments below.
    }
  }
  const db = await getDB();
  return (await db.getAll("payments")) as PaymentEntry[];
}
export async function savePayment(p: PaymentEntry) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (res.ok) return;
    } catch {
      // Fallback to legacy browser payments below.
    }
  }
  const db = await getDB();
  await db.put("payments", p);
}
export async function deletePayment(id: string) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/payments/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) return;
    } catch {
      // Fallback to legacy browser payments below.
    }
  }
  const db = await getDB();
  await db.delete("payments", id);
}

// Appointments
export async function listAppointments(): Promise<Appointment[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/appointments", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        return (data.appointments || []) as Appointment[];
      }
    } catch {
      // Fallback to legacy browser appointments below.
    }
  }
  const db = await getDB();
  return (await db.getAll("appointments")) as Appointment[];
}
export async function saveAppointment(a: Appointment) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      if (res.ok) return;
    } catch {
      // Fallback to legacy browser appointments below.
    }
  }
  const db = await getDB();
  await db.put("appointments", a);
}
export async function deleteAppointment(id: string) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/appointments/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) return;
    } catch {
      // Fallback to legacy browser appointments below.
    }
  }
  const db = await getDB();
  await db.delete("appointments", id);
}
