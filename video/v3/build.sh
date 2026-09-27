#!/usr/bin/env bash
# Version 3 für eine Zielgruppe bauen: ./build.sh <slug>  ->  app/public/video/<land>-<slug>.mp4 + .jpg
set -euo pipefail
cd "$(dirname "$0")"; name="$1"; FFMPEG="${FFMPEG:-ffmpeg}"
python3 ../vo.py "segments/$name.json" ${VOICE:+"$VOICE"}
rm -rf "out/$name/frames"; node ../render.mjs "$name" video 25
FFMPEG="$FFMPEG" python3 music.py "$name"
slug=$(python3 -c "import json;print(json.load(open('segments/$name.json'))['slug'].replace('/','-'))")
poster=$(python3 -c "import json;L={l['id']:l for l in json.load(open('out/$name/timing.json'))['lines']};print(int((L['brand']['start']+1.6)*25))")
mkdir -p ../../app/public/video
"$FFMPEG" -y -loglevel error -framerate 25 -i "out/$name/frames/f%05d.jpg" -i "out/$name/mix.wav" \
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 160k -shortest "../../app/public/video/$slug.mp4"
"$FFMPEG" -y -loglevel error -i "out/$name/frames/$(printf 'f%05d.jpg' "$poster")" -vf scale=1280:-2 -q:v 4 "../../app/public/video/$slug.jpg"
python3 -c "import json;print(round(json.load(open('out/$name/timing.json'))['total']))" > "out/$name/seconds"
echo "fertig: app/public/video/$slug.mp4 ($(cat out/$name/seconds) s)"
