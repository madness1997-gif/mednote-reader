/**
 * Deterministic FNV-1a identity used by Library records and legacy imports.
 * Keep this implementation stable: changing it would change persisted IDs.
 */
export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function stableId(prefix: string, value: string) {
  return `${prefix}-${stableHash(value)}`;
}
