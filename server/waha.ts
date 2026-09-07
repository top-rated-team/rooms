/**
 * The one-way WhatsApp client for room identity: a click-to-chat link (and a
 * QR of that link) that opens WhatsApp with a pre-filled message carrying the
 * room's address, sent to us.
 *
 * WAHA (https://waha.devlike.pro/) is already running on another host. This
 * file talks to it over its HTTP API, with `X-Api-Key`, and never pretends the
 * host is here. When the host is down, unconfigured, or the session has no
 * number yet, the probe fails with a sentence — the identity layer then keeps
 * the LinkedIn route and prints that sentence. There is no dead button.
 *
 * This is not the two-way bridge. It does not send a reply, does not read a
 * contact list, and does not log a phone number. The only number it needs is
 * ours, so a wa.me link has somewhere to go; that number is not stored.
 */

import { clearTimeout, setTimeout } from "node:timers";

const PROBE_MS = 2_500;

/** Printed when the WAHA host cannot be used. Identity keeps the LinkedIn route. */
export const WAHA_UNAVAILABLE_LINE =
  "WhatsApp is not reachable from this page right now, so LinkedIn is the way to bind this room.";

export const WAHA_UNCONFIGURED_LINE =
  "WhatsApp is not configured on this deployment, so LinkedIn is the way to bind this room.";

export const WAHA_DISCONNECTED_LINE =
  "WhatsApp is not connected right now, so LinkedIn is the way to bind this room.";

export type WahaProbe =
  | { ok: true; digits: string }
  | { ok: false; line: string };

function wahaBaseUrl(): string | null {
  const raw = process.env.WAHA_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function wahaSession(): string {
  const raw = process.env.WAHA_SESSION?.trim();
  return raw && raw.length > 0 ? raw : "default";
}

function wahaHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.WAHA_API_KEY?.trim();
  if (key) headers["X-Api-Key"] = key;
  return headers;
}

/** Digits only, which is what wa.me wants. */
export function digitsFromMeId(id: string): string | null {
  const trimmed = id.trim();
  const beforeAt = trimmed.includes("@") ? trimmed.slice(0, trimmed.indexOf("@")) : trimmed;
  const digits = beforeAt.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Click-to-chat. The visitor's own WhatsApp opens with `text` already written,
 * addressed to our number. We do not scrape a session and we do not drive theirs.
 */
export function waMeUrl(digits: string, text: string): string {
  const n = digits.replace(/\D/g, "");
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

interface MeBody {
  id?: unknown;
  pushName?: unknown;
}

function meDigits(body: unknown): string | null {
  if (body === null) return null;
  if (typeof body !== "object") return null;
  const record = body as MeBody & { me?: MeBody };
  const id = record.id ?? record.me?.id;
  if (typeof id !== "string") return null;
  return digitsFromMeId(id);
}

/**
 * Asks WAHA who we are. A timeout, a 5xx, a missing session or a session with
 * no number are all the same fact to the visitor: WhatsApp is not a route
 * right now. The raw body is not logged — it can carry a phone number.
 */
export async function probeWaha(fetchImpl: typeof fetch = fetch): Promise<WahaProbe> {
  const base = wahaBaseUrl();
  if (!base) return { ok: false, line: WAHA_UNCONFIGURED_LINE };

  const session = encodeURIComponent(wahaSession());
  const url = `${base}/api/sessions/${session}/me`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_MS);

  try {
    const res = await fetchImpl(url, { method: "GET", headers: wahaHeaders(), signal: ac.signal });
    if (!res.ok) return { ok: false, line: WAHA_UNAVAILABLE_LINE };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, line: WAHA_UNAVAILABLE_LINE };
    }
    const digits = meDigits(body);
    if (!digits) return { ok: false, line: WAHA_DISCONNECTED_LINE };
    return { ok: true, digits };
  } catch {
    return { ok: false, line: WAHA_UNAVAILABLE_LINE };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------- QR of a link -------------------------------- */
/*
 * A QR of the wa.me URL, so a visitor on a computer can scan it with the phone
 * that has WhatsApp. Generated here because handing that URL to a third-party
 * QR service would hand them the room token sitting inside the pre-filled text.
 *
 * Byte mode, ECC L, versions 1–11. Inspired by the standard placement rules
 * (ISO/IEC 18004) rather than by a library — this parcel cannot add one.
 */

const QR_ECC_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20];
const QR_ECC_BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4];

