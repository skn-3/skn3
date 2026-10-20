// Builds public/og-image.png (1200x630) for link previews: the stamp logo centred on white.
// Pure Node (zlib only), no dependencies. Run: node scripts/make-og-image.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";

const SRC = "public/brand/logo-stamp-ink.png";
const OUT = "public/og-image.png";
const W = 1200, H = 630, LOGO = 480;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodePng(buf) {
  let p = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), name = buf.toString("ascii", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (name === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; }
    if (name === "IDAT") idat.push(data);
    p += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2)) throw new Error(`Unsupported PNG (depth ${depth}, type ${type})`);
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++], line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, data: out };
}

function encodePng(w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const chunk = (name, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const nd = Buffer.concat([Buffer.from(name, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(nd));
    return Buffer.concat([len, nd, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const logo = decodePng(readFileSync(SRC));
const canvas = Buffer.alloc(W * H * 3, 255);
const scale = logo.w / LOGO, ox = Math.round((W - LOGO) / 2), oy = Math.round((H - LOGO) / 2);
for (let y = 0; y < LOGO; y++) {
  for (let x = 0; x < LOGO; x++) {
    // box filter: average the source pixels that map onto this output pixel, alpha-weighted
    const sx0 = Math.floor(x * scale), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * scale));
    const sy0 = Math.floor(y * scale), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * scale));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = sy0; sy < sy1 && sy < logo.h; sy++) for (let sx = sx0; sx < sx1 && sx < logo.w; sx++) {
      const i = (sy * logo.w + sx) * 4, al = logo.data[i + 3] / 255;
      r += logo.data[i] * al; g += logo.data[i + 1] * al; b += logo.data[i + 2] * al; a += al; n++;
    }
    const cov = a / n, d = ((oy + y) * W + ox + x) * 3;
    canvas[d] = Math.round((a ? r / a : 255) * cov + 255 * (1 - cov));
    canvas[d + 1] = Math.round((a ? g / a : 255) * cov + 255 * (1 - cov));
    canvas[d + 2] = Math.round((a ? b / a : 255) * cov + 255 * (1 - cov));
  }
}
writeFileSync(OUT, encodePng(W, H, canvas));
console.log(`wrote ${OUT} (${W}x${H})`);
