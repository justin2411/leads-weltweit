// Branchen-Film: Szenen je Satz-ID, Texte aus CFG.ui (Branche) und UI (Sprache).
const T = window.TIMING, CFG = window.CFG;
const L = Object.fromEntries(T.lines.map(l => [l.id, l]));
const UI = ({
  en: { newlead: "New lead", phone: "Phone", email: "Company email", excl: "🔒  One lead · one firm per industry", monday: "📬  Every Monday · 07:00", nosoft: "✓  No software · no setup",
    illus: "Illustration, no figures", illex: "Illustrative example", ten: "10 free leads", area: "for your area", btn: "Get my sample", tag: "The right companies, at the right moment." },
  fr: { newlead: "Nouvelle piste", phone: "Téléphone", email: "E-mail de l'entreprise", excl: "🔒  Une piste · une entreprise par secteur", monday: "📬  Chaque lundi · 07:00", nosoft: "✓  Sans logiciel · sans installation",
    illus: "Illustration, sans chiffres", illex: "Exemple illustratif", ten: "10 pistes gratuites", area: "pour votre zone", btn: "Recevoir mon échantillon", tag: "Les bonnes entreprises, au bon moment." },
  de: { newlead: "Neuer Lead", phone: "Telefon", email: "Firmen-E-Mail", excl: "🔒  Ein Lead · ein Unternehmen je Branche", monday: "📬  Jeden Montag · 07:00", nosoft: "✓  Keine Software · keine Einrichtung",
    illus: "Veranschaulichung, keine Zahlen", illex: "Beispiel zur Veranschaulichung", ten: "10 kostenlose Leads", area: "für Ihre Region", btn: "Probe anfordern", tag: "Die richtigen Unternehmen, im richtigen Moment." },
})[CFG.lang || "en"];
const U = CFG.ui;
document.querySelectorAll("[data-i]").forEach(e => { e.innerHTML = UI[e.dataset.i]; });
document.querySelectorAll("[data-u]").forEach(e => { e.innerHTML = U[e.dataset.u]; });

