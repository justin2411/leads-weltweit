#!/usr/bin/env bash
# Alle (oder die genannten) Filme bauen, JOBS parallel (Standard 3): ./all.sh [name ...]
set -uo pipefail
cd "$(dirname "$0")"
names=("$@"); [ ${#names[@]} -eq 0 ] && names=($(ls segments | sed 's/\.json$//'))
mkdir -p out
printf '%s\n' "${names[@]}" | xargs -P "${JOBS:-3}" -I{} sh -c './build.sh {} > out/{}.log 2>&1 && echo "ok {}" || echo "FEHLER {} (out/{}.log)"'
