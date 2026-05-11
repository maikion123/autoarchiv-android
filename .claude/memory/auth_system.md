---
name: Authentication System Details
description: How the backend auth works, endpoints, security measures, and flow
type: project
originSessionId: cedebed3-0b75-4549-a14d-fd3fbc8be27d
---
# Authentication System (Express Backend)

## Flow: Registration → OTP → Login

### Step 1: Registration (`POST /api/auth/register`)
**Input:** `{ email, password }`

1. Validate email format (regex: `^[^\s@]+@[^\s@]+\.[^\s@]+$`)
2. Validate password:
   - Min 8 characters
   - At least one special char: `!@#$%^&*()-_=+[]{}';:"\\|,.<>/?`
3. Check email not already registered → 409 if exists
4. Hash password with bcryptjs (cost 12)
5. Create user in `users` table
6. Generate 6-digit OTP: `crypto.randomInt(100000, 999999)`
7. Hash OTP with SHA-256, store in `email_verification_codes`
8. Set expiry: now + 10 minutes
9. Send OTP via SMTP email
10. Return: `{ message: "OTP sent" }`

**Security:**
- Rate limit: 25 req/15min on `POST /api/auth/login`, keyed by IP + email, with successful logins skipped from counting
- OTP not returned to frontend
- Password never logged

### Step 2: Verify OTP (`POST /api/auth/verify-otp`)
**Input:** `{ email, code }`

1. Find user by email
2. Get most recent non-expired, non-consumed OTP
3. Check code against hash (timing-safe comparison)
4. Max 5 failed attempts → code invalidated
5. If valid:
   - Mark code as consumed (consumed_at = now)
   - Update user: email_verified = 1
   - Return: `{ message: "Verified" }`
6. If invalid:
   - Increment attempts
   - Return 401: `{ error: "Invalid code" }`

**Security:**
- Timing-safe hash comparison (prevents timing attacks)
- Code auto-expires after 10 minutes
- Max 5 wrong guesses per code

### Step 3: Login (`POST /api/auth/login`)
**Input:** `{ email, password }`

1. Find user by email
2. Check if email_verified = 1
   - If not → 401: `{ error: "Email not verified" }`
3. Compare password with hash (bcryptjs.compare)
4. If valid:
   - **Create session in DB:**
     - Generate `sessionId` (UUID)
     - Insert into `sessions` table: `(id, user_id, last_activity, expires_at, created_at)`
     - Set expires_at = now + 30 minutes
   - Create JWT token:
     ```javascript
     {
       userId: user.id,
       email: user.email,
       sessionId: sessionId,  // NEW: Session tracking
       iat: now,
       exp: now + 4 hours    // CHANGED: Token expires in 4h
     }
     ```
   - Sign with HS256 (JWT_SECRET)
   - Set httpOnly cookie: `auth_token=token; HttpOnly; SameSite=Strict; Domain=nextkm.de; Max-Age=14400`
   - Return: `{ email: user.email, role: user.role, displayName: user.display_name || null }`
5. If invalid:
   - Delay response (timing attack mitigation)
   - Return 401: `{ error: "Invalid credentials" }`

**Security:**
- httpOnly flag: frontend cannot read cookie
- SameSite=Strict: CSRF protection
- **4-hour token expiry**: JWT is valid for 4 hours (fallback)
- **30-minute idle timeout**: Session expires after 30 min inactivity (primary)
- Timing-safe comparison (bcryptjs.compare is timing-safe)
- Frontend waits for `GET /api/auth/me` to confirm the cookie before navigating away from `/login`

### Step 4: Check Session (`GET /api/auth/me`) - WITH INACTIVITY TIMEOUT
**Input:** Cookie header (auto-sent by browser)

