/**
 * Gemeinsames Design aller öffentlichen Seiten (Startseite, Landingpages, Rechtstexte, Danke).
 * Ein Stil für Wiedererkennung: Nachtblau, Papier, Gold, Inter. Alles unter der Klasse .bx.
 * Animationen nur mit JavaScript aktiv (Klasse .motion auf <html>) und nie bei "Bewegung reduzieren".
 */
export const BRAND_CSS = `
@property --a{syntax:"<angle>";inherits:false;initial-value:0deg}
.bx{--ink:#0b1320;--ink2:#121c2e;--paper:#f7f4ee;--card:#fffdf9;--text:#161b24;--soft:#5b6372;--line:#e4ddd0;--gold:#b08d57;--gold2:#d8bd8a;--night-soft:#9aa6ba;
  color:var(--text);background:var(--paper);font-family:var(--sans),system-ui,sans-serif;font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:clip;min-height:100vh}
.bx *{box-sizing:border-box}.bx a{color:inherit}
.bx .wrap{max-width:1160px;margin:0 auto;padding:0 24px}
.bx .eyebrow{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:600}
.bx h1,.bx h2,.bx h3,.bx .mark{font-family:var(--sans),system-ui,sans-serif}

/* Fortschritt und Navigation */
.bx .progress{position:fixed;top:0;left:0;right:0;height:2px;z-index:40;transform-origin:left;transform:scaleX(var(--p,0));background:linear-gradient(90deg,var(--gold),var(--gold2))}
.bx .nav{position:sticky;top:0;z-index:30;background:rgba(11,19,32,.82);backdrop-filter:saturate(160%) blur(14px);-webkit-backdrop-filter:saturate(160%) blur(14px);border-bottom:1px solid rgba(255,255,255,.06);transition:background .4s}
.scrolled .bx .nav{background:rgba(11,19,32,.9)}
.bx .nav .wrap{display:flex;align-items:center;justify-content:space-between;height:68px;transition:height .4s}.scrolled .bx .nav .wrap{height:58px}
.bx .mark{font-size:21px;font-weight:700;color:#f4efe6;text-decoration:none;letter-spacing:-.01em}.bx .mark i{font-style:normal;color:var(--gold2)}
.bx .nav .links{display:flex;gap:30px;align-items:center}.bx .nav .links a{color:#c9d1de;text-decoration:none;font-size:14px;position:relative}
.bx .nav .links a:not(.pill):after{content:"";position:absolute;left:0;right:0;bottom:-4px;height:1px;background:var(--gold2);transform:scaleX(0);transform-origin:right;transition:transform .35s}
.bx .nav .links a:not(.pill):hover:after{transform:scaleX(1);transform-origin:left}
.bx .nav .links a:hover{color:#fff}
.bx .nav .langs{display:inline-flex;gap:2px;padding:3px;border:1px solid rgba(255,255,255,.12);border-radius:99px}
.bx .nav .links .langs a{font-size:12px;font-weight:600;letter-spacing:.06em;padding:4px 9px;border-radius:99px;color:#9aa6ba}
.bx .nav .links .langs a:after{display:none}.bx .nav .links .langs a.on{background:rgba(216,189,138,.16);color:var(--gold2)}.bx .nav .links .pill{border:1px solid rgba(216,189,138,.5);color:#f4efe6;padding:8px 16px;border-radius:99px;transition:background .3s,border-color .3s}
.bx .nav .links .pill:hover{background:rgba(216,189,138,.12);border-color:var(--gold2)}

/* Hero */
.bx .hero{position:relative;background:var(--ink);color:#eef1f6;overflow:hidden;isolation:isolate}
.bx .hero:before{content:"";position:absolute;inset:-10%;z-index:-3;background:
  radial-gradient(900px 520px at 78% 18%,rgba(176,141,87,.20),transparent 60%),
  radial-gradient(700px 500px at 8% 90%,rgba(62,98,170,.24),transparent 60%);animation:aurora 18s ease-in-out infinite alternate}
.bx .hero canvas.net{position:absolute;inset:0;width:100%;height:100%;z-index:-2;opacity:.7;pointer-events:none}
.bx .hero .wrap{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:center;padding-top:96px;padding-bottom:104px}
.bx .hero.solo .wrap{grid-template-columns:1fr;gap:0;max-width:920px;padding-top:64px;padding-bottom:72px}
.bx .hero.solo h1{margin:20px 0 18px}.bx .hero.solo .cta-row{margin-top:26px}
.bx h1{font-weight:700;font-size:clamp(40px,5.6vw,72px);line-height:1.04;letter-spacing:-.03em;margin:18px 0 24px}
.bx .hero.solo h1{font-size:clamp(34px,4.6vw,58px)}
.bx .lede{font-size:19px;color:#c3cbd8;max-width:580px;margin:0}
.bx .for{display:inline-flex;width:fit-content;justify-self:start;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--gold2);border:1px solid rgba(216,189,138,.45);border-radius:99px;padding:5px 14px;background:rgba(216,189,138,.08)}
.bx .for:before{content:"";width:6px;height:6px;border-radius:50%;background:#5bd49a;box-shadow:0 0 0 0 rgba(91,212,154,.6);animation:pulse 2s infinite}
.bx .cta-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:36px}
.bx .fine{margin-top:18px;font-size:13px;color:var(--night-soft);letter-spacing:.02em}
.bx .fine span+span:before{content:"";display:inline-block;width:4px;height:4px;border-radius:50%;background:var(--gold);margin:0 12px 3px}

/* Trigger-Begriffe der Branche */
.bx .chips{list-style:none;margin:22px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.bx .chips li{font-size:13px;font-weight:600;color:#e6e9ef;padding:6px 14px;border-radius:99px;border:1px solid rgba(216,189,138,.35);background:rgba(216,189,138,.08)}
.bx .chips li:before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--gold2);margin:0 8px 1px 0}
.bx .gets{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.bx .gets li{position:relative;padding:16px 18px 16px 48px;background:var(--card);border:1px solid var(--line);border-radius:14px;font-size:16px}
.bx .gets li:before{content:"";position:absolute;left:20px;top:22px;width:12px;height:7px;border-left:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(-45deg)}
.motion .bx .gets li{opacity:0;transform:translateY(12px);transition:opacity .7s,transform .7s;transition-delay:calc(var(--i,0) * 110ms + .2s)}
.motion .bx .gets.in li{opacity:1;transform:none}
.bx .olist.light li{color:var(--text)}.bx .olist.light li:before{color:var(--gold)}

/* Wort für Wort (Hero sofort, Abschnitte beim Scrollen) */
.bx .w{display:inline-block;white-space:pre}
.motion .bx .hero .w{opacity:0;filter:blur(10px);transform:translateY(.45em);animation:word 1s cubic-bezier(.2,.7,.1,1) forwards;animation-delay:calc(var(--i) * 75ms + 150ms)}
.motion .bx .rvw .w{opacity:0;filter:blur(8px);transform:translateY(.5em);transition:opacity .9s cubic-bezier(.2,.7,.1,1),transform .9s cubic-bezier(.2,.7,.1,1),filter .9s;transition-delay:calc(var(--i) * 55ms)}
.motion .bx .rvw.in .w{opacity:1;filter:none;transform:none}
/* Hervorhebung zurückhaltend: nur im Hero, einfarbig, ohne Schimmer */
.bx .gold-t{color:inherit}.bx .hero .gold-t{color:var(--gold2)}
.bx .hero .later{animation:fade 1.1s both;animation-delay:var(--d,.8s)}

/* Buttons */
.bx .btn{position:relative;display:inline-flex;align-items:center;gap:10px;padding:15px 26px;border-radius:99px;font-weight:600;font-size:16px;text-decoration:none;cursor:pointer;border:0;font-family:inherit;transition:transform .25s cubic-bezier(.2,.7,.1,1),box-shadow .3s,background .3s;overflow:hidden;will-change:transform}
.bx .btn.gold{background:linear-gradient(135deg,#e2c894,#b08d57);color:#141008;box-shadow:0 10px 30px -10px rgba(216,189,138,.6)}
.bx .btn.gold:after{content:"";position:absolute;top:0;left:-70%;width:45%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.6),transparent);transform:skewX(-20deg);animation:sweep 5s 1.8s infinite}
.bx .btn.gold:hover{box-shadow:0 18px 44px -12px rgba(216,189,138,.8)}
.bx .btn.ghost{border:1px solid rgba(255,255,255,.22);color:#eef1f6;background:transparent}.bx .btn.ghost:hover{background:rgba(255,255,255,.07)}
.bx .btn.line{border:1px solid var(--line);color:var(--text);background:var(--card)}.bx .btn.line:hover{border-color:var(--gold)}
.bx .btn .ar{transition:transform .25s}.bx .btn:hover .ar{transform:translateX(4px)}
.bx .btn.big{font-size:17px;padding:17px 30px}

/* Live-Feed */
.bx .feed{position:relative;border-radius:20px;padding:22px;border:1px solid transparent;
  background:linear-gradient(rgba(16,25,41,.92),rgba(16,25,41,.92)) padding-box,
  conic-gradient(from var(--a),rgba(216,189,138,.06),rgba(216,189,138,.75),rgba(91,212,154,.45),rgba(216,189,138,.06) 45%,rgba(216,189,138,.06)) border-box;
  box-shadow:0 40px 90px -40px rgba(0,0,0,.75);animation:spin 7s linear infinite,float-in 1.3s .35s both}
.motion .bx .feed-wrap{animation:bob 8s ease-in-out 2s infinite}
.bx .feed-head{display:flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--night-soft);margin-bottom:14px}
.bx .pulse{width:8px;height:8px;border-radius:50%;background:#5bd49a;box-shadow:0 0 0 0 rgba(91,212,154,.6);animation:pulse 2s infinite}
.bx .feed ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.bx .feed li{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px 16px;transition:opacity .6s}
.bx .feed li:nth-child(2){opacity:.7}.bx .feed li:nth-child(3){opacity:.42}
.bx .feed li.new{animation:slide .7s cubic-bezier(.2,.7,.1,1) both;border-color:rgba(216,189,138,.35)}
.bx .feed .co{font-weight:600;color:#fff;font-size:15px}.bx .feed .co span{font-weight:400;color:var(--night-soft);margin-left:8px;font-size:13px}
.bx .feed .ev{color:#d5dbe5;font-size:14px;margin-top:2px}.bx .feed .mt{color:var(--gold2);font-size:12px;margin-top:6px;letter-spacing:.02em}
.bx .feed-note{font-size:12px;color:var(--night-soft);margin:12px 4px 0}

/* Quellen-Band */
.bx .band{background:var(--ink2);color:#c9d1de;border-top:1px solid rgba(255,255,255,.06);padding:22px 0;overflow:hidden}
.bx .band .row{display:flex;align-items:center;gap:28px}
.bx .band .lbl{flex:none;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold2)}
.bx .marquee{flex:1;overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.bx .marquee .track{display:flex;gap:56px;width:max-content;animation:marq 38s linear infinite}
.bx .marquee:hover .track{animation-play-state:paused}
.bx .marquee span{font-size:17px;font-weight:500;white-space:nowrap;color:#e6e9ef}
.bx .marquee span:before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--gold);margin:0 16px 3px 0}

/* Abschnitte */
.bx section{padding:96px 0;position:relative}
.bx h2{font-weight:700;font-size:clamp(30px,3.6vw,46px);line-height:1.12;letter-spacing:-.025em;margin:14px 0 18px}
.bx .intro{color:var(--soft);font-size:19px;max-width:640px;margin:0 0 56px}
.bx .rule{width:56px;height:1px;background:var(--gold);margin:0 0 18px;transform-origin:left}
.motion .bx [data-rv] .rule,.motion .bx .rule[data-rv]{transform:scaleX(0);transition:transform 1s .1s cubic-bezier(.2,.7,.1,1)}
.motion .bx .in .rule,.motion .bx .rule.in{transform:none}
.bx .dark{background:var(--ink);color:#eef1f6}.bx .dark .intro{color:#b9c2d0}
.bx .tinted{background:var(--card);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}

/* Kennzahlen */
.bx .stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.bx .stat{padding:36px 28px;position:relative}.bx .stat+.stat{border-left:1px solid var(--line)}
.bx .stat:after{content:"";position:absolute;left:28px;bottom:-1px;height:2px;width:48px;background:var(--gold);transform:scaleX(0);transform-origin:left;transition:transform 1.2s cubic-bezier(.2,.7,.1,1);transition-delay:calc(var(--i,0) * 120ms + .4s)}
.bx .stats.in .stat:after,.bx .stats:not([data-rv]) .stat:after{transform:none}
.bx .stat b{display:block;font-weight:600;font-size:clamp(36px,4.2vw,56px);line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.bx .stat span{display:block;color:var(--soft);font-size:15px;margin-top:12px}
.bx .stats-note{font-size:13px;color:var(--soft);margin-top:16px}

/* Video */
.bx .frame{position:relative;border-radius:18px;padding:2px;isolation:isolate;
  background:conic-gradient(from var(--a),rgba(216,189,138,.12),rgba(246,230,194,.95),rgba(216,189,138,.5),rgba(91,212,154,.35),rgba(216,189,138,.12) 55%,rgba(216,189,138,.12));
  animation:spin 9s linear infinite;box-shadow:0 60px 120px -50px rgba(0,0,0,.85)}
.bx .frame:before{content:"";position:absolute;inset:-18px;z-index:-1;border-radius:34px;filter:blur(28px);opacity:.35;
  background:conic-gradient(from var(--a),transparent,rgba(216,189,138,.6),transparent 40%);animation:spin 9s linear infinite}
.bx .frame video{display:block;width:100%;aspect-ratio:16/9;border-radius:16px;background:#000}

/* Schritte */
.bx .steps{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative}
.bx .steps.three{grid-template-columns:repeat(3,1fr)}
.bx .steps:before{content:"";position:absolute;left:0;right:0;top:27px;height:1px;background:var(--line)}
.bx .steps:after{content:"";position:absolute;left:0;top:27px;height:1px;width:100%;background:var(--gold);transform:scaleX(0);transform-origin:left;transition:transform 2.2s cubic-bezier(.2,.7,.1,1)}
.bx .steps.in:after,.bx .steps:not([data-rv]):after{transform:none}
.bx .step{padding-right:28px;position:relative}
.bx .step .n{width:54px;height:54px;border-radius:50%;background:var(--paper);border:1px solid var(--gold);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;color:var(--gold);position:relative;z-index:1;transition:background .4s,color .4s,transform .4s}
.bx .step:hover .n{background:var(--gold);color:#fff;transform:scale(1.08)}
.motion .bx .steps .step{opacity:0;transform:translateY(18px);transition:opacity .9s,transform .9s;transition-delay:calc(var(--i) * 180ms + .2s)}
.motion .bx .steps.in .step{opacity:1;transform:none}
.bx .step h3{font-weight:600;font-size:20px;margin:24px 0 8px}
.bx .step p{color:var(--soft);margin:0;font-size:16px}

/* Karten (mit Lichtschein unter der Maus) */
.bx .glow{position:relative;isolation:isolate}
.bx .glow:after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .35s;z-index:-1;
  background:radial-gradient(380px circle at var(--x,50%) var(--y,50%),rgba(176,141,87,.16),transparent 45%)}
.bx .glow:hover:after{opacity:1}
.bx .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:20px}
.bx .card{display:block;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:30px;position:relative;overflow:hidden;transition:transform .45s cubic-bezier(.2,.7,.1,1),box-shadow .45s,border-color .45s}
.bx .card:before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,var(--gold),transparent);transform:scaleX(0);transform-origin:left;transition:transform .6s}
.bx a.card:hover,.bx .card.lift:hover{transform:translateY(-6px);box-shadow:0 34px 70px -38px rgba(22,27,36,.45);border-color:#d6c7ad}.bx .card:hover:before{transform:scaleX(1)}
.bx .card .cc{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.bx .card h3{font-weight:600;font-size:22px;margin:10px 0 10px;line-height:1.25;letter-spacing:-.01em}
.bx .card p{color:var(--soft);margin:0 0 4px;font-size:16px}.bx .card .go{display:inline-block;margin-top:18px;font-weight:600;font-size:15px}
.bx .card .go i{font-style:normal;display:inline-block;transition:transform .3s}.bx a.card:hover .go i{transform:translateX(5px)}
.motion .bx .cards>[data-rv]{transition-delay:calc(var(--i,0) * 110ms)}

/* Beispiel-Leads (hell) */
.bx .leads{display:grid;gap:12px}
.bx .lead{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;display:grid;grid-template-columns:auto 1fr;gap:4px 16px;transition:transform .4s,box-shadow .4s,border-color .4s}
.bx .lead:hover{transform:translateX(6px);border-color:#d6c7ad;box-shadow:0 20px 40px -30px rgba(22,27,36,.4)}
.bx .lead .tag{grid-row:span 3;align-self:start;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold2);background:var(--ink);padding:4px 10px;border-radius:99px}
.bx .lead .co{font-weight:600}.bx .lead .meta{color:var(--soft);font-size:13px}
.motion .bx .leads>[data-rv]{transition-delay:calc(var(--i,0) * 90ms)}

/* Anatomie eines Leads */
.bx .anat{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
.bx .lead-card{position:relative;border-radius:22px;padding:34px 32px 30px;color:#e8ecf3;overflow:hidden;isolation:isolate;border:1px solid transparent;
  background:linear-gradient(160deg,#101a2c,#0b1320 60%) padding-box,
  conic-gradient(from var(--a),rgba(216,189,138,.08),rgba(216,189,138,.8),rgba(91,212,154,.45),rgba(216,189,138,.08) 45%,rgba(216,189,138,.08)) border-box;
  box-shadow:0 50px 100px -45px rgba(11,19,32,.75),0 0 0 1px rgba(216,189,138,.05);animation:spin 8s linear infinite}
.bx .lead-card:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(420px 260px at 85% 0%,rgba(216,189,138,.16),transparent 70%)}
.bx .lead-card:after{content:"";position:absolute;left:0;right:0;top:-40%;height:40%;z-index:-1;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(216,189,138,.10),transparent);opacity:0}
.motion .bx .lead-card.in:after{animation:scanonce 2.6s .5s cubic-bezier(.4,0,.2,1) both}
.bx .lead-card .tagx{display:inline-flex;align-items:center;gap:8px;margin-bottom:22px;color:var(--gold2);font-size:11px;letter-spacing:.18em;text-transform:uppercase;padding:6px 12px;border-radius:99px;border:1px solid rgba(216,189,138,.35);background:rgba(216,189,138,.07)}
.bx .lead-card .tagx:before{content:"";width:6px;height:6px;border-radius:50%;background:#5bd49a;animation:pulse 2s infinite}
.bx .lead-card dl{margin:0;display:grid;grid-template-columns:120px 1fr;gap:0 18px}
.bx .lead-card dt,.bx .lead-card dd{padding:12px 0;border-top:1px solid rgba(255,255,255,.07)}
.bx .lead-card dt:first-of-type,.bx .lead-card dd:first-of-type{border-top:0}
.bx .lead-card dt{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold2);padding-top:15px}
.bx .lead-card dd{margin:0;font-size:16px;color:#e8ecf3}
.bx .lead-card dd.big{font-size:24px;font-weight:700;line-height:1.2;letter-spacing:-.02em;color:#fff}
.bx .lead-card dd.prio span{display:inline-flex;align-items:center;gap:8px;padding:3px 12px;border-radius:99px;font-size:13px;font-weight:600;color:#141008;background:linear-gradient(135deg,#e2c894,#b08d57)}
.bx .lead-card dd.quote{color:#cfd6e2;font-size:16px;padding-left:16px;border-left:2px solid var(--gold);margin-top:12px;padding-top:4px;padding-bottom:4px;border-top:0}
.motion .bx .lead-card dt,.motion .bx .lead-card dd{opacity:0;transform:translateY(10px);filter:blur(4px);transition:opacity .8s,transform .8s,filter .8s;transition-delay:calc(var(--i,0) * 120ms + .35s)}
.motion .bx .lead-card.in dt,.motion .bx .lead-card.in dd{opacity:1;transform:none;filter:none}
.motion .bx .lead-card{transform:translateY(40px) scale(.97);opacity:0;transition:transform 1.1s cubic-bezier(.2,.7,.1,1),opacity 1.1s}
.motion .bx .lead-card.in{transform:none;opacity:1}
.bx .points{list-style:none;padding:0;margin:0;display:grid;gap:22px}
.bx .points li{padding-left:22px;border-left:1px solid var(--gold)}.bx .points li b{display:block;font-weight:600;margin-bottom:2px}
.bx .points li span{color:var(--soft);font-size:16px}

/* Vertrauen */
.bx .facts{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
.bx .fact{padding:34px 32px 34px 0}.bx .fact:nth-child(3n+2),.bx .fact:nth-child(3n){padding-left:32px;border-left:1px solid var(--line)}
.bx .fact:nth-child(n+4){border-top:1px solid var(--line)}
.bx .seal{width:46px;height:46px;border-radius:50%;border:1px solid var(--gold);display:flex;align-items:center;justify-content:center;margin-bottom:18px;transition:background .4s,transform .6s cubic-bezier(.2,.7,.1,1)}
.bx .fact:hover .seal{background:var(--gold);transform:rotate(-8deg) scale(1.06)}.bx .fact:hover .seal svg{stroke:#fff}
.bx .seal svg{width:20px;height:20px;stroke:var(--gold);fill:none;stroke-width:1.5;stroke-dasharray:80;stroke-dashoffset:0;transition:stroke .4s}
.motion .bx .fact .seal svg{stroke-dashoffset:80;transition:stroke-dashoffset 1.6s .3s ease,stroke .4s}
.motion .bx .fact.in .seal svg{stroke-dashoffset:0}
.bx .fact h3{font-weight:600;font-size:19px;margin:0 0 8px}
.bx .fact p{color:var(--soft);margin:0;font-size:15.5px}
.motion .bx .facts>[data-rv]{transition-delay:calc(var(--i,0) * 100ms)}

/* Angebot / Probe */
.bx .offer{background:var(--ink);color:#eef1f6;overflow:hidden;isolation:isolate}
.bx .offer:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(700px 400px at 85% 20%,rgba(176,141,87,.22),transparent 60%)}
.bx .offer .wrap{display:grid;grid-template-columns:1.2fr .8fr;gap:56px;align-items:center}
.bx .offer .intro{color:#b9c2d0;margin-bottom:0}
.bx .olist{list-style:none;counter-reset:o;margin:0;padding:0;display:grid;gap:16px}
.bx .olist li{counter-increment:o;display:grid;grid-template-columns:36px 1fr;gap:12px;color:#d5dbe5;font-size:16px}
.bx .olist li:before{content:counter(o);color:var(--gold2);font-size:20px;font-weight:600;line-height:1.3}
.bx .panel{margin-top:30px;max-width:640px;border-radius:20px;padding:26px 28px;border:1px solid rgba(216,189,138,.35);background:rgba(255,255,255,.04);box-shadow:0 40px 90px -45px rgba(0,0,0,.8);animation:float-in 1s both}
.bx .panel h2{font-size:26px;margin:0 0 16px}
.bx .ticks{list-style:none;padding:0;margin:0 0 20px;display:grid;gap:10px}
.bx .ticks li{padding-left:30px;position:relative;color:#d5dbe5}
.bx .ticks li:before{content:"";position:absolute;left:2px;top:.55em;width:12px;height:7px;border-left:2px solid var(--gold2);border-bottom:2px solid var(--gold2);transform:rotate(-45deg)}
.bx .small{font-size:13px;color:var(--night-soft);margin:14px 0 0}
.bx .ok{color:#5bd49a;font-weight:600;font-size:19px;margin-top:22px}.bx .err{color:#ff8a80;font-weight:600;margin-top:18px}
.bx .banner{background:#b91c1c;color:#fff;padding:10px 16px;font-weight:600;font-size:14px}

/* Preise */
.bx .price{font-size:34px;font-weight:700;letter-spacing:-.02em;margin:6px 0 4px}.bx .price small{font-size:15px;font-weight:500;color:var(--soft)}
.bx .note{color:var(--soft);font-size:14px}

/* Fragen */
.bx .faq{max-width:820px}
.bx details{border-bottom:1px solid var(--line);padding:22px 0}
.bx summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:24px;font-size:19px;font-weight:600;transition:color .3s}
.bx summary:hover{color:var(--gold)}
.bx summary::-webkit-details-marker{display:none}
.bx summary:after{content:"+";color:var(--gold);font-size:24px;font-weight:400;line-height:1;transition:transform .35s}
.bx details[open] summary:after{transform:rotate(45deg)}
.bx details p{color:var(--soft);margin:12px 0 0;max-width:720px}
.bx details[open] p{animation:fade .5s both}

/* Textseiten (Rechtliches, Danke) */
.bx .doc{max-width:820px;margin:-72px auto 0;position:relative;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:48px 52px;box-shadow:0 40px 90px -50px rgba(22,27,36,.4)}
.bx .doc p{white-space:pre-line;color:#2a303b}.bx .doc .warn{border:2px solid #b91c1c;color:#b91c1c;padding:12px;border-radius:10px;font-weight:600}

/* Fußzeile */
.bx footer{background:var(--ink);color:#9aa6ba;padding:56px 0;font-size:14px}
.bx footer .wrap{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:flex-end}
.bx footer .mark{font-size:22px}.bx footer address{font-style:normal;margin-top:10px;line-height:1.7}
.bx footer nav a{margin-left:22px;text-decoration:none;color:#c9d1de}.bx footer nav a:hover{color:#fff}

/* Einblenden beim Scrollen */
.motion .bx [data-rv]{opacity:0;transform:translateY(28px);transition:opacity 1s cubic-bezier(.2,.7,.1,1),transform 1s cubic-bezier(.2,.7,.1,1)}
.motion .bx [data-rv].in{opacity:1;transform:none}
.motion .bx [data-rv].rvw,.motion .bx [data-rv].stats,.motion .bx [data-rv].steps{opacity:1;transform:none}
.motion .bx [data-rv].stats{opacity:0}.motion .bx [data-rv].stats.in{opacity:1}

@keyframes word{to{opacity:1;filter:none;transform:none}}
@keyframes fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes float-in{from{opacity:0;transform:translateY(30px) scale(.98)}to{opacity:1;transform:none}}
@keyframes slide{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(91,212,154,.55)}70%{box-shadow:0 0 0 10px rgba(91,212,154,0)}100%{box-shadow:0 0 0 0 rgba(91,212,154,0)}}
@keyframes aurora{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(-4%,3%,0) scale(1.08)}}
@keyframes scanonce{0%{top:-40%;opacity:1}100%{top:110%;opacity:0}}
@keyframes marq{to{transform:translateX(-50%)}}
@keyframes sweep{0%{left:-70%}30%,100%{left:130%}}
@keyframes spin{to{--a:360deg}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@media (prefers-reduced-motion:reduce){.bx *,.bx *:before,.bx *:after{animation:none!important;transition:none!important}}

@media (max-width:900px){
  .bx .hero .wrap,.bx .anat,.bx .offer .wrap{grid-template-columns:1fr;gap:40px}
  .bx .hero .wrap{padding-top:56px;padding-bottom:64px}
  .bx .stats{grid-template-columns:repeat(2,1fr)}.bx .stat:nth-child(3){border-left:0}.bx .stat:nth-child(n+3){border-top:1px solid var(--line)}
  .bx .steps,.bx .steps.three{grid-template-columns:1fr 1fr;gap:40px 0}.bx .steps:before,.bx .steps:after{display:none}
  .bx .facts{grid-template-columns:1fr 1fr}.bx .fact,.bx .fact:nth-child(n){padding:28px 20px 28px 0;border-left:0;border-top:1px solid var(--line)}
  .bx .fact:nth-child(2n){padding-left:20px;border-left:1px solid var(--line)}
  .bx section{padding:80px 0}
}
@media (max-width:640px){
  .bx{font-size:16px}.bx .wrap{padding:0 18px}
  .bx .nav .links>a:not(.pill){display:none}.bx .nav .links{gap:10px}
  .bx .lede{font-size:17px}.bx .btn{width:100%;justify-content:center}
  .bx .band .row{flex-direction:column;align-items:flex-start;gap:12px}.bx .band .marquee{width:100%}
  .bx .stat{padding:26px 16px}.bx .stat:after{left:16px}.bx .steps,.bx .steps.three{grid-template-columns:1fr}.bx .step{padding-right:0}
  .bx .facts{grid-template-columns:1fr}.bx .fact:nth-child(2n){padding-left:0;border-left:0}
  .bx .lead-card{padding:26px 20px}.bx .lead-card dl{grid-template-columns:1fr}.bx .lead-card dd{border-top:0;padding-top:2px}.bx .lead-card dt{padding-bottom:0}
  .bx .lead{grid-template-columns:1fr}.bx .lead .tag{grid-row:auto;justify-self:start}
  .bx section{padding:64px 0}.bx .intro{margin-bottom:36px;font-size:17px}
  .bx .panel{padding:22px 18px}.bx .doc{padding:30px 22px;margin-top:-48px}
  .bx footer nav a{margin:0 18px 0 0}
}
`;
