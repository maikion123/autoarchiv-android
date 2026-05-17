#!/bin/bash
# delete-claude: Sichere Löschung aller Claude-Konfigurationen (mit Profil-Isolation)

set -euo pipefail

readonly USER=$(whoami)
readonly HOME_DIR=$(eval echo ~$USER)
readonly CLAUDE_DIR="${HOME_DIR}/.claude"
readonly PROFILES_DIR="${CLAUDE_DIR}/profiles"

# Farben
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_info() { echo -e "${BLUE}[i]${NC} $*"; }

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}Warnung: Dies löscht ALLE Claude-Profile für $USER${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Dies betrifft:"
echo "  • Pro-Profile:  ${PROFILES_DIR}/pro/"
echo "  • Free-Profile: ${PROFILES_DIR}/free/"
echo "  • Alle Settings, Tokens, Credentials"
echo ""

read -p "Möchtest du fortfahren? (ja/nein): " -r response

if [[ ! "$response" =~ ^(ja|yes|j|y)$ ]]; then
    log_warn "Abgebrochen"
    exit 0
fi

echo ""
log_warn "Lösche Konfigurationen..."
echo ""

# Lösche isolierte Profile
if [ -d "${PROFILES_DIR}/pro" ]; then
    rm -rf "${PROFILES_DIR}/pro"
    log_success "Pro-Profile gelöscht"
fi

if [ -d "${PROFILES_DIR}/free" ]; then
    rm -rf "${PROFILES_DIR}/free"
    log_success "Free-Profile gelöscht"
fi

# Lösche active symlink
if [ -L "${CLAUDE_DIR}/settings.json" ] || [ -f "${CLAUDE_DIR}/settings.json" ]; then
    rm -f "${CLAUDE_DIR}/settings.json"
    log_success "Aktive Settings gelöscht"
fi

# Behalte Templates für Reset (optional)
log_info "Templates in ~/.claude/ erhalten (für setup-claude)"

echo ""
log_success "✓ Alle Claude-Profile gelöscht"
log_warn "→ Führe setup-claude aus, um neu zu konfigurieren"
echo ""
