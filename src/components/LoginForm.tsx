import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowRight } from "lucide-react";
import logoImg from "../assets/logo.png";

async function waitForSession() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      cache: "no-store",
    });

    if (res.ok) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

export function LoginForm({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Bitte alle Felder ausfüllen");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Anmeldung fehlgeschlagen");
        setIsLoading(false);
        return;
      }

      const sessionReady = await waitForSession();
      if (!sessionReady) {
        setError("Anmeldung erfolgreich, aber die Sitzung konnte nicht bestätigt werden. Bitte erneut versuchen.");
        setIsLoading(false);
        return;
      }

      onLogin(data.email);
    } catch (err) {
      console.error("[LoginForm] Submit error:", err);
      setError("Verbindungsfehler. Bitte erneut versuchen.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="flex items-center gap-3"
          >
            <img src={logoImg} alt="nextKM Logo" className="h-12 w-12 rounded-2xl" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Auto<span className="text-gradient">Archiv</span>
              </h1>
              <p className="text-xs text-muted-foreground">Privates Dokumentenarchiv</p>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-strong rounded-3xl border-glow p-8 space-y-6"
        >
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Willkommen zurück</h2>
            <p className="text-sm text-muted-foreground">
              Melde dich an, um auf dein privates Archiv zuzugreifen
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">E-Mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="du@beispiel.de"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition bg-background/50 text-foreground placeholder:text-muted-foreground"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Passwort</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition bg-background/50 text-foreground placeholder:text-muted-foreground"
                  disabled={isLoading}
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: isLoading ? 1 : 1.02 }}
              whileTap={{ scale: isLoading ? 1 : 0.98 }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-white font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 glow-primary"
            >
              {isLoading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                  Wird angemeldet…
                </>
              ) : (
                <>
                  Anmelden
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </motion.button>
          </form>

          <div className="pt-2 border-t border-border/20 text-center text-xs text-muted-foreground">
            <p>
              Noch kein Konto?{" "}
              <a href="/register" className="text-violet-400 hover:text-violet-300 font-medium transition">
                Hier registrieren
              </a>
            </p>
          </div>
        </motion.div>

        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute bottom-20 left-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>
      </motion.div>
    </div>
  );
}
