/**
 * Startseite und Kontaktseite im Design der Landingpages (Inhaber 03.10.2026: „wenig text, hochwertige grafiken und
 * animationen, video ist das wichtigste element“). Ergänzt LANDING_CSS (.lp2); alles unter .hm.
 */
export const HOME_CSS = `
.bx .hm .h2o .wrap{grid-template-columns:1fr;max-width:980px;text-align:center;justify-items:center;padding-bottom:0}
.bx .hm .h2o h1{margin:20px auto 14px;max-width:900px}
.bx .hm .h2o .sub{margin:0 auto 26px;max-width:640px}
.bx .hm .h2o .ctaline{justify-content:center}
.bx .hm .net{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:.9}
.bx .hm section.h2o{padding-bottom:56px}
.bx .hm .h2o .every{align-items:center;margin:0}
.bx .hm .h2o .chiprow{justify-content:center}
.bx .hm .aftervid{background:var(--cream);display:flex;justify-content:center;padding:34px 16px 0}
.bx .hm .aftervid .free2{color:var(--muted)}
.bx .hm .aftervid .free2 span:before{color:var(--pgold-d)}
.bx .hm .vbase{margin-top:-1px}

/* Video: Hauptelement, ragt aus dem Hero in den hellen Teil */
.bx .hm .stage{position:relative;max-width:1060px;margin:44px auto 0;padding:0 16px}
.bx .hm .stage:before{content:"";position:absolute;left:8%;right:8%;top:6%;bottom:-6%;background:radial-gradient(closest-side,rgba(201,164,101,.45),transparent);filter:blur(40px);z-index:0;pointer-events:none}
.motion .bx .hm .stage:before{animation:hmbreath 6s ease-in-out infinite}
@keyframes hmbreath{0%,100%{opacity:.55;transform:scale(.97)}50%{opacity:1;transform:scale(1.02)}}
.bx .hm .stage .frame{position:relative;z-index:1;border-radius:22px;overflow:hidden;background:#000;border:1px solid rgba(201,164,101,.55);box-shadow:0 50px 100px -40px rgba(0,0,0,.85),0 0 0 6px rgba(255,255,255,.04)}
.bx .hm .stage video{display:block;width:100%;height:auto;aspect-ratio:16/9}
.bx .hm .stage .vtag{position:absolute;z-index:2;top:-14px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;gap:8px;background:#0B1530;border:1px solid rgba(201,164,101,.6);color:var(--gink);font-size:11.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;padding:7px 14px;border-radius:99px;white-space:nowrap}
.bx .hm .stage .vtag i{width:8px;height:8px;border-radius:50%;background:#e2564a;box-shadow:0 0 0 0 rgba(226,86,74,.7)}
.motion .bx .hm .stage .vtag i{animation:hmrec 1.8s ease-out infinite}
@keyframes hmrec{0%{box-shadow:0 0 0 0 rgba(226,86,74,.7)}100%{box-shadow:0 0 0 10px rgba(226,86,74,0)}}
.bx .hm .vbase{background:linear-gradient(180deg,#0B1530 0,#0B1530 50%,var(--cream) 50%,var(--cream) 100%);padding:14px 0 8px}
.bx .hm .vbase .stage{margin-top:0}

/* Kennzahlen */
.bx .hm .kpis.lite .kpi{background:#fff;border:1px solid var(--pline);box-shadow:0 20px 50px -40px rgba(11,21,48,.5)}
.bx .hm .kpis.lite .kpi b{color:var(--navy)}
.bx .hm .kpis.lite .kpi b em{font-style:normal;color:var(--pgold-d)}
.bx .hm .kpis.lite .kpi span{color:var(--faint)}

/* Radar: Signale aus drei Ländern */
.bx .hm .radar{position:relative;aspect-ratio:1;max-width:420px;width:100%;margin:0 auto}
.bx .hm .radar svg{width:100%;height:100%;display:block}
.bx .hm .radar .ring{fill:none;stroke:rgba(201,164,101,.28);stroke-width:1}
.bx .hm .radar .axis{stroke:rgba(255,255,255,.08);stroke-width:1}
.bx .hm .radar .sweep{transform-origin:200px 200px}
.motion .bx .hm .radar .sweep{animation:hmspin 6s linear infinite}
@keyframes hmspin{to{transform:rotate(360deg)}}
.bx .hm .radar .blip{transform-box:fill-box;transform-origin:center}
.motion .bx .hm .radar .blip{animation:hmblip 6s ease-out infinite;animation-delay:var(--d)}
@keyframes hmblip{0%,100%{opacity:.25;transform:scale(.8)}6%{opacity:1;transform:scale(1.5)}30%{opacity:1;transform:scale(1)}}
.bx .hm .radar .core{fill:#0B1530;stroke:var(--pgold);stroke-width:2}
.bx .hm .radar .lbl{position:absolute;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:#e9edf6;background:rgba(11,21,48,.8);border:1px solid rgba(255,255,255,.16);border-radius:99px;padding:6px 11px;backdrop-filter:blur(4px);white-space:nowrap}
.bx .hm .radar .lbl b{color:var(--gink)}
.bx .hm .radar .lbl em{font-style:normal}
.bx .hm .radar .lbl .hp-ico{width:15px;height:15px;color:var(--gink)}
.motion .bx .hm .radar .lbl{animation:hmfloat 5s ease-in-out infinite;animation-delay:var(--d)}
@keyframes hmfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

/* Branchen */
.bx .hm .cswitch2{display:inline-flex;gap:6px;background:#fff;border:1px solid var(--pline);border-radius:99px;padding:5px;margin:0 0 22px}
.bx .hm .cswitch2 label{cursor:pointer;display:inline-flex;align-items:center;gap:7px;padding:8px 16px;border-radius:99px;font-weight:700;font-size:14px;color:var(--muted);transition:background .2s,color .2s}
.bx .hm .cc-in{position:absolute;opacity:0;pointer-events:none}
.bx .hm #cc-UK:checked ~ .cswitch2 label[for=cc-UK]{background:var(--navy);color:var(--gink)}
.bx .hm #cc-UK:focus-visible ~ .cswitch2 label[for=cc-UK]{outline:2px solid var(--pgold);outline-offset:2px}
.bx .hm #cc-UK:checked ~ .icards .icard[data-cc]:not([data-cc=UK]){display:none}
.bx .hm #cc-US:checked ~ .cswitch2 label[for=cc-US]{background:var(--navy);color:var(--gink)}
.bx .hm #cc-US:focus-visible ~ .cswitch2 label[for=cc-US]{outline:2px solid var(--pgold);outline-offset:2px}
.bx .hm #cc-US:checked ~ .icards .icard[data-cc]:not([data-cc=US]){display:none}
.bx .hm #cc-FR:checked ~ .cswitch2 label[for=cc-FR]{background:var(--navy);color:var(--gink)}
.bx .hm #cc-FR:focus-visible ~ .cswitch2 label[for=cc-FR]{outline:2px solid var(--pgold);outline-offset:2px}
.bx .hm #cc-FR:checked ~ .icards .icard[data-cc]:not([data-cc=FR]){display:none}
.bx .hm .icards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.bx .hm .icard{display:flex;flex-direction:column;gap:12px;background:#fff;border:1px solid var(--pline);border-radius:20px;padding:22px;color:var(--pink);text-decoration:none;position:relative;overflow:hidden;transition:transform .25s,box-shadow .25s,border-color .25s}
.bx .hm .icard:before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,#EBD7AE,#C9A465,#A98447);transform:scaleX(0);transform-origin:left;transition:transform .35s}
.bx .hm .icard:hover{transform:translateY(-4px);box-shadow:0 30px 60px -38px rgba(11,21,48,.55);border-color:#e0d3b8}
.bx .hm .icard:hover:before{transform:scaleX(1)}
.bx .hm .icard h3{margin:0;font-size:18px}
.bx .hm .icard .go{margin-top:auto;display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:700;color:var(--gtext)}
.bx .hm .icard .go i{font-style:normal;transition:transform .25s}.bx .hm .icard:hover .go i{transform:translateX(4px)}
.bx .hm .icard .gi{width:42px;height:42px;margin:0}

/* Persönlicher Ansprechpartner */
.bx .hm .pc2{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.bx .hm .pc2 h2 i{font-style:normal;color:var(--gink)}
.bx .hm .pc2 .lede2{color:#aab4ca;max-width:520px}
.bx .hm .plist{list-style:none;padding:0;margin:22px 0 28px;display:grid;gap:14px}
.bx .hm .plist li{display:flex;gap:14px;align-items:flex-start}
.bx .hm .plist li .gi{width:38px;height:38px;margin:0;flex:none}
.bx .hm .plist li b{display:block;color:#fff;font-size:16px}
.bx .hm .plist li span:not(.gi){color:#aab4ca;font-size:14.5px}
.bx .hm .fitcard{position:relative;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:26px;background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.015))}
.bx .hm .fitcard .who{display:flex;align-items:center;gap:14px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.1)}
.bx .hm .fitcard .av{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#EBD7AE,#C9A465);display:grid;place-items:center;color:#0B1530;flex:none;position:relative}
.bx .hm .fitcard .av .ic{width:24px;height:24px}
.bx .hm .fitcard .av:after{content:"";position:absolute;right:1px;bottom:1px;width:12px;height:12px;border-radius:50%;background:#3ccf8e;border:2px solid #13265a}
.bx .hm .fitcard .who b{display:block;color:#fff}.bx .hm .fitcard .who span{font-size:13px;color:#97a2bd}
.bx .hm .fitrows{display:grid;gap:16px;margin-top:20px}
.bx .hm .fitrow{display:grid;grid-template-columns:96px 1fr;align-items:center;gap:14px;font-size:13px;color:#cfd6e4;font-weight:600}
.bx .hm .fitbar{height:12px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}
.bx .hm .fitbar i{display:block;height:100%;width:var(--w);border-radius:99px;background:linear-gradient(90deg,#A98447,#C9A465,#EBD7AE)}
.motion .bx .hm .fitbar i{width:0;transition:width 1.4s cubic-bezier(.2,.8,.2,1);transition-delay:calc(.2s + var(--i) * .25s)}
.motion .bx .hm .fitcard.in .fitbar i{width:var(--w)}
.bx .hm .fitcard .chat{margin-top:22px;display:grid;gap:10px}
.bx .hm .bubble{max-width:85%;font-size:14px;line-height:1.45;padding:10px 14px;border-radius:16px}
.bx .hm .bubble.me{justify-self:end;background:linear-gradient(135deg,#EBD7AE,#C9A465);color:#1b1404;border-bottom-right-radius:4px}
.bx .hm .bubble.them{background:rgba(255,255,255,.08);color:#e9edf6;border-bottom-left-radius:4px}
.motion .bx .hm .fitcard .bubble{opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;transition-delay:calc(1.4s + var(--i) * .5s)}
.motion .bx .hm .fitcard.in .bubble{opacity:1;transform:none}
.bx .hm .fitcard .fnote{margin:14px 0 0;font-size:12px;color:#8f9ab3}

/* Kontaktseite */
.bx .hm .ccards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;width:100%;max-width:900px;margin:8px auto 0;padding-bottom:44px;text-align:left}
.bx .hm .ccard{display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:16px;background:rgba(255,255,255,.04)}
.bx .hm .ccard .gi{width:38px;height:38px;margin:0;flex:none}
.bx .hm .ccard b{display:block;color:#fff;font-size:15px}.bx .hm .ccard span:not(.gi){font-size:13.5px;color:#aab4ca}
.bx .hm .pf textarea{width:100%;font:inherit;font-size:16px;color:#fff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:12px 14px;outline:none;resize:vertical;min-height:96px}
.bx .hm .pf textarea:focus{border-color:var(--gold2);background:rgba(255,255,255,.09)}
.bx .hm .pf textarea::placeholder{color:#7f8aa0}
.bx .hm .nextsteps{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.bx .hm .nextsteps li{display:flex;gap:14px;align-items:flex-start;background:#fff;border:1px solid var(--pline);border-radius:16px;padding:16px 18px;font-size:15px;color:var(--pink)}
.bx .hm .nextsteps li b{flex:none;width:30px;height:30px;border-radius:50%;background:var(--navy);color:var(--gink);display:grid;place-items:center;font-size:14px}
.bx .hm .mailbox{background:#fff;border:1px solid var(--pline);border-radius:16px;padding:16px 18px;display:flex;gap:12px;align-items:center}
.bx .hm .mailbox a{color:var(--gtext);font-weight:700;overflow-wrap:anywhere}
.bx .hm .mailbox address{font-style:normal;font-size:13.5px;color:var(--muted)}


/* Ansprechpartner auf hellem Grund (Startseite nach Vorlage 03.10.2026), Karte rechts bleibt dunkel */
.bx .hm .pcl{background:var(--cream)}
.bx .hm .pcl h2{color:var(--pink)}.bx .hm .pcl h2 i{font-style:normal;color:var(--gtext)}
.bx .hm .pcl .lede2{color:var(--muted)}
.bx .hm .pcl .plist li b{color:var(--pink)}
.bx .hm .pcl .plist li span:not(.gi){color:var(--muted)}
.bx .hm .pcl .fitcard{background:linear-gradient(170deg,#13265a,#0B1530);border:0;box-shadow:0 40px 80px -45px rgba(11,21,48,.7)}
.bx .hm .gi .hp-ico{width:20px;height:20px}
.bx .hm .fitcard .av .hp-ico{width:24px;height:24px}
.hpz .hp-talk{display:flex;align-items:center;gap:14px;text-decoration:none;color:var(--ink)}
.hpz .hp-talk small{display:block;font-size:12.5px;color:var(--muted)}
.hpz .hp-talk strong{display:block;font-size:15.5px;color:var(--gold-deep)}
.hpz .hp-qa summary::after{content:none;display:none}
@media (max-width:440px){.hpz .hp-stat__num{font-size:clamp(28px,8.4vw,36px)}}


/* Ansprechpartner-Karte rechts (Inhaber 03.10.2026): hell, Gold-Linie oben, Ablauf + Filter + Nachricht */
.bx .hm .pccard{position:relative;background:#fff;border:1px solid var(--pline);border-radius:26px;padding:28px;box-shadow:0 40px 80px -50px rgba(11,21,48,.45);overflow:hidden}
.bx .hm .pccard:before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,#EBD7AE,#C9A465,#A98447)}
.bx .hm .pchead{display:flex;align-items:center;gap:14px;padding-bottom:20px;border-bottom:1px solid var(--line2,#EFEAE0)}
.bx .hm .pchead b{display:block;color:var(--pink);font-size:16px}
.bx .hm .pchead em{display:flex;align-items:center;gap:7px;font-style:normal;font-size:13px;color:var(--muted)}
.bx .hm .pcdot{width:8px;height:8px;border-radius:50%;background:#3BD18A;box-shadow:0 0 0 0 rgba(59,209,138,.6)}
.motion .bx .hm .pcdot{animation:pcping 2s ease-out infinite}
@keyframes pcping{0%{box-shadow:0 0 0 0 rgba(59,209,138,.6)}100%{box-shadow:0 0 0 9px rgba(59,209,138,0)}}
.bx .hm .pcav{position:relative;flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#EBD7AE,#C9A465);color:#0B1530}
.bx .hm .pcav .hp-ico{width:24px;height:24px}
.bx .hm .pcav.sm{width:30px;height:30px}.bx .hm .pcav.sm .hp-ico{width:15px;height:15px}
.bx .hm .pctl{list-style:none;margin:22px 0 0;padding:0;position:relative;display:grid;gap:16px}
.bx .hm .pctl:before{content:"";position:absolute;left:19px;top:20px;bottom:20px;width:2px;background:linear-gradient(180deg,#C9A465,#EBD7AE)}
.bx .hm .pctl li{position:relative;display:flex;align-items:center;gap:14px}
.bx .hm .pcic{position:relative;z-index:1;flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#fff;border:2px solid #C9A465;color:var(--gtext)}
.bx .hm .pctl li:last-child .pcic{background:linear-gradient(135deg,#EBD7AE,#C9A465);border-color:transparent;color:#0B1530}
.bx .hm .pcic .hp-ico{width:18px;height:18px}
.bx .hm .pctl small{display:block;font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.bx .hm .pctl b{display:block;font-size:15.5px;color:var(--pink)}
.bx .hm .pcfilters{margin-top:22px;padding:16px 18px;border-radius:16px;background:var(--cream)}
.bx .hm .pcchips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.bx .hm .pcchip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:99px;font-size:13.5px;font-weight:600;background:#fff;border:1px solid var(--pline);color:var(--pink)}
.bx .hm .pcchip .hp-ico{width:14px;height:14px}
.bx .hm .pcchip.on .hp-ico{color:var(--green)}
.bx .hm .pcchip.off{color:var(--faint);text-decoration:line-through;background:transparent}
.bx .hm .pcchip.off .hp-ico{color:var(--coral)}
.bx .hm .pcchip.new{background:linear-gradient(135deg,#EBD7AE,#C9A465);border-color:transparent;color:#1b1404}
.bx .hm .pcquote{display:flex;gap:12px;align-items:flex-start;margin:18px 0 0;padding:14px 16px;border-radius:16px 16px 16px 4px;background:linear-gradient(170deg,#13265a,#0B1530);color:#e9edf6;font-size:14.5px;line-height:1.5}
.bx .hm .pccard .fnote{color:var(--faint);margin-top:14px}
.motion .bx .hm .pccard .pctl li,.motion .bx .hm .pccard .pcchip,.motion .bx .hm .pccard .pcquote{opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s;transition-delay:calc(.25s + var(--i) * .25s)}
.motion .bx .hm .pccard.in .pctl li,.motion .bx .hm .pccard.in .pcchip,.motion .bx .hm .pccard.in .pcquote{opacity:1;transform:none}
.bx .hm #revenue{padding-bottom:24px}


/* Hero-Karte: drei Länder blenden über (Inhaber 03.10.2026), weniger Abstand oben */
.hpz section.hp-hero{padding:0}
.hpz .hp-hero__stage{min-height:0}
.hpz .hp-hero__grid{padding-block:28px 48px}
@media (min-width:1061px){.hpz .hp-hero__grid{grid-template-columns:minmax(0,1.22fr) minmax(0,.78fr);gap:48px}}
.hpz .hp-maps{display:contents}
.hpz .hp-map{opacity:0;transition:opacity .9s var(--ease)}
.hpz .hp-map.is-on{opacity:1}
.hpz .hp-landd{fill:none;stroke:var(--dot-c);stroke-opacity:var(--dot-o);stroke-width:4.3;stroke-linecap:round}
.hpz .hp-nbd{fill:none;stroke:#8FA3CC;stroke-opacity:.12;stroke-width:3.4;stroke-linecap:round}
.hpz .hp-city{gap:9px;padding:5px 14px 5px 5px}
.hpz .hp-cflag{position:relative;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;border:1px solid rgba(226,200,148,.55);color:#E2C894;background:rgba(226,200,148,.06)}
.hpz .hp-cflag .hp-flag{width:18px;height:18px;border-radius:50%;box-shadow:none;display:block}
.hpz .hp-city:not([aria-selected="true"]) .hp-cflag{border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.55);background:none}
.hpz .hp-city::before{display:none}
@media (max-width:1060px){
  .hpz .hp-maps{display:block;position:relative;height:min(540px,118vw);margin:4px auto 0}
  .hpz .hp-maps .hp-map{position:absolute;inset:0;height:auto;margin:0 auto}
  .hpz .hp-hero__grid{padding-block:24px 48px}
}
@media (max-width:720px){.hpz .hp-maps{height:min(470px,118vw)}}


/* Kennzahlen als eigener Abschnitt nach dem Film (Inhaber 03.10.2026: Video direkt nach „Read daily from“) */
.hpz .hp-proofsec{padding:0 0 clamp(56px,7vw,88px);background:var(--navy-900);color:#fff}
.hpz .hp-film{padding-top:clamp(48px,6vw,72px)}
/* Hero-Text höchstens drei Zeilen: breit genug auf dem Desktop, auf dem Handy die kurze Fassung */
.hpz .hp-lede{max-width:none;font-size:clamp(15px,1.15vw,16.5px);line-height:1.6}
.hpz .lede-s{display:none}
@media (max-width:720px){.hpz .lede-l{display:none}.hpz .lede-s{display:inline}}

@media (max-width:980px){
  .bx .hm .pc2{grid-template-columns:1fr;gap:28px}
  .bx .hm .icards{grid-template-columns:1fr 1fr}
  .bx .hm .ccards{grid-template-columns:1fr}
}
@media (max-width:560px){
  .bx .hm .icards{grid-template-columns:1fr}
  .bx .hm .stage{padding:0;margin-top:34px}
  .bx .hm .stage .frame{border-radius:14px}
  .bx .hm .cswitch2 label{padding:7px 11px;font-size:13px}
  .bx .hm .fitrow{grid-template-columns:80px 1fr}
  .bx .hm .radar{max-width:300px}
  .bx .hm .radar .lbl{font-size:10.5px;padding:4px 8px;gap:5px}
  .bx .hm .radar .lbl{font-size:11px;padding:4px 9px}
}
@media (prefers-reduced-motion:reduce){.bx .hm *{animation:none!important}}
/* Chips: „Sales tip“ beginnt die zweite Zeile (Inhaber 03.10.) */
@media (min-width:721px){.hpz .hp-chips{row-gap:0}.hpz .hp-chip-br{flex-basis:100%;height:8px}}
@media (max-width:720px){.hpz .hp-chip-br{display:none}}
/* Länder-Umschalter nebeneinander (Inhaber 03.10.) */
.hpz .hp-stage__cities{flex-direction:row;flex-wrap:wrap;gap:8px}
/* ---- Vorlage v4 (03.10.2026): Probe-Formular auf der dunklen Karte, Felder wie in der Vorlage ---- */
.hpz .hp-formcard{scroll-margin-top:90px}
.hpz .hp-formcard .pf{max-width:none;margin:30px 0 0;gap:16px;color:#fff;grid-template-columns:minmax(0,1fr)}
.hpz .hp-formcard .pf-row{gap:14px}
.hpz .hp-formcard .pf-field,.hpz .hp-formcard .pf-set legend{gap:8px;font-size:13.5px;font-weight:600;letter-spacing:0;color:#E9EDF5}
.hpz .hp-formcard .pf-field small,.hpz .hp-formcard .pf-set small{margin-left:4px;font-size:12px;font-weight:500;color:var(--on-dark-3)}
.hpz .hp-formcard .pf input:not([type=checkbox]),.hpz .hp-formcard .pf select{height:auto;padding:14px 16px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background-color:rgba(255,255,255,.06);font-size:15.5px;font-weight:400;color:#fff;transition:border-color .25s,background-color .25s,box-shadow .25s}
.hpz .hp-formcard .pf input:not([type=checkbox]):hover,.hpz .hp-formcard .pf select:hover{border-color:rgba(255,255,255,.26)}
.hpz .hp-formcard .pf input:not([type=checkbox]):focus,.hpz .hp-formcard .pf select:focus{outline:none;border-color:var(--gold);background-color:rgba(255,255,255,.09);box-shadow:0 0 0 4px rgba(216,189,138,.18),0 0 30px -6px rgba(216,189,138,.45)}
.hpz .hp-formcard .pf input::placeholder{color:#7F8AA4}
.hpz .hp-formcard .pf select{appearance:none;-webkit-appearance:none;padding-right:44px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23D8BD8A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;background-size:18px}
.hpz .hp-formcard .pf select:invalid{color:#9AA4BA}
.hpz .hp-formcard .pf select option{color:#161B24;background:#fff}
.hpz .hp-formcard .pf-consent{display:grid;grid-template-columns:20px 1fr;gap:12px;margin:6px 0 8px;font-size:13px;line-height:1.55;color:var(--on-dark-3)}
.hpz .hp-formcard .pf-consent input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--gold-lo)}
.hpz .hp-formcard .pf-consent a{color:var(--gold-soft);text-underline-offset:2px}
.hpz .hp-formcard .pf-go{gap:12px 18px}
.hpz .hp-formcard .pf-go .btn{gap:10px;padding:18px 30px;border-radius:var(--pill);font-size:16.5px;font-weight:600;line-height:1;background:var(--grad-gold);color:#141008;box-shadow:0 12px 32px -12px rgba(216,189,138,.65),inset 0 1px 0 rgba(255,255,255,.4)}
.hpz .hp-formcard .pf-fine{font-size:13.5px;color:var(--on-dark-3)}
.hpz .hp-formcard .pf-done{margin-top:30px;border-color:rgba(59,209,138,.35);background:rgba(59,209,138,.08)}
.hpz .hp-formcard .pf-done p{color:#DFF6EA}
@media (max-width:1060px){.hpz .hp-sample__grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:720px){.hpz .hp-formcard .pf-row{grid-template-columns:minmax(0,1fr)}.hpz .hp-formcard .pf-row > *{min-width:0}.hpz .hp-formcard .pf-go .btn{width:100%;justify-content:center}}
/* „Aktualisiert“ je Sprache (data-upd), Quellen-Liste ohne Flaggen (Inhaber 03.10.2026) */
.hpz .hp-filters > div.is-changed dt::after{content:attr(data-upd)}
.hpz .hp-filters dt{flex-wrap:wrap}
.hpz .hp-ledger__txt small{gap:0}

/* ---- Fragen nach Vorlage home_1 (Inhaber 03.10.2026): schmale Spalte, Plus dreht sich ---- */
.hpz .hp-wrap--narrow{max-width:calc(760px + 2 * var(--gutter))}
@keyframes hp-rise{from{opacity:0;translate:0 14px}}

/* Länderwechsel: Lichtwelle nicht am Kartenrand abschneiden (Inhaber 03.10.2026) */
.js .hpz .hp-map svg{clip-path:inset(-60% -60% 160% -60%)}
.is-ready .hpz .hp-map svg{clip-path:inset(-60%)}
@media (prefers-reduced-motion:reduce){.js .hpz .hp-map svg,.is-ready .hpz .hp-map svg{clip-path:none}}
/* Kennzahlen enger an den Film (Inhaber 03.10.2026): ~40px über der Überschrift, ~56px unter der Fußnote */
.hpz section.hp-film{padding-bottom:88px;overflow-x:clip;overflow-y:visible;position:relative;z-index:1}
.hpz section.hp-proofsec{padding:0}
.hpz .hp-proofsec .hp-proof{padding-block:0 56px}
@media (max-width:720px){.hpz section.hp-film{padding-bottom:56px}.hpz .hp-proofsec .hp-proof{padding-block:0 40px}}
/* FAQ „Good to know“ zweispaltig mit Karten (Inhaber 03.10.2026) */
.hpz .hp-sample{padding-bottom:88px}
.hpz .hp-sec.hp-faq{padding:72px 0 112px;background:var(--cream);color:var(--text)}
.hpz .hp-faq__grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.5fr);gap:64px;align-items:start}
.hpz .hp-faq__head{position:sticky;top:96px}
.hpz .hp-faq__more{display:flex;gap:14px;align-items:flex-start;margin-top:28px;padding:18px 20px;border-radius:16px;background:#fff;border:1px solid #ece5d6;font-size:15px;line-height:1.55;color:var(--muted)}
.hpz .hp-faq__mail{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--gold-tint);color:var(--gold-deep)}
.hpz .hp-faq__mail .hp-ico{width:18px;height:18px}
.hpz .hp-faq__more a{color:var(--ink);font-weight:700;text-decoration:underline;text-decoration-color:var(--gold-lo);text-underline-offset:3px;overflow-wrap:anywhere}
.hpz .hp-faq__list{display:grid;gap:12px}
.hpz .hp-qa{margin:0;padding:0 24px;border:1px solid #ece5d6;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(14,26,51,.04);transition:border-color .3s,box-shadow .3s}
.hpz .hp-qa:hover{border-color:#e0d2b4}
.hpz .hp-qa[open]{border-color:rgba(176,141,87,.55);box-shadow:0 24px 44px -30px rgba(14,26,51,.35)}
.hpz .hp-qa summary{display:flex;align-items:center;gap:20px;padding:20px 0;list-style:none;font-size:17px;font-weight:700;line-height:1.4;color:var(--ink);cursor:pointer}
.hpz .hp-qa summary::-webkit-details-marker{display:none}
.hpz .hp-qa__btn{flex:none;display:grid;place-items:center;width:34px;height:34px;margin-left:auto;border-radius:50%;background:var(--gold-tint);color:var(--gold-deep);transition:background-color .3s,color .3s,transform .35s var(--ease)}
.hpz .hp-qa__ic{width:16px;height:16px}
.hpz .hp-qa[open] .hp-qa__btn{background:var(--ink);color:var(--gold-hi);transform:rotate(45deg)}
.hpz .hp-qa__a{max-width:62ch;padding:0 0 22px;font-size:16px;line-height:1.7;color:var(--muted)}
.hpz .hp-qa[open] .hp-qa__a{animation:hp-rise .4s var(--ease)}
.hpz .hp-qa__a p{margin:0}
@media (max-width:900px){.hpz .hp-faq__grid{grid-template-columns:1fr;gap:28px}.hpz .hp-faq__head{position:static}}
@media (max-width:720px){.hpz .hp-sample{padding-bottom:64px}.hpz .hp-sec.hp-faq{padding:48px 0 80px}.hpz .hp-qa{padding:0 18px}.hpz .hp-qa summary{font-size:16px}}
@media (prefers-reduced-motion:reduce){.hpz .hp-qa[open] .hp-qa__a{animation:none}.hpz .hp-qa__btn{transition:none}}
/* Bewertung als Fließband wie im Film (Inhaber 03.10.2026) */
.hpz .hp-qs{position:relative;z-index:2;width:min(100%,400px);margin:6px auto 0;padding:16px 18px 14px;border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03));box-shadow:inset 0 0 0 1px rgba(226,200,148,.22),0 24px 40px -28px rgba(0,0,0,.8)}
.hpz .hp-qs__head{display:flex;align-items:center;gap:9px;margin-bottom:10px}
.hpz .hp-qs__ic{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:rgba(226,200,148,.12);color:var(--gold-hi)}
.hpz .hp-qs__ic .hp-ico{width:15px;height:15px}
.hpz .hp-qs__head b{font-size:15px;font-weight:700;color:#fff}
.hpz .hp-qs__min{margin-left:auto;padding:4px 10px;border-radius:999px;background:rgba(226,200,148,.1);box-shadow:inset 0 0 0 1px rgba(226,200,148,.35);font-size:12px;font-weight:700;color:var(--gold-hi);white-space:nowrap}
.hpz .hp-qs__row{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1.2fr) 30px;align-items:center;gap:12px;padding:6px 0;font-size:13.5px;color:var(--on-dark-2)}
.hpz .hp-qs__bar{position:relative;display:block;height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}
.hpz .hp-qs__bar i{position:absolute;inset:0 auto 0 0;width:calc(var(--v) * 1%);border-radius:inherit;background:linear-gradient(90deg,#B08D57,#E9CF9C);transition:width .9s var(--ease-out)}
.hpz .hp-qs__bar::after{content:"";position:absolute;top:-2px;bottom:-2px;left:60%;width:1px;background:rgba(255,255,255,.35)}
.hpz .hp-qs__row em{font-style:normal;font-weight:700;text-align:right;color:#fff;font-variant-numeric:tabular-nums}
.hpz .hp-qs__link{display:block;width:1px;height:26px;margin:0 auto;background:repeating-linear-gradient(180deg,rgba(226,200,148,.6) 0 4px,transparent 4px 8px)}
.hpz .hp-belt{position:relative;height:118px;margin:0 -6px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)}
.hpz .hp-belt__line{position:absolute;left:0;right:0;bottom:12px;height:0;border-top:1.5px dashed rgba(226,200,148,.35)}
.hpz .hp-belt__scan{position:absolute;z-index:3;left:34%;width:32%;top:4px;bottom:4px;pointer-events:none;--c:rgba(226,200,148,.9)}
.hpz .hp-belt__scan::before,.hpz .hp-belt__scan::after{content:"";position:absolute;inset:0;border:2px solid var(--c);border-radius:12px;-webkit-mask:linear-gradient(#000 0 0) top left/22% 26% no-repeat,linear-gradient(#000 0 0) top right/22% 26% no-repeat,linear-gradient(#000 0 0) bottom left/22% 26% no-repeat,linear-gradient(#000 0 0) bottom right/22% 26% no-repeat;mask:linear-gradient(#000 0 0) top left/22% 26% no-repeat,linear-gradient(#000 0 0) top right/22% 26% no-repeat,linear-gradient(#000 0 0) bottom left/22% 26% no-repeat,linear-gradient(#000 0 0) bottom right/22% 26% no-repeat}
.hpz .hp-belt__scan::after{display:none}
.hpz .hp-belt__scan i{position:absolute;top:10%;bottom:10%;left:50%;width:2px;margin-left:-1px;border-radius:2px;background:linear-gradient(180deg,transparent,#FFF2D6,transparent);box-shadow:0 0 14px 3px rgba(242,218,168,.55);animation:hp-scanx 2.8s ease-in-out infinite}
@keyframes hp-scanx{0%,100%{transform:translateX(-46px)}50%{transform:translateX(46px)}}
.hpz .hp-belt__card{--x:-36%;position:absolute;z-index:2;left:var(--x);top:18px;width:28%;height:74px;margin-left:2%;padding:12px 12px 10px;border-radius:12px;background:linear-gradient(180deg,#1A2C5C,#13224A);box-shadow:inset 0 0 0 1px rgba(150,175,235,.28),0 14px 26px -18px rgba(0,0,0,.9);transition:left 1.1s cubic-bezier(.65,0,.35,1),transform .6s var(--ease),opacity .6s,box-shadow .5s,background .5s}
.hpz .hp-belt__card.no-anim{transition:none}
.hpz .hp-belt__card[data-slot="-1"]{--x:-34%}
.hpz .hp-belt__card[data-slot="0"]{--x:0%}
.hpz .hp-belt__card[data-slot="1"]{--x:34%}
.hpz .hp-belt__card[data-slot="2"]{--x:68%}
.hpz .hp-belt__card[data-slot="3"]{--x:102%}
.hpz .hp-belt__sq{position:absolute;left:12px;top:12px;width:18px;height:18px;border-radius:5px;background:#5A7BD0;transition:background .5s}
.hpz .hp-belt__l1,.hpz .hp-belt__l2,.hpz .hp-belt__l3{position:absolute;left:38px;height:6px;border-radius:3px;background:rgba(200,215,255,.55)}
.hpz .hp-belt__l1{top:18px;width:46%}
.hpz .hp-belt__l2{left:12px;top:42px;width:58%;opacity:.45}
.hpz .hp-belt__l3{left:12px;top:54px;width:38%;opacity:.35}
.hpz .hp-belt__score{position:absolute;right:12px;bottom:8px;font-size:22px;font-weight:800;line-height:1;letter-spacing:-.02em;color:rgba(200,215,255,.5);font-variant-numeric:tabular-nums;opacity:0;transform:translateY(4px);transition:opacity .4s,transform .4s,color .4s}
.hpz .hp-belt__card.has-score .hp-belt__score{opacity:1;transform:none}
.hpz .hp-belt__ok{position:absolute;top:-8px;right:-8px;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#3BD18A;opacity:0;transform:scale(.4);transition:opacity .35s,transform .45s var(--ease-out)}
.hpz .hp-belt__ok svg{width:13px;height:13px;fill:none;stroke:#062016;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.hpz .hp-belt__card.is-scan{box-shadow:inset 0 0 0 1px rgba(226,200,148,.6),0 0 30px -6px rgba(226,200,148,.45)}
.hpz .hp-belt__card.is-pass{background:linear-gradient(180deg,#123B45,#0F2E3C);box-shadow:inset 0 0 0 1.5px rgba(59,209,138,.75),0 0 30px -10px rgba(59,209,138,.55)}
.hpz .hp-belt__card.is-pass .hp-belt__sq{background:#3BD18A}
.hpz .hp-belt__card.is-pass .hp-belt__score{color:#5EE6A6}
.hpz .hp-belt__card.is-pass .hp-belt__ok{opacity:1;transform:none}
.hpz .hp-belt__card.is-fail{background:linear-gradient(180deg,#3A1F2E,#2A1726);box-shadow:inset 0 0 0 1.5px rgba(224,122,111,.7)}
.hpz .hp-belt__card.is-fail .hp-belt__sq{background:#E07A6F}
.hpz .hp-belt__card.is-fail .hp-belt__score{color:#F19C91}
.hpz .hp-belt__card.is-fail.is-done{transform:translateY(34px) rotate(4deg);opacity:0;transition:left 1.1s cubic-bezier(.65,0,.35,1),transform .9s cubic-bezier(.55,0,.75,.4) .7s,opacity .7s .9s,box-shadow .5s,background .5s}
.hpz .hp-belt__legend{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 20px;margin-top:6px;font-size:13px;font-weight:600}
.hpz .hp-belt__legend span{display:inline-flex;align-items:center;gap:7px;font-size:13px}
.hpz .hp-belt__legend .hp-belt__yes{color:#5EE6A6}
.hpz .hp-belt__legend .hp-belt__yes svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.hpz .hp-belt__legend .hp-belt__no{color:#F19C91}
.hpz .hp-belt__legend .hp-belt__no .hp-ico{width:14px;height:14px}
@media (max-width:720px){.hpz .hp-qs__row{font-size:12.5px;gap:8px}.hpz .hp-belt{height:104px}.hpz .hp-belt__card{height:64px;padding:10px}.hpz .hp-belt__score{font-size:18px}.hpz .hp-belt__l2{top:36px}.hpz .hp-belt__l3{top:46px}}
@media (prefers-reduced-motion:reduce){.hpz .hp-belt__scan i{animation:none}}
/* Schritt 4 „Your list“ als Postfach-Fenster (Inhaber 03.10.2026: hochwertiger) */
.hpz .hp-mail{padding:0;border-radius:18px;background:linear-gradient(180deg,#FCFAF5,#F3EDE1);box-shadow:0 0 0 1px rgba(226,200,148,.55),0 1px 0 rgba(255,255,255,.8) inset,0 44px 80px -36px rgba(0,0,0,.85),0 0 60px -20px rgba(216,189,138,.35)}
.hpz .hp-mail__bar{display:flex;align-items:center;gap:12px;height:30px;padding:0 14px;background:linear-gradient(180deg,#14214A,#0F1A3B);color:var(--on-dark-2);font-size:12px;font-weight:600}
.hpz .hp-mail__dots{display:inline-flex;gap:6px}
.hpz .hp-mail__dots i{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.16)}
.hpz .hp-mail__dots i:first-child{background:#E2C894}
.hpz .hp-mail__inbox{display:inline-flex;align-items:center;gap:6px;margin-left:6px;color:#fff}
.hpz .hp-mail__inbox .hp-ico{width:14px;height:14px;color:var(--gold-hi)}
.hpz .hp-mail__bar em{margin-left:auto;font-style:normal;font-variant-numeric:tabular-nums;letter-spacing:.02em;color:var(--gold-hi)}
.hpz .hp-mail__body{padding:12px 14px 12px}
.hpz .hp-mail__logo{width:34px;height:34px}
.hpz .hp-mail__new{display:inline-flex;align-items:center;gap:6px;margin-left:auto;padding:5px 11px;border-radius:999px;background:var(--navy-900);font-size:11.5px;font-weight:700;letter-spacing:.04em;color:var(--gold-hi);text-transform:uppercase}
.hpz .hp-mail__new i{width:7px;height:7px;border-radius:50%;background:var(--live);box-shadow:0 0 0 3px rgba(59,209,138,.25)}
.hpz .hp-mail__subject{margin-top:9px;font-size:17px}
.hpz .hp-mail__files{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.hpz .hp-mail__files>span>span{padding:0;border:0;border-radius:0;background:none;box-shadow:none}
.hpz .hp-mail__files>span{display:flex;align-items:center;gap:10px;padding:6px 10px 6px 6px;border:1px solid rgba(14,26,51,.08);border-radius:12px;background:#fff;box-shadow:0 6px 14px -12px rgba(14,26,51,.5)}
.hpz .hp-mail__files>span>span{display:grid;min-width:0}
.hpz .hp-mail__files strong{font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hpz .hp-mail__files small{font-size:11.5px;font-weight:500;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hpz .hp-mail__leads{gap:6px;margin-top:8px}
.hpz .hp-mail__leads li>.hp-mail__ic{grid-column:1;grid-row:1}.hpz .hp-mail__leads li>.hp-mail__who{grid-column:2;grid-row:1}.hpz .hp-mail__leads li>.hp-mail__sc{grid-column:3;grid-row:1}.hpz .hp-mail__leads li>.hp-lock{grid-column:4;grid-row:1}
.hpz .hp-mail__leads li{grid-template-columns:30px minmax(0,1fr) auto auto;gap:0 12px;padding:6px 12px 6px 6px;border-color:rgba(14,26,51,.07);box-shadow:0 6px 14px -12px rgba(14,26,51,.45)}
.hpz .hp-mail__ic{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,#F4E9D2,#E8D4AB);color:var(--gold-deep)}
.hpz .hp-mail__ic .hp-ico{width:16px;height:16px}
.hpz .hp-mail__who{display:grid;min-width:0}
.hpz .hp-mail__who small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hpz .hp-mail__sc{display:grid;place-items:center;min-width:36px;height:26px;padding:0 8px;border-radius:999px;background:rgba(59,209,138,.12);box-shadow:inset 0 0 0 1px rgba(59,209,138,.4);font-size:12.5px;font-weight:800;color:#13945A;font-variant-numeric:tabular-nums}
.hpz .hp-mail__excl{justify-content:center;margin-top:12px}
@media (max-width:720px){.hpz .hp-mail__files{grid-template-columns:1fr}.hpz .hp-mail__leads li{grid-template-columns:28px minmax(0,1fr) auto auto;gap:0 9px}.hpz .hp-mail__ic{width:28px;height:28px}.hpz .hp-mail__inbox{display:none}}
/* Siegel aus Vorlage v5 auf der Methoden-Grafik (Inhaber 03.10.2026) */
.hpz .hp-story__stick{position:sticky;top:calc(50vh - 260px + 30px)}
.hpz .hp-story__stage{position:relative;top:auto}
.hpz .hp-fact__role{display:block;margin-top:2px;font-size:13.5px;font-weight:500;color:var(--muted)}
/* ===== Vorlage v2 (03.10.2026): Kennzahlen-Band mit Grafiken, Film-Titelbild (Radar), Rahmen der Probe-Karte =====
   Ohne JavaScript bzw. bei reduzierter Bewegung steht alles im Endzustand; Bewegung nur unter .hpz.hp-motion. */
.hpz .hp-proofsec{background:radial-gradient(580px 210px at 90% 58%,rgba(201,164,101,.09),transparent 72%),var(--navy-900)}
.hpz .hp-band{--stat-fs:clamp(34px,4vw,44px);position:relative;isolation:isolate;overflow:hidden;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:28px 0 0;padding:0;list-style:none;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:linear-gradient(162deg,rgba(255,255,255,.086),rgba(255,255,255,.024) 52%,rgba(255,255,255,.043));box-shadow:inset 0 1px 0 rgba(255,255,255,.15),inset 0 -1px 0 rgba(0,0,0,.28),0 1px 0 rgba(255,255,255,.03),0 22px 34px -26px rgba(0,0,0,.65),0 46px 80px -52px rgba(0,0,0,.8)}
.hpz .hp-band::before{content:"";position:absolute;z-index:3;left:7%;right:7%;top:0;height:1px;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.32) 24%,rgba(235,215,174,.56) 64%,transparent)}
.hpz .hp-band__item{position:relative;z-index:1;display:flex;flex-direction:column;gap:10px;padding:78px 26px 28px}
.hpz .hp-band__item + .hp-band__item::before{content:"";position:absolute;left:0;top:22px;bottom:22px;width:1px;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(255,255,255,.19) 26%,rgba(255,255,255,.19) 74%,transparent)}
.hpz .hp-band__item--accent{overflow:hidden;background:radial-gradient(86% 78% at 86% 6%,rgba(226,198,143,.24),transparent 66%),linear-gradient(162deg,rgba(216,189,138,.1),rgba(216,189,138,.024));box-shadow:inset 0 1px 0 rgba(235,215,174,.25),inset 1px 0 0 rgba(216,189,138,.08)}
.hpz .hp-band__item--accent::before{background:linear-gradient(180deg,transparent,rgba(216,189,138,.3) 26%,rgba(216,189,138,.3) 74%,transparent)!important}
.hpz .hp-band__num{display:block;height:1.12em;font-size:var(--stat-fs);font-weight:800;line-height:1.12;letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap;color:#fff}
.hpz .hp-band__num .hp-odo,.hpz .hp-band__num .hp-odo__strip span{height:1.12em;line-height:1.12}
.hpz .hp-band__num .hp-odo__strip{transform:translateY(calc((10 + var(--n)) * -1.12em))}
.hpz.hp-motion .hp-band__num .hp-odo__strip{transform:none}
.hpz.hp-motion .is-in .hp-band__num .hp-odo__strip{transform:translateY(calc((10 + var(--n)) * -1.12em))}
.hpz .hp-band__item--accent .hp-band__num{color:var(--gold-soft)}
.hpz .hp-band__item--accent .hp-band__num > span:not(.hp-odo),.hpz .hp-band__item--accent .hp-odo__strip span{background:linear-gradient(180deg,#EBD7AE 16%,#D8BD8A 56%,#C9A465 88%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.hpz .hp-band__label{max-width:17.5em;font-size:14.5px;line-height:1.5;color:#AAB4CA}
/* Grafiken oben rechts */
.hpz .hp-stat-art{position:absolute;top:22px;right:22px;width:88px;height:44px;pointer-events:none;opacity:.86;transition:opacity .45s var(--ease)}
.hpz .hp-stat-art svg{display:block;width:100%;height:100%;max-width:none;overflow:visible}
.hpz .hp-band__item:hover .hp-stat-art{opacity:1}
.hpz .hp-stat-dot{fill:#fff;fill-opacity:.17}
.hpz .hp-stat-lit-halo{fill:#D8BD8A;fill-opacity:.3}
.hpz .hp-stat-lit-core{fill:#E2C68F}
.hpz .hp-stat-gs0{stop-color:#EBD7AE}
.hpz .hp-stat-gs1{stop-color:#C9A465}
.hpz .hp-stat-gs2{stop-color:#B08D57}
.hpz .hp-stat-base{fill:none;stroke:#fff;stroke-opacity:.14;stroke-width:1}
.hpz .hp-stat-bar{fill:#fff;fill-opacity:.15}
.hpz .hp-stat-bar--g1{fill:#D8BD8A;fill-opacity:.42}
.hpz .hp-stat-bar--g2{fill:#D8BD8A;fill-opacity:.7}
.hpz .hp-stat-bar--g3{fill:url(#hp-g-stbar);fill-opacity:1}
.hpz .hp-stat-art--pulse{display:flex;align-items:center;justify-content:space-between;gap:8px}
.hpz .hp-stat-art .hp-stat-wavebox{flex:none;width:66px;height:44px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 34%,#000 82%,transparent);mask-image:linear-gradient(90deg,transparent,#000 34%,#000 82%,transparent)}
.hpz .hp-stat-wave-line,.hpz .hp-stat-wave-echo{fill:none;stroke-linejoin:round;stroke-linecap:round}
.hpz .hp-stat-wave-line{stroke:#E2C68F;stroke-width:1.5}
.hpz .hp-stat-wave-echo{stroke:#fff;stroke-opacity:.2;stroke-width:1.2}
.hpz .hp-stat-live{position:relative;flex:none;width:8px;height:8px;margin-right:4px}
.hpz .hp-stat-live::before,.hpz .hp-stat-live::after{content:"";position:absolute;inset:0;border-radius:50%}
.hpz .hp-stat-live::before{background:var(--live);box-shadow:0 0 12px rgba(61,220,151,.6)}
.hpz .hp-stat-live::after{border:1.5px solid var(--live);opacity:.3;transform:scale(2.1)}
.hpz .hp-stat-ten-ring{fill:rgba(255,255,255,.05);stroke:#fff;stroke-opacity:.24;stroke-width:1.2}
.hpz .hp-stat-ten-fill{fill:url(#hp-g-stten)}
.hpz .hp-stat-sheen{position:absolute;inset:0;z-index:2;pointer-events:none;display:none;background:linear-gradient(104deg,transparent 36%,rgba(241,223,181,.2) 47%,rgba(246,232,200,.35) 50%,rgba(241,223,181,.2) 53%,transparent 64%)}
/* Lichtschein folgt dem Zeiger über dem Band */
.hpz.hp-motion .hp-band::after{content:"";position:absolute;z-index:0;left:0;top:0;width:380px;height:380px;margin:-190px 0 0 -190px;pointer-events:none;background:radial-gradient(closest-side,rgba(216,189,138,.14),rgba(216,189,138,.05) 52%,transparent);transform:translate3d(var(--stat-mx,50%),var(--stat-my,50%),0);opacity:0;transition:opacity .5s var(--ease)}
.hpz.hp-motion .hp-band.is-hot::after{opacity:1}
/* Bewegung: die Grafiken bauen sich auf, sobald das Band sichtbar wird (.is-in), Schleifen nur solange sichtbar (.is-live) */
.hpz.hp-motion .hp-stat-dot{opacity:0;transition:opacity .55s var(--ease) calc(.2s + var(--sd) * 42ms)}
.hpz.hp-motion .is-in .hp-stat-dot{opacity:1}
.hpz.hp-motion .hp-stat-lit{opacity:0;transform:scale(.2);transform-box:fill-box;transform-origin:50% 50%;transition:transform .8s cubic-bezier(.3,1.5,.5,1) calc(.95s + var(--sk) * 140ms),opacity .4s linear calc(.95s + var(--sk) * 140ms)}
.hpz.hp-motion .is-in .hp-stat-lit{opacity:1;transform:none}
.hpz.hp-motion .hp-stat-lit-halo{animation:hp-stat-glow 3.8s ease-in-out calc(var(--sk) * -.8s) infinite;animation-play-state:paused}
.hpz.hp-motion .is-live .hp-stat-lit-halo{animation-play-state:running}
.hpz.hp-motion .hp-stat-bar{transform:scaleY(0);transform-box:fill-box;transform-origin:50% 100%;transition:transform .9s var(--ease) calc(.25s + var(--sd) * 58ms)}
.hpz.hp-motion .is-in .hp-stat-bar{transform:none}
.hpz.hp-motion .hp-stat-base{opacity:0;transition:opacity .6s var(--ease) .1s}
.hpz.hp-motion .is-in .hp-stat-base{opacity:1}
.hpz.hp-motion .hp-stat-wavebox,.hpz.hp-motion .hp-stat-live{opacity:0;transition:opacity .8s var(--ease) .7s}
.hpz.hp-motion .is-in .hp-stat-wavebox,.hpz.hp-motion .is-in .hp-stat-live{opacity:1}
.hpz.hp-motion .hp-stat-wave{animation:hp-stat-wave 6.5s linear infinite;animation-play-state:paused}
.hpz.hp-motion .is-live .hp-stat-wave{animation-play-state:running}
.hpz.hp-motion .hp-stat-live::after{animation:hp-stat-ring 2.4s cubic-bezier(.2,.6,.3,1) infinite;animation-play-state:paused}
.hpz.hp-motion .is-live .hp-stat-live::after{animation-play-state:running}
.hpz.hp-motion .hp-stat-ten{opacity:0;transform:scale(.25);transform-box:fill-box;transform-origin:50% 50%;transition:transform .6s cubic-bezier(.3,1.6,.5,1) calc(.55s + var(--sk) * 105ms),opacity .3s linear calc(.55s + var(--sk) * 105ms)}
.hpz.hp-motion .is-in .hp-stat-ten{opacity:1;transform:none}
.hpz.hp-motion .hp-stat-sheen{display:block;opacity:0;transform:translateX(-100%)}
.hpz.hp-motion .is-in .hp-stat-sheen{animation:hp-stat-sheen 1.7s cubic-bezier(.4,.1,.2,1) 1.45s both}
@keyframes hp-stat-wave{to{transform:translateX(-66px)}}
@keyframes hp-stat-ring{0%{transform:scale(1);opacity:.6}70%,100%{transform:scale(2.8);opacity:0}}
@keyframes hp-stat-glow{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes hp-stat-sheen{0%{opacity:1;transform:translateX(-100%)}100%{opacity:1;transform:translateX(100%)}}
@media (max-width:1080px){.hpz .hp-band__item{padding-inline:22px}.hpz .hp-stat-art{right:18px}}
@media (max-width:960px){.hpz .hp-band{grid-template-columns:repeat(2,minmax(0,1fr))}.hpz .hp-band__item:nth-child(3)::before{display:none}.hpz .hp-band__item:nth-child(n+3){border-top:1px solid rgba(255,255,255,.09)}.hpz .hp-band__item{padding-inline:24px}.hpz .hp-stat-art{right:20px}}
@media (max-width:560px){
  .hpz .hp-band{--stat-fs:clamp(31px,9.2vw,40px);grid-template-columns:minmax(0,1fr)}
  .hpz .hp-band__item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:14px;row-gap:6px;padding:22px 20px 22px 22px}
  .hpz .hp-band__item + .hp-band__item::before{display:none}
  .hpz .hp-band__item:nth-child(n+2){border-top:1px solid rgba(255,255,255,.09)}
  .hpz .hp-band__num{grid-column:1;grid-row:1}
  .hpz .hp-band__label{grid-column:1;grid-row:2;font-size:14px;max-width:none}
  .hpz .hp-stat-art{position:static;grid-column:2;grid-row:1 / 3;width:76px;height:38px}
  .hpz .hp-stat-art--pulse{gap:5px}
  .hpz .hp-stat-art .hp-stat-wavebox{width:57px;height:38px}
  .hpz .hp-stat-live{margin-right:2px}
}
@media (max-width:360px){.hpz .hp-band__item{padding-inline:18px 16px}.hpz .hp-stat-art{width:68px;height:34px}.hpz .hp-stat-art .hp-stat-wavebox{width:50px;height:34px}}

/* Film: Titelbild als Radar (Vorlage v2). Erscheint nur mit JavaScript; ein Klick blendet es aus und das Video läuft. */
@property --hp-cbeam{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes hp-cine-beam{to{--hp-cbeam:360deg}}
.hpz .hp-cine{container-type:inline-size;background:#050a18;--pad:clamp(14px,3.1cqw,34px)}
.hpz .hp-cine::before,.hpz .hp-cine::after{content:"";position:absolute;inset:0;z-index:6;padding:1px;border-radius:inherit;pointer-events:none;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.hpz .hp-cine::before{background:linear-gradient(150deg,rgba(255,255,255,.3),rgba(255,255,255,.08) 34%,rgba(255,255,255,.06) 64%,rgba(216,189,138,.28))}
.hpz .hp-cine::after{padding:1.5px;background:conic-gradient(from var(--hp-cbeam),transparent 0 66%,rgba(226,198,143,0) 66%,rgba(226,198,143,.6) 87%,#fff 97.5%,rgba(255,255,255,0) 100%)}
.hpz.hp-motion .hp-cine::after{animation:hp-cine-beam 9s linear infinite;animation-play-state:paused}
.hpz.hp-motion .hp-cine.is-live::after{animation-play-state:running}
.hpz .hp-cine.is-playing::after{opacity:.45}
.hpz .hp-cine{--cps:paused}
.hpz.hp-motion .hp-cine.is-live{--cps:running}
.hpz.hp-motion .hp-cine.is-live.is-playing{--cps:paused}
.hpz .hp-cine__poster{position:absolute;inset:0;z-index:2;overflow:hidden;color:#fff;cursor:pointer;--play:clamp(60px,7.4cqw,92px)}
.hpz .hp-cine.is-playing .hp-cine__poster{opacity:0;visibility:hidden;pointer-events:none}
.hpz.hp-motion .hp-cine__poster{transition:opacity .7s var(--ease),visibility 0s linear 0s}
.hpz.hp-motion .hp-cine.is-playing .hp-cine__poster{transition:opacity .6s var(--ease),visibility 0s linear .6s}
.hpz .hp-cine__stage,.hpz .hp-cine__bg,.hpz .hp-cine__layer,.hpz .hp-cine__scrim,.hpz .hp-cine__dots,.hpz .hp-cine__rings,.hpz .hp-cine__links{position:absolute;inset:0}
.hpz .hp-cine__stage{--s:max(5px,.62cqw)}
.hpz.hp-motion .hp-cine__stage{transition:transform 1s var(--ease)}
.hpz.hp-motion .hp-cine.is-playing .hp-cine__stage{transform:scale(1.045)}
.hpz .hp-cine__bg{background:radial-gradient(46% 64% at 50% 50%,rgba(30,56,120,.55),rgba(30,56,120,0) 72%),radial-gradient(60% 80% at 100% 100%,rgba(201,164,101,.16),rgba(201,164,101,0) 70%),radial-gradient(58% 82% at 0% 0%,rgba(74,91,140,.22),rgba(74,91,140,0) 66%),linear-gradient(165deg,#0d1834,#0b1530 55%,#0b1320)}
.hpz.hp-motion .hp-cine__layer{translate:calc(var(--px,0) * var(--k) * 1px) calc(var(--py,0) * var(--k) * .65px);transition:translate .8s var(--ease),transform 1.7s var(--ease),opacity 1.1s var(--ease) .15s}
.hpz.hp-motion .hp-cine:not(.is-io) .hp-cine__layer--far{opacity:0;transform:scale(.9)}
.hpz.hp-motion .hp-cine:not(.is-io) .hp-cine__layer--near{opacity:0;transform:scale(.96)}
.hpz.hp-motion .hp-cine__layer--near{transition-delay:0s,.2s,.55s}
.hpz .hp-cine__layer--far{--k:-5}
.hpz .hp-cine__layer--near{--k:-12}
.hpz .hp-cine__dots{background:radial-gradient(circle at center,rgba(207,214,228,.49) 0 .9px,transparent 1.5px) 50% 50%/22px 22px;-webkit-mask:radial-gradient(ellipse 60% 80% at 50% 50%,#000 10%,transparent 100%);mask:radial-gradient(ellipse 60% 80% at 50% 50%,#000 10%,transparent 100%)}
.hpz .hp-cine__rings,.hpz .hp-cine__links{width:100%;height:100%;max-width:none}
.hpz .hp-cine__rings circle,.hpz .hp-cine__rings path,.hpz .hp-cine__links path{fill:none;vector-effect:non-scaling-stroke}
.hpz .hp-cine__arcs path{stroke:#E2C68F;stroke-opacity:.62;stroke-width:1.5;stroke-linecap:round}
.hpz .hp-cine__links path{stroke:#D8BD8A;stroke-opacity:.24;stroke-width:1;stroke-dasharray:2 7;stroke-linejoin:round}
.hpz .hp-cine__ticks{position:absolute;left:50%;top:50%;width:35.75%;aspect-ratio:1;translate:-50% -50%;border-radius:50%}
.hpz .hp-cine__ticks::before,.hpz .hp-cine__ticks::after{content:"";position:absolute;inset:0;border-radius:50%}
.hpz .hp-cine__ticks::before{background:repeating-conic-gradient(from -.45deg,rgba(216,189,138,.52) 0 .4deg,transparent .9deg 3deg);-webkit-mask:radial-gradient(closest-side,transparent calc(100% - 6px),#000 calc(100% - 5.5px));mask:radial-gradient(closest-side,transparent calc(100% - 6px),#000 calc(100% - 5.5px))}
.hpz .hp-cine__ticks::after{background:repeating-conic-gradient(from -.5deg,rgba(233,211,162,.85) 0 .5deg,transparent 1deg 30deg);-webkit-mask:radial-gradient(closest-side,transparent calc(100% - 10px),#000 calc(100% - 9.5px));mask:radial-gradient(closest-side,transparent calc(100% - 10px),#000 calc(100% - 9.5px))}
.hpz .hp-cine__sweep{position:absolute;left:50%;top:50%;width:88%;aspect-ratio:1;translate:-50% -50%;border-radius:50%;transform:rotate(36deg);background:conic-gradient(from 0deg,rgba(226,198,143,0) 0 262deg,rgba(226,198,143,.07) 300deg,rgba(226,198,143,.2) 340deg,rgba(226,198,143,.42) 358.2deg,rgba(244,228,191,.78) 359.6deg,rgba(244,228,191,0) 360deg);-webkit-mask:radial-gradient(closest-side,#000 6%,#000 36%,transparent 100%);mask:radial-gradient(closest-side,#000 6%,#000 36%,transparent 100%)}
.hpz.hp-motion .hp-cine__sweep{animation:hp-cine-sweep 10s linear infinite;animation-play-state:var(--cps)}
@keyframes hp-cine-sweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.hpz .hp-cine__blip{position:absolute;left:var(--x);top:var(--y);width:0;height:0;--c:#E2C68F}
.hpz .hp-cine__blip--w{--c:#F4EFE6}
.hpz .hp-cine__blip::before,.hpz .hp-cine__blip::after{content:"";position:absolute;left:0;top:0;width:var(--s);aspect-ratio:1;border-radius:50%;translate:-50% -50%}
.hpz .hp-cine__blip::before{background:var(--c);opacity:.92;box-shadow:0 0 0 calc(var(--s) * .5) rgba(216,189,138,.13),0 0 calc(var(--s) * 2.6) rgba(216,189,138,.55)}
.hpz .hp-cine__blip::after{border:1px solid var(--c);opacity:.3;transform:scale(3.2)}
.hpz.hp-motion .hp-cine__blip::before{opacity:.4;animation:hp-cine-blink 10s linear infinite;animation-delay:var(--dl);animation-play-state:var(--cps)}
.hpz.hp-motion .hp-cine__blip::after{opacity:0;animation:hp-cine-ping 10s linear infinite;animation-delay:var(--dl);animation-play-state:var(--cps)}
@keyframes hp-cine-blink{0%{opacity:1;transform:scale(1.4)}4%{transform:scale(1.1)}24%{opacity:.7;transform:scale(1)}100%{opacity:.36;transform:scale(1)}}
@keyframes hp-cine-ping{0%{opacity:.9;transform:scale(1)}15%{opacity:0;transform:scale(6)}100%{opacity:0;transform:scale(6)}}
.hpz .hp-cine__scrim{background:linear-gradient(180deg,rgba(11,19,32,0) 52%,rgba(11,19,32,.88) 100%),radial-gradient(130% 130% at 50% 50%,transparent 58%,rgba(5,10,24,.6) 100%)}
.hpz .hp-cine__chip{position:absolute;left:var(--pad);top:var(--pad);z-index:3;display:inline-flex;align-items:center;gap:9px;padding:6px 14px 6px 11px;border:1px solid rgba(255,255,255,.17);border-radius:var(--pill);background:rgba(11,19,32,.52);box-shadow:inset 0 1px 0 rgba(255,255,255,.08);font-size:13px;font-weight:600;line-height:1.45;color:#F4EFE6}
.hpz .hp-cine__chip::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:#E2C68F;box-shadow:0 0 0 3px rgba(216,189,138,.18),0 0 10px rgba(216,189,138,.6)}
.hpz .hp-cine__play{position:absolute;left:50%;top:50%;z-index:3;display:grid;place-items:center;width:var(--play);aspect-ratio:1;margin:0;padding:0;border:0;border-radius:50%;background:none;color:inherit;cursor:pointer;translate:-50% -50%;-webkit-tap-highlight-color:transparent}
.hpz .hp-cine__play:focus-visible{outline:2px solid #E2C894;outline-offset:8px}
.hpz .hp-cine__disc{position:relative;display:grid;place-items:center;width:100%;height:100%;border-radius:50%;color:#1b1404;overflow:hidden;background:linear-gradient(150deg,#f3e2ba 0,#e2c894 38%,#c9a465 72%,#b08d57 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 -2px 8px rgba(142,108,48,.35),0 0 0 7px rgba(216,189,138,.12),0 22px 46px -14px rgba(216,189,138,.66),0 8px 18px -6px rgba(11,19,32,.65)}
.hpz .hp-cine__disc::before{content:"";position:absolute;inset:0 0 46% 0;border-radius:50% 50% 60% 60%/60% 60% 40% 40%;background:linear-gradient(180deg,rgba(255,255,255,.3),rgba(255,255,255,0))}
.hpz .hp-cine__disc svg{position:relative;width:36%;height:36%;margin-left:3%}
.hpz .hp-cine__ring{position:absolute;inset:0;border:1.5px solid #E2C894;border-radius:50%;opacity:.32;transform:scale(1.36)}
.hpz .hp-cine__ring--b{opacity:.15;transform:scale(1.78)}
.hpz.hp-motion .hp-cine__ring{opacity:0;animation:hp-cine-ring 3.6s var(--ease) infinite;animation-play-state:var(--cps)}
.hpz.hp-motion .hp-cine__ring--b{animation-delay:1.8s}
@keyframes hp-cine-ring{0%{opacity:.8;transform:scale(1)}80%,100%{opacity:0;transform:scale(2.1)}}
.hpz.hp-motion .hp-cine__disc{transition:transform .45s var(--ease)}
.hpz.hp-motion .hp-cine__play:active .hp-cine__disc{transform:scale(.96)}
@media (hover:hover){.hpz.hp-motion .hp-cine__poster:hover .hp-cine__disc{transform:scale(1.07)}}
.hpz .hp-cine__title{position:absolute;left:var(--pad);right:var(--pad);bottom:var(--pad);z-index:3;pointer-events:none;font-size:clamp(16px,2.35cqw,28px);font-weight:700;line-height:1.15;letter-spacing:-.025em;color:#fff}
.hpz .hp-cine__title b{font-weight:700;background:linear-gradient(90deg,#e9d3a2,#c9a363);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
@media (max-width:900px){.hpz .hp-cine__poster{--play:clamp(58px,9.4cqw,76px)}}
@media (max-width:640px){
  .hpz .hp-cine__chip{padding:4px 11px 4px 9px;gap:7px;font-size:11.5px}
  .hpz .hp-cine__chip::before{width:6px;height:6px}
  .hpz .hp-cine__dots{background-size:15px 15px}
  .hpz .hp-cine__ticks::before{background:repeating-conic-gradient(from -.8deg,rgba(216,189,138,.62) 0 .9deg,transparent 1.6deg 6deg);-webkit-mask:radial-gradient(closest-side,transparent calc(100% - 4px),#000 calc(100% - 3.5px));mask:radial-gradient(closest-side,transparent calc(100% - 4px),#000 calc(100% - 3.5px))}
  .hpz .hp-cine__ticks::after{background:repeating-conic-gradient(from -1deg,rgba(241,225,189,.9) 0 1.4deg,transparent 2.2deg 30deg);-webkit-mask:radial-gradient(closest-side,transparent calc(100% - 7px),#000 calc(100% - 6.5px));mask:radial-gradient(closest-side,transparent calc(100% - 7px),#000 calc(100% - 6.5px))}
  .hpz .hp-cine__disc{box-shadow:inset 0 1px 0 rgba(255,255,255,.72),inset 0 -2px 6px rgba(142,108,48,.45),0 0 0 5px rgba(216,189,138,.12),0 14px 30px -12px rgba(216,189,138,.66),0 6px 14px -6px rgba(11,19,32,.65)}
}

/* Probe-Karte: Rahmen wie Vorlage v2 (feine helle Kante, Lichtlauf in Gold und Weiß, goldener Schein); Inhalt unverändert */
.hpz .hp-formcard{border:1px solid rgba(255,255,255,.11);border-radius:22px;box-shadow:0 50px 100px -50px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.12),0 0 70px -30px rgba(226,198,143,.2)}
.hpz .hp-formcard::before{inset:-1px;padding:1px;background:conic-gradient(from var(--beam),transparent 0 72%,rgba(226,198,143,0) 72%,#E2C68F 90%,#fff 97%,rgba(255,255,255,0) 100%);animation:none}
.hpz.hp-motion .hp-formcard::before{animation:hp-beam-spin 8s linear infinite;animation-play-state:paused}
.hpz.hp-motion .hp-formcard.is-live::before{animation-play-state:running;will-change:transform}
/* Kennzahlen-Überschrift wie „How it works in 51 seconds“ (Inhaber 03.10.2026) */
.hpz .hp-proof__rule{margin:0 0 18px}
`;

