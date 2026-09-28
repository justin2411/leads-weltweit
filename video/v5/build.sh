#!/usr/bin/env bash
# Version 5 bauen: ./build.sh <name>  ->  app/public/video/<file>.mp4 + .jpg, Eintrag in app/content/videos.json
# Umgebung: FFMPEG, KOKORO_MODEL, KOKORO_VOICES, PIPER_MODEL (Modelle nicht im Repo), SCALE (Standard 0.6667 = 1280x720)
# Stimme und Bilder: ../v4/vo.py und ../v4/render.mjs (unverändert), Musik: music.py (je Branche eigener Stil).
set -euo pipefail
cd "$(dirname "$0")"; name="$1"; FFMPEG="${FFMPEG:-ffmpeg}"; SCALE="${SCALE:-0.6667}"
if [ ! -f "out/$name/vo.wav" ] || [ "segments/$name.json" -nt "out/$name/vo.wav" ]; then python3 ../v4/vo.py "segments/$name.json"; fi
if [ -z "${SKIP_FRAMES:-}" ]; then rm -rf "out/$name/frames"; node ../v4/render.mjs "$name" video 25 "$SCALE"; fi
FFMPEG="$FFMPEG" python3 music.py "$name"
file=$(python3 -c "import json;print(json.load(open('segments/$name.json'))['file'])")
# Vorschaubild: Mitte des Satzes "leads" bzw. "watch"/"check" (Lead-Szene), sonst Mitte des Films
poster=$(python3 -c "
import json;T=json.load(open('out/$name/timing.json'));L={l['id']:l for l in T['lines']}
l=next((L[i] for i in ('leads','watch','check') if i in L),None)
print(int(((l['start']+l['end'])/2 if l else T['total']/2)*25))")
mkdir -p ../../app/public/video
"$FFMPEG" -y -loglevel error -framerate 25 -i "out/$name/frames/f%05d.jpg" -i "out/$name/mix.wav" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -shortest "../../app/public/video/$file.mp4"
"$FFMPEG" -y -loglevel error -i "out/$name/frames/$(printf 'f%05d.jpg' "$poster")" -q:v 4 "../../app/public/video/$file.jpg"
python3 register.py "$name"
