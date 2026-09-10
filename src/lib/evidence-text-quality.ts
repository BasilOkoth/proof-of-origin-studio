import type { EvidenceItem } from "./types";

const FRONT_OR_TOC =
  /(?:^|\s)(?:\d{1,3}\s+)?(?:\d+(?:\.\d+)+\s+)?(?:chapter\s+\w+|table of contents|list of (?:figures|tables|plates|charts)|references|appendix|appendices)\b|\.{4,}/i;

const HEADING_FRAGMENT =
  /^(?:\d{1,3}\s+)?(?:\d+(?:\.\d+)+\s+)?[A-Z][A-Za-z &/,-]{3,90}(?:\.{3,}|$)/;

export function cleanExtractedEvidenceText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\s*\d{1,3}\s+(?=[A-Z][a-z])/g, "")
    .replace(/^\s*\d+(?:\.\d+){1,4}\s+/g, "")
    .replace(/\s*\.{4,}\s*/g, " ")
    .trim();
}

export function isExtractionArtifact(value: string) {
  const text = cleanExtractedEvidenceText(value);
  if (!text) return true;
  if (FRONT_OR_TOC.test(text)) return true;
  if (HEADING_FRAGMENT.test(text) && text.length < 150) return true;
  if (/^(?:page\s*)?\d{1,3}$/i.test(text)) return true;
  return false;
}

export function cleanEvidenceItems(items: EvidenceItem[]) {
  const seen = new Set<string>();

  return items
    .map((item) => ({
      ...item,
      statement: cleanExtractedEvidenceText(item.statement || ""),
    }))
    .filter((item) => {
      if (isExtractionArtifact(item.statement)) return false;

      const key = `${item.kind}|${item.statement}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
