// png-lite.js
// Tiny, dependency-free PNG writer. The project intentionally avoids
// adding native/npm image libraries (see zip-lite.js for the same
// philosophy applied to zip files), so this implements just the one
// thing the animated-cursor feature needs: a fully transparent RGBA
// PNG of an exact width/height, used to "blank out" Roblox's own
// cursor texture for states where the native animated overlay is
// doing the drawing instead.

const zlib = require('zlib');

// CRC32 (PNG chunk footer). Node's zlib.crc32 exists on newer Node
// versions but not all Electron builds guarantee it, so we ship a
// small table-based fallback that always works.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0;
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Builds a (practically) fully transparent 32-bit RGBA PNG.
 *
 * `marker` (0..15) lets the native helper tell otherwise identical blank
 * cursors apart: every pixel is set to (marker, marker, marker, marker),
 * i.e. an alpha of at most 15/255 with near-black colour -- invisible on
 * screen, but readable from the OS cursor bitmap (see native/marker.h).
 * marker = 0 gives the classic all-zero fully transparent image.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [marker=0]
 * @returns {Buffer}
 */
function makeTransparentPng(width, height, marker = 0) {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData.writeUInt8(8, 8);   // bit depth
  ihdrData.writeUInt8(6, 9);   // color type: RGBA
  ihdrData.writeUInt8(0, 10);  // compression
  ihdrData.writeUInt8(0, 11);  // filter
  ihdrData.writeUInt8(0, 12);  // interlace

  // Raw scanlines: 1 filter-type byte (0 = None) + w*4 zero bytes, per row.
  const rowBytes = 1 + w * 4;
  const raw = Buffer.alloc(rowBytes * h); // all zero => filter=0, RGBA=0,0,0,0
  const m = Math.max(0, Math.min(15, marker | 0));
  if (m > 0) {
    for (let y = 0; y < h; y++) {
      // byte 0 of each row is the filter type (stays 0); the rest is RGBA.
      raw.fill(m, y * rowBytes + 1, (y + 1) * rowBytes);
    }
  }
  const idatData = zlib.deflateSync(raw, { level: 6 });

  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
  return png;
}

module.exports = { makeTransparentPng };
