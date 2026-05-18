import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, RefreshCw, ShieldCheck, Users, FileText, CircleCheckBig, CircleAlert, ChevronUp, ChevronDown, Plus, ScrollText, Loader2, FileBox } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { fmtDateTime } from "../lib/format";
import { IconPicker } from "../components/IconPicker";
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
  users: {
    total: number;
    verified: number;
    admins: number;
  };
  documents: {
    total: number;
    analyzed: number;
    review: number;
    archived: number;
    deleted: number;
  };
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

type AdminSection = "overview" | "users" | "documents" | "reviews" | "navigation" | "logs";

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

interface AdminFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserEmail, setDeleteUserEmail] = useState<string>('');

  const openDeleteConfirm = (userId: string, email: string) => {
    setDeleteUserId(userId);
    setDeleteUserEmail(email);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteUserId(null);
    setDeleteUserEmail('');
    setDeleteConfirmInput('');
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
      setShowDeleteConfirm(false);
      setDeleteUserId(null);
      setDeleteUserEmail('');
      setDeleteConfirmInput('');
      if (selectedUserId === deleteUserId) { setSelectedUserId(null); setUserDocuments([]); }
      await load({ silent: true });
    } catch (err: any) {
      setError(err?.message || "Löschung fehlgeschlagen");
      setShowDeleteConfirm(false);
      setDeleteUserId(null);
      setDeleteUserEmail('');
      setDeleteConfirmInput('');
    }
  };

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
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [userSearch, setUserSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
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

  const load = async ({ silent = false } = {}) => {
    try {
      if (!silent) setRefreshing(true);
      setError("");
      const [summaryData, usersData, reviewData, recentData, navData] = await Promise.all([
        fetchJson("/api/admin/summary"),
        fetchJson("/api/admin/users"),
        fetchJson("/api/admin/documents?status=review_required&limit=12"),
        fetchJson("/api/admin/documents?limit=12"),
        fetchJson("/api/admin/navigation"),
      ]);
      setSummary(summaryData as AdminSummary);
      setUsers((usersData.users || []) as AdminUserRow[]);
      setNavigationItems((navData.items || DEFAULT_NAVIGATION_ITEMS) as NavigationItem[]);
      const merged = new Map<string, AdminDocumentRow>();
      for (const doc of [...(reviewData.documents || []), ...(recentData.documents || [])] as AdminDocumentRow[]) {
        merged.set(doc.id, doc);
      }
      setDocuments(Array.from(merged.values()));
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
    return () => {
      cancelled = true;
    };
  }, []);

  const reviewDocs = useMemo(
    () => documents.filter((doc) => doc.reviewStatus === "review_required" || doc.status === "review"),
    [documents]
  );

  const recentDocs = useMemo(
    () => [...documents].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 8),
    [documents]
  );
  const sortedNavigationItems = useMemo(
    () => [...navigationItems].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "de")),
    [navigationItems]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.email, user.role, String(user.documentCount), String(user.reviewCount)].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
  }, [users, userSearch]);

  const filteredDocuments = useMemo(() => {
    const q = documentSearch.trim().toLowerCase();
    if (!q) return recentDocs;
    return recentDocs.filter((doc) =>
      [doc.filename, doc.userEmail, doc.folderPath, doc.absender, doc.dokumenttyp, doc.reviewStatus, doc.status].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
  }, [recentDocs, documentSearch]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users]
  );
  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedDocumentId) || null,
    [selectedDocumentId, documents]
  );
  const selectedNavigation = useMemo(
    () => navigationItems.find((item) => item.id === selectedNavigationId) || null,
    [navigationItems, selectedNavigationId]
  );

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
    setActiveSection("users");
    setUserDraft({
      role: selectedUser.role,
      emailVerified: selectedUser.emailVerified,
    });
    loadUserDocuments(selectedUser.id);
  }, [selectedUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedDocument) return;
    setActiveSection(selectedDocument.reviewStatus === "review_required" || selectedDocument.status === "review" ? "reviews" : "documents");
    if (adminFolders.length === 0) loadAdminFolders(); // eslint-disable-line react-hooks/exhaustive-deps
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
  }, [selectedDocument]);

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
    setActiveSection("navigation");
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

  async function saveUser(userId: string) {
    setSavingUser(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: userDraft.role,
          emailVerified: userDraft.emailVerified,
        }),
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
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedNavigationItems.length) {
      return;
    }
    const current = sortedNavigationItems[currentIndex];
    const neighbor = sortedNavigationItems[targetIndex];
    const nextSort = direction < 0
      ? (neighbor.sortOrder - 1)
      : (neighbor.sortOrder + 1);
    await saveNavigationItem(itemId, { sortOrder: nextSort });
  }

  const loadLogs = async (action = "") => {
    setLogsLoading(true);
    try {
      const url = action
        ? `/api/admin/logs?action=${encodeURIComponent(action)}&limit=100`
        : "/api/admin/logs?limit=100";
      const data = await fetchJson(url);
      setLogs(data.logs || []);
      setLogsTotal(Number(data.total || 0));
    } catch {}
    finally { setLogsLoading(false); }
  };

  const loadUserDocuments = async (userId: string) => {
    setUserDocumentsLoading(true);
    setUserDocuments([]);
    try {
      const data = await fetchJson(`/api/admin/users/${userId}/documents?limit=20`);
      setUserDocuments(data.documents || []);
    } catch {}
    finally { setUserDocumentsLoading(false); }
  };

  const loadAdminFolders = async () => {
    try {
      const data = await fetchJson("/api/admin/folders");
      setAdminFolders(data.folders || []);
    } catch {}
  };

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

  if (!loading && accessDenied) {
    return (
      <div className="space-y-4">
        <div className="glass rounded-2xl border-glow p-6">
          <h1 className="text-2xl font-bold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dieser Bereich ist nur für Admins freigegeben.
          </p>
          <div className="mt-4">
            <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              Zur Startseite <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cards = summary ? [
    { label: "System", value: summary.system.api, hint: summary.system.ollamaAvailable ? "Ollama aktiv" : "Ollama aus", icon: ShieldCheck },
    { label: "User", value: summary.users.total.toLocaleString("de-DE"), hint: `${summary.users.verified} verifiziert`, icon: Users },
    { label: "Dokumente", value: summary.documents.total.toLocaleString("de-DE"), hint: `${summary.documents.review} in Prüfung`, icon: FileText },
    { label: "Admins", value: summary.users.admins.toLocaleString("de-DE"), hint: `${summary.system.visionReview ? "Vision an" : "Vision aus"}`, icon: CircleCheckBig },
  ] : [];

  const sectionCounts: Record<AdminSection, number | string> = {
    overview: summary?.documents.total ?? documents.length,
    users: users.length,
    documents: recentDocs.length,
    reviews: reviewDocs.length,
    navigation: navigationItems.length,
    logs: logsTotal > 0 ? logsTotal : "",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Admin-Konsole</p>
          <h1 className="text-3xl font-bold tracking-tight">Systemstatus und Betriebsübersicht</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            User, Dokumente, Prüfstatus und Analyse-Modus an einer Stelle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent/40"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      {error && (
        <div className="glass rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          cards.map(({ label, value, hint, icon: Icon }) => (
            <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl border-glow p-4">
              <div className="flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </div>
              <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
            </motion.div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-background/40 p-2">
        {([
          ["overview", "Übersicht"],
          ["users", "User"],
          ["documents", "Dokumente"],
          ["reviews", "Prüfung"],
          ["navigation", "Navigation"],
          ["logs", "Logs"],
        ] as [AdminSection, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSection(key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activeSection === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"}`}
          >
            {label}
            {sectionCounts[key] !== "" && (
              <span className="ml-2 text-[11px] opacity-70">{sectionCounts[key]}</span>
            )}
          </button>
        ))}
      </div>

      {activeSection === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="glass rounded-2xl border-glow p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">System</h2>
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
            {summary ? (
              <div className="mt-4 space-y-2 text-sm">
                <StatusLine label="Ollama" ok={summary.system.ollamaAvailable} />
                <StatusLine label="Text-KI" ok={summary.system.useOllamaAnalysis} />
                <StatusLine label="Layout" ok={summary.system.layoutAnalysis} />
                <StatusLine label="Vision" ok={summary.system.visionReview} />
                <div className="mt-3 rounded-2xl bg-muted/20 p-3 text-xs text-muted-foreground">
                  Vision-Modell: {summary.system.visionModel || "nicht gesetzt"}
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">Lädt...</div>
            )}
          </section>

          <section className="glass rounded-2xl border-glow p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Review-Queue</h2>
              <span className="text-xs text-muted-foreground">{reviewDocs.length} offen</span>
            </div>
            <div className="mt-3 space-y-2">
              {reviewDocs.length === 0 && <div className="text-sm text-muted-foreground">Keine offenen Prüfungen.</div>}
              {reviewDocs.slice(0, 6).map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDocumentId(doc.id)}
                  className={`w-full rounded-xl border border-border/40 bg-background/40 p-3 text-left text-sm transition hover:bg-background/60 ${selectedDocumentId === doc.id ? "ring-1 ring-violet-400/50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{doc.filename}</div>
                      <div className="text-xs text-muted-foreground">{doc.userEmail} · {doc.folderPath}</div>
                    </div>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-200">
                      {doc.reviewStatus || doc.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {doc.reviewReason || "Keine Begründung"} · Confidence {doc.confidence == null ? "—" : doc.confidence.toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeSection === "users" && (
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="glass rounded-2xl border-glow p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">User</h2>
                <p className="mt-1 text-sm text-muted-foreground">Rollen, Verifikation und Aktivität.</p>
              </div>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="User suchen"
                className="w-full max-w-xs rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
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
                      className={`border-b border-border/20 transition hover:bg-background/40 ${selectedUserId === user.id ? "bg-background/50" : "cursor-pointer"}`}
                    >
                      <td className="py-3 pr-4 font-medium break-all">{user.email}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${user.role === "admin" ? "bg-violet-500/15 text-violet-200" : "bg-muted/40 text-muted-foreground"}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{user.documentCount}</td>
                      <td className="py-3 pr-4">{user.reviewCount}</td>
                      <td className="py-3 pr-4">{user.emailVerified ? "✓" : "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{fmtDateTime(user.lastDocumentAt)}</td>
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

          <AdminSidePanel title="Benutzeraktion" subtitle="Rolle, Verifikation und Dokumente.">
            {selectedUser ? (
              <>
                <div className="text-lg font-semibold">{selectedUser.email}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {selectedUser.documentCount} Dok. · {selectedUser.reviewCount} Prüfung · seit {fmtDateTime(selectedUser.createdAt)}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Rolle</span>
                    <select
                      value={userDraft.role}
                      onChange={(e) => setUserDraft((prev) => ({ ...prev, role: e.target.value as "admin" | "user" }))}
                      className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={userDraft.emailVerified}
                      onChange={(e) => setUserDraft((prev) => ({ ...prev, emailVerified: e.target.checked }))}
                    />
                    E-Mail verifiziert
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" disabled={savingUser} onClick={() => saveUser(selectedUser.id)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {savingUser ? "Speichert..." : "Speichern"}
                  </button>
                  <button type="button" onClick={() => { setSelectedUserId(null); setUserDocuments([]); }} className="rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground">
                    Schließen
                  </button>
                  <button type="button" onClick={() => openDeleteConfirm(selectedUser.id, selectedUser.email)} className="rounded-xl bg-rose-600/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600">
                    Löschen
                  </button>
                </div>
                <div className="mt-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <FileBox className="h-3.5 w-3.5" /> Letzte Dokumente
                  </div>
                  {userDocumentsLoading ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Lädt...
                    </div>
                  ) : userDocuments.length === 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">Keine Dokumente.</div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {userDocuments.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2 text-xs">
                          <span className="truncate max-w-[160px] font-medium">{doc.filename}</span>
                          <span className="ml-2 shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{doc.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyHint text="Wähle einen User in der Tabelle." />
            )}
          </AdminSidePanel>
        </section>
      )}

      {activeSection === "documents" && (
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="glass rounded-2xl border-glow p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dokumente</h2>
                <p className="mt-1 text-sm text-muted-foreground">Letzte Dokumente und Status auf einen Blick.</p>
              </div>
              <input
                value={documentSearch}
                onChange={(e) => setDocumentSearch(e.target.value)}
                placeholder="Dokument suchen"
                className="w-full max-w-xs rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="py-3 pr-4 min-w-[160px]">Datei</th>
                    <th className="py-3 pr-4">User</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Status</th>
                    <th className="py-3 pr-4">Ordner</th>
                    <th className="py-3 pr-4">Absender</th>
                    <th className="py-3 pr-4">Typ</th>
                    <th className="py-3 pr-4 whitespace-nowrap">Aktualisiert</th>
                    <th className="py-3 pr-0 min-w-[120px]">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedDocumentId(doc.id)}
                      className={`border-b border-border/20 transition hover:bg-background/40 ${selectedDocumentId === doc.id ? "bg-background/50" : "cursor-pointer"}`}
                    >
                      <td className="py-3 pr-4 font-medium max-w-[200px] truncate">{doc.filename}</td>
                      <td className="py-3 pr-4 text-muted-foreground max-w-[160px] truncate">{doc.userEmail}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground whitespace-nowrap">
                          {doc.reviewStatus || doc.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground max-w-[140px] truncate">{doc.folderPath}</td>
                      <td className="py-3 pr-4 max-w-[120px] truncate">{doc.absender}</td>
                      <td className="py-3 pr-4 max-w-[120px] truncate">{doc.dokumenttyp}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{fmtDateTime(doc.updatedAt)}</td>
                      <td className="py-3 pr-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDocumentId(doc.id)}
                            className="rounded-lg border border-border/40 bg-background/50 px-2.5 py-1.5 text-xs font-semibold text-foreground whitespace-nowrap hover:bg-accent/40"
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDocDeleteId(doc.id); setShowDocDeleteConfirm(true); }}
                            className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-100 whitespace-nowrap hover:bg-rose-500/20"
                          >
                            Löschen
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

          <AdminSidePanel title="Dokumentaktion" subtitle="Ordner, Status und Reanalyse an einer Stelle.">
            {selectedDocument ? (
              <>
                <div className="text-lg font-semibold">{selectedDocument.filename}</div>
                <div className="mt-1 text-sm text-muted-foreground">{selectedDocument.userEmail}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Status: {selectedDocument.reviewStatus || selectedDocument.status} · Confidence {selectedDocument.confidence == null ? "—" : selectedDocument.confidence.toFixed(2)}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Ordner</span>
                    <input
                      value={documentDraft.folderPath}
                      onChange={(e) => setDocumentDraft((prev) => ({ ...prev, folderPath: e.target.value }))}
                      list="admin-folders-datalist"
                      className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5 font-mono text-sm"
                      placeholder="Ordner auswählen oder eingeben…"
                    />
                    <datalist id="admin-folders-datalist">
                      {adminFolders.map((f) => (
                        <option key={f.id} value={f.id} label={f.parent_id ? `  └ ${f.name}` : f.name} />
                      ))}
                    </datalist>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Fälligkeit</span>
                    <input type="date" value={documentDraft.dueDate} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, dueDate: e.target.value }))} className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5" />
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <select value={documentDraft.status} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
                      <option value="uploaded">uploaded</option>
                      <option value="analyzed">analyzed</option>
                      <option value="review">review</option>
                      <option value="archived">archived</option>
                      <option value="failed">failed</option>
                      <option value="deleted">deleted</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Review-Status</span>
                    <select value={documentDraft.reviewStatus} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, reviewStatus: e.target.value }))} className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
                      <option value="auto_ready">auto_ready</option>
                      <option value="review_required">review_required</option>
                      <option value="analysis_failed">analysis_failed</option>
                    </select>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Confidence</span>
                    <input value={documentDraft.confidence} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, confidence: e.target.value }))} className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5" inputMode="decimal" />
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm">
                    <input type="checkbox" checked={documentDraft.reminderEnabled} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, reminderEnabled: e.target.checked }))} />
                    Erinnerung aktiv
                  </label>
                  <label className="sm:col-span-2 space-y-2 text-sm">
                    <span className="text-muted-foreground">Begründung</span>
                    <textarea value={documentDraft.reviewReason} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, reviewReason: e.target.value }))} className="min-h-24 w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5" />
                  </label>
                  <label className="sm:col-span-2 space-y-2 text-sm">
                    <span className="text-muted-foreground">Hinweistext</span>
                    <textarea value={documentDraft.reminderNote} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, reminderNote: e.target.value }))} className="min-h-20 w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5" />
                  </label>
                  {selectedDocument?.reminderSentAt && (
                    <div className="sm:col-span-2 rounded-xl border border-border/40 bg-background/35 px-3 py-2.5 text-sm text-muted-foreground">
                      Erinnerung gesendet: {fmtDateTime(selectedDocument.reminderSentAt)}{selectedDocument.reminderChannel ? ` · ${selectedDocument.reminderChannel}` : ""}
                    </div>
                  )}
                  <label className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm">
                    <input type="checkbox" checked={documentDraft.shouldAutoArchive} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, shouldAutoArchive: e.target.checked }))} />
                    Auto-Archivieren aktiv
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" disabled={savingDocument} onClick={() => saveDocument(selectedDocument.id)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {savingDocument ? "Speichert..." : "Speichern"}
                  </button>
                  <button type="button" disabled={reanalyzing} onClick={() => reanalyzeDocument(selectedDocument.id)} className="rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50">
                    {reanalyzing ? "Analysiert..." : "Neu analysieren"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDocDeleteId(selectedDocument.id); setShowDocDeleteConfirm(true); }}
                    className="rounded-xl bg-rose-600/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
                  >
                    Löschen
                  </button>
                </div>
              </>
            ) : (
              <EmptyHint text="Wähle ein Dokument in der Tabelle." />
            )}
          </AdminSidePanel>
        </section>
      )}

      {activeSection === "navigation" && (
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="glass rounded-2xl border-glow p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Navigation</h2>
                <p className="mt-1 text-sm text-muted-foreground">Tabs, Reihenfolge und Sichtbarkeit zentral steuern.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNavigationId(null)}
                className="rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm font-semibold text-foreground"
              >
                <Plus className="mr-1 inline h-4 w-4" />
                Neuer Eintrag
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="py-3 pr-4 min-w-[100px]">Label</th>
                    <th className="py-3 pr-4 min-w-[120px]">Pfad</th>
                    <th className="py-3 pr-4">Icon</th>
                    <th className="py-3 pr-4">Bereich</th>
                    <th className="py-3 pr-4">Rolle</th>
                    <th className="py-3 pr-4">Sichtbar</th>
                    <th className="py-3 pr-4">Reihenf.</th>
                    <th className="py-3 pr-0 min-w-[220px]">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedNavigationItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedNavigationId(item.id)}
                      className={`border-b border-border/20 transition hover:bg-background/40 ${selectedNavigationId === item.id ? "bg-background/50" : "cursor-pointer"}`}
                    >
                      <td className="py-3 pr-4 font-medium">{item.label}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{item.path}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{item.icon}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{item.section}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${item.roleRequired === "admin" ? "bg-violet-500/15 text-violet-200" : "bg-muted/40 text-muted-foreground"}`}>
                          {item.roleRequired}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{item.visible ? "Ja" : "Nein"}</td>
                      <td className="py-3 pr-4">{item.sortOrder}</td>
                      <td className="py-3 pr-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveNavigationItem(item.id, -1); }} className="rounded-lg border border-border/40 bg-background/50 p-2 text-muted-foreground hover:text-foreground" title="Nach oben">
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveNavigationItem(item.id, 1); }} className="rounded-lg border border-border/40 bg-background/50 p-2 text-muted-foreground hover:text-foreground" title="Nach unten">
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedNavigationId(item.id); }} className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">
                            Bearbeiten
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); deleteNavigationItem(item.id); }} className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 whitespace-nowrap">
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <AdminSidePanel title={selectedNavigation ? "Navigation bearbeiten" : "Navigation anlegen"} subtitle="Einträge für Tabs und Links.">
            <div className="space-y-4">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Bezeichnung</span>
                <input
                  value={navigationDraft.label}
                  onChange={(e) => setNavigationDraft((prev) => ({ ...prev, label: e.target.value }))}
                  className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
                  placeholder="z. B. Berichte"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Pfad</span>
                <input
                  value={navigationDraft.path}
                  onChange={(e) => setNavigationDraft((prev) => ({ ...prev, path: e.target.value }))}
                  className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5 font-mono text-sm"
                  placeholder="/berichte oder https://..."
                  list="navigation-path-options"
                />
                <datalist id="navigation-path-options">
                  {DEFAULT_NAVIGATION_ITEMS.map((item) => (
                    <option key={item.id} value={item.path} label={item.label} />
                  ))}
                </datalist>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Icon</span>
                <IconPicker
                  value={navigationDraft.icon}
                  onChange={(icon) => setNavigationDraft((prev) => ({ ...prev, icon }))}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Bereich</span>
                  <input
                    value={navigationDraft.section}
                    onChange={(e) => setNavigationDraft((prev) => ({ ...prev, section: e.target.value }))}
                    className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
                    placeholder="main"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Reihenfolge</span>
                  <input
                    type="number"
                    value={navigationDraft.sortOrder}
                    onChange={(e) => setNavigationDraft((prev) => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))}
                    className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Rolle</span>
                  <select
                    value={navigationDraft.roleRequired}
                    onChange={(e) => setNavigationDraft((prev) => ({ ...prev, roleRequired: e.target.value as "admin" | "user" }))}
                    className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={navigationDraft.visible}
                    onChange={(e) => setNavigationDraft((prev) => ({ ...prev, visible: e.target.checked }))}
                  />
                  Sichtbar
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={navigationDraft.isExternal}
                    onChange={(e) => setNavigationDraft((prev) => ({ ...prev, isExternal: e.target.checked }))}
                  />
                  Externer Link
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={savingNavigation}
                  onClick={() => saveNavigationItem(selectedNavigation?.id || null)}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {savingNavigation ? "Speichert..." : (selectedNavigation ? "Änderungen speichern" : "Eintrag anlegen")}
                </button>
                {selectedNavigation && (
                  <button
                    type="button"
                    onClick={() => setSelectedNavigationId(null)}
                    className="rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground"
                  >
                    Auswahl schließen
                  </button>
                )}
              </div>
            </div>
          </AdminSidePanel>
        </section>
      )}

      {activeSection === "reviews" && (
        <section className="glass rounded-2xl border-glow p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Prüfung</h2>
              <p className="mt-1 text-sm text-muted-foreground">Unsichere Dokumente gesammelt abarbeiten.</p>
            </div>
            <span className="text-xs text-muted-foreground">{reviewDocs.length} offen</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {reviewDocs.length === 0 && <div className="text-sm text-muted-foreground">Keine offenen Prüfungen.</div>}
            {reviewDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelectedDocumentId(doc.id)}
                className={`rounded-xl border border-border/40 bg-background/40 p-3 text-left text-sm transition hover:bg-background/60 ${selectedDocumentId === doc.id ? "ring-1 ring-violet-400/50" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{doc.filename}</div>
                    <div className="text-xs text-muted-foreground">{doc.userEmail} · {doc.folderPath}</div>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-200">
                    {doc.reviewStatus || doc.status}
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {doc.reviewReason || "Keine Begründung"} · Confidence {doc.confidence == null ? "—" : doc.confidence.toFixed(2)}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeSection === "reviews" && selectedDocument && (
        <AdminSidePanel title="Dokumentaktion" subtitle="Prüf-Fall bearbeiten, verschieben oder löschen.">
          <div className="text-lg font-semibold">{selectedDocument.filename}</div>
          <div className="mt-1 text-sm text-muted-foreground">{selectedDocument.userEmail}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Status: {selectedDocument.reviewStatus || selectedDocument.status} · Confidence {selectedDocument.confidence == null ? "—" : selectedDocument.confidence.toFixed(2)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Ordner</span>
              <input
                value={documentDraft.folderPath}
                onChange={(e) => setDocumentDraft((prev) => ({ ...prev, folderPath: e.target.value }))}
                list="admin-folders-datalist"
                className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5 font-mono text-sm"
                placeholder="Ordner auswählen oder eingeben…"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Review-Status</span>
              <select value={documentDraft.reviewStatus} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, reviewStatus: e.target.value }))} className="w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
                <option value="auto_ready">auto_ready</option>
                <option value="review_required">review_required</option>
                <option value="analysis_failed">analysis_failed</option>
              </select>
            </label>
            <label className="sm:col-span-2 space-y-2 text-sm">
              <span className="text-muted-foreground">Begründung</span>
              <textarea value={documentDraft.reviewReason} onChange={(e) => setDocumentDraft((prev) => ({ ...prev, reviewReason: e.target.value }))} className="min-h-20 w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={savingDocument} onClick={() => saveDocument(selectedDocument.id)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {savingDocument ? "Speichert..." : "Speichern"}
            </button>
            <button type="button" disabled={reanalyzing} onClick={() => reanalyzeDocument(selectedDocument.id)} className="rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50">
              {reanalyzing ? "Analysiert..." : "Neu analysieren"}
            </button>
            <button
              type="button"
              onClick={() => { setDocDeleteId(selectedDocument.id); setShowDocDeleteConfirm(true); }}
              className="rounded-xl bg-rose-600/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
            >
              Löschen
            </button>
          </div>
        </AdminSidePanel>
      )}
      {activeSection === "logs" && (
        <section className="glass rounded-2xl border-glow p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <ScrollText className="h-4 w-4" /> Audit-Log
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{logsTotal} Einträge insgesamt</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={logsAction}
                onChange={(e) => { setLogsAction(e.target.value); loadLogs(e.target.value); }}
                className="rounded-xl border border-border/40 bg-background/60 px-3 py-2 text-sm"
              >
                <option value="">Alle Aktionen</option>
                <option value="LOGIN_SUCCESS">Login</option>
                <option value="LOGIN_FAILED">Login fehlgeschlagen</option>
                <option value="LOGOUT">Logout</option>
                <option value="REGISTER_COMPLETED">Registrierung</option>
                <option value="ADMIN_USER_DELETED">User gelöscht</option>
              </select>
              <button
                type="button"
                onClick={() => loadLogs(logsAction)}
                className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm font-medium"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          {logsLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Logs laden...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="py-3 pr-3">Datum</th>
                    <th className="py-3 pr-3">Aktion</th>
                    <th className="py-3 pr-3">Benutzer</th>
                    <th className="py-3 pr-3">IP</th>
                    <th className="py-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-border/20 hover:bg-background/30">
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{fmtDateTime(log.created_at)}</td>
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
                      <td className="py-2 pr-3 text-muted-foreground">{log.ip || "—"}</td>
                      <td className="py-2 text-muted-foreground truncate max-w-[200px]">{log.detail || "—"}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Keine Einträge.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showDocDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl border border-rose-500/30 p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-xl bg-rose-500/15 p-2">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <h3 className="text-lg font-semibold">Dokument löschen</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Das Dokument wird als gelöscht markiert und aus dem Archiv entfernt. Diese Aktion kann <strong>nicht</strong> rückgängig gemacht werden.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowDocDeleteConfirm(false); setDocDeleteId(null); }}
                className="rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/40"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={deletingDocument}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                {deletingDocument ? "Löscht..." : "Endgültig löschen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl border border-rose-500/30 p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
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
                className="mt-2 w-full rounded-xl border border-border/40 bg-background/60 px-3 py-2.5 text-sm focus:border-rose-500/50 focus:outline-none"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                className="rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/40"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteConfirmInput !== deleteUserEmail}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
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

function StatusLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/20 px-3 py-2">
      <span>{label}</span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${ok ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"}`}>
        {ok ? <CircleCheckBig className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
        {ok ? "ok" : "aus"}
      </span>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-[118px] animate-pulse rounded-2xl border border-border/40 bg-muted/20" />;
}

function AdminSidePanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <aside className="glass rounded-2xl border-glow p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </aside>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border/40 bg-background/30 px-4 py-6 text-sm text-muted-foreground">{text}</div>;
}
