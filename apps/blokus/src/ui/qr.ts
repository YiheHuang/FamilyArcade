/**
 * Minimal QR Code encoder — byte mode, error correction level M, versions 1–10.
 *
 * The app only ever encodes its own invite URL, so this stays deliberately
 * small: one mode, one ECC level, no SVG/PNG writers. Correctness is verified
 * two ways in tests/qr.test.ts: module-for-module against the reference
 * `qrcode` npm package (same version + forced mask) and by decoding our own
 * rendered output with `jsqr`.
 */

/** [ec codewords per block, group1 blocks, group1 data codewords, group2 blocks, group2 data codewords] */
const ECC_M: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0, 0, 0, 0], // index 0 is unused (versions start at 1)
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];

/** alignment pattern centre coordinates per version (v1 has none) */
const ALIGNMENT: readonly number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const MIN_VERSION = 1;
const MAX_VERSION = 10;

export interface QrMatrix {
  version: number;
  mask: number;
  size: number;
  /** [row][col], true = dark module (includes the 4-module margin? no — modules only) */
  modules: boolean[][];
}

// ---------------------------------------------------------------- GF(256) math

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // primitive polynomial of QR's GF(256)
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** generator polynomial of degree `ecLen`, highest power first (leading 1) */
function rsGenerator(ecLen: number): number[] {
  let g = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j]; // × x
      next[j + 1] ^= gfMul(g[j], GF_EXP[i]); // × α^i
    }
    g = next;
  }
  return g;
}

/** remainder of data·x^ecLen ÷ generator (the error correction codewords) */
function rsRemainder(data: number[], gen: number[]): number[] {
  const ecLen = gen.length - 1;
  const rem = new Array<number>(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecLen; i++) rem[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return rem;
}

// ------------------------------------------------------------ data to codewords

function dataCodewords(version: number): number {
  const [ec, b1, d1, b2, d2] = ECC_M[version];
  void ec;
  return b1 * d1 + b2 * d2;
}

function chooseVersion(byteLength: number): number {
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const lengthBits = v <= 9 ? 8 : 16;
    const needBits = 4 + lengthBits + byteLength * 8;
    if (needBits <= dataCodewords(v) * 8) return v;
  }
  return 0;
}

function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const [ecLen, b1, d1, b2, d2] = ECC_M[version];
  const capacityBits = dataCodewords(version) * 8;
  const lengthBits = version <= 9 ? 8 : 16;

  const bits: number[] = [];
  const push = (value: number, len: number): void => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, lengthBits);
  for (const b of bytes) push(b, 8);
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k];
    words.push(byte);
  }
  const PAD = [0xec, 0x11];
  for (let i = 0; words.length < capacityBits / 8; i++) words.push(PAD[i % 2]);

  // split into blocks, add error correction, interleave
  const blocks: Array<{ data: number[]; ec: number[] }> = [];
  let pos = 0;
  for (let i = 0; i < b1; i++) {
    const data = words.slice(pos, pos + d1);
    pos += d1;
    blocks.push({ data, ec: rsRemainder(data, rsGenerator(ecLen)) });
  }
  for (let i = 0; i < b2; i++) {
    const data = words.slice(pos, pos + d2);
    pos += d2;
    blocks.push({ data, ec: rsRemainder(data, rsGenerator(ecLen)) });
  }

  const out: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const b of blocks) out.push(b.ec[i]);
  }
  return out;
}

// ------------------------------------------------------------------- bit maths

function bitLength(v: number): number {
  let n = 0;
  for (let x = v; x !== 0; x >>>= 1) n++;
  return n;
}

/** 15-bit format information: 5 data bits + BCH(15,5), masked with 0x5412 */
function formatBits(eccBits: number, mask: number): number {
  const data = (eccBits << 3) | mask;
  let rem = data << 10;
  while (bitLength(rem) - 11 >= 0) rem ^= 0x537 << (bitLength(rem) - 11);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18-bit version information for versions 7+ */
function versionBits(version: number): number {
  let rem = version << 12;
  while (bitLength(rem) - 13 >= 0) rem ^= 0x1f25 << (bitLength(rem) - 13);
  return (version << 12) | rem;
}

// -------------------------------------------------------------------- the symbol

interface Canvas {
  m: boolean[][];
  fn: boolean[][];
}

function newCanvas(size: number): Canvas {
  return {
    m: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    fn: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFn(c: Canvas, row: number, col: number, dark: boolean): void {
  c.m[row][col] = dark;
  c.fn[row][col] = true;
}

function drawFinder(c: Canvas, size: number, row0: number, col0: number): void {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const r = row0 + dy;
      const col = col0 + dx;
      if (r < 0 || r >= size || col < 0 || col >= size) continue;
      const dist = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
      setFn(c, r, col, dist <= 1 || dist === 3);
    }
  }
}

function drawAlignment(c: Canvas, rowC: number, colC: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFn(c, rowC + dy, colC + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
    }
  }
}

