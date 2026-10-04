import { consentText } from "@/lib/consent";
import { sendConsentMail } from "@/lib/mail";
import { mailText, renderMail, type MailBlock } from "@/lib/mail-html";
import { recordEvent } from "@/lib/page-events";
import { getSettings, isOwner, pageIsPublic } from "@/lib/pages";
import { BRAND, LEGAL_NAME, siteUrl } from "@/lib/site";
import { db } from "@/lib/supabase";
import { personalFor } from "@/lib/recipient";
import { leadCountry, segKey } from "@/lib/country";
import { cleanText, validEmail, wishKeys, wishNote } from "@/content/sample-wishes";
import { after } from "next/server";
import { dispatchSampleWorkflow, previewFromStock, sendFromStock, STOCK_BUCKET, type StockDeps } from "@/lib/sample-stock";
import { pushAlarmSafe } from "@/lib/push";
import { isOwnerAddress } from "@/lib/owner-address";

export const dynamic = "force-dynamic";
// Sofortversand nach dem Klick läuft per after() nach der Antwort: Vorrat abrufen + Resend (wenige Sekunden)
export const maxDuration = 60;

function back(slug: string, q: string, preview = "") {
  return Response.redirect(`${siteUrl()}/${slug}?${preview}${q}#probe`, 303);
}

/**
 * Probe-Anfrage aus dem Formular der Landingpage oder der Startseite. Speichert Einwilligung mit Wortlaut und
 * Zeitstempel sowie den Wunsch („welche Leads“) maschinenlesbar in note. Antwortet mit JSON, wenn das Formular
 * per JavaScript sendet, sonst mit Weiterleitung (funktioniert auch ohne JavaScript und für alte Mail-Links).
 */
