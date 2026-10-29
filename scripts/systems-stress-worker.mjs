import { parentPort, workerData } from "node:worker_threads";
import { SharedPriorityHeap, HeapConflict } from "../packages/rules-engine/dist/index.js";
const { buffer, control, capacity, worker, operations } = workerData;
const barrier = new Int32Array(control),
  heap = new SharedPriorityHeap(capacity, buffer);
parentPort.postMessage({ ready: true });
while (Atomics.load(barrier, 0) === 0) Atomics.wait(barrier, 0, 0, 1000);
let collisions = 0;
for (let i = 0; i < operations; i++) {
  const id = worker * operations + i;
  heap.upsert({ id, keys: [id % 4, id, -id, 0, id, 0] });
  const revision = heap.revision;
  try {
    heap.upsert({ id, keys: [id % 4, id, -id, 0, id, 0] }, revision);
  } catch (error) {
    if (!(error instanceof HeapConflict)) throw error;
    collisions++;
  }
}
// Deliberately stale OCC edit must be rejected regardless of thread scheduling.
try {
  heap.upsert({ id: worker * operations, keys: [0, 0, 0, 0, 0, 0] }, -1);
  throw new Error("Stale edit accepted");
} catch (error) {
  if (!(error instanceof HeapConflict)) throw error;
  collisions++;
}
parentPort.postMessage({ worker, collisions, operations });
