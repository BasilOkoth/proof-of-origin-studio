import type {
  DatasetAnalysis,
  EvidenceItem,
  EvidenceSourceType,
} from "./types";

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
  "a","about","after","again","against","all","also","an","and","are","as","at","be","because",
  "been","before","being","between","both","but","by","can","could","did","do","does","doing",
  "down","during","each","even","for","from","further","had","has","have","having","how","if",
  "in","into","is","it","its","more","most","of","on","or","other","our","out","over","same",
  "should","so","some","such","than","that","the","their","then","there","these","they","this",
  "those","through","to","under","very","was","we","were","what","when","where","which","while",
  "who","why","will","with","would"
]);

const JOURNAL_NOISE =
  /\b(journal|volume\s+\d+|issue\s+\d+|issn|doi|published|publication|creative commons|license|article text|original article)\b/i;

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
  const topicTokens = JOURNAL_NOISE.test(input.topic) ? [] : tokenise(input.topic);

  const weighted = [
    ...topicTokens,
    ...topicTokens,
    ...tokenise(input.question),
    ...input.evidence
      .filter((item) => !JOURNAL_NOISE.test(item.statement))
      .slice(0, 10)
      .flatMap((item) => tokenise(item.statement)),
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

function questionScore(
  values: Omit<
    StoryQuestionCandidate,
    "id" | "question" | "angle" | "overall" | "rationale"
  >
) {
  return clamp(
    values.evidenceCoverage * 0.33 +
      values.curiosity * 0.18 +
      values.consequence * 0.2 +
      values.visualPotential * 0.17 +
      values.uncertainty * 0.12
  );
}

function hasGeo(evidence: EvidenceItem[], datasets: DatasetAnalysis[]) {
  return (
    evidence.some(
      (item) => item.latitude !== undefined && item.longitude !== undefined
    ) || datasets.some((dataset) => Boolean(dataset.recommendedMap))
  );
}

function hasTime(evidence: EvidenceItem[], datasets: DatasetAnalysis[]) {
  return (
    datasets.some((dataset) => dataset.dateColumns.length > 0) ||
    evidence.some(
      (item) =>
        item.year !== undefined &&
        /\b(over time|trend|year|annual|monthly|weekly|period|from \d{4}|to \d{4})\b/i.test(
          item.statement
        )
    )
  );
}

function hasData(evidence: EvidenceItem[], datasets: DatasetAnalysis[]) {
  return (
    evidence.some(
      (item) =>
        item.value !== undefined ||
        item.sourceType === "dataset" ||
        /\b\d+(?:\.\d+)?\s*(?:%|cm|mm|kg|g|ha|km|m|cm3)?\b/i.test(
          item.statement
        )
    ) ||
    datasets.some((dataset) => Boolean(dataset.recommendedChart))
  );
}

function observedText(evidence: EvidenceItem[]) {
  return evidence
    .filter((item) => item.kind === "observed")
    .map((item) => cleanText(item.statement))
    .filter(Boolean);
}

function allEvidenceText(evidence: EvidenceItem[]) {
  return evidence.map((item) => cleanText(item.statement)).join(" ");
}

function relationshipFromTopic(topic: string) {
  const cleaned = cleanText(topic);
  const patterns = [
    /^(?:the\s+)?effects?\s+of\s+(.+?)\s+on\s+(.+)$/i,
    /^(?:the\s+)?impacts?\s+of\s+(.+?)\s+on\s+(.+)$/i,
    /^(?:the\s+)?influence\s+of\s+(.+?)\s+on\s+(.+)$/i,
    /^(?:the\s+)?role\s+of\s+(.+?)\s+in\s+(.+)$/i,
    /^(?:the\s+)?relationship\s+between\s+(.+?)\s+and\s+(.+)$/i,
    /^(?:the\s+)?association\s+between\s+(.+?)\s+and\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return {
        driver: cleanText(match[1]),
        outcome: cleanText(match[2]),
      };
    }
  }
  return null;
}

