import { requireOwner } from "../actions";
import { Crumbs } from "../v2";

/** Hilfe (Inhaber 03.10.2026): Schritt für Schritt, ohne Geheimnisse. */
export default async function Hilfe() {
  await requireOwner();
  return (
    <div className="v2">
      <Crumbs items={[["JARVIS", "/dashboard/jarvis"], ["Hilfe", ""]]} />
      <section className="card tile" id="token">
        <header className="th"><span>Sofortstart der Werke einrichten (GitHub-Token, kostenlos, einmalig)</span></header>
        <p className="muted">Ohne Token laufen alle Werke nach Zeitplan und der Wachhund startet ausgefallene Läufe nach. Mit Token kannst du
          „Jetzt auffüllen“ und „Jetzt starten“ klicken, und das Dashboard zeigt zusätzlich den GitHub-Status jedes Laufs.</p>
        <ol className="steps">
          <li>Auf github.com anmelden → oben rechts Profilbild → <b>Settings</b> → ganz unten <b>Developer settings</b> →
            <b> Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
          <li>Name z. B. „Dashboard“, Ablauf <b>1 Jahr</b>. Bei „Repository access“ <b>Only select repositories</b> → nur
            <b> justin2411/leads-weltweit</b>.</li>
          <li>Unter „Repository permissions“ nur <b>Actions: Read and write</b> setzen (alles andere bleibt „No access“) →
            <b> Generate token</b> → den Token kopieren (wird nur einmal angezeigt).</li>
          <li>Auf vercel.com das Projekt öffnen → <b>Settings</b> → <b>Environment Variables</b> → <b>Add</b>: Name
            <b> GH_DISPATCH_TOKEN</b>, Wert = der Token, Umgebung nur <b>Production</b> → Speichern.</li>
          <li>Unter <b>Deployments</b> beim neuesten Eintrag „…“ → <b>Redeploy</b>. Danach sind die Start-Knöpfe aktiv.</li>
        </ol>
        <p className="muted small">Der Token darf nur Abläufe starten und lesen – keinen Code ändern, nichts löschen, kein Geld ausgeben.</p>
      </section>
      <section className="card tile">
        <header className="th"><span>Werke an/aus</span></header>
        <p className="muted">Auf der Seite <b>Werke</b> hat jedes Werk einen Schalter. „aus“ heißt: das Werk beendet sich beim nächsten Start sauber
          mit „pausiert durch Inhaber“, der Wachhund startet es nicht nach. Nicht abschaltbar (Sicherheit): Abmelde-Link, Bounce-/Beschwerde-Sperren,
          Sperrliste, Notbremse und die Drei-Stufen-Freigabe. Beim Antwort-Assistenten werden Abmeldungen per Antwort trotzdem immer gesperrt.</p>
      </section>
      <section className="card tile">
        <header className="th"><span>Was die Animationen bedeuten</span></header>
        <p className="muted">Bewegung = das Werk arbeitet gerade (Lebenszeichen der letzten Minuten). Grau und still = es ruht, ist pausiert oder
          hat nichts zu tun. Jede Stufe zeigt beim Darüberfahren die Zahlen, ein Klick öffnet die Liste.</p>
      </section>
    </div>
  );
}
