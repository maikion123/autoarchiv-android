import { createFileRoute } from "@tanstack/react-router";
import AdminPage from "../features/Admin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — nextKM" },
      { name: "description", content: "Systemstatus, Nutzerverwaltung und Review-Queue für nextKM." },
    ],
  }),
  component: AdminPage,
});
