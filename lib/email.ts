/**
 * Single notification entry point (spec §7).
 *
 * The default `console` driver prints the message — including invite and reset
 * links — to the server log, which is what makes the app demoable without an
 * email provider. Set EMAIL_DRIVER=resend plus RESEND_API_KEY to deliver mail.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

async function sendViaResend(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("EMAIL_DRIVER=resend requires RESEND_API_KEY.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "HR Platform <no-reply@example.com>",
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the message (${response.status}): ${await response.text()}`);
  }
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (process.env.EMAIL_DRIVER === "resend") {
    await sendViaResend(message);
    return;
  }

  console.info(
    ["", "─".repeat(72), `EMAIL → ${message.to}`, `Subject: ${message.subject}`, "", message.text, "─".repeat(72), ""].join(
      "\n",
    ),
  );
}

export function appUrl(path: string): string {
  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}
