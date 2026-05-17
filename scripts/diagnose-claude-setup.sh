#!/bin/bash
# diagnose-claude-setup: Überprüfe Claude Setup Konfiguration

set -euo pipefail

readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}[i]${NC} $*"; }
log_ok() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*"; }

USER=$(whoami)
HOME_DIR=$(eval echo ~$USER)
CLAUDE_DIR="${HOME_DIR}/.claude"
CONFIG_DIR="${HOME_DIR}/.config"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Claude Setup Diagnose für $USER${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. Überprüfe Pro-Profile
echo "1️⃣  Pro-Profile:"
if [ -f "$CLAUDE_DIR/settings.pro.json" ]; then
    log_ok "settings.pro.json existiert"
    PROTO_MODEL=$(jq -r '.model' "$CLAUDE_DIR/settings.pro.json" 2>/dev/null || echo "ERROR")
    echo "   Model: $PROTO_MODEL"
else
    log_error "settings.pro.json nicht gefunden"
fi
echo ""

# 2. Überprüfe Free-Profile
echo "2️⃣  Free-Profile:"
if [ -f "$CLAUDE_DIR/settings.free.json" ]; then
    log_ok "settings.free.json existiert"
    FREE_MODEL=$(jq -r '.model' "$CLAUDE_DIR/settings.free.json" 2>/dev/null || echo "ERROR")
    echo "   Model: $FREE_MODEL"
else
    log_error "settings.free.json nicht gefunden - führe setup-claude aus"
fi
echo ""

# 3. Überprüfe aktive Settings
echo "3️⃣  Aktive Settings (settings.json):"
if [ -f "$CLAUDE_DIR/settings.json" ]; then
    log_ok "settings.json existiert"
    ACTIVE_MODEL=$(jq -r '.model' "$CLAUDE_DIR/settings.json" 2>/dev/null || echo "ERROR")
    echo "   Model: $ACTIVE_MODEL"
else
    log_warn "settings.json nicht gefunden (wird bei free-claude/pro-claude erstellt)"
fi
echo ""

# 4. Überprüfe OpenRouter Config
echo "4️⃣  OpenRouter Konfiguration:"
if [ -f "$CONFIG_DIR/openrouter/config" ]; then
    log_ok "$CONFIG_DIR/openrouter/config existiert"
    if grep -q "ANTHROPIC_AUTH_TOKEN" "$CONFIG_DIR/openrouter/config"; then
        log_ok "ANTHROPIC_AUTH_TOKEN gesetzt"
    else
        log_error "ANTHROPIC_AUTH_TOKEN nicht gesetzt"
    fi
else
    log_error "$CONFIG_DIR/openrouter/config nicht gefunden"
fi
echo ""

# 5. Überprüfe Credentials
echo "5️⃣  OAuth Credentials:"
if [ -f "$CLAUDE_DIR/.credentials.json" ]; then
    log_ok "$CLAUDE_DIR/.credentials.json existiert (OAuth tokens)"
    TOKEN_COUNT=$(jq 'keys | length' "$CLAUDE_DIR/.credentials.json" 2>/dev/null || echo "0")
    echo "   Tokens: $TOKEN_COUNT"
else
    log_warn ".credentials.json nicht gefunden (wird bei pro-claude /login erstellt)"
fi
echo ""

# 6. Überprüfe Verzeichnis-Berechtigungen
echo "6️⃣  Berechtigungen:"
if [ -d "$CLAUDE_DIR" ]; then
    PERMS=$(ls -ld "$CLAUDE_DIR" | awk '{print $1}')
    echo "   $CLAUDE_DIR: $PERMS"
else
    log_error "$CLAUDE_DIR existiert nicht"
fi
echo ""

# 7. Test: Starte free-claude mit Test-Flag
echo "7️⃣  Test: free-claude Profile wird geladen:"
if [ -f "$CLAUDE_DIR/settings.free.json" ] && [ -f "$CONFIG_DIR/openrouter/config" ]; then
    # Simuliere free-claude Ablauf
    SETTINGS_TEST="${CLAUDE_DIR}/settings.json.test"
    cp "$CLAUDE_DIR/settings.free.json" "$SETTINGS_TEST"
    TEST_MODEL=$(jq -r '.model' "$SETTINGS_TEST" 2>/dev/null || echo "ERROR")
    rm "$SETTINGS_TEST"

    log_ok "free-claude würde folgendes Modell laden: $TEST_MODEL"
else
    log_error "Kann free-claude Profil nicht simulieren"
fi
echo ""

# 8. Empfehlungen
echo "8️⃣  Empfehlungen:"
if [ ! -f "$CLAUDE_DIR/settings.free.json" ]; then
    log_warn "→ Führe aus: setup-claude"
elif [ ! -f "$CONFIG_DIR/openrouter/config" ]; then
    log_warn "→ Führe aus: setup-claude (OpenRouter API Key erforderlich)"
else
    log_ok "→ Alles sieht gut aus! Nutze: free-claude"
fi
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
