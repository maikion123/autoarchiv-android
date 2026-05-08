import { createFileRoute } from "@tanstack/react-router";
import ZahlungenPage from "../features/Zahlungen";

export const Route = createFileRoute("/zahlungen")({
  head: () => ({
    meta: [
      { title: "Zahlungen — AutoArchiv" },
      { name: "description", content: "Offene und erledigte Zahlungen verwalten." },
    ],
  }),
  component: ZahlungenPage,
});
