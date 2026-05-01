import 'dotenv/config';
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASSWORD;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';

console.log(`Testing SMTP: ${SMTP_HOST}:${SMTP_PORT}`);
console.log(`User: ${SMTP_USER}`);
console.log(`Secure: ${SMTP_SECURE}`);
console.log(`Timeout: 10 seconds\n`);

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  requireTLS: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP-Verbindung FEHLGESCHLAGEN');
    console.error('Fehlertyp:', err.code);
    console.error('Nachricht:', err.message);
    if (err.code === 'EAUTH') {
      console.error('\n→ Authentifizierungsfehler: App-Passwort falsch oder nicht aktiviert');
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.error('\n→ Verbindungsfehler: Gmail blockiert oder Timeout');
    } else if (err.code === 'ENOTFOUND') {
      console.error('\n→ DNS-Fehler: SMTP_HOST falsch');
    }
    process.exit(1);
  } else {
    console.log('✅ SMTP-Verbindung OK');
    console.log('Transporter bereit für Mail-Versand');
    process.exit(0);
  }
});

setTimeout(() => {
  console.error('❌ TIMEOUT nach 10 Sekunden (kein SMTP-Response)');
  process.exit(1);
}, 10000);
