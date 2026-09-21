import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.js";

describe("toCsv", () => {
  it("serializes headers and rows with CRLF line endings", () => {
    const csv = toCsv(
      ["id", "name"],
      [
        ["1", "Alice"],
        ["2", "Bob"],
      ],
    );
    expect(csv).toBe("id,name\r\n1,Alice\r\n2,Bob\r\n");
  });

  it("quotes cells containing commas, quotes, or newlines", () => {
    const csv = toCsv(["note"], [['Contains "quotes", a comma, and\na newline']]);
    expect(csv).toBe('note\r\n"Contains ""quotes"", a comma, and\na newline"\r\n');
  });

  it("renders null and undefined as empty cells", () => {
    const csv = toCsv(["a", "b"], [[null, undefined]]);
    expect(csv).toBe("a,b\r\n,\r\n");
  });

  it("renders numbers and booleans as their string form", () => {
    const csv = toCsv(["n", "b"], [[42, true]]);
    expect(csv).toBe("n,b\r\n42,true\r\n");
  });
});
