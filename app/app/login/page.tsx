import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, passwordMatches, SESSION_COOKIE, sessionMaxAge } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const pw = String(formData.get("password") ?? "");
  if (!process.env.SESSION_SECRET || !passwordMatches(pw, process.env.DASHBOARD_PASSWORD)) {
    redirect("/login?e=1");
  }
  (await cookies()).set(SESSION_COOKIE, createSession(process.env.SESSION_SECRET!), {
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
      {e && <p className="bad">Passwort falsch.</p>}
      <form action={login} className="row">
        <input type="password" name="password" placeholder="Passwort" required autoFocus />
        <button className="primary" type="submit">Anmelden</button>
      </form>
    </main>
  );
}
