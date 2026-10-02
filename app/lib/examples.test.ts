import { test } from "node:test";
import assert from "node:assert/strict";
import { localizeJob, maskCompany, maskEmail, maskPhone, pickDiverse, roleFor, seedOf, shortForm, type Candidate, type Part } from "./examples.ts";
import { validEmail, wishNote, wishesFor } from "../content/sample-wishes.ts";

const text = (p: Part[]) => p.map((x) => x.t).join("");
const shown = (p: Part[]) => p.filter((x) => !x.m).map((x) => x.t).join("");

test("Beispiele: verschiedene Signale, Branchen, Tage; jede Firma einmal", () => {
  const c: Candidate[] = [
    { id: "a", name: "A LTD", signal: "new_incorporation", urgency: "high", date: "2026-08-31", group: "sic56" },
    { id: "a", name: "A LTD", signal: "new_incorporation", urgency: "high", date: "2026-08-31", group: "sic56" },
    { id: "b", name: "B LTD", signal: "new_incorporation", urgency: "high", date: "2026-08-31", group: "sic56" },
    { id: "c", name: "C LTD", signal: "new_incorporation", urgency: "medium", date: "2026-08-20", group: "sic41" },
    { id: "d", name: "D LTD", signal: "jobs_3plus", urgency: "high", date: "2026-09-21", group: "sic62" },
    { id: "e", name: "E LTD", signal: "new_incorporation", urgency: "low", date: "2026-08-10", group: "sic70" },
  ];
  const p = pickDiverse(c, 3).map((x) => x.id);
  assert.equal(p.length, 3);
  assert.equal(new Set(p).size, 3);
  assert.ok(p.includes("d"), "anderes Signal zuerst");
  assert.ok(p.includes("c"), "andere Branche, Priorität und Tag");
  assert.ok(!p.includes("b"), "gleiche Branche am gleichen Tag nicht doppelt");
  // gleiche Meldung unter zwei Firmeneinträgen
  const j = pickDiverse([{ id: "x", name: "X", signal: "jobs_3plus", evKey: "k" }, { id: "y", name: "Y", signal: "jobs_3plus", evKey: "k" }], 3);
  assert.equal(j.length, 1);
});

test("Firmenmaske: Anfang und Rechtsform sichtbar, Rest Platzhalter, je Firma anders", () => {
  const a = maskCompany("HARPER BOOKKEEPING SERVICES LTD", seedOf("1"));
  assert.equal(shown(a), "Ha Ltd");
  assert.ok(!text(a).toLowerCase().includes("bookkeeping"), "keine echten Zeichen im verdeckten Teil");
  assert.match(text(a), / Ltd$/);
  const b = maskCompany("NOVA LLC", seedOf("2"));
  assert.equal(shown(b), "N LLC");
  assert.notEqual(text(a).length, text(b).length);
});

test("Telefon: Ländervorwahl sichtbar, bekannte Nummer nur zwei Ziffern", () => {
  const u = maskPhone("UK", 1);
  assert.equal(u[0].t, "+44");
  assert.ok(u.some((x) => x.m));
  const k = maskPhone("UK", 1, "+44 20 7946 0123");
  assert.equal(shown(k), "+44 20");
  assert.ok(!text(k).includes("7946"));
  assert.equal(maskPhone("FR", 3)[0].t, "+33");
  assert.equal(maskPhone("US", 3, "+1 718 313 3029")[0].t, "+1 71");
});

test("E-Mail: Domain je Firma abgeleitet, persönliche Teile nie sichtbar", () => {
  const a = maskEmail("Harper Ltd", "UK", 1);
  assert.equal(shown(a), "@h.co.uk");
  const b = maskEmail("Zeta SAS", "FR", 2);
  assert.equal(shown(b), "@z.fr");
  const c = maskEmail("X", "US", 3, "contact@acme.com");
  assert.equal(shown(c), "contact@a.com");
  const d = maskEmail("X", "UK", 3, "john.smith@acme.co.uk");
  assert.ok(!text(d).includes("john"));
});

test("Rolle: aus dem Register, sonst gesetzliche Vertretung der Rechtsform", () => {
  assert.equal(roleFor("UK", "Ltd", undefined, "en"), "Director");
  assert.equal(roleFor("US", shortForm("DOMESTIC LIMITED LIABILITY COMPANY"), undefined, "en"), "Managing member");
  assert.equal(roleFor("FR", shortForm("Société par actions simplifiée"), undefined, "fr"), "Président");
  assert.equal(roleFor("FR", shortForm("Société à responsabilité limitée"), undefined, "fr"), "Gérant");
  assert.equal(roleFor("FR", "SAS", "Gérant et associé indéfiniment responsable", "fr"), "Gérant");
  assert.equal(roleFor("FR", "SAS", "Président de SAS", "fr"), "Président");
});

test("Stellen-Signale auf französischen Seiten übersetzt", () => {
  assert.equal(localizeJob("Role “Comptable” open for 45 days", "fr"), "Poste « Comptable » ouvert depuis 45 jours");
  assert.equal(localizeJob("6 open roles at the same time on the careers page", "fr"), "6 postes ouverts en même temps sur la page carrières");
  assert.match(localizeJob("I noticed Acme has been advertising the Comptable role since August 2026. Is that still a position you are looking to fill?", "fr"), /depuis août 2026/);
  assert.equal(localizeJob("Role “X” open for 45 days", "en"), "Role “X” open for 45 days");
});

test("Probe-Formular: Wunsch maschinenlesbar, nur erlaubte Signale, Freitext eine Zeile", () => {
  assert.equal(wishNote("web-agencies", ["no_website", "website_outdated"], ""), "wunsch:signals=no_website,website_outdated");
  assert.equal(wishNote("recruitment", ["job_open_30d", "evil", "jobs_3plus", "new_location", "job_open_30d"], " only\nhotels "),
    "wunsch:signals=job_open_30d,jobs_3plus,new_location;text=only hotels");
  assert.equal(wishNote("accountants", [], ""), "");
  assert.equal(wishNote("accountants", [], "x".repeat(300)).length, "wunsch:signals=;text=".length + 200);
  for (const seg of ["recruitment", "accountants", "web-agencies", "insurance-brokers", "financial-advisers"]) {
    const w = wishesFor(seg);
    assert.ok(w.length >= 2 && w.length <= 6, seg); // Webagenturen 6 (Inhaber 02.10.2026)
    assert.ok(w.every((x) => x.en && x.fr && x.de));
  }
  assert.ok(validEmail("info@acme.co.uk"));
  assert.ok(validEmail("jane@gmail.com"), "Freemail erlaubt");
  assert.ok(!validEmail("no-at-sign"));
  assert.ok(!validEmail("a@b"));
  assert.ok(!validEmail("a b@c.com"));
});
