import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/suche")({
  beforeLoad: () => {
    throw redirect({ to: "/archiv" });
  },
});
