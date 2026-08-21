import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import { brandedEmailHtml, brandedEmailLogoAttachment } from "./email-theme";

type AdminMailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  outboxKey: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer | string;
    cid?: string;
    contentType?: string;
  }>;
  emailHeading?: string;
  emailEyebrow?: string;
  emailSubtitle?: string;
  emailFooterExtra?: string;
};

type MailStatus = "sent" | "outbox" | "failed";

const storageDir = process.env.APP_STORAGE_DIR ?? path.join(process.cwd(), "storage");

export async function sendAdminMail(input: AdminMailInput) {
  try {
    const smtpUrl = process.env.SMTP_URL;
    const smtpHost = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM ?? "Police Innovation Contest 2026 <no-reply@police.go.th>";

    if (!smtpUrl && !smtpHost) {
      await writeDevOutbox(input);
      return { status: "outbox" satisfies MailStatus };
    }

    const transporter = smtpUrl
      ? nodemailer.createTransport(smtpUrl)
      : nodemailer.createTransport({
          host: smtpHost,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
            : undefined,
          tls: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "false"
            ? { rejectUnauthorized: false }
            : undefined,
        });

    const html = brandedEmailHtml({
      heading: input.emailHeading ?? input.subject,
      eyebrow: input.emailEyebrow,
      subtitle: input.emailSubtitle,
      footerExtra: input.emailFooterExtra,
      content: input.html,
    });
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html,
      attachments: [brandedEmailLogoAttachment(), ...(input.attachments ?? [])],
    });
    return { status: "sent" satisfies MailStatus };
  } catch (error) {
    console.error("admin email failed", error);
    return { status: "failed" satisfies MailStatus };
  }
}

async function writeDevOutbox(input: AdminMailInput) {
  const outbox = path.join(storageDir, "email-outbox", "admin", safeOutboxKey(input.outboxKey));
  const html = brandedEmailHtml({
    heading: input.emailHeading ?? input.subject,
    eyebrow: input.emailEyebrow,
    subtitle: input.emailSubtitle,
    footerExtra: input.emailFooterExtra,
    content: input.html,
  });
  await mkdir(outbox, { recursive: true });
  const attachments = await Promise.all((input.attachments ?? []).map(async (attachment) => ({
    filename: attachment.filename,
    cid: attachment.cid,
    contentType: attachment.contentType,
    content: attachment.content
      ? Buffer.from(attachment.content).toString("base64")
      : attachment.path
        ? (await readFile(attachment.path)).toString("base64")
        : undefined,
  })));
  await writeFile(
    path.join(outbox, "email.json"),
    `${JSON.stringify({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html,
      attachments,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`,
    "utf8",
  );
}

function safeOutboxKey(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120) || "message";
}
