import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const convertHeic = require('heic-convert');

export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_SIDE = 10_000;

export const pngDimensions = (buffer) => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  return { type: 'image/png', extension: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

export const jpegDimensions = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xd8) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + segmentLength + 2 > buffer.length) break;
    if (startOfFrameMarkers.has(marker)) {
      return {
        type: 'image/jpeg',
        extension: 'jpg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += segmentLength + 2;
  }
  return null;
};

export const readImageInfo = (buffer) => pngDimensions(buffer) || jpegDimensions(buffer);

export const isHeicLikeImage = (buffer) => {
  if (buffer.length < 12) return false;
  const brand = buffer.subarray(4, 8).toString('ascii');
  const major = buffer.subarray(8, 12).toString('ascii').toLowerCase();
  if (brand !== 'ftyp') return false;
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(major);
};

// Steps down JPEG quality until the converted photo fits the caller's size budget.
export const convertHeicToJpeg = async (buffer, maxBytes) => {
  const qualities = [0.88, 0.76, 0.64];
  let lastOutput;
  for (const quality of qualities) {
    const output = Buffer.from(await convertHeic({ buffer, format: 'JPEG', quality }));
    lastOutput = output;
    if (output.length <= maxBytes) return output;
  }
  return lastOutput;
};

export const hasSupportedDimensions = (image, minSide = 100) => (
  image.width >= minSide
  && image.height >= minSide
  && image.width <= MAX_IMAGE_SIDE
  && image.height <= MAX_IMAGE_SIDE
  && image.width * image.height <= MAX_IMAGE_PIXELS
);
