import type { EvidenceItem } from "./types";

export type ResearchIntent = {
  topic: string;
  question: string;
  geography: string[];
  phenomenon: string[];
  mechanisms: string[];
  contextTerms: string[];
};

const STOP = new Set([
  "about","after","again","against","also","and","are","because","been","before",
  "being","between","both","but","can","could","did","does","doing","during","each",
  "even","for","from","further","had","has","have","having","how","into","its","more",
  "most","not","our","out","over","same","should","some","such","than","that","the",
  "their","then","there","these","they","this","those","through","under","very","was",
  "were","what","when","where","which","while","who","why","will","with","would",
]);

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(token: string) {
  let value = token.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!value) return "";

  if (/^flood(?:s|ed|ing)?$/.test(value)) return "flood";
  if (/^drain(?:s|ed|ing|age)?$/.test(value)) return "drainage";
  if (/^rain(?:s|ed|ing|fall)?$/.test(value)) return "rainfall";
  if (/^river(?:s)?$/.test(value)) return "river";
  if (/^(?:city|cities)$/.test(value)) return "city";
  if (/^urban(?:isation|ization)?$/.test(value)) return "urban";
  if (/^encroach(?:ment|es|ed|ing)?$/.test(value)) return "encroachment";
  if (/^impervious(?:ness)?$/.test(value)) return "impervious";
  if (/^permeab(?:le|ility)$/.test(value)) return "permeable";
  if (/^stormwater$/.test(value)) return "stormwater";
  if (/^runoff$/.test(value)) return "runoff";
  if (/^waste(?:s)?$/.test(value)) return "waste";
  if (/^maintain|maintenance$/.test(value)) return "maintenance";
  if (/^infrastructure(?:s)?$/.test(value)) return "infrastructure";
  if (/^planning$/.test(value)) return "planning";
  if (/^growth$/.test(value)) return "growth";
  if (/^watershed(?:s)?$/.test(value)) return "watershed";
  if (/^riparian$/.test(value)) return "riparian";

  if (value.length > 6 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 5 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("s")) value = value.slice(0, -1);

  return value;
}

function words(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(normalize)
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function capitalizedPlaces(topic: string, question: string) {
  const combined = `${topic} ${question}`;
  const matches =
    combined.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) || [];

  const banned = new Set([
    "Why","What","How","When","Where","Who","Which","Create","Build","World",
    "Explained","Evidence","Studio","Research","Report","Impact",
  ]);

  return unique(
    matches
      .flatMap((phrase) => phrase.split(/\s+/))
      .filter((token) => !banned.has(token))
      .map(normalize)
      .filter(Boolean)
  );
}

const PHENOMENA = new Set([
  "flood","drought","heat","pollution","waste","erosion","deforestation",
  "biodiversity","fire","wildfire","disease","traffic","housing","water",
]);

const MECHANISMS = new Set([
  "drainage","stormwater","runoff","river","watershed","riparian","encroachment",
  "impervious","permeable","culvert","sewer","channel","blockage","blocked",
  "urban","growth","planning","infrastructure","maintenance","waste","rainfall",
  "land","settlement","surface",
]);

const CONTEXT = new Set([
  "risk","hazard","exposure","resilience","population","climate","governance",
  "policy","management","city","county","urban",
]);

export function buildResearchIntent(input: {
  topic: string;
  question: string;
  evidence: EvidenceItem[];
}): ResearchIntent {
  const base = unique([...words(input.topic), ...words(input.question)]);
  const evidenceWords = unique(
    input.evidence
      .slice(0, 24)
      .flatMap((item) => words(`${item.statement} ${item.sourceLabel || ""}`))
  );

  const geography = capitalizedPlaces(input.topic, input.question);

  const phenomenon = unique(
    [...base, ...evidenceWords].filter((token) => PHENOMENA.has(token))
  ).slice(0, 5);

  let mechanisms = unique(
    [...base, ...evidenceWords].filter((token) => MECHANISMS.has(token))
  ).slice(0, 10);

  // Flood stories benefit from a stable causal vocabulary even when the short
  // user question does not spell out every mechanism.
  if (phenomenon.includes("flood")) {
    mechanisms = unique([
      ...mechanisms,
      "drainage",
      "stormwater",
      "runoff",
      "rainfall",
      "river",
      "riparian",
      "encroachment",
      "impervious",
      "maintenance",
      "waste",
    ]).slice(0, 10);
  }

  const contextTerms = unique(
    [...base, ...evidenceWords].filter((token) => CONTEXT.has(token))
  ).slice(0, 8);

  return {
    topic: clean(input.topic),
    question: clean(input.question),
    geography,
    phenomenon,
    mechanisms,
    contextTerms,
  };
}

export function buildResearchQueries(intent: ResearchIntent) {
  const geography = intent.geography.join(" ");
  const phenomenon = intent.phenomenon.slice(0, 2).join(" ");

  const base = [geography, phenomenon].filter(Boolean).join(" ");

  const queries = [
    base,
    [base, "drainage", "stormwater"].filter(Boolean).join(" "),
    [base, "river", "riparian", "runoff"].filter(Boolean).join(" "),
    [base, "urban", "land use", "drainage"].filter(Boolean).join(" "),
  ];

  return unique(
    queries
      .map(clean)
      .filter((query) => query.length >= 3)
  ).slice(0, 4);
}
