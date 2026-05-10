import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { type FolderNode } from "../lib/folders";
import { type ArchivedDoc } from "../lib/db";

interface FolderDeleteDialogProps {
  isOpen: boolean;
  folder: FolderNode | null;
  documents: ArchivedDoc[];
  folders: FolderNode[];
  onClose: () => void;
  onConfirmDelete: () => Promise<void>;
  onConfirmMove: (targetFolderId: string) => Promise<void>;
}

export function FolderDeleteDialog({
  isOpen,
  folder,
  documents,
  folders,
  onClose,
  onConfirmDelete,
  onConfirmMove,
}: FolderDeleteDialogProps) {
  const [mode, setMode] = useState<"options" | "delete" | "move">("options");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const documentsInFolder = useMemo(() => {
    if (!folder) return [];
    return documents.filter(
      (d) => d.folderPath === folder.id || d.folderPath.startsWith(folder.id + "/")
    );
  }, [folder, documents]);

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await onConfirmDelete();
      onClose();
    } catch (err) {
      setIsLoading(false);
    }
  };

  const handleMove = async () => {
    if (!selectedTarget) return;
    setIsLoading(true);
    try {
      await onConfirmMove(selectedTarget);
      onClose();
    } catch (err) {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && folder && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-md p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 22 }}
            className="glass-strong w-full max-w-md rounded-2xl border-glow p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "options" && documentsInFolder.length > 0 && (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Ordner enthält {documentsInFolder.length} Dokument{documentsInFolder.length !== 1 ? "e" : ""}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Was möchten Sie mit den Dokumenten tun?
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => setMode("move")}
                    className="w-full p-4 rounded-xl border border-blue-500/40 bg-blue-500/10 text-left hover:bg-blue-500/20 transition-colors"
                  >
                    <div className="font-medium text-blue-300">Verschieben</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Alle Dokumente in andere Kategorie verschieben
                    </div>
                  </button>

                  <button
                    onClick={() => setMode("delete")}
                    className="w-full p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-left hover:bg-destructive/20 transition-colors"
                  >
                    <div className="font-medium text-destructive">Löschen</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Ordner UND alle Dokumente unwiederbringlich löschen
                    </div>
                  </button>

                  <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="w-full p-4 rounded-xl border border-border/40 hover:bg-muted transition-colors text-foreground"
                  >
                    Abbrechen
                  </button>
                </div>
              </>
            )}

            {mode === "move" && (
              <>
                <h3 className="text-lg font-semibold mb-4">Zielkategorie wählen</h3>
                <div className="space-y-2 mb-6 max-h-72 overflow-y-auto">
                  {folders
                    .filter((f) => f.id !== folder.id)
                    .map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedTarget(f.id)}
                        className={`w-full p-3 rounded-xl text-left transition-colors ${
                          selectedTarget === f.id
                            ? "bg-blue-500/30 border border-blue-500/60 text-foreground"
                            : "border border-border/40 hover:bg-muted"
                        }`}
                      >
                        <div className="font-medium">{f.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {documents.filter(
                            (d) => d.folderPath === f.id || d.folderPath.startsWith(f.id + "/")
                          ).length} Dokumente
                        </div>
                      </button>
                    ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setMode("options")}
                    disabled={isLoading}
                    className="flex-1 p-3 rounded-xl border border-border/40 hover:bg-muted transition-colors text-foreground"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={handleMove}
                    disabled={!selectedTarget || isLoading}
                    className="flex-1 p-3 rounded-xl bg-blue-500/30 border border-blue-500/60 text-blue-300 font-medium hover:bg-blue-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Verschiebt..." : "Verschieben"}
                  </button>
                </div>
              </>
            )}

            {mode === "delete" && (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-destructive">Warnung!</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Der Ordner <span className="font-semibold text-foreground">„{folder.name}"</span> mit{" "}
                      <span className="font-semibold text-destructive">
                        {documentsInFolder.length} Dokument{documentsInFolder.length !== 1 ? "en" : ""}
                      </span>{" "}
                      werden <span className="font-semibold text-destructive">UNWIEDERBRINGLICH GELÖSCHT</span>.
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">
                      Diese Aktion kann nicht rückgängig gemacht werden.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setMode("options")}
                    disabled={isLoading}
                    className="flex-1 p-3 rounded-xl border border-border/40 hover:bg-muted transition-colors text-foreground"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isLoading}
                    className="flex-1 p-3 rounded-xl bg-destructive/30 border border-destructive/60 text-destructive font-medium hover:bg-destructive/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Löscht..." : "Ja, unwiederbringlich löschen"}
                  </button>
                </div>
              </>
            )}

            {documentsInFolder.length === 0 && mode === "options" && (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-foreground">Ordner löschen?</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      „{folder.name}" ist leer und wird dauerhaft gelöscht.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="flex-1 p-3 rounded-xl border border-border/40 hover:bg-muted transition-colors text-foreground"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isLoading}
                    className="flex-1 p-3 rounded-xl bg-destructive/30 border border-destructive/60 text-destructive font-medium hover:bg-destructive/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Löscht..." : "Löschen"}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
