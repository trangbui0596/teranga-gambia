// Weekly digest for Noor's family helper on WhatsApp: Wolof first, small English in italics (same layout as the review
// messages). Fixed templates, counts only: no runtime AI and nothing invented. The SMS version stays in sms.ts (registered
// A2P wording). UNVERIFIED Wolof written by Claude, see champion.templates.ts.
import { bi, sl, topicWo, topicEn, UNVERIFIED_FOOTER } from "./champion.templates";

const plain = (value: string) => value.replace(/(?:https?:\/\/|www\.)\S+/gi, "").replace(/\s+/g, " ").trim();

export function weeklyDigestWhatsApp(
  total: number,
  topics: Array<{ topic: string; count: number }>,
  unanswered: Array<{ text: string; isSample: boolean }>,
  referrals = 0,
): string {
  const lines: string[] = [`📊 *Xibaar ayubés bi* _(Weekly digest)_`, ""];
  if (total === 0) {
    lines.push(bi("Amul laaj ayubés bi.", "No visitor questions this week."));
  } else {
    lines.push(`*${total}* ${sl("laaj ayubés bi", "visitor questions this week")}`);
    const top = [...topics].sort((a, b) => b.count - a.count).slice(0, 3);
    if (top.length) {
      lines.push("");
      for (const { topic, count } of top) {
        const label = topic === "unanswered" ? sl("Amul tontu", "No answer yet") : sl(topicWo(topic), topicEn(topic));
        lines.push(`• ${label}: *${count}*`);
      }
    }
  }
  const un = unanswered.map((u) => ({ text: plain(u.text).slice(0, 80), isSample: u.isSample })).filter((u) => u.text).slice(0, 3);
  if (un.length) {
    lines.push("", `❓ *${sl("Laaj yu amul tontu", "Unanswered")}*`);
    for (const u of un) lines.push(`• “${u.text}”${u.isSample ? " _(Sample)_" : ""}`);
    lines.push("", `🎙️ ${sl("Defal tontu bu bees ci laaj yooyu", "Record new answers for these")}`);
  }
  if (referrals > 0) lines.push("", `🤝 ${sl("Ndimbal ak yeneen operatëer", "Partner suggestions")}: *${referrals}* _(Simulated)_`);
  lines.push("", UNVERIFIED_FOOTER);
  return lines.join("\n");
}
