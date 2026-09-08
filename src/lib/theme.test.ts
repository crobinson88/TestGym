import { describe, expect, it } from "vitest";
import { clampTheme, preferredTheme } from "./theme";

describe("theme", () => {
  it("keeps the two known themes", () => {
    expect(clampTheme("light")).toBe("light");
    expect(clampTheme("dark")).toBe("dark");
  });

  it("falls back to dark for anything else", () => {
    expect(clampTheme("solarized")).toBe("dark");
    expect(clampTheme(null)).toBe("dark");
  });

  it("starts dark unless light was explicitly chosen", () => {
    expect(preferredTheme("light")).toBe("light");
    expect(preferredTheme("dark")).toBe("dark");
    expect(preferredTheme(null)).toBe("dark");
  });
});
