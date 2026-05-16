#!/bin/bash
# delete-claude: Löscht alle Claude-Konfigurationen des aktuellen Users

set -euo pipefail

readonly USER=$(whoami)
readonly HOME_DIR=$(eval echo ~$USER)

# Farben
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}Warnung: Dies löscht ALLE Claude-Konfigurationen für $USER${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

read -p "Möchtest du fortfahren? (ja/nein): " -r response

if [[ ! "$response" =~ ^(ja|yes|j|y)$ ]]; then
    log_warn "Abgebrochen"
    exit 0
fi

echo ""
log_warn "Lösche Konfigurationen..."

# Entferne Claude-Dateien
rm -rf "${HOME_DIR}/.claude" 2>/dev/null || true
rm -rf "${HOME_DIR}/.config/claude" 2>/dev/null || true
rm -rf "${HOME_DIR}/.config/openrouter" 2>/dev/null || true

log_success "✓ Alle Claude-Konfigurationen gelöscht"
log_warn "Führe setup-claude aus, um neu zu konfigurieren"

