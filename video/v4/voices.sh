#!/usr/bin/env bash
# Alle Stimmen neu erzeugen (schnell), danach Längen anzeigen. Umgebung wie build.sh.
set -euo pipefail
cd "$(dirname "$0")"
for f in segments/*.json; do python3 vo.py "$f"; done
python3 lengths.py
