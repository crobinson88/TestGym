// The roll-forward chain: a task gets a fresh tdl_items row every day it carries
// over, so anything that has to survive overnight — a comment thread, a
// Completed-list entry — hangs off the chain's first row rather than the row in
// hand. Pure, and free of the db/sync layer so every consumer can import it
// without pulling in a Supabase client.

export interface ChainLink {
  id: string;
  origin_item_id: string | null;
}

// The id a task's history hangs off: the first row of its roll-forward chain.
// Walks `origin_item_id` up through the rows we hold, stopping at the last one
// we can see (a chain whose start has been purged still resolves consistently)
// and guarding against a cycle.
export function rootItemId(item: ChainLink, byId: Map<string, ChainLink>): string {
  const seen = new Set<string>([item.id]);
  let current = item;
  while (current.origin_item_id) {
    const parent = byId.get(current.origin_item_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
}

// A chain index over every row held locally — what rootItemId walks.
export function chainIndexOf(rows: readonly ChainLink[]): Map<string, ChainLink> {
  return new Map(rows.map((r) => [r.id, { id: r.id, origin_item_id: r.origin_item_id }]));
}
