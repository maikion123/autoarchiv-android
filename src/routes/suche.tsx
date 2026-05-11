import { createFileRoute } from "@tanstack/react-router";
import SuchePage from "../features/Suche";

export const Route = createFileRoute("/suche")({
  head: () => ({
    meta: [
      { title: "Suche — nextKM" },
      { name: "description", content: "Volltextsuche über alle archivierten Dokumente." },
    ],
  }),
  component: SuchePage,
});
