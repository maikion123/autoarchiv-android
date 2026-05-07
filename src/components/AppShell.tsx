import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { LayoutDashboard, Search, Wallet, CalendarDays, Inbox, LogOut } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import logoImg from "../assets/logo.png";

const TABS = [
  { to: "/", label: "Übersicht", Icon: LayoutDashboard },
  { to: "/suche", label: "Suche", Icon: Search },
  { to: "/zahlungen", label: "Zahlungen", Icon: Wallet },
  { to: "/termine", label: "Termine", Icon: CalendarDays },
  { to: "/eingang", label: "Eingang", Icon: Inbox },
] as const;

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (!res.ok) {
          setUserEmail(null);
          if (path !== "/login" && path !== "/register") {
            navigate({ to: "/login" });
          }
          return;
        }

        const data = await res.json();
        setUserEmail(data.email);
      } catch {
        setUserEmail(null);
        if (path !== "/login" && path !== "/register") {
          navigate({ to: "/login" });
        }
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [path, navigate]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // logout failed but proceed anyway
    }
    setUserEmail(null);
    navigate({ to: "/login" });
  };

  // 30-minute inactivity timeout
  const handleLogoutRef = useRef(handleLogout);
  useEffect(() => {
    handleLogoutRef.current = handleLogout;
  }, [handleLogout]);

  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
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
  }, []);

  return (
    <div className="min-h-screen text-foreground scrollbar-thin">
      {/* Top nav (desktop) */}
      <header className="sticky top-0 z-40 hidden md:block">
        <div className="glass-strong border-b border-border/40">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
            <Link to="/" className="flex items-center gap-2">
              <img src={logoImg} alt="nextKM Logo" className="h-9 w-9 rounded-xl" />
              <span className="text-lg font-semibold tracking-tight">
                Auto<span className="text-gradient">Archiv</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {TABS.map(({ to, label, Icon }) => {
                const active = to === "/" ? path === "/" : path.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
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
              <div className="text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_oklch(0.72_0.18_155)]" />
                  Lokal verschlüsselt
                </span>
              </div>
              {userEmail && (
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground transition rounded-lg bg-accent/40 hover:bg-accent/60 border border-accent/40 hover:border-accent/80"
                  title={userEmail || "Abmelden"}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs max-w-[150px] truncate">{userEmail?.split("@")[0]}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 md:hidden glass-strong border-b border-border/40">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoImg} alt="nextKM Logo" className="h-8 w-8 rounded-lg" />
            <span className="text-base font-semibold">
              Auto<span className="text-gradient">Archiv</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[10px] inline-flex items-center gap-1.5 rounded-full glass px-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> sicher
            </span>
            {userEmail && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition rounded-lg hover:bg-accent"
                title="Abmelden"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 md:px-6 md:pb-12">
        {!isChecking && <Outlet />}
      </main>

      {/* Bottom tab bar (mobile) */}
      <nav className="fixed bottom-3 left-3 right-3 z-50 md:hidden">
        <div className="glass-strong rounded-2xl border-glow px-2 py-2">
          <ul className="flex items-center justify-between">
            {TABS.map(({ to, label, Icon }) => {
              const active = to === "/" ? path === "/" : path.startsWith(to);
              return (
                <li key={to} className="flex-1">
                  <Link
                    to={to}
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