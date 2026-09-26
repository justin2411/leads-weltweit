import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { verifyFilterToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const SIGNALS = [
  ["new_incorporation", "Newly registered companies"],
  ["job_open_30d", "Roles open 30+ days"],
  ["jobs_3plus", "3+ roles at once"],
  ["outdated_website", "Outdated or missing website"],
] as const;

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(/[,\n;]/).map((s) => s.trim()).filter(Boolean).slice(0, 50);

async function save(formData: FormData) {
  "use server";
  const token = String(formData.get("t") ?? "");
  const id = verifyFilterToken(token, process.env.SESSION_SECRET);
  if (!id) redirect("/kunde/filter?abgelaufen=1");
  const { error } = await db().from("customer_filters").upsert({
    customer_id: id,
    regions: list(formData.get("regions")),
    signals: formData.getAll("signals").map(String).filter((s) => SIGNALS.some(([k]) => k === s)),
    industries: list(formData.get("industries")),
    exclusions: list(formData.get("exclusions")),
    max_per_week: Math.min(Math.max(Number(formData.get("max_per_week") || 30), 1), 500),
    updated_at: new Date().toISOString(),
  }, { onConflict: "customer_id" });
  if (error) throw new Error(error.message);
  redirect(`/kunde/filter?t=${encodeURIComponent(token)}&ok=1`);
}

export default async function FilterPage({ searchParams }: { searchParams: Promise<{ t?: string; ok?: string; abgelaufen?: string }> }) {
  const sp = await searchParams;
  const id = verifyFilterToken(sp.t, process.env.SESSION_SECRET);
  if (!id) return <main><h1>Link expired</h1><p>Please reply to our welcome email and we will send you a new link.</p></main>;
  const { data: f } = await db().from("customer_filters").select("*").eq("customer_id", id).maybeSingle();
  return (
    <main style={{ maxWidth: 640 }}>
      <h1>Your lead preferences</h1>
      {sp.ok && <p className="ok">Saved – thank you.</p>}
      <form action={save} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="t" value={sp.t} />
        <label>Areas (towns or counties, comma separated)<br /><input name="regions" defaultValue={(f?.regions ?? []).join(", ")} style={{ width: "100%" }} /></label>
        <fieldset><legend>Signals</legend>
          {SIGNALS.map(([k, label]) => (
            <label key={k} style={{ display: "block" }}><input type="checkbox" name="signals" value={k} defaultChecked={(f?.signals ?? []).includes(k)} /> {label}</label>
          ))}
        </fieldset>
        <label>Industries or job types (optional)<br /><input name="industries" defaultValue={(f?.industries ?? []).join(", ")} style={{ width: "100%" }} /></label>
        <label>Exclude (company names or keywords, optional)<br /><input name="exclusions" defaultValue={(f?.exclusions ?? []).join(", ")} style={{ width: "100%" }} /></label>
        <label>Maximum leads per week<br /><input name="max_per_week" type="number" min={1} max={500} defaultValue={f?.max_per_week ?? 30} /></label>
        <button className="primary" type="submit">Save</button>
      </form>
    </main>
  );
}
