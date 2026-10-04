/**
 * JARVIS-Startseite, einfach (Inhaber 04.10.2026: „möglichst wenig text und gute treffende grafiken und animationen,
 * ich will aus 5 metern sehen ob was läuft“): Status-Kopf mit fünf Strömen (großer Ring, eine Zahl; grün pulsiert =
 * läuft, gelb = langsam, rot = steht), die 8 Bereiche der Firma als Kacheln (Link ins Office) und der Chat als
 * schwebender Knopf. Reine Server-Darstellung, Daten aus lib/puls.ts und lib/firma.ts. Animation nur per CSS, bei
 * „Bewegung reduzieren“ aus.
 */
import Link from "next/link";
import { Icon, isIconName } from "@/app/icons";
import { AMPEL_TEXT, type Ampel } from "@/lib/ampel";
import { PULS_TEXT, type Strom } from "@/lib/puls";

export type FirmaKachel = { slug: string; name: string; icon: string; wert: string; ampel: Ampel; titel: string; aktiv: number };

export function Puls({ items }: { items: Strom[] }) {
  return (
    <section className="pk" aria-label="Läuft alles?">
      <ul className="pk-row">
        {items.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className={`pk-s t-${s.ampel}`} title={s.tip} scroll={false}>
              <span className="pk-ring" aria-hidden><i className="pk-wave" /><i className="pk-core">{isIconName(s.icon) && <Icon name={s.icon} size={22} />}</i></span>
              <b className="pk-v">{s.wert}</b>
              <span className="pk-l">{s.label}</span>
              <small className="pk-u">{s.unter}</small>
              <span className="sr">{PULS_TEXT[s.ampel]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FirmaKacheln({ items }: { items: FirmaKachel[] | null }) {
  return (
    <section className="fk" id="firma" aria-label="Firma">
      <div className="fk-hd"><h2>Firma</h2><Link href="/dashboard/firma" className="fk-org"><Icon name="agent" size={16} /><span>Organigramm</span></Link></div>
      {items && items.length ? (
        <ul className="fk-grid">
          {items.map((k) => (
            <li key={k.slug}>
              <Link href={`/dashboard/firma/${k.slug}`} className={`fk-k t-${k.ampel}${k.aktiv > 0 ? " busy" : ""}`} title={`${k.name} · ${k.titel}: ${AMPEL_TEXT[k.ampel]}${k.aktiv > 0 ? ` · ${k.aktiv} Agenten arbeiten` : ""}`}>
                <span className="fk-ic" aria-hidden>{isIconName(k.icon) && <Icon name={k.icon} size={26} />}</span>
                <span className="fk-n">{k.name}</span>
                <b className="fk-v">{k.wert}</b>
                <i className="fk-dot" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="fk-na" role="status">Bereiche gerade nicht lesbar – –</p>}
    </section>
  );
}

export function ChatKnopf({ neu }: { neu: number }) {
  return (
    <Link href="/dashboard/jarvis/chat" className="jfab" aria-label={neu ? `Chat, ${neu} neu` : "Chat mit JARVIS"} title="Schreib JARVIS">
      <Icon name="antworten" size={24} />{neu > 0 && <b>{neu}</b>}
    </Link>
  );
}

export const KOPF_CSS = `
.jv .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.jv .pk{margin:8px 0 16px}
.jv .pk-row{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;align-items:stretch}
.jv .pk-row li{display:flex;min-width:0;margin:0}
.jv .pk-s{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;padding:16px 8px 14px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55));color:inherit;text-decoration:none;text-align:center}
.jv .pk-s:hover,.jv .pk-s:focus-visible{border-color:var(--ac)}
.jv .pk-ring{position:relative;display:grid;place-items:center;width:84px;height:84px;margin-bottom:6px}
.jv .pk-core{position:relative;z-index:1;display:grid;place-items:center;width:72px;height:72px;border-radius:50%;border:4px solid var(--ac);background:var(--ab);color:var(--ac);font-style:normal;box-shadow:0 0 24px -4px var(--ac)}
.jv .pk-wave{position:absolute;inset:6px;border-radius:50%;border:3px solid var(--ac);opacity:0}
.jv .pk-v{font-family:var(--mono);font-size:40px;line-height:1.05;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jv .pk-l{font-size:var(--fs-m);font-weight:700;color:var(--ac)}
.jv .pk-u{font-size:var(--fs-xs);color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.jv .pk .t-green{--ac:var(--amp-green);--ab:var(--amp-green-bg)}
.jv .pk .t-gold{--ac:var(--amp-gold);--ab:var(--amp-gold-bg)}
.jv .pk .t-red{--ac:var(--amp-red);--ab:var(--amp-red-bg)}
.jv .pk .t-grey{--ac:var(--amp-grey);--ab:var(--amp-grey-bg)}
.jv .pk .t-green .pk-wave{animation:pk-wave 2.2s ease-out infinite}
.jv .pk .t-gold .pk-wave{animation:pk-wave 4.5s ease-out infinite}
.jv .pk .t-red .pk-core{animation:pk-red 1.6s ease-in-out infinite}
@keyframes pk-wave{0%{transform:scale(.85);opacity:.75}100%{transform:scale(1.25);opacity:0}}
@keyframes pk-red{0%,100%{box-shadow:0 0 10px -4px var(--ac)}50%{box-shadow:0 0 30px 0 var(--ac)}}

.jv section.fk{margin:16px 0;padding:12px 16px 16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55))}
.jv .fk-hd{display:flex;align-items:center;gap:8px;margin:0 0 10px;min-width:0}
.jv .fk-hd h2{margin:0;font-size:var(--fs-m);font-weight:700;color:#fff}
.jv .fk-org{margin-left:auto;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:99px;border:1px solid rgba(226,198,143,.5);color:var(--gold2);text-decoration:none;font-size:var(--fs-s);font-weight:600;white-space:nowrap}
.jv .fk-org:hover,.jv .fk-org:focus-visible{background:rgba(226,198,143,.1)}
.jv .fk-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:stretch}
.jv .fk-grid li{display:flex;min-width:0;margin:0}
.jv .fk-k{position:relative;flex:1;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;column-gap:12px;align-items:center;min-width:0;min-height:88px;padding:12px 14px;border-radius:14px;background:var(--ab);border:1px solid transparent;box-shadow:inset 4px 0 0 var(--ac);color:inherit;text-decoration:none}
.jv .fk-k:hover,.jv .fk-k:focus-visible{border-color:var(--ac)}
.jv .fk-ic{grid-row:1/3;display:grid;place-items:center;width:48px;height:48px;border-radius:12px;background:rgba(2,8,18,.5);color:var(--ac)}
.jv .fk-n{min-width:0;padding-right:20px;font-size:var(--fs-s);font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jv .fk-v{min-width:0;font-family:var(--mono);font-size:26px;line-height:1.15;color:var(--ac);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jv .fk-dot{position:absolute;top:12px;right:12px;width:12px;height:12px;border-radius:50%;background:var(--ac);box-shadow:0 0 10px var(--ac)}
.jv .fk-k.busy .fk-dot{animation:pk-red 1.6s ease-in-out infinite}
.jv .fk .t-green{--ac:var(--amp-green);--ab:var(--amp-green-bg)}
.jv .fk .t-gold{--ac:var(--amp-gold);--ab:var(--amp-gold-bg)}
.jv .fk .t-red{--ac:var(--amp-red);--ab:var(--amp-red-bg)}
.jv .fk .t-grey{--ac:var(--amp-grey);--ab:var(--amp-grey-bg)}
.jv .fk-na{margin:0;color:var(--soft)}

.jv section.jv-werke{margin:16px 0;padding:12px 16px 16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.5),rgba(4,12,26,.4))}
.jv .jv-wh{display:flex;align-items:center;gap:8px;margin:0 0 8px;min-width:0}
.jv .jv-wh h2{margin:0;font-size:var(--fs-m);font-weight:700;color:#fff}
.jv-werke .jv-agenten{margin:0 0 12px}
.jv .jv-back{margin:8px 0}
.jv .jv-back a{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:99px;border:1px solid rgba(226,198,143,.5);color:var(--gold2);text-decoration:none;font-size:var(--fs-s);font-weight:600}
.dash .jfab{position:fixed;right:24px;bottom:24px;z-index:30;display:grid;place-items:center;width:60px;height:60px;border-radius:50%;background:linear-gradient(180deg,#e2c68f,#b8954f);color:#04101f;text-decoration:none;box-shadow:0 10px 30px -8px rgba(0,0,0,.8),0 0 24px -6px rgba(226,198,143,.7)}
.dash .jfab:hover,.dash .jfab:focus-visible{filter:brightness(1.08)}
.dash .jfab b{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--amp-red);color:#fff;font-size:var(--fs-xs);line-height:22px;text-align:center}

@media (prefers-reduced-motion:reduce){
  .jv .pk .pk-wave,.jv .pk .pk-core,.jv .fk-k.busy .fk-dot{animation:none!important}
  .jv .pk .t-green .pk-wave{opacity:.35;transform:scale(1.1)}
}
@media (max-width:1100px){
  .jv .fk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:900px){
  .jv .pk-row{grid-template-columns:repeat(6,minmax(0,1fr))}
  .jv .pk-row li{grid-column:span 2}
  .jv .pk-row li:nth-child(4){grid-column:2/4}
  .jv .pk-row li:nth-child(5){grid-column:4/6}
}
@media (max-width:760px){
  .jv .pk-row{gap:8px}
  .jv .pk-s{padding:12px 4px 10px;border-radius:14px}
  .jv .pk-ring{width:60px;height:60px;margin-bottom:4px}
  .jv .pk-core{width:52px;height:52px;border-width:3px}
  .jv .pk-core svg{width:18px;height:18px}
  .jv .pk-v{font-size:26px}
  .jv .pk-l{font-size:var(--fs-s)}
  .jv section.fk,.jv section.jv-werke{padding:8px 12px 12px}
  .jv .fk-grid{gap:8px}
  .jv .fk-k{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto;row-gap:2px;min-height:96px;padding:10px 12px}
  .jv .fk-ic{grid-row:auto;width:36px;height:36px;border-radius:10px}
  .jv .fk-ic svg{width:20px;height:20px}
  .jv .fk-v{font-size:20px}
  .dash .jfab{right:16px;bottom:calc(76px + env(safe-area-inset-bottom));width:56px;height:56px}
}
`;
