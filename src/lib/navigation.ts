export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  section: string;
  sortOrder: number;
  visible: boolean;
  roleRequired: "user" | "admin";
  isExternal: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_NAVIGATION_ITEMS: NavigationItem[] = [
  { id: "nav-overview", label: "Übersicht", path: "/", icon: "LayoutDashboard", section: "main", sortOrder: 10, visible: true, roleRequired: "user", isExternal: false },
  { id: "nav-search", label: "Suche", path: "/suche", icon: "Search", section: "main", sortOrder: 20, visible: true, roleRequired: "user", isExternal: false },
  { id: "nav-payments", label: "Zahlungen", path: "/zahlungen", icon: "Wallet", section: "main", sortOrder: 30, visible: true, roleRequired: "user", isExternal: false },
  { id: "nav-appointments", label: "Termine", path: "/termine", icon: "CalendarDays", section: "main", sortOrder: 40, visible: true, roleRequired: "user", isExternal: false },
  { id: "nav-inbox", label: "Eingang", path: "/eingang", icon: "Inbox", section: "main", sortOrder: 50, visible: true, roleRequired: "user", isExternal: false },
  { id: "nav-agents", label: "Agenten", path: "/agents", icon: "UsersRound", section: "main", sortOrder: 60, visible: true, roleRequired: "user", isExternal: false },
  { id: "nav-admin", label: "Admin", path: "/admin", icon: "ShieldCheck", section: "admin", sortOrder: 70, visible: true, roleRequired: "admin", isExternal: false },
];

export async function loadNavigationItems(): Promise<NavigationItem[]> {
  if (typeof window === "undefined") return DEFAULT_NAVIGATION_ITEMS;
  try {
    const res = await fetch("/api/navigation", { credentials: "include", cache: "no-store" });
    if (!res.ok) return DEFAULT_NAVIGATION_ITEMS;
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map(normalizeNavigationItem).filter(Boolean) as NavigationItem[];
  } catch {
    return DEFAULT_NAVIGATION_ITEMS;
  }
}

export async function loadAdminNavigationItems(): Promise<NavigationItem[]> {
  if (typeof window === "undefined") return DEFAULT_NAVIGATION_ITEMS;
  try {
    const res = await fetch("/api/admin/navigation", { credentials: "include", cache: "no-store" });
    if (!res.ok) return DEFAULT_NAVIGATION_ITEMS;
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map(normalizeNavigationItem).filter(Boolean) as NavigationItem[];
  } catch {
    return DEFAULT_NAVIGATION_ITEMS;
  }
}

function normalizeNavigationItem(item: any): NavigationItem | null {
  if (!item || typeof item !== "object") return null;
  const label = String(item.label || "").trim();
  const path = String(item.path || "").trim();
  if (!label || !path) return null;
  return {
    id: String(item.id || ""),
    label,
    path,
    icon: String(item.icon || "Folder"),
    section: String(item.section || "main"),
    sortOrder: Number(item.sortOrder ?? item.sort_order ?? 0) || 0,
    visible: Boolean(item.visible ?? true),
    roleRequired: item.roleRequired === "admin" || item.role_required === "admin" ? "admin" : "user",
    isExternal: Boolean(item.isExternal ?? item.is_external ?? false),
    createdAt: item.createdAt || item.created_at,
    updatedAt: item.updatedAt || item.updated_at,
  };
}