**NEW: requireAuth Middleware:**
1. Extract JWT from `auth_token` cookie
2. Verify signature with JWT_SECRET
3. **Load session from DB using sessionId from JWT**
4. **Check inactivity:**
   - If session not found → 401: `{ error: "Sitzung ungültig" }`
   - Get `last_activity` timestamp from session
   - Calculate time elapsed: `now - last_activity`
   - If elapsed > 30 minutes:
     - Delete session from DB
     - Clear cookie
     - Return 401: `{ error: "Sitzung abgelaufen (Inaktivität)" }`
5. **Update last_activity** to current time
6. Call next() to proceed to route handler

**Route Handler:**
1. Get user from DB
2. Return: `{ email: user.email, role: user.role, displayName: user.display_name || null }`

**Key Security Points:**
- Session timeout is server-side (cannot be bypassed by client)
- Every authenticated request resets inactivity counter
- Inactive sessions are immediately invalidated
- DB queries ensure authoritative session state

**Used by:** AppShell.tsx on mount and before any authenticated operation

### Step 5: Logout (`POST /api/auth/logout`)
**Input:** Cookie header

1. Extract JWT from `auth_token` cookie
2. If valid:
   - Get sessionId from decoded JWT
   - **Delete session from DB** using sessionId
   - Log 'LOGOUT' action
3. Clear `auth_token` cookie
4. Return: `{ message: "Abgemeldet" }`

**Note:** Even if cookie clearing fails, DB session deletion ensures user is logged out

**Note:** Frontend just navigates to /login after this. Cookie is expired.

---

## API Endpoints Summary

| Method | Endpoint | Auth | Rate Limit | Response |
|--------|----------|------|------------|----------|
| POST | /api/auth/register | No | 10/15min | `{message: "OTP sent"}` |
| POST | /api/auth/verify-otp | No | 10/15min | `{message: "Verified"}` |
| POST | /api/auth/resend-otp | No | 10/15min | `{message: "Code sent"}` |
| POST | /api/auth/login | No | 25/15min per IP+email | `{email: "...", role: "user", displayName: "..."}` + cookie |
| POST | /api/auth/logout | Cookie | 10/15min | `{message: "Logged out"}` |
| GET | /api/auth/me | Cookie | 10/15min | `{email: "...", role: "user", displayName: "..."}` |
| **PATCH** | **/api/auth/profile** | **Cookie** | **10/15min** | **`{message: "Profil aktualisiert", displayName: "..."}`** |
| **PATCH** | **/api/auth/change-password** | **Cookie** | **10/15min** | **`{message: "Passwort geändert"}`** |
| POST | /api/analyze-document | Cookie | No | Free local PDF text extraction / Tesseract image OCR metadata for uploads; filename fallback |
| GET | /api/health | No | No | `{status: "ok"}` |

---

## Profile Management Endpoints (NEW - 2026-05-11)

### `PATCH /api/auth/profile` — Update Display Name
**Input:** `{ displayName: "Max Mustermann" }`

**Validation:**
- displayName must be 1-50 characters
- Trimmed of whitespace
- Cannot be empty after trim

**Response on Success (200):**
```json
{
  "message": "Profil aktualisiert",
  "displayName": "Max Mustermann"
}
```

**Error Responses:**
- 400: `{ error: "Anzeigename erforderlich" }`
- 400: `{ error: "Anzeigename muss 1-50 Zeichen lang sein" }`
- 401: `{ error: "Unauthorized" }`
- 500: `{ error: "Fehler beim Aktualisieren des Profils" }`

**Security:**
- Requires valid auth cookie
- Updates `users.display_name` column
- Updates `updated_at` timestamp

---

### `PATCH /api/auth/change-password` — Change Password
**Input:** 
```json
{
  "currentPassword": "oldPass123!",
  "newPassword": "newPass456!"
}
```

**Validation:**
- `currentPassword`: Must match existing password hash (bcryptjs.compareSync)
- `newPassword`:
  - Minimum 8 characters
  - Must contain at least one special char: `!@#$%^&*()\-_=+[]{}';:"\\|,.<>/?`
  - Must not be empty

