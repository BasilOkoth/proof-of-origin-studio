"use client";

import type { EvidenceAsset } from "./types";

export const PDF_VISUAL_EXTRACTION_VERSION =
  "pdf-visual-extraction-2026-09-10-v1";

export type PdfVisualKind =
  | "plate"
  | "figure"
  | "map"
  | "chart";

export type PdfVisualCandidate = {
  id: string;
  kind: PdfVisualKind;
  label: string;
  caption: string;
  pageNumber: number;
  fileName: string;
  mimeType: "image/jpeg";
  blob: Blob;
  dataUrl: string;
  asset: EvidenceAsset;
  cropConfidence: number;
  sourceLabel: string;
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type TextLine = {
  text: string;
  y: number;
  x: number;
};

const CAPTION_PATTERN =
  /^\s*(Plate|Figure|Map|Chart)\s+([0-9]+(?:\s*[-.:]\s*[0-9]+)?)(?:\s*[:.-]\s*|\s+)(.+?)\s*$/i;

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function kindFromCaption(value: string): PdfVisualKind {
  const lower = value.toLowerCase();
  if (lower.startsWith("plate")) return "plate";
  if (lower.startsWith("map")) return "map";
  if (lower.startsWith("chart")) return "chart";
  return "figure";
}

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error("Unable to encode extracted PDF visual."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.9
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to create JPEG from PDF visual."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url
    ).toString();
  }

  return pdfjs;
}

function textLines(items: PdfTextItem[]): TextLine[] {
  const positioned = items
    .map((item) => ({
      text: String(item.str || "").trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
    }))
    .filter((item) => item.text);

  positioned.sort((a, b) => {
    if (Math.abs(a.y - b.y) <= 3) return a.x - b.x;
    return b.y - a.y;
  });

  const lines: TextLine[] = [];

  for (const item of positioned) {
    const existing = lines.find(
      (line) => Math.abs(line.y - item.y) <= 3
    );

    if (!existing) {
      lines.push({
        text: item.text,
        x: item.x,
        y: item.y,
      });
      continue;
    }

    if (item.x < existing.x) {
      existing.text = `${item.text} ${existing.text}`.trim();
      existing.x = item.x;
    } else {
      existing.text = `${existing.text} ${item.text}`.trim();
    }
  }

  return lines
    .map((line) => ({
      ...line,
      text: line.text.replace(/\s+/g, " ").trim(),
    }))
    .sort((a, b) => b.y - a.y);
}

function captionCandidates(lines: TextLine[]) {
  return lines.flatMap((line) => {
    const match = line.text.match(CAPTION_PATTERN);
    if (!match) return [];

    const kind = kindFromCaption(match[1]);
    const number = match[2].replace(/\s+/g, "");
    const description = match[3].trim();

    return [
      {
        kind,
        label: `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${number}`,
        caption: `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${number}: ${description}`,
        y: line.y,
      },
    ];
  });
}