function drawFunctionPatterns(c: Canvas, version: number, size: number): void {
  drawFinder(c, size, 0, 0);
  drawFinder(c, size, 0, size - 7);
  drawFinder(c, size, size - 7, 0);

  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFn(c, 6, i, i % 2 === 0);
    setFn(c, i, 6, i % 2 === 0);
  }

  // alignment patterns (skipping the three finder corners)
  const centres = ALIGNMENT[version];
  for (const r of centres) {
    for (const col of centres) {
      const onFinder =
        (r <= 8 && col <= 8) || (r <= 8 && col >= size - 9) || (r >= size - 9 && col <= 8);
      if (!onFinder) drawAlignment(c, r, col);
    }
  }

  // reserve the format information areas (values are written per mask later);
  // row 6 / column 6 carry the timing patterns and are not part of them
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFn(c, i, 8, false);
      setFn(c, 8, i, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFn(c, 8, size - 1 - i, false);
    setFn(c, size - 1 - i, 8, false);
  }

  // reserve the version information areas (versions 7+)
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(c, b, a, false);
      setFn(c, a, b, false);
    }
  }
}

function drawFormat(c: Canvas, mask: number, size: number): void {
  const bits = formatBits(0b00, mask); // level M = 00
  const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) setFn(c, i, 8, bit(i));
  setFn(c, 7, 8, bit(6));
  setFn(c, 8, 8, bit(7));
  setFn(c, 8, 7, bit(8));
  for (let i = 9; i < 15; i++) setFn(c, 8, 14 - i, bit(i));

  for (let i = 0; i < 8; i++) setFn(c, 8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) setFn(c, size - 15 + i, 8, bit(i));
  setFn(c, size - 8, 8, true); // the always-dark module
}

function drawVersion(c: Canvas, version: number, size: number): void {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFn(c, b, a, dark);
    setFn(c, a, b, dark);
  }
}

/** zigzag placement of the interleaved codewords, skipping function modules */
function placeData(c: Canvas, codewords: number[], size: number): void {
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing pattern has no data
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (!c.fn[row][col] && i < total) {
          c.m[row][col] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

function maskBit(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function applyMask(c: Canvas, mask: number, size: number): void {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!c.fn[row][col] && maskBit(mask, row, col)) c.m[row][col] = !c.m[row][col];
    }
  }
}

/** penalty score of rule 1 (runs) for one line */
function runPenalty(line: boolean[]): number {
  let score = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) {
      run++;
    } else {
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
  }
  return score;
}

/** the four penalty rules of ISO/IEC 18004 §8.8.2 */
function penalty(m: boolean[][], size: number): number {
  let score = 0;

  const p1 = [true, false, true, true, true, false, true, false, false, false, false];
  const p2 = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (line: boolean[], pattern: boolean[], at: number): boolean => {
    for (let k = 0; k < pattern.length; k++) if (line[at + k] !== pattern[k]) return false;
    return true;
  };

  for (let i = 0; i < size; i++) {
    const row: boolean[] = [];
    const col: boolean[] = [];
    for (let j = 0; j < size; j++) {
      row.push(m[i][j]);
      col.push(m[j][i]);
    }
    score += runPenalty(row) + runPenalty(col);
    for (let j = 0; j + 11 <= size; j++) {
      if (matches(row, p1, j) || matches(row, p2, j)) score += 40;
      if (matches(col, p1, j) || matches(col, p2, j)) score += 40;
    }
  }

  for (let r = 0; r + 1 < size; r++) {
    for (let col = 0; col + 1 < size; col++) {
      const v = m[r][col];
      if (m[r][col + 1] === v && m[r + 1][col] === v && m[r + 1][col + 1] === v) score += 3;
    }
  }

  let dark = 0;
  for (let r = 0; r < size; r++) for (let col = 0; col < size; col++) if (m[r][col]) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/** Encode `text` as a QR symbol. Pass `mask` (0-7) to force a mask pattern. */
export function encodeQr(text: string, opts: { mask?: number } = {}): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  if (version === 0) throw new Error('二维码内容过长');
  const codewords = buildCodewords(bytes, version);
  const size = version * 4 + 17;

  let best: { mask: number; m: boolean[][]; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    if (opts.mask !== undefined && mask !== opts.mask) continue;
    const c = newCanvas(size);
    drawFunctionPatterns(c, version, size);
    placeData(c, codewords, size);
    applyMask(c, mask, size);
    drawFormat(c, mask, size);
    drawVersion(c, version, size);
    const score = penalty(c.m, size);
    if (!best || score < best.score) best = { mask, m: c.m, score };
  }
  if (!best) throw new Error('无效的掩码');
  return { version, mask: best.mask, size, modules: best.m };
}

/** big-endian bits of one format codeword, for tests */
export function formatBitsForTest(mask: number): number {
  return formatBits(0b00, mask);
}

// --------------------------------------------------------------------- drawing

export interface QrDrawOptions {
  /** pixel size of one module */
  module?: number;
  /** quiet zone in modules (the spec asks for 4) */
  margin?: number;
  dark?: string;
  light?: string;
}

/**
 * Draw the symbol onto a canvas, crisp modules, 4-module quiet zone.
 * Also stores the encoded text in `canvas.dataset.qr` (tests use it).
 */
export function drawQr(canvas: HTMLCanvasElement, text: string, opts: QrDrawOptions = {}): QrMatrix {
  const { module = 4, margin = 4, dark = '#14120f', light = '#ffffff' } = opts;
  const qr = encodeQr(text);
  const px = (qr.size + margin * 2) * module;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(px * dpr);
  canvas.height = Math.round(px * dpr);
  canvas.style.width = `${px}px`;
  canvas.style.height = `${px}px`;
  canvas.dataset.qr = text;
  const ctx = canvas.getContext('2d');
  if (!ctx) return qr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = dark;
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.modules[row][col]) {
        ctx.fillRect((col + margin) * module, (row + margin) * module, module, module);
      }
    }
  }
  return qr;
}
