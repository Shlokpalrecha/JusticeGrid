import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { SharedPriorityHeap } from "../packages/rules-engine/dist/index.js";
const workers = Number(process.argv[2] ?? 4),
  operations = Number(process.argv[3] ?? 500);
if (
  !Number.isInteger(workers) ||
  workers < 2 ||
  workers > 16 ||
  !Number.isInteger(operations) ||
  operations < 1 ||
  workers * operations > 65536
)
  throw new Error("Use 2–16 workers and at most 65536 total entries");
const capacity = workers * operations,
  heap = new SharedPriorityHeap(capacity),
  control = new SharedArrayBuffer(4),
  barrier = new Int32Array(control),
  started = performance.now();
let ready = 0;
const running = [];
try {
  const jobs = Array.from(
    { length: workers },
    (_, worker) =>
      new Promise((resolve, reject) => {
        const thread = new Worker(new URL("./systems-stress-worker.mjs", import.meta.url), {
          workerData: { buffer: heap.buffer, control, capacity, worker, operations },
        });
        running.push(thread);
        const timer = setTimeout(() => {
          reject(new Error("Worker exceeded 30-second deadline"));
        }, 30000);
        thread.on("message", (message) => {
          if (message.ready) {
            ready++;
            if (ready === workers) {
              Atomics.store(barrier, 0, 1);
              Atomics.notify(barrier, 0, workers);
            }
          } else {
            clearTimeout(timer);
            resolve(message);
          }
        });
        thread.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        thread.once("exit", (code) => {
          if (code) {
            clearTimeout(timer);
            reject(new Error(`Worker exited ${code}`));
          }
        });
      }),
  );
  const reports = await Promise.all(jobs),
    ordered = heap.ordered().rows;
  if (ordered.length !== capacity || new Set(ordered.map((r) => r.id)).size !== capacity)
    throw new Error("Lost or duplicate heap entry");
  const compare = (a, b) => {
    for (let k = 0; k < 6; k++) {
      const d = a.keys[k] - b.keys[k];
      if (d) return d;
    }
    return a.id - b.id;
  };
  for (let i = 1; i < ordered.length; i++)
    if (compare(ordered[i - 1], ordered[i]) > 0) throw new Error("Heap ordering invariant failed");
  process.stdout.write(
    JSON.stringify(
      {
        passed: true,
        workers,
        entries: ordered.length,
        collisionsRejected: reports.reduce((n, r) => n + r.collisions, 0),
        elapsedMs: Math.round(performance.now() - started),
        sharedBytes: heap.buffer.byteLength,
        deadlock: false,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await Promise.all(running.map((w) => w.terminate()));
}