function cropBounds(
  pageCanvas: HTMLCanvasElement,
  captionCanvasY: number,
  kind: PdfVisualKind
) {
  const width = pageCanvas.width;
  const height = pageCanvas.height;

  /*
   * Most academic/report figures place the image immediately ABOVE its
   * caption. We intentionally preserve some surrounding context so source
   * provenance remains visible instead of attempting brittle object detection.
   */
  const aboveFraction =
    kind === "map" || kind === "figure" ? 0.5 : 0.42;
  const belowFraction = 0.075;

  const top = Math.max(
    0,
    Math.round(captionCanvasY - height * aboveFraction)
  );
  const bottom = Math.min(
    height,
    Math.round(captionCanvasY + height * belowFraction)
  );

  const left = Math.round(width * 0.035);
  const right = Math.round(width * 0.965);

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function cropConfidence(
  captionCanvasY: number,
  pageHeight: number
) {
  const ratio = captionCanvasY / Math.max(1, pageHeight);

  if (ratio > 0.35 && ratio < 0.92) return 0.88;
  if (ratio >= 0.18 && ratio <= 0.96) return 0.72;
  return 0.55;
}

export async function extractPdfVisuals({
  blob,
  fileName,
  maxVisuals = 28,
  maxPages = 140,
  renderScale = 1.65,
  onProgress,
}: {
  blob: Blob;
  fileName: string;
  maxVisuals?: number;
  maxPages?: number;
  renderScale?: number;
  onProgress?: (message: string) => void;
}): Promise<PdfVisualCandidate[]> {
  if (
    blob.type !== "application/pdf" &&
    !fileName.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("PDF Visual Extraction requires a PDF.");
  }

  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await blob.arrayBuffer());

  onProgress?.("Opening PDF visual layer…");

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, maxPages);

  const discoveries: Array<{
    pageNumber: number;
    kind: PdfVisualKind;
    label: string;
    caption: string;
    y: number;
  }> = [];

  /*
   * Pass 1: cheap text scan. Only pages containing explicit Plate/Figure/Map/
   * Chart captions are rendered. This keeps large reports practical.
   */
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    onProgress?.(
      `Scanning PDF captions · page ${pageNumber}/${pageCount}`
    );

    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = textLines(content.items as PdfTextItem[]);

    for (const candidate of captionCandidates(lines)) {
      discoveries.push({
        pageNumber,
        ...candidate,
      });

      if (discoveries.length >= maxVisuals) break;
    }

    if (discoveries.length >= maxVisuals) break;
  }

  if (!discoveries.length) {
    onProgress?.(
      "No Plate, Figure, Map or Chart captions were detected."
    );
    return [];
  }

  const results: PdfVisualCandidate[] = [];
  const byPage = new Map<
    number,
    typeof discoveries
  >();

  for (const item of discoveries) {
    const bucket = byPage.get(item.pageNumber) || [];
    bucket.push(item);
    byPage.set(item.pageNumber, bucket);
  }

  let rendered = 0;

  for (const [pageNumber, pageCandidates] of byPage) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: renderScale });

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);

    const context = pageCanvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      throw new Error("Canvas rendering is unavailable.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(
      0,
      0,
      pageCanvas.width,
      pageCanvas.height
    );

    onProgress?.(
      `Rendering source page ${pageNumber} · ${rendered + 1}/${discoveries.length}`
    );

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    for (const candidate of pageCandidates) {
      const [, captionCanvasY] =
        viewport.convertToViewportPoint(0, candidate.y);

      const bounds = cropBounds(
        pageCanvas,
        captionCanvasY,
        candidate.kind
      );

      const crop = document.createElement("canvas");
      crop.width = bounds.width;
      crop.height = bounds.height;

      const cropContext = crop.getContext("2d", {
        alpha: false,
      });

      if (!cropContext) continue;

      cropContext.fillStyle = "#ffffff";
      cropContext.fillRect(
        0,
        0,
        crop.width,
        crop.height
      );

      cropContext.drawImage(
        pageCanvas,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height
      );

      const imageBlob = await canvasToJpeg(crop);
      const dataUrl = await dataUrlFromBlob(imageBlob);

      const fileBase =
        fileName.replace(/\.pdf$/i, "") || "document";
      const outputFileName =
        `${safeSlug(fileBase)}-${safeSlug(candidate.label)}-p${pageNumber}.jpg`;

      const sourceLabel =
        `${fileName} · page ${pageNumber} · ${candidate.caption}`;

      const assetId =
        `pdf-visual-${safeSlug(fileBase)}-${pageNumber}-${safeSlug(candidate.label)}`;

      const asset: EvidenceAsset = {
        id: assetId,
        name: outputFileName,
        mimeType: "image/jpeg",
        dataUrl,
        sourceLabel,
        sourceType: "field",
        visualEvidenceVersion:
          PDF_VISUAL_EXTRACTION_VERSION,
      };

      results.push({
        id: assetId,
        kind: candidate.kind,
        label: candidate.label,
        caption: candidate.caption,
        pageNumber,
        fileName: outputFileName,
        mimeType: "image/jpeg",
        blob: imageBlob,
        dataUrl,
        asset,
        cropConfidence: cropConfidence(
          captionCanvasY,
          pageCanvas.height
        ),
        sourceLabel,
      });

      rendered += 1;
      if (results.length >= maxVisuals) break;
    }

    page.cleanup();

    if (results.length >= maxVisuals) break;
  }

  await pdf.destroy();

  onProgress?.(
    `Extracted ${results.length} source visual${results.length === 1 ? "" : "s"} with page-level provenance.`
  );

  return results;
}
