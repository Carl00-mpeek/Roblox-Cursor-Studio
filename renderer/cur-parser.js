
function decodeCurOrIco(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  const reserved = view.getUint16(0, true);
  const type = view.getUint16(2, true);
  const count = view.getUint16(4, true);
  if (reserved !== 0 || (type !== 1 && type !== 2) || count === 0) {
    throw new Error(t('cur_invalid_file'));
  }

  let best = null;
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w = bytes[off] || 256;
    const h = bytes[off + 1] || 256;
    const bytesInRes = view.getUint32(off + 8, true);
    const imageOffset = view.getUint32(off + 12, true);
    const entry = { w, h, bytesInRes, imageOffset };
    if (!best || entry.w * entry.h > best.w * best.h) best = entry;
  }
  if (!best || best.imageOffset + best.bytesInRes > arrayBuffer.byteLength) {
    throw new Error(t('cur_image_entry_read_failed'));
  }

  const data = new Uint8Array(arrayBuffer, best.imageOffset, best.bytesInRes);

  if (data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
    const blob = new Blob([data], { type: 'image/png' });
    return { isPng: true, blobUrl: URL.createObjectURL(blob) };
  }

  const dibBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const canvas = decodeDibToCanvas(dibBuffer);
  return { isPng: false, canvas };
}

function decodeDibToCanvas(dibBuffer) {
  const dv = new DataView(dibBuffer);
  const headerSize = dv.getUint32(0, true);
  const width = dv.getInt32(4, true);
  const rawHeight = dv.getInt32(8, true);
  const height = Math.floor(Math.abs(rawHeight) / 2);
  const bitCount = dv.getUint16(14, true);
  const compression = dv.getUint32(16, true);

  if (!width || !height) throw new Error(t('cur_invalid_image_size'));
  if (compression !== 0) throw new Error(t('cur_compressed_unsupported'));

  let palette = null;
  let paletteOffset = headerSize;
  if (bitCount <= 8) {
    const paletteCount = 1 << bitCount;
    palette = [];
    for (let i = 0; i < paletteCount; i++) {
      const o = paletteOffset + i * 4;
      palette.push([dv.getUint8(o + 2), dv.getUint8(o + 1), dv.getUint8(o)]);
    }
  }

  const pixelDataStart = paletteOffset + (palette ? palette.length * 4 : 0);
  const rowSizeXor = Math.floor((bitCount * width + 31) / 32) * 4;
  const xorStart = pixelDataStart;
  const xorSize = rowSizeXor * height;
  const andRowSize = Math.floor((width + 31) / 32) * 4;
  const andStart = xorStart + xorSize;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    const rowOffset = xorStart + srcY * rowSizeXor;
    const andRowOffset = andStart + srcY * andRowSize;

    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 255;

      if (bitCount === 32) {
        const o = rowOffset + x * 4;
        b = dv.getUint8(o); g = dv.getUint8(o + 1); r = dv.getUint8(o + 2); a = dv.getUint8(o + 3);
      } else if (bitCount === 24) {
        const o = rowOffset + x * 3;
        b = dv.getUint8(o); g = dv.getUint8(o + 1); r = dv.getUint8(o + 2);
      } else if (palette) {
        const byteIndex = rowOffset + Math.floor((x * bitCount) / 8);
        const byteVal = dv.getUint8(byteIndex);
        let idx = 0;
        if (bitCount === 8) idx = byteVal;
        else if (bitCount === 4) idx = (x % 2 === 0) ? (byteVal >> 4) : (byteVal & 0x0F);
        else if (bitCount === 1) idx = (byteVal >> (7 - (x % 8))) & 1;
        const c = palette[idx] || [0, 0, 0];
        r = c[0]; g = c[1]; b = c[2];
      }

      if (bitCount !== 32) {
        const byteIndex = andRowOffset + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        const maskBit = (dv.getUint8(byteIndex) >> bitIndex) & 1;
        if (maskBit === 1) a = 0;
      }

      const di = (y * width + x) * 4;
      imgData.data[di] = r;
      imgData.data[di + 1] = g;
      imgData.data[di + 2] = b;
      imgData.data[di + 3] = a;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
