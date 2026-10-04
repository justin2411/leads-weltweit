#!/usr/bin/env bash
# Version 12 bauen: ./build.sh <name>  ->  app/public/video/<file>.mp4 + .jpg, Eintrag in app/content/videos.json
# Umgebung wie v5: FFMPEG, KOKORO_MODEL, KOKORO_VOICES (Modelle nicht im Repo), SCALE (Standard 0.6667 = 1280x720).
# Stimme ../v4/vo.py, Bilder ../v4/render.mjs, Musik ../v5/music.py (Stil web-agencies). Einzelbilder werden nach dem
# Kodieren gelöscht (Plattenplatz).
set -euo pipefail
cd "$(dirname "$0")"; name="$1"; FFMPEG="${FFMPEG:-ffmpeg}"; SCALE="${SCALE:-0.6667}"
if [ ! -f "out/$name/vo.wav" ] || [ "segments/$name.json" -nt "out/$name/vo.wav" ]; then python3 ../v4/vo.py "segments/$name.json"; fi
rm -rf "out/$name/frames"; node ../v4/render.mjs "$name" video 25 "$SCALE"
FFMPEG="$FFMPEG" python3 ../v5/music.py "$name"
file=$(python3 -c "import json;print(json.load(open('segments/$name.json'))['file'])")
# Vorschaubild: Ende des Satzes "found" (Treffer mit Datum und Website-Hinweis)
poster=$(python3 -c "
import json;L={l['id']:l for l in json.load(open('out/$name/timing.json'))['lines']}
print(int((L['found']['end']-.3)*25))")
mkdir -p ../../app/public/video
"$FFMPEG" -y -loglevel error -framerate 25 -i "out/$name/frames/f%05d.jpg" -i "out/$name/mix.wav" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k -shortest "../../app/public/video/$file.mp4"
"$FFMPEG" -y -loglevel error -i "out/$name/frames/$(printf 'f%05d.jpg' "$poster")" -q:v 4 "../../app/public/video/$file.jpg"
rm -rf "out/$name/frames" "out/$name/stills"
python3 register.py "$name"
