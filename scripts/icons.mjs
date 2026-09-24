// Generates the PWA icon set — a dark rounded square with three ascending
// bars (reading / exercise / game). Zero dependencies: PNGs are encoded by
// hand with node:zlib. Run with `npm run icons`.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [15, 23, 42]; // #0f172a
const BARS = [
  [56, 189, 248], // reading #38bdf8
  [52, 211, 153], // exercise #34d399
  [167, 139, 250], // game #a78bfa
];

function crc32(buf) {
  crc32.table ??= (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();
  let c = ~0;
  for (const b of buf) c = crc32.table[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(16 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const inside = (x, y) => {
    if (maskable) return true;
    const cx = Math.max(radius, Math.min(size - 1 - radius, x));
    const cy = Math.max(radius, Math.min(size - 1 - radius, y));
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
  const put = (x, y, [r, g, b, a = 255]) => {
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      put(x, y, inside(x, y) ? [...BG] : [0, 0, 0, 0]);

  const margin = size * (maskable ? 0.2 : 0.17);
  const zone = size - 2 * margin;
  const bw = Math.round(zone * 0.2);
  const gap = Math.round(zone * 0.1);
  const startX = Math.round(margin + (zone - (3 * bw + 2 * gap)) / 2);
  const baseY = Math.round(size - margin);
  for (const [i, hf] of [0.42, 0.64, 0.88].entries()) {
    const top = Math.round(baseY - zone * hf);
    const x0 = startX + i * (bw + gap);
    for (let y = top; y < baseY; y++)
      for (let x = x0; x < x0 + bw; x++)
        if (inside(x, y)) put(x, y, BARS[i]);
  }
  return px;
}

function svg() {
  const rx = Math.round(512 * 0.22);
  const margin = 512 * 0.17;
  const zone = 512 - 2 * margin;
  const bw = Math.round(zone * 0.2);
  const gap = Math.round(zone * 0.1);
  const startX = Math.round(margin + (zone - (3 * bw + 2 * gap)) / 2);
  const baseY = Math.round(512 - margin);
  const bars = BARS.map(
    ([r, g, b], i) =>
      `<rect x="${startX + i * (bw + gap)}" y="${Math.round(baseY - zone * [0.42, 0.64, 0.88][i])}" width="${bw}" height="${Math.round(zone * [0.42, 0.64, 0.88][i])}" fill="rgb(${r},${g},${b})"/>`,
  ).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rx}" fill="rgb(${BG.join(",")})"/>
  ${bars}
</svg>
`;
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icon.svg", svg());
writeFileSync("public/icons/icon-192.png", encodePng(192, render(192, { maskable: false })));
writeFileSync("public/icons/icon-512.png", encodePng(512, render(512, { maskable: false })));
writeFileSync("public/icons/maskable-512.png", encodePng(512, render(512, { maskable: true })));
writeFileSync("public/icons/apple-touch-icon.png", encodePng(180, render(180, { maskable: true })));
console.log("icons written to public/");
