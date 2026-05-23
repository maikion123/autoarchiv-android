import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Trash2 } from "lucide-react";
import { ColorPicker, COLOR_PALETTE } from "./ColorPicker";
import { IconPicker } from "./IconPicker";
import { CategoryPreview } from "./CategoryPreview";
import { useAndroidBack } from "../lib/useAndroidBack";

interface Category {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface CategoryEditModalProps {
  isOpen: boolean;
  category: Category | null;
  onClose: () => void;
  onSave: (
    id: string,
    data: { name: string; color?: string; icon?: string }
  ) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function CategoryEditModal({
  isOpen,
  category,
  onClose,
  onSave,
  onDelete,
}: CategoryEditModalProps) {
  useAndroidBack(isOpen, onClose);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0].value);
  const [icon, setIcon] = useState("Folder");
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (category) {
      setName(category.name);
      setColor(category.color || COLOR_PALETTE[0].value);
      setIcon(category.icon || "Folder");
      setError("");
    }
  }, [category, isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Bitte geben Sie einen Namen ein");
      return;
    }

    if (!category) return;

    setIsLoading(true);
    setError("");

    try {
      await onSave(category.id, { name: name.trim(), color, icon });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!category || !onDelete) return;
    if (!window.confirm(`Wirklich löschen: "${category.name}"?`)) return;

    setIsDeleting(true);
    setError("");

    try {
      await onDelete(category.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && category && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                  Kategorie bearbeiten
                </h2>
                <button
                  onClick={onClose}
                  disabled={isLoading || isDeleting}
                  className="p-1 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                {/* Name Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError("");
                    }}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    className="p-3 rounded-lg bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 text-sm"
                  >
                    {error}
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex gap-3 justify-between border-t border-gray-200 dark:border-gray-700">
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={isLoading || isDeleting}
                    className="px-4 py-2 rounded-lg font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 hover:bg-red-200 dark:hover:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeleting ? "Wird gelöscht..." : "Löschen"}
                  </button>
                )}

                <div className="flex gap-3 ml-auto">
                  <button
                    onClick={onClose}
                    disabled={isLoading || isDeleting}
                    className="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isLoading || isDeleting || !name.trim()}
                    className="px-4 py-2 rounded-lg font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {isLoading ? "Wird gespeichert..." : "Speichern"}
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
