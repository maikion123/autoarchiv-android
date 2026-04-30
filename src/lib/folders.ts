export interface FolderNode {
  id: string;
  name: string;
  children?: FolderNode[];
}

export const FOLDER_TREE: FolderNode[] = [
  { id: "01_Fahrzeug", name: "01_Fahrzeug", children: [
    { id: "01_Fahrzeug/Zulassung & Abmeldung", name: "Zulassung & Abmeldung" },
    { id: "01_Fahrzeug/KFZ-Versicherung", name: "KFZ-Versicherung" },
    { id: "01_Fahrzeug/Werkstatt & Reparaturen", name: "Werkstatt & Reparaturen" },
    { id: "01_Fahrzeug/TÜV & HU", name: "TÜV & HU" },
    { id: "01_Fahrzeug/Kaufvertrag", name: "Kaufvertrag" },
  ]},
  { id: "02_Finanzen", name: "02_Finanzen", children: [
    { id: "02_Finanzen/Kontoauszüge", name: "Kontoauszüge" },
    { id: "02_Finanzen/Steuern", name: "Steuern" },
    { id: "02_Finanzen/Lohnabrechnung", name: "Lohnabrechnung" },
  ]},
  { id: "03_Versicherungen", name: "03_Versicherungen", children: [
    { id: "03_Versicherungen/Krankenversicherung", name: "Krankenversicherung" },
    { id: "03_Versicherungen/Haftpflicht", name: "Haftpflicht" },
    { id: "03_Versicherungen/Wohngebäude", name: "Wohngebäude" },
    { id: "03_Versicherungen/Hausrat", name: "Hausrat" },
  ]},
  { id: "04_Verträge", name: "04_Verträge", children: [
    { id: "04_Verträge/Internet & Telefon", name: "Internet & Telefon" },
    { id: "04_Verträge/Strom & Gas", name: "Strom & Gas" },
    { id: "04_Verträge/Miete", name: "Miete" },
    { id: "04_Verträge/Abonnements", name: "Abonnements" },
  ]},
  { id: "05_Behörden", name: "05_Behörden", children: [
    { id: "05_Behörden/Personalausweis & Reisepass", name: "Personalausweis & Reisepass" },
    { id: "05_Behörden/Zulassung & Abmeldung", name: "Zulassung & Abmeldung" },
    { id: "05_Behörden/Bescheide", name: "Bescheide" },
  ]},
  { id: "06_Gesundheit", name: "06_Gesundheit", children: [
    { id: "06_Gesundheit/Arztbriefe", name: "Arztbriefe" },
    { id: "06_Gesundheit/Befunde", name: "Befunde" },
    { id: "06_Gesundheit/Rezepte", name: "Rezepte" },
  ]},
  { id: "07_Sonstiges", name: "07_Sonstiges", children: [] },
];

export const FOLDER_META: Record<string, { icon: string; gradient: string }> = {
  "01_Fahrzeug": { icon: "Car", gradient: "from-violet-500 to-fuchsia-500" },
  "02_Finanzen": { icon: "Wallet", gradient: "from-emerald-400 to-cyan-500" },
  "03_Versicherungen": { icon: "ShieldCheck", gradient: "from-blue-500 to-cyan-400" },
  "04_Verträge": { icon: "FileSignature", gradient: "from-fuchsia-500 to-pink-500" },
  "05_Behörden": { icon: "Landmark", gradient: "from-amber-400 to-orange-500" },
  "06_Gesundheit": { icon: "HeartPulse", gradient: "from-rose-400 to-red-500" },
  "07_Sonstiges": { icon: "Folder", gradient: "from-slate-400 to-zinc-500" },
};

export function listAllFolderPaths(): string[] {
  const out: string[] = [];
  for (const f of FOLDER_TREE) {
    out.push(f.id);
    f.children?.forEach((c) => out.push(c.id));
  }
  return out;
}

export function getTopFolder(path: string): string {
  return path.split("/")[0];
}