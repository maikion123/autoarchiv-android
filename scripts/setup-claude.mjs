#!/bin/bash
# setup-claude: Claude Pro Setup (Shared OAuth + Isolated Models)

set -euo pipefail

readonly USER=$(whoami)
readonly HOME_DIR=$(eval echo ~$USER)
readonly CLAUDE_DIR="${HOME_DIR}/.claude"
readonly PROFILES_DIR="${CLAUDE_DIR}/profiles"
readonly PRO_PROFILE="${PROFILES_DIR}/pro"
readonly FREE_PROFILE="${PROFILES_DIR}/free"

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

log_section "Claude Code Pro Setup für $USER"

mkdir -p "${PROFILES_DIR}/pro"
mkdir -p "${PROFILES_DIR}/free"
mkdir -p "${FREE_PROFILE}/.config/openrouter"

log_success "Profil-Verzeichnisse erstellt"
log_info "OAuth wird SHARED zwischen Pro und Free"
log_info "Modelle sind ISOLIERT"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 2: Pro-Profile (Opus + Claude.ai OAuth)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Pro Profile - Claude Code Pro OAuth + Opus"

cat > "${PRO_PROFILE}/settings.json" << 'PRO_EOF'
{
  "theme": "dark",
  "model": "opus",
  "comment": "Pro-Profile: Uses Claude Code Pro OAuth + Opus model"
}
PRO_EOF

log_success "Pro-Profile erstellt: ${PRO_PROFILE}/"
log_info "OAuth tokens werden GETEILT in ~/.claude/.credentials.json"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 3: Free-Profile (OpenRouter + Pro OAuth)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Free Profile - Pro OAuth + OpenRouter"

cat > "${FREE_PROFILE}/settings.json" << FREE_EOF
{
  "theme": "dark",
  "model": "openrouter/free",
  "comment": "Free-Profile: Uses Pro OAuth but OpenRouter for models"
}
FREE_EOF

log_success "Free-Profile erstellt: ${FREE_PROFILE}/"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 4: OpenRouter API Key (für free-claude)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "OpenRouter API (nur für free-claude)"

read -p "OpenRouter API Key (von https://openrouter.ai/keys): " -r API_KEY

if [[ ! $API_KEY =~ ^sk-or-v1- ]]; then
    log_warn "API Key scheint ungültig (sollte mit sk-or-v1- beginnen)"
fi

# Speichere in Free-Profile
cat > "${FREE_PROFILE}/.env" << ENV_EOF
export ANTHROPIC_BASE_URL="https://openrouter.ai/api/v1"
export ANTHROPIC_AUTH_TOKEN="$API_KEY"
export ANTHROPIC_API_KEY=""
ENV_EOF

chmod 600 "${FREE_PROFILE}/.env"
log_success "OpenRouter Config gespeichert (nur in free-claude verwendet)"

# Speichere auch für Referenz
mkdir -p "${HOME_DIR}/.config/openrouter"
echo "$API_KEY" > "${HOME_DIR}/.config/openrouter/api-key"
chmod 600 "${HOME_DIR}/.config/openrouter/api-key"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 5: Templates speichern
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cp "${PRO_PROFILE}/settings.json" "${CLAUDE_DIR}/settings.pro.json"
cp "${FREE_PROFILE}/settings.json" "${CLAUDE_DIR}/settings.free.json"

log_success "Templates gespeichert"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 6: Validierung
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Validierung"

[ -f "${PRO_PROFILE}/settings.json" ] && log_success "✓ Pro Settings" || echo "✗ Pro Settings fehlt"
[ -f "${FREE_PROFILE}/settings.json" ] && log_success "✓ Free Settings" || echo "✗ Free Settings fehlt"
[ -f "${FREE_PROFILE}/.env" ] && log_success "✓ OpenRouter Config" || echo "✗ OpenRouter Config fehlt"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Fertig!
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "Setup abgeschlossen! ✨"

echo ""
echo "📋 Wichtig - Beides nutzt Claude Code Pro:"
echo "   Pro-Claude:  OAuth + Opus Model (Claude.ai)"
echo "   Free-Claude: OAuth + OpenRouter Models (kostenlos)"
echo ""
echo "🚀 Nächste Schritte:"
echo ""
echo "1. Pro starten und anmelden:"
echo "   $ pro-claude"
echo "   Beim Start: /login (Browser öffnet sich)"
echo ""
echo "2. Tokens werden GETEILT:"
echo "   Die gleichen OAuth-Tokens funktionieren in Free!"
echo ""
echo "3. Free starten (bereits angemeldet):"
echo "   $ free-claude"
echo ""
echo "4. Model in Free ändern:"
echo "   $ free-claude-model"
echo ""
echo "💡 Wichtig:"
echo "   • Beide brauchen Claude Code Pro Subscription"
echo "   • OAuth wird geteilt (login nur 1x nötig)"
echo "   • Modelle sind isoliert (Opus vs OpenRouter)"
echo ""
