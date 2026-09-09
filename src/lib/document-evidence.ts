import type { DocumentIngestion, EvidenceItem } from "./types";

function clean(value: string) {
  return value.replace(/\u0000/g, "").replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
}

function cleanLine(value: string) {
  return value.replace(/\u0000/g, "").replace(/\u00ad/g, "").replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeMetadata(line: string) {
  return (
    /^(abstract|introduction|summary|contents|table of contents|keywords?|original article|research article|article|date published|received|accepted|published|acknowledg(e)?ment|references|materials? and methods?|methods?|results?|discussion|conclusion(?:s)?(?: and recommendations?)?)$/i.test(line) ||
    /\b(?:issn|doi|volume\s+\d+|issue\s+\d+|journal|copyright|creative commons|licensed under|www\.|https?:\/\/|e-?issn|print issn|online issn)\b/i.test(line) ||
    /^\d+\s*[|/-]/.test(line) ||
    /^\d+$/.test(line)
  );
}

function likelyAuthorLine(line: string) {
  const commas = (line.match(/,/g) || []).length;
  return /\b(?:et al\.?|ORCID|author for correspondence|corresponding author)\b/i.test(line) ||
    (commas >= 2 && /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(line));
}

function titleScore(line: string, index: number, lines: string[]) {
  if (line.length < 18 || line.length > 190) return -100;
  if (looksLikeMetadata(line) || likelyAuthorLine(line)) return -100;

  let score = index < 35 ? 16 : 0;
  if (index < 20) score += 8;
  if (/\b(effect|effects|impact|influence|relationship|association|role|assessment|evaluation|analysis|growth|development|performance|comparison|response|drivers?|determinants?|patterns?|outcomes?)\b/i.test(line)) score += 30;
  if (/\b(on|of|in|among|between|across|for|under|using)\b/i.test(line)) score += 8;
  if (/^(original article|research article|article)$/i.test(lines[index - 1] || "")) score += 38;
  if (likelyAuthorLine(lines[index + 1] || "")) score += 24;
  if (/[.!?]$/.test(line)) score -= 10;
  if (line.split(/\s+/).length < 4) score -= 10;
  return score;
}

function titleFromText(text: string, fileName: string) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean).slice(0, 80);
  const ranked = lines
    .map((line, index) => ({ line, score: titleScore(line, index, lines) }))
    .filter((x) => x.score > -50)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.line || fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function sentences(text: string) {
  return clean(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(clean)
    .filter((sentence) => sentence.length >= 38 && sentence.length <= 520);
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function choose(source: string[], matcher: RegExp, limit: number) {
  return unique(source.filter((sentence) => matcher.test(sentence))).slice(0, limit);
}

function observedScore(sentence: string) {
  let score = 0;
  if (/\b(results?|revealed|showed|found|observed|measured)\b/i.test(sentence)) score += 5;
  if (/\b(significant(?:ly)?|p\s*[<=>]|anova|tukey|confidence interval|effect size|eta squared)\b/i.test(sentence)) score += 5;
  if (/\b\d+(?:\.\d+)?\s*(?:%|cm|mm|kg|g|ha|km|m|°c|cm3)?\b/i.test(sentence)) score += 3;
  if (/\b(higher|lower|increased|decreased|largest|smallest|mean|average|difference|compared)\b/i.test(sentence)) score += 3;
  if (/\b(citation|doi|issn|published|license|references?)\b/i.test(sentence)) score -= 8;
  return score;
}

function item(kind: EvidenceItem["kind"], statement: string, fileName: string, sourceType: EvidenceItem["sourceType"]): EvidenceItem {
  return { id: crypto.randomUUID(), kind, statement, source: fileName, sourceLabel: fileName, sourceType };
}

function relationshipFromTitle(title: string) {
  const patterns = [
    /^(?:the\s+)?effects?\s+of\s+(.+?)\s+on\s+(.+)$/i,
    /^(?:the\s+)?impacts?\s+of\s+(.+?)\s+on\s+(.+)$/i,
    /^(?:the\s+)?influence\s+of\s+(.+?)\s+on\s+(.+)$/i,
    /^(?:the\s+)?role\s+of\s+(.+?)\s+in\s+(.+)$/i,
    /^(?:the\s+)?relationship\s+between\s+(.+?)\s+and\s+(.+)$/i,
    /^(?:the\s+)?association\s+between\s+(.+?)\s+and\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return { driver: clean(match[1]), outcome: clean(match[2]) };
  }
  return null;
}

export function ingestDocumentText(args: {
  text: string;
  fileName: string;
  kind: "research" | "report" | "text";
}): DocumentIngestion {
  const text = args.text.replace(/\u0000/g, "");
  const all = sentences(text);
  const title = titleFromText(text, args.fileName);
  const sourceType = args.kind === "research" ? "paper" : args.kind === "report" ? "report" : "other";

  const limitations = choose(
    all,
    /\b(limit(?:ation|ations|ed)?|however|uncertain(?:ty)?|cannot|could not|caution|bias|constraint|further research|future research|data gap|lack of|insufficient|may not|should be interpreted|not measured|not assessed|not evaluated|beyond the scope)\b/i,
    4
  );

  const inferences = choose(
    all,
    /\b(suggest(?:s|ed)?|indicat(?:e|es|ed)|impli(?:es|ed)|therefore|conclud(?:e|es|ed)|recommend(?:s|ed)?|interpret(?:ed|ation)|likely|may reflect|could be due|would be advantageous)\b/i,
    4
  ).filter((sentence) => !limitations.includes(sentence));

  const observed = unique(
    all.filter((sentence) =>
      /(?:\b\d+(?:\.\d+)?\s*%|\bp\s*[<=>]\s*\d|\bF\s*\(|\bANOVA\b|\bTukey\b|\b(found|observed|measured|reported|results?|revealed|showed|increased|decreased|higher|lower|associated|estimated|recorded|mean|average|significant(?:ly)?)\b)/i.test(sentence) &&
      !limitations.includes(sentence) &&
      !inferences.includes(sentence)
    )
  )
    .map((statement) => ({ statement, score: observedScore(statement) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 9)
    .map((entry) => entry.statement);

  const fallback = observed.length
    ? observed
    : all.filter((sentence) => !looksLikeMetadata(sentence) && !/\b(citation|references?|license|doi|issn)\b/i.test(sentence)).slice(0, 5);

  const evidence: EvidenceItem[] = [
    ...fallback.map((statement) => item("observed", statement, args.fileName, sourceType)),
    ...inferences.map((statement) => item("inference", statement, args.fileName, sourceType)),
    ...limitations.map((statement) => item("limitation", statement, args.fileName, sourceType)),
  ];

  const relationship = relationshipFromTitle(title);
  const suggestedQuestion =
    args.kind === "research"
      ? relationship
        ? `How much does ${relationship.driver} change ${relationship.outcome}, and what does the evidence actually support?`
        : `What does the evidence in “${title}” actually show, and how strong is the finding?`
      : args.kind === "report"
        ? `What are the strongest findings in “${title}”, what changed, and which claims are actually supported?`
        : `What does the evidence in “${title}” actually show?`;

  const kindLabel = args.kind === "research" ? "study" : args.kind === "report" ? "report" : "source";

  return {
    fileName: args.fileName,
    kind: args.kind,
    title,
    extractedCharacters: clean(text).length,
    suggestedTopic: title,
    suggestedQuestion,
    suggestedBrief: `Build the story from the imported ${kindLabel}. Identify the central relationship or finding, prioritise quantitative results and comparisons, keep observation separate from interpretation, and make evidence gaps explicit before publishing.`,
    evidence,
  };
}
