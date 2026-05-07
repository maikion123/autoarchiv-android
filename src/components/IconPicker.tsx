import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import * as Icons from "lucide-react";

export const AVAILABLE_ICONS = [
  "Folder",
  "FolderOpen",
  "Calendar",
  "Briefcase",
  "Home",
  "Building",
  "Plane",
  "Car",
  "Train",
  "Bike",
  "Map",
  "Globe",
  "Heart",
  "Star",
  "Book",
  "GraduationCap",
  "ShoppingBag",
  "CreditCard",
  "Wallet",
  "Banknote",
  "Receipt",
  "PiggyBank",
  "Coffee",
  "Pizza",
  "Utensils",
  "Music",
  "Headphones",
  "Camera",
  "Film",
  "Gamepad2",
  "Monitor",
  "Laptop",
  "Smartphone",
  "Code",
  "Database",
  "Server",
  "Cloud",
  "Shield",
  "Lock",
  "Key",
  "Bell",
  "Users",
  "User",
  "Contact",
  "Dumbbell",
  "Activity",
  "Clipboard",
  "CheckCircle",
  "Target",
  "Rocket",
  "Lightbulb",
  "Flame",
  "Leaf",
  "Gift",
  "Bookmark",
  "Archive",
  "Package",
  "Truck",
  "Wrench",
  "Hammer",
  "Paintbrush",
  "PenTool",
  "Mic",
  "Video",
  "Image",
  "FileText",
  "Files",
  "Mail",
  "MessageCircle",
  "Phone",
  "Timer",
  "Clock",
  "AlarmClock",
  "Sparkles",
  "ShieldCheck",
  "FileSignature",
  "Landmark",
  "HeartPulse",
  "AlertTriangle",
  "ChevronRight",
  "Eye",
  "Trash2",
  "Download",
  "Edit2",
  "Plus",
  "Minus",
  "ChevronDown",
  "Menu",
] as const;

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    return AVAILABLE_ICONS.filter((icon) =>
      icon.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  const CurrentIcon = (Icons as Record<string, any>)[value] || Icons.Folder;

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">
        Symbol
      </label>

      {/* Button to open picker */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-2 rounded-xl border border-border bg-input/50 text-foreground hover:border-border/60 transition-colors text-sm"
        whileHover={{ scale: 1.02 }}
      >
        <CurrentIcon className="w-5 h-5 flex-shrink-0" />
        <span className="truncate">{value}</span>
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute left-0 right-0 z-50 mx-auto w-full max-w-md mt-2 rounded-xl border border-border bg-input/80 backdrop-blur-sm shadow-lg p-4 space-y-3"
          >
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                placeholder="Suche Symbol..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-border/50 bg-muted/20 text-foreground placeholder-muted-foreground"
              />
            </div>

            {/* Icon Grid */}
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-64 sm:max-h-80 overflow-y-auto">
              {filtered.map((icon) => {
                const IconComponent = (Icons as Record<string, any>)[icon];
                return (
                  <motion.button
                    key={icon}
                    onClick={() => {
                      onChange(icon);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`p-3 rounded-lg transition-all flex items-center justify-center ${
                      value === icon
                        ? "bg-gradient-to-br from-violet-500 to-cyan-400 text-white ring-2 ring-violet-300 dark:ring-violet-600 shadow-lg"
                        : "bg-muted/30 text-foreground hover:bg-muted/60 dark:hover:bg-muted/40"
                    }`}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    title={icon}
                  >
                    <IconComponent className="w-6 h-6" />
                  </motion.button>
                );
              })}
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Keine Symbole gefunden
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
