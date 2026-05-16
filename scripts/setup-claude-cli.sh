#!/bin/bash
# Setup-Skript für pro-claude und free-claude für Kevin und Maik

set -e

echo "🔧 Richte Claude CLI Befehle für beide Benutzer ein..."
echo ""

# Farben für Output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

REPO_DIR="/srv/projects/autoarchiv"
USERS=("kevin" "maik")
OPENROUTER_KEY="${OPENROUTER_API_KEY}"

# Schritt 1: Überprüfe ob Script mit sudo läuft
if [ "$EUID" -ne 0 ]; then
  echo "❌ Fehler: Dieses Skript muss mit 'sudo' aufgerufen werden"
  echo "   Verwendung: sudo bash scripts/setup-claude-cli.sh"
  exit 1
fi

# Schritt 2: Überprüfe OpenRouter Key
if [ -z "$OPENROUTER_KEY" ]; then
  echo "❌ Fehler: OPENROUTER_API_KEY ist nicht gesetzt"
  echo ""
  echo "   Setze ihn zuerst:"
  echo "   export OPENROUTER_API_KEY='sk-or-v1-...'"
  echo ""
  echo "   Dann starten Sie das Setup neu:"
  echo "   sudo bash scripts/setup-claude-cli.sh"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SCHRITT 1: Erstelle .claude Verzeichnisse${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

for USER in "${USERS[@]}"; do
  HOME_DIR=$(eval echo "~${USER}")
  CLAUDE_DIR="${HOME_DIR}/.claude"

  if [ ! -d "$CLAUDE_DIR" ]; then
    mkdir -p "$CLAUDE_DIR"
    chown "${USER}:${USER}" "$CLAUDE_DIR"
    chmod 700 "$CLAUDE_DIR"
    echo -e "${GREEN}✅ Erstellt:${NC} $CLAUDE_DIR"
  else
    echo -e "${GREEN}✓ Existiert:${NC} $CLAUDE_DIR"
  fi
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SCHRITT 2: Erstelle Symlinks in /usr/local/bin${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

# Entferne alte Links wenn vorhanden
rm -f /usr/local/bin/pro-claude /usr/local/bin/free-claude

# Erstelle neue Links
ln -sf "${REPO_DIR}/scripts/pro-claude" /usr/local/bin/pro-claude
ln -sf "${REPO_DIR}/scripts/free-claude" /usr/local/bin/free-claude

echo -e "${GREEN}✅ Symlinks erstellt:${NC}"
echo "   /usr/local/bin/pro-claude → ${REPO_DIR}/scripts/pro-claude"
echo "   /usr/local/bin/free-claude → ${REPO_DIR}/scripts/free-claude"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SCHRITT 3: Setze Environment-Variablen${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

for USER in "${USERS[@]}"; do
  HOME_DIR=$(eval echo "~${USER}")
  BASHRC="${HOME_DIR}/.bashrc"
  ZSHRC="${HOME_DIR}/.zshrc"

  # Überprüfe und setze in .bashrc
  for RC_FILE in "$BASHRC" "$ZSHRC"; do
    if [ -f "$RC_FILE" ]; then
      # Überprüfe ob OPENROUTER_API_KEY bereits gesetzt ist
      if ! grep -q "OPENROUTER_API_KEY" "$RC_FILE"; then
        echo "export OPENROUTER_API_KEY='${OPENROUTER_KEY}'" >> "$RC_FILE"
        chown "${USER}:${USER}" "$RC_FILE"
        echo -e "${GREEN}✅ Gesetzt in:${NC} $RC_FILE"
      else
        echo -e "${YELLOW}⚠️  Bereits gesetzt in:${NC} $RC_FILE"
      fi
    fi
  done
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}SCHRITT 4: Überprüfung${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

echo -e "${GREEN}✅ Befehle verfügbar:${NC}"
which pro-claude
which free-claude

echo ""
echo -e "${GREEN}✅ Benutzer-Verzeichnisse:${NC}"
for USER in "${USERS[@]}"; do
  HOME_DIR=$(eval echo "~${USER}")
  CLAUDE_DIR="${HOME_DIR}/.claude"
  echo "   $USER: $CLAUDE_DIR"
done

echo ""
echo -e "${GREEN}✅ OpenRouter API Key:${NC} ${OPENROUTER_KEY:0:20}..."

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Setup komplett!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

echo ""
echo "📝 Verwendung:"
echo "   pro-claude           # Starte Claude Code mit Anthropic Pro"
echo "   free-claude          # Starte Claude Code mit OpenRouter Free"
echo ""
echo "   Für Maik (mit sudo):"
echo "   sudo -u maik pro-claude"
echo "   sudo -u maik free-claude"
echo ""
echo "🔗 Dokumentation: docs/CLAUDE_PROVIDER_SETUP.md"
