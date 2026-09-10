import type {
  DatasetAnalysis,
  EvidenceItem,
} from "./types";
import type {
  EvidenceScoutSource,
  StoryQuestionCandidate,
} from "./evidence-scout";
import {
  buildResearchIntent,
  buildResearchQueries,
} from "./research-intent";

const STOP = new Set([
  "about","after","again","against","also","and","are","because","been","before",
  "being","between","both","but","can","could","did","does","doing","during","each",
  "even","for","from","further","had","has","have","having","how","into","its","more",
  "most","not","our","out","over","same","should","some","such","than","that","the",
  "their","then","there","these","they","this","those","through","under","very","was",
  "were","what","when","where","which","while","who","why","will","with","would",
]);

const FRONT_MATTER =
  /\b(dedication|dedicated\s+to|acknowledg(?:e)?ments?|declaration|approval|copyright|table\s+of\s+contents|list\s+of\s+(?:tables|figures|abbreviations|acronyms)|foreword|preface|certificate|certification|plagiarism|supervisor|submitted\s+in\s+(?:partial|fulfilment|fulfillment)|degree\s+of|references|bibliography|appendix|appendices|chapter\s+\d+)\b/i;

const PERSONAL_FRONT_MATTER =
  /\b(helped\s+shape\s+my\s+life|my\s+family|my\s+parents|my\s+mother|my\s+father|gratitude|grateful|thank\s+god|almighty|friends?\s+and\s+family|this\s+work\s+is\s+dedicated)\b/i;

const CITATION_NOISE =
  /\b(issn|isbn|creative\s+commons|all\s+rights\s+reserved|copyright|retrieved\s+from|available\s+at|volume\s+\d+|issue\s+\d+)\b/i;

const HARD_OFF_TOPIC =
  /\b(manuscript|palimpsest|uvaria|annonaceae|plant taxonomy|pig|pigs|reproductive effects|industrialization|industrialisation|natural resource extraction|unsafe buildings|building safety)\b/i;

const FLOOD_MECHANISM =
  /\b(drainage|stormwater|runoff|riparian|floodplain|encroachment|impervious|permeable|culvert|sewer|channel|blocked drain|blockage|urban growth|land[- ]use|settlement|maintenance|waste accumulation|solid waste|river|watershed|rainfall)\b/i;

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
  if (/^drain(?:s|ed|ing|age)?$/.test(value)) return "drainage";
  if (/^rain(?:s|ed|ing|fall)?$/.test(value)) return "rainfall";
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
    .filter((x) => x.length >= 3 && !STOP.has(x));
}

function tokenSet(value: string) {
  return new Set(words(value));
}

function overlap(terms: string[], tokens: Set<string>) {
  return terms.filter((term) => tokens.has(normalizeToken(term))).length;
}

export function looksLikeFrontMatter(value: string) {
  const text = clean(value);
  if (!text) return true;

  if (/^abstract\s*[:.-]?$/i.test(text)) return true;

  return (
    FRONT_MATTER.test(text) ||
    PERSONAL_FRONT_MATTER.test(text) ||
    CITATION_NOISE.test(text) ||
    /^chapter\s+\w+/i.test(text) ||
    /^page\s+\d+/i.test(text)
  );
}

export function filterEvidenceForStory(input: {
  topic: string;
  question: string;
  evidence: EvidenceItem[];
}) {
  const intent = buildResearchIntent(input);

  return input.evidence.filter((item) => {
    const content = clean(
      `${item.statement} ${item.sourceLabel || ""} ${item.category || ""}`
    );

    if (looksLikeFrontMatter(content)) return false;

    const tokens = tokenSet(content);
    const placeHits = overlap(intent.geography, tokens);
    const phenomenonHits = overlap(intent.phenomenon, tokens);
    const mechanismHits = overlap(intent.mechanisms, tokens);

    if (intent.geography.length && placeHits > 0) {
      return phenomenonHits > 0 || mechanismHits > 0 || item.kind === "limitation";
    }

    return phenomenonHits > 0 && mechanismHits > 0;
  });
}

export function buildLockedSearchQuery(input: {
  topic: string;
  question: string;
  evidence: EvidenceItem[];
}) {
  const intent = buildResearchIntent(input);
  const queries = buildResearchQueries(intent);

  // Existing route accepts a single query. Keep the highest-value query compact:
  // geography + phenomenon + first causal mechanism bundle.
  return queries[0] || [
    ...intent.geography,
    ...intent.phenomenon,
    ...intent.mechanisms.slice(0, 4),
  ].join(" ");
}

function sourceAlignment(input: {
  topic: string;
  question: string;
  source: EvidenceScoutSource;
}) {
  const content = clean(
    `${input.source.title} ${input.source.summary || ""} ${input.source.publisher || ""}`
  );

  const intent = buildResearchIntent({
    topic: input.topic,
    question: input.question,
    evidence: [],
  });

  const tokens = tokenSet(content);
  const placeHits = overlap(intent.geography, tokens);
  const phenomenonHits = overlap(intent.phenomenon, tokens);
  const mechanismHits = overlap(intent.mechanisms, tokens);
  const contextHits = overlap(intent.contextTerms, tokens);

  const local = intent.geography.length === 0 || placeHits > 0;
  const phenomenon = phenomenonHits > 0 || /\bflood(?:s|ed|ing)?\b/i.test(content);
  const mechanism = mechanismHits > 0 || FLOOD_MECHANISM.test(content);
  const hardOffTopic = HARD_OFF_TOPIC.test(content);

  let score = 0;
  if (local) score += 42;
  if (phenomenon) score += 24;
  score += Math.min(24, mechanismHits * 8);
  score += Math.min(10, contextHits * 3);

  if (hardOffTopic) score -= 70;

  // Explicitly penalize sources about other regions when a local geography exists.
  if (
    intent.geography.length &&
    !local &&
    /\b(west africa|ghana|benin|sweden|swedish|china|chinese|thailand|thai|japan|wuhan|kumamoto|arnhem)\b/i.test(content)
  ) {
    score -= 30;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    local,
    phenomenon,
    mechanism,
    mechanismHits,
    hardOffTopic,
  };
}