function qrSize(version: number): number {
  return version * 4 + 17;
}

function qrRawModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function qrCapacityBytes(version: number): number {
  const raw = Math.floor(qrRawModules(version) / 8);
  const blocks = QR_ECC_BLOCKS[version];
  const ec = QR_ECC_PER_BLOCK[version] * blocks;
  const dataCodewords = raw - ec;
  const lengthBits = version >= 10 ? 16 : 8;
  return dataCodewords - 1 - Math.ceil(lengthBits / 8) - 1;
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const size = qrSize(version);
  const positions: number[] = [6];
  for (let pos = size - 7; positions.length < numAlign; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(ecCount: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: number[], ecCount: number): number[] {
  const gen = rsGenerator(ecCount);
  const out = data.concat(new Array<number>(ecCount).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = out[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) out[i + j] ^= gfMul(gen[j], coef);
  }
  return out.slice(data.length);
}

function bitBuffer(): { bits: number[]; push(value: number, length: number): void; toBytes(): number[] } {
  const bits: number[] = [];
  return {
    bits,
    push(value: number, length: number) {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    },
    toBytes() {
      const bytes: number[] = [];
      for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] ?? 0);
        bytes.push(v);
      }
      return bytes;
    },
  };
}

function encodeData(text: string, version: number): number[] | null {
  const bytes = Array.from(Buffer.from(text, "utf8"));
  const raw = Math.floor(qrRawModules(version) / 8);
  const blocks = QR_ECC_BLOCKS[version];
  const ecPer = QR_ECC_PER_BLOCK[version];
  const dataCodewords = raw - ecPer * blocks;
  const lengthBits = version >= 10 ? 16 : 8;
  if (bytes.length >= 1 << lengthBits) return null;
  if (bytes.length + 1 + Math.ceil(lengthBits / 8) + 1 > dataCodewords) return null;

  const buf = bitBuffer();
  buf.push(0b0100, 4);
  buf.push(bytes.length, lengthBits);
  for (const b of bytes) buf.push(b, 8);
  const maxBits = dataCodewords * 8;
  const rest = Math.min(4, maxBits - buf.bits.length);
  if (rest > 0) buf.push(0, rest);
  while (buf.bits.length % 8 !== 0) buf.bits.push(0);
  const data = buf.toBytes();
  const pad = [0xec, 0x11];
  let p = 0;
  while (data.length < dataCodewords) data.push(pad[p++ % 2]);

  const shortBlocks = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const groups: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blocks; i++) {
    const dataLen = shortLen - ecPer + (i < shortBlocks ? 0 : 1);
    const blockData = data.slice(offset, offset + dataLen);
    offset += dataLen;
    const ec = rsEncode(blockData, ecPer);
    groups.push(blockData.concat(ec));
  }

  const interleaved: number[] = [];
  const maxLen = Math.max(...groups.map((g) => g.length));
  for (let i = 0; i < maxLen; i++) {
    for (const g of groups) {
      if (i < g.length) interleaved.push(g[i]);
    }
  }
  return interleaved;
}

type Grid = (boolean | null)[][];

function makeGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
}

function placeFinder(grid: Grid, row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= grid.length || cc >= grid.length) continue;
      const dark =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      grid[rr][cc] = dark;
    }
  }
}

function placeAlignment(grid: Grid, row: number, col: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      grid[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
    }
  }
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function bchFormat(eclMask: number): number {
  let d = eclMask << 10;
  for (let i = 14; i >= 10; i--) {
    if (((d >>> i) & 1) !== 0) d ^= 0x537 << (i - 10);
  }
  return ((eclMask << 10) | d) ^ 0x5412;
}

function placeFormat(grid: Grid, mask: number): void {
  // ECC L = 01.
  const bits = bchFormat((0b01 << 3) | mask);
  const n = grid.length;
  for (let i = 0; i <= 5; i++) grid[8][i] = ((bits >>> i) & 1) === 1;
  grid[8][7] = ((bits >>> 6) & 1) === 1;
  grid[8][8] = ((bits >>> 7) & 1) === 1;
  grid[7][8] = ((bits >>> 8) & 1) === 1;
  for (let i = 9; i < 15; i++) grid[14 - i][8] = ((bits >>> i) & 1) === 1;
  for (let i = 0; i < 8; i++) grid[n - 1 - i][8] = ((bits >>> i) & 1) === 1;
  for (let i = 8; i < 15; i++) grid[8][n - 15 + i] = ((bits >>> i) & 1) === 1;
  grid[n - 8][8] = true;
}

