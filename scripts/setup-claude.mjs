#!/bin/bash
# setup-claude: Simple setup for pro-claude and free-claude

set -euo pipefail

readonly HOME_DIR=$(eval echo ~$(whoami))
readonly CONFIG_DIR="${HOME_DIR}/.config/openrouter"

# Colors
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}[i]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Claude Code Setup (Pro + Free)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Pro-Claude (Just works with OAuth)
echo "📌 Pro-Claude:"
log_info "OAuth managed by Claude Code automatically"
log_info "run: pro-claude → /login (first time only)"
echo ""

# Step 2: OpenRouter API Key for Free-Claude
echo "📌 Free-Claude:"
read -p "OpenRouter API Key (from https://openrouter.ai/keys): " -r API_KEY

if [[ ! $API_KEY =~ ^sk-or-v1- ]]; then
    log_warn "API Key format may be invalid (should start with sk-or-v1-)"
fi

# Save API Key
mkdir -p "$CONFIG_DIR"
echo "OPENROUTER_API_KEY=$API_KEY" > "${CONFIG_DIR}/config"
chmod 600 "${CONFIG_DIR}/config"

log_success "OpenRouter API Key saved"
echo ""

# Step 3: Done
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log_success "Setup complete! ✨"
echo ""
echo "🚀 Next steps:"
echo ""
echo "1. Start Pro-Claude (with OAuth):"
echo "   $ pro-claude"
echo "   First time: /login (browser opens)"
echo ""
echo "2. Start Free-Claude (with OpenRouter):"
echo "   $ free-claude"
echo "   Uses same OAuth as Pro"
echo ""
echo "💡 Tips:"
echo "   • Change model in free-claude: /model"
echo "   • OAuth tokens persist automatically"
echo "   • No manual login needed after first time"
echo ""
