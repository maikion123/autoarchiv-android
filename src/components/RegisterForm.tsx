import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "../integrations/supabase/client";

export function RegisterForm({ onRegister }: { onRegister: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (!email || !password || !confirmPassword) {
        setError("Bitte füllen Sie alle Felder aus");
        setIsLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwörter stimmen nicht überein");
        setIsLoading(false);
        return;
      }

      if (password.length < 6) {
        setError("Passwort muss mindestens 6 Zeichen lang sein");
        setIsLoading(false);
        return;
      }

      // Sign up with Supabase
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message || "Registrierung fehlgeschlagen");
        setIsLoading(false);
        return;
      }

      if (data?.user) {
        localStorage.setItem("auth_email", email);
        setSuccess(true);
        setTimeout(() => {
          onRegister(email);
        }, 1500);
      }
    } catch (err) {
      setError("Registrierung fehlgeschlagen");
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
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="flex items-center gap-3"
          >
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 glow-primary">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Auto<span className="text-gradient">Archiv</span>
              </h1>
              <p className="text-xs text-muted-foreground">Privates Dokumentenarchiv</p>
            </div>
          </motion.div>
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-strong rounded-3xl border-glow p-8 space-y-6"
        >
          {/* Title */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Konto erstellen</h2>
            <p className="text-sm text-muted-foreground">
              Registrieren Sie sich für Ihr privates Archiv
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                E-Mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition bg-background/50 text-foreground placeholder:text-muted-foreground"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Passwort
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition bg-background/50 text-foreground placeholder:text-muted-foreground"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Passwort bestätigen
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError("");
                  }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition bg-background/50 text-foreground placeholder:text-muted-foreground"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3"
              >
                {error}
              </motion.div>
            )}

            {/* Success Message */}
            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="text-sm text-emerald-600 bg-emerald-50/10 border border-emerald-500/20 rounded-lg p-3"
              >
                ✓ Registrierung erfolgreich! Wird weitergeleitet...
              </motion.div>
            )}

            {/* Submit Button */}
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
                  Wird registriert...
                </>
              ) : (
                <>
                  Registrieren
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </motion.button>
          </form>

          {/* Footer */}
          <div className="space-y-3 text-center text-xs text-muted-foreground">
            <p>Bereits registriert?</p>
          </div>
        </motion.div>

        {/* Background Decorations */}
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-20 right-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute bottom-20 left-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>
      </motion.div>
    </div>
  );
}
