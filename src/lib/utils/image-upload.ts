/**
 * Client-side image preparation for gallery-step submissions.
 *
 * Browser-only (uses Image/canvas), so this is deliberately NOT re-exported
 * from `@/lib/utils` -- import it directly, the same way session-token.ts is
 * kept out of the barrel for being server-only.
 *
 * Why this exists: /api/submissions/upload rejects anything over 5MB, and the
 * storage bucket enforces the same limit. Participants paste AI-generated
 * images, and a high-resolution PNG from an image model routinely exceeds that.
 * Failing at the end of the submit flow is the worst possible moment, so
 * oversized images are downscaled and re-encoded to WebP before they are sent.
 */

/** Mirrors ALLOWED_TYPES in src/app/api/submissions/upload/route.ts, minus GIF. */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Matches MAX_SIZE in the upload route and the bucket's file_size_limit. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Leave headroom under the hard limit rather than encoding right up to it. */
const DOWNSCALE_TRIGGER_BYTES = 4 * 1024 * 1024;

/** Comfortably above 4K projector height; beyond this adds bytes, not detail. */
const MAX_EDGE_PX = 2400;

export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(',');

export function isAcceptedImageType(type: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}

function drawScaled(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement | null {
  const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export interface PreparedImage {
  file: File;
  /** True when the image was re-encoded, so the UI can say so. */
  wasCompressed: boolean;
  originalBytes: number;
}

/**
 * Returns a file guaranteed to be within the upload limit, or throws with a
 * message safe to show the participant.
 *
 * Small files are passed through untouched -- no needless re-encode, and no
 * quality loss on an image that would have uploaded fine as-is.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (!isAcceptedImageType(file.type)) {
    throw new Error('Please choose a PNG, JPG or WebP image.');
  }

  const originalBytes = file.size;

  if (file.size <= DOWNSCALE_TRIGGER_BYTES) {
    return { file, wasCompressed: false, originalBytes };
  }

  const img = await loadImage(file);

  // Progressively harder settings. Most images clear the first attempt; the
  // later rungs exist for very large or noisy AI output that resists WebP.
  const attempts: Array<{ maxEdge: number; quality: number }> = [
    { maxEdge: MAX_EDGE_PX, quality: 0.9 },
    { maxEdge: MAX_EDGE_PX, quality: 0.75 },
    { maxEdge: 1600, quality: 0.75 },
    { maxEdge: 1280, quality: 0.7 },
  ];

  for (const { maxEdge, quality } of attempts) {
    const canvas = drawScaled(img, maxEdge);
    if (!canvas) break;

    const blob = await canvasToBlob(canvas, quality);
    if (!blob) break;

    if (blob.size <= MAX_UPLOAD_BYTES) {
      const name = file.name.replace(/\.[^.]+$/, '') || 'image';
      return {
        file: new File([blob], `${name}.webp`, { type: 'image/webp' }),
        wasCompressed: true,
        originalBytes,
      };
    }
  }

  throw new Error(
    `That image is ${formatBytes(originalBytes)} and could not be reduced below ${formatBytes(MAX_UPLOAD_BYTES)}. Please try a smaller image.`
  );
}

/**
 * Pulls the first image out of a paste event's clipboard payload.
 *
 * Returns null when the clipboard holds no image, which is the signal to let
 * the paste through untouched so that pasting text into the caption box keeps
 * behaving normally.
 */
export function getImageFromClipboard(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null;

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== 'file') continue;
    if (!item.type.startsWith('image/')) continue;

    const file = item.getAsFile();
    if (file) return file;
  }

  return null;
}

/** True when a paste carries an image, without consuming it. */
export function clipboardHasImage(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData) return false;
  return Array.from(clipboardData.items).some(
    (item) => item.kind === 'file' && item.type.startsWith('image/')
  );
}
