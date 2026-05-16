#!/bin/bash
# install-claude-system.sh
# Automatische Installer für Multi-User Claude Code Setup
# Unterstützt: kevin, maik
# Installation ohne weitere Rückfragen

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPTS_DIR="${SCRIPT_DIR}/scripts"
readonly BIN_DIR="/usr/local/bin"
readonly USERS=("kevin" "maik")

# Farben für Output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Hilfsfunktionen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $*"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*"
}

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$*${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 1: Abhängigkeiten prüfen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

check_dependencies() {
    log_section "Abhängigkeiten prüfen"

    local missing=()

    for cmd in node npm jq curl; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        else
            log_success "✓ $cmd installiert"
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_warn "Fehlende Pakete: ${missing[*]}"
        log_info "Installiere fehlende Pakete..."
        sudo apt-get update -qq
        sudo apt-get install -y ${missing[@]} &>/dev/null
        log_success "Abhängigkeiten installiert"
    fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 2: Claude Code CLI prüfen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

check_claude_cli() {
    log_section "Claude Code CLI prüfen"

    if ! command -v claude &> /dev/null; then
        log_warn "Claude Code CLI nicht installiert"
        log_info "Installiere Claude Code..."
        npm install -g @anthropic-ai/claude-code &>/dev/null
        log_success "Claude Code CLI installiert"
    else
        log_success "✓ Claude Code CLI installiert"
    fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 3: Alle bestehenden Konfigurationen bereinigen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cleanup_old_configs() {
    log_section "Alte Konfigurationen bereinigen"

    for user in "${USERS[@]}"; do
        log_info "Bereinige $user..."

        local user_home="/home/$user"

        # Entferne alte Claude-Dateien
        sudo rm -rf "${user_home}/.claude/settings.json" 2>/dev/null || true
        sudo rm -rf "${user_home}/.claude/settings.pro.json" 2>/dev/null || true
        sudo rm -rf "${user_home}/.claude/settings.free.json" 2>/dev/null || true

        # Entferne alte Config-Ordner
        sudo rm -rf "${user_home}/.config/claude" 2>/dev/null || true

        log_success "✓ $user bereinigt"
    done
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 4: Benutzerordner erstellen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create_user_directories() {
    log_section "Benutzerordner erstellen"

    for user in "${USERS[@]}"; do
        log_info "Erstelle Ordner für $user..."

        local user_home="/home/$user"

        # Erstelle .claude Ordner
        sudo mkdir -p "${user_home}/.claude"
        sudo chown "${user}:${user}" "${user_home}/.claude"
        sudo chmod 700 "${user_home}/.claude"

        # Erstelle .config Ordner
        sudo mkdir -p "${user_home}/.config/claude"
        sudo mkdir -p "${user_home}/.config/openrouter"
        sudo chown -R "${user}:${user}" "${user_home}/.config"
        sudo chmod 700 "${user_home}/.config"

        log_success "✓ Ordner für $user erstellt"
    done
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 5: Hauptsetup-Script erstellen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create_setup_script() {
    log_section "setup-claude Script erstellen"

    cat > "${BIN_DIR}/setup-claude" << 'SETUP_EOF'
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
  "model": "openrouter/free",
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

SETUP_EOF

    chmod +x "${BIN_DIR}/setup-claude"
    log_success "setup-claude in ${BIN_DIR}/ erstellt"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 6: pro-claude Script erstellen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create_pro_claude_script() {
    log_section "pro-claude Script erstellen"

    cat > "${BIN_DIR}/pro-claude" << 'PRO_CLAUDE_EOF'
#!/bin/bash
# pro-claude: Claude Code mit Pro-Profile (OAuth)

set -euo pipefail

readonly USER=$(whoami)
readonly HOME_DIR=$(eval echo ~$USER)
readonly CLAUDE_DIR="${HOME_DIR}/.claude"
readonly SETTINGS_PRO="${CLAUDE_DIR}/settings.pro.json"
readonly SETTINGS_ACTIVE="${CLAUDE_DIR}/settings.json"

# Farben
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

log_error() { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }

# Überprüfe ob Pro-Profile existiert
if [ ! -f "$SETTINGS_PRO" ]; then
    log_error "Pro-Profile nicht gefunden! Führe 'setup-claude' aus."
fi

log_success "Claude Pro aktiviert"

# Kopiere Pro-Profile zu aktiven Settings
mkdir -p "$CLAUDE_DIR"
cp "$SETTINGS_PRO" "$SETTINGS_ACTIVE"

# Starte Claude Code
exec claude code "$@"

PRO_CLAUDE_EOF

    chmod +x "${BIN_DIR}/pro-claude"
    log_success "pro-claude in ${BIN_DIR}/ erstellt"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 7: free-claude Script erstellen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create_free_claude_script() {
    log_section "free-claude Script erstellen"

    cat > "${BIN_DIR}/free-claude" << 'FREE_CLAUDE_EOF'
#!/bin/bash
# free-claude: Claude Code mit OpenRouter Free

set -euo pipefail

readonly USER=$(whoami)
readonly HOME_DIR=$(eval echo ~$USER)
readonly CLAUDE_DIR="${HOME_DIR}/.claude"
readonly CONFIG_DIR="${HOME_DIR}/.config"
readonly OPENROUTER_CONFIG="${CONFIG_DIR}/openrouter/config"
readonly SETTINGS_FREE="${CLAUDE_DIR}/settings.free.json"
readonly SETTINGS_ACTIVE="${CLAUDE_DIR}/settings.json"

# Farben
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

log_error() { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }

# Überprüfe ob Free-Profile existiert
if [ ! -f "$SETTINGS_FREE" ]; then
    log_error "Free-Profile nicht gefunden! Führe 'setup-claude' aus."
fi

log_success "Claude Free (OpenRouter) aktiviert"

# Kopiere Free-Profile zu aktiven Settings
mkdir -p "$CLAUDE_DIR"
cp "$SETTINGS_FREE" "$SETTINGS_ACTIVE"

# Lade OpenRouter-Konfiguration
if [ -f "$OPENROUTER_CONFIG" ]; then
    source "$OPENROUTER_CONFIG"

    # Exportiere Umgebungsvariablen für Claude Code
    export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
    export OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://openrouter.ai/api/v1}"

    # Auch als ANTHROPIC_* für Kompatibilität
    export ANTHROPIC_API_KEY="$OPENAI_API_KEY"
    export ANTHROPIC_BASE_URL="$OPENAI_BASE_URL"

    echo "   API: OpenRouter ✓"
else
    log_warn "OpenRouter Konfiguration nicht gefunden"
fi

# Starte Claude Code
exec claude code "$@"

FREE_CLAUDE_EOF

    chmod +x "${BIN_DIR}/free-claude"
    log_success "free-claude in ${BIN_DIR}/ erstellt"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 8: delete-claude Script erstellen
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

create_delete_claude_script() {
    log_section "delete-claude Script erstellen"

    cat > "${BIN_DIR}/delete-claude" << 'DELETE_CLAUDE_EOF'
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

DELETE_CLAUDE_EOF

    chmod +x "${BIN_DIR}/delete-claude"
    log_success "delete-claude in ${BIN_DIR}/ erstellt"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Schritt 9: Validierung
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

validate_installation() {
    log_section "Installationsvalidierung"

    # Überprüfe ob alle Scripts vorhanden sind
    local scripts=("setup-claude" "pro-claude" "free-claude" "delete-claude")
    local all_ok=true

    for script in "${scripts[@]}"; do
        if [ -x "${BIN_DIR}/${script}" ]; then
            log_success "✓ ${script} vorhanden und ausführbar"
        else
            log_error "${script} nicht gefunden oder nicht ausführbar"
            all_ok=false
        fi
    done

    if [ "$all_ok" = true ]; then
        log_success "Alle Scripts sind vorhanden und ausführbar!"
    fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Hauptprogramm
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

main() {
    log_section "🚀 Claude Code Multi-User Setup Installer"

    check_dependencies
    check_claude_cli
    cleanup_old_configs
    create_user_directories
    create_setup_script
    create_pro_claude_script
    create_free_claude_script
    create_delete_claude_script
    validate_installation

    log_section "✨ Installation abgeschlossen!"

    echo ""
    echo "Nächste Schritte für jeden User:"
    echo ""
    echo "  kevin@nextkm:~$ setup-claude"
    echo "  maik@nextkm:~$ setup-claude"
    echo ""
    echo "Dann:"
    echo "  pro-claude   # Claude Pro starten"
    echo "  free-claude  # OpenRouter starten"
    echo ""
}

main "$@"
