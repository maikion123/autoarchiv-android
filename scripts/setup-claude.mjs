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

# Step 1: OpenRouter API Key for Free-Claude
echo "📌 Free-Claude Setup:"
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

# Step 2: Pro-Claude OAuth Login
echo "📌 Pro-Claude OAuth Login:"
echo ""
read -p "Ready to log in to pro-claude now? (yes/no): " -r DO_LOGIN

if [[ "$DO_LOGIN" =~ ^(yes|y)$ ]]; then
    echo ""
    log_info "Launching pro-claude for OAuth..."
    echo ""
    echo "📋 Instructions:"
    echo "  1. Type in Claude Code: /login"
    echo "  2. Browser will open for OAuth authentication"
    echo "  3. Complete the authentication flow"
    echo "  4. Exit Claude Code: type /exit or press Ctrl+D"
    echo ""
    echo -e "${YELLOW}Ready? Press Enter to continue...${NC}"
    read -r
    echo ""

    # Launch pro-claude for login
    pro-claude

    # Check if credentials were saved
    CREDENTIALS_FILE="${HOME_DIR}/.claude/.credentials.json"
    echo ""
    if [ -f "$CREDENTIALS_FILE" ]; then
        log_success "✓ OAuth credentials saved successfully!"
    else
        log_warn "⚠️  OAuth credentials not found"
        log_info "You can log in later: pro-claude → /login"
    fi
else
    log_info "Skipped OAuth login - you can set it up later"
    log_info "Run: pro-claude → /login"
fi

echo ""

# Step 3: Done
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log_success "Setup complete! ✨"
echo ""
echo "🚀 Ready to use:"
echo ""
echo "1. Pro-Claude (with OAuth):"
echo "   $ pro-claude"
echo ""
echo "2. Free-Claude (with OpenRouter):"
echo "   $ free-claude"
echo ""
echo "💡 Tips:"
echo "   • Change model in free-claude: /model"
echo "   • Both use the same OAuth session"
echo "   • No additional login needed after setup"
echo ""
