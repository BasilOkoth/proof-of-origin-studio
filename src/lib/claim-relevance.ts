import type { EvidenceItem } from "./types";
import type { EvidenceLibraryRecord } from "./evidence-library";

export type ClaimRole =
  | "core_local"
  | "mechanism"
  | "context"
  | "comparison"
  | "exclude";

export type ClaimRelevance = {
  role: ClaimRole;
  score: number;
  reason: string;
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

function normalizeToken(token: string) {
  let value = token
    .toLowerCase()
    .replace(/^-+|-+$/g, "")
    .replace(/[^a-z0-9-]/g, "");

  if (!value) return "";
  if (/^flood(?:s|ed|ing)?$/.test(value)) return "flood";
  if (/^drain(?:s|ed|ing|age)?$/.test(value)) return "drain";
  if (/^rain(?:s|ed|ing|fall)?$/.test(value)) return "rain";
  if (/^river(?:s)?$/.test(value)) return "river";
  if (/^city|cities$/.test(value)) return "city";
  if (/^risk(?:s)?$/.test(value)) return "risk";
  if (/^hazard(?:s)?$/.test(value)) return "hazard";
  if (/^infrastructure(?:s)?$/.test(value)) return "infrastructure";
  if (/^population(?:s)?$/.test(value)) return "population";
  if (/^waste(?:s)?$/.test(value)) return "waste";
  if (/^growth$/.test(value)) return "growth";
  if (/^urban(?:isation|ization)?$/.test(value)) return "urban";
  if (/^resilien(?:ce|t)$/.test(value)) return "resilience";
  if (/^plan(?:ning|ned|s)?$/.test(value)) return "planning";
  if (/^stormwater$/.test(value)) return "stormwater";
  if (/^watershed(?:s)?$/.test(value)) return "watershed";
  if (/^climat(?:e|ic)$/.test(value)) return "climate";

  if (value.length > 6 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 5 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("es")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("s")) value = value.slice(0, -1);

  return value;
}

function words(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function placeAnchors(topic: string, question: string) {
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
      .map(normalizeToken)
      .filter(Boolean)
  );
}

function topicTerms(topic: string, question: string) {
  return unique([...words(topic), ...words(question)]).slice(0, 24);
}

function overlapCount(left: string[], right: Set<string>) {
  return left.filter((token) => right.has(token)).length;
}

const FLOOD_MECHANISM =
  /\b(flood|flooding|drain|drainage|stormwater|rain|rainfall|runoff|river|watershed|riparian|impermeable|permeable|surface|sewer|channel|culvert|waste|garbage|solid waste|blocked|blockage|land use|urban growth|settlement|encroachment|maintenance|infrastructure)\b/i;

const NON_STORY_HAZARD =
  /\b(earthquake|seismic|volcano|volcanic|eruption|ashfall|landslide|drought|crop yield|agricultural income|agricultural loss|wind speed|cyclone|tsunami)\b/i;

export function classifyClaimForStory(input: {
  topic: string;
  question: string;
  item: EvidenceItem;
  library: EvidenceLibraryRecord[];
  sourceIds: string[];
}): ClaimRelevance {
  const topic = topicTerms(input.topic, input.question);
  const places = placeAnchors(input.topic, input.question);

  const linkedSources = input.library.filter((source) =>
    input.sourceIds.includes(source.id)
  );

  const sourceContext = linkedSources
    .map((source) => `${source.title} ${source.summary || ""}`)
    .join(" ");

  const text = clean(
    `${input.item.statement} ${input.item.sourceLabel || ""} ${sourceContext}`
  );

  const claimOnly = clean(input.item.statement);
  const tokens = new Set(words(text));
  const claimTokens = new Set(words(claimOnly));

  const topicHits = overlapCount(topic, tokens);
  const directTopicHits = overlapCount(topic, claimTokens);
  const placeHits = overlapCount(places, tokens);
  const directPlaceHits = overlapCount(places, claimTokens);

  const mechanism = FLOOD_MECHANISM.test(text);
  const offHazard = NON_STORY_HAZARD.test(claimOnly);

  if (offHazard && !/\bflood|flooding\b/i.test(claimOnly)) {
    return {
      role: "exclude",
      score: 2,
      reason:
        "The claim concerns a different hazard or sector and does not directly explain the current story question.",
    };
  }

  if (directPlaceHits > 0 && (directTopicHits > 0 || mechanism)) {
    return {
      role: "core_local",
      score: Math.min(100, 82 + directTopicHits * 4 + directPlaceHits * 5),
      reason:
        "The claim directly matches the story geography and the phenomenon being explained.",
    };
  }

  if (placeHits > 0 && (topicHits >= 1 || mechanism)) {
    return {
      role: "core_local",
      score: Math.min(96, 74 + topicHits * 4 + placeHits * 5),
      reason:
        "The claim inherits local story context from its source and matches the phenomenon being explained.",
    };
  }

  if (mechanism && topicHits >= 1) {
    return {
      role: "mechanism",
      score: Math.min(90, 66 + topicHits * 5),
      reason:
        "The claim explains a mechanism relevant to the story even when it is not explicitly local.",
    };
  }

  if (topicHits >= 2) {
    return {
      role: "context",
      score: Math.min(78, 52 + topicHits * 6),
      reason:
        "The claim provides broader context for the story but should not be treated as direct local proof.",
    };
  }

  if (topicHits >= 1 && input.sourceIds.length > 0) {
    return {
      role: "comparison",
      score: 46,
      reason:
        "The claim has limited thematic overlap and may be useful only as an explicitly labeled comparison.",
    };
  }

  return {
    role: "exclude",
    score: 8,
    reason:
      "The claim does not sufficiently match the current story question or geography.",
  };
}

export function roleWeight(role: ClaimRole) {
  if (role === "core_local") return 1;
  if (role === "mechanism") return 0.82;
  if (role === "context") return 0.48;
  if (role === "comparison") return 0.24;
  return 0;
}
