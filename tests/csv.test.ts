import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../src/lib/csv";

describe("csv export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Hello, "world"')).toBe('"Hello, ""world"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("normal")).toBe("normal");
  });

  it("builds a BOM-prefixed CRLF document", () => {
    const out = toCsv(["A", "B"], [["x", "y,z"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿A,B\r\nx,\"y,z\"\r\n");
  });
});
