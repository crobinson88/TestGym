import { describe, expect, it } from "vitest";
import { htmlToText, toEncodable, htmlToPdf } from "./_htmlpdf";

describe("htmlToText", () => {
  it("drops script/style/head and tags, keeping prose", () => {
    const html =
      "<html><head><title>x</title></head><body>" +
      "<style>.a{color:red}</style><script>evil()</script>" +
      "<p>Hello world</p></body></html>";
    const out = htmlToText(html);
    expect(out).toContain("Hello world");
    expect(out).not.toContain("evil");
    expect(out).not.toContain("color:red");
  });

  it("preserves paragraph breaks between block elements", () => {
    const out = htmlToText("<p>First</p><p>Second</p>");
    expect(out).toBe("First\n\nSecond");
  });

  it("turns list items into bullets and decodes entities", () => {
    const out = htmlToText("<ul><li>A &amp; B</li><li>C&nbsp;D</li></ul>");
    expect(out).toContain("• A & B");
    expect(out).toContain("• C D");
  });
});

describe("toEncodable", () => {
  it("maps smart punctuation to ASCII", () => {
    expect(toEncodable("“quote” — it’s …")).toBe('"quote" - it\'s ...');
  });

  it("collapses exotic spaces and strips unencodable code points", () => {
    expect(toEncodable("a b　c")).toBe("a b c");
    expect(toEncodable("emoji 😀 tail")).toBe("emoji  tail");
  });

  it("keeps printable Latin-1 letters", () => {
    expect(toEncodable("café résumé")).toBe("café résumé");
  });
});

describe("htmlToPdf", () => {
  it("produces a valid PDF byte stream", async () => {
    const bytes = await htmlToPdf("<h1>10-K</h1><p>Revenue grew.</p>", "ACME 10-K");
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("rejects an empty document", async () => {
    await expect(htmlToPdf("<html><body></body></html>")).rejects.toThrow(/no readable text/);
  });

  it("survives a giant unbroken token without throwing", async () => {
    const html = `<p>${"x".repeat(5000)}</p>`;
    const bytes = await htmlToPdf(html);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
