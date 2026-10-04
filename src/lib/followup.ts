// Follow-up to tourists. When the system is not sure, the visitor can reply NOTIFY and is messaged once Noor's answer exists
// (after the household champion approves it in the weekly sync). Fixed texts in English, German and Dutch. Pure, no I/O.
export type FollowLang = "en" | "de" | "nl";

export const NOTIFY_HINT: Record<FollowLang, string> = {
  en: "Reply NOTIFY and we will message you here when Noor has answered.",
  de: "Antworten Sie NOTIFY, dann schreiben wir Ihnen hier, sobald Noor geantwortet hat.",
  nl: "Antwoord NOTIFY, dan sturen we je hier een bericht zodra Noor heeft geantwoord.",
};
export const NOTIFY_OK: Record<FollowLang, string> = {
  en: "Noted. We will message you here when Noor has answered. We keep your number only until then and delete it after.",
  de: "Notiert. Wir schreiben Ihnen hier, sobald Noor geantwortet hat. Wir speichern Ihre Nummer nur bis dahin und löschen sie danach.",
  nl: "Genoteerd. We sturen je hier een bericht zodra Noor heeft geantwoord. We bewaren je nummer alleen tot dan en verwijderen het daarna.",
};
export const NOTIFY_NONE: Record<FollowLang, string> = {
  en: "Ask a question first. If Noor has no answer yet, reply NOTIFY.",
  de: "Stellen Sie zuerst eine Frage. Wenn Noor noch keine Antwort hat, antworten Sie NOTIFY.",
  nl: "Stel eerst een vraag. Heeft Noor nog geen antwoord, antwoord dan NOTIFY.",
};
export const FOLLOWUP_INTRO: Record<FollowLang, string> = {
  en: "Noor has now answered your question",
  de: "Noor hat Ihre Frage jetzt beantwortet",
  nl: "Noor heeft je vraag nu beantwoord",
};

/** Message sent when an answer exists: the visitor's own question, then Noor's approved answer. */
export function followupMessage(
  lang: FollowLang,
  question: string,
  answer: string,
  label: string,
): string {
  return `${FOLLOWUP_INTRO[lang]}: “${question.slice(0, 120)}”\n\n${answer}\n— ${label}`;
}

/** Whatsapp numbers arrive as "whatsapp:+1555..."; SMS numbers as "+1555...". */
export const channelOf = (from: string): "whatsapp" | "sms" =>
  from.startsWith("whatsapp:") ? "whatsapp" : "sms";
export const plainNumber = (from: string) => from.replace(/^whatsapp:/, "");