**Response on Success (200):**
```json
{
  "message": "Passwort geändert"
}
```

**Error Responses:**
- 400: `{ error: "Passwort und neues Passwort erforderlich" }`
- 400: `{ error: "Passwort muss mindestens 8 Zeichen lang sein" }`
- 400: `{ error: "Passwort muss mindestens ein Sonderzeichen enthalten" }`
- 401: `{ error: "Benutzer nicht gefunden" }`
- 401: `{ error: "Aktuelles Passwort ist falsch" }`
- 500: `{ error: "Fehler beim Ändern des Passworts" }`

**Security:**
- Requires valid auth cookie
- Timing-safe comparison for current password (bcryptjs)
- New password hashed with bcryptjs (cost 12)
- Old password never returned or logged
- Updates `users.password_hash` and `updated_at`

---

## Document Analysis Endpoint

`POST /api/analyze-document` is authenticated with the same `auth_token` cookie as the rest of the app.

**Input:** `{ filename, mimeType, imageBase64? }`

**Supported types:**
- `application/pdf`
- `image/*`

**Implementation:**
- Digital PDFs are parsed server-side with `pdfjs-dist` text extraction.
- Images are written to `/tmp`, OCRed with local `tesseract -l deu+eng --psm 6`, then deleted.
- Extracted text is processed by rule-based helpers in `api-server.mjs`.
- Returns AutoArchiv metadata fields: `absender`, `dokumenttyp`, `zusammenfassung`, `zahlungsbetrag`, `faelligkeitsdatum`, `ablaufdatum`, `vorgeschlagenerOrdner`, `vorgeschlagenerUnterordner`, `wichtigkeit`, `tags`.
- Max decoded file size is 20 MB; JSON body limit is 30 MB.
- No OpenAI/Supabase call is used for analysis now.

**Limitations:** Scanned PDFs without embedded text currently fall back to filename/MIME analysis. For scanned-PDF OCR, add a PDF-to-image renderer such as Poppler `pdftoppm` before Tesseract.

---

## SMTP Configuration

**Provider:** Gmail  
**Server:** smtp.gmail.com  
**Port:** 587 (STARTTLS)  
**Auth:** naikionion@gmail.com + App Password  
**From:** noreply@nextkm.de  
**Timeouts:** All 10 seconds (connection, greeting, socket)

**Email Template:** Simple text OTP code, 10-minute validity.

---

## Error Codes

| Code | Scenario |
|------|----------|
| 400 | Bad request (missing fields, invalid format) |
| 401 | Unauthorized (wrong password, expired OTP, no cookie) |
| 409 | Email already registered |
| 429 | Rate limited |
| 500 | Server error (SMTP timeout, DB error, etc.) |

---

## Security Summary

✅ Passwords: bcryptjs (cost 12), never logged  
✅ OTP: 6-digit, SHA-256 hashed, 10-min expiry, 5-attempt limit  
✅ Session: JWT in httpOnly SameSite=Lax cookie, 4-hour token expiry  
✅ **Idle Timeout: Server-side 30-minute inactivity limit (NEW)**
  - Sessions table tracks `last_activity` timestamp
  - Every authenticated request resets counter
  - Inactive sessions deleted after 30 min
  - Cannot be bypassed by client
  - Protects against indefinite auth on shared devices
✅ Transport: HTTPS only (enforced by Nginx)  
✅ Rate Limiting: `/api/auth/login` uses 25 req/15min per IP+email, successful logins do not count
✅ CSRF: SameSite=Lax cookie (allows same-site fetch requests, still protects against cross-site attacks)  
✅ Timing Attacks: Mitigated on password & hash comparisons  
✅ Headers: Helmet security headers  
✅ Logging: No passwords, no codes, no tokens in logs  
✅ **NEW (2026-05-12):** SameSite changed from Strict to Lax to allow fetch() requests with credentials
