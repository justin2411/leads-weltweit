import "server-only";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { planeZentraleRefresh } from "@/lib/zentrale-refresh";

/** In Server-Actions nach jedem Speichern des Inhabers aufrufen (siehe lib/zentrale-refresh.ts). */
export function zentraleNeuRechnen(): void {
  planeZentraleRefresh({
    rpc: (fn) => db().rpc(fn, {}).abortSignal(AbortSignal.timeout(60_000)),
    schedule: (task) => after(task),
    revalidate: (p) => revalidatePath(p),
  });
}
