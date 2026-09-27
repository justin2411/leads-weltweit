"""Leiser Klangteppich + Herzschlag (Spannung) + Whoosh unter die Stimme mischen.
python mix.py <slug>  ->  out/<slug>/mix.wav   (FFMPEG=Pfad zu ffmpeg)"""
import json, os, subprocess, sys
name = sys.argv[1]; ff = os.environ.get("FFMPEG", "ffmpeg")
T = json.load(open(f"out/{name}/timing.json")); L = {l["id"]: l for l in T["lines"]}; D = T["total"]
t1, t2 = L["tension"]["start"] - .3, L["brand"]["start"] - .5
wh = max(0, L["brand"]["start"] - 1.0)
pad = ("0.028*(sin(2*PI*110*t)+sin(2*PI*164.81*t)+0.7*sin(2*PI*220*t)+0.5*sin(2*PI*277.18*t)+0.4*sin(2*PI*329.63*t))"
       "*(0.75+0.25*sin(2*PI*0.18*t))")
beat = f"0.22*sin(2*PI*52*t)*(exp(-10*mod(t,0.8))+0.6*exp(-10*mod(t-0.22,0.8)))*between(t,{t1},{t2})*min(1,(t-{t1})/2)"
fc = (f"[1:a]lowpass=f=900,afade=t=in:d=2,afade=t=out:st={D-3}:d=3[pad];"
      f"[2:a]lowpass=f=160[beat];"
      f"[3:a]bandpass=f=1200:width_type=o:w=2,volume=0.25,afade=t=in:d=0.5,afade=t=out:st=0.5:d=0.5,adelay={int(wh*1000)}|{int(wh*1000)}[wh];"
      f"[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[vo];"
      f"[pad][beat][wh]amix=inputs=3:normalize=0,aresample=48000[bed];"
      f"[vo][bed]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]")
cmd = [ff, "-y", "-loglevel", "error", "-i", f"out/{name}/vo.wav",
       "-f", "lavfi", "-t", str(D), "-i", f"aevalsrc='{pad}':s=48000",
       "-f", "lavfi", "-t", str(D), "-i", f"aevalsrc='{beat}':s=48000",
       "-f", "lavfi", "-t", "1.0", "-i", "anoisesrc=color=pink:sample_rate=48000",
       "-filter_complex", fc, "-map", "[out]", "-ac", "2", f"out/{name}/mix.wav"]
subprocess.run(cmd, check=True)
print("mix ok", name)
