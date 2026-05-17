#!/bin/bash
# setup-claude: Automatischer Setup für Claude Pro + OpenRouter (mit Profil-Isolation)

set -euo pipefail

readonly USER=$(whoami)
readonly HOME_DIR=$(eval echo ~$USER)
readonly CLAUDE_DIR="${HOME_DIR}/.claude"
readonly PROFILES_DIR="${CLAUDE_DIR}/profiles"
readonly PRO_PROFILE="${PROFILES_DIR}/pro"
readonly FREE_PROFILE="${PROFILES_DIR}/free"
readonly CONFIG_DIR="${HOME_DIR}/.config"

# Farben
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$*${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 1: Verzeichnisstruktur erstellen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Claude Setup für $USER (mit Profil-Isolation)"

mkdir -p "${PROFILES_DIR}/pro"
mkdir -p "${PROFILES_DIR}/free"
mkdir -p "${CONFIG_DIR}/openrouter"

log_success "Profil-Verzeichnisse erstellt:"
log_success "  Pro:  ${PRO_PROFILE}/"
log_success "  Free: ${FREE_PROFILE}/"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 2: Pro-Profile initialisieren
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Claude Pro (isoliert)"

cat > "${PRO_PROFILE}/settings.json" << 'PRO_EOF'
{
  "theme": "dark",
  "model": "opus",
  "comment": "Pro-Profile: Browser OAuth (Anthropic Claude.ai) - ISOLATED"
}
PRO_EOF

log_success "Pro-Profile erstellt in ${PRO_PROFILE}/"
log_info "Beim ersten Start: pro-claude → dann /login für OAuth"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 3: Free-Profile + OpenRouter konfigurieren
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Claude Free + OpenRouter"

read -p "OpenRouter API Key (von https://openrouter.ai/keys): " -r API_KEY

if [[ ! $API_KEY =~ ^sk-or-v1- ]]; then
    log_warn "API Key scheint ungültig zu sein (sollte mit sk-or-v1- beginnen)"
fi

# Erstelle Free-Profile Settings (isoliert)
cat > "${FREE_PROFILE}/settings.json" << FREE_EOF
{
  "theme": "dark",
  "model": "openrouter/free",
  "comment": "Free-Profile: OpenRouter Free Models - ISOLATED"
}
FREE_EOF

# Erstelle OpenRouter Config (isoliert in free/ Profil)
mkdir -p "${FREE_PROFILE}/.config/openrouter"
cat > "${FREE_PROFILE}/.config/openrouter/config" << CONFIG_EOF
ANTHROPIC_AUTH_TOKEN=$API_KEY
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
CONFIG_EOF
chmod 600 "${FREE_PROFILE}/.config/openrouter/config"

# Speichere API Key auch global für Referenz
echo "$API_KEY" > "${CONFIG_DIR}/openrouter/api-key"
chmod 600 "${CONFIG_DIR}/openrouter/api-key"

log_success "Free-Profile erstellt in ${FREE_PROFILE}/"
log_success "OpenRouter Config gespeichert (isoliert)"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 4: Backup Template speichern
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Templates speichern (für Reset)"

cp "${PRO_PROFILE}/settings.json" "${CLAUDE_DIR}/settings.pro.json"
cp "${FREE_PROFILE}/settings.json" "${CLAUDE_DIR}/settings.free.json"

log_success "Templates gespeichert (für delete-claude)"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 5: Validierung
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Validierung"

[ -f "${PRO_PROFILE}/settings.json" ] && log_success "✓ Pro-Profile Settings" || log_warn "✗ Pro-Profile Settings fehlt"
[ -f "${FREE_PROFILE}/settings.json" ] && log_success "✓ Free-Profile Settings" || log_warn "✗ Free-Profile Settings fehlt"
[ -f "${FREE_PROFILE}/.config/openrouter/config" ] && log_success "✓ OpenRouter Config isoliert" || log_warn "✗ OpenRouter Config fehlt"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Fertig!
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Setup abgeschlossen! ✨"

echo ""
echo "📁 Profil-Struktur:"
echo "   Pro:  ${PRO_PROFILE}/ (isoliert)"
echo "   Free: ${FREE_PROFILE}/ (isoliert)"
echo ""
echo "🚀 Nächste Schritte:"
echo ""
echo "1. Claude Pro starten:"
echo "   $ pro-claude"
echo "   Beim Start: /login (OAuth Authentifizierung)"
echo ""
echo "2. Claude Free starten:"
echo "   $ free-claude"
echo ""
echo "💡 Profile sind jetzt ISOLIERT:"
echo "   - Pro und Free laufen unabhängig"
echo "   - Settings, Tokens, Config sind getrennt"
echo "   - Keine gegenseitige Beeinflussung!"
echo ""
