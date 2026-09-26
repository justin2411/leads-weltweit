#!/usr/bin/env bash
# Baut das Video einer Zielgruppe: ./build.sh accountants  ->  ../app/public/video/uk-accountants.mp4 (+ Vorschaubild)
set -euo pipefail
name="$1"; FFMPEG="${FFMPEG:-ffmpeg}"
python3 vo.py "segments/$name.json" "${VOICE:-bf_emma}"
node render.mjs "$name" video 25
slug=$(python3 -c "import json;print(json.load(open('segments/$name.json'))['slug'].replace('/','-'))")
mkdir -p ../app/public/video
"$FFMPEG" -y -loglevel error -framerate 25 -i "out/$name/frames/f%05d.jpg" -i "out/$name/vo.wav" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 128k -shortest "../app/public/video/$slug.mp4"
"$FFMPEG" -y -loglevel error -i "out/$name/frames/f00300.jpg" -vf scale=1280:-2 -q:v 4 "../app/public/video/$slug.jpg"
echo "fertig: app/public/video/$slug.mp4"
