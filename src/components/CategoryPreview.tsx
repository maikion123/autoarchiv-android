import { motion } from "framer-motion";
import * as Icons from "lucide-react";

interface CategoryPreviewProps {
  name: string;
  color: string;
  icon: string;
}

export function CategoryPreview({ name, color, icon }: CategoryPreviewProps) {
  const IconComponent = (Icons as Record<string, any>)[icon] || Icons.Folder;

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Vorschau
      </label>

      {/* Preview Container */}
      <div className="flex items-center justify-center p-8 rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* Icon Circle */}
          <motion.div
            className="relative"
            whileHover={{ scale: 1.1 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
              style={{ backgroundColor: color }}
            >
              <IconComponent className="w-10 h-10 text-white" />
            </div>

            {/* Glow Effect */}
            <div
              className="absolute inset-0 rounded-full blur-xl opacity-30"
              style={{ backgroundColor: color }}
            />
          </motion.div>

          {/* Category Name */}
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Kategoriename
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {name || "Name eingeben"}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Color Hex Display */}
      <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Farbe: {color}</span>
        <span>•</span>
        <span>Symbol: {icon}</span>
      </div>
    </div>
  );
}
