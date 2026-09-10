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

const FLOOD_DIRECT =
  /\b(flood|flooding|stormwater|runoff|drain|drainage|riparian|floodplain|overflow|inundation)\b/i;

const FLOOD_SUPPORT =
  /\b(rainfall|heavy rain|river|watershed|channel|culvert|sewer|surface water)\b/i;

/*
 * A mechanism must contain an actual system driver.
 * Generic connectors such as "result in" or "due to" are NOT sufficient.
 */
const STRUCTURAL_MECHANISM =
  /\b(blocked? drain|blocked? drainage|drain blockage|drainage capacity|inadequate drainage|ageing drainage|aging drainage|poor drainage|stormwater capacity|runoff|impervious|impermeable|permeable surface|surface sealing|riparian encroachment|floodplain encroachment|land[- ]use change|urban growth|rapid urbanisation|rapid urbanization|waste accumulation|solid waste accumulation|garbage accumulation|channel constriction|constricted channel|reduced capacity|exceed(?:s|ed|ing)? capacity|overflow(?:s|ed|ing)?|culvert blockage|sewer blockage|maintenance gap|drain maintenance|river narrowing|loss of permeable surface)\b/i;

const IMPACT_OR_EXPOSURE =
  /\b(exposed|exposure|damage|damages|loss|losses|affected|facilities|buildings|transport network|insurance|people at risk|population at risk|economic loss|agricultural loss|agricultural income|crop yield|fatalit|displaced|displacement)\b/i;

const MODEL_OR_METHOD =
  /\b(model(?:led|ed|ling|ing)?|simulation|simulated|estimate|estimated|calculation|assum(?:e|ed|ption)|validation|resolution|dataset|data limitation|risk profile|return period)\b/i;

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

  const directFlood = FLOOD_DIRECT.test(claimOnly);
  const floodSupport = FLOOD_SUPPORT.test(claimOnly);
  const mechanism = STRUCTURAL_MECHANISM.test(claimOnly);
  const impact = IMPACT_OR_EXPOSURE.test(claimOnly);
  const modelling = MODEL_OR_METHOD.test(claimOnly);
  const unrelatedLocal = UNRELATED_LOCAL.test(claimOnly);
  const offHazard = NON_STORY_HAZARD.test(claimOnly);
  const limitation = input.item.kind === "limitation";

  // Different hazard beats incidental flood/rain/river wording.
  if (offHazard && !/\bflood|flooding|drainage|stormwater|runoff\b/i.test(claimOnly)) {
    return {
      role: "exclude",
      score: 2,
      reason:
        "The claim concerns a different hazard and does not directly explain the current story question.",
    };
  }

  // Nairobi/local mention alone cannot rescue an unrelated subject.
  if (unrelatedLocal && !directFlood) {
    return {
      role: "exclude",
      score: 4,
      reason:
        "The claim mentions the story geography but concerns a different subject, so location alone is not enough to make it relevant.",
    };
  }

  // Limitations are never mechanisms. Keep only flood-relevant limitations as context.
  if (limitation) {
    if (directFlood && !offHazard) {
      return {
        role: "context",
        score: 52,
        reason:
          "This is a limitation on flood evidence or modelling. It informs trust boundaries but does not explain the flood mechanism.",
      };
    }
    return {
      role: "exclude",
      score: 8,
      reason:
        "This limitation does not directly constrain evidence for the current flood story.",
    };
  }

  // Explicit local + actual structural mechanism = strongest local causal evidence.
  if (directPlaceHits > 0 && mechanism && (directFlood || floodSupport)) {
    return {
      role: "core_local",
      score: Math.min(100, 90 + directTopicHits * 2 + directPlaceHits * 4),
      reason:
        "The claim is explicitly local and describes a concrete system mechanism behind flooding.",
    };
  }

  // Local flood observation/impact is useful, but not automatically a mechanism.
  if (directPlaceHits > 0 && directFlood) {
    return {
      role: "core_local",
      score: Math.min(92, 76 + directTopicHits * 3 + directPlaceHits * 4),
      reason:
        "The claim is explicitly local and directly concerns flooding, but it is evidence of condition, exposure or outcome rather than a causal mechanism.",
    };
  }

  // Source-derived local context can support a mechanism if the claim itself names the driver.
  if (placeHits > 0 && mechanism && (directFlood || floodSupport)) {
    return {
      role: "core_local",
      score: Math.min(92, 78 + topicHits * 2 + placeHits * 4),
      reason:
        "The source is local and the claim names a concrete flood-system driver.",
    };
  }

  // Exposure/damage/loss statements must be context before generic causal wording is considered.
  if ((directFlood || floodSupport) && impact) {
    return {
      role: "context",
      score: Math.min(70, 52 + Math.max(1, topicHits) * 4),
      reason:
        "The claim describes flood exposure or consequences. It is useful context but not a causal mechanism.",
    };
  }

  // Modelling/method statements are context, not mechanisms.
  if ((directFlood || floodSupport) && modelling) {
    return {
      role: "context",
      score: Math.min(64, 48 + Math.max(1, topicHits) * 4),
      reason:
        "The claim describes modelling, estimation or method context rather than a real-world causal mechanism.",
    };
  }

  // Only concrete driver language can create MECHANISM.
  if (mechanism && (directFlood || floodSupport)) {
    return {
      role: "mechanism",
      score: Math.min(86, 68 + Math.max(1, topicHits) * 4),
      reason:
        "The claim names a concrete flood-system driver that can explain the story even without explicit local geography.",
    };
  }

  // Flood/rain/river statements without a concrete driver are contextual.
  if (directFlood || floodSupport) {
    return {
      role: "context",
      score: Math.min(62, 46 + Math.max(1, topicHits) * 4),
      reason:
        "The claim is related to flooding or hydrology but does not identify a concrete causal driver.",
    };
  }

  if (topicHits >= 2 && input.sourceIds.length > 0) {
    return {
      role: "comparison",
      score: 40,
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
