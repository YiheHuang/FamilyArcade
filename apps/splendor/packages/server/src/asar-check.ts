/**
 * Minimal, dependency-free asar reader.
 *
 * The update flow uses it for two things:
 *  - sanity-check a received payload before it is published (`/updates/publish`);
 *  - read a single file out of an archive (the desktop helper looks for the
 *    update beacon marker inside `dist/main.cjs`).
 *
 * Layout: [uint32 = 4][uint32 = header block size][uint32 = padded payload]
 *         [uint32 = JSON length][JSON header][padding][file data...]
 * File offsets in the header are relative to the data start (8 + block size).
 */

export interface AsarEntry {
  offset: number;
  size: number;
}

/** Parse the JSON header and return the file table (empty on failure). */
export function asarFiles(buf: Buffer): Record<string, AsarEntry> {
  const out: Record<string, AsarEntry> = {};
  if (buf.length < 24) return out;
  const blockSize = buf.readUInt32LE(4);
  if (blockSize < 8 || 8 + blockSize > buf.length) return out;
  const strLen = buf.readUInt32LE(12);
  if (strLen <= 0 || 16 + strLen > 8 + blockSize) return out;
  let header: unknown;
  try {
    header = JSON.parse(buf.subarray(16, 16 + strLen).toString('utf8'));
  } catch {
    return out;
  }
  const walk = (node: unknown, prefix: string): void => {
    if (!node || typeof node !== 'object') return;
    const files = (node as { files?: Record<string, unknown> }).files;
    if (!files) return;
    for (const [name, child] of Object.entries(files)) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (!child || typeof child !== 'object') continue;
      const entry = child as { files?: unknown; offset?: unknown; size?: unknown };
      if (entry.files) {
        walk(child, path);
      } else {
        const offset = typeof entry.offset === 'number' ? entry.offset : Number(entry.offset);
        const size = typeof entry.size === 'number' ? entry.size : Number(entry.size);
        if (Number.isFinite(offset) && Number.isFinite(size)) out[path] = { offset, size };
      }
    }
  };
  walk(header, '');
  return out;
}

/** Byte offset where file data begins. */
function asarDataStart(buf: Buffer): number {
  return 8 + buf.readUInt32LE(4);
}

/** Read one file out of the archive (null when missing or out of bounds). */
export function asarReadFile(buf: Buffer, path: string): Buffer | null {
  const entry = asarFiles(buf)[path];
  if (!entry) return null;
  const start = asarDataStart(buf) + entry.offset;
  if (start < 0 || start + entry.size > buf.length) return null;
  return buf.subarray(start, start + entry.size);
}

/**
 * Verify that a payload looks like a Splendor app archive.
 * Returns null when it is fine, otherwise a short reason (English, logged/returned to callers).
 */
export function checkAsarPayload(
  buf: Buffer,
  required: string[] = ['package.json', 'dist/main.cjs'],
): string | null {
  if (buf.length < 32) return 'payload too small to be an asar archive';
  const blockSize = buf.readUInt32LE(4);
  if (blockSize < 8 || 8 + blockSize > buf.length) return 'asar header size out of range';
  const files = asarFiles(buf);
  if (Object.keys(files).length === 0) return 'asar header unreadable';
  const dataStart = asarDataStart(buf);
  for (const path of required) {
    const entry = files[path];
    if (!entry) return `asar is missing ${path}`;
    if (dataStart + entry.offset + entry.size > buf.length) return `asar entry ${path} out of range`;
  }
  return null;
}

