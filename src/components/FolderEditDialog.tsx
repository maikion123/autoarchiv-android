import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Trash2 } from "lucide-react";
import { ColorPicker, COLOR_PALETTE } from "./ColorPicker";
import { IconPicker } from "./IconPicker";
import { CategoryPreview } from "./CategoryPreview";
import { type FolderNode } from "../lib/folders";

interface FolderEditDialogProps {
  isOpen: boolean;
  folder: FolderNode | null;
  onClose: () => void;
  onSave: (data: { name?: string; color?: string; icon?: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function FolderEditDialog({
  isOpen,
  folder,
  onClose,
  onSave,
  onDelete,
}: FolderEditDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0].value);
  const [icon, setIcon] = useState("Folder");
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (folder && isOpen) {
      setName(folder.name);
      setColor(folder.color || COLOR_PALETTE[0].value);
      setIcon(folder.icon || "Folder");
      setError("");
    }
  }, [folder, isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Bitte geben Sie einen Ordnernamen ein");
      return;
    }

    if (!folder) return;

    setIsLoading(true);
    setError("");

    try {
      await onSave({ name: name.trim(), color, icon });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!folder || !onDelete) return;
    if (!window.confirm(`Wirklich löschen: "${folder.name}"?`)) return;

    setIsDeleting(true);
    setError("");

    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {isOpen && folder && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]"
          />

          {/* Modal - Mobile: Bottom Sheet, Desktop: Centered */}
          <motion.div
            key={folder.id}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[61] rounded-t-2xl
                       sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2
                       sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2
                       sm:w-full sm:max-w-md sm:rounded-2xl"
          >
            <div className="glass border-glow rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-gradient-to-r from-orange-500/20 to-cyan-400/20">
                <h2 className="text-lg font-bold text-foreground">
                  Ordner bearbeiten
                </h2>
                <button
                  onClick={onClose}
                  disabled={isLoading || isDeleting}
                  className="p-1 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-5 max-h-[80dvh] sm:max-h-[calc(90vh-120px)] overflow-y-auto">
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
              <div className="bg-muted/20 px-6 py-4 flex gap-3 justify-between border-t border-border/40 flex-wrap">
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={isLoading || isDeleting}
                    className="px-4 py-2 rounded-xl font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeleting ? "Löscht..." : "Löschen"}
                  </button>
                )}

                <div className="flex gap-3 ml-auto">
                  <button
                    onClick={onClose}
                    disabled={isLoading || isDeleting}
                    className="px-4 py-2 rounded-xl font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isLoading || isDeleting || !name.trim()}
                    className="px-4 py-2 rounded-xl font-medium bg-gradient-to-r from-orange-500 to-cyan-400 text-white hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {isLoading ? "Speichert..." : "Speichern"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
