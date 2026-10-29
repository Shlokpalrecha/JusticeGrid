import { AppError } from "@justicegrid/shared";
import { SharedPriorityHeap, type EvaluationResult } from "@justicegrid/rules-engine";
const active = new Map<
  string,
  {
    generation: number;
    heap: SharedPriorityHeap;
    size: number;
    signature: string;
    caseIds: string[];
  }
>();
/** DB repeatable-read supplies the snapshot generation; the heap is the active
 * in-memory ordering structure, not a SQL ORDER BY or an Array.sort replacement label.
 */
export function orderActiveQueue(
  scopeKey: string,
  results: EvaluationResult[],
  generation: number,
) {
  const included = results.filter((r) => r.included),
    references = [...included].sort((a, b) =>
      a.caseRef < b.caseRef ? -1 : a.caseRef > b.caseRef ? 1 : a.caseId < b.caseId ? -1 : 1,
    );
  const ordinal = new Map(references.map((r, i) => [r.caseId, i]));
  const signature = references.map((r) => r.caseId).join("\0"),
    previous = active.get(scopeKey);
  if (previous?.generation === generation && previous.signature === signature) {
    const byId = new Map(included.map((r) => [r.caseId, r]));
    return previous.heap.ordered().rows.map((row) => byId.get(previous.caseIds[row.id]!)!);
  }
  const capacity = Math.max(32, 2 ** Math.ceil(Math.log2(Math.max(1, included.length))));
  if (capacity > 65536)
    throw new AppError(
      "CAPACITY_EXCEEDED",
      "Active queue capacity exceeded; partition this operational scope",
    );
  const heap =
      previous && previous.generation <= generation && previous.heap.capacity === capacity
        ? previous.heap
        : new SharedPriorityHeap(capacity),
    rows = included.map((r, id) => ({
      id,
      keys: [
        Number(r.priorityLevel.slice(1)),
        (r.selectedAction?.orderingDeadline ?? r.plannedReviewAt)
          ? Date.parse((r.selectedAction?.orderingDeadline ?? r.plannedReviewAt)!)
          : 8.64e15,
        -r.supportScore,
        r.selectedAction ? Date.parse(r.selectedAction.activatedAt) : 0,
        ordinal.get(r.caseId)!,
        id,
      ],
    }));
  heap.replace(rows, heap.revision);
  const ordered = heap.ordered().rows.map((row) => included[row.id]!);
  if (!previous || previous.generation <= generation) {
    if (!previous && active.size >= 8) active.delete(active.keys().next().value!);
    active.set(scopeKey, {
      generation,
      heap,
      size: included.length,
      signature,
      caseIds: included.map((r) => r.caseId),
    });
  }
  return ordered;
}
export function heapStatus() {
  return [...active.entries()].map(([scopeKey, row]) => ({
    scope: scopeKey,
    generation: row.generation,
    size: row.size,
    capacity: row.heap.capacity,
    bytes: row.heap.buffer.byteLength,
    revision: row.heap.revision,
  }));
}
