import { cssByFile, cssFileNames } from "@/lib/css-bundles";

// Beim Build als statische Dateien erzeugt; Name enthält die Prüfsumme, daher ein Jahr im Browser-Cache.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return cssFileNames().map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const css = cssByFile((await params).file);
  if (css === null) return new Response("Not found", { status: 404 });
  return new Response(css, {
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
