# ntfy Push-Benachrichtigungen

AutoArchiv kann kostenlose Push-Nachrichten an `ntfy` senden. Für den Start ist `https://ntfy.sh` vorgesehen. Später kann die Basis-URL per ENV auf eine eigene Instanz umgestellt werden.
Für iPhone-Zahlungserinnerungen ist jetzt zusätzlich ein persönlicher Kalender-Feed pro Benutzer verfügbar; `ntfy` bleibt optional.

Wichtig: Die eigentlichen Erinnerungen laufen pro Benutzerkonto. Jeder Nutzer hat sein eigenes ntfy-Topic im Konto, und der Reminder-Worker sendet nur an dieses persönliche Topic, wenn ntfy aktiv genutzt wird. Es gibt keinen globalen Sammelkanal mehr.

Aktueller Stand:
- Bestehende Konten wurden per Backfill mit einem eigenen Topic versorgt.
- Neue Registrierungen bekommen beim Anlegen automatisch einen persönlichen ntfy-Vorschlag.
- Der Reminder-Worker läuft aktuell jede Minute.
- Zahlungen werden nur noch serverseitig gespeichert; lokale Offline-Fallbacks für echte Reminder sind deaktiviert.
- Zusätzlich bekommt jedes Konto einen geheimen Kalender-Feed-Link, der im Profil angezeigt wird und auf dem iPhone als abonnierter Kalender mit Alarm 1/2/7 Tage vorher genutzt werden kann.

## AutoArchiv-Onboarding

Das geführte Onboarding in der Zahlungen-Ansicht nutzt dieselbe ntfy-Konfiguration:

- Der Schritt `Topic abonnieren` zeigt den Topic-Link als QR-Code und als kopierbaren Wert.
- Der QR-Code ist jetzt plattformgetrennt: iPhone öffnet eine interne AutoArchiv-Hilfeseite mit Topic und Anleitung, Android nutzt einen `ntfy://`-Deep-Link.
- Die Kalender-Erinnerung für iPhone wird im Profil über den persönlichen Kalender-Feed eingerichtet; dort kann auch der Vorlauf standardmäßig auf 2 Tage gestellt werden.
- Der eigentliche Einstieg läuft über die interne nextKM-Seite `/ntfy-setup?kind=calendar...`, damit der erste Klick innerhalb von nextKM bleibt.
- Wenn im Konto noch kein Topic gespeichert ist, generiert die UI einen lokalen Vorschlag und zeigt ihn zum Kopieren an.
- Der Vorschlag beginnt mit dem angemeldeten Namen, zum Beispiel `autoarchiv-kevin-...`, nicht mit einem generischen Platzhalter.
- Der separate `Testen`-Tab wurde entfernt; die eigentliche Prüfung bleibt der Admin-Test-Endpunkt oder ein manueller ntfy-POST.
- Die UI bezieht die persönliche Konfiguration über `GET /api/notifications/ntfy-config`.
- Der Profil-Dialog zeigt jetzt `Topic im Konto gespeichert` und `Letzter Sync erfolgreich`, lädt aber den Serverstand neu beim Öffnen, damit kein alter Cache die Anzeige verfälscht.

## iPhone App installieren

1. Installiere die ntfy-App aus dem App Store.
2. Öffne die App.
3. Abonniere dein Topic, z. B. `autoarchiv-kevin-reinhardt-zvw-kevin-reinhardt-zvw-gmai-1o0pe8v`.
4. Benachrichtigungen für die App erlauben.

Auf Android kann der QR-Code die App direkt per `ntfy://<host>/<topic>` öffnen und die Subscription anlegen.
Auf iPhone öffnet der QR-Code die AutoArchiv-Hilfeseite, damit der Scan sauber funktioniert. Dort kopierst du das Topic und speicherst es im Konto, damit AutoArchiv den Sync-Zustand sieht.
Die eigentliche iPhone-Erinnerung für Zahlungen läuft über den persönlichen Kalender-Feed im Profil, nicht über ntfy.

## Topic testen

Ein Topic ist ohne Login wie ein Passwort. Verwende deshalb einen langen, zufälligen Namen.

Vom VPS oder lokal:

```bash
curl -d "Test vom VPS" https://ntfy.sh/<topic>
```

## .env konfigurieren

Beispiel:

```env
NTFY_ENABLED=true
NTFY_BASE_URL=https://ntfy.sh
NTFY_TOPIC=autoarchiv-kevin-BITTE-LANG-ZUFAELLIG-MACHEN
NTFY_TOKEN=
NTFY_DEFAULT_PRIORITY=default
PUBLIC_APP_URL=https://nextkm.de
```

Für Self-Hosting reicht es später, `NTFY_BASE_URL` auf die eigene Instanz zu setzen, zum Beispiel `https://push.nextkm.de`.

`NTFY_TOPIC` wird weiterhin vom Admin-Test-Endpunkt und für manuelle globale Tests benutzt. Für die regulären Erinnerungen zählt das Topic im Benutzerprofil oder der automatisch erzeugte persönliche Topic-Vorschlag.

## API-Test-Endpunkt

Der Test-Endpunkt sendet eine Push-Nachricht an das konfigurierte Topic:

```http
POST /api/notifications/test-ntfy
```

Die Route ist nur für eingeloggte Admins erreichbar.

## Cronjob

Der Reminder-Worker kann per Cronjob laufen:

```cron
*/5 * * * * cd /srv/projects/autoarchiv && /usr/local/bin/node reminder-worker.mjs >> logs/reminder-worker.log 2>&1
```

Der Worker erinnert an:

- fällige Dokumente mit aktivierter Erinnerung
- offene Zahlungen 1 Tag vor Fälligkeit
- offene Zahlungen am Fälligkeitstag selbst

Bei Dokumenten setzt er anschließend `reminderSentAt`, bei Zahlungen separate Zeitstempel für den Vorab- und den Same-Day-Reminder, damit keine Doppelmeldungen entstehen. Der Worker verwendet pro Benutzer das gespeicherte `ntfyTopic` und fällt ansonsten auf den serverseitig erzeugten persönlichen Topic-Namen zurück.
Die Benachrichtigung wird dabei immer an das persönliche `ntfyTopic` des Besitzers gesendet.
