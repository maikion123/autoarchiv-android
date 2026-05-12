import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from "@tanstack/react-router";
import { User, KeyRound, LogOut, Eye, EyeOff, AlertCircle, CheckCircle, Copy, Check } from 'lucide-react';

interface UserMenuProps {
  email: string;
  displayName?: string | null;
  ntfyTopic?: string | null;
  onLogout: () => void;
}

function slugifyTopicPart(value: string, fallback = "konto") {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || fallback;
}

function hashTopicSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

function makeUserNtfyTopic(email?: string, displayName?: string | null) {
  const emailValue = (email || "").trim().toLowerCase();
  const localPart = emailValue.includes("@") ? emailValue.split("@")[0] : "";
  const namePart = slugifyTopicPart(displayName || localPart || emailValue || "konto");
  const userPart = slugifyTopicPart(emailValue || localPart || displayName || "konto");
  const seed = hashTopicSeed(`${emailValue}:${displayName || ""}`);
  return `autoarchiv-${namePart}-${userPart}-${seed}`;
}

function getInitials(displayName?: string | null, email?: string): string {
  if (displayName) {
    return displayName
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) {
    return email.split('@')[0].slice(0, 2).toUpperCase();
  }
  return 'U';
}

function checkPasswordStrength(password: string): number {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(password)) strength++;
  return strength;
}

