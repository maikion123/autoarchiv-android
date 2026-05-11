import { createFileRoute } from "@tanstack/react-router";
import TerminePage from "../features/Termine";

export const Route = createFileRoute("/termine")({
  head: () => ({
    meta: [
      { title: "Termine — nextKM" },
      { name: "description", content: "Kommende Termine, Zahlungsfälligkeiten und Versicherungsablaufdaten." },
    ],
  }),
  component: TerminePage,
});
