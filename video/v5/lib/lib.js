// Version 5: gemeinsame Helfer für alle Branchenfilme (deterministisch, Bild für Bild über render(t)).
// Jeder Film setzt window.SCENES = [[sceneId, ersteSatzId, {ill:true}], ...] und window.film = t => {...}.
// Texte kommen aus CFG.ui (segments.py), Zeiten aus TIMING (vo.py). Die Schlussszene "END" liefert diese Datei.
const T = window.TIMING, CFG = window.CFG, U = CFG.ui;
const L = Object.fromEntries(T.lines.map(l => [l.id, l]));
const $ = id => document.getElementById(id);
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const p = (t, a, d) => cl((t - a) / d);
const eio = x => { x = cl(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eo = x => 1 - Math.pow(1 - cl(x), 3);
const eo5 = x => 1 - Math.pow(1 - cl(x), 5);
const back = x => { x = cl(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;
const type = (s, k) => { const n = Math.floor(s.length * cl(k)); return s.slice(0, n) + (k > 0 && k < 1 ? "▍" : ""); };
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const NS = "http://www.w3.org/2000/svg";
const mk = (par, tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (typeof par === "string" ? $(par) : par).appendChild(e); return e; };
const div = (par, cls, html = "", style = {}) => { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; Object.assign(d.style, style); (typeof par === "string" ? $(par) : par).appendChild(d); return d; };
const scaleAt = (el, x, y, s) => el.setAttribute("transform", `translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`);
const st = (el, o) => Object.assign((typeof el === "string" ? $(el) : el).style, o);
// Einblenden mit Versatz (dy/dx in px)
const reveal = (el, k, dy = 30, dx = 0) => st(el, { opacity: cl(k), transform: `translate(${(1 - eo(k)) * dx}px, ${(1 - eo(k)) * dy}px)` });
// Anteil innerhalb eines gesprochenen Satzes (0 = Beginn, 1 = Ende)
const at = (id, f = 0) => L[id].start + (L[id].end - L[id].start) * f;
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

// Linien-Icons (24er Raster, Kontur)
const P = {
  bank: "M3 21h18M4 10h16M12 3l9 5H3zM6 10v8M10 10v8M14 10v8M18 10v8",
  briefcase: "M3 8h18v11H3zM9 8V5h6v3M3 13h18",
  coins: "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0zM12 6.5v11M15 9.4c-.5-1-1.6-1.4-3-1.4-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.6-.6-3-1.6",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  users: "M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0zM1 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1M16 3.2a4 4 0 0 1 0 7.6M20 14.3a6 6 0 0 1 3 5.7v1",
  user: "M16 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0zM4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1",
  store: "M3 9l2-5h14l2 5M3 9h18M4 9v11h16V9M9 20v-6h6v6",
  search: "M18 11a7 7 0 1 1-14 0a7 7 0 1 1 14 0zM21 21l-5-5",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  globe: "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9",
  cal: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  clock: "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0zM12 7v5l3 2",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  check: "M5 12.5l4.5 4.5L19 7",
  file: "M6 2h9l5 5v15H6zM15 2v5h5M9 13h8M9 17h6",
  building: "M4 21V5l8-3v19M12 8h8v13M2 21h20M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  shieldc: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  truck: "M2 6h12v10H2zM14 9h4l3 3v4h-7zM8 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0zM19 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0z",
  calc: "M5 2h14v20H5zM8 5h8v4H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01",
  sprout: "M12 21v-9M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5z",
  scale: "M12 3v18M7 21h10M4 7h16M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0z",
  umbrella: "M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9zM12 12v7a2 2 0 0 0 4 0",
  exit: "M13 3H5v18h8M16 8l4 4-4 4M20 12H9",
  unlink: "M9 15l-2 2a3 3 0 0 1-4-4l2-2M15 9l2-2a3 3 0 0 1 4 4l-2 2M8 3v3M3 8h3M16 21v-3M21 16h-3",
  mobile: "M7 2h10v20H7zM11 18h2",
  noweb: "M3 4h18v16H3zM3 9h18M9.5 12.5l5 5M14.5 12.5l-5 5",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  gift: "M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9c-1.5-4-6-4-6-1.5S9 9 12 9zM12 9c1.5-4 6-4 6-1.5S15 9 12 9z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  stamp: "M9 3h6v5l3 4H6l3-4zM5 15h14v3H5zM5 21h14",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0z",
  warehouse: "M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10",
  door: "M6 21V3h12v18M3 21h18M14 12h.01",
  receipt: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h4",
  hourglass: "M6 3h12M6 21h12M7 3v3a5 5 0 0 0 5 6a5 5 0 0 0 5-6V3M7 21v-3a5 5 0 0 1 5-6a5 5 0 0 1 5 6v3",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  heart: "M12 20s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.5-8 11-8 11z",
};
const ico = (n, s = 32, c = "#D8BD8A", w = 1.8) => `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n]}"/></svg>`;
const icoG = (par, n, x, y, s, c = "#D8BD8A", w = 1.8) => { const g = mk(par, "g"); const k = s / 24;
  g.innerHTML = `<g transform="translate(${x - s / 2} ${y - s / 2}) scale(${k})"><path d="${P[n]}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></g>`; return g; };
const get = path => path.split(".").reduce((o, k) => (o == null ? o : o[k]), U);

// Grundgerüst: Hintergrund, Muster, Wortmarke, Hinweis "Beispiel", Schlusskarte
document.body.insertAdjacentHTML("afterbegin", `<div id="bg"></div><div id="pat"></div>`);
document.body.insertAdjacentHTML("beforeend", `
<div class="scene" id="END">
  <div class="abs ctr" style="top:300px">
    <div class="logo"><span class="mask"><span id="END1">NextGen</span></span><span class="mask"><span id="END2" class="gold">Profit</span></span></div>
    <div id="END_line" style="width:0;height:3px;margin:26px auto 0;background:linear-gradient(90deg,transparent,#D8BD8A,transparent)"></div>
    <div id="END_free" style="margin-top:46px"><span class="chip" style="font-size:36px;padding:18px 36px">${ico("gift", 38)}<span>${esc(U.endfree)}</span></span></div>
    <div id="END_url" style="margin-top:40px">nextgen-profit.de</div>
  </div>
</div>
<div id="vig"></div>
<div id="mark"><span>NextGen</span><span class="gold">Profit</span></div>
<div id="illtag"><i></i><span>${esc(U.ill)}</span></div>`);
document.querySelectorAll("[data-u]").forEach(e => { e.textContent = get(e.dataset.u); });
document.querySelectorAll("[data-ic]").forEach(e => { e.outerHTML = ico(e.dataset.ic, +e.dataset.s || 32, e.dataset.c || "#D8BD8A"); });

let WIN = null;
function windows() {
  const S = [...window.SCENES, ["END", "end", {}]];
  return S.map(([s, id, o = {}], i) => ({ s, el: $(s), o, a: i ? L[id].start - .5 : 0, b: i < S.length - 1 ? L[S[i + 1][1]].start - .5 : T.total + 1 }));
}
// Szenenwechsel mit Tiefe: neue Szene kommt leicht aus der Nähe, alte weicht zurück
function applyScenes(t) {
  WIN = WIN || windows();
  let ill = 0;
  for (const w of WIN) {
    const ki = p(t, w.a, .6), ko = p(t, w.b - .55, .55), o = Math.min(eo(ki), 1 - eio(ko));
    w.el.style.opacity = o; w.el.style.display = o > 0.001 ? "block" : "none";
    if (o > 0.001) w.el.style.transform = `scale(${lerp(1.05, 1, eo(ki)) * lerp(1, .95, eio(ko))})`;
    if (w.o.ill) ill = Math.max(ill, o);
    w.o.k = o;
  }
  $("illtag").style.opacity = ill * .9;
  const e = WIN[WIN.length - 1];
  $("mark").style.opacity = .92 * (1 - e.o.k) * eo(p(t, .2, .8));
}
function endCard(t) {
  const h0 = L.end.start - .35;
  $("END1").style.transform = `translateY(${(1 - eo(p(t, h0, .8))) * 150}px)`;
  $("END2").style.transform = `translateY(${(1 - eo(p(t, h0 + .15, .8))) * 150}px)`;
  $("END_line").style.width = 900 * eio(p(t, h0 + .6, 1.0)) + "px";
  reveal("END_free", p(t, h0 + .9, .6), 30);
  reveal("END_url", p(t, h0 + 1.5, .6), 20);
}
window.render = t => {
  applyScenes(t);
  $("bg").style.setProperty("--gx", (58 + 12 * Math.sin(t * .15)) + "%"); $("bg").style.setProperty("--gy", (30 + 10 * Math.cos(t * .12)) + "%");
  window.film(t);
  endCard(t);
};
