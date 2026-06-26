import { describe, expect, it } from "vitest";
import { mergeIrDocs, parseFmpFilings, parseSecSubmissions, type IrDoc } from "./_ir";

describe("parseSecSubmissions", () => {
  const submissions = {
    filings: {
      recent: {
        accessionNumber: ["0000320193-24-000123", "0000320193-24-000050", "0000320193-24-000049"],
        form: ["10-K", "4", "8-K"],
        filingDate: ["2024-11-01", "2024-10-15", "2024-08-01"],
        primaryDocument: ["aapl-20240928.htm", "wk-form4.xml", "aapl-8k.htm"],
        primaryDocDescription: ["Annual report", "", "8-K"],
      },
    },
  };

  it("keeps only investor-relations forms and builds archive URLs", () => {
    const docs = parseSecSubmissions(submissions, "0000320193");
    expect(docs).toHaveLength(2); // Form 4 dropped
    expect(docs.map((d) => d.form)).toEqual(["10-K", "8-K"]);
    expect(docs[0].url).toBe(
      "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm",
    );
    expect(docs[0].title).toBe("10-K — Annual report");
    expect(docs[0].source).toBe("sec");
  });

  it("does not duplicate the form when the description repeats it", () => {
    const docs = parseSecSubmissions(submissions, "0000320193");
    const eightK = docs.find((d) => d.form === "8-K");
    expect(eightK?.title).toBe("8-K");
  });

  it("returns [] for malformed input", () => {
    expect(parseSecSubmissions(null, "0000320193")).toEqual([]);
    expect(parseSecSubmissions({}, "0000320193")).toEqual([]);
  });
});

describe("parseFmpFilings", () => {
  it("maps rows with a link and drops linkless ones", () => {
    const rows = [
      { type: "10-Q", fillingDate: "2024-08-02 16:30:00", finalLink: "https://sec.gov/x/a.htm" },
      { type: "8-K", date: "2024-06-01", link: "https://sec.gov/x/b.htm" },
      { type: "8-K", date: "2024-05-01" }, // no link → skipped
    ];
    const docs = parseFmpFilings(rows);
    expect(docs).toHaveLength(2);
    expect(docs[0].date).toBe("2024-08-02");
    expect(docs[0].source).toBe("fmp");
  });

  it("returns [] for non-arrays", () => {
    expect(parseFmpFilings(null)).toEqual([]);
    expect(parseFmpFilings({})).toEqual([]);
  });
});

describe("mergeIrDocs", () => {
  const sec: IrDoc[] = [
    { id: "sec:1", title: "10-K", form: "10-K", date: "2024-11-01", url: "https://sec.gov/A.htm", source: "sec" },
  ];
  const fmp: IrDoc[] = [
    { id: "fmp:1", title: "10-K (FMP)", form: "10-K", date: "2024-11-01", url: "https://sec.gov/A.htm/", source: "fmp" },
    { id: "fmp:2", title: "8-K (FMP)", form: "8-K", date: "2024-12-01", url: "https://sec.gov/B.htm", source: "fmp" },
  ];

  it("dedupes by URL (trailing slash / case insensitive), preferring the first source", () => {
    const merged = mergeIrDocs(sec, fmp);
    expect(merged).toHaveLength(2);
    const tenK = merged.find((d) => d.form === "10-K");
    expect(tenK?.source).toBe("sec"); // EDGAR wins over the FMP mirror
  });

  it("sorts newest-first", () => {
    const merged = mergeIrDocs(sec, fmp);
    expect(merged.map((d) => d.date)).toEqual(["2024-12-01", "2024-11-01"]);
  });
});
