import { LEGAL } from "@/content/legal";

export function LegalPage({ doc }: { doc: keyof typeof LEGAL }) {
  const d = LEGAL[doc];
  return (
    <main style={{ maxWidth: 760 }}>
      {d.placeholder && (
        <p className="bad" style={{ border: "2px solid var(--bad)", padding: 12, borderRadius: 8, fontWeight: 600 }}>
          PLATZHALTER – NOCH NICHT VERÖFFENTLICHEN. Solange dieser Text ein Platzhalter ist, bleiben alle Landingpages offline.
        </p>
      )}
      <h1>{d.title}</h1>
      {d.body.split("\n\n").map((p, i) => (
        <p key={i} style={{ whiteSpace: "pre-line" }}>{p}</p>
      ))}
    </main>
  );
}
