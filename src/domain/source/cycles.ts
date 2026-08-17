import type { ActorRelationship } from "./types";

const MAX_DEPTH_DEFAULT = 8;

export function wouldCreateCycle(
  relationships: ActorRelationship[],
  fromActorId: string,
  toActorId: string
): boolean {
  if (fromActorId === toActorId) return true;
  const outgoing = new Map<string, string[]>();
  for (const rel of relationships) {
    const list = outgoing.get(rel.fromActorId) ?? [];
    list.push(rel.toActorId);
    outgoing.set(rel.fromActorId, list);
  }
  const next = outgoing.get(toActorId) ?? [];
  const stack = [...next];
  const seen = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === fromActorId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(outgoing.get(node) ?? []));
  }
  return false;
}

export function traversalAllowed(depth: number, maxDepth = MAX_DEPTH_DEFAULT): boolean {
  return depth < maxDepth;
}

export function visibleActorName(args: {
  actorName: string;
  viewerIsManufacturer: boolean;
  confidentialUpstream: boolean;
}): string {
  if (args.viewerIsManufacturer && args.confidentialUpstream) return "Verified upstream source";
  return args.actorName;
}
