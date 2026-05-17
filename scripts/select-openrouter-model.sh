#!/bin/bash
# select-openrouter-model: Wähle ein kostenloses OpenRouter-Modell

set -euo pipefail

readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}[i]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# Rufe OpenRouter Models API ab
log_info "Lade verfügbare OpenRouter-Modelle..."

MODELS_JSON=$(curl -s "https://openrouter.ai/api/v1/models" || echo '{"data":[]}')

# Extrahiere nur Free-Modelle
FREE_MODELS=$(echo "$MODELS_JSON" | jq -r '.data[] | select(.name | contains("(free)")) | .id' 2>/dev/null || echo "")

# Fallback auf bekannte Free-Modelle wenn API fehlschlägt
if [ -z "$FREE_MODELS" ]; then
    log_warn "API-Abruf fehlgeschlagen, verwende bekannte Modelle"
    FREE_MODELS="openrouter/free
google/flan-t5-xl:free
google/gemma-2-9b-it:free
mistralai/mistral-7b-instruct:free
meta-llama/llama-2-7b:free"
fi

# Wähle Modell interaktiv
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Verfügbare OpenRouter Free-Modelle${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Konvertiere in Array und zeige Optionen
mapfile -t MODELS_ARRAY <<< "$FREE_MODELS"

# Option 0: openrouter/free (auto)
echo -e "${GREEN}[0]${NC} openrouter/free (Auto-Select) 🚀"

# Weitere Optionen
for i in "${!MODELS_ARRAY[@]}"; do
    echo -e "${GREEN}[$((i+1))]${NC} ${MODELS_ARRAY[$i]}"
done

echo ""
read -p "Wähle Modell-Nummer: " -r CHOICE

# Validiere Eingabe
if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 0 ] || [ "$CHOICE" -gt "${#MODELS_ARRAY[@]}" ]; then
    log_error "Ungültige Auswahl"
fi

# Setze Modell
if [ "$CHOICE" -eq 0 ]; then
    SELECTED_MODEL="openrouter/auto"
    log_success "Modell: openrouter/auto (Auto-Select)"
else
    SELECTED_MODEL="${MODELS_ARRAY[$((CHOICE-1))]}"
    log_success "Modell: $SELECTED_MODEL"
fi

# Aktualisiere settings.free.json
USER=$(whoami)
HOME_DIR=$(eval echo ~$USER)
CLAUDE_DIR="${HOME_DIR}/.claude"

if [ ! -f "$CLAUDE_DIR/settings.free.json" ]; then
    log_error "settings.free.json nicht gefunden. Führe setup-claude aus."
fi

# Aktualisiere das Modell in der JSON
jq ".model = \"$SELECTED_MODEL\"" "$CLAUDE_DIR/settings.free.json" > "$CLAUDE_DIR/settings.free.json.tmp"
mv "$CLAUDE_DIR/settings.free.json.tmp" "$CLAUDE_DIR/settings.free.json"

log_success "Modell in settings.free.json aktualisiert"
echo ""
echo "Beim nächsten Start von free-claude wird das neue Modell verwendet."
