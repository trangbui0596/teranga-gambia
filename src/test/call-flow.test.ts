import { describe, expect, it } from "vitest";
import { parseCallPositions, questionTwimlBody, GOODBYE_TWIML_BODY, DEFAULT_CALL_POSITIONS } from "@/lib/call-flow";
import { callSummarySms } from "@/lib/sms";

describe("call flow", () => {
  it("defaults to card positions 1 and 5", () => {
    expect(DEFAULT_CALL_POSITIONS).toEqual([1, 5]);
    expect(parseCallPositions(undefined)).toEqual([1, 5]);
    expect(parseCallPositions("")).toEqual([1, 5]);
    expect(parseCallPositions("abc")).toEqual([1, 5]);
    expect(parseCallPositions("0,11")).toEqual([1, 5]);
    expect(parseCallPositions(" 2, 3 ,2")).toEqual([2, 3]);
    expect(parseCallPositions("1,2,3,4,5,6,7,8,9,10").length).toBe(10);
  });

  it("step 1 asks price, greets, pauses and records slowly", () => {
    const t = questionTwimlBody(1, [1, 5], { greet: true });
    expect(t).toContain("Hello Noor. Answer each question after the beep, then press hash.");
    expect(t).toContain("Question one. Price.");
    expect(t).toContain(`<Pause length="2"/><Record playBeep="true" timeout="8" maxLength="60" finishOnKey="#"`);
    expect(t).toContain("voice-recorded?n=1&amp;r=0");
  });

  it("step 2 asks children (card position 5)", () => {
    const t = questionTwimlBody(2, [1, 5]);
    expect(t).toContain("Question two. Children.");
    expect(t).not.toContain("Hello Noor");
    expect(t).toContain("voice-recorded?n=2&amp;r=0");
  });

  it("maps call steps to their own card positions", () => {
    const positions = parseCallPositions(undefined);
    expect(positions[0]).toBe(1); // price answer stored on position 1
    expect(positions[1]).toBe(5); // children answer stored on position 5
  });

  it("retry and goodbye wording", () => {
    expect(questionTwimlBody(2, [1, 5], { retry: true })).toContain("<Say>Please answer again.</Say>");
    expect(questionTwimlBody(2, [1, 5], { retry: true })).toContain("r=1");
    expect(GOODBYE_TWIML_BODY).toBe("<Say>Thank you. Your answers were saved. Goodbye.</Say><Hangup/>");
  });

  it("summary uses the number asked", () => {
    expect(callSummarySms(2, 2)).toBe("Teranga: Got 2 of 2 answers from your call. Your family helper will check them. Reply STOP to opt out.");
  });
});