export async function POST(req: Request) {
  const f = await req.formData();
  const json = (req.headers.get("accept") ?? "").includes("application/json");
  const answer = (ok: boolean, error: string, slug: string, pv: string, waitlist = false) =>
    json ? Response.json(ok ? { ok: true, ...(waitlist ? { waitlist: true } : {}) } : { ok: false, error }, { status: ok ? 200 : 400 })
      : back(slug, ok ? "angefragt=1" : "fehler=1", pv);

  const variantId = String(f.get("variant_id") ?? "");
  const slugIn = String(f.get("slug") ?? "").toLowerCase();
  const sel = "id, status, variant_key, landing_pages!inner(slug, status, segment_id, country, language)";
  // Startseite: Branche/Land als Seiten-Slug, dort gilt die laufende (live) Variante
  const { data: v }: { data: any } = variantId
    ? await db().from("page_variants").select(sel).eq("id", variantId).maybeSingle()
    : /^[a-z]{2}\/[a-z0-9-]+$/.test(slugIn)
      ? await db().from("page_variants").select(sel).eq("landing_pages.slug", slugIn).eq("status", "live").order("variant_key").limit(1).maybeSingle()
      : { data: null };
  const page: any = v?.landing_pages;
  if (!v || !page) return json ? Response.json({ ok: false, error: "page" }, { status: 404 }) : new Response("Not found", { status: 404 });
  const isPublic = v.status === "live" && pageIsPublic(page, await getSettings());
  const test = !isPublic && f.get("vorschau") === "1" && (await isOwner());
  if (!isPublic && !test) return json ? Response.json({ ok: false, error: "page" }, { status: 404 }) : new Response("Not found", { status: 404 });
  // Startseite: Lieferland getrennt gewählt. Gibt es für Branche und Land keine eigene Seite (z. B. IE, NL, BE,
  // SE, DE), gilt die Seite derselben Branche nur als Branchen-Nachweis; gespeichert wird das gewählte Land.
  const ccIn = String(f.get("country") ?? "").toUpperCase();
  const country = !variantId && ccIn && leadCountry(ccIn) ? ccIn : page.country;
  const ownPage = country === page.country;
  const rTok = String(f.get("r") ?? "");
  const pv = (test ? `vorschau=1&v=${v.variant_key}&` : "") + (/^[A-Za-z0-9_-]{8,80}$/.test(rTok) ? `r=${rTok}&` : "");

  // Falle für Bots: verstecktes Feld ausgefüllt -> scheinbar erfolgreich, nichts speichern, keine Mail
  if (String(f.get("website") ?? "").trim()) return answer(true, "", page.slug, pv);

  // Persönlicher Link (?r=): Firma und Adresse aus der Kaltmail vorbelegt; Eingaben im Formular gehen vor.
  const who = await personalFor(rTok, page);
  const company = (String(f.get("company") ?? "").replace(/\s+/g, " ").trim() || who?.firma || "").slice(0, 200);
  const email = (String(f.get("email") ?? "").trim() || who?.email || "").trim().toLowerCase().slice(0, 200);
  const region = who?.email && who.email.toLowerCase() === email ? (who.gebiet ?? "").slice(0, 200) : "";
  const consented = ["yes", "on", "1", "true"].includes(String(f.get("consent") ?? ""));
  if (company.length < 2) return answer(false, "company", page.slug, pv);
  if (!validEmail(email)) return answer(false, "email", page.slug, pv);
  if (!consented) return answer(false, "consent", page.slug, pv);
  const wish = wishNote(segKey(page.slug), f.getAll("signals").map(String), String(f.get("text") ?? ""));

  // Doppelklick, zweiter Besuch oder viele Anfragen: dieselbe Adresse für dieselbe Zielgruppe und dasselbe Land
  // in 30 Tagen nur einmal, insgesamt höchstens 3 Anfragen je Adresse in 24 Stunden. Die Seite zeigt trotzdem die
  // Erfolgsmeldung (keine Auskunft darüber, ob eine Adresse schon angefragt hat).
  if (!test) {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: dup } = await db().from("sample_requests").select("id")
      .eq("email", email).eq("segment_id", page.segment_id).eq("country", country)
      .in("status", ["new", "sent"]).gte("created_at", since).limit(1);
    if (dup?.length) return answer(true, "", page.slug, pv);
    const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await db().from("sample_requests").select("id", { count: "exact", head: true })
      .eq("email", email).gte("created_at", day);
    if ((count ?? 0) >= 3) return answer(true, "", page.slug, pv);
  }

  const { data: suppressed } = await db().rpc("is_suppressed", { p_email: email });
  // Lieferbar? (Prüfung 04.10.2026: Startseite bot z. B. Deutschland an, ohne dass es Leads gab – die Seite sagte
  // trotzdem „wird vorbereitet“.) Nicht lieferbar = Warteliste: Anfrage bleibt offen (web_samples.py sendet, sobald
  // 10 Leads da sind), ehrliche Meldung auf der Seite, keine „wird vorbereitet“-Mail.
  const available = test || (await canServe(page.segment_id, country));
  // Wortlaut in der Sprache, in der das Formular angezeigt wurde (Startseite auch Deutsch)
  const formLang = ["en", "fr", "de"].includes(String(f.get("lang"))) ? String(f.get("lang")) : page.language;
  const consent = consentText(formLang);
  // Inhaber-Vorschau (TEST): nie als offene Anfrage speichern (web_samples.py würde sonst dem echten Empfänger
  // aus dem Mail-Link eine Probe schicken) und nie den echten Empfänger anschreiben.
  // Wunsch immer zuletzt ("wunsch:signals=…;text=…"), damit der Freitext nichts anderes überdeckt.
  const note = [suppressed ? "Adresse/Domain gesperrt – keine Mail" : "", test ? "TEST (Inhaber-Vorschau)" : "",
    available || test ? "" : "Warteliste: noch nicht lieferbar", wish]
    .filter(Boolean).join("; ") || null;
  // Sofortversand (Inhaber 03.10.2026): nur, wenn web_samples.py die Anfrage auch beantworten würde – also nicht,
  // wenn diese Adresse schon eine Probe bekam (dann entscheidet wie bisher die Warteschlange: „doppelt“).
  const instant = available && !suppressed && !test && !(await hadSample(email));
  // Testprobe des Inhabers (Vorschau, eigene Adresse oder angemeldet): läuft normal, zählt aber nicht als echte
  // Probe in den Kennzahlen (Prüfung 04.10.2026). is_test nur mitsenden, wenn gesetzt – so bleiben Anfragen von
  // Kunden unberührt, falls die Spalte (Migration 20261004090200) noch fehlt.
  const isTest = test || isOwnerAddress(email, process.env) || (await isOwner());
  const fields: Record<string, unknown> = {
    variant_id: ownPage ? v.id : null, company_name: company, email, segment_id: page.segment_id, country,
    region: region || null, consent_text: consent, consent_at: new Date().toISOString(),
    status: suppressed || test ? "rejected" : "new", note,
    // Sperre: die App bedient diese Anfrage gerade selbst, web_samples.py lässt sie 15 Minuten in Ruhe
    claimed_at: instant ? new Date().toISOString() : null,
  };
  const insert = (f: Record<string, unknown>) => db().from("sample_requests").insert(f).select("id").single();
  let res = await insert(isTest ? { ...fields, is_test: true } : fields);
  if (res.error && isTest) res = await insert(fields);
  const { data: row, error } = res;
  if (error) return json ? Response.json({ ok: false, error: "server" }, { status: 500 }) : new Response("Fehler", { status: 500 });
  if (!test && ownPage) await recordEvent(v.id, "sample_request");
  // Sofort-Alarm aufs Handy (Web-Push, feuern und vergessen; ändert nichts am Ablauf der Anfrage)
  // Nur feste Bezeichnungen (keine Formulareingaben wie den Firmennamen) – Details stehen im Dashboard
  if (!test && !suppressed) after(() => pushAlarmSafe(available ? "Probe angefragt" : "Probe angefragt – nicht lieferbar",
                                                      `${page.segment_id}/${country}`, "/dashboard/proben", "sample"));

  const m = confirmationMail((ownPage ? page.language : formLang) === "fr" ? "fr" : "en", country, consent);
  const keys = wishKeys(segKey(page.slug), f.getAll("signals").map(String));
  const wishText = cleanText(String(f.get("text") ?? ""));
  const clicked = Date.now();
  if (test) {
    // Vorschau: nur an den Inhaber (falls hinterlegt), nie an die Adresse aus dem Mail-Link. Eine fertige Probe
    // aus dem Vorrat zeigt, was der Kunde bekäme – ohne sie zu verbrauchen (nichts wird vergeben oder reserviert).
    const owner = process.env.SALE_NOTIFY_EMAIL?.trim() || process.env.OWNER_EMAIL?.trim();
    if (owner) after(async () => {
      const r = await previewFromStock({ ...stockDeps(), peek }, owner, page.segment_id, country)
        .catch((e) => ({ status: "error" as const, detail: String(e), ms: undefined }));
      console.log(`Vorschau-Probe ${page.segment_id}/${country}: ${r.status} ${r.detail ?? ""} `
        + `(${Date.now() - clicked} ms vom Klick bis Resend)`);
      if (r.status !== "sent") await sendConsentMail(owner, `[TEST] ${m.subject}`, m.text, m.html).catch(() => null);
    });
  } else if (instant) {
    after(() => deliverNow({ id: row.id, email, company, segment: page.segment_id, country, wish: keys, wishText, m,
                             clicked }));
  } else if (!suppressed && available) {
    await sendConsentMail(email, m.subject, m.text, m.html).catch(() => null); // Anfrage ist gespeichert; Bestätigung ist optional
  }
  return answer(true, "", page.slug, pv, !available && !suppressed);
}

