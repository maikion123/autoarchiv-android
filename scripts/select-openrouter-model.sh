#!/bin/bash
# select-openrouter-model: Wähle ein kostenloses OpenRouter-Modell

set -euo pipefail

readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}[i]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# Konfiguration
USER=$(whoami)
HOME_DIR=$(eval echo ~$USER)
CLAUDE_DIR="${HOME_DIR}/.claude"
SETTINGS_FREE="${CLAUDE_DIR}/settings.free.json"

# Überprüfe ob settings.free.json existiert
if [ ! -f "$SETTINGS_FREE" ]; then
    log_error "settings.free.json nicht gefunden. Führe setup-claude aus."
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  🔄 Ändere OpenRouter Free-Modell für free-claude${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Rufe OpenRouter Models API ab
log_info "Lade verfügbare OpenRouter-Modelle von https://openrouter.ai/api/v1/models..."
echo ""

MODELS_JSON=$(curl -s "https://openrouter.ai/api/v1/models" 2>/dev/null || echo '{"data":[]}')

# Extrahiere nur Free-Modelle mit Name und ID
FREE_MODELS_JSON=$(echo "$MODELS_JSON" | jq -r '.data[] | select(.name | contains("(free)")) | "\(.id)|\(.name)"' 2>/dev/null || echo "")

if [ -z "$FREE_MODELS_JSON" ]; then
    log_error "Keine kostenlosen Modelle gefunden oder API-Fehler"
fi

# Konvertiere in Array
mapfile -t MODELS_ARRAY <<< "$FREE_MODELS_JSON"

# Zeige Modelle mit schöner Formatierung
echo -e "${GREEN}[1]${NC} ${CYAN}openrouter/free${NC} (Auto-Select - beste Modell wählen) 🚀"
echo ""

for i in "${!MODELS_ARRAY[@]}"; do
    IFS='|' read -r MODEL_ID MODEL_NAME <<< "${MODELS_ARRAY[$i]}"
    # Format: [2] google/gemma-4-31b-it:free (Google: Gemma 4 31B (free))
    echo -e "${GREEN}[$((i+2))]${NC} ${CYAN}${MODEL_ID}${NC}"
    echo "    → $MODEL_NAME"
done

echo ""
read -p "Wähle Modell-Nummer [1-$((${#MODELS_ARRAY[@]}+1))]: " -r CHOICE

# Validiere Eingabe
if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "$((${#MODELS_ARRAY[@]}+1))" ]; then
    log_error "Ungültige Auswahl"
fi

# Setze Modell
if [ "$CHOICE" -eq 1 ]; then
    SELECTED_MODEL="openrouter/free"
    SELECTED_NAME="openrouter/free (Auto-Select)"
else
    IFS='|' read -r SELECTED_MODEL SELECTED_NAME <<< "${MODELS_ARRAY[$((CHOICE-2))]}"
fi

# Aktualisiere das Modell in der JSON
jq ".model = \"$SELECTED_MODEL\"" "$SETTINGS_FREE" > "$SETTINGS_FREE.tmp"
mv "$SETTINGS_FREE.tmp" "$SETTINGS_FREE"

echo ""
log_success "Modell aktualisiert: $SELECTED_NAME"
echo ""
echo "Beim nächsten Start von ${CYAN}free-claude${NC} wird das neue Modell verwendet."
echo ""
