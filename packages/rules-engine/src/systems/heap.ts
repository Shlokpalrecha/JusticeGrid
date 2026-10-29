export class HeapConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeapConflict";
  }
}
export interface HeapRow {
  id: number;
  keys: readonly number[];
}
const WIDTH = 7;
/** Indexed, fixed-capacity min heap in shared memory. All operations acquire an
 * Atomics CAS mutex with bounded waiting. No await or DB work inside a lock.
 * IDs are bounded integer slots; six numeric comparator fields are lexicographic.
 */
export class SharedPriorityHeap {
  readonly buffer: SharedArrayBuffer;
  private readonly header: Int32Array;
  private readonly positions: Int32Array;
  private readonly rows: Float64Array;
  readonly capacity: number;
  constructor(capacity = 65536, buffer?: SharedArrayBuffer) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1_000_000)
      throw new RangeError("Invalid heap capacity");
    const offset = 16 + Math.ceil((capacity * 4) / 8) * 8,
      bytes = offset + capacity * WIDTH * 8;
    if (buffer && buffer.byteLength !== bytes)
      throw new RangeError("Heap buffer/capacity mismatch");
    this.capacity = capacity;
    this.buffer = buffer ?? new SharedArrayBuffer(bytes);
    this.header = new Int32Array(this.buffer, 0, 4);
    this.positions = new Int32Array(this.buffer, 16, capacity);
    this.rows = new Float64Array(this.buffer, offset);
    if (!buffer) {
      this.positions.fill(-1);
      this.header[3] = capacity;
    }
  }
  private locked<T>(run: () => T): T {
    let acquired = false;
    for (let attempts = 0; attempts < 100; attempts++) {
      if (Atomics.compareExchange(this.header, 0, 0, 1) === 0) {
        acquired = true;
        break;
      }
      Atomics.wait(this.header, 0, 1, 2);
    }
    if (!acquired) throw new HeapConflict("Heap mutex timed out; retry the operation");
    try {
      return run();
    } finally {
      Atomics.store(this.header, 0, 0);
      Atomics.notify(this.header, 0, 1);
    }
  }
  private row(at: number): HeapRow {
    return {
      id: this.rows[at * WIDTH]!,
      keys: Array.from(this.rows.subarray(at * WIDTH + 1, at * WIDTH + WIDTH)),
    };
  }
  private write(at: number, row: HeapRow) {
    this.rows[at * WIDTH] = row.id;
    this.rows.set(row.keys, at * WIDTH + 1);
    this.positions[row.id] = at;
  }
  private compare(a: number, b: number) {
    for (let k = 1; k < WIDTH; k++) {
      const d = this.rows[a * WIDTH + k]! - this.rows[b * WIDTH + k]!;
      if (d) return d;
    }
    return this.rows[a * WIDTH]! - this.rows[b * WIDTH]!;
  }
  private swap(a: number, b: number) {
    const row = this.row(a);
    this.write(a, this.row(b));
    this.write(b, row);
  }
  private repair(at: number) {
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.compare(at, parent) >= 0) break;
      this.swap(at, parent);
      at = parent;
    }
    while (true) {
      const left = at * 2 + 1;
      if (left >= this.header[1]!) break;
      const right = left + 1,
        best = right < this.header[1]! && this.compare(right, left) < 0 ? right : left;
      if (this.compare(at, best) <= 0) break;
      this.swap(at, best);
      at = best;
    }
  }
  private validate(row: HeapRow) {
    if (
      !Number.isInteger(row.id) ||
      row.id < 0 ||
      row.id >= this.capacity ||
      row.keys.length !== 6 ||
      row.keys.some((n) => !Number.isFinite(n))
    )
      throw new RangeError("Heap row needs an in-range ID and six finite comparator keys");
  }
  upsert(row: HeapRow, expectedRevision?: number) {
    this.validate(row);
    return this.locked(() => {
      if (expectedRevision !== undefined && this.header[2] !== expectedRevision)
        throw new HeapConflict("Heap revision changed");
      let at = this.positions[row.id]!;
      if (at < 0) {
        if (this.header[1] === this.capacity) throw new RangeError("Heap capacity exceeded");
        at = this.header[1]!;
        this.header[1] = at + 1;
      }
      this.write(at, row);
      this.repair(at);
      this.header[2] = this.header[2]! + 1;
      return this.header[2];
    });
  }
  remove(id: number, expectedRevision?: number) {
    return this.locked(() => {
      if (expectedRevision !== undefined && this.header[2] !== expectedRevision)
        throw new HeapConflict("Heap revision changed");
      if (!Number.isInteger(id) || id < 0 || id >= this.capacity)
        throw new RangeError("Invalid ID");
      return this.removeAt(this.positions[id]!);
    });
  }
  private removeAt(at: number): HeapRow | null {
    if (at < 0 || at >= this.header[1]!) return null;
    const row = this.row(at),
      lastIndex = this.header[1]! - 1,
      last = this.row(lastIndex);
    this.header[1] = lastIndex;
    this.positions[row.id] = -1;
    if (at < lastIndex) {
      this.write(at, last);
      this.repair(at);
    }
    this.header[2] = this.header[2]! + 1;
    return row;
  }
  pop() {
    return this.locked(() => this.removeAt(0));
  }
  get revision() {
    return this.locked(() => this.header[2]!);
  }
  snapshot() {
    return this.locked(() => ({
      revision: this.header[2]!,
      rows: Array.from({ length: this.header[1]! }, (_, i) => this.row(i)),
    }));
  }
  replace(rows: readonly HeapRow[], expectedRevision?: number) {
    const next = new SharedPriorityHeap(this.capacity);
    for (const row of rows) next.upsert(row);
    return this.locked(() => {
      if (expectedRevision !== undefined && expectedRevision !== this.header[2])
        throw new HeapConflict("Heap revision changed");
      this.rows.set(next.rows);
      this.positions.set(next.positions);
      this.header[1] = next.header[1]!;
      this.header[2] = this.header[2]! + 1;
      return this.header[2];
    });
  }
  ordered() {
    const snapshot = this.snapshot(),
      copy = new SharedPriorityHeap(this.capacity);
    for (const row of snapshot.rows) copy.upsert(row);
    const rows: HeapRow[] = [];
    let row: HeapRow | null;
    while ((row = copy.pop())) rows.push(row);
    return { revision: snapshot.revision, rows };
  }
}
