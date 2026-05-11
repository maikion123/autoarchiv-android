import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, FileSearch2, Inbox, Sparkles, Upload } from "lucide-react";
import logoImg from "../assets/logo.png";

const HIGHLIGHTS = [
  { title: "Upload", text: "PDFs und Fotos direkt vom Handy oder Desktop." },
  { title: "KI-Analyse", text: "Texte lesen, Absender erkennen, Inhalte verstehen." },
  { title: "Ablage", text: "Automatisch in die passende Ordnerstruktur einsortiert." },
];

export function PublicEntry() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 md:grid-cols-[1.1fr_0.9fr] md:px-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-8"
        >
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="nextKM" className="h-12 w-12 rounded-2xl" />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">nextKM</p>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Briefe automatisch analysieren, verstehen und archivieren.</h1>
            </div>
          </div>

          <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
            Upload, OCR, KI-Analyse und saubere Ablage in einer ruhigen Arbeitsoberfläche. Für Rechnungen, Schreiben, Verträge und alles, was später wieder schnell auffindbar sein muss.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_oklch(0.62_0.24_290/0.28)] transition hover:brightness-110"
            >
              Anmelden
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent/40"
            >
              Konto erstellen
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {HIGHLIGHTS.map((item) => (
              <div key={item.title} className="glass rounded-2xl border border-border/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
                    {item.title === "Upload" ? <Upload className="h-4 w-4" /> : item.title === "KI-Analyse" ? <Sparkles className="h-4 w-4" /> : <Inbox className="h-4 w-4" />}
                  </span>
                  {item.title}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.aside
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="glass-strong rounded-3xl border-glow p-5 md:p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Arbeitsbereich</p>
              <h2 className="mt-1 text-xl font-semibold">Sofort produktiv</h2>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Live
            </span>
          </div>

          <div className="space-y-3">
            <PreviewCard title="Eingang" text="Neue PDFs und Fotos landen in einer klaren Prüfliste." />
            <PreviewCard title="Dokumentenstatus" text="Analysiert, archiviert oder in Prüfung sofort erkennbar." />
            <PreviewCard title="Ordnerstruktur" text="Gezielte Ablage statt kryptischer Dateinamen." />
          </div>

          <div className="mt-5 rounded-2xl border border-border/40 bg-background/50 p-4 text-xs text-muted-foreground">
            In Zukunft kann hier direkt die Anmeldung erscheinen, sobald die Session bestätigt ist.
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

function PreviewCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileSearch2 className="h-4 w-4 text-primary" />
        {title}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}
