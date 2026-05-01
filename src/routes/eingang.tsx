import { createFileRoute } from "@tanstack/react-router";
import EingangPage from "../features/Eingang";

export const Route = createFileRoute("/eingang")({
  head: () => ({
    meta: [
      { title: "Eingang - AutoArchiv" },
      { name: "description", content: "PDFs und Bilder hochladen, analysieren und archivieren." },
    ],
  }),
  component: EingangPage,
});
