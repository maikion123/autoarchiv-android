import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import * as Icons from "lucide-react";

export const AVAILABLE_ICONS = [
  "Folder",
  "FolderOpen",
  "FolderPlus",
  "FolderX",
  "FolderCheck",
  "Calendar",
  "CalendarDays",
  "CalendarPlus",
  "Briefcase",
  "Home",
  "Building",
  "Building2",
  "Plane",
  "PlaneLanding",
  "Car",
  "CarFront",
  "Train",
  "Bike",
  "Truck",
  "Map",
  "MapPin",
  "Globe",
  "Heart",
  "HeartHandshake",
  "Star",
  "StarOff",
  "Book",
  "BookOpen",
  "BookMarked",
  "GraduationCap",
  "ShoppingBag",
  "ShoppingCart",
  "CreditCard",
  "Wallet",
  "Banknote",
  "DollarSign",
  "EuroIcon",
  "Receipt",
  "ReceiptText",
  "PiggyBank",
  "TrendingUp",
  "TrendingDown",
  "BarChart3",
  "LineChart",
  "PieChart",
  "Coffee",
  "Pizza",
  "Utensils",
  "Wine",
  "Music",
  "Music2",
  "Headphones",
  "Headset",
  "Camera",
  "CameraOff",
  "Film",
  "MovieIcon",
  "Gamepad2",
  "Joystick",
  "Monitor",
  "Laptop",
  "Smartphone",
  "Code",
  "CodeSquare",
  "Brackets",
  "Database",
  "DatabaseBackup",
  "Server",
  "Cloud",
  "CloudLightning",
  "Shield",
  "ShieldAlert",
  "ShieldCheck",
  "Lock",
  "LockOpen",
  "Key",
  "KeyRound",
  "Bell",
  "BellOff",
  "Users",
  "User",
  "UserPlus",
  "Contact",
  "Contacts",
  "Dumbbell",
  "Activity",
  "ActivitySquare",
  "Clipboard",
  "ClipboardList",
  "CheckCircle",
  "CheckCircle2",
  "Target",
  "Rocket",
  "Lightbulb",
  "LightbulbOff",
  "Flame",
  "Zap",
  "Leaf",
  "Sprout",
  "Gift",
  "GiftOpen",
  "Bookmark",
  "BookmarkCheck",
  "Archive",
  "ArchiveX",
  "Package",
  "Package2",
  "Wrench",
  "WrenchIcon",
  "Hammer",
  "Hammer2",
  "Paintbrush",
  "PaintbrushVertical",
  "PenTool",
  "Pencil",
  "Edit",
  "Edit2",
  "Edit3",
  "Mic",
  "MicOff",
  "Video",
  "VideoOff",
  "Image",
  "ImagePlus",
  "FileText",
  "File",
  "Files",
  "FileStack",
  "Mail",
  "MailOpen",
  "MessageCircle",
  "MessageSquare",
  "Phone",
  "PhoneOff",
  "PhoneIncoming",
  "PhoneOutgoing",
  "Timer",
  "TimerOff",
  "Clock",
  "Clock1",
  "Clock2",
  "Clock3",
  "AlarmClock",
  "Hourglass",
  "HourglassEnd",
  "Sparkles",
  "Sparkle",
  "Star",
  "FileSignature",
  "Landmark",
  "HeartPulse",
  "AlertTriangle",
  "AlertCircle",
  "AlertSquare",
  "CheckCheck",
  "Eye",
  "EyeOff",
  "Trash2",
  "Trash",
  "Download",
  "Upload",
  "Send",
  "Reply",
  "Plus",
  "Minus",
  "X",
  "ChevronDown",
  "ChevronRight",
  "Menu",
  "Settings",
  "SettingsIcon",
  "Sliders",
  "Filter",
  "Search",
  "Map",
  "Navigation",
  "Compass",
  "AtSign",
  "Award",
  "Trophy",
  "Medal",
] as const;

