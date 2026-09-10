/**
 * A clickable QR of a WhatsApp deep link, drawn here rather than by a
 * third-party image service. The booking code is the whole credential for
 * the hold; sending it to somebody else's endpoint would hand that over.
 *
 * The same URL is the href, so a desktop visitor with WhatsApp on the
 * machine can click instead of scanning. There is no choice to make.
 *
 * Dark-on-light on purpose: a QR that follows the theme would invert in
 * dark mode and stop being scannable.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}

function rsRemainder(data: Uint8Array, degree: number): Uint8Array {
  const divisor = rsDivisor(degree);
  const rest = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ rest[0];
    rest.copyWithin(0, 1);
    rest[degree - 1] = 0;
    if (factor === 0) continue;
    for (let i = 0; i < degree; i += 1) {
      rest[i] ^= gfMul(divisor[i], factor);
    }
  }
  return rest;
}

/** version, ecc (0=M 1=L 2=H 3=Q), total data codewords, ec per block, blocks in group 1, data per block group 1, group 2 blocks, data per block group 2 */
const ECC_TABLE: Array<[number, number, number, number, number, number, number, number]> = [
  [1, 1, 19, 7, 1, 19, 0, 0],
  [1, 0, 16, 10, 1, 16, 0, 0],
  [2, 1, 34, 10, 1, 34, 0, 0],
  [2, 0, 28, 16, 1, 28, 0, 0],
  [3, 1, 55, 15, 1, 55, 0, 0],
  [3, 0, 44, 26, 1, 44, 0, 0],
  [4, 1, 80, 20, 1, 80, 0, 0],
  [4, 0, 64, 18, 2, 32, 0, 0],
  [5, 1, 108, 26, 1, 108, 0, 0],
  [5, 0, 86, 24, 2, 43, 0, 0],
  [6, 1, 136, 18, 2, 68, 0, 0],
  [6, 0, 108, 16, 4, 27, 0, 0],
  [7, 1, 156, 20, 2, 78, 0, 0],
  [7, 0, 124, 18, 4, 31, 0, 0],
  [8, 1, 194, 24, 2, 97, 0, 0],
  [8, 0, 154, 22, 2, 38, 2, 39],
  [9, 1, 232, 30, 2, 116, 0, 0],
  [9, 0, 182, 22, 3, 36, 2, 37],
  [10, 1, 274, 18, 2, 68, 2, 69],
  [10, 0, 216, 26, 4, 43, 1, 44],
];

const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

function sizeOf(version: number): number {
  return 21 + 4 * (version - 1);
}

function bitString(data: string, version: number, dataCodewords: number): Uint8Array {
  const bytes = Array.from(new TextEncoder().encode(data));
  const countBits = version <= 9 ? 8 : 16;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, countBits);
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCodewords * 8;
  const remain = capacity - bits.length;
  if (remain < 0) throw new Error("QR payload does not fit.");
  push(0, Math.min(4, remain));
  while (bits.length % 8 !== 0) bits.push(0);
  const pad = [0b11101100, 0b00010001];
  let padIndex = 0;
  const out = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i += 1) {
    if (i * 8 < bits.length) {
      let value = 0;
      for (let b = 0; b < 8; b += 1) value = (value << 1) | (bits[i * 8 + b] ?? 0);
      out[i] = value;
    } else {
      out[i] = pad[padIndex % 2];
      padIndex += 1;
    }
  }
  return out;
}

function interleave(
  data: Uint8Array,
  ecPerBlock: number,
  g1Blocks: number,
  g1Data: number,
  g2Blocks: number,
  g2Data: number,
): Uint8Array {
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let offset = 0;
  for (let i = 0; i < g1Blocks; i += 1) {
    const slice = data.slice(offset, offset + g1Data);
    offset += g1Data;
    blocks.push({ data: slice, ec: rsRemainder(slice, ecPerBlock) });
  }
  for (let i = 0; i < g2Blocks; i += 1) {
    const slice = data.slice(offset, offset + g2Data);
    offset += g2Data;
    blocks.push({ data: slice, ec: rsRemainder(slice, ecPerBlock) });
  }
  const maxData = Math.max(g1Data, g2Data);
  const out: number[] = [];
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) out.push(block.data[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of blocks) out.push(block.ec[i]);
  }
  return new Uint8Array(out);
}

