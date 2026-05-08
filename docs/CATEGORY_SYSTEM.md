# Modernes Kategorie-/Ordnersystem

## Überblick

Das neue Kategorie-System ermöglicht es Benutzern, Ordner/Kategorien mit:
- **Namen** — eindeutige Bezeichnung
- **Farben** — 11 moderne Farbbubbles
- **Icons** — 90+ durchsuchbare Icons aus Lucide React

Das Design folgt modernen Kalender-Apps (Google Calendar, Apple Calendar) mit:
- Soft UI und minimalistisches Design
- Smooth Animationen (Framer Motion)
- Dark Mode Support
- Responsive Design
- Live Vorschau beim Erstellen/Bearbeiten

## Tech Stack

- **Framework:** TanStack Start (React 19 + Vite)
- **Styling:** TailwindCSS + Dark Mode
- **Animationen:** Framer Motion
- **Icons:** Lucide React (90+ Icons)
- **Backend API:** Express.js mit SQLite

## Neue Komponenten

### 1. **ColorPicker** (`src/components/ColorPicker.tsx`)
Moderne Farb-Auswahl mit 11 Farbbubbles:
- Blau, Türkis, Grün, Lime, Gelb, Orange, Rot, Pink, Lila, Indigo, Grau
- Hover-Effekte und Ring-Selektion
- Tooltip mit Farbnamen

```tsx
<ColorPicker value={color} onChange={setColor} />
```

### 2. **IconPicker** (`src/components/IconPicker.tsx`)
Durchsuchbar Icon-Grid mit 90+ Icons:
- Echtzeit-Suche
- 6er Grid Layout
- Scale-Animation bei Auswahl
- Keyboard-freundlich

```tsx
<IconPicker value={icon} onChange={setIcon} />
```

### 3. **CategoryPreview** (`src/components/CategoryPreview.tsx`)
Live-Vorschau während Bearbeitung:
- Farbiger Kreis mit Icon
- Glow-Effekt
- Zeigt Farb-Hex und Icon-Name

```tsx
<CategoryPreview name={name} color={color} icon={icon} />
```

### 4. **CategoryCreateModal** (`src/components/CategoryCreateModal.tsx`)
Modal zum Erstellen neuer Kategorien:
- Name Input
- ColorPicker
- IconPicker
- Live Vorschau
- Fehlerbehandlung

```tsx
<CategoryCreateModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onCreate={handleCreate}
/>
```

### 5. **CategoryEditModal** (`src/components/CategoryEditModal.tsx`)
Modal zum Bearbeiten/Löschen:
- Alle Felder editierbar
- Delete-Button mit Confirmation
- Status: Loading während Speichern/Löschen

```tsx
<CategoryEditModal
  isOpen={isOpen}
  category={selectedCategory}
  onClose={() => setIsOpen(false)}
  onSave={handleSave}
  onDelete={handleDelete}
/>
```

### 6. **CategoryCard** (`src/components/CategoryCard.tsx`)
Compact Card für Kategorien-Listen:
- Icon-Bubble mit Farbe
- Name + optionale Doc-Count
- Edit-Button (Hover)
- Hover/Click-Effekte

```tsx
<CategoryCard
  id={folder.id}
  name={folder.name}
  color={folder.color}
  icon={folder.icon}
  onEdit={handleEdit}
  onClick={handleSelect}
/>
```

### 7. **CategoryManager** (`src/features/CategoryManager.tsx`)
Feature-Component für komplette Verwaltung:
- Ordner laden von API
- Create/Edit/Delete Flows
- Grid oder List Layout
- Error Handling mit Toast

```tsx
<CategoryManager layout="list" onFolderSelect={handleSelect} />
```

## API-Updates

### Schema-Änderungen

**Neue Spalten in `document_folders`:**
```sql
color TEXT DEFAULT '#3b82f6'
icon  TEXT DEFAULT 'Folder'
```

Die Datenbank wird automatisch aktualisiert beim ersten API-Call.

### Endpoints

#### GET /api/folders
```bash
curl -H "Cookie: Authorization=jwt-token" http://localhost:3001/api/folders
```