function extractMeasuredOutcomes(evidence: EvidenceItem[]) {
  const text = allEvidenceText(evidence);
  const candidates: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\broot collar diameter\b|\bRCD\b/i, "root collar diameter"],
    [/\bheight(?: of seedlings?| of trees?)?\b/i, "seedling height"],
    [/\bsurvival(?: rate)?\b/i, "survival"],
    [/\bbiomass\b/i, "biomass"],
    [/\bgermination(?: rate)?\b/i, "germination"],
    [/\byield\b/i, "yield"],
    [/\bgrowth rate\b/i, "growth rate"],
    [/\bwater retention\b/i, "water retention"],
    [/\bsoil fertility\b/i, "soil fertility"],
    [/\broot length\b/i, "root length"],
    [/\bshoot length\b/i, "shoot length"],
  ];

  for (const [pattern, label] of checks) {
    if (pattern.test(text) && !candidates.includes(label)) candidates.push(label);
  }

  return candidates.slice(0, 3);
}

function extractComparisonTerms(evidence: EvidenceItem[]) {
  const text = allEvidenceText(evidence);
  const potSizes = [...text.matchAll(/\b(\d+\s*[x×]\s*\d+)\b/gi)]
    .map((match) => match[1].replace(/\s+/g, ""));

  const uniquePotSizes = [...new Set(potSizes)];

  if (uniquePotSizes.length >= 2) {
    return {
      lower: uniquePotSizes[0],
      upper: uniquePotSizes[uniquePotSizes.length - 1],
    };
  }

  const comparative = observedText(evidence).find((statement) =>
    /\b(larger|smaller|higher|lower|compared|versus|vs\.?)\b/i.test(statement)
  );

  return comparative
    ? {
        lower: "the lower-exposure case",
        upper: "the higher-exposure case",
      }
    : null;
}

function evidenceSpecificity(evidence: EvidenceItem[]) {
  const observed = observedText(evidence);
  const numeric = observed.filter((statement) => /\b\d+(?:\.\d+)?\b/.test(statement)).length;
  const inferential = observed.filter((statement) =>
    /\b(p\s*[<=>]|anova|tukey|confidence interval|effect size|eta squared|significant(?:ly)?)\b/i.test(
      statement
    )
  ).length;

  return {
    observed: observed.length,
    numeric,
    inferential,
  };
}

function humaniseOutcome(value: string) {
  return value
    .replace(/\bZiziphus Mauritiana\b/g, "Ziziphus mauritiana")
    .replace(/\s+/g, " ")
    .trim();
}

function shorterSubject(outcome: string) {
  const match = outcome.match(/(?:growth and development of\s+)?(.+?\bseedlings?)$/i);
  return match ? cleanText(match[1]) : outcome;
}

function makeCandidate(
  angle: StoryQuestionCandidate["angle"],
  question: string,
  rationale: string,
  scores: {
    evidenceCoverage: number;
    curiosity: number;
    consequence: number;
    visualPotential: number;
    uncertainty: number;
  }
): Omit<StoryQuestionCandidate, "id" | "overall"> {
  return {
    angle,
    question: cleanText(question),
    rationale,
    evidenceCoverage: clamp(scores.evidenceCoverage),
    curiosity: clamp(scores.curiosity),
    consequence: clamp(scores.consequence),
    visualPotential: clamp(scores.visualPotential),
    uncertainty: clamp(scores.uncertainty),
  };
}