const $ = id => document.getElementById(id);
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const p = (t, a, d) => cl((t - a) / d);
const eio = x => { x = cl(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eo = x => 1 - Math.pow(1 - cl(x), 3);
const back = x => { x = cl(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;
const type = (s, k) => { const n = Math.floor(s.length * cl(k)); return s.slice(0, n) + (k > 0 && k < 1 ? "▍" : ""); };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const NS = "http://www.w3.org/2000/svg";
const mk = (svg, tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); $(svg).appendChild(e); return e; };
const div = (parent, cls, html = "") => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; $(parent).appendChild(d); return d; };
const scaleAt = (el, x, y, s) => el.setAttribute("transform", `translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`);

const ids = ["hook", "tension", "brand", "lead", "exclusive", "weekly", "revenue", "cta", "end"], sc = ["A", "B", "C", "D", "E", "F", "R", "G", "H"];
const win = sc.map((s, i) => [s, i ? L[ids[i]].start - 0.45 : 0, i < sc.length - 1 ? L[ids[i + 1]].start - 0.45 : T.total + 1]);

// A: Firmen tauchen rund um die Branche auf, zwei leuchten
const C0 = { x: 960, y: 505 };
const cos = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + rnd() * .3, r = 330 + rnd() * 170;
  const x = C0.x + Math.cos(a) * r * 1.5, y = C0.y + Math.sin(a) * r * .55;
  cos.push({ x, y, at: .4 + rnd() * 1.6, hot: i === 1 || i === 9, c: mk("A_svg", "rect", { x: x - 16, y: y - 16, width: 32, height: 32, rx: 8, fill: "#2d4674" }),
    ring: mk("A_svg", "circle", { cx: x, cy: y, r: 0, fill: "none", stroke: "#d8bd8a", "stroke-width": 3 }), ln: mk("A_svg", "line", { x1: C0.x, y1: C0.y, x2: x, y2: y, stroke: "rgba(216,189,138,.5)", "stroke-width": 2, "stroke-dasharray": "6 8", opacity: 0 }) }); }
// B: drei Signale der Branche
const SIGX = [420, 960, 1500];
mk("B_svg", "line", { x1: 200, y1: 640, x2: 1720, y2: 640, stroke: "#2a3d63", "stroke-width": 6, "stroke-linecap": "round" });
const bProg = mk("B_svg", "line", { x1: 200, y1: 640, x2: 200, y2: 640, stroke: "#d8bd8a", "stroke-width": 6, "stroke-linecap": "round" });
const sigs = U.sig.map((s, i) => { const d = div("B_sig", "abs", `<div class="lc" style="position:relative;width:460px;text-align:center;padding:32px 26px"><div style="font-size:64px">${s[0]}</div><div style="font-size:34px;font-weight:800;margin-top:10px">${s[1]}</div><div style="font-size:23px;color:var(--soft);margin-top:8px;line-height:1.35">${s[2]}</div></div>`);
  d.style.left = (SIGX[i] - 230) + "px"; d.style.top = "250px";
  return { d, x: SIGX[i], dot: mk("B_svg", "circle", { cx: SIGX[i], cy: 640, r: 0, fill: "#d8bd8a" }), ring: mk("B_svg", "circle", { cx: SIGX[i], cy: 640, r: 0, fill: "none", stroke: "#f3e1b9", "stroke-width": 3 }), i }; });
// C
const cBurst = [0, 1, 2].map(() => mk("C_svg", "circle", { cx: 960, cy: 520, r: 0, fill: "none", stroke: "#d8bd8a", "stroke-width": 3 }));
// E: ein Lead, eine Firma
const EC = { x: 960, y: 470 };
const FIRMS = [[330, 250], [330, 690], [1590, 250], [1590, 690], [960, 800]];
const eFirms = FIRMS.map(([x, y], i) => { const d = div("E_firms", "abs", `<div style="font-size:64px;text-align:center">🏢</div>`); d.style.left = (x - 50) + "px"; d.style.top = (y - 50) + "px"; d.style.width = "100px";
  const ln = mk("E_svg", "line", { x1: EC.x, y1: EC.y, x2: x, y2: y, stroke: "#3a4f78", "stroke-width": 3, "stroke-dasharray": "8 10" });
  const x2 = mk("E_svg", "text", { x: lerp(EC.x, x, .55), y: lerp(EC.y, y, .55) + 14, "text-anchor": "middle", "font-size": 40, fill: "#e88080", opacity: 0 }); x2.textContent = "✕";
  return { d, ln, x2, x, y, win: i === 0 }; });
// F: vier Wochen, jeden Montag ein Umschlag (mittig)
const weeks = [0, 1, 2, 3].map(w => { const row = div("F_cal", "abs", ""); row.style.left = "600px"; row.style.top = (250 + w * 140) + "px"; row.style.display = "flex"; row.style.gap = "14px";
  const cells = [0, 1, 2, 3, 4].map(d => { const c = document.createElement("div"); Object.assign(c.style, { width: "130px", height: "110px", borderRadius: "16px", background: d === 0 ? "rgba(216,189,138,.14)" : "#0f1d38", border: d === 0 ? "2px solid rgba(216,189,138,.6)" : "1px solid #22375f", position: "relative" });
    row.appendChild(c); return c; });
  const env = document.createElement("div"); env.textContent = "✉️"; Object.assign(env.style, { position: "absolute", left: "38px", top: "20px", fontSize: "56px" }); cells[0].appendChild(env);
  return { row, env, w }; });
// R: drei Wertpunkte und steigende Linie
const rPts = [[260, 930], [560, 880], [860, 820], [1160, 720], [1460, 650], [1700, 540]];
const rPath = mk("R_svg", "path", { d: "M" + rPts.map(q => q.join(" ")).join(" L"), fill: "none", stroke: "#d8bd8a", "stroke-width": 8, "stroke-linecap": "round", "stroke-linejoin": "round" });
const rLen = rPath.getTotalLength(); rPath.setAttribute("stroke-dasharray", rLen);
const rArea = mk("R_svg", "path", { d: "M" + rPts.map(q => q.join(" ")).join(" L") + " L1700 990 L260 990 Z", fill: "rgba(216,189,138,.07)" });
const rHead = mk("R_svg", "circle", { r: 14, fill: "#f3e1b9" });
const rVals = U.vals.map((v, i) => { const d = div("R_vals", "abs chip" + (i === 2 ? " ok" : ""), v); d.style.left = (180 + i * 180) + "px"; d.style.top = (140 + i * 120) + "px"; d.style.fontSize = "36px"; d.style.padding = "18px 32px"; return d; });
// G
const parts = []; for (let i = 0; i < 34; i++) { const d = div("G_parts", "abs"); const s = 8 + rnd() * 10;
  Object.assign(d.style, { width: s + "px", height: s + "px", borderRadius: rnd() > .5 ? "50%" : "3px", background: ["#d8bd8a", "#f3e1b9", "#5fd3a3", "#ffffff"][i % 4] }); parts.push({ d, a: rnd() * Math.PI * 2, v: 260 + rnd() * 360, rot: rnd() * 720 }); }

function render(t) {
  for (const [s, a, b] of win) { const el = $(s); const o = Math.min(p(t, a, .45), 1 - p(t, b - .45, .45)); el.style.opacity = o; el.style.display = o > 0 ? "block" : "none"; }
  $("bg").style.setProperty("--gx", (55 + 12 * Math.sin(t * .15)) + "%"); $("bg").style.setProperty("--gy", (30 + 10 * Math.cos(t * .12)) + "%");
  $("dots").style.transform = `translate(${-(t * 10) % 48}px, ${-(t * 5) % 48}px)`;

  // A
  const a0 = L.hook.start - .3;
  $("A_for").style.opacity = eo(p(t, a0, .5)); $("A_for").style.transform = `translateY(${(1 - eo(p(t, a0, .5))) * -30}px)`;
  const ic = back(p(t, a0 + .2, .8)); $("A_icon").style.transform = `scale(${ic * (1 + .03 * Math.sin(t * 3))})`; $("A_icon").style.opacity = cl(ic);
  const hot = p(t, a0 + 2.4, .5);
  cos.forEach(o => { const k = back(p(t, a0 + o.at, .5)); scaleAt(o.c, o.x, o.y, k); o.c.setAttribute("opacity", cl(k));
    if (o.hot) { o.c.setAttribute("fill", hot > 0 ? "#d8bd8a" : "#2d4674"); o.ln.setAttribute("opacity", eo(hot)); o.ln.setAttribute("stroke-dashoffset", -t * 30);
      const rr = ((t - a0) % 1.3) / 1.3; o.ring.setAttribute("r", 16 + rr * 50); o.ring.setAttribute("opacity", hot > 0 ? 1 - rr : 0); } });
  $("A_first").style.opacity = eo(p(t, a0 + 3.0, .5));

  // B
  const b0 = L.tension.start - .3, bd = L.tension.end - L.tension.start;
  bProg.setAttribute("x2", lerp(200, 1720, eio(p(t, b0 + .2, bd))));
  sigs.forEach(s => { const at = b0 + .3 + s.i * bd / 3.2; const k = back(p(t, at, .6));
    s.d.style.opacity = cl(k); s.d.style.transform = `translateY(${(1 - eo(p(t, at, .6))) * 60}px) scale(${lerp(.85, 1, cl(k))})`;
    s.dot.setAttribute("r", 18 * back(p(t, at + .2, .5))); const rr = ((t - at) % 1.4) / 1.4; s.ring.setAttribute("r", 18 + rr * 50); s.ring.setAttribute("opacity", t > at ? 1 - rr : 0); });

  // Blitz und Marke
  const fl = p(t, L.brand.start - .5, .5); $("flash").style.opacity = fl > 0 && fl < 1 ? .25 * (1 - fl) : 0;
  const c0 = L.brand.start - .4;
  $("C1").style.transform = `translateY(${(1 - eo(p(t, c0 + .2, .7))) * 150}px)`; $("C2").style.transform = `translateY(${(1 - eo(p(t, c0 + .38, .7))) * 150}px)`;
  cBurst.forEach((c, i) => { const k = p(t, c0 + .3 + i * .25, 1.4); c.setAttribute("r", 80 + k * 600); c.setAttribute("opacity", k > 0 && k < 1 ? (1 - k) * .8 : 0); });

  // D: Lead-Karte baut sich auf
  const d0 = L.lead.start - .3, dd = L.lead.end - L.lead.start;
  const ck = eo(p(t, d0, .7)); $("D_card").style.opacity = ck; $("D_card").style.transform = `translateY(${(1 - ck) * 60}px) scale(${lerp(.94, 1, ck)})`;
  [0, 1, 2, 3].forEach(i => { const k = p(t, d0 + .6 + i * dd / 9, .4); $("D_f" + i).style.opacity = eo(k); $("D_f" + i).querySelector("b").style.transform = `scale(${back(k)})`; });
  $("D_op").textContent = type("“" + U.opener + "”", p(t, d0 + .6 + 4 * dd / 9, Math.max(1.5, dd * .45)));

  // E
  const e0 = L.exclusive.start - .3; const ek = back(p(t, e0, .7));
  Object.assign($("E_lead").style, { left: (EC.x - 190) + "px", top: (EC.y - 80) + "px", transform: `scale(${ek})`, opacity: cl(ek) });
  const pick = p(t, e0 + 1.8, .8);
  eFirms.forEach((f, i) => { const k = back(p(t, e0 + .3 + i * .12, .5)); f.d.style.transform = `scale(${k})`; f.d.style.opacity = cl(k);
    f.ln.setAttribute("opacity", eo(p(t, e0 + .7, .5)));
    if (f.win) { f.ln.setAttribute("stroke", pick > 0 ? "#d8bd8a" : "#3a4f78"); f.ln.setAttribute("stroke-width", pick > 0 ? 6 : 3); f.ln.setAttribute("stroke-dasharray", pick > 0 ? "none" : "8 10");
      f.d.style.filter = pick > 0 ? "drop-shadow(0 0 30px rgba(216,189,138,.8))" : "none"; }
    else { f.x2.setAttribute("opacity", eo(p(t, e0 + 2.0 + i * .1, .4))); f.d.style.opacity = cl(k) * (1 - .6 * eo(p(t, e0 + 2.0, .6))); } });
  const fly = eio(p(t, e0 + 3.0, 1.0)); if (fly > 0) Object.assign($("E_lead").style, { left: lerp(EC.x - 190, FIRMS[0][0] + 70, fly) + "px", top: lerp(EC.y - 80, FIRMS[0][1] - 90, fly) + "px", transform: `scale(${lerp(1, .6, fly)})` });
  $("E_lock").style.transform = `scale(${1 + .15 * Math.sin(t * 5)})`;
  $("E_tag").style.opacity = eo(p(t, e0 + 1.2, .5));

  // F
  const f0 = L.weekly.start - .3; $("F_mon").style.opacity = eo(p(t, f0, .5));
  weeks.forEach(w => { const k = eo(p(t, f0 + .2 + w.w * .15, .5)); w.row.style.opacity = k; w.row.style.transform = `translateY(${(1 - k) * 30}px)`;
    const dk = p(t, f0 + .9 + w.w * .5, .5); w.env.style.transform = `translateY(${(1 - eo(dk)) * -120}px) scale(${back(dk)})`; w.env.style.opacity = cl(dk * 2); });
  $("F_easy").style.opacity = eo(p(t, f0 + 3.0, .5));

  // R
  const r0 = L.revenue.start - .3, rd = L.revenue.end - L.revenue.start;
  rVals.forEach((d, i) => { const k = back(p(t, r0 + i * rd / 3.5, .6)); d.style.transform = `scale(${k})`; d.style.opacity = cl(k); });
  const rk = eio(p(t, r0 + .6, rd)); rPath.setAttribute("stroke-dashoffset", rLen * (1 - rk)); rArea.setAttribute("opacity", rk);
  const hp = rPath.getPointAtLength(rLen * rk); rHead.setAttribute("cx", hp.x); rHead.setAttribute("cy", hp.y); rHead.setAttribute("r", 12 + 3 * Math.sin(t * 6)); rHead.setAttribute("opacity", rk > 0 ? 1 : 0);

  // G
  const g0 = L.cta.start - .3; const gb = back(p(t, g0, .7)); $("G_big").style.transform = `scale(${gb})`; $("G_big").style.opacity = cl(gb);
  $("G_sub").style.opacity = eo(p(t, g0 + .5, .5));
  const btn = eo(p(t, g0 + .9, .5)); $("G_btn").style.opacity = btn; const tap = g0 + 2.4;
  $("G_btn").style.transform = t > tap && t < tap + .15 ? "scale(.95)" : `scale(${t < tap ? 1 + .03 * Math.sin(t * 7) : 1})`;
  $("G_path").setAttribute("stroke-dashoffset", 40 * (1 - eio(p(t, tap + .1, .5))));
  parts.forEach(q => { const k = p(t, tap + .1, 1.3); const d = q.v * eo(k); Object.assign(q.d.style, { left: (960 + Math.cos(q.a) * d) + "px", top: (700 + Math.sin(q.a) * d + 160 * k * k) + "px", opacity: k > 0 ? 1 - k : 0, transform: `rotate(${q.rot * k}deg)` }); });

  // H
  const h0 = L.end.start - .3; $("H1").style.transform = `translateY(${(1 - eo(p(t, h0, .7))) * 140}px)`; $("H2").style.transform = `translateY(${(1 - eo(p(t, h0 + .18, .7))) * 140}px)`;
  $("H_tag").style.opacity = eo(p(t, h0 + 1.0, .6)); $("H_url").style.opacity = eo(p(t, h0 + 1.6, .6));
}
window.render = render;
