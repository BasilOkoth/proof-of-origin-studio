import type { DatasetAnalysis, EvidenceItem, EvidenceSourceType } from "./types";

export type ScoutProvider = "crossref" | "world_bank" | "existing";
export type ScoutAccess = "open_download" | "landing_page" | "metadata_only";

export type EvidenceScoutSource = {
  id: string;
  provider: ScoutProvider;
  sourceType: EvidenceSourceType;
  title: string;
  authors?: string[];
  year?: number;
  publisher?: string;
  doi?: string;
  url: string;
  downloadUrl?: string;
  license?: string;
  summary?: string;
  access: ScoutAccess;
  relevance: number;
  evidenceStrength: number;
  visualPotential: number;
  reason: string;
};

export type StoryQuestionCandidate = {
  id: string;
  question: string;
  angle:
    | "causal"
    | "comparison"
    | "change"
    | "myth_test"
    | "systems"
    | "unresolved";
  evidenceCoverage: number;
  curiosity: number;
  consequence: number;
  visualPotential: number;
  uncertainty: number;
  overall: number;
  rationale: string;
};

export type EvidenceCoverage = {
  scholarly: number;
  data: number;
  sourceDiversity: number;
  openAccess: number;
};

export type EvidenceScoutResponse = {
  query: string;
  searchedAt: string;
  questions: StoryQuestionCandidate[];
  sources: EvidenceScoutSource[];
  coverage: EvidenceCoverage;
  providerErrors: string[];
};

const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "again",
  "against",
  "all",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "even",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "more",
  "most",
  "of",
  "on",
  "or",
  "other",
  "our",
  "out",
  "over",
  "same",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "under",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
]);

