import { createFileRoute } from "@tanstack/react-router";
import TerminePage from "../features/Termine";

export const Route = createFileRoute("/termine")({
  head: () => ({
    meta: [
      { title: "Termine — AutoArchiv" },
      { name: "description", content: "Kalender mit Zahlungsfälligkeiten, Erinnerungen und Dokumentenabläufen." },
    ],
  }),
  component: TerminePage,
});
