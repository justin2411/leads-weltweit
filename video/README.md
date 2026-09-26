# Erklärvideo (kostenlos, ohne externe Dienste)

1. Text: `script.json` (ein Eintrag pro Satz; ehrlich, keine erfundenen Zahlen, keine Garantien).
2. Stimme: `python vo.py bf_emma` – Kokoro-TTS (Apache-2.0), Modelle aus den Releases von thewh1teagle/kokoro-onnx
   (`kokoro-v1.0.int8.onnx` als `kokoro.onnx`, `voices-v1.0.bin`). Erzeugt `vo_<stimme>.wav` und `timing_<stimme>.json`.
3. Bilder: `node render.mjs stills` (Kontrollbilder) bzw. `node render.mjs video 25` (Einzelbilder, Playwright/Chromium).
   `film.html` rendert jede Szene deterministisch über `render(t)`; Szenen richten sich nach den Satzzeiten.
4. Zusammenfügen: `ffmpeg -framerate 25 -i frames/f%05d.jpg -i vo_bf_emma.wav -af loudnorm=I=-16:TP=-1.5 -ar 48000 -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -shortest out.mp4`

Firmennamen im Video sind erfundene Beispiele und als „Illustrative example(s)“ gekennzeichnet. Keine echten Empfänger zeigen.
