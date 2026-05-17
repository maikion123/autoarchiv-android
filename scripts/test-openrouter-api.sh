#!/bin/bash
# test-openrouter-api: Überprüfe OpenRouter API Verbindung

set -euo pipefail

readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}[i]${NC} $*"; }
log_ok() { echo -e "${GREEN}[✓]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*"; }

USER=$(whoami)
HOME_DIR=$(eval echo ~$USER)
CONFIG_DIR="${HOME_DIR}/.config"
OPENROUTER_CONFIG="${CONFIG_DIR}/openrouter/config"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}OpenRouter API Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. Überprüfe ob API Key existiert
echo "1️⃣  OpenRouter API Key:"
if [ ! -f "$OPENROUTER_CONFIG" ]; then
    log_error "Config nicht gefunden: $OPENROUTER_CONFIG"
    exit 1
fi

if ! grep -q "ANTHROPIC_AUTH_TOKEN" "$OPENROUTER_CONFIG"; then
    log_error "ANTHROPIC_AUTH_TOKEN nicht in config"
    exit 1
fi

log_ok "Config existiert mit ANTHROPIC_AUTH_TOKEN"
echo ""

# Lade API Key
source "$OPENROUTER_CONFIG"

if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
    log_error "ANTHROPIC_AUTH_TOKEN ist leer"
    exit 1
fi

log_ok "API Key geladen (${#ANTHROPIC_AUTH_TOKEN} Zeichen)"
echo ""

# 2. Test API Verbindung
echo "2️⃣  API Verbindung:"
log_info "Teste OpenRouter API v1..."

RESPONSE=$(curl -s -X GET "https://openrouter.ai/api/v1/models" \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    log_ok "API erreichbar (HTTP $HTTP_CODE)"
else
    log_error "API antwortet mit HTTP $HTTP_CODE"
    echo "$BODY" | head -20
    exit 1
fi
echo ""

# 3. Überprüfe Free-Modelle
echo "3️⃣  Verfügbare Free-Modelle:"
FREE_COUNT=$(echo "$BODY" | jq '.data[] | select(.name | contains("(free)"))' 2>/dev/null | jq -s 'length')
log_ok "Gefundene Free-Modelle: $FREE_COUNT"
echo ""

# 4. Test mit spezifischem Modell
echo "4️⃣  Test Modell-Abruf (deepseek/deepseek-v4-flash:free):"
MODEL_RESPONSE=$(curl -s -X GET "https://openrouter.ai/api/v1/models" \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -w "\n%{http_code}")

MODEL_HTTP=$(echo "$MODEL_RESPONSE" | tail -n 1)
MODEL_BODY=$(echo "$MODEL_RESPONSE" | head -n -1)

MODEL_EXISTS=$(echo "$MODEL_BODY" | jq '.data[] | select(.id == "deepseek/deepseek-v4-flash:free")' 2>/dev/null | jq -s 'length')

if [ "$MODEL_EXISTS" -gt 0 ]; then
    log_ok "Modell deepseek/deepseek-v4-flash:free existiert"
else
    log_error "Modell deepseek/deepseek-v4-flash:free nicht gefunden"
    # Zeige ähnliche Modelle
    echo ""
    echo "Ähnliche Modelle mit 'deepseek':"
    echo "$MODEL_BODY" | jq -r '.data[] | select(.id | contains("deepseek")) | .id' 2>/dev/null || true
fi
echo ""

# 5. Empfehlungen
echo "5️⃣  Empfehlungen:"
log_ok "API funktioniert! Du kannst free-claude nutzen."
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