Jetzt mit `color` und `icon` in der Response:
```json
{
  "folders": [
    {
      "id": "01_Fahrzeug",
      "name": "Fahrzeug",
      "color": "#ef4444",
      "icon": "Car",
      "children": []
    }
  ]
}
```

#### POST /api/folders
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "parentId": null,
    "name": "Reisen",
    "color": "#06b6d4",
    "icon": "Plane"
  }' \
  http://localhost:3001/api/folders
```

#### PATCH /api/folders/:id
Jetzt auch `color` und `icon` updatable:
```bash
curl -X PATCH -H "Content-Type: application/json" \
  -d '{
    "color": "#a855f7",
    "icon": "Lightbulb"
  }' \
  http://localhost:3001/api/folders/01_Fahrzeug
```

## Verwendung

### Standalone Page (neue Route `/kategorien`)

```tsx
import { CategoryManager } from "../features/CategoryManager";

<CategoryManager layout="list" />
```

### Integration in Dashboard

```tsx
import { CategoryManager } from "../features/CategoryManager";

export function Dashboard() {
  return (
    <div>
      <CategoryManager 
        layout="grid"
        onFolderSelect={handleFolderSelect}
      />
    </div>
  );
}
```

### Integration in Eingang (Upload)

```tsx
// In Eingang.tsx
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

<CategoryManager
  layout="grid"
  onFolderSelect={(folderId) => {
    setSelectedCategory(folderId);
    // Use folderId for upload destination
  }}
/>
```

## Farbpalette

| Name | Hex | Verwendung |
|------|-----|-----------|
| Blau | #3b82f6 | Standard/Tech |
| Türkis | #06b6d4 | Frisch/Wasser |
| Grün | #10b981 | Natur/Erfolg |
| Lime | #84cc16 | Energisch |
| Gelb | #eab308 | Warnung/Sonne |
| Orange | #f97316 | Energie/Feuer |
| Rot | #ef4444 | Wichtig/Dringend |
| Pink | #ec4899 | Persönlich |
| Lila | #a855f7 | Kreativ/Premium |
| Indigo | #6366f1 | Professionell |
| Grau | #6b7280 | Neutral/Archiv |

## Icons (Auswahl)

**Ordner:**
Folder, FolderOpen, Archive

**Transport:**
Car, Train, Plane, Bike, Truck

**Finanzen:**
Wallet, CreditCard, Banknote, Receipt, PiggyBank

**Kategorien:**
Calendar, Briefcase, Home, Building

**Gesundheit:**
Heart, HeartPulse, Activity, Dumbbell

**Dokumente:**
FileText, Files, Mail, Clipboard

**Tech:**
Code, Database, Server, Cloud, Smartphone

**Weitere:** 70+ Icons (durchsuchbar im Modal)

## Animations

- **ColorPicker:** Hover scale + ring on select
- **IconPicker:** Scale/Tap animations
- **CategoryPreview:** Fade-in + Glow effect
- **Modals:** Backdrop fade + Scale entrance
- **Cards:** Hover scale + Opacity transitions
- **Buttons:** Whilehover/whileTap animations

## Dark Mode

Alle Komponenten unterstützen Dark Mode automatisch via TailwindCSS:
- `dark:bg-gray-800`
- `dark:text-white`
- `dark:border-gray-600`
- etc.

## Testing

### Local Development
```bash
npm run dev
# Visit http://localhost:8080/kategorien
```

### Build
```bash
npm run build
```

### API Test
```bash
# Create category
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"Test","color":"#3b82f6","icon":"Folder"}' \
  http://localhost:3001/api/folders

# Get all
curl http://localhost:3001/api/folders

# Update
curl -X PATCH -H "Content-Type: application/json" \
  -d '{"color":"#ef4444"}' \
  http://localhost:3001/api/folders/Test

# Delete
curl -X DELETE http://localhost:3001/api/folders/Test
```

## Zukunft

Mögliche Erweiterungen:
- [ ] Kategorien-Sortierung (Drag & Drop)
- [ ] Kategorien-Templates
- [ ] Emoji-Support
- [ ] Benutzerdefinierte Icons
- [ ] Kategorien-Favoriten
- [ ] Kategorien-Sharing
- [ ] Automatische Kategorisierung via KI
