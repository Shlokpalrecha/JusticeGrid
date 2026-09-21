/**
 * Minimal, dependency-free CSV serialization (RFC 4180) — every report
 * and the audit log export (spec §7) go through this, so escaping stays
 * correct and consistent in one place rather than re-implemented per
 * export route.
 */
export type CsvValue = string | number | boolean | null | undefined;

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  // Trailing CRLF per RFC 4180; also the conventional "end of file" marker
  // most spreadsheet tools expect.
  return lines.join("\r\n") + "\r\n";
}
