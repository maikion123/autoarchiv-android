#!/bin/bash
# delete-claude: Safe deletion of Claude profiles (keeps shared OAuth)

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
echo -e "${RED}Warning: Deletes Claude Pro/Free profiles for $USER${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "This will delete:"
echo "  • ${PROFILES_DIR}/pro/"
echo "  • ${PROFILES_DIR}/free/"
echo ""
echo "⚠️  OAuth tokens in ~/.claude/.credentials.json will be KEPT"
echo "   (so you can restore settings without re-logging in)"
echo ""

read -p "Continue? (yes/no): " -r response

if [[ ! "$response" =~ ^(yes|y)$ ]]; then
    log_warn "Aborted"
    exit 0
fi

echo ""
log_warn "Deleting profiles..."
echo ""

# Delete isolated profiles
if [ -d "${PROFILES_DIR}/pro" ]; then
    rm -rf "${PROFILES_DIR}/pro"
    log_success "Pro-Profile deleted"
fi

if [ -d "${PROFILES_DIR}/free" ]; then
    rm -rf "${PROFILES_DIR}/free"
    log_success "Free-Profile deleted"
fi

# Delete active symlink
if [ -L "${CLAUDE_DIR}/settings.json" ] || [ -f "${CLAUDE_DIR}/settings.json" ]; then
    rm -f "${CLAUDE_DIR}/settings.json"
    log_success "Active settings deleted"
fi

# Keep templates for recovery
log_info "Templates in ~/.claude/ kept (for setup-claude)"
log_info "OAuth tokens in ~/.claude/.credentials.json KEPT"

echo ""
log_success "✓ Profiles deleted"
log_warn "→ Run: setup-claude (to reconfigure)"
echo ""
