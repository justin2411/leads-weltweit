import type { ReactNode } from "react";

export const metadata = { title: "Signalwerk", robots: { index: false, follow: false } };

const css = `
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e3e6;--accent:#1f5eff;--bad:#c0352b;--ok:#1d7a3e}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececef;--muted:#9a9aa2;--line:#2c2c31;--accent:#7aa2ff;--bad:#ff7b6e;--ok:#5fd08a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:22px}h2{font-size:17px;margin-top:32px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500}.muted{color:var(--muted)}.bad{color:var(--bad)}.ok{color:var(--ok)}
pre{white-space:pre-wrap;font:inherit;margin:4px 0}button,input,select{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
button{cursor:pointer}button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.card{border:1px solid var(--line);border-radius:8px;padding:12px;margin:12px 0}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.scroll{overflow-x:auto}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
