import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAndroidBack } from "../lib/useAndroidBack";
import {
  AlertTriangle, ArrowRight, RefreshCw, ShieldCheck, Users, FileText,
  CircleCheckBig, CircleAlert, ChevronUp, ChevronDown, Plus, ScrollText,
  Loader2, FileBox, Search, Trash2, Edit3, ExternalLink, Filter,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { fmtDateTime } from "../lib/format";
import { IconPicker } from "../components/IconPicker";
import { AdminDrawer } from "../components/AdminDrawer";
import { DEFAULT_NAVIGATION_ITEMS, type NavigationItem } from "../lib/navigation";

interface AdminSummary {
  system: {
    api: string;
    ollamaAvailable: boolean;
    useOllamaAnalysis: boolean;
    layoutAnalysis: boolean;
    visionReview: boolean;
    visionModel: string | null;
  };
  users: { total: number; verified: number; admins: number };
  documents: { total: number; analyzed: number; review: number; archived: number; deleted: number };
}

interface AdminUserRow {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  reviewCount: number;
  archivedCount: number;
  lastDocumentAt: string | null;
}

interface AdminDocumentRow {
  id: string;
  userEmail: string;
  filename: string;
  folderPath: string;
  status: string;
  dueDate: string | null;
  reminderEnabled: boolean;
  reminderSentAt: string | null;
  reminderChannel: string | null;
  reminderNote: string | null;
  reviewStatus: string | null;
  reviewReason: string | null;
  shouldAutoArchive: boolean;
  confidence: number | null;
  absender: string;
  dokumenttyp: string;
  createdAt: string;
  updatedAt: string;
}

interface NavigationDraft {
  label: string;
  path: string;
  icon: string;
  section: string;
  sortOrder: number;
  roleRequired: "user" | "admin";
  visible: boolean;
  isExternal: boolean;
}

type AdminSection = "users" | "documents" | "reviews" | "navigation" | "logs";

interface AdminLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  ip: string | null;
  detail: string | null;
  created_at: string;
}

interface AdminUserDocument {
  id: string;
  filename: string;
  folder_path: string;
  status: string;
  created_at: string;
  size: number;
  mime_type: string;
}

interface AdminFolder { id: string; name: string; parent_id: string | null }

async function fetchJson(path: string) {
  const res = await fetch(path, { credentials: "include", cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || "Anfrage fehlgeschlagen");
    error.name = res.status === 403 ? "FORBIDDEN" : res.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR";
    throw error;
  }
  return data;
}

