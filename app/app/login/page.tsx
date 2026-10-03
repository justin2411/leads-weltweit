import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, passwordMatches, SESSION_COOKIE, sessionMaxAge, verifySession } from "@/lib/auth";

// Nur über die direkte Adresse /login erreichbar (Inhaber 03.10.2026), nirgends verlinkt, nicht indexiert.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Anmelden", robots: { index: false, follow: false, nocache: true } };

const sans = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--sans", display: "swap" });

async function login(formData: FormData) {
  "use server";
  const pw = String(formData.get("password") ?? "").trim();
  if (!process.env.SESSION_SECRET?.trim() || !process.env.DASHBOARD_PASSWORD?.trim()) redirect("/login?e=2");
  if (!passwordMatches(pw, process.env.DASHBOARD_PASSWORD.trim())) {
    await new Promise((r) => setTimeout(r, 1000)); // bremst Durchprobieren
    redirect("/login?e=1");
  }
  (await cookies()).set(SESSION_COOKIE, createSession(process.env.SESSION_SECRET!.trim()), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: sessionMaxAge,
  });
  redirect("/dashboard/jarvis");
}

const CSS = `
.lg{--ink:#0b1320;--gold:#b08d57;--gold2:#d8bd8a;min-height:100vh;display:grid;place-items:center;padding:24px 16px;
  background:radial-gradient(1200px 600px at 20% -10%,#1b2a45 0,transparent 60%),var(--ink);font-family:var(--sans),system-ui,sans-serif;color:#f4efe6}
.lg .box{width:100%;max-width:380px;background:#fffdf9;color:#161b24;border-radius:18px;padding:28px 24px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6)}
.lg .mark{font-weight:700;font-size:20px;letter-spacing:-.01em}.lg .mark i{font-style:normal;color:var(--gold)}
.lg h1{font-size:18px;margin:14px 0 4px}.lg p{margin:0 0 16px;color:#5b6372;font-size:14px}
.lg input{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid #e4ddd0;border-radius:10px;margin-bottom:12px;background:#fff;color:#161b24}
.lg input:focus{outline:2px solid var(--gold2);border-color:var(--gold)}
.lg button{width:100%;font:inherit;font-weight:600;font-size:16px;padding:12px;border:0;border-radius:10px;cursor:pointer;color:#141008;background:linear-gradient(135deg,#e2c894,#b08d57)}
.lg .bad{color:#b3261e;background:#fbeceb;border-radius:8px;padding:8px 10px;font-size:14px;margin-bottom:12px}
`;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  // Schon angemeldet: direkt zur Übersicht
  if (verifySession((await cookies()).get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET?.trim())) redirect("/dashboard/jarvis");
  return (
    <div className={`lg ${sans.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <form action={login} className="box">
        <div className="mark">NextGen <i>Profit</i></div>
        <h1>Anmelden</h1>
        <p>Interner Bereich.</p>
        {e === "1" && <div className="bad">Passwort falsch.</div>}
        {e === "2" && <div className="bad">Anmeldung ist in dieser Umgebung nicht eingerichtet.</div>}
        <input type="password" name="password" placeholder="Passwort" autoComplete="current-password" required autoFocus />
        <button type="submit">Anmelden</button>
      </form>
    </div>
  );
}
