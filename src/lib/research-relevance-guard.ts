import type {
  DatasetAnalysis,
  EvidenceItem,
} from "./types";
import type {
  EvidenceScoutSource,
  StoryQuestionCandidate,
} from "./evidence-scout";

const STOP = new Set([
  "about","after","again","against","also","and","are","because","been","before",
  "being","between","both","but","can","could","did","does","doing","during","each",
  "even","for","from","further","had","has","have","having","how","into","its","more",
  "most","not","our","out","over","same","should","some","such","than","that","the",
  "their","then","there","these","they","this","those","through","under","very","was",
  "were","what","when","where","which","while","who","why","will","with","would",
]);

const FRONT_MATTER =
  /\b(dedication|dedicated\s+to|acknowledg(?:e)?ments?|declaration|approval|copyright|table\s+of\s+contents|list\s+of\s+(?:tables|figures|abbreviations|acronyms)|abstract|foreword|preface|certificate|certification|plagiarism|supervisor|submitted\s+in\s+(?:partial|fulfilment|fulfillment)|degree\s+of|university\s+of|references|bibliography|appendix|appendices|chapter\s+\d+)\b/i;

const PERSONAL_FRONT_MATTER =
  /\b(helped\s+shape\s+my\s+life|my\s+family|my\s+parents|my\s+mother|my\s+father|gratitude|grateful|thank\s+god|almighty|friends?\s+and\s+family|this\s+work\s+is\s+dedicated)\b/i;

const CITATION_NOISE =
  /\b(doi|issn|isbn|creative\s+commons|all\s+rights\s+reserved|copyright|retrieved\s+from|available\s+at|volume\s+\d+|issue\s+\d+)\b/i;

const GENERIC_BACKGROUND = new Set([
  "urban","flood","flooding","drainage","rainfall","climate","infrastructure",
  "stormwater","watershed","river","rivers","risk","hazard","resilience",
  "planning","land","use","waste","population","growth","city","cities",
]);

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function words(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((x) => x.replace(/^-+|-+$/g, ""))
    .filter((x) => x.length >= 3 && !STOP.has(x));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function explicitPlaceAnchors(topic: string, question: string) {
  const combined = `${topic} ${question}`;

  const candidates =
    combined.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) || [];

  const banned = new Set([
    "Why","What","How","When","Where","Who","Which","Create","Build","World",
    "Explained","Evidence","Studio","Research","Report","Impact",
  ]);

  return unique(
    candidates
      .flatMap((phrase) => phrase.split(/\s+/))
      .filter((token) => !banned.has(token))
      .map((token) => token.toLowerCase())
  );
}

function anchorTerms(topic: string, question: string) {
  const all = unique([...words(topic), ...words(question)]);
  const domain = all.filter(
    (token) => GENERIC_BACKGROUND.has(token) || token.length >= 5
  );
  return domain.slice(0, 18);
}

export function looksLikeFrontMatter(value: string) {
  const text = clean(value);
  if (!text) return true;

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
  const anchors = anchorTerms(input.topic, input.question);
  const places = explicitPlaceAnchors(input.topic, input.question);

  return input.evidence.filter((item) => {
    const content = clean(
      `${item.statement} ${item.sourceLabel || ""} ${item.category || ""}`
    );

    if (looksLikeFrontMatter(content)) return false;

    const tokens = new Set(words(content));
    const placeMatch =
      !places.length || places.some((place) => tokens.has(place));

    const domainMatches = anchors.filter((token) => tokens.has(token)).length;

    if (!placeMatch && places.length) {
      return domainMatches >= 3;
    }

    return domainMatches >= 1 || item.kind === "limitation";
  });
}

export function buildLockedSearchQuery(input: {
  topic: string;
  question: string;
  evidence: EvidenceItem[];
}) {
  const places = explicitPlaceAnchors(input.topic, input.question);
  const anchors = anchorTerms(input.topic, input.question);

  const evidenceTerms = input.evidence
    .filter((item) => !looksLikeFrontMatter(item.statement))
    .slice(0, 8)
    .flatMap((item) => words(item.statement))
    .filter((token) => GENERIC_BACKGROUND.has(token));

  return unique([
    ...places,
    ...anchors,
    ...evidenceTerms,
  ])
    .slice(0, 12)
    .join(" ");
}

function sourceAlignment(input: {
  topic: string;
  question: string;
  source: EvidenceScoutSource;
}) {
  const content = clean(
    `${input.source.title} ${input.source.summary || ""} ${input.source.publisher || ""}`
  );

  const anchors = anchorTerms(input.topic, input.question);
  const places = explicitPlaceAnchors(input.topic, input.question);
  const textTokens = new Set(words(content));

  const anchorHits = anchors.filter((token) => textTokens.has(token)).length;
  const placeHits = places.filter((token) => textTokens.has(token)).length;

  const floodLike =
    /\b(flood|flooding|stormwater|drainage|rainfall|watershed|river|urban\s+flood)\b/i.test(
      content
    );

  let score = 0;

  score += Math.min(50, anchorHits * 12);
  score += Math.min(30, placeHits * 30);
  if (floodLike) score += 20;

  return {
    score: Math.min(100, score),
    placeMatch: places.length === 0 || placeHits > 0,
    anchorHits,
    floodLike,
  };
}

export function filterAndRescoreSources(input: {
  topic: string;
  question: string;
  sources: EvidenceScoutSource[];
}) {
  const places = explicitPlaceAnchors(input.topic, input.question);

  return input.sources
    .map((source) => {
      const alignment = sourceAlignment({
        topic: input.topic,
        question: input.question,
        source,
      });

      const adjustedRelevance = Math.round(
        source.relevance * 0.35 + alignment.score * 0.65
      );

      return {
        ...source,
        relevance: adjustedRelevance,
        reason:
          alignment.placeMatch && alignment.anchorHits >= 1
            ? `${source.reason} Passed story relevance guard.`
            : `${source.reason} Treated as general background rather than local evidence.`,
        __guard: alignment,
      };
    })
    .filter((source) => {
      if (source.relevance < 48) return false;

      if (!places.length) return source.__guard.anchorHits >= 1;

      return (
        source.__guard.placeMatch ||
        (source.__guard.anchorHits >= 2 && source.__guard.floodLike)
      );
    })
    .sort(
      (a, b) =>
        b.relevance * 0.58 +
          b.evidenceStrength * 0.27 +
          b.visualPotential * 0.15 -
        (a.relevance * 0.58 +
          a.evidenceStrength * 0.27 +
          a.visualPotential * 0.15)
    )
    .map(({ __guard, ...source }) => source);
}

function questionAlignment(
  topic: string,
  originalQuestion: string,
  candidate: string
) {
  const anchors = anchorTerms(topic, originalQuestion);
  const places = explicitPlaceAnchors(topic, originalQuestion);
  const text = new Set(words(candidate));

  const hits = anchors.filter((token) => text.has(token)).length;
  const placeHits = places.filter((token) => text.has(token)).length;

  let score = Math.min(70, hits * 12);
  if (places.length && placeHits) score += 30;
  if (!places.length) score += 10;

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

  const baseEvidence = Math.min(
    100,
    45 + input.evidence.filter((item) => item.kind === "observed").length * 5
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
        uncertainty: 72,
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
          candidate.overall * 0.55 + alignment * 0.45
        ),
        rationale: `${candidate.rationale} Story-question alignment: ${alignment}/100.`,
        __alignment: alignment,
      };
    })
    .filter((candidate) => candidate.__alignment >= 40)
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
