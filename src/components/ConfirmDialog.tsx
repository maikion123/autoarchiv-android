import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useAndroidBack } from "../lib/useAndroidBack";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Bestätigen", cancelLabel = "Abbrechen", destructive, onConfirm, onCancel }: Props) {
  useAndroidBack(open, onCancel);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-md p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 22 }}
            className="glass-strong w-full max-w-md rounded-2xl border-glow p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${destructive ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold">{title}</h3>
                {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onCancel} className="rounded-lg glass px-4 py-2 text-sm hover:bg-muted">{cancelLabel}</button>
              <button
                onClick={onConfirm}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 ${
                  destructive
                    ? "bg-gradient-to-r from-rose-500 to-red-500 shadow-[0_0_18px_oklch(0.65_0.25_25/0.45)]"
                    : "bg-gradient-to-r from-violet-500 to-cyan-400"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}