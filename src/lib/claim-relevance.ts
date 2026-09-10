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
  if (/^(?:city|cities)$/.test(value)) return "city";
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

const FLOOD_PHENOMENON =
  /\b(flood|flooding|stormwater|runoff|drain|drainage|river|riparian|rainfall|heavy rain)\b/i;

const CAUSAL_PROCESS =
  /\b(caus(?:e|es|ed|ing)|lead(?:s|ing)? to|result(?:s|ed|ing)? in|driv(?:e|es|en|ing)|because|due to|contribut(?:e|es|ed|ing)|increase(?:s|d)? runoff|reduce(?:s|d)? capacity|block(?:s|ed|ing)?|overflow|exceed(?:s|ed|ing)? capacity|constrict(?:s|ed|ing)?|encroach(?:ment|es|ed|ing)?|impervious|impermeable|permeable|surface sealing|land[- ]use change|urban growth|rapid urbanisation|rapid urbanization|maintenance gap|drainage capacity|waste accumulation)\b/i;

const IMPACT_OR_EXPOSURE =
  /\b(exposed|exposure|damage|loss|losses|affected|facilities|buildings|transport network|insurance|people at risk|population at risk|economic loss|agricultural loss|agricultural income|crop yield)\b/i;

const UNRELATED_LOCAL =
  /\b(lack of water|water availability|water scarcity|reproductive|pig|pigs|livestock|insurance losses|building safety|industrialization|industrialisation|manuscript|plant taxonomy|uvaria)\b/i;

const NON_STORY_HAZARD =
  /\b(earthquake|seismic|volcano|volcanic|eruption|ashfall|landslide|drought|cyclone|tsunami)\b/i;

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

  const claimOnly = clean(input.item.statement);
  const text = clean(
    `${claimOnly} ${input.item.sourceLabel || ""} ${sourceContext}`
  );

  const tokens = new Set(words(text));
  const claimTokens = new Set(words(claimOnly));

  const topicHits = overlapCount(topic, tokens);
  const directTopicHits = overlapCount(topic, claimTokens);
  const placeHits = overlapCount(places, tokens);
  const directPlaceHits = overlapCount(places, claimTokens);

  const phenomenon = FLOOD_PHENOMENON.test(claimOnly);
  const causal = CAUSAL_PROCESS.test(claimOnly);
  const impact = IMPACT_OR_EXPOSURE.test(claimOnly);
  const unrelatedLocal = UNRELATED_LOCAL.test(claimOnly);
  const offHazard = NON_STORY_HAZARD.test(claimOnly);

  if (offHazard && !phenomenon) {
    return {
      role: "exclude",
      score: 2,
      reason:
        "The claim concerns a different hazard and does not directly explain the current story question.",
    };
  }

  if (unrelatedLocal && !phenomenon) {
    return {
      role: "exclude",
      score: 4,
      reason:
        "The claim mentions the story geography but concerns a different subject, so location alone is not enough to make it relevant.",
    };
  }

  if (directPlaceHits > 0 && phenomenon) {
    if (causal) {
      return {
        role: "core_local",
        score: Math.min(100, 88 + directTopicHits * 3 + directPlaceHits * 4),
        reason:
          "The claim is local to the story geography and directly describes the flood phenomenon or a causal process behind it.",
      };
    }

    return {
      role: "core_local",
      score: Math.min(94, 78 + directTopicHits * 3 + directPlaceHits * 4),
      reason:
        "The claim is explicitly local and directly concerns flooding, but it is primarily evidence of condition or outcome rather than mechanism.",
    };
  }

  if (placeHits > 0 && phenomenon) {
    if (causal) {
      return {
        role: "core_local",
        score: Math.min(94, 76 + topicHits * 3 + placeHits * 4),
        reason:
          "The source provides local context and the claim directly describes a flood-related process.",
      };
    }

    return {
      role: "context",
      score: Math.min(78, 60 + topicHits * 3 + placeHits * 3),
      reason:
        "The source is local and the claim concerns flooding, but it describes exposure, condition or impact rather than a causal mechanism.",
    };
  }

  if (phenomenon && causal) {
    return {
      role: "mechanism",
      score: Math.min(88, 68 + Math.max(1, topicHits) * 4),
      reason:
        "The claim describes a causal flood mechanism that can explain the story even without explicit local geography.",
    };
  }

  if (phenomenon && impact) {
    return {
      role: "context",
      score: Math.min(72, 54 + Math.max(1, topicHits) * 4),
      reason:
        "The claim describes flood exposure or consequences, so it is useful context but not a mechanism.",
    };
  }

  if (phenomenon && topicHits >= 1) {
    return {
      role: "context",
      score: Math.min(68, 50 + topicHits * 4),
      reason:
        "The claim is flood-related but does not clearly establish a local causal process.",
    };
  }

  if (topicHits >= 2 && input.sourceIds.length > 0) {
    return {
      role: "comparison",
      score: 42,
      reason:
        "The claim has thematic overlap but is not strong enough to count as local proof or mechanism.",
    };
  }

  return {
    role: "exclude",
    score: 8,
    reason:
      "The claim does not sufficiently match the current story question, geography or causal mechanism.",
  };
}

export function roleWeight(role: ClaimRole) {
  if (role === "core_local") return 1;
  if (role === "mechanism") return 0.8;
  if (role === "context") return 0.35;
  if (role === "comparison") return 0.15;
  return 0;
}