function bchVersion(version: number): number {
  let d = version << 12;
  for (let i = 17; i >= 12; i--) {
    if (((d >>> i) & 1) !== 0) d ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | d;
}

function placeVersion(grid: Grid, version: number): void {
  if (version < 7) return;
  const bits = bchVersion(version);
  const n = grid.length;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const r = Math.floor(i / 3);
    const c = n - 11 + (i % 3);
    grid[r][c] = dark;
    grid[c][r] = dark;
  }
}

function placeData(grid: Grid, data: number[], mask: number): void {
  const n = grid.length;
  const bits: number[] = [];
  for (const b of data) {
    for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1);
  }
  let k = 0;
  let dir = -1;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let pass = 0; pass < n; pass++) {
      const row = dir < 0 ? n - 1 - pass : pass;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (grid[row][cc] !== null) continue;
        const bit = k < bits.length ? bits[k] === 1 : false;
        k++;
        grid[row][cc] = maskBit(mask, row, cc) ? !bit : bit;
      }
    }
    dir = -dir;
  }
}

function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

function penalty(grid: Grid): number {
  const n = grid.length;
  const dark = (r: number, c: number) => grid[r][c] === true;
  let score = 0;
  for (let r = 0; r < n; r++) {
    let run = 1;
    for (let c = 1; c < n; c++) {
      if (dark(r, c) === dark(r, c - 1)) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
  }
  for (let c = 0; c < n; c++) {
    let run = 1;
    for (let r = 1; r < n; r++) {
      if (dark(r, c) === dark(r - 1, c)) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
  }
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = dark(r, c);
      if (v === dark(r, c + 1) && v === dark(r + 1, c) && v === dark(r + 1, c + 1)) score += 3;
    }
  }
  const finder = [true, false, true, true, true, false, true];
  const hasFinder = (cells: boolean[]): boolean => {
    for (let i = 0; i <= cells.length - 7; i++) {
      let ok = true;
      for (let j = 0; j < 7; j++) if (cells[i + j] !== finder[j]) ok = false;
      if (ok) return true;
    }
    return false;
  };
  for (let r = 0; r < n; r++) {
    const row = grid[r].map((v) => v === true);
    if (hasFinder(row)) score += 40;
  }
  for (let c = 0; c < n; c++) {
    const col = grid.map((row) => row[c] === true);
    if (hasFinder(col)) score += 40;
  }
  let darkCount = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) darkCount++;
  const percent = (darkCount * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function buildQr(text: string): boolean[][] | null {
  let version = 0;
  let data: number[] | null = null;
  for (let v = 1; v <= 11; v++) {
    if (Buffer.byteLength(text, "utf8") > qrCapacityBytes(v)) continue;
    data = encodeData(text, v);
    if (data) {
      version = v;
      break;
    }
  }
  if (!data || version === 0) return null;

  const n = qrSize(version);
  const reserved = makeGrid(n);
  placeFinder(reserved, 0, 0);
  placeFinder(reserved, 0, n - 7);
  placeFinder(reserved, n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    reserved[6][i] = i % 2 === 0;
    reserved[i][6] = i % 2 === 0;
  }
  for (const r of alignmentPositions(version)) {
    for (const c of alignmentPositions(version)) {
      if (reserved[r][c] !== null) continue;
      placeAlignment(reserved, r, c);
    }
  }
  placeVersion(reserved, version);
  for (let i = 0; i < n; i++) {
    if (reserved[8][i] === null) reserved[8][i] = false;
    if (reserved[i][8] === null) reserved[i][8] = false;
  }

  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const grid = cloneGrid(reserved);
    placeFormat(grid, mask);
    placeData(grid, data, mask);
    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }
  if (!best) return null;
  return best.map((row) => row.map((cell) => cell === true));
}

/**
 * SVG, `currentColor` modules, so the strip can set the ink from the theme.
 * Returns null when the URL is too long for version 11 — the wa.me link is
 * still offered; a missing QR is not a dead button.
 */
export function qrSvg(text: string): string | null {
  const modules = buildQr(text);
  if (!modules) return null;
  const quiet = 4;
  const n = modules.length;
  const dim = n + quiet * 2;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">`,
  ];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules[r][c]) parts.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`);
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
