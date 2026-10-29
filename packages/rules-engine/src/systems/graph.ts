export interface Edge {
  from: string;
  to: string;
}
export class GraphError extends Error {
  constructor(
    readonly code: "CYCLE_DETECTED" | "UNKNOWN_VERTEX" | "DUPLICATE_VERTEX",
    message: string,
    readonly path: readonly string[] = [],
  ) {
    super(message);
    this.name = "GraphError";
  }
}
/** O(V+E) adjacency lists, iterative DFS and Kahn layers; no recursive stack overflow. */
export function analyzeDag(
  vertices: readonly string[],
  edges: readonly Edge[],
  completed: ReadonlySet<string> = new Set(),
) {
  const outgoing = new Map<string, string[]>(),
    incoming = new Map<string, string[]>();
  for (const id of vertices) {
    if (outgoing.has(id)) throw new GraphError("DUPLICATE_VERTEX", `Duplicate vertex ${id}`);
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  const seen = new Set<string>();
  for (const { from, to } of edges) {
    if (!outgoing.has(from) || !outgoing.has(to))
      throw new GraphError("UNKNOWN_VERTEX", `Unknown edge endpoint ${from} → ${to}`);
    const key = JSON.stringify([from, to]);
    if (seen.has(key)) continue;
    seen.add(key);
    outgoing.get(from)!.push(to);
    incoming.get(to)!.push(from);
  }
  const color = new Map<string, number>();
  for (const root of vertices) {
    if (color.has(root)) continue;
    const stack = [{ id: root, next: 0 }];
    color.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!,
        next = outgoing.get(top.id)![top.next++];
      if (next === undefined) {
        color.set(top.id, 2);
        stack.pop();
        continue;
      }
      if (color.get(next) === 1) {
        const start = stack.findIndex((f) => f.id === next),
          path = stack
            .slice(start)
            .map((f) => f.id)
            .concat(next);
        throw new GraphError("CYCLE_DETECTED", `Cycle: ${path.join(" → ")}`, path);
      }
      if (!color.has(next)) {
        color.set(next, 1);
        stack.push({ id: next, next: 0 });
      }
    }
  }
  const degrees = new Map(vertices.map((id) => [id, incoming.get(id)!.length]));
  let frontier = vertices.filter((id) => degrees.get(id) === 0);
  const layers: string[][] = [],
    order: string[] = [];
  while (frontier.length) {
    layers.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      order.push(id);
      for (const child of outgoing.get(id)!) {
        const n = degrees.get(child)! - 1;
        degrees.set(child, n);
        if (n === 0) next.push(child);
      }
    }
    frontier = next;
  }
  return {
    order,
    layers,
    ready: order.filter(
      (id) => !completed.has(id) && incoming.get(id)!.every((p) => completed.has(p)),
    ),
    blocked: order.filter(
      (id) => !completed.has(id) && incoming.get(id)!.some((p) => !completed.has(p)),
    ),
    predecessors: Object.fromEntries(incoming),
  };
}
