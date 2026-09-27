/**
 * Gestaltete HTML-Version für Mails mit Einwilligung (gleiche Optik wie scripts/lib/html_email.py).
 * Ohne Bilder, ohne externe Ressourcen, ohne Tracking. Die Text-Version bleibt der Inhalt.
 */
const NAVY = "#0F2A4A", ORANGE = "#FF7A1A", INK = "#1D2433", MUTED = "#667085", LINE = "#E4E7EC";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type MailBlock = { p: string } | { steps: string[]; title?: string } | { note: string };

export function renderMail(o: { lang: string; brand: string; blocks: MailBlock[]; closing: string; signer: string; footer: string }): string {
  const [head, ...rest] = o.brand.split(" ");
  const tail = rest.length ? " " + rest.join(" ") : "";
  const body = o.blocks.map((b) => {
    if ("p" in b) return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${INK};">${esc(b.p).replace(/\n/g, "<br>")}</p>`;
    if ("note" in b) return `<p style="margin:0 0 16px 0;padding:12px 16px;background:#FAFBFC;border:1px solid ${LINE};border-radius:8px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${esc(b.note)}</p>`;
    const rows = b.steps.map((s, i) =>
      `<tr><td valign="top" style="width:30px;padding:0 0 12px 0;font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${ORANGE};">${i + 1}</td>` +
      `<td style="padding:0 0 12px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${INK};">${esc(s)}</td></tr>`).join("");
    const title = b.title ? `<p style="margin:0 0 10px 0;font-family:${FONT};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:${ORANGE};">${esc(b.title)}</p>` : "";
    return `${title}<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">${rows}</table>`;
  }).join("\n");
  return `<!doctype html>
<html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title></title></head>
<body style="margin:0;padding:0;background:#F4F5F7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:10px;border:1px solid ${LINE};">
<tr><td style="height:4px;background:${NAVY};border-radius:10px 10px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 40px 8px 40px;"><span style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-0.4px;color:${NAVY};">${esc(head)}<span style="color:${ORANGE};">${esc(tail)}</span></span></td></tr>
<tr><td style="padding:20px 40px 4px 40px;">
${body}
<p style="margin:8px 0 14px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${INK};">${esc(o.closing)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-left:3px solid ${ORANGE};padding:2px 0 2px 14px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${NAVY};">${esc(o.signer)}</td></tr></table>
</td></tr>
<tr><td style="padding:28px 40px 32px 40px;"><div style="border-top:1px solid ${LINE};padding-top:16px;font-family:${FONT};font-size:11px;line-height:17px;color:${MUTED};">${esc(o.footer).replace(/\n/g, "<br>")}</div></td></tr>
</table></td></tr></table></body></html>`;
}