export function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function tokenise(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export function buildScoutQuery(input: {
  topic: string;
  question: string;
  evidence: EvidenceItem[];
}) {
  const weighted = [
    ...tokenise(input.topic),
    ...tokenise(input.topic),
    ...tokenise(input.question),
    ...input.evidence.slice(0, 8).flatMap((item) => tokenise(item.statement)),
  ];

  const counts = new Map<string, number>();
  weighted.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([token]) => token)
    .join(" ");
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function questionScore(values: Omit<StoryQuestionCandidate, "id" | "question" | "angle" | "overall" | "rationale">) {
  return clamp(
    values.evidenceCoverage * 0.3 +
      values.curiosity * 0.22 +
      values.consequence * 0.18 +
      values.visualPotential * 0.17 +
      values.uncertainty * 0.13
  );
}

function hasGeo(evidence: EvidenceItem[], datasets: DatasetAnalysis[]) {
  return (
    evidence.some((item) => item.latitude !== undefined && item.longitude !== undefined) ||
    datasets.some((dataset) => Boolean(dataset.recommendedMap))
  );
}

function hasTime(evidence: EvidenceItem[], datasets: DatasetAnalysis[]) {
  return evidence.some((item) => item.year !== undefined) || datasets.some((dataset) => dataset.dateColumns.length > 0);
}

function hasData(evidence: EvidenceItem[], datasets: DatasetAnalysis[]) {
  return (
    evidence.some((item) => item.value !== undefined || item.sourceType === "dataset") ||
    datasets.some((dataset) => Boolean(dataset.recommendedChart))
  );
}

export function discoverQuestions(input: {
  topic: string;
  evidence: EvidenceItem[];
  datasets: DatasetAnalysis[];
}): StoryQuestionCandidate[] {
  const topic = cleanText(input.topic) || "this issue";
  const observed = input.evidence.filter((item) => item.kind === "observed").length;
  const limitations = input.evidence.filter((item) => item.kind === "limitation").length;
  const inferences = input.evidence.filter((item) => item.kind === "inference").length;
  const sourceTypes = new Set(input.evidence.map((item) => item.sourceType).filter(Boolean));
  const geo = hasGeo(input.evidence, input.datasets);
  const time = hasTime(input.evidence, input.datasets);
  const data = hasData(input.evidence, input.datasets);

  const evidenceBase = clamp(42 + observed * 7 + input.datasets.length * 9 + sourceTypes.size * 5);
  const uncertainty = clamp(58 + limitations * 12 + inferences * 5);
  const visual = clamp(52 + (geo ? 24 : 0) + (data ? 18 : 0) + (time ? 8 : 0));

  const candidates: Omit<StoryQuestionCandidate, "id" | "overall">[] = [
    {
      question: `What is actually driving ${topic}, and which explanation survives the evidence?`,
      angle: "causal",
      evidenceCoverage: evidenceBase,
      curiosity: 92,
      consequence: 88,
      visualPotential: visual,
      uncertainty,
      rationale: "A causal question forces the story to compare explanations instead of merely describing the problem.",
    },
    {
      question: `Is the most common explanation for ${topic} actually supported by the evidence?`,
      angle: "myth_test",
      evidenceCoverage: clamp(evidenceBase - 4 + inferences * 4),
      curiosity: 95,
      consequence: 84,
      visualPotential: clamp(visual - 2),
      uncertainty: clamp(uncertainty + 6),
      rationale: "This creates a testable tension between a familiar explanation and the evidence currently available.",
    },
    {
      question: `How do the different forces behind ${topic} interact to produce the outcome we see?`,
      angle: "systems",
      evidenceCoverage: clamp(evidenceBase + sourceTypes.size * 3),
      curiosity: 84,
      consequence: 92,
      visualPotential: clamp(visual + 6),
      uncertainty,
      rationale: "A systems question is strongest when several evidence types point to interacting drivers rather than one cause.",
    },
    {
      question: geo
        ? `Why does ${topic} look different across places, and which local conditions explain the pattern?`
        : `What changes when we compare different cases of ${topic}?`,
      angle: "comparison",
      evidenceCoverage: clamp(evidenceBase + (geo ? 8 : -8)),
      curiosity: 88,
      consequence: 82,
      visualPotential: clamp(visual + (geo ? 10 : 0)),
      uncertainty,
      rationale: geo
        ? "Mapped evidence can reveal differences that disappear in a single average or national headline."
        : "Comparison can expose which parts of the explanation are general and which depend on context.",
    },
    {
      question: time
        ? `What changed in ${topic} over time, and what best explains the shift?`
        : `What would we need to observe before concluding that ${topic} is truly changing?`,
      angle: "change",
      evidenceCoverage: clamp(evidenceBase + (time ? 8 : -10)),
      curiosity: 86,
      consequence: 86,
      visualPotential: clamp(visual + (time ? 9 : 0)),
      uncertainty,
      rationale: time
        ? "A time-based question turns trend data into an explanation rather than a static snapshot."
        : "This keeps the story honest when the current material cannot yet establish a trend.",
    },
    {
      question: `What does the current evidence still fail to explain about ${topic}?`,
      angle: "unresolved",
      evidenceCoverage: clamp(evidenceBase - 6 + limitations * 8),
      curiosity: 78,
      consequence: 80,
      visualPotential: clamp(visual - 5),
      uncertainty: clamp(uncertainty + 12),
      rationale: "An unresolved question makes evidence gaps visible and can identify the next source, dataset or field observation the story needs.",
    },
  ];

  return candidates
    .map((candidate, index) => ({
      ...candidate,
      id: `question-${index + 1}`,
      overall: questionScore(candidate),
    }))
    .sort((a, b) => b.overall - a.overall);
}

export function scoutSourceToEvidence(source: EvidenceScoutSource): EvidenceItem {
  const identity = source.doi ? `https://doi.org/${source.doi}` : source.url;
  const note = source.summary
    ? `Candidate source for review: ${source.title}. ${source.summary}`
    : `Candidate source for review: ${source.title}. Review the source before treating substantive findings as observed evidence.`;

  return {
    id: crypto.randomUUID(),
    kind: "observed",
    statement: note,
    source: identity,
    sourceLabel: `${source.provider === "world_bank" ? "World Bank" : source.provider === "crossref" ? "Crossref" : "Existing source"} · ${source.title}`,
    sourceType: source.sourceType,
    year: source.year,
  };
}
