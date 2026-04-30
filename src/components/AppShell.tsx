import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { LayoutDashboard, Search, Wallet, CalendarDays, Inbox, Sparkles } from "lucide-react";

const TABS = [
  { to: "/", label: "Übersicht", Icon: LayoutDashboard },
  { to: "/suche", label: "Suche", Icon: Search },
  { to: "/zahlungen", label: "Zahlungen", Icon: Wallet },
  { to: "/termine", label: "Termine", Icon: CalendarDays },
  { to: "/eingang", label: "Eingang", Icon: Inbox },
] as const;

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen text-foreground scrollbar-thin">
      {/* Top nav (desktop) */}
      <header className="sticky top-0 z-40 hidden md:block">
        <div className="glass-strong border-b border-border/40">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 glow-primary">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
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
            <div className="ml-auto text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_oklch(0.72_0.18_155)]" />
                Lokal verschlüsselt
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 md:hidden glass-strong border-b border-border/40">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 glow-primary">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-semibold">
              Auto<span className="text-gradient">Archiv</span>
            </span>
          </Link>
          <span className="text-[10px] inline-flex items-center gap-1.5 rounded-full glass px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> sicher
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 md:px-6 md:pb-12">
        <Outlet />
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