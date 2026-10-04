import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "@/components/landing/Landing";
import { STORYBOOK } from "@/lib/landing-content";

const d = () => {
  const doc = document.implementation.createHTMLDocument("t");
  doc.body.innerHTML = renderToStaticMarkup(<Landing />);
  return doc;
};

describe("storybook", () => {
  it("has a cover, a page per day and an ending, in order", () => {
    expect(STORYBOOK[0]!.kind).toBe("cover");
    expect(STORYBOOK.at(-1)!.kind).toBe("end");
    expect(STORYBOOK.filter((p) => p.kind === "step").map((p) => p.day)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });
  it("renders every page with next and back controls and one dot per page", () => {
    const doc = d();
    expect(doc.querySelectorAll('#storybook [aria-roledescription="slide"]').length).toBe(
      STORYBOOK.length,
    );
    expect(doc.querySelectorAll('#storybook [role="tab"]').length).toBe(STORYBOOK.length);
    const text = doc.querySelector("#storybook")!.textContent ?? "";
    expect(text).toContain("Next");
    expect(text).toContain("Back");
    expect(text).toContain("No internet");
    expect(text).toContain("Tourist needs internet");
  });
  it("starts with all detail chapters closed", () => {
    expect(d().querySelectorAll('#explore [role="region"]').length).toBe(0);
  });
});
