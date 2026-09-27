"""Sprecherstimme v4: python vo.py segments/<name>.json  ->  out/<name>/vo.wav + timing.json

"tts" im Segment: en-gb / en-us / fr-fr (Kokoro, lokal) oder de (Piper, Stimme Thorsten, lokal).
Modelle (nicht im Repo): KOKORO_MODEL, KOKORO_VOICES, PIPER_MODEL (Pfad zu de_DE-thorsten-high.onnx).
Ohne Piper: fertige Sätze aus voice/<name>/<id>.wav (z. B. vom Ablauf stimme.yml).
Gesprochen wird "say" (Aussprache), sonst "text". Deutsch: englische Wörter nach ../v3/aussprache-de.json.
"""
import json, os, re, subprocess, sys, tempfile
import numpy as np, soundfile as sf

path = sys.argv[1]
seg = json.load(open(path))
tts = seg.get("tts", "en-gb")
voice = seg.get("voice", "bf_emma")
name = os.path.splitext(os.path.basename(path))[0]
os.makedirs(f"out/{name}", exist_ok=True)
SR = 24000


def resample(a, sr):
    a = a if a.ndim == 1 else a.mean(1)
    if sr == SR:
        return a.astype(np.float32)
    x = np.linspace(0, len(a), int(len(a) * SR / sr), endpoint=False)
    return np.interp(x, np.arange(len(a)), a).astype(np.float32)


def trim(a, thr=0.004):
    idx = np.where(np.abs(a) > thr)[0]
    return a[max(0, idx[0] - 240): idx[-1] + 480] if len(idx) else a


if tts == "de":
    here = os.path.dirname(os.path.abspath(__file__))
    SAY = {k: v for k, v in json.load(open(os.path.join(here, "..", "v3", "aussprache-de.json"))).items() if not k.startswith("_")}
    model = os.environ.get("PIPER_MODEL", "")

    def spoken(t):
        for k in sorted(SAY, key=len, reverse=True):
            t = re.sub(rf"\b{re.escape(k)}\b", SAY[k], t)
        return t

    def speak(line):
        if model and os.path.exists(model):
            with tempfile.NamedTemporaryFile(suffix=".wav") as f:
                subprocess.run(["piper", "--model", model, "--length_scale", str(seg.get("length_scale", 0.86)),
                                "--sentence_silence", "0.12", "--output_file", f.name],
                               input=spoken(line.get("say", line["text"])).encode(), check=True, capture_output=True)
                a, sr = sf.read(f.name, dtype="float32")
        else:
            a, sr = sf.read(f"voice/{name}/{line['id']}.wav", dtype="float32")
        return trim(resample(a, sr))
else:
    from kokoro_onnx import Kokoro
    k = Kokoro(os.environ.get("KOKORO_MODEL", "kokoro.onnx"), os.environ.get("KOKORO_VOICES", "voices-v1.0.bin"))

    def speak(line):
        a, sr = k.create(line.get("say", line["text"]), voice=voice, speed=line.get("speed", seg.get("speed", 1.0)), lang=tts)
        return trim(resample(a, sr))

parts, lines, t, lead = [], [], 0.45, 0.45
for line in seg["script"]:
    audio = speak(line)
    d = len(audio) / SR
    lines.append({"id": line["id"], "start": round(t, 3), "end": round(t + d, 3), "text": line["text"]})
    pause = line.get("pause", 0.5)
    parts += [audio, np.zeros(int(SR * pause), dtype=np.float32)]
    t += d + pause
tail = 2.1
sf.write(f"out/{name}/vo.wav", np.concatenate([np.zeros(int(SR * lead), dtype=np.float32)] + parts + [np.zeros(int(SR * tail), dtype=np.float32)]), SR)
json.dump({"voice": voice, "total": round(t + tail, 2), "lines": lines}, open(f"out/{name}/timing.json", "w"), indent=1)
print(name, round(t + tail, 1), "s")
