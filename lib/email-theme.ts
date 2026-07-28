import path from "path";

export const emailLogoCid = "police-innovation-contest-logo";
const emailFontStack = "Arial, 'Helvetica Neue', 'Noto Sans Thai', Tahoma, sans-serif";

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
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(heading)}</title>
    <style>
      :root { color-scheme: light only; }
      body,
      table,
      td,
      div,
      p,
      a,
      h1,
      h2,
      h3,
      strong {
        font-family: ${emailFontStack} !important;
      }
      p {
        line-height: 1.78;
      }
      .email-content,
      .email-content div,
      .email-content p,
      .email-content a,
      .email-content strong {
        word-break: normal;
        overflow-wrap: break-word;
        line-break: loose;
      }
      a {
        text-decoration-thickness: 1px;
      }
      @media only screen and (max-width: 480px) {
        .email-outer-pad { padding: 14px 10px !important; }
        .email-header-logo,
        .email-header-copy {
          display: block !important;
          box-sizing: border-box !important;
          width: 100% !important;
          text-align: center !important;
        }
        .email-header-logo { padding: 26px 24px 8px !important; }
        .email-header-logo img { margin: 0 auto !important; }
        .email-header-copy { padding: 4px 24px 28px !important; }
        .email-header-title { font-size: 22px !important; line-height: 1.35 !important; }
        .email-header-subtitle { font-size: 14px !important; line-height: 1.65 !important; }
        .email-content { padding: 24px 20px !important; font-size: 15px !important; line-height: 1.74 !important; }
        .email-footer { padding: 17px 20px !important; }
        .winner-line-grid,
        .winner-line-qr,
        .winner-line-copy {
          display: block !important;
          box-sizing: border-box !important;
          width: 100% !important;
        }
        .winner-line-qr {
          padding: 0 0 16px !important;
          text-align: center !important;
        }
        .winner-line-copy {
          padding: 0 !important;
          text-align: left !important;
        }
        .winner-award-title {
          font-size: 24px !important;
          line-height: 1.38 !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#061127;font-family:${emailFontStack};color:#172033;line-height:1.7;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(subtitle || heading)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#061127;font-family:${emailFontStack}">
      <tr>
        <td class="email-outer-pad" align="center" style="padding:24px 12px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #d8b62f;border-radius:14px;overflow:hidden;font-family:${emailFontStack}">
            <tr>
              <td style="padding:0;background:#123c73;border-bottom:5px solid #d8b62f">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td class="email-header-logo" width="92" valign="middle" style="padding:24px 0 24px 26px">
                      <img src="cid:${emailLogoCid}" width="70" height="70" alt="Police Innovation Contest 2026" style="display:block;width:70px;height:70px;object-fit:contain;border:0">
                    </td>
                    <td class="email-header-copy" valign="middle" style="padding:24px 26px 24px 16px">
                      <div style="font-size:12px;font-weight:700;line-height:1.4;color:#f5d857">${escapeHtml(eyebrow)}</div>
                      <h1 class="email-header-title" style="margin:7px 0 0;font-size:27px;line-height:1.3;color:#ffffff;font-weight:800">${escapeHtml(heading)}</h1>
                      ${subtitle ? `<p class="email-header-subtitle" style="margin:7px 0 0;font-size:15px;line-height:1.6;color:#dfe8f7">${escapeHtml(subtitle)}</p>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-content" style="padding:28px 30px;font-family:${emailFontStack};font-size:16px;font-weight:400;color:#172033;background:#ffffff;line-height:1.78">
                ${content}
              </td>
            </tr>
            <tr>
              <td class="email-footer" style="padding:18px 30px;background:#f5f7fb;border-top:1px solid #e2e7ef;font-family:${emailFontStack};font-size:13px;font-weight:400;line-height:1.7;color:#5a6478">
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