export const ICON_GERMAN_LABELS: Record<string, string[]> = {
  "Folder": ["ordner", "verzeichnis", "datei"],
  "FolderOpen": ["ordner offen", "ordner geöffnet"],
  "FolderPlus": ["ordner hinzufügen", "neuer ordner"],
  "FolderX": ["ordner löschen", "ordner entfernen"],
  "FolderCheck": ["ordner bestätigt", "ordner fertig"],
  "Calendar": ["kalender", "termin", "datum"],
  "CalendarDays": ["kalender tage", "wochenansicht"],
  "CalendarPlus": ["termin hinzufügen", "event erstellen"],
  "Briefcase": ["koffer", "arbeit", "geschäft", "beruf"],
  "Home": ["zuhause", "startseite", "haus"],
  "Building": ["gebäude", "büro", "unternehmen"],
  "Building2": ["gebäude alt", "immobilie"],
  "Plane": ["flugzeug", "reise", "flug"],
  "PlaneLanding": ["flugzeug landen", "ankunft"],
  "Car": ["auto", "fahrzeug", "wagen", "kraftwagen"],
  "CarFront": ["auto vorne", "fahrzeug"],
  "Train": ["zug", "bahn", "eisenbahn"],
  "Bike": ["fahrrad", "rad", "motorrad"],
  "Truck": ["lastwagen", "lieferwagen", "transport"],
  "Map": ["karte", "landkarte", "gebiet"],
  "MapPin": ["kartenpin", "standort", "ort"],
  "Globe": ["erdball", "welt", "global", "international"],
  "Heart": ["herz", "liebe", "favorit"],
  "HeartHandshake": ["herz handschlag", "solidarität"],
  "Star": ["stern", "favorit", "bewertung"],
  "StarOff": ["stern aus", "nicht favorit"],
  "Book": ["buch", "notizbuch", "manual"],
  "BookOpen": ["buch offen", "lehrbuch", "lektüre"],
  "BookMarked": ["lesezeichen", "markiert"],
  "GraduationCap": ["abschluss", "studium", "bildung", "schule"],
  "ShoppingBag": ["einkaufstasche", "shopping", "einkaufen"],
  "ShoppingCart": ["warenkorb", "einkauf"],
  "CreditCard": ["kreditkarte", "bankcard"],
  "Wallet": ["geldbörse", "portemonnaie", "geldkasten"],
  "Banknote": ["geldschein", "geld", "währung"],
  "DollarSign": ["dollar", "währung", "geld"],
  "EuroIcon": ["euro", "währung", "geld"],
  "Receipt": ["quittung", "beleg", "rechnung"],
  "ReceiptText": ["beleg text", "rechnungstext"],
  "PiggyBank": ["spardose", "sparbüchse", "ersparnis"],
  "TrendingUp": ["trend steigend", "aufwärts", "wachstum"],
  "TrendingDown": ["trend fallend", "abwärts", "rückgang"],
  "BarChart3": ["balkendiagramm", "statistik", "grafik"],
  "LineChart": ["liniendiagramm", "kurve", "diagramm"],
  "PieChart": ["kreisdiagramm", "tortendiagramm", "prozentual"],
  "Coffee": ["kaffee", "getränk", "café"],
  "Pizza": ["pizza", "lebensmittel", "essen"],
  "Utensils": ["besteck", "essbesteck", "messer gabel"],
  "Wine": ["wein", "alkohol", "getränk"],
  "Music": ["musik", "lied", "audio"],
  "Music2": ["musik alt", "melodie"],
  "Headphones": ["kopfhörer", "headset", "audio"],
  "Headset": ["headset", "kopfhörer"],
  "Camera": ["kamera", "foto", "fotografie", "bild"],
  "CameraOff": ["kamera aus", "fotografie deaktiviert"],
  "Film": ["film", "video", "kinofilm"],
  "MovieIcon": ["film", "kino", "video"],
  "Gamepad2": ["spielpaddle", "controller", "spiel"],
  "Joystick": ["joystick", "spielcontroller"],
  "Monitor": ["monitor", "bildschirm", "anzeige"],
  "Laptop": ["laptop", "notebook", "computer"],
  "Smartphone": ["telefon", "handy", "mobil"],
  "Code": ["code", "programmieren", "quellcode"],
  "CodeSquare": ["code quadrat", "programmierung"],
  "Brackets": ["klammern", "code"],
  "Database": ["datenbank", "datenserver", "speicher"],
  "DatabaseBackup": ["datenbank sicherung", "backup"],
  "Server": ["server", "rechner", "datenserver"],
  "Cloud": ["cloud", "wolke", "speicher"],
  "CloudLightning": ["cloud blitz", "gewitter"],
  "Shield": ["schild", "schutz", "sicherheit", "verteidigung"],
  "ShieldAlert": ["schild warnung", "sicherheitswarnung"],
  "ShieldCheck": ["schild haken", "gesichert", "geschützt"],
  "Lock": ["schloss", "verschlossen", "gesperrt"],
  "LockOpen": ["schloss offen", "entsperrt"],
  "Key": ["schlüssel", "passwort", "zugang"],
  "KeyRound": ["schlüssel rund", "zugang"],
  "Bell": ["glocke", "benachrichtigung", "warnton"],
  "BellOff": ["glocke aus", "benachrichtigung deaktiviert"],
  "Users": ["benutzer", "personen", "team", "gruppe"],
  "User": ["benutzer", "person", "profil", "benutzer"],
  "UserPlus": ["benutzer hinzufügen", "neuer benutzer"],
  "Contact": ["kontakt", "person", "adresse"],
  "Contacts": ["kontakte", "adressbuch"],
  "Dumbbell": ["hantel", "fitness", "sport", "gewicht"],
  "Activity": ["aktivität", "bewegung", "puls"],
  "ActivitySquare": ["aktivität quadrat", "bewegung"],
  "Clipboard": ["zwischenablage", "notizen", "liste"],
  "ClipboardList": ["checkliste", "aufgabenliste"],
  "CheckCircle": ["häkchen kreis", "bestätigt", "erledigt"],
  "CheckCircle2": ["häkchen kreis alt", "gesichert"],
  "Target": ["ziel", "bullseye", "zielscheibe"],
  "Rocket": ["rakete", "start", "launch"],
  "Lightbulb": ["glühbirne", "idee", "licht"],
  "LightbulbOff": ["glühbirne aus", "dunkel"],
  "Flame": ["flamme", "feuer", "hitze", "brand"],
  "Zap": ["blitz", "strom", "schnell"],
  "Leaf": ["blatt", "natur", "pflanze"],
  "Sprout": ["keim", "wachstum", "pflanze"],
  "Gift": ["geschenk", "präsent", "box"],
  "GiftOpen": ["geschenk offen", "geöffnet"],
  "Archive": ["archiv", "lager", "speicherung"],
  "ArchiveX": ["archiv löschen", "archiv entfernen"],
  "Package": ["paket", "paket", "versand"],
  "Package2": ["paket alt", "lieferung"],
  "Wrench": ["schraubenschlüssel", "reparatur", "werkzeug"],
  "WrenchIcon": ["schraubenschlüssel", "reparatur"],
  "Hammer": ["hammer", "handwerk", "bauen"],
  "Hammer2": ["hammer alt", "werkzeug"],
  "Paintbrush": ["pinsel", "malerei", "zeichnen"],
  "PaintbrushVertical": ["pinsel vertikal", "mal-werkzeug"],
  "PenTool": ["pen werkzeug", "zeichnen", "schreiben"],
  "Pencil": ["bleistift", "schreiben", "notizen"],
  "Edit": ["bearbeiten", "ändern", "editieren"],
  "Edit2": ["bearbeiten alt", "ändern"],
  "Edit3": ["bearbeiten 3", "editieren"],
  "Mic": ["mikrofon", "audio", "aufnahme"],
  "MicOff": ["mikrofon aus", "stumm"],
  "Video": ["video", "kamera", "aufnahme"],
  "VideoOff": ["video aus", "kamera deaktiviert"],
  "Image": ["bild", "grafik", "foto"],
  "ImagePlus": ["bild hinzufügen", "neue grafik"],
  "FileText": ["datei text", "dokument", "textdatei"],
  "File": ["datei", "dokument"],
  "Files": ["dateien", "dokumente", "mehrere"],
  "FileStack": ["datei stapel", "mehrere dokumente"],
  "Mail": ["mail", "email", "post"],
  "MailOpen": ["mail offen", "email gelesen"],
  "MessageCircle": ["nachricht kreis", "chat", "nachricht"],
  "MessageSquare": ["nachricht quadrat", "kommunikation"],
  "Phone": ["telefon", "anruf", "handy"],
  "PhoneOff": ["telefon aus", "auflegen"],
  "PhoneIncoming": ["telefon eingehend", "anruf"],
  "PhoneOutgoing": ["telefon ausgehend", "anruf"],
  "Timer": ["timer", "stoppuhr", "zeitmessung"],
  "TimerOff": ["timer aus", "stoppuhr deaktiviert"],
  "Clock": ["uhr", "zeit", "zeitstempel"],
  "Clock1": ["uhr 1", "zeit"],
  "Clock2": ["uhr 2", "zeit"],
  "Clock3": ["uhr 3", "zeit"],
  "AlarmClock": ["wecker", "alarm", "erinnerung"],
  "Hourglass": ["sanduhr", "zeit", "wartezeit"],
  "HourglassEnd": ["sanduhr ende", "zeitende"],
  "Sparkles": ["funkeln", "glanz", "glitter"],
  "Sparkle": ["funkel", "glanz"],
  "FileSignature": ["datei unterschrift", "signatur"],
  "Landmark": ["wahrzeichen", "gebäude", "denkmal"],
  "HeartPulse": ["herzschlag", "puls", "gesundheit"],
  "AlertTriangle": ["warnung dreieck", "warnung", "vorsicht"],
  "AlertCircle": ["warnung kreis", "fehler"],
  "AlertSquare": ["warnung quadrat", "benachrichtigung"],
  "CheckCheck": ["doppel haken", "bestätigt"],
  "Eye": ["auge", "anschauen", "sichtbar"],
  "EyeOff": ["auge aus", "verborgen", "privat"],
  "Trash2": ["mülleimer", "löschen", "entfernen"],
  "Trash": ["müll", "löschen"],
  "Download": ["download", "herunterladen", "import"],
  "Upload": ["upload", "hochladen", "export"],
  "Send": ["senden", "absenden", "mail"],
  "Reply": ["antwort", "zurück", "reply"],
  "Plus": ["plus", "hinzufügen", "mehr"],
  "Minus": ["minus", "weniger", "subtrahieren"],
  "X": ["kreuz", "schließen", "löschen"],
  "ChevronDown": ["chevron runter", "dropdown"],
  "ChevronRight": ["chevron rechts", "weiter"],
  "Menu": ["menü", "hamburger", "optionen"],
  "Settings": ["einstellungen", "optionen", "konfiguration"],
  "SettingsIcon": ["einstellungen", "konfiguration"],
  "Sliders": ["regler", "einstellungen", "slider"],
  "Filter": ["filter", "filterung", "auswahl"],
  "Search": ["suche", "lupe", "suchen"],
  "Navigation": ["navigation", "kompass", "richtung"],
  "Compass": ["kompass", "richtung", "navigation"],
  "AtSign": ["at zeichen", "email"],
  "Award": ["preis", "auszeichnung", "trophäe"],
  "Trophy": ["pokal", "trophäe", "gewinn"],
  "Medal": ["medaille", "auszeichnung", "award"],
};

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return AVAILABLE_ICONS.filter((icon) => {
      const englishMatch = icon.toLowerCase().includes(searchLower);
      const germanLabels = ICON_GERMAN_LABELS[icon] || [];
      const germanMatch = germanLabels.some((label) =>
        label.toLowerCase().includes(searchLower)
      );
      return englishMatch || germanMatch;
    });
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
                placeholder="Suche Symbol... (Deutsch oder English)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-border/50 bg-muted/20 text-foreground placeholder-muted-foreground"
              />
            </div>

            {/* Icon Grid */}
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-64 sm:max-h-80 overflow-y-auto">
              {filtered.map((icon) => {
                const IconComponent = (Icons as Record<string, any>)[icon];
                const germanLabels = ICON_GERMAN_LABELS[icon] || [];
                const tooltipText = `${icon}\n${germanLabels.join(", ")}`;
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
                    title={tooltipText}
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
