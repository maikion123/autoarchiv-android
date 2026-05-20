import { createFileRoute } from "@tanstack/react-router";
import ArchivPage from "../features/Archiv";

export const Route = createFileRoute("/archiv")({
  head: () => ({
    meta: [
      { title: "Archiv — nextKM" },
      { name: "description", content: "Alle archivierten Dokumente in der Übersicht — sortierbar, filterbar, mehfach auswählbar." },
    ],
  }),
  component: ArchivPage,
});
