import { motion } from "framer-motion";
import { Edit2, ChevronRight } from "lucide-react";
import * as Icons from "lucide-react";

interface CategoryCardProps {
  id: string;
  name: string;
  color: string;
  icon: string;
  count?: number;
  isSubcategory?: boolean;
  onEdit?: (id: string) => void;
  onClick?: () => void;
}

export function CategoryCard({
  id,
  name,
  color,
  icon,
  count,
  isSubcategory,
  onEdit,
  onClick,
}: CategoryCardProps) {
  const IconComponent = (Icons as Record<string, any>)[icon] || Icons.Folder;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`group flex items-center gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer ${
        isSubcategory ? "ml-6" : ""
      }`}
      onClick={onClick}
    >
      {/* Icon Circle */}
      <div
        className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"
        style={{ backgroundColor: color }}
      >
        <IconComponent className="w-6 h-6 text-white" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
          {name}
        </h3>
        {count !== undefined && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {count} {count === 1 ? "Element" : "Elemente"}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(id);
            }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Bearbeiten"
          >
            <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </motion.button>
        )}
        <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
      </div>
    </motion.div>
  );
}
