import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, passwordMatches, SESSION_COOKIE, sessionMaxAge } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const pw = String(formData.get("password") ?? "").trim();
  // Eigene Meldung, wenn in dieser Umgebung (Production/Preview) Variablen fehlen
  if (!process.env.SESSION_SECRET?.trim() || !process.env.DASHBOARD_PASSWORD?.trim()) redirect("/login?e=2");
  if (!passwordMatches(pw, process.env.DASHBOARD_PASSWORD.trim())) redirect("/login?e=1");
  (await cookies()).set(SESSION_COOKIE, createSession(process.env.SESSION_SECRET!.trim()), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: sessionMaxAge,
  });
  redirect("/dashboard");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main style={{ maxWidth: 360 }}>
      <h1>Anmelden</h1>
      {e === "1" && <p className="bad">Passwort falsch.</p>}
      {e === "2" && (
        <p className="bad">
          In dieser Umgebung fehlen DASHBOARD_PASSWORD oder SESSION_SECRET (Vercel → Environment Variables, auch für
          „{process.env.VERCEL_ENV ?? "?"}“ anhaken und neu deployen).
        </p>
      )}
      <form action={login} className="row">
        <input type="password" name="password" placeholder="Passwort" required autoFocus />
        <button className="primary" type="submit">Anmelden</button>
      </form>
    </main>
  );
}
