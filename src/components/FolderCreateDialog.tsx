import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle } from "lucide-react";
import { ColorPicker, COLOR_PALETTE } from "./ColorPicker";
import { IconPicker } from "./IconPicker";
import { CategoryPreview } from "./CategoryPreview";
import { type FolderNode } from "../lib/folders";
import { useAndroidBack } from "../lib/useAndroidBack";

interface FolderCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; color: string; icon: string; parentId: string | null }) => Promise<void>;
  parentId: string | null;
  parentName?: string;
  folders: FolderNode[];
}

export function FolderCreateDialog({
  isOpen,
  onClose,
  onCreate,
  parentId,
  parentName,
  folders,
}: FolderCreateDialogProps) {
  useAndroidBack(isOpen, onClose);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0].value);
  const [icon, setIcon] = useState("Folder");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Bitte geben Sie einen Ordnernamen ein");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onCreate({ name: name.trim(), color, icon, parentId });
      setName("");
      setColor(COLOR_PALETTE[0].value);
      setIcon("Folder");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
    } finally {
      setIsLoading(false);
    }
  };

  const parentDisplay = parentId
    ? folders.find((f) => f.id === parentId)?.name || "Unterordner"
    : "Hauptordner";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-h-[90vh] w-auto max-w-md mx-auto sm:inset-x-auto"
          >
            <div className="glass border-glow rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-gradient-to-r from-violet-500/20 to-cyan-400/20">
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    Neuer Ordner
                  </h2>
                  <p className="text-muted-foreground text-sm">{parentDisplay}</p>
                </div>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="p-1 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-5 max-h-[calc(90vh-120px)] overflow-y-auto">
                {/* Name Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Ordnername
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError("");
                    }}
                    placeholder="z.B. Versicherungen"
                    className="w-full px-4 py-2 rounded-xl border border-border bg-input/50 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                {/* Color Picker */}
                <ColorPicker value={color} onChange={setColor} />

                {/* Icon Picker */}
                <IconPicker value={icon} onChange={setIcon} />

                {/* Preview */}
                <CategoryPreview name={name} color={color} icon={icon} />

                {/* Error Message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20"
                  >
                    {error}
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-muted/20 px-6 py-4 flex gap-3 justify-end border-t border-border/40">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isLoading || !name.trim()}
                  className="px-4 py-2 rounded-xl font-medium bg-gradient-to-r from-violet-500 to-cyan-400 text-white hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isLoading ? "Wird erstellt..." : "Anlegen"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
