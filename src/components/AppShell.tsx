import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, ShieldCheck, ArrowRight } from "lucide-react";
import { useCallback, useState, useEffect, useRef } from "react";
import logoImg from "../assets/logo.png";
import { checkAuthStatus, clearAuthCache, readAuthCache, writeAuthCache } from "../lib/auth";
import { getIconComponent } from "../lib/iconHelper";
import { PublicEntry } from "./PublicEntry";
import UserMenu from "./UserMenu";

const TABS = [
  { to: "/", label: "Übersicht", icon: "LayoutDashboard" },
  { to: "/suche", label: "Suche", icon: "Search" },
  { to: "/zahlungen", label: "Zahlungen", icon: "Wallet" },
  { to: "/termine", label: "Termine", icon: "CalendarDays" },
  { to: "/eingang", label: "Eingang", icon: "Inbox" },
  { to: "/agents", label: "Agenten", icon: "UsersRound" },
  { to: "/admin", label: "Admin", icon: "ShieldCheck", adminOnly: true },
] as const;

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  const cachedAuth = hydrated ? readAuthCache() : null;
  const hasCachedAuthRef = useRef(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [authFailure, setAuthFailure] = useState<"unauthorized" | "error" | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isPublicPage = path === "/login" || path === "/register";
  const authCheckedRef = useRef(false);
  const authCheckInFlightRef = useRef(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (cachedAuth) {
      console.debug("[AppShell] Using cached auth state", {
        email: cachedAuth.email,
        ageMs: Date.now() - cachedAuth.at,
      });
    }
  }, [cachedAuth]);

  useEffect(() => {
    if (isPublicPage) {
      setUserEmail(null);
      setUserRole(null);
      setAuthState("unauthenticated");
      setAuthFailure(null);
      authCheckedRef.current = false;
      authCheckInFlightRef.current = false;
      hasCachedAuthRef.current = false;
      return;
    }

    if (!hydrated) {
      return;
    }

    if (cachedAuth && authState !== "authenticated") {
      setUserEmail(cachedAuth.email);
      setUserRole(cachedAuth.role || "user");
      setAuthState("authenticated");
      setAuthFailure(null);
    }

    if (authCheckedRef.current || authCheckInFlightRef.current) {
      return;
    }

    let cancelled = false;
    authCheckInFlightRef.current = true;
    if (!hasCachedAuthRef.current) {
      setAuthState("checking");
    }
    console.debug("[AppShell] Auth check start", {
      isPublicPage,
      hasCachedAuth: hasCachedAuthRef.current,
    });

    const loadUserInfo = async () => {
      try {
        const auth = await checkAuthStatus();
        if (cancelled) {
          return;
        }
        authCheckedRef.current = true;

        if (!auth.authenticated) {
          setUserEmail(null);
          setUserRole(null);
          setDisplayName(null);
          setAuthState("unauthenticated");
          if (auth.status === "unauthorized") {
            setAuthFailure("unauthorized");
            if (path !== "/" && path !== "/admin") {
              navigate({ to: "/login", replace: true });
            }
          } else {
            setAuthFailure("error");
            console.warn("[AppShell] Auth check failed without redirect:", auth.error || "unknown");
          }
          return;
        }

        setUserEmail(auth.email || null);
        setUserRole(auth.role || "user");
        setDisplayName(auth.displayName || null);
        setAuthState("authenticated");
        setAuthFailure(null);
        writeAuthCache(auth.email || null, auth.role || "user");
        hasCachedAuthRef.current = true;
        console.debug("[AppShell] Authenticated session confirmed");
      } catch (err) {
        if (cancelled) {
          return;
        }
        authCheckedRef.current = true;
        console.error("[AppShell] Failed to load user info:", err);
        setUserEmail(null);
        setUserRole(null);
        setDisplayName(null);
        setAuthState("unauthenticated");
        setAuthFailure("error");
        if (!hasCachedAuthRef.current) {
          clearAuthCache();
        }
      } finally {
        authCheckInFlightRef.current = false;
      }
    };

    loadUserInfo();

    return () => {
      cancelled = true;
    };
  }, [cachedAuth, hydrated, isPublicPage, navigate, authState, path]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.warn("[AppShell] Logout API call failed:", err);
      // logout failed but proceed anyway
    }
    setUserEmail(null);
    setUserRole(null);
    setDisplayName(null);
    setAuthState("unauthenticated");
    setAuthFailure(null);
    clearAuthCache();
    authCheckedRef.current = false;
    hasCachedAuthRef.current = false;
    navigate({ to: "/login", replace: true });
  }, [navigate]);

  // 30-minute inactivity timeout
  const handleLogoutRef = useRef(handleLogout);
  useEffect(() => {
    handleLogoutRef.current = handleLogout;
  }, [handleLogout]);

  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (isPublicPage || authState !== "authenticated") {
      return;
    }

    const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) =>
      window.addEventListener(e, resetTimer, { passive: true })
    );

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= TIMEOUT_MS) {
        handleLogoutRef.current();
      }
    }, 60_000); // Check every minute

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      clearInterval(interval);
    };
  }, [isPublicPage, authState]);

  // Monitor .modal-open class for proper nav hiding
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsModalOpen(document.documentElement.classList.contains('modal-open'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  if (isPublicPage) {
    return <Outlet />;
  }

  if (path === "/" && authState !== "authenticated" && !hasCachedAuthRef.current) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PublicEntry />
      </div>
    );
  }

  if (authState !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="glass-strong w-full max-w-lg rounded-3xl border border-border/40 p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-[0_0_18px_oklch(0.62_0.24_290/0.28)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Geschützter Bereich</p>
              <h1 className="text-xl font-semibold">
                {authFailure === "error" ? "Zugriff konnte nicht geprüft werden" : "Anmeldung erforderlich"}
              </h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {authFailure === "error"
              ? "Bitte Verbindung prüfen und die Seite erneut laden."
              : "Dieser Bereich ist nur für angemeldete Nutzer freigegeben. Bitte melde dich an, um fortzufahren."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Zur Anmeldung
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent/40"
            >
              Zur Startseite
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground scrollbar-thin">
      <>
        {/* Top nav (desktop) */}
        <header className="sticky top-0 z-40 hidden md:block">
          <div className="glass-strong border-b border-border/40">
            <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
              <Link to="/" className="flex items-center gap-2">
                <img src={logoImg} alt="nextKM" className="h-9 w-9 rounded-xl" />
                <span className="text-lg font-semibold tracking-tight">
                  nextKM
                </span>
              </Link>
              <nav className="flex items-center gap-1">
                {TABS.filter((tab) => tab.adminOnly ? userRole === "admin" : true).map(({ to, label, icon }) => {
                  const Icon = getIconComponent(icon);
                  const active = to === "/" ? path === "/" : path.startsWith(to);
                  return (
                    <Link
                      key={to}
                      to={to as any}
                      className="group relative px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {label}
                      </span>
                      {active && (
                        <motion.span
                          layoutId="nav-underline"
                          className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                          style={{ boxShadow: "0 0 12px oklch(0.62 0.24 290 / 0.7)" }}
                        />
                      )}
                    </Link>
                  );
                })}
              </nav>
              <div className="ml-auto flex items-center gap-4">
                {authState === "checking" && hasCachedAuthRef.current && (
                  <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    Sitzung wird bestätigt
                  </span>
                )}
                {userEmail && (
                  <UserMenu
                    email={userEmail}
                    displayName={displayName}
                    onLogout={handleLogout}
                  />
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 md:hidden glass-strong border-b border-border/40">
          <div className="flex items-center justify-between px-4 py-3">
            <Link to="/" className="flex items-center gap-2">
              <img src={logoImg} alt="nextKM" className="h-8 w-8 rounded-lg" />
              <span className="text-base font-semibold">
                nextKM
              </span>
            </Link>
            <div className="flex items-center gap-2">
              {authState === "checking" && hasCachedAuthRef.current && (
                <span className="text-[10px] inline-flex items-center gap-1.5 rounded-full glass px-2 py-1 text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  prüft
                </span>
              )}
              {userEmail && (
                <UserMenu
                  email={userEmail}
                  displayName={displayName}
                  onLogout={handleLogout}
                />
              )}
            </div>
          </div>
        </header>
      </>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 md:px-6 md:pb-12">
        <Outlet />
      </main>

      {/* Bottom tab bar (mobile) */}
              <nav className="fixed bottom-3 left-3 right-3 z-50 md:hidden transition-all duration-300" style={{
        transform: isModalOpen ? 'translateY(150%)' : 'translateY(0)',
        pointerEvents: isModalOpen ? 'none' : 'auto'
      }}>
        <div className="glass-strong rounded-2xl border-glow px-2 py-2">
          <ul className="flex items-center justify-between">
            {TABS.filter((tab) => tab.adminOnly ? userRole === "admin" : true).map(({ to, label, icon }) => {
              const Icon = getIconComponent(icon);
              const active = to === "/" ? path === "/" : path.startsWith(to);
              return (
                <li key={to} className="flex-1">
                  <Link
                    to={to as any}
                    className={`relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] transition ${
                      active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="tab-pill"
                        className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-500/25 to-cyan-400/20"
                        style={{ boxShadow: "inset 0 0 0 1px oklch(0.62 0.24 290 / 0.4)" }}
                      />
                    )}
                    <Icon className="relative z-10 h-5 w-5" />
                    <span className="relative z-10">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </div>
  );
}
