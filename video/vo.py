"""Sprecherstimme je Zielgruppe: python vo.py segments/<name>.json [stimme]  ->  out/<name>/vo.wav + timing.json

Sprache aus "lang" im JSON (en, fr, de). Englisch/Französisch: Kokoro (lokal). Deutsch: Piper (Stimme "Karlsson");
die Einzelsätze erzeugt der Ablauf .github/workflows/stimme.yml nach voice/<name>/<id>.wav, hier werden sie zusammengesetzt.
"""
import json, os, sys
import numpy as np, soundfile as sf

path = sys.argv[1]
seg = json.load(open(path))
lang = seg.get("lang", "en")
voice = sys.argv[2] if len(sys.argv) > 2 else seg.get("voice", "bf_emma")
name = os.path.splitext(os.path.basename(path))[0]
os.makedirs(f"out/{name}", exist_ok=True)
SR = 24000


def resample(a, sr):
    if sr == SR:
        return a.astype(np.float32)
    x = np.linspace(0, len(a), int(len(a) * SR / sr), endpoint=False)
    return np.interp(x, np.arange(len(a)), a).astype(np.float32)


if lang == "de":
    def speak(line):
        a, sr = sf.read(f"voice/{name}/{line['id']}.wav", dtype="float32")
        return resample(a if a.ndim == 1 else a.mean(1), sr)
else:
    from kokoro_onnx import Kokoro
    k = Kokoro(os.environ.get("KOKORO_MODEL", "kokoro.onnx"), os.environ.get("KOKORO_VOICES", "voices-v1.0.bin"))
    kl = {"en": "en-gb", "fr": "fr-fr"}[lang]
    def speak(line):
        a, sr = k.create(line["text"], voice=voice, speed=line.get("speed", seg.get("speed", 0.95)), lang=kl)
        return resample(a, sr)

parts, lines, t, lead = [], [], 0.6, 0.6
for line in seg["script"]:
    audio = speak(line)
    d = len(audio) / SR
    lines.append({"id": line["id"], "start": round(t, 3), "end": round(t + d, 3), "text": line["text"]})
    pause = line.get("pause", 0.55)
    parts += [audio, np.zeros(int(SR * pause), dtype=np.float32)]
    t += d + pause
sf.write(f"out/{name}/vo.wav", np.concatenate([np.zeros(int(SR * lead), dtype=np.float32)] + parts + [np.zeros(int(SR * 2.5), dtype=np.float32)]), SR)
json.dump({"voice": voice, "total": round(t + 2.5, 2), "lines": lines}, open(f"out/{name}/timing.json", "w"), indent=1)
print(name, round(t + 2.5, 1), "s")
