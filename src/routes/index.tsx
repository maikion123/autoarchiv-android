import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "../features/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Übersicht — AutoArchiv" },
      { name: "description", content: "Dein Dashboard mit allen archivierten Dokumenten, offenen Zahlungen und Terminen." },
    ],
  }),
  component: Dashboard,
});
