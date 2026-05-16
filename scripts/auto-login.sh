#!/bin/bash
# auto-login.sh: Startet pro-claude und führt automatisch /login aus

# Starte pro-claude mit echo Befehl
(sleep 2 && echo "/login") | pro-claude