export default function AdminPage() {
  // ── state ─────────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [documents, setDocuments] = useState<AdminDocumentRow[]>([]);
  const [navigationItems, setNavigationItems] = useState<NavigationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedNavigationId, setSelectedNavigationId] = useState<string | null>(null);
  const [navigationDraftOpen, setNavigationDraftOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserEmail, setDeleteUserEmail] = useState("");
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [userDraft, setUserDraft] = useState<{ role: "admin" | "user"; emailVerified: boolean }>({
    role: "user",
    emailVerified: false,
  });
  const [documentDraft, setDocumentDraft] = useState({
    folderPath: "",
    status: "analyzed",
    dueDate: "",
    reviewStatus: "review_required",
    reviewReason: "",
    confidence: "",
    shouldAutoArchive: false,
    reminderEnabled: false,
    reminderNote: "",
  });
  const [savingUser, setSavingUser] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [savingNavigation, setSavingNavigation] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>("documents");
  const [userSearch, setUserSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsAction, setLogsAction] = useState("");
  const [userDocuments, setUserDocuments] = useState<AdminUserDocument[]>([]);
  const [userDocumentsLoading, setUserDocumentsLoading] = useState(false);
  const [adminFolders, setAdminFolders] = useState<AdminFolder[]>([]);
  const [showDocDeleteConfirm, setShowDocDeleteConfirm] = useState(false);
  const [docDeleteId, setDocDeleteId] = useState<string | null>(null);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [navigationDraft, setNavigationDraft] = useState<NavigationDraft>({
    label: "",
    path: "",
    icon: "LayoutDashboard",
    section: "main",
    sortOrder: 10,
    roleRequired: "user",
    visible: true,
    isExternal: false,
  });

  // ── delete confirm helpers ───────────────────────────────────────────────
  const openDeleteConfirm = (userId: string, email: string) => {
    setDeleteUserId(userId);
    setDeleteUserEmail(email);
    setShowDeleteConfirm(true);
  };
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteUserId(null);
    setDeleteUserEmail("");
    setDeleteConfirmInput("");
  };
  const handleDeleteUser = async () => {
    if (!deleteUserId || deleteConfirmInput !== deleteUserEmail) return;
    try {
      const res = await fetch(`/api/admin/users/${deleteUserId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Löschung fehlgeschlagen");
      cancelDelete();
      if (selectedUserId === deleteUserId) { setSelectedUserId(null); setUserDocuments([]); }
      await load({ silent: true });
    } catch (err: any) {
      setError(err?.message || "Löschung fehlgeschlagen");
      cancelDelete();
    }
  };

  // ── data loaders ─────────────────────────────────────────────────────────
  const load = async ({ silent = false } = {}) => {
    try {
      if (!silent) setRefreshing(true);
      setError("");
      const [summaryData, usersData, allDocsData, navData] = await Promise.all([
        fetchJson("/api/admin/summary"),
        fetchJson("/api/admin/users"),
        fetchJson("/api/admin/documents?limit=1000"),
        fetchJson("/api/admin/navigation"),
      ]);
      setSummary(summaryData as AdminSummary);
      setUsers((usersData.users || []) as AdminUserRow[]);
      setNavigationItems((navData.items || DEFAULT_NAVIGATION_ITEMS) as NavigationItem[]);
      setDocuments((allDocsData.documents || []) as AdminDocumentRow[]);
    } catch (err: any) {
      if (err?.name === "FORBIDDEN") {
        setAccessDenied(true);
        setSummary(null);
        setUsers([]);
        setDocuments([]);
        return;
      }
      setError(err?.message || "Admin-Daten konnten nicht geladen werden");
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  };

  const loadLogs = async (action = "") => {
    setLogsLoading(true);
    try {
      const url = action
        ? `/api/admin/logs?action=${encodeURIComponent(action)}&limit=100`
        : "/api/admin/logs?limit=100";
      const data = await fetchJson(url);
      setLogs(data.logs || []);
      setLogsTotal(Number(data.total || 0));
    } catch { /* noop */ }
    finally { setLogsLoading(false); }
  };

  const loadUserDocuments = async (userId: string) => {
    setUserDocumentsLoading(true);
    setUserDocuments([]);
    try {
      const data = await fetchJson(`/api/admin/users/${userId}/documents?limit=20`);
      setUserDocuments(data.documents || []);
    } catch { /* noop */ }
    finally { setUserDocumentsLoading(false); }
  };

  const loadAdminFolders = async () => {
    try {
      const data = await fetchJson("/api/admin/folders");
      setAdminFolders(data.folders || []);
    } catch { /* noop */ }
  };

  // Android back button handlers
  useAndroidBack(!!selectedUserId, () => { setSelectedUserId(null); setUserDocuments([]); });
  useAndroidBack(!!selectedDocumentId, () => setSelectedDocumentId(null));
  useAndroidBack(!!selectedNavigationId, () => setSelectedNavigationId(null));

  // ── bootstrap ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setLoading(true);
      setAccessDenied(false);
      try {
        const me = await fetchJson("/api/auth/me");
        if (cancelled) return;
        if (me?.role !== "admin") {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
        await load({ silent: true });
      } catch (err: any) {
        if (cancelled) return;
        if (err?.name === "UNAUTHORIZED") {
          setAccessDenied(true);
          setLoading(false);
          return;
        }
        setError(err?.message || "Admin-Daten konnten nicht geladen werden");
        setLoading(false);
      }
    };
    bootstrap();
    return () => { cancelled = true };
  }, []);

  // ── derived ──────────────────────────────────────────────────────────────
  const categorizedDocs = useMemo(
    () => documents.filter((doc) => doc.status !== "deleted" && doc.folderPath && doc.folderPath.trim()),
    [documents],
  );

  const uncategorizedDocs = useMemo(
    () => documents.filter((doc) => doc.status !== "deleted" && (!doc.folderPath || !doc.folderPath.trim())),
    [documents],
  );

  const reviewDocs = useMemo(
    () => documents.filter((doc) => doc.reviewStatus === "review_required" || doc.status === "review"),
    [documents],
  );

  const recentDocs = useMemo(
    () => [...documents].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 12),
    [documents],
  );

  const sortedNavigationItems = useMemo(
    () => [...navigationItems].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "de")),
    [navigationItems],
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.email, user.role, String(user.documentCount), String(user.reviewCount)].some((v) =>
        String(v || "").toLowerCase().includes(q),
      ),
    );
  }, [users, userSearch]);

  const filteredDocuments = useMemo(() => {
    const q = documentSearch.trim().toLowerCase();
    const sorted = [...categorizedDocs].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    if (!q) return sorted;
    return sorted.filter((doc) =>
      [doc.filename, doc.userEmail, doc.folderPath, doc.absender, doc.dokumenttyp, doc.reviewStatus, doc.status].some((v) =>
        String(v || "").toLowerCase().includes(q),
      ),
    );
  }, [categorizedDocs, documentSearch]);

  const filteredReviewDocs = useMemo(() => {
    const q = documentSearch.trim().toLowerCase();
    const sorted = [...uncategorizedDocs].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    if (!q) return sorted;
    return sorted.filter((doc) =>
      [doc.filename, doc.userEmail, doc.absender, doc.dokumenttyp, doc.reviewStatus, doc.status].some((v) =>
        String(v || "").toLowerCase().includes(q),
      ),
    );
  }, [uncategorizedDocs, documentSearch]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [selectedUserId, users],
  );
  const selectedDocument = useMemo(
    () => documents.find((d) => d.id === selectedDocumentId) || null,
    [selectedDocumentId, documents],
  );
  const selectedNavigation = useMemo(
    () => navigationItems.find((item) => item.id === selectedNavigationId) || null,
    [navigationItems, selectedNavigationId],
  );

  // ── side-effects for selection / section switch ──────────────────────────
  useEffect(() => {
    if (activeSection === "logs" && logs.length === 0 && !logsLoading) {
      loadLogs(logsAction);
    }
    if ((activeSection === "documents" || activeSection === "reviews") && adminFolders.length === 0) {
      loadAdminFolders();
    }
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedUser) return;
    setUserDraft({ role: selectedUser.role, emailVerified: selectedUser.emailVerified });
    loadUserDocuments(selectedUser.id);
  }, [selectedUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedDocument) return;
    if (adminFolders.length === 0) loadAdminFolders();
    setDocumentDraft({
      folderPath: selectedDocument.folderPath || "",
      status: selectedDocument.status || "analyzed",
      dueDate: selectedDocument.dueDate ? selectedDocument.dueDate.slice(0, 10) : "",
      reviewStatus: selectedDocument.reviewStatus || "review_required",
      reviewReason: selectedDocument.reviewReason || "",
      confidence: selectedDocument.confidence == null ? "" : String(selectedDocument.confidence),
      shouldAutoArchive: Boolean(selectedDocument.shouldAutoArchive),
      reminderEnabled: Boolean(selectedDocument.reminderEnabled),
      reminderNote: selectedDocument.reminderNote || "",
    });
  }, [selectedDocument]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedNavigation) {
      setNavigationDraft({
        label: "",
        path: "",
        icon: "LayoutDashboard",
        section: "main",
        sortOrder: (sortedNavigationItems.at(-1)?.sortOrder || 0) + 10,
        roleRequired: "user",
        visible: true,
        isExternal: false,
      });
      return;
    }
    setNavigationDraft({
      label: selectedNavigation.label,
      path: selectedNavigation.path,
      icon: selectedNavigation.icon,
      section: selectedNavigation.section,
      sortOrder: selectedNavigation.sortOrder,
      roleRequired: selectedNavigation.roleRequired,
      visible: selectedNavigation.visible,
      isExternal: selectedNavigation.isExternal,
    });
  }, [selectedNavigation, sortedNavigationItems]);

  // ── save handlers ────────────────────────────────────────────────────────
  async function saveUser(userId: string) {
    setSavingUser(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: userDraft.role, emailVerified: userDraft.emailVerified }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Benutzer konnte nicht gespeichert werden");
      await load({ silent: true });
    } catch (err: any) {
      setError(err?.message || "Benutzer konnte nicht gespeichert werden");
    } finally {
      setSavingUser(false);
    }
  }

  async function saveDocument(documentId: string, overrides: Partial<typeof documentDraft> = {}) {
    setSavingDocument(true);
    setError("");
    try {
      const payload = {
        folderPath: overrides.folderPath ?? documentDraft.folderPath,
        status: overrides.status ?? documentDraft.status,
        dueDate: overrides.dueDate ?? documentDraft.dueDate,
        reviewStatus: overrides.reviewStatus ?? documentDraft.reviewStatus,
        reviewReason: overrides.reviewReason ?? documentDraft.reviewReason,
        confidence: overrides.confidence ?? documentDraft.confidence,
        shouldAutoArchive: overrides.shouldAutoArchive ?? documentDraft.shouldAutoArchive,
        reminderEnabled: overrides.reminderEnabled ?? documentDraft.reminderEnabled,
        reminderNote: overrides.reminderNote ?? documentDraft.reminderNote,
      };
      const res = await fetch(`/api/admin/documents/${documentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Dokument konnte nicht gespeichert werden");
      await load({ silent: true });
    } catch (err: any) {
      setError(err?.message || "Dokument konnte nicht gespeichert werden");
    } finally {
      setSavingDocument(false);
    }
  }

  async function reanalyzeDocument(documentId: string) {
    setReanalyzing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/documents/${documentId}/reanalyze`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Reanalyse fehlgeschlagen");
      await load({ silent: true });
    } catch (err: any) {
      setError(err?.message || "Reanalyse fehlgeschlagen");
    } finally {
      setReanalyzing(false);
    }
  }

  async function saveNavigationItem(itemId?: string | null, overrides: Partial<NavigationDraft> = {}) {
    setSavingNavigation(true);
    setError("");
    try {
      const payload = {
        label: overrides.label ?? navigationDraft.label,
        path: overrides.path ?? navigationDraft.path,
        icon: overrides.icon ?? navigationDraft.icon,
        section: overrides.section ?? navigationDraft.section,
        sortOrder: overrides.sortOrder ?? navigationDraft.sortOrder,
        roleRequired: overrides.roleRequired ?? navigationDraft.roleRequired,
        visible: overrides.visible ?? navigationDraft.visible,
        isExternal: overrides.isExternal ?? navigationDraft.isExternal,
      };
      const isEdit = Boolean(itemId);
      const res = await fetch(isEdit ? `/api/admin/navigation/${itemId}` : "/api/admin/navigation", {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Navigation konnte nicht gespeichert werden");
      setSelectedNavigationId(isEdit ? itemId || null : data?.item?.id || null);
      await load({ silent: true });
    } catch (err: any) {
      setError(err?.message || "Navigation konnte nicht gespeichert werden");
    } finally {
      setSavingNavigation(false);
    }
  }

  async function deleteNavigationItem(itemId: string) {
    if (!window.confirm("Navigationseintrag wirklich löschen?")) return;
    setSavingNavigation(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/navigation/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Navigation konnte nicht gelöscht werden");
      if (selectedNavigationId === itemId) setSelectedNavigationId(null);
      setNavigationDraftOpen(false);
      await load({ silent: true });
    } catch (err: any) {
      setError(err?.message || "Navigation konnte nicht gelöscht werden");
    } finally {
      setSavingNavigation(false);
    }
  }

  async function moveNavigationItem(itemId: string, direction: -1 | 1) {
    const currentIndex = sortedNavigationItems.findIndex((item) => item.id === itemId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedNavigationItems.length) return;
    const neighbor = sortedNavigationItems[targetIndex];
    const nextSort = direction < 0 ? (neighbor.sortOrder - 1) : (neighbor.sortOrder + 1);
    await saveNavigationItem(itemId, { sortOrder: nextSort });
  }

  const handleDeleteDocument = async () => {
    if (!docDeleteId) return;
    setDeletingDocument(true);
    try {
      const res = await fetch(`/api/admin/documents/${docDeleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Löschen fehlgeschlagen");
      setShowDocDeleteConfirm(false);
      setDocDeleteId(null);
      if (selectedDocumentId === docDeleteId) setSelectedDocumentId(null);
      await load({ silent: true });
    } catch (err: any) {
      setError(err?.message || "Löschen fehlgeschlagen");
      setShowDocDeleteConfirm(false);
    } finally {
      setDeletingDocument(false);
    }
  };

  // ── access denied early return ───────────────────────────────────────────
  if (!loading && accessDenied) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl border-glow p-6">
          <h1 className="text-2xl font-bold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dieser Bereich ist nur für Admins freigegeben.
          </p>
          <div className="mt-4">
            <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              Zur Startseite <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── derived display data ─────────────────────────────────────────────────
  const cards = summary ? [
    { label: "System", value: summary.system.api, hint: summary.system.ollamaAvailable ? "Ollama aktiv" : "Ollama aus", icon: ShieldCheck },
    { label: "User", value: summary.users.total.toLocaleString("de-DE"), hint: `${summary.users.verified} verifiziert`, icon: Users },
    { label: "Dokumente", value: summary.documents.total.toLocaleString("de-DE"), hint: `${summary.documents.review} in Prüfung`, icon: FileText },
    { label: "Admins", value: summary.users.admins.toLocaleString("de-DE"), hint: summary.system.visionReview ? "Vision an" : "Vision aus", icon: CircleCheckBig },
  ] : [];

  const sectionCounts: Record<AdminSection, number | string> = {
    users: users.length,
    documents: categorizedDocs.length,
    reviews: uncategorizedDocs.length,
    navigation: navigationItems.length,
    logs: logsTotal > 0 ? logsTotal : "",
  };

  const tabs: [AdminSection, string][] = [
    ["users", "User"],
    ["documents", "Dokumente"],
    ["reviews", "Prüfung"],
    ["navigation", "Navigation"],
    ["logs", "Logs"],
  ];

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 lg:space-y-6 pb-24 lg:pb-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Admin-Konsole</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Systemstatus & Betrieb</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            User, Dokumente, Prüfstatus und Analyse-Modus an einer Stelle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent/40 sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span>Aktualisieren</span>
        </button>
      </header>

      {error && (
        <div className="glass rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          cards.map(({ label, value, hint, icon: Icon }) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl border-glow p-4"
            >
              <div className="flex items-center justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] text-muted-foreground text-right line-clamp-2">{hint}</span>
              </div>
              <div className="mt-3 text-xl sm:text-2xl font-bold tracking-tight truncate">{value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
            </motion.div>
          ))
        )}
      </div>

      {/* Sticky scrollable tabs */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-1 pb-1 backdrop-blur-md bg-background/85 lg:static lg:bg-transparent lg:backdrop-blur-none lg:px-0 lg:mx-0">
        <nav className="no-scrollbar flex gap-2 overflow-x-auto rounded-2xl border border-border/40 bg-background/40 p-2">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveSection(key)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                activeSection === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              }`}
            >
              {label}
              {sectionCounts[key] !== "" && (
                <span className={`text-[11px] ${activeSection === key ? "opacity-80" : "opacity-60"}`}>
                  {sectionCounts[key]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── USERS ──────────────────────────────────────────────────────── */}
      {activeSection === "users" && (
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="glass rounded-2xl border-glow p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">User</h2>
                <p className="mt-1 text-sm text-muted-foreground">Rollen, Verifikation und Aktivität.</p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="User suchen"
                  className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 pl-9 pr-3 py-2 text-sm sm:w-72"
                />
              </div>
            </div>

            {/* Mobile cards */}
            <div className="mt-4 space-y-2 md:hidden">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className={`block w-full rounded-xl border border-border/40 bg-background/40 p-3 text-left transition active:bg-background/60 ${
                    selectedUserId === user.id ? "ring-1 ring-violet-400/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="break-all text-sm font-medium">{user.email}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className={`rounded-full px-2 py-0.5 ${
                          user.role === "admin" ? "bg-violet-500/15 text-violet-200" : "bg-muted/40"
                        }`}>{user.role}</span>
                        <span>{user.documentCount} Dok.</span>
                        {user.reviewCount > 0 && <span>· {user.reviewCount} Prüfung</span>}
                        <span>· {user.emailVerified ? "verifiziert" : "unverifiziert"}</span>
                      </div>
                    </div>
                    <Edit3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/40 p-6 text-center text-sm text-muted-foreground">
                  Kein User passt zum Filter.
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="mt-4 hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="py-3 pr-4">E-Mail</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Rolle</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Dok.</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Prüfung</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Verifiziert</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Letztes Dok.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={`cursor-pointer border-b border-border/20 transition hover:bg-background/40 ${
                        selectedUserId === user.id ? "bg-background/50" : ""
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium break-all">{user.email}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${
                          user.role === "admin" ? "bg-violet-500/15 text-violet-200" : "bg-muted/40 text-muted-foreground"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{user.documentCount}</td>
                      <td className="py-3 pr-4">{user.reviewCount}</td>
                      <td className="py-3 pr-4">{user.emailVerified ? "✓" : "—"}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{fmtDateTime(user.lastDocumentAt)}</td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Kein User passt zum Filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <AdminDrawer
            open={!!selectedUser}
            onClose={() => { setSelectedUserId(null); setUserDocuments([]); }}
            title={selectedUser ? selectedUser.email : "Benutzeraktion"}
            subtitle={selectedUser
              ? `${selectedUser.documentCount} Dok. · ${selectedUser.reviewCount} Prüfung · seit ${fmtDateTime(selectedUser.createdAt)}`
              : "Rolle, Verifikation und Dokumente."
            }
            inlineOnDesktop
          >
            {selectedUser ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Rolle</span>
                    <select
                      value={userDraft.role}
                      onChange={(e) => setUserDraft((p) => ({ ...p, role: e.target.value as "admin" | "user" }))}
                      className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                  <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={userDraft.emailVerified}
                      onChange={(e) => setUserDraft((p) => ({ ...p, emailVerified: e.target.checked }))}
                      className="h-4 w-4"
                    />
                    E-Mail verifiziert
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={savingUser}
                    onClick={() => saveUser(selectedUser.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {savingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {savingUser ? "Speichert…" : "Speichern"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteConfirm(selectedUser.id, selectedUser.email)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
                  >
                    <Trash2 className="h-4 w-4" /> Löschen
                  </button>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <FileBox className="h-3.5 w-3.5" /> Letzte Dokumente
                  </div>
                  {userDocumentsLoading ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
                    </div>
                  ) : userDocuments.length === 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">Keine Dokumente.</div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {userDocuments.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                          <span className="truncate font-medium">{doc.filename}</span>
                          <span className="shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                            {doc.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyHint text="Wähle einen User aus der Liste." />
            )}
          </AdminDrawer>
        </section>
      )}

      {/* ── DOCUMENTS ──────────────────────────────────────────────────── */}
      {activeSection === "documents" && (
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="glass rounded-2xl border-glow p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategorisierte Dokumente</h2>
                <p className="mt-1 text-sm text-muted-foreground">Alle Dokumente, die in einen Ordner kategorisiert wurden.</p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={documentSearch}
                  onChange={(e) => setDocumentSearch(e.target.value)}
                  placeholder="Dokument suchen"
                  className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 pl-9 pr-3 py-2 text-sm sm:w-72"
                />
              </div>
            </div>

            {/* Mobile cards */}
            <div className="mt-4 space-y-2 md:hidden">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`rounded-xl border border-border/40 bg-background/40 p-3 transition active:bg-background/60 ${
                    selectedDocumentId === doc.id ? "ring-1 ring-violet-400/40" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDocumentId(doc.id)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{doc.filename}</div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">{doc.userEmail}</div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground font-mono">{doc.folderPath}</div>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground whitespace-nowrap">
                        {doc.reviewStatus || doc.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                      {doc.absender && <span className="rounded-full bg-muted/20 px-2 py-0.5">{doc.absender}</span>}
                      {doc.dokumenttyp && <span className="rounded-full bg-muted/20 px-2 py-0.5">{doc.dokumenttyp}</span>}
                      <span>{fmtDateTime(doc.updatedAt)}</span>
                    </div>
                  </button>
                  <div className="mt-3 flex gap-2 border-t border-border/30 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDocumentId(doc.id)}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/50 px-3 text-xs font-semibold text-foreground hover:bg-accent/40"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDocDeleteId(doc.id); setShowDocDeleteConfirm(true); }}
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {filteredDocuments.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/40 p-6 text-center text-sm text-muted-foreground">
                  Kein Dokument passt zum Filter.
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="mt-4 hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="py-3 pr-4 min-w-[160px]">Datei</th>
                    <th className="py-3 pr-4">User</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Status</th>
                    <th className="py-3 pr-4">Ordner</th>
                    <th className="py-3 pr-4 hidden lg:table-cell">Absender</th>
                    <th className="py-3 pr-4 hidden lg:table-cell">Typ</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Aktualisiert</th>
                    <th className="py-3 pr-0 min-w-[140px]">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedDocumentId(doc.id)}
                      className={`cursor-pointer border-b border-border/20 transition hover:bg-background/40 ${
                        selectedDocumentId === doc.id ? "bg-background/50" : ""
                      }`}
                    >
                      <td className="py-3 pr-4 max-w-[200px] truncate font-medium">{doc.filename}</td>
                      <td className="py-3 pr-4 max-w-[160px] truncate text-muted-foreground">{doc.userEmail}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground whitespace-nowrap">
                          {doc.reviewStatus || doc.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 max-w-[160px] truncate text-muted-foreground">{doc.folderPath}</td>
                      <td className="py-3 pr-4 hidden lg:table-cell max-w-[120px] truncate">{doc.absender}</td>
                      <td className="py-3 pr-4 hidden lg:table-cell max-w-[120px] truncate">{doc.dokumenttyp}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{fmtDateTime(doc.updatedAt)}</td>
                      <td className="py-3 pr-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDocumentId(doc.id)}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border/40 bg-background/50 px-2.5 text-xs font-semibold text-foreground whitespace-nowrap hover:bg-accent/40"
                          >
                            <Edit3 className="h-3.5 w-3.5" /> Bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDocDeleteId(doc.id); setShowDocDeleteConfirm(true); }}
                            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-rose-100 hover:bg-rose-500/20"
                            aria-label="Löschen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredDocuments.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Kein Dokument passt zum Filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <AdminDrawer
            open={!!selectedDocument}
            onClose={() => setSelectedDocumentId(null)}
            title={selectedDocument ? selectedDocument.filename : "Dokumentaktion"}
            subtitle={selectedDocument
              ? `${selectedDocument.userEmail} · Confidence ${selectedDocument.confidence == null ? "—" : selectedDocument.confidence.toFixed(2)}`
              : "Ordner, Status und Reanalyse an einer Stelle."
            }
            inlineOnDesktop
          >
            {selectedDocument ? (
              <DocumentEditFields
                draft={documentDraft}
                setDraft={setDocumentDraft}
                folders={adminFolders}
                reminderSentAt={selectedDocument.reminderSentAt}
                reminderChannel={selectedDocument.reminderChannel}
                onSave={() => saveDocument(selectedDocument.id)}
                onReanalyze={() => reanalyzeDocument(selectedDocument.id)}
                onDelete={() => { setDocDeleteId(selectedDocument.id); setShowDocDeleteConfirm(true); }}
                saving={savingDocument}
                reanalyzing={reanalyzing}
              />
            ) : (
              <EmptyHint text="Wähle ein Dokument aus der Liste." />
            )}
          </AdminDrawer>
        </section>
      )}

      {/* ── REVIEWS ────────────────────────────────────────────────────── */}
      {activeSection === "reviews" && (
        <>
          <section className="glass rounded-2xl border-glow p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prüfung</h2>
                <p className="mt-1 text-sm text-muted-foreground">Unkategorisierte Dokumente zum Einsortieren.</p>
              </div>
              <span className="text-xs text-muted-foreground">{filteredReviewDocs.length} offen</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredReviewDocs.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
                  Keine unkategorisierten Dokumente.
                </div>
              )}
              {filteredReviewDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDocumentId(doc.id)}
                  className={`rounded-xl border border-border/40 bg-background/40 p-3 text-left text-sm transition hover:bg-background/60 ${
                    selectedDocumentId === doc.id ? "ring-1 ring-violet-400/50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{doc.filename}</div>
                      <div className="truncate text-xs text-muted-foreground">{doc.userEmail} · {doc.folderPath}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] text-amber-200">
                      {doc.reviewStatus || doc.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                    {doc.reviewReason || "Keine Begründung"} · Conf {doc.confidence == null ? "—" : doc.confidence.toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <AdminDrawer
            open={!!selectedDocument}
            onClose={() => setSelectedDocumentId(null)}
            title={selectedDocument ? selectedDocument.filename : "Prüfung"}
            subtitle={selectedDocument
              ? `Status: ${selectedDocument.reviewStatus || selectedDocument.status} · Conf ${selectedDocument.confidence == null ? "—" : selectedDocument.confidence.toFixed(2)}`
              : "Wähle ein Dokument."
            }
          >
            {selectedDocument && (
              <DocumentEditFields
                draft={documentDraft}
                setDraft={setDocumentDraft}
                folders={adminFolders}
                reminderSentAt={selectedDocument.reminderSentAt}
                reminderChannel={selectedDocument.reminderChannel}
                onSave={() => saveDocument(selectedDocument.id)}
                onReanalyze={() => reanalyzeDocument(selectedDocument.id)}
                onDelete={() => { setDocDeleteId(selectedDocument.id); setShowDocDeleteConfirm(true); }}
                saving={savingDocument}
                reanalyzing={reanalyzing}
                compact
              />
            )}
          </AdminDrawer>
        </>
      )}

      {/* ── NAVIGATION ─────────────────────────────────────────────────── */}
      {activeSection === "navigation" && (
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="glass rounded-2xl border-glow p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Navigation</h2>
                <p className="mt-1 text-sm text-muted-foreground">Tabs, Reihenfolge und Sichtbarkeit steuern.</p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedNavigationId(null); setNavigationDraftOpen(true); }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/40"
              >
                <Plus className="h-4 w-4" /> Neuer Eintrag
              </button>
            </div>

            {/* Mobile cards */}
            <div className="mt-4 space-y-2 md:hidden">
              {sortedNavigationItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border border-border/40 bg-background/40 p-3 ${
                    selectedNavigationId === item.id ? "ring-1 ring-violet-400/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.label}</span>
                        {item.isExternal && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{item.path}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="rounded-full bg-muted/30 px-2 py-0.5">{item.section}</span>
                        <span className={`rounded-full px-2 py-0.5 ${
                          item.roleRequired === "admin" ? "bg-violet-500/15 text-violet-200" : "bg-muted/40"
                        }`}>{item.roleRequired}</span>
                        <span>{item.visible ? "sichtbar" : "versteckt"}</span>
                        <span>#{item.sortOrder}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 border-t border-border/30 pt-2">
                    <button
                      type="button"
                      onClick={() => moveNavigationItem(item.id, -1)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border/40 bg-background/50 text-muted-foreground"
                      aria-label="Nach oben"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveNavigationItem(item.id, 1)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border/40 bg-background/50 text-muted-foreground"
                      aria-label="Nach unten"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedNavigationId(item.id); setNavigationDraftOpen(true); }}
                      className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/50 px-3 text-xs font-semibold text-foreground"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteNavigationItem(item.id)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-100"
                      aria-label="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="mt-4 hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="py-3 pr-4">Label</th>
                    <th className="py-3 pr-4">Pfad</th>
                    <th className="py-3 pr-4 hidden lg:table-cell">Icon</th>
                    <th className="py-3 pr-4 hidden lg:table-cell">Bereich</th>
                    <th className="py-3 pr-4">Rolle</th>
                    <th className="py-3 pr-4">Sichtbar</th>
                    <th className="py-3 pr-4 hidden lg:table-cell">Reihenf.</th>
                    <th className="py-3 pr-0 min-w-[180px]">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedNavigationItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => { setSelectedNavigationId(item.id); setNavigationDraftOpen(true); }}
                      className={`cursor-pointer border-b border-border/20 transition hover:bg-background/40 ${
                        selectedNavigationId === item.id ? "bg-background/50" : ""
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium">{item.label}</td>
                      <td className="py-3 pr-4 max-w-[180px] truncate font-mono text-xs text-muted-foreground">{item.path}</td>
                      <td className="py-3 pr-4 hidden lg:table-cell text-muted-foreground">{item.icon}</td>
                      <td className="py-3 pr-4 hidden lg:table-cell text-muted-foreground">{item.section}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${
                          item.roleRequired === "admin" ? "bg-violet-500/15 text-violet-200" : "bg-muted/40 text-muted-foreground"
                        }`}>
                          {item.roleRequired}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{item.visible ? "Ja" : "Nein"}</td>
                      <td className="py-3 pr-4 hidden lg:table-cell">{item.sortOrder}</td>
                      <td className="py-3 pr-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => moveNavigationItem(item.id, -1)}
                            className="grid h-9 w-9 place-items-center rounded-lg border border-border/40 bg-background/50 text-muted-foreground hover:text-foreground"
                            title="Nach oben"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveNavigationItem(item.id, 1)}
                            className="grid h-9 w-9 place-items-center rounded-lg border border-border/40 bg-background/50 text-muted-foreground hover:text-foreground"
                            title="Nach unten"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSelectedNavigationId(item.id); setNavigationDraftOpen(true); }}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border/40 bg-background/50 px-2.5 text-xs font-semibold text-foreground whitespace-nowrap"
                          >
                            <Edit3 className="h-3 w-3" /> Bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteNavigationItem(item.id)}
                            className="grid h-9 w-9 place-items-center rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-100"
                            aria-label="Löschen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <AdminDrawer
            open={navigationDraftOpen}
            onClose={() => { setNavigationDraftOpen(false); setSelectedNavigationId(null); }}
            title={selectedNavigation ? "Navigation bearbeiten" : "Navigation anlegen"}
            subtitle="Tabs und Links steuern."
            inlineOnDesktop
          >
            <NavigationEditForm
              draft={navigationDraft}
              setDraft={setNavigationDraft}
              onSave={() => saveNavigationItem(selectedNavigation?.id || null)}
              saving={savingNavigation}
              hasSelection={!!selectedNavigation}
              onCancel={() => { setNavigationDraftOpen(false); setSelectedNavigationId(null); }}
            />
          </AdminDrawer>
        </section>
      )}

      {/* ── LOGS ───────────────────────────────────────────────────────── */}
      {activeSection === "logs" && (
        <section className="glass rounded-2xl border-glow p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ScrollText className="h-3.5 w-3.5" /> Audit-Log
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{logsTotal} Einträge insgesamt</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={logsAction}
                  onChange={(e) => { setLogsAction(e.target.value); loadLogs(e.target.value); }}
                  className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 pl-9 pr-3 py-2 text-sm sm:w-56"
                >
                  <option value="">Alle Aktionen</option>
                  <option value="LOGIN_SUCCESS">Login</option>
                  <option value="LOGIN_FAILED">Login fehlgeschlagen</option>
                  <option value="LOGOUT">Logout</option>
                  <option value="REGISTER_COMPLETED">Registrierung</option>
                  <option value="ADMIN_USER_DELETED">User gelöscht</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => loadLogs(logsAction)}
                className="grid h-11 w-11 place-items-center rounded-xl border border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
                aria-label="Aktualisieren"
              >
                <RefreshCw className={`h-4 w-4 ${logsLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {logsLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Logs laden…
            </div>
          ) : logs.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
              Keine Log-Einträge.
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="mt-4 space-y-2 md:hidden">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-border/40 bg-background/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        log.action.includes("FAILED") || log.action.includes("ERROR") || log.action.includes("DELETED")
                          ? "bg-rose-500/15 text-rose-200"
                          : log.action.includes("SUCCESS") || log.action.includes("COMPLETED")
                            ? "bg-emerald-500/15 text-emerald-200"
                            : "bg-muted/40 text-muted-foreground"
                      }`}>
                        {log.action}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{fmtDateTime(log.created_at)}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      <div className="truncate">{log.user_email || log.user_id || "—"} · {log.ip || "—"}</div>
                      {log.detail && <div className="mt-1 line-clamp-2 break-words">{log.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="mt-4 hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/40">
                      <th className="py-3 pr-3">Datum</th>
                      <th className="py-3 pr-3">Aktion</th>
                      <th className="py-3 pr-3">Benutzer</th>
                      <th className="py-3 pr-3 hidden lg:table-cell">IP</th>
                      <th className="py-3">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-border/20 hover:bg-background/30">
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{fmtDateTime(log.created_at)}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            log.action.includes("FAILED") || log.action.includes("ERROR") || log.action.includes("DELETED")
                              ? "bg-rose-500/15 text-rose-200"
                              : log.action.includes("SUCCESS") || log.action.includes("COMPLETED")
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "bg-muted/40 text-muted-foreground"
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{log.user_email || log.user_id || "—"}</td>
                        <td className="py-2 pr-3 hidden lg:table-cell text-muted-foreground">{log.ip || "—"}</td>
                        <td className="py-2 max-w-[280px] truncate text-muted-foreground">{log.detail || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── DOC DELETE MODAL ──────────────────────────────────────────── */}
      {showDocDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-background p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-rose-500/15 p-2">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <h3 className="text-lg font-semibold">Dokument löschen</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Das Dokument wird als gelöscht markiert und aus dem Archiv entfernt. Diese Aktion kann <strong>nicht</strong> rückgängig gemacht werden.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => { setShowDocDeleteConfirm(false); setDocDeleteId(null); }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/40"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={deletingDocument}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                {deletingDocument && <Loader2 className="h-4 w-4 animate-spin" />}
                {deletingDocument ? "Löscht…" : "Endgültig löschen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── USER DELETE MODAL ─────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-background p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-rose-500/15 p-2">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <h3 className="text-lg font-semibold">Benutzer dauerhaft löschen</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Alle Daten und Dateien von <strong className="text-foreground">{deleteUserEmail}</strong> werden unwiderruflich gelöscht. Diese Aktion kann <strong>nicht</strong> rückgängig gemacht werden.
            </p>
            <div className="mt-4">
              <label className="text-sm text-muted-foreground">
                Gib die E-Mail-Adresse zur Bestätigung ein:
              </label>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder={deleteUserEmail}
                autoComplete="off"
                className="mt-2 w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5 text-sm focus:border-rose-500/50 focus:outline-none"
              />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/40"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteConfirmInput !== deleteUserEmail}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DocumentEditFields({
  draft, setDraft, folders, reminderSentAt, reminderChannel,
  onSave, onReanalyze, onDelete, saving, reanalyzing, compact = false,
}: {
  draft: any;
  setDraft: (fn: (p: any) => any) => void;
  folders: AdminFolder[];
  reminderSentAt: string | null;
  reminderChannel: string | null;
  onSave: () => void;
  onReanalyze: () => void;
  onDelete: () => void;
  saving: boolean;
  reanalyzing: boolean;
  compact?: boolean;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Ordner</span>
          <input
            value={draft.folderPath}
            onChange={(e) => setDraft((p) => ({ ...p, folderPath: e.target.value }))}
            list="admin-folders-datalist"
            className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5 font-mono text-sm"
            placeholder="Ordner auswählen oder eingeben…"
          />
          <datalist id="admin-folders-datalist">
            {folders.map((f) => (
              <option key={f.id} value={f.id} label={f.parent_id ? `  └ ${f.name}` : f.name} />
            ))}
          </datalist>
        </label>

        {!compact && (
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Fälligkeit</span>
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
              className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
            />
          </label>
        )}

        {!compact && (
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Status</span>
            <select
              value={draft.status}
              onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
              className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
            >
              <option value="uploaded">uploaded</option>
              <option value="analyzed">analyzed</option>
              <option value="review">review</option>
              <option value="archived">archived</option>
              <option value="failed">failed</option>
              <option value="deleted">deleted</option>
            </select>
          </label>
        )}

        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Review-Status</span>
          <select
            value={draft.reviewStatus}
            onChange={(e) => setDraft((p) => ({ ...p, reviewStatus: e.target.value }))}
            className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
          >
            <option value="auto_ready">auto_ready</option>
            <option value="review_required">review_required</option>
            <option value="analysis_failed">analysis_failed</option>
          </select>
        </label>

        {!compact && (
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Confidence</span>
            <input
              value={draft.confidence}
              onChange={(e) => setDraft((p) => ({ ...p, confidence: e.target.value }))}
              className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
              inputMode="decimal"
            />
          </label>
        )}

        {!compact && (
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm sm:col-span-1">
            <input
              type="checkbox"
              checked={draft.reminderEnabled}
              onChange={(e) => setDraft((p) => ({ ...p, reminderEnabled: e.target.checked }))}
              className="h-4 w-4"
            />
            Erinnerung aktiv
          </label>
        )}

        <label className="space-y-1.5 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Begründung</span>
          <textarea
            value={draft.reviewReason}
            onChange={(e) => setDraft((p) => ({ ...p, reviewReason: e.target.value }))}
            className="min-h-24 w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
          />
        </label>

        {!compact && (
          <label className="space-y-1.5 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Hinweistext</span>
            <textarea
              value={draft.reminderNote}
              onChange={(e) => setDraft((p) => ({ ...p, reminderNote: e.target.value }))}
              className="min-h-20 w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
            />
          </label>
        )}

        {!compact && reminderSentAt && (
          <div className="rounded-xl border border-border/40 bg-background/35 px-3 py-2.5 text-sm text-muted-foreground sm:col-span-2">
            Erinnerung gesendet: {fmtDateTime(reminderSentAt)}{reminderChannel ? ` · ${reminderChannel}` : ""}
          </div>
        )}

        {!compact && (
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.shouldAutoArchive}
              onChange={(e) => setDraft((p) => ({ ...p, shouldAutoArchive: e.target.checked }))}
              className="h-4 w-4"
            />
            Auto-Archivieren aktiv
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Speichert…" : "Speichern"}
        </button>
        <button
          type="button"
          disabled={reanalyzing}
          onClick={onReanalyze}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
        >
          {reanalyzing && <Loader2 className="h-4 w-4 animate-spin" />}
          {reanalyzing ? "Analysiert…" : "Neu analysieren"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
        >
          <Trash2 className="h-4 w-4" /> Löschen
        </button>
      </div>
    </>
  );
}

function NavigationEditForm({
  draft, setDraft, onSave, saving, hasSelection, onCancel,
}: {
  draft: NavigationDraft;
  setDraft: (fn: (p: NavigationDraft) => NavigationDraft) => void;
  onSave: () => void;
  saving: boolean;
  hasSelection: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <label className="space-y-1.5 text-sm">
        <span className="text-muted-foreground">Bezeichnung</span>
        <input
          value={draft.label}
          onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
          className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
          placeholder="z. B. Berichte"
        />
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="text-muted-foreground">Pfad</span>
        <input
          value={draft.path}
          onChange={(e) => setDraft((p) => ({ ...p, path: e.target.value }))}
          className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5 font-mono text-sm"
          placeholder="/berichte oder https://..."
          list="navigation-path-options"
        />
        <datalist id="navigation-path-options">
          {DEFAULT_NAVIGATION_ITEMS.map((item) => (
            <option key={item.id} value={item.path} label={item.label} />
          ))}
        </datalist>
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="text-muted-foreground">Icon</span>
        <IconPicker
          value={draft.icon}
          onChange={(icon) => setDraft((p) => ({ ...p, icon }))}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Bereich</span>
          <input
            value={draft.section}
            onChange={(e) => setDraft((p) => ({ ...p, section: e.target.value }))}
            className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
            placeholder="main"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Reihenfolge</span>
          <input
            type="number"
            value={draft.sortOrder}
            onChange={(e) => setDraft((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))}
            className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Rolle</span>
          <select
            value={draft.roleRequired}
            onChange={(e) => setDraft((p) => ({ ...p, roleRequired: e.target.value as "admin" | "user" }))}
            className="w-full min-h-11 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={draft.visible}
            onChange={(e) => setDraft((p) => ({ ...p, visible: e.target.checked }))}
            className="h-4 w-4"
          />
          Sichtbar
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={draft.isExternal}
            onChange={(e) => setDraft((p) => ({ ...p, isExternal: e.target.checked }))}
            className="h-4 w-4"
          />
          Externer Link
        </label>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Speichert…" : (hasSelection ? "Änderungen speichern" : "Eintrag anlegen")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function StatusLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/20 px-3 py-2">
      <span>{label}</span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
        ok ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
      }`}>
        {ok ? <CircleCheckBig className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
        {ok ? "ok" : "aus"}
      </span>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-[108px] animate-pulse rounded-2xl border border-border/40 bg-muted/20" />;
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/40 bg-background/30 px-4 py-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
