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
