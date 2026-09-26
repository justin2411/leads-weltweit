"""Sprecherstimme je Zielgruppe: python vo.py segments/<slug>.json [stimme]  ->  out/<slug>/vo.wav + timing.json"""
import json, os, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

seg = json.load(open(sys.argv[1]))
voice = sys.argv[2] if len(sys.argv) > 2 else "bf_emma"
name = seg["slug"].split("/")[-1]
os.makedirs(f"out/{name}", exist_ok=True)
k = Kokoro(os.environ.get("KOKORO_MODEL", "kokoro.onnx"), os.environ.get("KOKORO_VOICES", "voices-v1.0.bin"))
parts, lines, t, sr, lead = [], [], 0.6, 24000, 0.6
for line in seg["script"]:
    audio, sr = k.create(line["text"], voice=voice, speed=line.get("speed", 0.95), lang="en-gb")
    d = len(audio) / sr
    lines.append({"id": line["id"], "start": round(t, 3), "end": round(t + d, 3), "text": line["text"]})
    pause = line.get("pause", 0.55)
    parts += [audio, np.zeros(int(sr * pause), dtype=np.float32)]
    t += d + pause
sf.write(f"out/{name}/vo.wav", np.concatenate([np.zeros(int(sr * lead), dtype=np.float32)] + parts + [np.zeros(int(sr * 2.5), dtype=np.float32)]), sr)
json.dump({"voice": voice, "total": round(t + 2.5, 2), "lines": lines}, open(f"out/{name}/timing.json", "w"), indent=1)
print(name, round(t + 2.5, 1), "s")
