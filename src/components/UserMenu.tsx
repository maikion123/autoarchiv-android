import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, KeyRound, LogOut, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

interface UserMenuProps {
  email: string;
  displayName?: string | null;
  onLogout: () => void;
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

function ProfileModal({
  email,
  displayName,
  isOpen,
  onClose,
  onSave,
}: {
  email: string;
  displayName?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (displayName: string) => Promise<void>;
}) {
  const [name, setName] = useState(displayName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

    setLoading(true);
    try {
      await onSave(name.trim());
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
            className="fixed top-0 left-0 right-0 z-[90] flex items-start justify-center pointer-events-none p-4 pt-20 sm:pt-[50vh] sm:translate-y-[-50%]"
          >
            <div className="glass-strong border-glow rounded-2xl p-6 max-w-md w-full sm:w-[90vw] pointer-events-auto max-h-[70vh] overflow-y-auto">
              <h2 className="text-lg font-semibold text-foreground mb-4">Profil bearbeiten</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-2">
                    Anzeigename
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/50 pointer-events-none" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ihr Name"
                      className="w-full rounded-xl glass border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background/50 pl-10 pr-4 py-3 sm:py-2 text-foreground placeholder:text-foreground/50 text-base sm:text-sm"
                    />
                  </div>
                  <p className="text-xs text-foreground/50 mt-1">{name.length}/50 Zeichen</p>
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

                <div className="flex gap-2 justify-end pt-4 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={onClose}
                    className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl glass border border-border/40 hover:bg-muted/60 active:bg-muted/80 text-foreground text-sm font-medium transition-colors min-h-[48px] sm:min-h-auto"
                    disabled={loading}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading || !name.trim()}
                    className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-400 text-white text-sm font-medium hover:from-violet-500 hover:to-cyan-300 active:from-violet-700 active:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px] sm:min-h-auto"
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
            className="fixed top-0 left-0 right-0 z-[90] flex items-start justify-center pointer-events-none p-4 pt-20 sm:pt-[50vh] sm:translate-y-[-50%]"
          >
            <div className="glass-strong border-glow rounded-2xl p-6 max-w-md w-full sm:w-[90vw] pointer-events-auto max-h-[70vh] overflow-y-auto">
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

                <div className="flex gap-2 justify-end pt-4 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={onClose}
                    className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl glass border border-border/40 hover:bg-muted/60 active:bg-muted/80 text-foreground text-sm font-medium transition-colors min-h-[48px] sm:min-h-auto"
                    disabled={loading}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                    className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-400 text-white text-sm font-medium hover:from-violet-500 hover:to-cyan-300 active:from-violet-700 active:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[48px] sm:min-h-auto"
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

export default function UserMenu({ email, displayName, onLogout }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName);
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

  const handleProfileSave = async (name: string) => {
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
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
                onClick={() => {
                  setProfileModalOpen(true);
                  setIsOpen(false);
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

      <ProfileModal
        email={email}
        displayName={currentDisplayName}
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onSave={handleProfileSave}
      />

      <PasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        onSave={handlePasswordChange}
      />
    </div>
  );
}
