import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoginForm } from "../components/LoginForm";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (email: string) => {
    // Navigate to home after successful login
    navigate({ to: "/" });
  };

  return <LoginForm onLogin={handleLogin} />;
}
