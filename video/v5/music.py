"""Version 5: eigene, lizenzfreie Musik je Branche (numpy-Synthese, Klangbausteine aus ../v3/music.py).

python music.py <name>  ->  out/<name>/music_raw.wav und out/<name>/mix.wav (Stimme + Musik, Musik leiser unter der Stimme)
Jede Branche hat eine eigene Tonart, ein eigenes Tempo und eine eigene Figur, damit die Filme auch unterschiedlich klingen.
Der "Wendepunkt" (Satz-ID turn) bekommt einen weichen Aufschlag, die Schlusskarte (end) eine Kadenz.
"""
import json, os, subprocess, sys
from pathlib import Path
import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "v3"))
import music as m3  # noqa: E402

SR = m3.SR
# Stil je Branche: Tempo, Akkorde (MIDI), Figur
STYLE = {
 "accountants": {"bpm": 92, "prog": [(60, 64, 67), (57, 60, 64), (53, 57, 60), (55, 59, 62)], "fig": "tick", "turn": "turn"},
 "recruitment": {"bpm": 100, "prog": [(62, 65, 69), (58, 62, 65), (60, 64, 67), (57, 61, 64)], "fig": "pulse", "turn": "chairs"},
 "insurance-brokers": {"bpm": 86, "prog": [(53, 57, 60), (58, 62, 65), (60, 64, 67), (53, 57, 60)], "fig": "build", "turn": "turn"},
 "financial-advisers": {"bpm": 78, "prog": [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)], "fig": "bell", "turn": "pay"},
 "web-agencies": {"bpm": 108, "prog": [(52, 55, 59), (48, 52, 55), (55, 59, 62), (50, 54, 57)], "fig": "arp", "turn": "fix"},
}


def compose(T, ind):
    S = STYLE[ind]; beat = 60 / S["bpm"]; bar = 4 * beat
    L = {l["id"]: l for l in T["lines"]}; D = T["total"]
    buf = np.zeros(int((D + 2) * SR), dtype=np.float32)
    t_turn = L[S["turn"]]["start"] - .35 if S["turn"] in L else D * .45
    t_end = L["end"]["start"] - .3
    t, k = 0.0, 0
    while t < t_end:
        ch = S["prog"][k % 4]; busy = t >= t_turn - .05
        m3.pad(buf, t, bar + .6, ch, 0.10 if not busy else 0.11)
        for e in range(8):
            tt = t + e * beat / 2
            if tt >= t_end: break
            f = S["fig"]
            if f == "tick":  # Uhrwerk: trockene Ticks, Bass auf 1 und 3
                m3.hat(buf, tt, 0.05 if e % 2 else 0.035)
                if e % 4 == 0: m3.bass(buf, tt, beat, ch[0] - 12, 0.13)
                if busy and e % 2 == 0: m3.pluck(buf, tt, ch[(e // 2) % 3] + 12, 0.06)
            elif f == "pulse":  # gleichmäßiger Achtelpuls, ab dem Wendepunkt mit Kick
                m3.bass(buf, tt, beat / 2, ch[0] - 12, 0.12)
                if busy and e % 2 == 0: m3.kick(buf, tt, 0.35 if e % 4 == 0 else 0.2)
                if e % 2: m3.hat(buf, tt, 0.04)
            elif f == "build":  # ruhige Viertel, jeder Takt ein weicher Schlag
                if e % 2 == 0: m3.bass(buf, tt, beat, ch[0] - 12, 0.12)
                if e == 0: m3.kick(buf, tt, 0.3)
                if busy and e in (2, 6): m3.pluck(buf, tt, ch[2] + 12, 0.06)
            elif f == "bell":  # Glocken-Arpeggio, weit und langsam
                if e % 2 == 0: m3.pluck(buf, tt, ch[(e // 2) % 3] + 24, 0.05)
                if e == 0: m3.bass(buf, tt, bar, ch[0] - 12, 0.10)
                if busy and e == 4: m3.kick(buf, tt, 0.2)
            else:  # arp: schnelles Synth-Arpeggio mit Hi-Hat
                m3.pluck(buf, tt, ch[e % 3] + 12 + (12 if e >= 4 else 0), 0.06)
                m3.hat(buf, tt + beat / 4, 0.04)
                if busy and e % 2 == 0: m3.kick(buf, tt, 0.3 if e % 4 == 0 else 0.18)
                if e % 4 == 0: m3.bass(buf, tt, beat, ch[0] - 12, 0.12)
        k += 1; t += bar
    m3.riser(buf, t_turn, 1.2, 0.10); m3.impact(buf, t_turn, 0.45)
    last = S["prog"][0]
    for i, ch in enumerate([S["prog"][2], S["prog"][3], tuple(list(last) + [last[0] + 12])]):
        m3.pad(buf, t_end + i * beat * 2, beat * 2 + (2.5 if i == 2 else .4), ch, 0.13)
        m3.bass(buf, t_end + i * beat * 2, beat * 2, ch[0] - 12, 0.13)
    m3.impact(buf, t_end + 4 * beat, 0.3)
    buf = buf[: int(D * SR)]
    fade = int(2.5 * SR); buf[-fade:] *= np.linspace(1, 0, fade)
    g = np.ones(len(buf), dtype=np.float32)
    for l in T["lines"]:
        a, z = int(max(0, l["start"] - .15) * SR), int(min(D, l["end"] + .2) * SR); g[a:z] = 0.42
    kk = int(0.25 * SR); n = len(g); c = np.concatenate([[0.0], np.cumsum(g, dtype=np.float64)])
    i = np.arange(n) + (kk - 1) // 2
    g = ((c[np.minimum(i, n - 1) + 1] - c[np.maximum(i - kk + 1, 0)]) / kk).astype(np.float32)
    return buf * g


def main():
    name = sys.argv[1]; ff = os.environ.get("FFMPEG", "ffmpeg")
    seg = json.load(open(f"segments/{name}.json"))
    T = json.load(open(f"out/{name}/timing.json"))
    mu = compose(T, seg["industry"]); mu /= max(1e-6, np.abs(mu).max()) / 0.8
    sf.write(f"out/{name}/music_raw.wav", np.stack([mu, mu], 1), SR)
    out = subprocess.run([ff, "-hide_banner", "-i", f"out/{name}/music_raw.wav", "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    lufs = float([l for l in out.splitlines() if l.strip().startswith("I:")][-1].split()[1])
    fc = (f"[1:a]volume={-27 - lufs:.2f}dB,aresample=48000[mu];"
          "[0:a]loudnorm=I=-19:TP=-4:LRA=11,aresample=48000,pan=stereo|c0=c0|c1=c0[vo];"
          "[vo][mu]amix=inputs=2:normalize=0,alimiter=limit=0.89:level=false[out]")
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", f"out/{name}/vo.wav", "-i", f"out/{name}/music_raw.wav",
                    "-filter_complex", fc, "-map", "[out]", f"out/{name}/mix.wav"], check=True)
    print("musik ok", name)


if __name__ == "__main__":
    main()
