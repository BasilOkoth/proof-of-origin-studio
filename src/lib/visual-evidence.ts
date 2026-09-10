import type { EvidenceAsset, EvidenceSourceType } from "./types";

export const VISUAL_EVIDENCE_VERSION = "visual-evidence-2026-09-10-v1";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const IMAGE_MIME = /^image\/(jpeg|png|webp|gif)$/i;

export function isNativeImageFile(
  file: Pick<File, "name" | "type">
) {
  return IMAGE_EXT.test(file.name) || IMAGE_MIME.test(file.type);
}

export function isNativeImageRecord(record: {
  fileName?: string;
  mimeType?: string;
}) {
  return Boolean(
    (record.fileName && IMAGE_EXT.test(record.fileName)) ||
      (record.mimeType && IMAGE_MIME.test(record.mimeType))
  );
}

export function cleanVisualTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error("Unable to read image."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Image could not be converted to a data URL."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function visualAssetFromBlob(input: {
  blob: Blob;
  fileName: string;
  id?: string;
  sourceLabel?: string;
  sourceType?: EvidenceSourceType;
}): Promise<EvidenceAsset> {
  const dataUrl = await blobToDataUrl(input.blob);

  return {
    id: input.id || crypto.randomUUID(),
    name: input.fileName,
    mimeType: input.blob.type || "image/jpeg",
    dataUrl,
    sourceLabel: input.sourceLabel || input.fileName,
    sourceType: input.sourceType || "field",
    visualEvidenceVersion: VISUAL_EVIDENCE_VERSION,
  };
}

export function visualEvidenceSummary(fileName: string) {
  return `${fileName} is stored as visual evidence. No textual claims were extracted from the image bytes. Assign it to a scene only when the image is relevant to that scene's evidence.`;
}

export function looksLikeBinaryGarbage(value?: string) {
  if (!value) return false;

  const sample = value.slice(0, 1200);
  const replacementCount = (sample.match(/�/g) || []).length;
  const controlCount = [...sample].filter((char) => {
    const code = char.charCodeAt(0);
    return (
      code === 0 ||
      (code < 9) ||
      (code > 13 && code < 32)
    );
  }).length;

  return replacementCount >= 2 || controlCount >= 2;
}
