/** Pure A2P sample-message formatting; never add links or change the opt-out footer. */
const FOOTER = " Reply STOP to opt out, HELP for help.";
const MAX_DIGEST_LENGTH = 319; // strictly under 320 characters

const plain = (value: string) => value
  .replace(/(?:https?:\/\/|www\.)\S+/gi, "")
  .replace(/\s+/g, " ")
  .trim();

export function callSummarySms(count: number): string {
  return `Teranga: Got ${count} of 10 answers from your call. Your family helper will check them. Reply STOP to opt out.`;
}

export function weeklyDigestSms(
  total: number,
  topics: Array<{ topic: string; count: number }>,
  unanswered: Array<{ text: string; isSample: boolean }>,
): string {
  let body = `Teranga weekly digest: ${total} visitor questions in 7 days.`;
  // Reserve space for the unanswered section and the mandatory footer.
  for (const { topic, count } of topics.slice(0, 3)) {
    const label = plain(topic).slice(0, 60);
    if (!label) continue;
    const part = ` ${label}: ${count}.`;
    if ((body + part + " Unanswered: none." + FOOTER).length > MAX_DIGEST_LENGTH) break;
    body += part;
  }

  body += " Unanswered: ";
  const questions: string[] = [];
  for (const item of unanswered.slice(0, 3)) {
    const clean = plain(item.text).slice(0, 60).trim();
    if (!clean) continue;
    const label = `${clean}${item.isSample ? " (Sample)" : ""}`;
    const candidate = [...questions, label].join("; ");
    if ((body + candidate + "." + FOOTER).length > MAX_DIGEST_LENGTH) break;
    questions.push(label);
  }
  body += `${questions.length ? questions.join("; ") : "none"}.${FOOTER}`;
  return body;
}

/** SMS first, then a single WhatsApp attempt with identical text on any SMS send error. */
export async function sendSmsWithFallback(
  text: string,
  sendSms: () => Promise<boolean>,
  sendWhatsApp: () => Promise<boolean>,
  log: (message: string) => void = console.info,
): Promise<{ sent: boolean; channel: "sms" | "whatsapp" | "none" }> {
  try {
    if (await sendSms()) {
      log("Teranga notification sent via SMS");
      return { sent: true, channel: "sms" };
    }
    // A false result means the outbound cap was reached. Do not bypass it.
    log("Teranga notification not sent: outbound cap reached");
    return { sent: false, channel: "none" };
  } catch (error) {
    console.error("Teranga SMS failed; trying WhatsApp once", error);
  }
  try {
    if (await sendWhatsApp()) {
      log("Teranga notification sent via WhatsApp fallback");
      return { sent: true, channel: "whatsapp" };
    }
  } catch (error) {
    console.error("Teranga WhatsApp fallback failed", error);
  }
  log("Teranga notification not sent after WhatsApp fallback");
  return { sent: false, channel: "none" };
}