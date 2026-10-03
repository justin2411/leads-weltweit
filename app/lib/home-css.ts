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
.hpz .hp-sec.hp-faq{background:var(--cream);border-top:1px solid #e6dfcf;color:var(--text)}
.hpz .hp-wrap--narrow{max-width:calc(760px + 2 * var(--gutter))}
.hpz .hp-faq .hp-h2{margin-bottom:26px}
.hpz .hp-qa{margin:0;padding:0;border:0;border-bottom:1px solid #ddd3bf;border-radius:0;background:none;box-shadow:none}
.hpz .hp-qa:first-of-type{border-top:1px solid #ddd3bf}
.hpz .hp-qa summary{display:flex;align-items:center;gap:20px;padding:22px 0;list-style:none;font-size:17.5px;font-weight:700;line-height:1.4;color:var(--ink);cursor:pointer;transition:color .2s}
.hpz .hp-qa summary::-webkit-details-marker{display:none}
.hpz .hp-qa summary:hover{color:var(--gold-deep)}
.hpz .hp-qa__ic{width:20px;height:20px;margin-left:auto;color:var(--gold-lo);transition:transform .35s var(--ease)}
.hpz .hp-qa[open] .hp-qa__ic{transform:rotate(45deg)}
.hpz .hp-qa__a{max-width:62ch;padding:0 40px 24px 0;font-size:16px;line-height:1.7;color:var(--muted)}
.hpz .hp-qa[open] .hp-qa__a{animation:hp-rise .4s var(--ease)}
@keyframes hp-rise{from{opacity:0;translate:0 14px}}
.hpz .hp-faq__more{margin-top:26px;font-size:16px;color:var(--muted)}
.hpz .hp-faq__more a{color:var(--gold-deep);font-weight:600;text-underline-offset:3px;overflow-wrap:anywhere}
@media (max-width:720px){.hpz .hp-qa__a{padding-right:0}}
@media (prefers-reduced-motion:reduce){.hpz .hp-qa[open] .hp-qa__a{animation:none}.hpz .hp-qa__ic{transition:none}}

/* Länderwechsel: Lichtwelle nicht am Kartenrand abschneiden (Inhaber 03.10.2026) */
.js .hpz .hp-map svg{clip-path:inset(-60% -60% 160% -60%)}
.is-ready .hpz .hp-map svg{clip-path:inset(-60%)}
@media (prefers-reduced-motion:reduce){.js .hpz .hp-map svg,.is-ready .hpz .hp-map svg{clip-path:none}}
/* Kennzahlen enger an den Film (Inhaber 03.10.2026): ~40px über der Überschrift, ~56px unter der Fußnote */
.hpz section.hp-film{padding-bottom:88px;overflow-x:clip;overflow-y:visible;position:relative;z-index:1}
.hpz section.hp-proofsec{padding:0}
.hpz .hp-proofsec .hp-proof{padding-block:0 56px}
@media (max-width:720px){.hpz section.hp-film{padding-bottom:56px}.hpz .hp-proofsec .hp-proof{padding-block:0 40px}}
`;