function formatStatusTime(iso: string | null): string {
  if (!iso) return "Noch nicht bestätigt";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unbekannt";
  return date.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function ProfileModal({
  email,
  displayName,
  ntfyTopic,
  isOpen,
  onClose,
  onSave,
}: {
  email: string;
  displayName?: string | null;
  ntfyTopic?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (displayName: string, ntfyTopic: string | null) => Promise<void>;
}) {
  const [name, setName] = useState(displayName || '');
  const [topic, setTopic] = useState(ntfyTopic || makeUserNtfyTopic(email, displayName));
  const [topicDeleted, setTopicDeleted] = useState(false);
  const [topicDeleteArmed, setTopicDeleteArmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(ntfyTopic ? new Date().toISOString() : null);

  useEffect(() => {
    if (!isOpen) return;
    setName(displayName || '');
    setTopic(ntfyTopic || makeUserNtfyTopic(email, displayName));
    setTopicDeleted(false);
    setTopicDeleteArmed(false);
    setError('');
    setSuccess(false);
    setCopyOk(false);
    setLastSyncAt(ntfyTopic ? new Date().toISOString() : null);
  }, [displayName, email, isOpen, ntfyTopic]);

  const handleSave = async () => {
    setError('');
    setSuccess(false);

    if (!name.trim()) {
      setError('Anzeigename ist erforderlich');
      return;
    }

    if (name.length > 50) {
      setError('Anzeigename darf max. 50 Zeichen sein');
      return;
    }

    if (!topic.trim() && !topicDeleted) {
      setError('ntfy-Topic ist erforderlich');
      return;
    }

    setLoading(true);
    try {
      await onSave(name.trim(), topic.trim() || null);
      setLastSyncAt(new Date().toISOString());
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
      setLoading(false);
    }
  };

  const onCopyTopic = async () => {
    try {
      await navigator.clipboard.writeText(topic.trim());
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      setError('Topic konnte nicht kopiert werden');
    }
  };

  const hasSavedTopic = Boolean(ntfyTopic);
  const canGenerateTopic = topicDeleted || !hasSavedTopic;
  const isLocked = hasSavedTopic && !topicDeleted;
  const onGenerateTopic = () => {
    setTopic(makeUserNtfyTopic(email, displayName));
    setTopicDeleted(false);
    setCopyOk(false);
    setError('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
      <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-md px-4 pt-24 pb-6 sm:px-6 sm:pt-24"
          >
            <div className="glass-strong w-full max-w-md rounded-2xl p-5 sm:p-6 pointer-events-auto max-h-[calc(100vh-7rem)] overflow-y-auto overflow-x-hidden box-border shadow-2xl">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-foreground">Profil bearbeiten</h2>
                <p className="mt-1 text-sm text-foreground/60">
                  Hier änderst du deinen Anzeigenamen und siehst, ob dein persönliches ntfy-Topic im Konto gespeichert ist.
                </p>
              </div>

              <div className="space-y-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-white text-sm font-semibold">
                      {getInitials(name.trim() || displayName, email)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {name.trim() || displayName || email.split('@')[0]}
                      </p>
                      <p className="text-xs text-foreground/55 truncate">{email}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">
                    Anzeigename in AutoArchiv
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50 pointer-events-none" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={50}
                      autoComplete="name"
                      placeholder="Zum Beispiel Kevin"
                      className="w-full rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background/50 pl-10 pr-4 py-3 sm:py-2 text-foreground placeholder:text-foreground/50 text-base sm:text-sm"
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-foreground/50">
                    <span>Dieser Name erscheint im Konto und in der Oberfläche.</span>
                    <span>{name.length}/50</span>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="block min-w-0 text-sm font-medium text-foreground/80">
                      Persönlicher Benachrichtigungskanal
                    </label>
                    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${hasSavedTopic && !topicDeleted ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                      <CheckCircle className="h-3 w-3" />
                      {hasSavedTopic && !topicDeleted ? 'Verbunden' : 'Noch nicht verbunden'}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-border/40 bg-background/35 p-3 overflow-x-hidden">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <textarea
                          value={topic}
                          onChange={(e) => setTopic(e.target.value)}
                          readOnly={isLocked}
                          placeholder={makeUserNtfyTopic(email, displayName)}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-border/40 bg-background/55 px-3 py-3 font-mono text-sm leading-5 text-foreground placeholder:text-foreground/45 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 break-all"
                          aria-label="ntfy-Topic"
                        />
                        <p className="mt-2 text-xs text-foreground/50">
                          {hasSavedTopic && !topicDeleted
                            ? 'Dein AutoArchiv-Konto ist mit diesem Topic verbunden. Wenn du es ändern willst, löse zuerst die aktuelle Verbindung.'
                            : 'Dieses Topic ist dein persönlicher Kanal. Es wird nur für dein Konto verwendet und sollte nicht geteilt werden.'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 overflow-x-hidden">
                      {topic.trim() && (
                        <button
                          type="button"
                          onClick={onCopyTopic}
                          className="inline-flex max-w-full items-center gap-1 rounded-lg glass px-3 py-2 text-sm text-foreground/80 min-h-[40px]"
                        >
                          {copyOk ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          {copyOk ? 'Kopiert' : 'Kopieren'}
                        </button>
                      )}
                      {hasSavedTopic && !topicDeleted ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setTopicDeleteArmed(true)}
                            className="inline-flex max-w-full items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 min-h-[40px]"
                          >
                            Verbindung lösen
                          </button>
                          <span className="flex min-w-0 items-center px-1 text-xs text-foreground/45">
                            Neues Topic erst danach
                          </span>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={onGenerateTopic}
                          className="inline-flex max-w-full items-center gap-1 rounded-lg glass px-3 py-2 text-sm text-foreground/80 min-h-[40px]"
                          disabled={!canGenerateTopic}
                        >
                          Topic erzeugen
                        </button>
                      )}
                    </div>
                    {topicDeleteArmed && hasSavedTopic && !topicDeleted && (
                      <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100 overflow-x-hidden">
                        <p className="font-medium">Verbindung lösen?</p>
                        <p className="mt-1 text-xs text-amber-100/80">
                          AutoArchiv sendet dann keine Erinnerungen mehr, bis du ein neues Topic speicherst.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setTopicDeleteArmed(false)}
                            className="rounded-lg glass px-3 py-2 text-xs text-foreground/80 min-h-[40px]"
                          >
                            Abbrechen
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTopic('');
                              setTopicDeleted(true);
                              setTopicDeleteArmed(false);
                              setCopyOk(false);
                              setError('');
                            }}
                            className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-black min-h-[40px]"
                          >
                            Verbindung jetzt lösen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 rounded-xl border border-border/40 bg-background/40 p-3 text-xs overflow-x-hidden">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-foreground/60">Topic-Status</span>
                      <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-medium ${hasSavedTopic && !topicDeleted ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                        <CheckCircle className="h-3 w-3" />
                        {hasSavedTopic && !topicDeleted ? 'Topic im Konto gespeichert' : 'Topic noch nicht gespeichert'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-foreground/60">Letzter Sync</span>
                      <span className="font-medium text-foreground/80 break-words">
                        {lastSyncAt ? `erfolgreich am ${formatStatusTime(lastSyncAt)}` : 'Noch nicht bestätigt'}
                      </span>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="flex gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-400">Profil aktualisiert</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 justify-end pt-4 sm:flex-row sm:flex-nowrap">
                  <button
                    onClick={onClose}
                    className="w-full sm:w-0 sm:flex-1 sm:min-w-0 px-4 py-3 sm:py-2 rounded-xl glass border border-border/40 hover:bg-muted/60 active:bg-muted/80 text-foreground text-sm font-medium transition-colors min-h-[48px] sm:min-h-auto"
                    disabled={loading}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading || !name.trim()}
                    className="w-full sm:w-0 sm:flex-1 sm:min-w-0 px-4 py-3 sm:py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-400 text-white text-sm font-medium hover:from-violet-500 hover:to-cyan-300 active:from-violet-700 active:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px] sm:min-h-auto"
                  >
                    {loading ? 'Speichert...' : 'Speichern'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PasswordModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const strength = checkPasswordStrength(newPassword);
  const strengthLabels = ['Sehr schwach', 'Schwach', 'Mittel', 'Stark', 'Sehr stark'];

  const handleSave = async () => {
    setError('');
    setSuccess(false);

    if (!currentPassword) {
      setError('Aktuelles Passwort erforderlich');
      return;
    }

    if (newPassword.length < 8) {
      setError('Neues Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    if (!/[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      setError('Neues Passwort muss mindestens ein Sonderzeichen enthalten');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    setLoading(true);
    try {
      await onSave(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Ändern des Passworts');
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-md px-4 pt-24 pb-6 sm:px-6 sm:pt-24"
          >
            <div className="glass-strong w-full max-w-md rounded-2xl p-5 sm:p-6 pointer-events-auto max-h-[calc(100vh-7rem)] overflow-y-auto overflow-x-hidden box-border shadow-2xl">
              <h2 className="text-lg font-semibold text-foreground mb-4">Passwort ändern</h2>

              <div className="space-y-4">
                {/* Current Password */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">
                    Aktuelles Passwort
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50 pointer-events-none" />
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background/50 pl-10 pr-12 py-3 sm:py-2 text-base sm:text-sm text-foreground placeholder:text-foreground/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground/70 p-2 sm:p-1 -m-2 sm:-m-1"
                    >
                      {showCurrent ? (
                        <EyeOff className="h-5 w-5 sm:h-4 sm:w-4" />
                      ) : (
                        <Eye className="h-5 w-5 sm:h-4 sm:w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">
                    Neues Passwort
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50 pointer-events-none" />
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background/50 pl-10 pr-12 py-3 sm:py-2 text-base sm:text-sm text-foreground placeholder:text-foreground/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground/70 p-2 sm:p-1 -m-2 sm:-m-1"
                    >
                      {showNew ? (
                        <EyeOff className="h-5 w-5 sm:h-4 sm:w-4" />
                      ) : (
                        <Eye className="h-5 w-5 sm:h-4 sm:w-4" />
                      )}
                    </button>
                  </div>

                  {newPassword && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i < strength
                                ? 'bg-gradient-to-r from-violet-600 to-cyan-400'
                                : 'bg-border/40'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-foreground/50">
                        Stärke: {strengthLabels[strength - 1] || 'Keine'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">
                    Passwort bestätigen
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50 pointer-events-none" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background/50 pl-10 pr-12 py-3 sm:py-2 text-base sm:text-sm text-foreground placeholder:text-foreground/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground/70 p-2 sm:p-1 -m-2 sm:-m-1"
                    >
                      {showConfirm ? (
                        <EyeOff className="h-5 w-5 sm:h-4 sm:w-4" />
                      ) : (
                        <Eye className="h-5 w-5 sm:h-4 sm:w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="flex gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-400">Passwort geändert</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 justify-end pt-4 sm:flex-row sm:flex-nowrap">
                  <button
                    onClick={onClose}
                    className="w-full sm:w-0 sm:flex-1 sm:min-w-0 px-4 py-3 sm:py-2 rounded-xl glass border border-border/40 hover:bg-muted/60 active:bg-muted/80 text-foreground text-sm font-medium transition-colors min-h-[48px] sm:min-h-auto"
                    disabled={loading}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                    className="w-full sm:w-0 sm:flex-1 sm:min-w-0 px-4 py-3 sm:py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-400 text-white text-sm font-medium hover:from-violet-500 hover:to-cyan-300 active:from-violet-700 active:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px] sm:min-h-auto"
                  >
                    {loading ? 'Speichert...' : 'Speichern'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function UserMenu({ email, displayName, ntfyTopic, onLogout }: UserMenuProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName);
  const [currentNtfyTopic, setCurrentNtfyTopic] = useState<string | null>(ntfyTopic || null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const initials = getInitials(currentDisplayName, email);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right + window.scrollX,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    setCurrentDisplayName(displayName);
  }, [displayName]);

  useEffect(() => {
    setCurrentNtfyTopic(ntfyTopic || null);
  }, [ntfyTopic]);

  const syncCurrentProfile = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      setCurrentDisplayName(data.displayName || displayName || null);
      setCurrentNtfyTopic(data.ntfyTopic ?? null);
    } catch {
      // Keep the cached state if the server check fails.
    }
  };

  useEffect(() => {
    void syncCurrentProfile();
  }, []);

  useEffect(() => {
    const handleProfileUpdated = () => {
      void syncCurrentProfile();
    };

    window.addEventListener("autoarchiv:profile-updated", handleProfileUpdated);
    return () => window.removeEventListener("autoarchiv:profile-updated", handleProfileUpdated);
  }, [displayName]);

  const handleProfileSave = async (name: string, ntfyTopic: string | null) => {
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name, ntfyTopic }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Session timeout - user needs to re-login
        if (response.status === 401 && errorData.error?.includes('Sitzung')) {
          throw new Error('Sitzung abgelaufen. Bitte melden Sie sich erneut an.');
        }

        throw new Error(errorData.error || 'Fehler beim Speichern');
      }

      const data = await response.json();
      setCurrentDisplayName(data.displayName || name);
      setCurrentNtfyTopic(data.ntfyTopic ?? null);
    } catch (err: any) {
      throw err;
    }
  };

  const handlePasswordChange = async (currentPassword: string, newPassword: string) => {
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Session timeout - user needs to re-login
        if (response.status === 401 && errorData.error?.includes('Sitzung')) {
          throw new Error('Sitzung abgelaufen. Bitte melden Sie sich erneut an.');
        }

        throw new Error(errorData.error || 'Fehler beim Ändern des Passworts');
      }
    } catch (err: any) {
      throw err;
    }
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    onLogout();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-2xl glass hover:bg-muted/60 px-2 sm:px-3 py-2 flex items-center gap-2 text-foreground transition-colors min-h-[44px] sm:min-h-auto"
        title={currentDisplayName || email}
      >
        <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-white text-xs font-semibold shadow-[0_0_14px_oklch(0.62_0.24_290/0.4)]">
          {initials}
        </div>
        {/* Desktop: Show full display name or email prefix */}
        <span className="text-sm font-medium hidden sm:inline max-w-[120px] truncate">
          {currentDisplayName || email.split('@')[0]}
        </span>
        {/* Mobile: Show initials as tooltip text via title attribute */}
        <svg
          className={`h-4 w-4 text-foreground/60 transition-transform hidden sm:block ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              right: `${dropdownPosition.right}px`,
            }}
            className="w-48 sm:w-52 glass-strong border-glow rounded-2xl overflow-hidden z-[50] shadow-lg"
          >
            <div className="divide-y divide-border/20">
              <button
                onClick={async () => {
                  setIsOpen(false);
                  navigate({ to: "/profil" });
                }}
                className="w-full px-4 py-3 sm:py-2.5 flex items-center gap-3 text-foreground hover:bg-muted/40 active:bg-muted/50 transition-colors text-sm sm:text-xs min-h-[48px] sm:min-h-auto"
              >
                <User className="h-5 w-5 sm:h-4 sm:w-4 text-primary/70 flex-shrink-0" />
                <span className="text-left">Profil bearbeiten</span>
              </button>

              <button
                onClick={() => {
                  setPasswordModalOpen(true);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-3 sm:py-2.5 flex items-center gap-3 text-foreground hover:bg-muted/40 active:bg-muted/50 transition-colors text-sm sm:text-xs min-h-[48px] sm:min-h-auto"
              >
                <KeyRound className="h-5 w-5 sm:h-4 sm:w-4 text-primary/70 flex-shrink-0" />
                <span className="text-left">Passwort ändern</span>
              </button>

              <button
                onClick={handleLogoutClick}
                className="w-full px-4 py-3 sm:py-2.5 flex items-center gap-3 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 active:bg-rose-500/20 transition-colors text-sm sm:text-xs min-h-[48px] sm:min-h-auto"
              >
                <LogOut className="h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="text-left">Abmelden</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        onSave={handlePasswordChange}
      />
    </div>
  );
}
