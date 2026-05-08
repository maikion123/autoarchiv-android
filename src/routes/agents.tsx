import { createFileRoute } from "@tanstack/react-router";
import AgentsPage from "../features/Agents";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agenten — AutoArchiv" },
      { name: "description", content: "Live-Status von Claude Code, Codex, Kevin und Maik." },
    ],
  }),
  component: AgentsPage,
});
