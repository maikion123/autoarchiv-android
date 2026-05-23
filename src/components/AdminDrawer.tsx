import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useAndroidBack } from "../lib/useAndroidBack";

interface AdminDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Desktop side-panel slot. When provided, drawer becomes a regular inline aside on lg+. */
  inlineOnDesktop?: boolean;
}

/**
 * Responsive detail panel:
 *  - On mobile/tablet: slides up from the bottom as a full-width sheet with backdrop.
 *  - On desktop (lg+, only when `inlineOnDesktop` is set): renders as an in-flow `<aside>`
 *    in the page grid (caller wraps both list and drawer in a grid).
 *
 * The mobile sheet handles its own backdrop, swipe-to-dismiss via Framer drag, and keyboard
 * accessibility (Esc closes, body scroll lock while open).
 */
export function AdminDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  inlineOnDesktop = false,
}: AdminDrawerProps) {
  useAndroidBack(open, onClose);
  // Esc to close + body scroll lock — only while open AND we are on the small-screen path.
  // On desktop with inlineOnDesktop the panel is in-flow so locking would harm UX.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Only lock scroll on small screens — Tailwind lg breakpoint = 1024px
    const lockOnMobile = window.matchMedia("(max-width: 1023px)").matches || !inlineOnDesktop;
    let prev = "";
    if (lockOnMobile) {
      prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      if (lockOnMobile) document.body.style.overflow = prev;
    };
  }, [open, onClose, inlineOnDesktop]);

  // Desktop in-flow rendering (sticky aside in grid)
  if (inlineOnDesktop) {
    return (
      <>
        {/* Mobile/tablet bottom sheet */}
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={onClose}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              />
              <motion.aside
                key="sheet"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 320 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.3 }}
                onDragEnd={(_, info) => { if (info.offset.y > 120) onClose(); }}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border/40 bg-background shadow-2xl lg:hidden"
              >
                <DrawerInner title={title} subtitle={subtitle} onClose={onClose} grabber>
                  {children}
                </DrawerInner>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Desktop inline aside — always rendered (parent grid hides empty state via children logic) */}
        <aside className="glass rounded-2xl border-glow hidden lg:block">
          <DrawerInner title={title} subtitle={subtitle} onClose={onClose} dismissible={false}>
            {children}
          </DrawerInner>
        </aside>
      </>
    );
  }

  // Pure bottom-sheet variant (no desktop inline slot)
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.aside
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120) onClose(); }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border/40 bg-background shadow-2xl"
          >
            <DrawerInner title={title} subtitle={subtitle} onClose={onClose} grabber>
              {children}
            </DrawerInner>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerInner({
  title, subtitle, onClose, children, grabber = false, dismissible = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  grabber?: boolean;
  dismissible?: boolean;
}) {
  return (
    <div className="p-5">
      {grabber && (
        <div className="mx-auto -mt-1 mb-3 h-1.5 w-12 rounded-full bg-border/60" aria-hidden />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/40 bg-background/50 text-muted-foreground hover:text-foreground"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}
