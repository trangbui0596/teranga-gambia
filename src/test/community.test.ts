import { describe, expect, it } from "vitest";
import {
  ALERT_KINDS, ALERT_TEXT, COMMUNITY_MENU, ago, alertPosted, alertSms, cleanPlace, formatAlertList, formatBilingualItem, formatPulse,
  noNotices, parseAlertCommand, translationLabel, visitorNotice, type ActiveAlert,
} from "@/lib/community";
import { SMS_OPT_OUT, smsSegments } from "@/lib/sms-text";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60000).toISOString();

describe("community alert commands", () => {
  it("shows the menu for a bare ALERT and parses a kind by number or word, with an optional place", () => {
    expect(parseAlertCommand("ALERT")).toEqual({ menu: true });
    expect(parseAlertCommand("alert 2 Tendaba road")).toEqual({ kind: "road", place: "Tendaba road" });
    expect(parseAlertCommand("ALERT flood")).toEqual({ kind: "flood", place: null });
    expect(parseAlertCommand(" Alert  6 ")).toEqual({ kind: "clear", place: null });
    expect(parseAlertCommand("ALERT closed Kartong")).toEqual({ kind: "closed", place: "Kartong" });
  });

  it("rejects unknown kinds and ignores everything that is not an alert command", () => {
    expect(parseAlertCommand("ALERT 9")).toEqual({ invalid: true });
    expect(parseAlertCommand("ALERT banana")).toEqual({ invalid: true });
    for (const t of ["ALERTS", "alerting", "hello", "", "REVIEW 1234", "ALERT2"]) expect(parseAlertCommand(t), t).toBeNull();
  });

  it("keeps only a short place name: no links, phone numbers, emails or markup", () => {
    expect(cleanPlace("Tendaba road")).toBe("Tendaba road");
    expect(cleanPlace("http://evil.example/x +220 123 4567 Tendaba")).toBe("Tendaba");
    expect(cleanPlace("*bold* _it_ me@x.org Kartong")).toBe("bold it Kartong");
    expect(cleanPlace("a".repeat(100))?.length).toBe(40);
    expect(cleanPlace("   ")).toBeNull();
    expect(cleanPlace(null)).toBeNull();
    expect(parseAlertCommand("ALERT 2 https://x.example +2201234567")).toEqual({ kind: "road", place: null });
  });
});

describe("notices shown to visitors", () => {
  const flood: ActiveAlert = { kind: "flood", place: "Kartong", created_at: at(180) };
  const road: ActiveAlert = { kind: "road", place: "Tendaba road", created_at: at(30) };

  it("shows nothing when there is no active notice", () => {
    expect(visitorNotice([], "en", NOW)).toBe("");
    expect(visitorNotice([{ kind: "clear", place: null, created_at: at(1) }], "en", NOW)).toBe("");
  });

  it("is in the visitor's language, says when it was posted, and says it is not an official warning", () => {
    const en = visitorNotice([road, flood], "en", NOW);
    expect(en).toContain("Community notice (30 min ago): Road closed or flooded: Tendaba road");
    expect(en).toContain("Flooding in the area: river and road trips may be cancelled or changed. (Kartong)");
    expect(en).toContain("not an official warning");
    const de = visitorNotice([road], "de", NOW);
    expect(de).toContain("Hinweis der Community (vor 30 Min.): Straße gesperrt oder überflutet: Tendaba road");
    expect(de).toContain("keine amtliche Warnung");
    expect(visitorNotice([road], "nl", NOW)).toContain("geen officiële waarschuwing");
  });

  it("shows at most two notices", () => {
    const three = [road, flood, { kind: "storm" as const, place: null, created_at: at(5) }];
    expect(visitorNotice(three, "en", NOW).split("\n").filter((l) => l.startsWith("⚠️")).length).toBe(2);
  });

  it("formats time ago", () => {
    expect(ago(30_000, "en")).toBe("just now");
    expect(ago(35 * 60000, "en")).toBe("35 min ago");
    expect(ago(3 * 3600000, "en")).toBe("3 h ago");
    expect(ago(3 * 3600000, "nl")).toBe("3 u geleden");
    expect(noNotices("de")).toContain("Derzeit keine");
  });

  it("every kind has all four languages and no invented numbers or links", () => {
    for (const k of ALERT_KINDS) {
      for (const l of ["en", "de", "nl", "wo"] as const) {
        const t = ALERT_TEXT[k.kind][l];
        expect(t.length, `${k.kind} ${l}`).toBeGreaterThan(10);
        expect(t).not.toMatch(/\d|https?:/);
      }
    }
  });
});

