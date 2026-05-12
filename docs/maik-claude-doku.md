# AutoArchiv - Abstimmung Maik / Claude / Kevin

Datum: 2026-05-12

## Worum es ging

Wir haben gestern parallel an AutoArchiv gearbeitet und uns dabei an zwei Stellen gegenseitig ueberschrieben:

1. Die Auth-/Session-Doku war nicht mehr aktuell genug.
2. Der produktive Backend-Prozess lief unter Maiks PM2-Instanz und hatte die neuen Aenderungen noch nicht geladen.

## Was der eigentliche Fehler war

- In der Dokumentation stand noch der alte Cookie-Stand mit `SameSite=Strict`.
- Der Code war bereits teilweise auf `SameSite=Lax` umgestellt.
- Der relevante Backend-Prozess musste auf Maiks PM2-Home neu gestartet werden, damit die Session-Fixes wirklich live sind.
- Zusaetzlich gab es einen kleinen Inkonsistenzpunkt bei der Cookie-Loeschung, weil Login und Logout/Fehlerpfade nicht exakt denselben Cookie-Scope verwendet haben.

## Was wir daran erkannt haben

- Kevin ist serverseitig weiterhin Admin.
- Die sichtbaren Unterschiede bei Dokumenten und offenen Zahlungen kamen nicht von einer geloeschten Rolle.
- Die Symptome passten eher zu:
  - unterschiedlichen Konten oder alten Browser-Caches
  - veralteter Doku
  - einem noch nicht neu geladenen Live-Prozess

## Was jetzt korrigiert ist

- Auth-Cookie und Cookie-Loeschung verwenden jetzt konsistent `SameSite=Lax` und `Path=/`.
- Die Doku wurde auf den aktuellen Stand gebracht.
- Der Live-API-Prozess wurde unter Maiks PM2 neu gestartet.
- Der Download dieser Notiz steht im Admin-Bereich von Kevin bereit.

## Kurzfassung fuer Maik

Wir haben aneinander vorbeigearbeitet, weil die Claude-Memory-Doku den alten `SameSite=Strict`-Stand noch beschrieben hat, waehrend der Code schon auf `Lax` umgestellt war. Ausserdem lief der produktive API-Prozess unter Maiks PM2 und musste dort neu gestartet werden, damit der Session-Fix wirklich aktiv wurde.

## Aktualisierung 2026-05-12

- Das Zahlungserinnerung-Onboarding wurde vereinfacht.
- Der `Topic abonnieren`-Schritt bietet jetzt Copy- und Generate-Logik fuer das ntfy-Topic.
- Der separate `Testen`-Tab wurde entfernt, damit der Flow kuerzer und klarer bleibt.
- ntfy ist jetzt pro Benutzer getrennt: bestehende Konten wurden mit eigenen Topics versorgt, neue Konten bekommen eine stabile persoenliche Topic-Empfehlung, und Profil/Setup zeigen den gespeicherten Sync-Status.
- Zusaetzlich hat jedes Konto einen persoenlichen Kalender-Feed fuer iPhone-Zahlungserinnerungen mit Standard-Vorlauf 2 Tage; der Feed-Link liegt auf der Profilseite.
- Der Reminder-Worker laeuft aktuell jede Minute, damit Tests schnell sichtbar werden.
- Zahlungen und Erinnerungen muessen serverseitig gespeichert werden; lokale Offline-Fallbacks sind fuer echte Reminder nicht mehr erlaubt.
- Die Dokumentanzahl darf nicht mehr auf `0` fallen, nur weil ein Teil-Request fehlschlaegt. Last-known-good bleibt sichtbar, bis echte Serverdaten da sind.
- Wenn Maik oder Claude an der ntfy-Integration etwas aendern, muessen `src/features/Zahlungen.tsx` und `docs/ntfy-push.md` zusammen aktualisiert werden.
