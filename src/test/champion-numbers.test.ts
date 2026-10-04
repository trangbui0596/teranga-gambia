import { describe, it, expect } from "vitest";
import { numbersHeard } from "@/lib/numbers";
import { recordingCommand, ROUND_HINT, roundStoppedText } from "@/lib/champion-commands";

describe("recording-round commands", () => {
  it("handles REVIEW, STOP/DONE/EXIT, HELP/STATUS instead of nagging", () => {
    expect(recordingCommand("REVIEW", false)).toBe("review");
    for (const w of ["STOP", "DONE", "EXIT"]) expect(recordingCommand(w, false)).toBe("stop");
    expect(recordingCommand("HELP", false)).toBe("help");
    expect(recordingCommand("STATUS", false)).toBe("help");
  });
  it("digits 1/2/3 work only when a review item is open", () => {
    expect(recordingCommand("1", true)).toBe("digit");
    expect(recordingCommand("3", true)).toBe("digit");
    expect(recordingCommand("1", false)).toBeNull();
  });
  it("other text still gets the voice-note reminder", () => {
    expect(recordingCommand("HELLO", true)).toBeNull();
    expect(recordingCommand("4", true)).toBeNull();
  });
  it("stop message says how many were saved and to send REVIEW", () => {
    expect(roundStoppedText(3)).toBe("Round stopped. 3 answers saved. Send REVIEW to review them.");
    expect(ROUND_HINT).toBe("Send DONE when you are done, or REVIEW to review.");
  });
});

describe("numbers heard", () => {
  it("reads the real failing transcript as about 1500 dalasi", () => {
    expect(numbersHeard("Niech by moi juniak jurom témér dalasi.")).toBe("juni ak jurom témér (about 1500) + dalasi");
  });
  it("juniak jurom témér dalasi -> 1500", () => {
    expect(numbersHeard("juniak jurom témér dalasi")).toContain("(about 1500) + dalasi");
  });
  it("ñaar fukk dalasi -> 20", () => {
    expect(numbersHeard("ñaar fukk dalasi")).toBe("ñaar fukk (about 20) + dalasi");
  });
  it("benn waxtu -> time word", () => {
    expect(numbersHeard("benn waxtu")).toContain("waxtu (time word)");
  });
  it("other combinations", () => {
    expect(numbersHeard("juróom benn")).toContain("(about 6)");
    expect(numbersHeard("juróom ñaar téeméer")).toContain("(about 700)");
    expect(numbersHeard("fukk ak benn")).toContain("(about 11)");
  });
  it("unclear words are shown as heard with please confirm, never a made-up number", () => {
    const out = numbersHeard("benn ñaar dalasi");
    expect(out).toContain("benn ñaar (please confirm)");
    expect(out).not.toMatch(/about/);
  });
  it("currency without a number", () => {
    expect(numbersHeard("Mu ngi dalasi")).toBe("Price words heard but number unclear: please confirm");
  });
  it("unchanged cases", () => {
    expect(numbersHeard("Tanji Bridge")).toBe("none found");
    expect(numbersHeard("1500 dalasi")).toBe("1500 dalasi");
    expect(numbersHeard("Start 9:00, price 1500 dalasi")).toBe("9:00, 1500 dalasi");
    expect(numbersHeard(null)).toBe("none");
  });
});

describe("numbers heard: live ASR spellings and safety", () => {
  it("yuñi ak juróom teemeer daala sii -> 1500 dalasi (live transcript)", () => {
    const r = numbersHeard("Ñegg bi mooy yuñi ak juróom teemeer daala sii.");
    expect(r).toContain("about 1500");
    expect(r).toContain("dalasi");
    expect(r).not.toContain("about 500");
  });
  it("an unknown word before 'ak' never yields a smaller confident number", () => {
    const r = numbersHeard("Ñegg bi mooy fuuni ak juróom teemeer dalasi");
    expect(r).not.toContain("about 500");
    expect(r).toContain("please confirm");
  });
  it("known cases still work", () => {
    expect(numbersHeard("juniak jurom témér dalasi")).toContain("about 1500");
    expect(numbersHeard("The price is 1500 dalasi")).toContain("1500");
    expect(numbersHeard("Tanji Bridge")).toBe("none found");
  });
});

describe("price clip as the recognizer actually spells it", () => {
  it("reads every spelling heard for the synthetic price clip as 1500", () => {
    for (const t of [
      "Niech by mój juniak Jurón témér dalasi.",
      "Niech by mój juniak Jurą témér dalasi.",
      "Niech by mój juniak Jurą temę dałasi.",
      "Niech by mój juniak jurom témér dalasi.",
    ]) expect(numbersHeard(t)).toContain("(about 1500)");
  });
});

import { certainValues, mentionsNumber } from "@/lib/numbers";
describe("number helpers", () => {
  it("finds certain values and ignores unclear ones", () => {
    expect(certainValues("Niech by mój juniak Jurón témér dalasi.")).toEqual([1500]);
    expect(certainValues("Price words dalasi")).toEqual([]);
  });
  it("recognises a number in digits or words", () => {
    for (const e of ["1500 dalasi", "1,500 dalasi", "one thousand five hundred dalasi", "fifteen hundred dalasi", "One thousand and five hundred"]) expect(mentionsNumber(e, 1500)).toBe(true);
    expect(mentionsNumber("Five hundred dalasi", 1500)).toBe(false);
  });
});
