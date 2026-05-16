#!/bin/bash
# setup-claude: Automatischer Setup für Claude Pro + OpenRouter

set -euo pipefail

readonly USER=$(whoami)
readonly HOME_DIR=$(eval echo ~$USER)
readonly CLAUDE_DIR="${HOME_DIR}/.claude"
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
# Schritt 1: Ordner vorbereiten
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Claude Setup für $USER"

mkdir -p "${CLAUDE_DIR}"
mkdir -p "${CONFIG_DIR}/claude"
mkdir -p "${CONFIG_DIR}/openrouter"

log_success "Ordner vorbereitet"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 2: Claude Pro OAuth konfigurieren
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Claude Pro OAuth Setup"

cat > "${CLAUDE_DIR}/settings.pro.json" << 'PRO_EOF'
{
  "theme": "dark",
  "model": "opus",
  "comment": "Pro-Profile: Browser OAuth (Anthropic Claude.ai)"
}
PRO_EOF

log_success "Pro-Profile erstellt"
log_info "Beim ersten Start mit pro-claude: Führe /login aus für OAuth"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 3: OpenRouter konfigurieren
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "OpenRouter Free Setup"

read -p "OpenRouter API Key (von https://openrouter.ai/keys): " -r API_KEY

if [[ ! $API_KEY =~ ^sk-or-v1- ]]; then
    log_warn "API Key scheint ungültig zu sein (sollte mit sk-or-v1- beginnen)"
fi

# Speichere API Key sicher
echo "$API_KEY" > "${CONFIG_DIR}/openrouter/api-key"
chmod 600 "${CONFIG_DIR}/openrouter/api-key"

# Erstelle Free-Profile mit korrektem Modell
cat > "${CLAUDE_DIR}/settings.free.json" << FREE_EOF
{
  "theme": "dark",
  "model": "openrouter/auto",
  "comment": "Free-Profile: OpenRouter Free Models"
}
FREE_EOF

# Speichere API-Konfiguration separat
cat > "${CONFIG_DIR}/openrouter/config" << CONFIG_EOF
OPENAI_API_KEY=$API_KEY
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openrouter/free
CONFIG_EOF

chmod 600 "${CONFIG_DIR}/openrouter/config"
log_success "OpenRouter konfiguriert"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 4: Validierung
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Validierung"

if [ -f "${CLAUDE_DIR}/settings.pro.json" ]; then
    log_success "✓ Pro-Profile vorhanden"
else
    log_warn "Pro-Profile nicht gefunden"
fi

if [ -f "${CLAUDE_DIR}/settings.free.json" ]; then
    log_success "✓ Free-Profile vorhanden"
else
    log_warn "Free-Profile nicht gefunden"
fi

if [ -f "${CONFIG_DIR}/openrouter/api-key" ]; then
    log_success "✓ OpenRouter API-Key gespeichert"
else
    log_warn "OpenRouter API-Key nicht gefunden"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Fertig!
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Setup abgeschlossen! ✨"

echo ""
echo "Nächste Schritte:"
echo ""
echo "1. Claude Pro starten:"
echo "   $ pro-claude"
echo "   Dann: /login (OAuth Authentifizierung)"
echo ""
echo "2. Claude Free starten:"
echo "   $ free-claude"
echo ""
echo "Profile wechseln:"
echo "   $ pro-claude   (zurück zu Pro)"
echo "   $ free-claude  (zu Free)"
echo ""

