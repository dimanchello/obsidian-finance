/**
 * Convert parameters to SQL-safe format.
 * sql.js expects parameters as an array or object.
 */
export function toSqlParams(params: unknown[]): unknown[] {
  return params.map(p => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}
