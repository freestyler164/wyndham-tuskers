const IMAGE_SOURCE_LIMIT_BYTES = 15 * 1024 * 1024;

export const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read this image.'));
  reader.readAsDataURL(file);
});

export const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not prepare this image.'));
  reader.readAsDataURL(blob);
});

export const loadImageFromDataUrl = (dataUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Could not load this image.'));
  image.src = dataUrl;
});

export const canvasToBlob = (canvas, contentType, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Could not compress this image.'));
  }, contentType, quality);
});

export const dominantColorFromCanvas = (canvas) => {
  const sampleWidth = Math.min(48, canvas.width);
  const sampleHeight = Math.min(48, canvas.height);
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleContext = sampleCanvas.getContext('2d');
  if (!sampleContext) return '';
  sampleContext.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 160) continue;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const brightness = (r + g + b) / 3;
    if (brightness > 238 || brightness < 18) continue;
    red += r;
    green += g;
    blue += b;
    count += 1;
  }
  if (!count) return '';
  const toHex = (value) => Math.round(value / count).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
};

export const prepareImageUpload = async (file, { maxDimension, maxOutputBytes, label }) => {
  const contentType = String(file?.type || '');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new Error(`${label} must be JPEG, PNG, or WebP.`);
  }
  if (file.size > IMAGE_SOURCE_LIMIT_BYTES) {
    throw new Error(`${label} must be 15 MB or smaller.`);
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(originalDataUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare image uploads.');

  let targetDimension = maxDimension;
  let quality = 0.86;
  let blob = null;
  let dominantColor = '';
  const outputType = contentType === 'image/webp' ? 'image/webp' : 'image/jpeg';

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const scale = Math.min(1, targetDimension / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (!dominantColor) dominantColor = dominantColorFromCanvas(canvas);
    blob = await canvasToBlob(canvas, outputType, quality);
    if (blob.size <= maxOutputBytes) break;
    if (quality > 0.58) {
      quality -= 0.1;
    } else {
      targetDimension = Math.max(720, Math.round(targetDimension * 0.82));
      quality = 0.78;
    }
  }

  if (!blob || blob.size > maxOutputBytes) {
    throw new Error(`${label} could not be compressed enough. Try a smaller image.`);
  }

  return {
    contentType: blob.type || outputType,
    dataUrl: await blobToDataUrl(blob),
    dominantColor,
    width: canvas.width,
    height: canvas.height,
  };
};

// react-easy-crop reports the selection in source-image pixels, so the crop is
// applied here rather than by scaling whatever the preview happened to show.
export const cropImageToBlob = async (dataUrl, area, contentType) => {
  const image = await loadImageFromDataUrl(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot crop images.');
  context.drawImage(
    image,
    Math.round(area.x),
    Math.round(area.y),
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const outputType = contentType === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvasToBlob(canvas, outputType, 0.92);
};
