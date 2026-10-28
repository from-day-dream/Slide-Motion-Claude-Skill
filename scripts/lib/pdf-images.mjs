// Embedded raster images out of a PDF without dependencies. Handles JPEG streams (DCTDecode, written
// as they are) and 8-bit Flate bitmaps in Gray/RGB/CMYK (with PNG predictors), which covers most photos
// in reports and decks. Anything else (JPX, JBIG2, indexed colour, encrypted files) is skipped and counted.
import fs from 'node:fs';
import zlib from 'node:zlib';
import sharp from 'sharp';

const num = (dict, key) => { const m = new RegExp(`/${key}\\s+(\\d+)(?!\\s+\\d+\\s+R)`).exec(dict); return m ? Number(m[1]) : null; };

// Undo PNG predictors (Predictor >= 10): each row starts with a filter-type byte.
function unpredict(data, bpp, rowLen) {
  const out = Buffer.alloc((data.length / (rowLen + 1)) * rowLen | 0);
  let prev = Buffer.alloc(rowLen);
  for (let r = 0, i = 0, o = 0; i + rowLen < data.length + 1 && o < out.length; r++) {
    const type = data[i++];
    const row = out.subarray(o, o + rowLen);
    for (let x = 0; x < rowLen; x++) {
      const raw = data[i + x], left = x >= bpp ? row[x - bpp] : 0, up = prev[x], ul = x >= bpp ? prev[x - bpp] : 0;
      let v = raw;
      if (type === 1) v = raw + left;
      else if (type === 2) v = raw + up;
      else if (type === 3) v = raw + ((left + up) >> 1);
      else if (type === 4) { const p = left + up - ul, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul); v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul); }
      row[x] = v & 255;
    }
    prev = row; i += rowLen; o += rowLen;
  }
  return out;
}

// Returns { images: [{ data (PNG or JPEG buffer), ext, width, height }], skipped, encrypted }.
export async function extractPdfImages(file) {
  const buf = fs.readFileSync(file);
  const text = buf.toString('latin1');
  if (/\/Encrypt\s/.test(text)) return { images: [], skipped: 0, encrypted: true };
  const images = [];
  let skipped = 0;
  const re = /\d+\s+\d+\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g;
  for (let m; (m = re.exec(text));) {
    const dict = m[1];
    if (!/\/Subtype\s*\/Image/.test(dict)) continue;
    const start = m.index + m[0].length;
    const len = num(dict, 'Length');
    let end = len !== null ? start + len : text.indexOf('endstream', start);
    if (end < start) { skipped++; continue; }
    if (len === null) while (end > start && (buf[end - 1] === 0x0a || buf[end - 1] === 0x0d)) end--;
    const data = buf.subarray(start, end);
    const w = num(dict, 'Width'), h = num(dict, 'Height'), bpc = num(dict, 'BitsPerComponent') ?? 8;
    const filters = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1] || '').match(/\/\w+/g) || [];
    try {
      if (filters.at(-1) === '/DCTDecode') {
        const jpeg = filters.length > 1 ? zlib.inflateSync(data) : data;
        // Normalise CMYK/odd JPEGs to sRGB so browsers show them right.
        images.push({ data: await sharp(jpeg).toColourspace('srgb').jpeg({ quality: 92 }).toBuffer(), ext: 'jpg', width: w, height: h });
      } else if (filters.length === 1 && filters[0] === '/FlateDecode' && bpc === 8 && w && h) {
        let raw = zlib.inflateSync(data);
        const cs = /\/ColorSpace\s*\/(DeviceRGB|DeviceGray|DeviceCMYK)/.exec(dict)?.[1];
        const channels = cs === 'DeviceGray' ? 1 : cs === 'DeviceCMYK' ? 4 : cs === 'DeviceRGB' ? 3 : Math.round(raw.length / (w * h));
        if (![1, 3, 4].includes(channels) || /\/Indexed/.test(dict)) { skipped++; continue; }
        if ((num(dict, 'Predictor') ?? 1) >= 10) raw = unpredict(raw, channels, w * channels);
        if (raw.length < w * h * channels) { skipped++; continue; }
        let img = sharp(raw.subarray(0, w * h * channels), { raw: { width: w, height: h, channels } });
        if (channels === 4) {
          // CMYK → RGB by hand (sharp's raw input has no CMYK mode).
          const rgb = Buffer.alloc(w * h * 3);
          for (let i = 0, o = 0; i < w * h * 4; i += 4, o += 3) {
            const k = 255 - raw[i + 3];
            rgb[o] = ((255 - raw[i]) * k) / 255; rgb[o + 1] = ((255 - raw[i + 1]) * k) / 255; rgb[o + 2] = ((255 - raw[i + 2]) * k) / 255;
          }
          img = sharp(rgb, { raw: { width: w, height: h, channels: 3 } });
        }
        images.push({ data: await img.png().toBuffer(), ext: 'png', width: w, height: h });
      } else skipped++;
    } catch { skipped++; }
  }
  return { images, skipped, encrypted: false };
}
