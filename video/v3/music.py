"""Eigene, lizenzfreie Hintergrundmusik passend zu den Szenen (numpy-Synthese), leiser während gesprochen wird.

python music.py <slug>  ->  out/<slug>/music.wav (nur Musik) und out/<slug>/mix.wav (Stimme + Musik)
Umgebung: FFMPEG (Pfad zu ffmpeg).
"""
import json, os, subprocess, sys
import numpy as np
import soundfile as sf

SR = 48000
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)


def hz(m): return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a, r, sus=1.0):
    e = np.full(n, sus, dtype=np.float32)
    na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, sus, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


def saw(f, n, harm=8):
    t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, harm + 1)).astype(np.float32)


def add(buf, sig, at):
    i = int(at * SR)
    if i >= len(buf): return
    j = min(len(buf), i + len(sig)); buf[i:j] += sig[: j - i]


def pad(buf, t0, dur, notes, amp):
    n = int(dur * SR)
    s = sum(saw(hz(m), n, 6) * (0.9 if k else 1.0) for k, m in enumerate(notes))
    add(buf, amp * s * env_adsr(n, 0.8, 1.0) / len(notes), t0)


def bass(buf, t0, dur, m, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    s = saw(hz(m), n, 5) * np.exp(-t * 9) * env_adsr(n, 0.005, 0.02)
    add(buf, amp * s, t0)


def kick(buf, t0, amp):
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t * 30)
    add(buf, amp * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7), t0)


def hat(buf, t0, amp):
    n = int(0.06 * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n).astype(np.float32); x = np.diff(x, prepend=0)
    add(buf, amp * x * np.exp(-t * 60), t0)


def pluck(buf, t0, m, amp):
    n = int(0.5 * SR); t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * hz(m) * t) + 0.35 * np.sin(4 * np.pi * hz(m) * t)) * np.exp(-t * 7)
    add(buf, amp * s, t0)


def riser(buf, t_hit, dur, amp):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 200 + 1400 * (t / dur) ** 2
    s = 0.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.diff(rng.standard_normal(n), prepend=0)
    add(buf, amp * s * (t / dur) ** 2.5, t_hit - dur)


def impact(buf, t0, amp):
    n = int(2.2 * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 12)) / SR) * np.exp(-t * 2.2)
    s += 0.25 * rng.standard_normal(n) * np.exp(-t * 14)
    add(buf, amp * s, t0)


def compose(T):
    L = {l["id"]: l for l in T["lines"]}; D = T["total"]
    buf = np.zeros(int((D + 1) * SR), dtype=np.float32)
    t_ten, t_hit = L["tension"]["start"] - 0.3, L["brand"]["start"] - 0.4
    t_end = L["end"]["start"] - 0.3
    # Akkorde (a-Moll): Einstieg ruhig, Spannung mit E-Dur, danach Am–F–C–G, Schluss F–G–C
    prog_intro, prog_ten, prog_main = [(57, 60, 64)], [(57, 60, 64), (53, 57, 60), (52, 56, 59)], [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]
    t = 0.0
    while t < t_ten: pad(buf, t, BAR + .6, prog_intro[0], 0.10); t += BAR
    # Spannung: halbe Takte, Achtel-Bass wird lauter, Herzschlag-Kick
    k, t = 0, t_ten
    while t < t_hit - 0.05:
        ch = prog_ten[min(2, int((t - t_ten) / (t_hit - t_ten) * 3))]
        pad(buf, t, BAR / 2 + .5, ch, 0.12)
        for e in range(4):
            tt = t + e * BEAT / 2
            if tt < t_hit - 0.05: bass(buf, tt, BEAT / 2, ch[0] - 12, 0.10 + 0.14 * (tt - t_ten) / (t_hit - t_ten))
        k += 1; t += BAR / 2
    b = t_ten
    while b < t_hit - 0.1:
        kick(buf, b, 0.35 + 0.35 * (b - t_ten) / (t_hit - t_ten)); b += BEAT * (1 if b - t_ten < 2.5 else 0.5)
    riser(buf, t_hit, 1.6, 0.18); impact(buf, t_hit, 0.9)
    # Hauptteil: Groove mit Bass, Kick, Hi-Hat und Arpeggio
    t, bar = t_hit, 0
    while t < t_end:
        ch = prog_main[bar % 4]
        pad(buf, t, BAR + .6, ch, 0.10)
        for e in range(8):
            tt = t + e * BEAT / 2
            if tt >= t_end: break
            bass(buf, tt, BEAT / 2, ch[0] - 12, 0.16)
            hat(buf, tt + BEAT / 4, 0.05)
            if e % 2 == 0: kick(buf, tt, 0.45 if e % 4 == 0 else 0.25)
            pluck(buf, tt, ch[e % 3] + 12 + (12 if e >= 4 else 0), 0.07)
        bar += 1; t += BAR
    # Schluss: F – G – C, ausklingen
    for i, ch in enumerate([(53, 57, 60), (55, 59, 62), (48, 52, 55, 60)]):
        pad(buf, t_end + i * BEAT * 2, BEAT * 2 + (2.5 if i == 2 else .4), ch, 0.13)
        bass(buf, t_end + i * BEAT * 2, BEAT * 2, ch[0] - 12, 0.14)
    impact(buf, t_end + 4 * BEAT, 0.35)
    buf = buf[: int(D * SR)]
    fade = int(2.5 * SR); buf[-fade:] *= np.linspace(1, 0, fade)
    # leiser, während gesprochen wird (weich)
    g = np.ones(len(buf), dtype=np.float32)
    for l in T["lines"]:
        a, z = int(max(0, l["start"] - .15) * SR), int(min(D, l["end"] + .2) * SR); g[a:z] = 0.42
    k = int(0.25 * SR); g = np.convolve(g, np.ones(k) / k, mode="same")
    return buf * g


def main():
    name = sys.argv[1]; ff = os.environ.get("FFMPEG", "ffmpeg")
    T = json.load(open(f"out/{name}/timing.json"))
    m = compose(T); m /= max(1e-6, np.abs(m).max()) / 0.8
    sf.write(f"out/{name}/music_raw.wav", np.stack([m, m], 1), SR)
    # Musik linear auf −27 LUFS, Stimme −19 je Kanal (gesamt ca. −16 LUFS) – ohne dynamische Normalisierung, damit das Absenken erhalten bleibt
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
