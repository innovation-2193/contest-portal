import path from "path";

export const emailLogoCid = "police-innovation-contest-logo";

type BrandedEmailOptions = {
  heading: string;
  content: string;
  eyebrow?: string;
  subtitle?: string;
};

export function brandedEmailHtml({
  heading,
  content,
  eyebrow = "POLICE INNOVATION CONTEST 2026",
  subtitle,
}: BrandedEmailOptions) {
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#061127;font-family:Arial,'Noto Sans Thai',Tahoma,sans-serif;color:#172033;line-height:1.7">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(subtitle || heading)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#061127">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #d8b62f;border-radius:14px;overflow:hidden">
            <tr>
              <td style="padding:0;background:#123c73;border-bottom:5px solid #d8b62f">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="92" valign="middle" style="padding:24px 0 24px 26px">
                      <img src="cid:${emailLogoCid}" width="70" height="70" alt="Police Innovation Contest 2026" style="display:block;width:70px;height:70px;object-fit:contain;border:0">
                    </td>
                    <td valign="middle" style="padding:24px 26px 24px 16px">
                      <div style="font-size:12px;font-weight:700;line-height:1.4;color:#f5d857">${escapeHtml(eyebrow)}</div>
                      <h1 style="margin:7px 0 0;font-size:27px;line-height:1.3;color:#ffffff;font-weight:800">${escapeHtml(heading)}</h1>
                      ${subtitle ? `<p style="margin:7px 0 0;font-size:15px;line-height:1.6;color:#dfe8f7">${escapeHtml(subtitle)}</p>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px;font-size:16px;color:#172033">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px;background:#f5f7fb;border-top:1px solid #e2e7ef;font-size:13px;line-height:1.7;color:#5a6478">
                อีเมลนี้ส่งอัตโนมัติจากระบบ Police Innovation Contest 2026 กรุณาอย่าตอบกลับอีเมลนี้<br>
                หากต้องการความช่วยเหลือ ติดต่อ
                <a href="mailto:innocontest@police.go.th" style="color:#123c73;font-weight:700;text-decoration:none">innocontest@police.go.th</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function brandedEmailLogoAttachment() {
  return {
    filename: "police-innovation-contest-logo.png",
    path: path.join(process.cwd(), "public", "logo-3d.png"),
    cid: emailLogoCid,
    contentType: "image/png",
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
