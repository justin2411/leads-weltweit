import json, sys, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
k = Kokoro("kokoro.onnx", "voices-v1.0.bin")
voice = sys.argv[1] if len(sys.argv) > 1 else "bm_george"
lines = json.load(open("script.json"))
out, timings, t, sr = [], [], 0.0, 24000
for i, line in enumerate(lines):
    samples, sr = k.create(line["text"], voice=voice, speed=line.get("speed", 0.95), lang="en-gb")
    pause = np.zeros(int(sr * line.get("pause", 0.55)), dtype=np.float32)
    d = len(samples) / sr
    timings.append({"id": line["id"], "start": round(t, 3), "end": round(t + d, 3), "text": line["text"]})
    out += [samples, pause]
    t += d + len(pause) / sr
lead = np.zeros(int(sr * 0.6), dtype=np.float32)
sf.write(f"vo_{voice}.wav", np.concatenate([lead] + out + [np.zeros(int(sr*2.5), dtype=np.float32)]), sr)
for x in timings: x["start"] += 0.6; x["end"] += 0.6
json.dump({"voice": voice, "total": round(t + 0.6 + 2.5, 2), "lines": timings}, open(f"timing_{voice}.json", "w"), indent=1)
print(voice, round(t + 3.1, 1), "s")
