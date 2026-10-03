/**
 * Kontaktseite (Inhaber 03.10.2026): Formular auf der dunklen Karte der Startseite (.hp-formcard, Regeln aus
 * home-css.ts / home-v2-css.ts), rechts die Ansprechpartner-Karte im Stil der Startseiten-Grafik ([data-tune]).
 */
export const CONTACT_CSS = `
.hpz .ct{padding:96px 0 110px}
.hpz .ct-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);gap:28px;align-items:start}
.hpz .ct .hp-formcard{scroll-margin-top:90px}
.hpz .hp-formcard .pf textarea{width:100%;min-height:110px;padding:14px 16px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background-color:rgba(255,255,255,.06);font:inherit;font-size:15.5px;font-weight:400;line-height:1.5;color:#fff;resize:vertical;transition:border-color .25s,background-color .25s,box-shadow .25s}
.hpz .hp-formcard .pf textarea:hover{border-color:rgba(255,255,255,.26)}
.hpz .hp-formcard .pf textarea:focus{outline:none;border-color:var(--gold);background-color:rgba(255,255,255,.09);box-shadow:0 0 0 4px rgba(216,189,138,.18),0 0 30px -6px rgba(216,189,138,.45)}
.hpz .hp-formcard .pf textarea::placeholder{color:#7F8AA4}
.hpz .hp-formcard > .pf-err{margin-top:22px}

.hpz .ct-side{display:grid;gap:22px;padding:6px 0 0 14px;min-width:0}
.hpz .ct-card{position:relative;isolation:isolate;margin:0;padding:24px;border-radius:var(--r-xl);color:#fff;overflow:hidden;
  background:radial-gradient(420px 240px at 100% 0%,rgba(216,189,138,.17),transparent 70%),linear-gradient(170deg,#132A5F,var(--navy-900) 72%);
  box-shadow:0 60px 110px -50px rgba(14,26,51,.75),inset 0 1px 0 rgba(255,255,255,.08)}
.hpz .ct-card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:1;
  background:linear-gradient(140deg,rgba(226,200,148,.6),rgba(255,255,255,.07) 40%,rgba(255,255,255,.03) 70%,rgba(226,200,148,.3));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.hpz .ct-card::after{content:"";position:absolute;right:-90px;bottom:-110px;z-index:-1;width:300px;height:300px;border-radius:50%;background:radial-gradient(closest-side,rgba(216,189,138,.14),transparent);pointer-events:none}

.hpz .ct-who{display:grid;grid-template-columns:56px minmax(0,1fr);gap:14px;align-items:center;padding:16px 18px 16px 16px;border-radius:18px;
  background:linear-gradient(180deg,#FBF8F1,#F1EBDF);color:var(--text);box-shadow:0 26px 44px -28px rgba(0,0,0,.85),inset 0 1px 0 #fff}
.hpz .ct-av{position:relative;display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--navy-900);
  font-size:17px;font-weight:800;letter-spacing:-.04em;color:#fff;box-shadow:0 0 0 2px #F8F4EC,0 0 0 4px var(--gold)}
.hpz .ct-av span{color:var(--gold)}
.hpz .ct-av::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:1.5px solid var(--gold);opacity:0}
.hpz .ct-name{display:block;font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
.hpz .ct-role{display:block;margin-top:1px;font-size:13.5px;color:var(--muted)}
.hpz .ct-badge{display:inline-flex;align-items:center;gap:7px;margin-top:8px;padding:3px 10px 3px 8px;border:1px solid rgba(14,26,51,.12);border-radius:var(--pill);background:#fff;font-size:11.5px;font-weight:600;color:var(--ink)}
.hpz .ct-badge i{width:7px;height:7px;border-radius:50%;background:var(--live);box-shadow:0 0 0 3px rgba(59,209,138,.18)}

.hpz .ct-chat{position:relative;display:grid;gap:10px;margin-top:20px}
.hpz .ct-ex{justify-self:center;padding:2px 10px;border:1px solid rgba(255,255,255,.14);border-radius:var(--pill);font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--on-dark-3)}
.hpz .ct-msg{max-width:86%;padding:11px 14px 12px;border-radius:16px;font-size:14.5px;line-height:1.5}
.hpz .ct-msg b{display:block;margin-bottom:3px;font-size:10.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
.hpz .ct-msg--you{justify-self:end;border:1px solid rgba(255,255,255,.13);border-bottom-right-radius:6px;background:rgba(255,255,255,.07);color:#E9EDF5}
.hpz .ct-msg--you b{color:var(--on-dark-3)}
.hpz .ct-msg--np{border:1px solid rgba(226,200,148,.38);border-bottom-left-radius:6px;background:linear-gradient(135deg,rgba(226,200,148,.2),rgba(176,141,87,.08));color:#fff}
.hpz .ct-msg--np b{color:var(--gold-soft)}
.hpz .ct-reply{display:grid;justify-items:start}
.hpz .ct-reply > *{grid-area:1 / 1}
.hpz .ct-typing{display:none}

.hpz .ct-steps-h{display:flex;align-items:center;gap:14px;margin-top:24px;font-size:11.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-soft)}
.hpz .ct-steps-h::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(226,198,143,.45),rgba(226,198,143,.04))}
.hpz .ct-steps{position:relative;display:grid;gap:2px;margin:12px 0 0;padding:0;list-style:none}
.hpz .ct-steps::before,.hpz .ct-steps::after{content:"";position:absolute;left:18px;top:28px;bottom:28px;width:1px;background:linear-gradient(180deg,var(--gold),rgba(216,189,138,.25))}
.hpz .ct-steps::after{display:none;background:var(--gold-hi);transform-origin:top;transform:scaleY(var(--p,0));transition:transform .8s var(--ease-out);box-shadow:0 0 10px rgba(226,200,148,.6)}
.hpz .ct-steps li{position:relative;display:grid;grid-template-columns:37px minmax(0,1fr);gap:14px;align-items:start;padding:9px 0;transition:opacity .5s var(--ease)}
.hpz .ct-num{position:relative;z-index:1;display:grid;place-items:center;width:37px;height:37px;border:1px solid rgba(226,200,148,.5);border-radius:50%;
  background:radial-gradient(circle at 30% 25%,#1b2f63,var(--navy-900));color:var(--gold-hi);transition:background .45s,color .45s,box-shadow .45s,border-color .45s}
.hpz .ct-num svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hpz .ct-steps h3{padding-top:1px;font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:#fff}
.hpz .ct-steps h3 small{margin-right:8px;font-size:12px;font-weight:700;color:var(--gold-soft);font-variant-numeric:tabular-nums}
.hpz .ct-steps p{margin-top:2px;font-size:14px;line-height:1.5;color:var(--on-dark-2)}

/* Bewegung nur mit .is-anim (ContactFx, ohne reduzierte Bewegung) */
.hpz .ct-card.is-anim .ct-steps::after{display:block}
.hpz .ct-card.is-anim .ct-steps li{opacity:.5}
.hpz .ct-card.is-anim .ct-steps li.is-done,.hpz .ct-card.is-anim .ct-steps li.is-on{opacity:1}
.hpz .ct-card.is-anim .ct-steps li.is-on .ct-num{border-color:transparent;background:var(--grad-gold);color:#141008;box-shadow:0 0 0 5px rgba(226,200,148,.14),0 10px 26px -8px rgba(216,189,138,.75)}
.hpz .ct-card.is-anim .ct-av::after{animation:ct-ping 2.8s var(--ease-out) infinite}
.hpz .ct-card.is-anim .ct-msg--you{animation:ct-in .6s var(--ease-out) .2s both}
.hpz .ct-card.is-anim .ct-typing{display:flex;align-self:start;gap:4px;padding:12px 14px;border:1px solid rgba(226,200,148,.3);border-radius:16px;border-bottom-left-radius:6px;background:rgba(226,200,148,.1);
  animation:ct-typing 1.3s linear .8s both}
.hpz .ct-typing i{width:6px;height:6px;border-radius:50%;background:var(--gold-soft);animation:ct-dot 1s ease-in-out infinite}
.hpz .ct-typing i:nth-child(2){animation-delay:.15s}
.hpz .ct-typing i:nth-child(3){animation-delay:.3s}
.hpz .ct-card.is-anim .ct-msg--np{animation:ct-in .6s var(--ease-out) 2.1s both}
@keyframes ct-in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
@keyframes ct-typing{0%{opacity:0}15%,85%{opacity:1}100%{opacity:0}}
@keyframes ct-dot{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
@keyframes ct-ping{0%{opacity:.7;transform:scale(1)}70%,100%{opacity:0;transform:scale(1.35)}}
@media (prefers-reduced-motion:reduce){.hpz .ct-card *,.hpz .ct-card *::after{animation:none!important;transition:none!important}}

.hpz .ct-mail{display:grid;grid-template-columns:44px minmax(0,1fr);gap:14px;align-items:start;padding:18px 20px;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--paper);box-shadow:var(--shadow-card)}
.hpz .ct-mail__ico{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(176,141,87,.45);border-radius:50%;background:radial-gradient(circle at 30% 25%,rgba(226,200,148,.3),rgba(226,200,148,.05));color:var(--gold-deep)}
.hpz .ct-mail__ico svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hpz .ct-mail h3{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep)}
.hpz .ct-mail a{display:inline-block;margin-top:4px;font-size:16.5px;font-weight:700;color:var(--ink);text-decoration:none;overflow-wrap:anywhere}
.hpz .ct-mail a:hover{text-decoration:underline;text-underline-offset:3px}
.hpz .ct-mail address{margin-top:4px;font-style:normal;font-size:13.5px;line-height:1.5;color:var(--muted)}

@media (max-width:1060px){.hpz .ct-grid{grid-template-columns:minmax(0,1fr);gap:40px}
  .hpz .ct-side{padding:0;max-width:640px}}
@media (max-width:720px){.hpz .ct{padding:64px 0 72px}
  .hpz .ct-card{padding:16px}
  .hpz .ct-who{padding:14px}
  .hpz .ct-msg{max-width:94%}
  .hpz .hp-formcard .pf-row{grid-template-columns:minmax(0,1fr)}}
`;
