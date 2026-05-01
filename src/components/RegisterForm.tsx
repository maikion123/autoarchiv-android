import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowRight, Check, AlertCircle, RefreshCw } from "lucide-react";
import logoImg from "../assets/logo.png";

type Step = "email" | "password" | "verify";

export function RegisterForm({ onRegister }: { onRegister: (email: string) => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);

  const calcStrength = (pwd: string) => {
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[a-z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>\/?]/.test(pwd)) s++;
    setPasswordStrength(s);
  };

  const strengthLabel = ["", "Sehr schwach", "Schwach", "Mittel", "Stark", "Sehr stark"][passwordStrength];
  const strengthColor = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-500"][passwordStrength];

  // ── Schritt 1: E-Mail ──────────────────────────────────────────────────────
  const handleEmailStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return setError("E-Mail-Adresse erforderlich");
    if (!emailRx.test(email)) return setError("Ungültige E-Mail-Adresse");
    setStep("password");
  };

  // ── Schritt 2: Passwort + Registrierung auslösen ───────────────────────────
  const handlePasswordStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password || !confirmPassword) return setError("Beide Felder ausfüllen");
    if (password !== confirmPassword) return setError("Passwörter stimmen nicht überein");
    if (password.length < 8) return setError("Mindestens 8 Zeichen");
    if (!/[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>\/?]/.test(password))
      return setError("Mindestens ein Sonderzeichen erforderlich");

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registrierung fehlgeschlagen");
        return;
      }

      setStep("verify");
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Schritt 3: OTP verifizieren ────────────────────────────────────────────
  const handleVerifyStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!otp) return setError("Code erforderlich");
    if (!/^\d{6}$/.test(otp)) return setError("Code muss 6 Ziffern haben");

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verifizierung fehlgeschlagen");
        return;
      }

      onRegister(email);
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Code erneut senden ─────────────────────────────────────────────────────
  const handleResend = async () => {
    setError("");
    setInfo("");
    setIsResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Fehler beim Senden");
      } else {
        setInfo("Neuer Code wurde gesendet.");
        setOtp("");
      }
    } catch {
      setError("Verbindungsfehler");
    } finally {
      setIsResending(false);
    }
  };

  const steps: Step[] = ["email", "password", "verify"];
  const stepIndex = steps.indexOf(step);

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
            <img src={logoImg} alt="nextKM Logo" className="h-12 w-12 rounded-2xl" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Auto<span className="text-gradient">Archiv</span>
              </h1>
              <p className="text-xs text-muted-foreground">Privates Dokumentenarchiv</p>
            </div>
          </motion.div>
        </div>

        {/* Fortschrittsbalken */}
        <div className="flex gap-2 mb-8">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i < stepIndex ? "bg-emerald-500" : i === stepIndex ? "bg-violet-500" : "bg-border/40"
              }`}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-strong rounded-3xl border-glow p-8 space-y-6"
        >
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">
              {step === "email" && "Konto erstellen"}
              {step === "password" && "Passwort wählen"}
              {step === "verify" && "E-Mail bestätigen"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {step === "email" && "Gib deine E-Mail-Adresse ein"}
              {step === "password" && "Wähle ein sicheres Passwort"}
              {step === "verify" && <>Code wurde an <strong>{email}</strong> gesendet</>}
            </p>
          </div>

          {/* ── Schritt 1: E-Mail ── */}
          {step === "email" && (
            <form onSubmit={handleEmailStep} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="reg-email" className="text-sm font-medium">E-Mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <input
                    id="reg-email"
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

              {error && <ErrorBox msg={error} />}

              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-white font-medium text-sm flex items-center justify-center gap-2 glow-primary"
              >
                Weiter <ArrowRight className="h-4 w-4" />
              </motion.button>
            </form>
          )}

          {/* ── Schritt 2: Passwort ── */}
          {step === "password" && (
            <form onSubmit={handlePasswordStep} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="reg-pw" className="text-sm font-medium">Passwort</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <input
                    id="reg-pw"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); calcStrength(e.target.value); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition bg-background/50 text-foreground placeholder:text-muted-foreground"
                    disabled={isLoading}
                  />
                </div>
                {password && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= passwordStrength ? strengthColor : "bg-border/40"}`} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{strengthLabel}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen und ein Sonderzeichen (!@#$… )</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="reg-pw2" className="text-sm font-medium">Passwort bestätigen</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <input
                    id="reg-pw2"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition bg-background/50 text-foreground placeholder:text-muted-foreground"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {error && <ErrorBox msg={error} />}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setStep("email"); setError(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-border/40 text-sm font-medium transition hover:bg-accent"
                >
                  Zurück
                </button>
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: isLoading ? 1 : 1.02 }}
                  whileTap={{ scale: isLoading ? 1 : 0.98 }}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2 glow-primary"
                >
                  {isLoading ? <Spinner /> : <>Weiter <ArrowRight className="h-4 w-4" /></>}
                </motion.button>
              </div>
            </form>
          )}

          {/* ── Schritt 3: OTP ── */}
          {step === "verify" && (
            <form onSubmit={handleVerifyStep} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="otp" className="text-sm font-medium">6-stelliger Code</label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "")); setError(""); setInfo(""); }}
                  className="w-full px-4 py-3 rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition bg-background/50 text-foreground text-center text-xl tracking-[.4em] placeholder:text-muted-foreground"
                  disabled={isLoading}
                />
              </div>

              {error && <ErrorBox msg={error} />}
              {info && (
                <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  {info}
                </p>
              )}

              <motion.button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                whileHover={{ scale: isLoading ? 1 : 1.02 }}
                whileTap={{ scale: isLoading ? 1 : 0.98 }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 text-white font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2 glow-primary"
              >
                {isLoading ? <Spinner /> : <>Bestätigen <Check className="h-4 w-4" /></>}
              </motion.button>

              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`h-3 w-3 ${isResending ? "animate-spin" : ""}`} />
                {isResending ? "Wird gesendet…" : "Code erneut senden"}
              </button>
            </form>
          )}

          <div className="pt-2 border-t border-border/20 text-center text-xs text-muted-foreground">
            <p>
              Bereits registriert?{" "}
              <a href="/login" className="text-violet-400 hover:text-violet-300 font-medium transition">
                Anmelden
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

function ErrorBox({ msg }: { msg: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex gap-2"
    >
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      {msg}
    </motion.div>
  );
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />;
}
