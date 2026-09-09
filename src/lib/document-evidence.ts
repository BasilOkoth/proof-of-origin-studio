import type { DocumentIngestion, EvidenceItem } from "./types";

function clean(value: string) {
  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function titleFromText(text: string, fileName: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter((line) => line.length >= 8 && line.length <= 180);
  const first = lines.find((line) => !/^(abstract|introduction|summary|contents|table of contents)$/i.test(line));
  return first || fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
}

function sentences(text: string) {
  return clean(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => clean(sentence))
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 420);
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

function item(
  kind: EvidenceItem["kind"],
  statement: string,
  fileName: string,
  sourceType: EvidenceItem["sourceType"]
): EvidenceItem {
  return {
    id: crypto.randomUUID(),
    kind,
    statement,
    source: fileName,
    sourceLabel: fileName,
    sourceType,
  };
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

  const limitationSentences = choose(
    all,
    /\b(limit(?:ation|ations|ed)?|however|uncertain(?:ty)?|cannot|could not|caution|bias|constraint|further research|future research|data gap|lack of|insufficient|may not|should be interpreted)\b/i,
    3
  );
  const inferenceSentences = choose(
    all,
    /\b(suggest(?:s|ed)?|indicat(?:e|es|ed)|impli(?:es|ed)|therefore|conclud(?:e|es|ed)|recommend(?:s|ed)?|interpret(?:ed|ation)|likely|may reflect)\b/i,
    3
  ).filter((sentence) => !limitationSentences.includes(sentence));
  const observationSentences = choose(
    all,
    /(?:\b\d+(?:\.\d+)?\s*%|\b\d{2,}\b|\b(found|observed|measured|reported|result(?:s)?|increased|decreased|higher|lower|associated|estimated|recorded|accounted|represented|reached|declined|rose|grew|fell)\b)/i,
    7
  ).filter(
    (sentence) =>
      !limitationSentences.includes(sentence) && !inferenceSentences.includes(sentence)
  );

  const fallbackObserved = observationSentences.length
    ? observationSentences
    : all.slice(0, Math.min(4, all.length));

  const evidence: EvidenceItem[] = [
    ...fallbackObserved.map((statement) => item("observed", statement, args.fileName, sourceType)),
    ...inferenceSentences.map((statement) => item("inference", statement, args.fileName, sourceType)),
    ...limitationSentences.map((statement) => item("limitation", statement, args.fileName, sourceType)),
  ];

  const kindLabel = args.kind === "research" ? "study" : args.kind === "report" ? "report" : "source";
  const suggestedQuestion =
    args.kind === "research"
      ? `What did “${title}” actually find, and what are the limits of the evidence?`
      : args.kind === "report"
        ? `What does “${title}” show changed, and what evidence supports that conclusion?`
        : `What does the evidence in “${title}” actually show?`;

  return {
    fileName: args.fileName,
    kind: args.kind,
    title,
    extractedCharacters: clean(text).length,
    suggestedTopic: title,
    suggestedQuestion,
    suggestedBrief: `Build the story from the imported ${kindLabel}. Keep extracted observations separate from interpretive or limitation statements and verify the selected evidence against the source before publishing.`,
    evidence,
  };
}