/** Gibt es für Zielgruppe+Land eine fertige Probe im Vorrat oder mindestens 10 freie Leads? Bei Fehlern: ja
 *  (lieber wie bisher behandeln als eine lieferbare Anfrage auf die Warteliste setzen). */
async function canServe(segment: string, country: string): Promise<boolean> {
  try {
    const { data: stock } = await db().from("sample_stock").select("id").eq("segment_id", segment).eq("country", country)
      .eq("status", "ready").limit(1).abortSignal(AbortSignal.timeout(3000));
    if (stock?.length) return true;
    const { data: leads, error } = await db().from("leads").select("id").eq("segment_id", segment).eq("country", country)
      .eq("status", "new").limit(10).abortSignal(AbortSignal.timeout(3000));
    if (error) return true;
    return (leads?.length ?? 0) >= 10;
  } catch {
    return true;
  }
}

function stockDeps(): StockDeps {
  return {
    rpc: async (fn, args) => {
      const { data, error } = await db().rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    download: async (path) => {
      const { data, error } = await db().storage.from(STOCK_BUCKET).download(path);
      if (error || !data) throw new Error(error?.message ?? "leer");
      return data.text();
    },
    fetch,
    env: { RESEND_API_KEY: process.env.RESEND_API_KEY, MAIL_FROM: process.env.MAIL_FROM, REPLY_TO: process.env.REPLY_TO },
  };
}

/** Beste fertige Probe der Zielgruppe/des Landes ansehen, ohne sie zu nehmen (nur Inhaber-Vorschau). */
async function peek(segment: string, country: string): Promise<string | null> {
  const { data } = await db().from("sample_stock").select("storage_path").eq("segment_id", segment).eq("country", country)
    .eq("status", "ready").order("score", { ascending: false }).order("built_at", { ascending: false }).limit(1);
  return data?.[0]?.storage_path ?? null;
}

/** Hat diese Adresse schon eine Probe bekommen (Website oder Antwort auf die Kaltmail)? Wie web_samples.skip_reason. */
async function hadSample(email: string): Promise<boolean> {
  const { data: sent } = await db().from("sample_requests").select("id").eq("email", email).eq("status", "sent").limit(1);
  if (sent?.length) return true;
  const msg = await initialMessage(email);
  if (!msg) return false;
  const { data: ev } = await db().from("email_events").select("id").eq("message_id", msg).eq("type", "sample_requested").limit(1);
  return !!ev?.length;
}

async function initialMessage(email: string): Promise<string | null> {
  const { data } = await db().from("messages").select("id").eq("to_email", email).eq("kind", "initial").eq("status", "sent")
    .order("sent_at", { ascending: false }).limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Nach der Antwort an den Browser: fertige Probe aus dem Vorrat sofort senden. Passt keine, geht die Anfrage wie bisher
 * in die Warteschlange (Bestätigungsmail, web_samples.py) und der Probe-Lauf wird – falls eingerichtet – sofort angestoßen.
 */
async function deliverNow(r: { id: string; email: string; company: string; segment: string; country: string; wish: string[];
                               wishText: string; m: { subject: string; text: string; html: string }; clicked: number }) {
  const res = await sendFromStock(stockDeps(), { id: r.id, segment: r.segment, country: r.country, email: r.email, wish: r.wish })
    .catch((e) => ({ status: "error" as const, detail: String(e).slice(0, 200) }));
  console.log(`Probe ${r.segment}/${r.country}: ${res.status} ${"detail" in res && res.detail ? res.detail : ""} `
    + `(${Date.now() - r.clicked} ms vom Klick bis Resend)`);
  if (res.status === "sent") {
    // wie web_samples.py: Erstmail vermerken (keine Nachfassmail „Soll ich sie schicken?“ mehr)
    const msg = await initialMessage(r.email).catch(() => null);
    if (msg) {
      const { data: ev } = await db().from("email_events").select("id").eq("message_id", msg).eq("type", "sample_requested").limit(1);
      if (!ev?.length) await db().from("email_events").insert({ message_id: msg, type: "sample_requested",
        note: "Probe über Landingpage angefordert und sofort gesendet" });
    }
    const owner = process.env.SALE_NOTIFY_EMAIL?.trim() || process.env.OWNER_EMAIL?.trim();
    if (r.wishText && owner) {
      // Freitext (z. B. Branche, Größe) wird nicht automatisch ausgewertet: Inhaber kurz informieren
      await sendConsentMail(owner, `[Leads] Probe gesendet, Hinweis des Kunden: ${r.company}`,
        `${r.company} (${r.email}, ${r.segment}/${r.country}) hat die Probe sofort bekommen. Gewünschte Signale: `
        + `${r.wish.join(", ") || "-"}.\nHinweis im Formular (nicht automatisch berücksichtigt): ${r.wishText}`).catch(() => null);
    }
    return;
  }
  if (res.status === "none") {
    // keine Sperre mehr: Warteschlange übernimmt sofort
    await db().from("sample_requests").update({ claimed_at: null }).eq("id", r.id).eq("status", "new");
  } // bei "error" bleibt die Sperre 15 Minuten (finish_sample_stock gibt sie frei, wenn Resend sicher ablehnte)
  await sendConsentMail(r.email, r.m.subject, r.m.text, r.m.html).catch(() => null);
  await dispatchSampleWorkflow(fetch, process.env.GH_DISPATCH_TOKEN).catch(() => false);
}

/** Bestätigung der Probe-Anfrage: Text- und HTML-Version, ohne Preise und ohne Zeitversprechen.
 *  Landesweit formuliert (Inhaber 27.09.2026): keine Städte oder Regionen, nur das Land. */
function confirmationMail(lang: "en" | "fr", country: string, consent: string) {
  const fr = lang === "fr";
  const c = leadCountry(country);
  const area = c ? (fr ? ` ${c.landFr}` : ` from across ${c.land}`) : "";
  const subject = fr ? "Votre demande d'échantillon est confirmée" : "Your sample request is confirmed";
  // Kurz, leicht, ohne Druck: was jetzt passiert und warum es sich lohnt, kurz hineinzuschauen
  const blocks: MailBlock[] = fr ? [
    { p: "Bonjour," },
    { p: `C'est noté, merci ! Nous préparons maintenant vos pistes${area} et vous les envoyons à cette adresse.` },
    { title: "Ce que vous recevez", steps: [
      "Un court rapport de pistes : chaque entreprise avec téléphone, e-mail, ce qui vient de se passer et une phrase d'accroche.",
      "Les mêmes pistes en tableau, prêtes pour votre CRM.",
      "Un conseil : appelez les deux ou trois qui vous correspondent le mieux cette semaine, tant que le moment est bon.",
    ] },
    { p: "C'est gratuit et sans engagement. Si cela vous plaît, la même liste peut arriver chaque lundi, réservée à votre entreprise." },
    { note: `Pour vos archives, votre accord : « ${consent} » Pour ne plus rien recevoir, répondez simplement « désinscription ».` },
  ] : [
    { p: "Hello," },
    { p: `Got it, thank you! We are now preparing your leads${area} and will send them to this address.` },
    { title: "What you will receive", steps: [
      "A short lead report: each company with phone, email, what just happened and an opening line.",
      "The same leads as a spreadsheet, ready for your CRM.",
      "A tip: call the two or three that fit you best this week, while the moment is fresh.",
    ] },
    { p: "It's free and there is no obligation. If you like it, the same list can arrive every Monday, reserved for your firm." },
    { note: `For your records, you agreed as follows: "${consent}" To stop hearing from us, simply reply "unsubscribe".` },
  ];
  const closing = fr ? "Bien cordialement," : "Kind regards,";
  const signer = `${BRAND}`;
  const footer = `${LEGAL_NAME} · Nikolaistraße 3-7, 04109 Leipzig, Germany\n${siteUrl().replace(/^https?:\/\//, "")}`;
  const text = mailText(blocks) + `\n\n${closing}\n${signer}\n\n${footer}`;
  return { subject, text, html: renderMail({ lang, brand: BRAND, blocks, closing, signer, footer }) };
}
