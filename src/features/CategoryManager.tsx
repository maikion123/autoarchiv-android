import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Folder } from "lucide-react";
import { toast } from "sonner";
import { createFolder, renameFolder, deleteFolder, type FolderNode, loadFolderTree } from "../lib/folders";
import { CategoryCard } from "../components/CategoryCard";
import { CategoryCreateModal } from "../components/CategoryCreateModal";
import { CategoryEditModal } from "../components/CategoryEditModal";
import * as Icons from "lucide-react";

interface Category {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface CategoryManagerProps {
  onFolderSelect?: (folderId: string) => void;
  layout?: "grid" | "list";
}

export function CategoryManager({
  onFolderSelect,
  layout = "list",
}: CategoryManagerProps) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Category | null>(null);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const tree = await loadFolderTree();
      setFolders(tree);
    } catch (err) {
      toast.error("Ordner konnten nicht geladen werden");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async (data: {
    name: string;
    color: string;
    icon: string;
  }) => {
    try {
      await createFolder(selectedParent, data.name, data.color, data.icon);
      await loadFolders();
      setSelectedParent(null);
      toast.success("Kategorie erstellt");
    } catch (err) {
      throw err;
    }
  };

  const handleEditCategory = async (
    id: string,
    data: { name?: string; color?: string; icon?: string }
  ) => {
    try {
      await renameFolder(id, data.name, data.color, data.icon);
      await loadFolders();
      toast.success("Kategorie aktualisiert");
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteFolder(id);
      await loadFolders();
      toast.success("Kategorie gelöscht");
    } catch (err) {
      throw err;
    }
  };

  const handleFolderClick = (folderId: string) => {
    if (onFolderSelect) {
      onFolderSelect(folderId);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Folder className="w-8 h-8 text-gray-400" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Kategorien
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {folders.length} {folders.length === 1 ? "Kategorie" : "Kategorien"}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setSelectedParent(null);
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Neue Kategorie
        </motion.button>
      </div>

      {/* Categories */}
      <div className={layout === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
        {folders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-full text-center py-12"
          >
            <Folder className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Keine Kategorien vorhanden
            </p>
          </motion.div>
        ) : (
          folders.map((folder) => (
            <CategoryCard
              key={folder.id}
              id={folder.id}
              name={folder.name}
              color={folder.color || "#3b82f6"}
              icon={folder.icon || "Folder"}
              onEdit={() => {
                setEditingFolder({
                  id: folder.id,
                  name: folder.name,
                  color: folder.color,
                  icon: folder.icon,
                });
                setShowEditModal(true);
              }}
              onClick={() => handleFolderClick(folder.id)}
            />
          ))
        )}
      </div>

      {/* Modals */}
      <CategoryCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateCategory}
        parentName={
          selectedParent
            ? folders.find((f) => f.id === selectedParent)?.name
            : undefined
        }
      />

      <CategoryEditModal
        isOpen={showEditModal}
        category={editingFolder}
        onClose={() => {
          setShowEditModal(false);
          setEditingFolder(null);
        }}
        onSave={handleEditCategory}
        onDelete={handleDeleteCategory}
      />
    </div>
  );
}
