/**
 * Client-side image compression for chart screenshots and trade attachments.
 * Resizes oversized images (up to 2048px) and encodes them as high-quality JPEGs
 * with solid background to prevent transparent PNGs from turning black.
 *
 * Typical reduction: 4MB-10MB raw clipboard/OS screenshot -> ~150KB-300KB (85-95% bandwidth savings).
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0 (default 0.85)
  mimeType?: string; // default "image/jpeg"
}

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  savingsPercent: number;
  width: number;
  height: number;
}

/**
 * Format bytes into human readable format (e.g. 2.4 MB, 180 KB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Compress an image File on the client using HTML5 Canvas.
 */
export async function compressImageClient(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 0.85,
    mimeType = "image/jpeg",
  } = options;

  // If the file is not an image, return it unchanged
  if (!file.type.startsWith("image/")) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      savingsPercent: 0,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve) => {
    const originalSize = file.size;
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let targetWidth = img.naturalWidth || img.width;
      let targetHeight = img.naturalHeight || img.height;

      // Scale down if dimensions exceed bounds while maintaining aspect ratio
      if (targetWidth > maxWidth || targetHeight > maxHeight) {
        const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        // Fallback if canvas context fails
        resolve({
          file,
          originalSize,
          compressedSize: file.size,
          savingsPercent: 0,
          width: targetWidth,
          height: targetHeight,
        });
        return;
      }

      // Draw white background so transparent clipboard PNGs don't turn into black boxes
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Smooth downsampling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({
              file,
              originalSize,
              compressedSize: file.size,
              savingsPercent: 0,
              width: targetWidth,
              height: targetHeight,
            });
            return;
          }

          // If compressed is unexpectedly larger than original (rare, e.g. tiny 10KB files), keep original
          if (blob.size >= originalSize && file.type === "image/jpeg") {
            resolve({
              file,
              originalSize,
              compressedSize: originalSize,
              savingsPercent: 0,
              width: targetWidth,
              height: targetHeight,
            });
            return;
          }

          const baseName = file.name.replace(/\.[^/.]+$/, "");
          const ext = mimeType === "image/jpeg" ? ".jpg" : ".png";
          const newFileName = `${baseName || "screenshot"}-compressed${ext}`;

          const compressedFile = new File([blob], newFileName, {
            type: mimeType,
            lastModified: Date.now(),
          });

          const savingsPercent = Math.max(
            0,
            Math.round(((originalSize - blob.size) / originalSize) * 100)
          );

          resolve({
            file: compressedFile,
            originalSize,
            compressedSize: blob.size,
            savingsPercent,
            width: targetWidth,
            height: targetHeight,
          });
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        file,
        originalSize,
        compressedSize: file.size,
        savingsPercent: 0,
        width: 0,
        height: 0,
      });
    };

    img.src = url;
  });
}
