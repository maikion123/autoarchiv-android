#!/bin/bash
# delete-claude: Delete free-claude config (keeps OAuth)

set -euo pipefail

readonly HOME_DIR=$(eval echo ~$(whoami))
readonly CONFIG_DIR="${HOME_DIR}/.config/claude-free"

# Colors
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

log_warn() { echo -e "${YELLOW}!${NC} $*"; }
log_success() { echo -e "${GREEN}✓${NC} $*"; }

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${RED}Delete Free-Claude Configuration?${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "This will delete:"
echo "  • ${CONFIG_DIR}/ (method, API keys)"
echo ""
echo "⚠️  OAuth tokens in ~/.claude/.credentials.json are KEPT"
echo ""

read -p "Continue? (yes/no): " -r response

if [[ ! "$response" =~ ^(yes|y)$ ]]; then
    log_warn "Aborted"
    exit 0
fi

echo ""
log_warn "Deleting..."

if [ -d "$CONFIG_DIR" ]; then
    rm -rf "$CONFIG_DIR"
    log_success "Free-Claude config deleted"
fi

echo ""
log_success "Done"
log_warn "→ Run: setup-claude (to reconfigure)"
echo ""
