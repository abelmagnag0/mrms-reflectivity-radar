import { Buffer } from 'node:buffer';

import { PNG } from 'pngjs';

import { HttpError } from '../errors/httpError.js';

const COLOR_SCALE = [
  { threshold: 5, rgba: [0, 0, 0, 0] },
  { threshold: 15, rgba: [26, 72, 171, 120] },
  { threshold: 25, rgba: [40, 113, 203, 150] },
  { threshold: 35, rgba: [29, 149, 197, 165] },
  { threshold: 45, rgba: [33, 171, 144, 185] },
  { threshold: 55, rgba: [144, 202, 94, 210] },
  { threshold: 65, rgba: [233, 186, 63, 230] },
  { threshold: 75, rgba: [220, 94, 36, 240] },
  { threshold: Infinity, rgba: [180, 36, 36, 255] },
];

export async function generateOverlayPng(gridPayload) {
  const { rows, cols, data, dataEncoding } = gridPayload;

  if (!rows || !cols || !Buffer.isBuffer(data) || !dataEncoding) {
    throw new HttpError(500, 'Invalid grid payload for PNG generation');
  }

  if (dataEncoding.format !== 'int16') {
    throw new HttpError(500, `Unsupported grid encoding format: ${dataEncoding.format}`);
  }

  const scale = Number.isFinite(dataEncoding.scale) ? dataEncoding.scale : 1;
  const offset = Number.isFinite(dataEncoding.offset) ? dataEncoding.offset : 0;
  const missing = Number.isFinite(dataEncoding.missing) ? dataEncoding.missing : -32768;

  const view = new Int16Array(data.buffer, data.byteOffset, data.byteLength / Int16Array.BYTES_PER_ELEMENT);

  const png = new PNG({ width: cols, height: rows });
  const pixelData = png.data;

  for (let idx = 0; idx < view.length; idx += 1) {
    const raw = view[idx];
    const pixelOffset = idx * 4;

    if (raw === missing) {
      pixelData[pixelOffset + 3] = 0;
      continue;
    }

    const value = raw * scale + offset;
    const { rgba } = COLOR_SCALE.find(({ threshold }) => value < threshold) ?? COLOR_SCALE.at(-1);
    const [r, g, b, a] = rgba;

    pixelData[pixelOffset + 0] = r;
    pixelData[pixelOffset + 1] = g;
    pixelData[pixelOffset + 2] = b;
    pixelData[pixelOffset + 3] = a;
  }

  return PNG.sync.write(png);
}
