/**
 * Ansprechpartner-Grafik (Vorlage v4, Startseite und Landingpages): vier Beispielwochen, die Filter werden enger und mehr
 * Punkte rücken in den Passungsring. Läuft ab Sichtbarkeit in Schleife (je Woche 3,6 s, Inhaber 03.10.2026); ein Klick auf
 * eine Woche hält an. Gibt eine Aufräum-Funktion zurück.
 */
export function initTune(tune: HTMLElement, reduce: boolean): () => void {
  const d = document;
  const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = tune) => [...c.querySelectorAll<T>(s)];
  const offs: (() => void)[] = [];
  const on = (t: EventTarget, ev: string, f: EventListener) => { t.addEventListener(ev, f); offs.push(() => t.removeEventListener(ev, f)); };
  const weeks = $$<HTMLButtonElement>(".hp-week"), texts = $$(".hp-tune__texts p"), rows = $$(".hp-filters > div"), dots = $$<SVGCircleElement>(".hp-target .dot");
  const RR = [[88, 62, 75, 45, 92, 55, 70, 33, 84, 50], [72, 48, 60, 34, 76, 42, 54, 24, 68, 40], [54, 30, 44, 22, 58, 34, 41, 14, 47, 28], [32, 16, 27, 12, 46, 22, 29, 8, 35, 19]];
  const J = [8, -5, 12, -10, 4, -7, 9, -3, 6, -12], TURN = 9;
  let timer = 0;
  let io: IntersectionObserver | null = null;
  const go = (n: number) => {
    weeks.forEach((b, k) => { b.setAttribute("aria-selected", String(k === n)); b.tabIndex = k === n ? 0 : -1; b.classList.toggle("is-past", k < n); });
    texts.forEach((p) => { const sel = +(p.dataset.w ?? -1) === n; p.classList.toggle("is-on", sel); p.setAttribute("aria-hidden", String(!sel)); });
    rows.forEach((r) => {
      const spans = $$("dd span", r); let cur = 0;
      spans.forEach((sp, k) => { if (+(sp.dataset.from ?? 0) <= n) cur = k; });
      spans.forEach((sp, k) => { sp.classList.toggle("is-on", k === cur); sp.setAttribute("aria-hidden", String(k !== cur)); });
      r.classList.toggle("is-changed", n > 0 && +(spans[cur]?.dataset.from ?? 0) === n);
    });
    dots.forEach((c, i) => {
      const a = (i * 36 + J[i] + n * TURN) * Math.PI / 180, r = RR[n][i];
      c.style.transform = `translate(${(Math.sin(a) * r).toFixed(1)}px,${(-Math.cos(a) * r).toFixed(1)}px)`;
      c.classList.toggle("is-fit", r < 38);
    });
  };
  const stop = () => { clearInterval(timer); tune.classList.remove("is-playing"); };
  weeks.forEach((b, k) => {
    on(b, "click", () => { stop(); go(k); });
    on(b, "keydown", ((e: KeyboardEvent) => {
      const m = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key];
      if (!m) return; e.preventDefault(); const n = (k + m + weeks.length) % weeks.length; stop(); go(n); weeks[n].focus();
    }) as EventListener);
  });
  if (!reduce && "IntersectionObserver" in window) {
    go(0);
    io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; io!.disconnect();
      let n = 0; tune.classList.add("is-playing"); go(0);
      timer = window.setInterval(() => { n = (n + 1) % 4; if (!d.hidden) go(n); }, 3600);
    }), { threshold: 0.5 });
    io.observe(tune);
  } else go(3);
  return () => { offs.forEach((f) => f()); clearInterval(timer); io?.disconnect(); };
}