function setFinder(grid: number[][], row: number, col: number): void {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= grid.length || cc >= grid.length) continue;
      const dark =
        r === -1 || r === 7 || c === -1 || c === 7
          ? false
          : r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      grid[rr][cc] = dark ? 1 : 0;
    }
  }
}

function setAlignment(grid: number[][], row: number, col: number): void {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      grid[row + r][col + c] = dark ? 1 : 0;
    }
  }
}

function isFunction(version: number, row: number, col: number): boolean {
  const n = sizeOf(version);
  if (row <= 8 && col <= 8) return true;
  if (row <= 8 && col >= n - 8) return true;
  if (row >= n - 8 && col <= 8) return true;
  if (row === 6 || col === 6) return true;
  if (version >= 7) {
    if (row < 6 && col >= n - 11) return true;
    if (col < 6 && row >= n - 11) return true;
  }
  const aligns = ALIGNMENT[version] ?? [];
  for (const ar of aligns) {
    for (const ac of aligns) {
      if (ar <= 8 && ac <= 8) continue;
      if (ar <= 8 && ac >= n - 9) continue;
      if (ar >= n - 9 && ac <= 8) continue;
      if (Math.abs(row - ar) <= 2 && Math.abs(col - ac) <= 2) return true;
    }
  }
  return false;
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

function placeData(grid: number[][], version: number, data: Uint8Array): void {
  const n = grid.length;
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  }
  let bit = 0;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < n; i += 1) {
      const row = upward ? n - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (isFunction(version, row, c)) continue;
        grid[row][c] = bits[bit] ?? 0;
        bit += 1;
      }
    }
    upward = !upward;
  }
}

function applyMask(grid: number[][], version: number, mask: number): number[][] {
  const n = grid.length;
  const out = grid.map((row) => row.slice());
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (isFunction(version, r, c)) continue;
      if (maskBit(mask, r, c)) out[r][c] ^= 1;
    }
  }
  return out;
}

function drawFormat(grid: number[][], ecc: number, mask: number): void {
  const n = grid.length;
  const table: Record<string, number> = {
    "1-0": 0x77c4, "1-1": 0x72f3, "1-2": 0x7daa, "1-3": 0x789d, "1-4": 0x662f, "1-5": 0x6318, "1-6": 0x6c41, "1-7": 0x6976,
    "0-0": 0x5412, "0-1": 0x5125, "0-2": 0x5e7c, "0-3": 0x5b4b, "0-4": 0x45f9, "0-5": 0x40ce, "0-6": 0x4f97, "0-7": 0x4aa0,
    "3-0": 0x355f, "3-1": 0x3068, "3-2": 0x3f31, "3-3": 0x3a06, "3-4": 0x24b4, "3-5": 0x2183, "3-6": 0x2eda, "3-7": 0x2bed,
    "2-0": 0x1689, "2-1": 0x13be, "2-2": 0x1ce7, "2-3": 0x19d0, "2-4": 0x0762, "2-5": 0x0255, "2-6": 0x0d0c, "2-7": 0x083b,
  };
  const bits = table[`${ecc}-${mask}`] ?? 0x5412;
  const positionsA: Array<[number, number]> = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const positionsB: Array<[number, number]> = [
    [n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8],
    [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1],
  ];
  for (let i = 0; i < 15; i += 1) {
    const bit = (bits >> (14 - i)) & 1;
    grid[positionsA[i][0]][positionsA[i][1]] = bit;
    grid[positionsB[i][0]][positionsB[i][1]] = bit;
  }
  grid[n - 8][8] = 1;
}