export function discoverQuestions(input: {
  topic: string;
  evidence: EvidenceItem[];
  datasets: DatasetAnalysis[];
}): StoryQuestionCandidate[] {
  const topic = cleanText(input.topic) || "this issue";
  const relationship = relationshipFromTopic(topic);
  const outcomes = extractMeasuredOutcomes(input.evidence);
  const comparison = extractComparisonTerms(input.evidence);
  const specificity = evidenceSpecificity(input.evidence);

  const limitations = input.evidence.filter((item) => item.kind === "limitation").length;
  const inferences = input.evidence.filter((item) => item.kind === "inference").length;
  const sourceTypes = new Set(input.evidence.map((item) => item.sourceType).filter(Boolean));

  const geo = hasGeo(input.evidence, input.datasets);
  const time = hasTime(input.evidence, input.datasets);
  const data = hasData(input.evidence, input.datasets);

  const evidenceBase = clamp(
    34 +
      specificity.observed * 5 +
      specificity.numeric * 4 +
      specificity.inferential * 6 +
      input.datasets.length * 8 +
      sourceTypes.size * 3
  );

  const uncertainty = clamp(
    38 +
      limitations * 12 +
      inferences * 3 -
      specificity.inferential * 3
  );

  const visual = clamp(
    38 +
      (data ? 18 : 0) +
      (geo ? 16 : 0) +
      (time ? 9 : 0) +
      Math.min(12, specificity.numeric * 2)
  );

  const candidates: Array<Omit<StoryQuestionCandidate, "id" | "overall">> = [];

  if (relationship) {
    const driver = relationship.driver;
    const outcome = humaniseOutcome(relationship.outcome);
    const subject = shorterSubject(outcome);
    const measured =
      outcomes.length >= 2
        ? `${outcomes[0]} and ${outcomes[1]}`
        : outcomes[0] || outcome;

    candidates.push(
      makeCandidate(
        "causal",
        `How much does ${driver.toLowerCase()} change ${measured} in ${subject}?`,
        "This question comes directly from the study relationship and keeps the measured outcomes at the centre of the story.",
        {
          evidenceCoverage: evidenceBase + 8,
          curiosity: 82,
          consequence: 78,
          visualPotential: visual + 5,
          uncertainty,
        }
      )
    );

    if (comparison) {
      candidates.push(
        makeCandidate(
          "comparison",
          `How big is the difference between ${comparison.lower} and ${comparison.upper} when raising ${subject}?`,
          "The source contains explicit treatment comparisons, so the story can show the magnitude of the difference instead of speaking about effects abstractly.",
          {
            evidenceCoverage: evidenceBase + 10,
            curiosity: 86,
            consequence: 76,
            visualPotential: visual + 10,
            uncertainty: uncertainty - 4,
          }
        )
      );
    }

    const mechanismText = allEvidenceText(input.evidence);
    const hasMechanism =
      /\b(water retention|root restriction|soil volume|nutrient uptake|aeration|fertility|rooting volume|water holding capacity)\b/i.test(
        mechanismText
      );

    if (hasMechanism) {
      candidates.push(
        makeCandidate(
          "systems",
          `Why might ${driver.toLowerCase()} change ${measured}, and which mechanisms are supported by the evidence?`,
          "The imported evidence contains plausible mechanisms as well as measured outcomes, allowing the story to separate observed effects from explanatory interpretation.",
          {
            evidenceCoverage: evidenceBase,
            curiosity: 84,
            consequence: 72,
            visualPotential: visual + 6,
            uncertainty: uncertainty + 6,
          }
        )
      );
    }

    const practicalSignal =
      /\b(cost|weight|kg|material|nursery|practice|recommend|advantage|efficient|soil mixture)\b/i.test(
        mechanismText
      );

    if (practicalSignal) {
      candidates.push(
        makeCandidate(
          "myth_test",
          `Are the gains from larger ${driver.toLowerCase()} large enough to justify the extra nursery material and handling?`,
          "This turns the finding into a practical trade-off: stronger growth must be weighed against the additional material, weight or management burden visible in the evidence.",
          {
            evidenceCoverage: evidenceBase - 3,
            curiosity: 89,
            consequence: 88,
            visualPotential: visual + 7,
            uncertainty: uncertainty + 8,
          }
        )
      );
    }

    const onlyNursery =
      /\bnursery\b/i.test(mechanismText) &&
      !/\b(field survival was measured|survival was measured|measured .*field)\b/i.test(
        mechanismText
      );

    if (onlyNursery) {
      candidates.push(
        makeCandidate(
          "unresolved",
          `Do better nursery growth results for ${subject} actually translate into better field survival after planting?`,
          "The source supports nursery growth outcomes, but that does not automatically establish post-planting survival. This question makes the evidence boundary visible.",
          {
            evidenceCoverage: evidenceBase - 12,
            curiosity: 91,
            consequence: 92,
            visualPotential: visual - 3,
            uncertainty: uncertainty + 18,
          }
        )
      );
    }

    if (time) {
      candidates.push(
        makeCandidate(
          "change",
          `How did ${measured} change through the study period under different ${driver.toLowerCase()} treatments?`,
          "Time-structured evidence can show whether treatment differences emerged gradually or were present from the start.",
          {
            evidenceCoverage: evidenceBase + 2,
            curiosity: 74,
            consequence: 68,
            visualPotential: visual + 12,
            uncertainty,
          }
        )
      );
    }
  } else {
    const strongest = observedText(input.evidence).find((statement) =>
      /\b(significant(?:ly)?|higher|lower|increase|decrease|difference|compared|associated)\b/i.test(
        statement
      )
    );

    if (strongest) {
      const compactFinding = strongest.slice(0, 170).replace(/[.;:,]\s*$/, "");
      candidates.push(
        makeCandidate(
          "causal",
          `What does the strongest finding — “${compactFinding}” — actually tell us?`,
          "The question is anchored to a concrete observed result rather than to the document title alone.",
          {
            evidenceCoverage: evidenceBase + 6,
            curiosity: 80,
            consequence: 76,
            visualPotential: visual,
            uncertainty,
          }
        )
      );
    }

    candidates.push(
      makeCandidate(
        "comparison",
        `Which result in ${topic} changes the interpretation most when the cases are compared directly?`,
        "This keeps the comparison tied to the imported evidence instead of inventing a generic causal claim.",
        {
          evidenceCoverage: evidenceBase,
          curiosity: 76,
          consequence: 72,
          visualPotential: visual + 5,
          uncertainty,
        }
      )
    );

    candidates.push(
      makeCandidate(
        "unresolved",
        `What important conclusion can ${topic} not support with the evidence currently available?`,
        "A useful evidence-led story should surface the boundary between what the source measured and what readers might be tempted to infer.",
        {
          evidenceCoverage: evidenceBase - 8,
          curiosity: 82,
          consequence: 84,
          visualPotential: visual - 5,
          uncertainty: uncertainty + 16,
        }
      )
    );
  }

  if (geo) {
    candidates.push(
      makeCandidate(
        "comparison",
        "How much of the finding depends on where the evidence was collected?",
        "Geographic context can matter, so this asks whether the result should be treated as locally specific or broadly generalisable.",
        {
          evidenceCoverage: evidenceBase - 4,
          curiosity: 78,
          consequence: 82,
          visualPotential: visual + 9,
          uncertainty: uncertainty + 10,
        }
      )
    );
  }

  const deduped = new Map<string, Omit<StoryQuestionCandidate, "id" | "overall">>();
  for (const candidate of candidates) {
    const key = candidate.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!deduped.has(key)) deduped.set(key, candidate);
  }

  return [...deduped.values()]
    .map((candidate, index) => ({
      ...candidate,
      id: `question-${index + 1}`,
      overall: questionScore(candidate),
    }))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 6);
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
    sourceLabel: `${
      source.provider === "world_bank"
        ? "World Bank"
        : source.provider === "crossref"
          ? "Crossref"
          : "Existing source"
    } · ${source.title}`,
    sourceType: source.sourceType,
    year: source.year,
  };
}
