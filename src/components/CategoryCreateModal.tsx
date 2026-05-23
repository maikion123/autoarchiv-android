import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle } from "lucide-react";
import { ColorPicker, COLOR_PALETTE } from "./ColorPicker";
import { IconPicker } from "./IconPicker";
import { CategoryPreview } from "./CategoryPreview";
import { useAndroidBack } from "../lib/useAndroidBack";

interface CategoryCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (category: { name: string; color: string; icon: string }) => Promise<void>;
  parentName?: string;
}

export function CategoryCreateModal({
  isOpen,
  onClose,
  onCreate,
  parentName,
}: CategoryCreateModalProps) {
  useAndroidBack(isOpen, onClose);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0].value);
  const [icon, setIcon] = useState("Folder");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Bitte geben Sie einen Namen ein");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await onCreate({ name: name.trim(), color, icon });
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
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Neue Kategorie
                  </h2>
                  {parentName && (
                    <p className="text-blue-100 text-sm">{parentName}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="p-1 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50"
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
                    placeholder="z.B. Reisedokumente"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex gap-3 justify-end border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isLoading || !name.trim()}
                  className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isLoading ? "Wird erstellt..." : "Erstellen"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