function penalty(grid: number[][]): number {
  const n = grid.length;
  let score = 0;
  for (let r = 0; r < n; r += 1) {
    let run = 1;
    for (let c = 1; c <= n; c += 1) {
      if (c < n && grid[r][c] === grid[r][c - 1]) run += 1;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
  }
  for (let c = 0; c < n; c += 1) {
    let run = 1;
    for (let r = 1; r <= n; r += 1) {
      if (r < n && grid[r][c] === grid[r - 1][c]) run += 1;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
  }
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
  }
  const finder = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const finderRev = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const scan = (line: number[]) => {
    for (let i = 0; i <= line.length - 11; i += 1) {
      let a = true;
      let b = true;
      for (let k = 0; k < 11; k += 1) {
        if (line[i + k] !== finder[k]) a = false;
        if (line[i + k] !== finderRev[k]) b = false;
      }
      if (a || b) score += 40;
    }
  };
  for (let r = 0; r < n; r += 1) scan(grid[r]);
  for (let c = 0; c < n; c += 1) scan(grid.map((row) => row[c]));
  let dark = 0;
  for (const row of grid) for (const cell of row) dark += cell;
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function buildFunctionGrid(version: number): number[][] {
  const n = sizeOf(version);
  const grid = Array.from({ length: n }, () => Array<number>(n).fill(-1));
  setFinder(grid, 0, 0);
  setFinder(grid, 0, n - 7);
  setFinder(grid, n - 7, 0);
  for (let i = 0; i < n; i += 1) {
    if (grid[6][i] < 0) grid[6][i] = i % 2 === 0 ? 1 : 0;
    if (grid[i][6] < 0) grid[i][6] = i % 2 === 0 ? 1 : 0;
  }
  const aligns = ALIGNMENT[version] ?? [];
  for (const ar of aligns) {
    for (const ac of aligns) {
      if (ar <= 8 && ac <= 8) continue;
      if (ar <= 8 && ac >= n - 9) continue;
      if (ar >= n - 9 && ac <= 8) continue;
      setAlignment(grid, ar, ac);
    }
  }
  return grid.map((row) => row.map((cell) => (cell < 0 ? 0 : cell)));
}

function encodeQr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text).length;
  let chosen = ECC_TABLE.find((row) => {
    const countBits = row[0] <= 9 ? 8 : 16;
    const capacityBytes = Math.floor((row[2] * 8 - 4 - countBits) / 8);
    return capacityBytes >= bytes;
  });
  if (!chosen) chosen = ECC_TABLE[ECC_TABLE.length - 1];
  const [version, ecc, dataCodewords, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = chosen;
  const data = bitString(text, version, dataCodewords);
  const interleaved = interleave(data, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data);
  const base = buildFunctionGrid(version);
  placeData(base, version, interleaved);
  let best: number[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const masked = applyMask(base, version, mask);
    drawFormat(masked, ecc, mask);
    const score = penalty(masked);
    if (score < bestScore) {
      bestScore = score;
      best = masked;
    }
  }
  const grid = best ?? base;
  return grid.map((row) => row.map((cell) => cell === 1));
}

export function BookingQr({ url }: { url: string }) {
  const modules = encodeQr(url);
  const n = modules.length;
  const quiet = 4;
  const dim = n + quiet * 2;
  const parts: string[] = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!modules[r][c]) continue;
      parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    }
  }
  return (
    /* The same code the login panel draws: 9rem, no white plate, no border,
       modules in the page's own ink. It used to be 11rem of black on a white
       card, which is the safer thing for a scanner but read as a different
       component from the one two clicks away. Matched on the owner's
       instruction — if it ever fails to scan on the dark theme, the plate is
       what was protecting it and it goes back here. */
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="link-booking-whatsapp-qr"
      className="inline-block w-36 text-foreground"
      aria-label="Open WhatsApp with the booking message"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${dim} ${dim}`}
        className="w-full"
        role="img"
        aria-hidden="true"
      >
        <path className="fill-current" d={parts.join("")} />
      </svg>
      <span className="sr-only">Open WhatsApp</span>
    </a>
  );
}
