import { createFileRoute } from "@tanstack/react-router";
import EingangPage from "../features/Eingang";

export const Route = createFileRoute("/eingang")({
  head: () => ({
    meta: [
      { title: "Eingang — nextKM" },
      { name: "description", content: "Laden Sie PDFs oder Fotos hoch und beschriften Sie Ihre Dokumente." },
    ],
  }),
  component: EingangPage,
});
