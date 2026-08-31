import { describe, expect, it } from "vitest";
import { parseEstimate, validateDraft } from "./composer";

describe("parseEstimate", () => {
  it("reads whole positive minutes", () => {
    expect(parseEstimate("30")).toBe(30);
    expect(parseEstimate(" 45 ")).toBe(45);
    expect(parseEstimate("12.9")).toBe(12);
  });

  it("treats blank, zero, negative and junk as not given", () => {
    expect(parseEstimate("")).toBeNull();
    expect(parseEstimate("   ")).toBeNull();
    expect(parseEstimate("0")).toBeNull();
    expect(parseEstimate("-5")).toBeNull();
    expect(parseEstimate("soon")).toBeNull();
  });
});

describe("validateDraft", () => {
  const base = {
    title: "Call the vendor",
    estimate: "",
    quadrant: "do_first" as const,
    section: "tgm_tasks",
    requiresEstimate: false,
  };

  it("accepts a complete draft and returns the trimmed title", () => {
    const v = validateDraft({ ...base, title: "  Call the vendor  " });
    expect(v.ok).toBe(true);
    expect(v.title).toBe("Call the vendor");
    expect(v.estimate).toBeNull();
  });

  it("requires a title", () => {
    const v = validateDraft({ ...base, title: "   " });
    expect(v.ok).toBe(false);
    expect(v.errors.title).toBe(true);
  });

  it("requires a quadrant", () => {
    const v = validateDraft({ ...base, quadrant: null });
    expect(v.ok).toBe(false);
    expect(v.errors.quadrant).toBe(true);
  });

  it("requires a category", () => {
    const v = validateDraft({ ...base, section: null });
    expect(v.ok).toBe(false);
    expect(v.errors.section).toBe(true);
  });

  it("requires minutes only for categories flagged for them", () => {
    expect(validateDraft({ ...base, requiresEstimate: true }).errors.estimate).toBe(true);
    const ok = validateDraft({ ...base, requiresEstimate: true, estimate: "20" });
    expect(ok.ok).toBe(true);
    expect(ok.estimate).toBe(20);
    expect(validateDraft({ ...base, estimate: "" }).errors.estimate).toBe(false);
  });

  it("flags every missing field at once", () => {
    const v = validateDraft({
      title: "",
      estimate: "",
      quadrant: null,
      section: null,
      requiresEstimate: true,
    });
    expect(v.errors).toEqual({ title: true, estimate: true, quadrant: true, section: true });
  });
});
