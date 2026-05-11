import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoginForm } from "../components/LoginForm";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Anmelden — nextKM" },
      { name: "description", content: "Melde dich an, um Dokumente zu analysieren und automatisch abzulegen." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate({ to: "/", replace: true });
  };

  return <LoginForm onLogin={handleLogin} />;
}
