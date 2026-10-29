export interface IdentityRecord {
  id: string;
  kind: string;
  name: string;
  jurisdiction: string;
  reference: string;
  eventDate: string | null;
}
export const normalizeIdentity = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
/** Standard English Soundex; non-Latin tokens use deterministic Unicode prefixes. */
export function soundex(value: string): string {
  const text = normalizeIdentity(value).replace(/[^A-Z]/g, "");
  if (!text) return "U:" + normalizeIdentity(value).slice(0, 6);
  const groups: Record<string, string> = {
    B: "1",
    F: "1",
    P: "1",
    V: "1",
    C: "2",
    G: "2",
    J: "2",
    K: "2",
    Q: "2",
    S: "2",
    X: "2",
    Z: "2",
    D: "3",
    T: "3",
    L: "4",
    M: "5",
    N: "5",
    R: "6",
  };
  let result = text[0]!,
    last = groups[text[0]!] ?? "";
  for (const c of text.slice(1)) {
    if (c === "H" || c === "W") continue;
    const code = groups[c] ?? "";
    if (code && code !== last) result += code;
    last = code;
    if (result.length === 4) break;
  }
  return result.padEnd(4, "0");
}
/** Ukkonen band, O(k*L) time and O(L) scratch space; k <= 8. */
export function boundedLevenshtein(a: string, b: string, k = 3): number {
  if (!Number.isInteger(k) || k < 0 || k > 8) throw new RangeError("Edit threshold must be 0–8");
  if (Math.abs(a.length - b.length) > k) return k + 1;
  if (!a.length) return Math.min(b.length, k + 1);
  if (!b.length) return Math.min(a.length, k + 1);
  let previous = new Uint16Array(b.length + 1),
    current = new Uint16Array(b.length + 1);
  previous.fill(k + 1);
  for (let j = 0; j <= Math.min(b.length, k); j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    const start = Math.max(1, i - k),
      end = Math.min(b.length, i + k);
    if (start > 1) current[start - 1] = k + 1;
    if (end < b.length) current[end + 1] = k + 1;
    let best = k + 1;
    for (let j = start; j <= end; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      best = Math.min(best, current[j]!);
    }
    if (best > k) return k + 1;
    [previous, current] = [current, previous];
  }
  return previous[b.length]!;
}
interface Entry {
  record: IdentityRecord;
  normalized: string;
  keys: string[];
}
/** Bounded inverted index. Matching never queries a DB. Overflow is explicit,
 * never a silent 'unique' decision. Bounds prevent degenerate common-name O(N²).
 */
export class IdentityIndex {
  private readonly entries = new Map<string, Entry>();
  private readonly postings = new Map<string, Set<string>>();
  private postingCount = 0;
  constructor(
    readonly maxRecords = 50000,
    readonly maxCandidates = 128,
  ) {}
  private prepare(record: IdentityRecord): Entry {
    const tokens = normalizeIdentity(record.name).split(" ").filter(Boolean).sort();
    const normalized = tokens.join(" "),
      prefix = record.kind + ":";
    const keys = tokens.slice(0, 12).map((t) => prefix + "N:" + soundex(t));
    if (record.reference) keys.push(prefix + "R:" + normalizeIdentity(record.reference));
    if (record.eventDate) keys.push(prefix + "D:" + record.eventDate.slice(0, 10));
    return {
      record: {
        id: record.id,
        kind: record.kind,
        name: record.name,
        jurisdiction: record.jurisdiction,
        reference: record.reference,
        eventDate: record.eventDate,
      },
      normalized,
      keys: [...new Set(keys)],
    };
  }
  upsert(record: IdentityRecord) {
    if (!this.entries.has(record.id) && this.entries.size >= this.maxRecords)
      throw new RangeError(
        "Identity index capacity exceeded; narrow the stream or increase the configured capacity",
      );
    const entry = this.prepare(record);
    this.remove(record.id);
    this.entries.set(record.id, entry);
    for (const key of entry.keys) {
      let ids = this.postings.get(key);
      if (!ids) {
        ids = new Set();
        this.postings.set(key, ids);
      }
      ids.add(record.id);
      this.postingCount++;
    }
  }
  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const key of entry.keys) {
      const ids = this.postings.get(key)!;
      ids.delete(id);
      this.postingCount--;
      if (!ids.size) this.postings.delete(key);
    }
    this.entries.delete(id);
  }
  match(record: IdentityRecord, threshold = 3) {
    const probe = this.prepare(record),
      blocks = probe.keys
        .map((key) => ({ key, ids: this.postings.get(key) }))
        .filter((b) => b.ids?.size)
        .sort((a, b) => a.ids!.size - b.ids!.size);
    const candidates = new Set<string>();
    let overflow = false;
    // Exact evidence/filing identifiers get first consideration, then rare blocks.
    blocks.sort(
      (a, b) =>
        Number(b.key.includes(":R:")) - Number(a.key.includes(":R:")) || a.ids!.size - b.ids!.size,
    );
    for (const block of blocks) {
      for (const id of block.ids!) {
        if (id === record.id) continue;
        if (candidates.size >= this.maxCandidates && !candidates.has(id)) {
          overflow = true;
          break;
        }
        candidates.add(id);
      }
      if (overflow) break;
    }
    const matches = [];
    for (const id of candidates) {
      const entry = this.entries.get(id)!,
        distance = boundedLevenshtein(probe.normalized, entry.normalized, threshold),
        sameReference =
          !!record.reference &&
          normalizeIdentity(record.reference) === normalizeIdentity(entry.record.reference);
      if (distance <= threshold || sameReference)
        matches.push({
          id,
          distance,
          sameReference,
          sameJurisdiction:
            normalizeIdentity(record.jurisdiction) === normalizeIdentity(entry.record.jurisdiction),
          sameDate: !!record.eventDate && record.eventDate === entry.record.eventDate,
          record: { ...entry.record },
        });
    }
    matches.sort(
      (a, b) =>
        Number(b.sameReference) - Number(a.sameReference) ||
        a.distance - b.distance ||
        (a.id < b.id ? -1 : 1),
    );
    return {
      status: overflow
        ? "AMBIGUOUS_CAPACITY"
        : matches.length
          ? "REVIEW_CANDIDATES"
          : "NO_CANDIDATE",
      matches,
      examined: candidates.size,
      overflow,
      automaticMerge: false as const,
    };
  }
  stats() {
    return {
      records: this.entries.size,
      blocks: this.postings.size,
      postings: this.postingCount,
      capacity: this.maxRecords,
      candidateLimit: this.maxCandidates,
    };
  }
}
