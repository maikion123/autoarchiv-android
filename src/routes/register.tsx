import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { RegisterForm } from "../components/RegisterForm";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Registrieren — nextKM" },
      { name: "description", content: "Erstelle dein nextKM-Konto, um Dokumente automatisiert zu archivieren." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();

  const handleRegister = (email: string) => {
    navigate({ to: "/" });
  };

  return (
    <div>
      <RegisterForm onRegister={handleRegister} />
      <div className="fixed bottom-4 left-4 right-4 flex justify-center md:bottom-6">
        <Link
          to="/login"
          className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1"
        >
          ← Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
