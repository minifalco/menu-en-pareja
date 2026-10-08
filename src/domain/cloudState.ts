// A Broadcast SELECT may already contain a row before its INSERT response arrives.
export function mergeById<T extends { id: string }>(rows: T[], saved: T): T[] {
  const merged = new Map(rows.map(row => [row.id, row]));
  // An existing SELECT row can be newer than this delayed INSERT receipt.
  if (!merged.has(saved.id)) merged.set(saved.id, saved);
  return [...merged.values()];
}

// Wait for every grouped manual update, including partial failures, before SELECT.
export async function persistCheckbox(writes: Promise<unknown>[], refresh: () => Promise<void>) {
  const results = await Promise.allSettled(writes);
  await refresh();
  const failed = results.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}

// Scope lifetime and read order are separate: writes keep their ownership even
// when a newer Broadcast reload starts, but old snapshots cannot overwrite them.
export function createAsyncBoundary() {
  let alive = true;
  let revision = 0;
  return {
    active: () => alive,
    beginRead() {
      const ownRevision = ++revision;
      return () => alive && ownRevision === revision;
    },
    invalidateReads() { revision++; },
    close() { alive = false; revision++; },
  };
}