describe("messages for members and the community champion", () => {
  it("SMS to a member is Wolof first, short, GSM-only, with the opt-out line", () => {
    const s = alertSms("road", "Tendaba road");
    expect(s).toContain("Teranga ndigal bu mbootaay: Yoon bi tej na walla ndox bi fees na ko: Tendaba road");
    expect(s.endsWith(SMS_OPT_OUT)).toBe(true);
    expect(smsSegments(s)).toBeLessThanOrEqual(3);
    expect(alertSms("clear", null)).toContain("Lépp baax na");
  });

  it("the menu lists the commands in Wolof with English glosses", () => {
    expect(COMMUNITY_MENU).toContain("ALERT = yónnee ndigal ci sa mbokk yi _(send a notice to the members)_");
    expect(COMMUNITY_MENU).toContain("BILINGUAL = seetal tekki yi (Wolof ak Angale) _(check translations (Wolof and English))_");
  });

  it("says exactly what happened after posting, including that demo members were not messaged", () => {
    const ok = alertPosted("road", "Tendaba", "sent", 3);
    expect(ok).toContain("SMS sent to Noor");
    expect(ok).toContain("3 simulated members (demo) were not messaged");
    expect(ok).toContain("not an official warning");
    expect(alertPosted("flood", null, "failed", 3)).toContain("US carrier registration pending");
    expect(alertPosted("clear", null, "sent", 3, 2)).toContain("Notices cleared");
  });

  it("lists active notices and ignores cleared ones", () => {
    expect(formatAlertList([], NOW)).toContain("No active notices");
    const t = formatAlertList([{ kind: "road", place: "Tendaba", created_at: at(90) }, { kind: "clear", place: null, created_at: at(1) }], NOW);
    expect(t).toContain("Road closed or flooded");
    expect(t).toContain("Tendaba");
    expect(t).not.toContain("All clear _(");
  });

  it("the overview labels real and simulated members separately", () => {
    const t = formatPulse({ realMembers: 1, simulatedMembers: 3, activeNotices: 1, translationsWaiting: 2, contactRequests: 0, approved: 4, cards: 10 });
    expect(t).toContain("*4* _(1 real, 3 simulated)_");
    expect(t).toContain("*2*");
    expect(t).toContain("unverified");
  });
});

describe("bilingual review and the label visitors see", () => {
  it("shows the Wolof transcript and the English side by side with three clear choices", () => {
    const t = formatBilingualItem({ topic: "price", transcript: "yuñi ak juróom teemeer daala sii", english: "It costs 1500 dalasi per adult.", numbers: "about 1500 + dalasi", flags: ["machine-translated", "round-trip drift"] }, 2);
    expect(t).toContain("Translation check");
    expect(t).toContain("“yuñi ak juróom teemeer daala sii”");
    expect(t).toContain("“It costs 1500 dalasi per adult.”");
    expect(t).toContain("about 1500 + dalasi");
    expect(t).toContain("⚠️ round-trip drift");
    expect(t).not.toContain("⚠️ machine-translated");
    expect(t).toMatch(/1️⃣[\s\S]*2️⃣[\s\S]*3️⃣/);
  });

  it("only claims a check when a bilingual reviewer approved it, and only for the English", () => {
    expect(translationLabel("en", false)).toBe("Machine-translated");
    expect(translationLabel("en", true)).toContain("English checked by a bilingual reviewer");
    expect(translationLabel("de", true)).toContain("Englisch von einer zweisprachigen Person geprüft");
    expect(translationLabel("nl", false)).toBe("Machinevertaald");
  });
});
