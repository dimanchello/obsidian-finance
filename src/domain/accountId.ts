const ID_LINE_RE = /^\s*id\s*:\s*(\S*)\s*$/;
const VALID_ID_RE = /^[0-9a-f]{12}$/;

export type AccountIdSource =
  | { kind: 'ok'; id: string }
  | { kind: 'missing' }
  | { kind: 'invalid'; raw: string };

/** Reads the `id:` line out of a ```finance-account block body. */
export function parseAccountId(source: string): AccountIdSource {
  for (const line of source.split('\n')) {
    const m = ID_LINE_RE.exec(line);
    if (!m) continue;
    const raw = m[1] ?? '';
    return VALID_ID_RE.test(raw) ? { kind: 'ok', id: raw } : { kind: 'invalid', raw };
  }
  return { kind: 'missing' };
}

export function isValidAccountId(id: string): boolean {
  return VALID_ID_RE.test(id);
}

export function newAccountId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 12).toLowerCase();
}

/**
 * Inserts `id: <id>` into the block delimited by lineStart/lineEnd (fence lines included,
 * as `getSectionInfo` reports them). Anchored by line index rather than by matching text,
 * so a second identical block in the same note cannot be hit by mistake.
 */
export function insertAccountId(
  fileContent: string, lineStart: number, lineEnd: number, id: string,
): string | null {
  const lines = fileContent.split('\n');
  if (lineStart < 0 || lineEnd >= lines.length || lineStart >= lineEnd) return null;
  if (!lines[lineStart]!.trimStart().startsWith('```')) return null;

  const body = lines.slice(lineStart + 1, lineEnd);
  if (body.some(l => ID_LINE_RE.test(l))) return null;

  lines.splice(lineStart + 1, 0, `id: ${id}`);
  return lines.join('\n');
}

/** Every account id referenced by a `finance-account` block anywhere in a note. */
export function collectAccountIds(fileContent: string): string[] {
  const ids: string[] = [];
  const lines = fileContent.split('\n');
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!inBlock) {
      if (/^```+\s*finance-account\s*$/.test(trimmed)) inBlock = true;
      continue;
    }
    if (trimmed.startsWith('```')) { inBlock = false; continue; }
    const m = ID_LINE_RE.exec(line);
    if (m?.[1] && VALID_ID_RE.test(m[1])) ids.push(m[1]);
  }

  return ids;
}
