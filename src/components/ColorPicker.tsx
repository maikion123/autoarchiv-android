import { motion } from "framer-motion";

export interface ColorOption {
  name: string;
  value: string;
  lightValue: string; // Für Light Mode
}

export const COLOR_PALETTE: ColorOption[] = [
  { name: "Blau", value: "#3b82f6", lightValue: "#dbeafe" },
  { name: "Türkis", value: "#06b6d4", lightValue: "#cffafe" },
  { name: "Grün", value: "#10b981", lightValue: "#d1fae5" },
  { name: "Lime", value: "#84cc16", lightValue: "#e4fde8" },
  { name: "Gelb", value: "#eab308", lightValue: "#fefce8" },
  { name: "Orange", value: "#f97316", lightValue: "#ffedd5" },
  { name: "Rot", value: "#ef4444", lightValue: "#fee2e2" },
  { name: "Pink", value: "#ec4899", lightValue: "#fce7f3" },
  { name: "Lila", value: "#a855f7", lightValue: "#f3e8ff" },
  { name: "Indigo", value: "#6366f1", lightValue: "#e0e7ff" },
  { name: "Grau", value: "#6b7280", lightValue: "#f3f4f6" },
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">
        Farbe
      </label>
      <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-3">
        {COLOR_PALETTE.map((color) => (
          <motion.button
            key={color.value}
            onClick={() => onChange(color.value)}
            className="relative group"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            {/* Bubble */}
            <div
              className={`h-10 w-10 rounded-full transition-all duration-200 shadow-md hover:shadow-lg ${
                value === color.value
                  ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-600 dark:ring-offset-gray-900"
                  : "hover:shadow-xl"
              }`}
              style={{ backgroundColor: color.value }}
            />
            {/* Label on Hover */}
            <span className="absolute bottom-full mb-2 text-xs font-medium text-foreground bg-muted px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {color.name}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