export function filterAndRescoreSources(input: {
  topic: string;
  question: string;
  sources: EvidenceScoutSource[];
}) {
  const intent = buildResearchIntent({
    topic: input.topic,
    question: input.question,
    evidence: [],
  });

  const scored = input.sources
    .map((source) => {
      const alignment = sourceAlignment({
        topic: input.topic,
        question: input.question,
        source,
      });

      const adjustedRelevance = Math.round(
        source.relevance * 0.2 + alignment.score * 0.8
      );

      const role =
        alignment.local && alignment.phenomenon && alignment.mechanism
          ? "core_local"
          : alignment.phenomenon && alignment.mechanism
            ? "mechanism"
            : alignment.local && alignment.phenomenon
              ? "local_context"
              : "comparison";

      return {
        ...source,
        relevance: adjustedRelevance,
        reason:
          role === "core_local"
            ? `${source.reason} Priority local mechanism source for the current story.`
            : role === "mechanism"
              ? `${source.reason} Non-local mechanism source; use only for clearly labelled explanatory context.`
              : role === "local_context"
                ? `${source.reason} Local source, but mechanism relevance is limited.`
                : `${source.reason} Comparison/background only; not local proof.`,
        __guard: alignment,
        __role: role,
      };
    })
    .filter((source) => {
      if (source.__guard.hardOffTopic) return false;

      // Geography-locked stories require the phenomenon everywhere.
      if (!source.__guard.phenomenon) return false;

      if (!intent.geography.length) {
        return source.relevance >= 55 && source.__guard.mechanism;
      }

      // Local sources can survive with either mechanism or strong local context.
      if (source.__guard.local) {
        return source.relevance >= 55;
      }

      // Non-local sources need genuine mechanism value and a much higher threshold.
      return (
        source.__guard.mechanism &&
        source.__guard.mechanismHits >= 2 &&
        source.relevance >= 68
      );
    })
    .sort((a, b) => {
      const roleBoost = (value: string) =>
        value === "core_local"
          ? 35
          : value === "local_context"
            ? 20
            : value === "mechanism"
              ? 8
              : 0;

      const score = (source: typeof a) =>
        roleBoost(source.__role) +
        source.relevance * 0.55 +
        source.evidenceStrength * 0.25 +
        source.visualPotential * 0.2 +
        (source.access === "open_download" ? 8 : 0);

      return score(b) - score(a);
    });

  // Keep comparison/global mechanism material intentionally scarce.
  let nonLocalKept = 0;

  return scored
    .filter((source) => {
      if (source.__guard.local) return true;
      if (nonLocalKept >= 2) return false;
      nonLocalKept += 1;
      return true;
    })
    .map(({ __guard, __role, ...source }) => source);
}

function questionAlignment(
  topic: string,
  originalQuestion: string,
  candidate: string
) {
  const intent = buildResearchIntent({
    topic,
    question: originalQuestion,
    evidence: [],
  });

  const text = tokenSet(candidate);
  const phenomenonHits = overlap(intent.phenomenon, text);
  const placeHits = overlap(intent.geography, text);
  const mechanismHits = overlap(intent.mechanisms, text);

  let score = 0;
  score += Math.min(45, phenomenonHits * 25);
  score += Math.min(35, placeHits * 35);
  score += Math.min(20, mechanismHits * 5);

  if (!intent.geography.length) score += 15;

  return Math.min(100, score);
}

export function guardStoryQuestions(input: {
  topic: string;
  question: string;
  questions: StoryQuestionCandidate[];
  evidence: EvidenceItem[];
  datasets: DatasetAnalysis[];
}) {
  const original = clean(input.question);

  const observedCount = input.evidence.filter(
    (item) => item.kind === "observed"
  ).length;

  const baseEvidence = Math.min(
    100,
    45 + observedCount * 5
  );

  const userQuestion: StoryQuestionCandidate | null = original
    ? {
        id: "question-user-locked",
        question: original,
        angle: "systems",
        evidenceCoverage: baseEvidence,
        curiosity: 88,
        consequence: 92,
        visualPotential: 92,
        uncertainty: observedCount > 0 ? 62 : 72,
        overall: 94,
        rationale:
          "Original user question preserved as the story anchor. Discovery may refine the angle, but it cannot silently replace the subject or geography.",
      }
    : null;

  const filtered = input.questions
    .map((candidate) => {
      const alignment = questionAlignment(
        input.topic,
        input.question,
        candidate.question
      );

      return {
        ...candidate,
        overall: Math.round(
          candidate.overall * 0.5 + alignment * 0.5
        ),
        rationale: `${candidate.rationale} Story-question alignment: ${alignment}/100.`,
        __alignment: alignment,
      };
    })
    .filter((candidate) => candidate.__alignment >= 50)
    .sort((a, b) => b.overall - a.overall)
    .map(({ __alignment, ...candidate }) => candidate)
    .slice(0, 5);

  const output = userQuestion ? [userQuestion, ...filtered] : filtered;
  const seen = new Set<string>();

  return output
    .filter((candidate) => {
      const key = candidate.question
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}
