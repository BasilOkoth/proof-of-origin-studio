import type { DatasetAnalysis, EvidenceItem } from "./types";
import type { EvidenceLibraryRecord } from "./evidence-library";
import type { StoryQuestionCandidate } from "./evidence-scout";
import {
  classifyClaimForStory,
  roleWeight,
  type ClaimRole,
} from "./claim-relevance";

export type ClaimRelation = "supports" | "contradicts" | "limits" | "context";

export type ClaimNode = {
  id: string;
  text: string;
  evidenceKind: EvidenceItem["kind"];
  sourceIds: string[];
  confidence: number;
  visualPotential: number;
  polarity: "positive" | "negative" | "uncertain";
  role: ClaimRole;
  relevance: number;
  relevanceReason: string;
};

export type ClaimSourceEdge = {
  id: string;
  claimId: string;
  sourceId: string;
  relation: ClaimRelation;
  strength: number;
  reason: string;
};

export type ContradictionFinding = {
  id: string;
  claimAId: string;
  claimBId: string;
  severity: number;
  reason: string;
};

export type StoryHunterAngle = {
  id: string;
  question: string;
  title: string;
  hook: string;
  angle: "contradiction" | "causal" | "systems" | "comparison" | "change" | "unresolved";
  evidence: number;
  curiosity: number;
  stakes: number;
  visualPotential: number;
  tension: number;
  originality: number;
  overall: number;
  claimIds: string[];
  sourceIds: string[];
  visualPlan: string[];
  rationale: string;
};

export type EvidenceIntelligenceReport = {
  generatedAt: string;
  claims: ClaimNode[];
  edges: ClaimSourceEdge[];
  contradictions: ContradictionFinding[];
  angles: StoryHunterAngle[];
  sourceCount: number;
  ingestedSourceCount: number;
  warnings: string[];
};

const STOP = new Set([
  "about", "after", "also", "among", "and", "are", "because", "been", "before", "being", "between",
  "both", "but", "can", "could", "did", "does", "during", "from", "have", "into", "more", "most", "not",
  "that", "the", "their", "there", "these", "they", "this", "those", "through", "under", "very", "was", "were",
  "what", "when", "where", "which", "while", "with", "would", "your", "than", "then", "such", "only", "over",
]);

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeToken(token: string) {
  let value = token.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (/^flood(?:s|ed|ing)?$/.test(value)) return "flood";
  if (/^drain(?:s|ed|ing|age)?$/.test(value)) return "drain";
  if (/^rain(?:s|ed|ing|fall)?$/.test(value)) return "rain";
  if (/^river(?:s)?$/.test(value)) return "river";
  if (value.length > 6 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 5 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("s")) value = value.slice(0, -1);
  return value;
}

function tokens(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

function similarity(a: string, b: string) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((token) => {
    if (right.has(token)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function polarity(text: string): ClaimNode["polarity"] {
  if (/\b(uncertain|unclear|inconclusive|may|might|possibly|cannot establish|could not establish|insufficient|limited evidence)\b/i.test(text)) {
    return "uncertain";
  }
  if (/\b(no |not |did not|does not|was not|were not|cannot|never|declin(?:e|ed|ing)|decreas(?:e|ed|ing)|lower|fell|falling|reduc(?:e|ed|ing)|negative)\b/i.test(text)) {
    return "negative";
  }
  return "positive";
}

function directionalConflict(a: string, b: string) {
  const up = /\b(increas(?:e|ed|ing)|higher|rose|rising|grew|growth|more|worsen(?:ed|ing)?)\b/i;
  const down = /\b(decreas(?:e|ed|ing)|lower|fell|falling|declin(?:e|ed|ing)|reduc(?:e|ed|ing)|less|improv(?:e|ed|ing)?)\b/i;
  return (up.test(a) && down.test(b)) || (down.test(a) && up.test(b));
}

function sourceIdentity(item: EvidenceItem, library: EvidenceLibraryRecord[]) {
  const direct = clean(item.source || "").toLowerCase();
  const label = clean(item.sourceLabel || "").toLowerCase();
  const matched = library.find((source) => {
    const candidates = [source.url, source.downloadUrl, source.title, source.fileName]
      .filter(Boolean)
      .map((value) => clean(String(value)).toLowerCase());
    return candidates.some((candidate) =>
      Boolean(candidate) &&
      (candidate === direct ||
        candidate === label ||
        direct.includes(candidate) ||
        label.includes(candidate) ||
        candidate.includes(label))
    );
  });
  return matched?.id;
}

function claimVisualPotential(item: EvidenceItem, datasets: DatasetAnalysis[]) {
  let score = 50;
  if (item.sourceType === "dataset" || item.value !== undefined) score += 25;
  if (item.latitude !== undefined && item.longitude !== undefined) score += 20;
  if (item.year !== undefined) score += 10;
  if (item.sourceType === "field") score += 15;
  if (datasets.some((dataset) => dataset.recommendedChart || dataset.recommendedMap)) score += 6;
  return clamp(score);
}

function uniqueEvidence(evidence: EvidenceItem[]) {
  const result: EvidenceItem[] = [];
  evidence.forEach((item) => {
    const statement = clean(item.statement);
    if (!statement) return;
    const duplicate = result.some((existing) => similarity(existing.statement, statement) >= 0.86);
    if (!duplicate) result.push(item);
  });
  return result;
}

function claimConfidence(item: EvidenceItem, sourceCount: number) {
  const kind = item.kind === "observed" ? 72 : item.kind === "inference" ? 58 : 52;
  const sourceBonus = sourceCount ? Math.min(18, sourceCount * 8) : 0;
  const explicitSource = item.source || item.sourceLabel ? 8 : 0;
  return clamp(kind + sourceBonus + explicitSource);
}

function sourcesForClaim(item: EvidenceItem, library: EvidenceLibraryRecord[]) {
  const direct = sourceIdentity(item, library);
  const text = `${item.statement} ${item.sourceLabel || ""} ${item.source || ""}`;
  const lexical = library
    .filter((source) => {
      const haystack = `${source.title} ${source.summary || ""} ${source.extractedText?.slice(0, 1800) || ""}`;
      return similarity(text, haystack) >= 0.18;
    })
    .sort(
      (a, b) =>
        similarity(text, `${b.title} ${b.summary || ""}`) -
        similarity(text, `${a.title} ${a.summary || ""}`)
    )
    .slice(0, 4)
    .map((source) => source.id);

  return [...new Set([...(direct ? [direct] : []), ...lexical])];
}

function relationFor(item: EvidenceItem, claim: ClaimNode, source: EvidenceLibraryRecord): ClaimRelation {
  if (item.kind === "limitation") return "limits";
  const sourceText = `${source.title} ${source.summary || ""} ${source.extractedText?.slice(0, 2800) || ""}`;
  if (similarity(claim.text, sourceText) < 0.12) return "context";
  const sourcePolarity = polarity(sourceText);
  if (
    sourcePolarity !== "uncertain" &&
    claim.polarity !== "uncertain" &&
    sourcePolarity !== claim.polarity
  ) {
    return "contradicts";
  }
  return item.kind === "observed" ? "supports" : "context";
}

function contradictionSeverity(a: ClaimNode, b: ClaimNode) {
  if (a.role === "exclude" || b.role === "exclude") return 0;
  if (a.role === "comparison" || b.role === "comparison") return 0;

  const lexical = similarity(a.text, b.text);
  if (lexical < 0.28) return 0;
  let severity = lexical * 65;
  if (
    a.polarity !== "uncertain" &&
    b.polarity !== "uncertain" &&
    a.polarity !== b.polarity
  ) severity += 28;
  if (directionalConflict(a.text, b.text)) severity += 30;
  return clamp(severity);
}

function storyScore(
  values: Omit<
    StoryHunterAngle,
    "id" | "question" | "title" | "hook" | "angle" | "overall" |
    "claimIds" | "sourceIds" | "visualPlan" | "rationale"
  >
) {
  return clamp(
    values.evidence * 0.24 +
      values.curiosity * 0.2 +
      values.stakes * 0.16 +
      values.visualPotential * 0.16 +
      values.tension * 0.15 +
      values.originality * 0.09
  );
}

function compactTopic(topic: string) {
  const value = clean(topic);
  return value.length > 86 ? `${value.slice(0, 83)}…` : value || "this story";
}

function buildAngles(input: {
  topic: string;
  question: string;
  claims: ClaimNode[];
  contradictions: ContradictionFinding[];
  library: EvidenceLibraryRecord[];
  datasets: DatasetAnalysis[];
  questionCandidates: StoryQuestionCandidate[];
}) {
  const topic = compactTopic(input.topic);

  const storyClaims = input.claims.filter(
    (claim) =>
      claim.role === "core_local" ||
      claim.role === "mechanism" ||
      claim.role === "context"
  );

  const coreClaims = storyClaims.filter((claim) => claim.role === "core_local");
  const mechanismClaims = storyClaims.filter((claim) => claim.role === "mechanism");

  const relevantSourceIds = new Set(
    storyClaims.flatMap((claim) => claim.sourceIds)
  );

  const relevantLibrary = input.library.filter((source) =>
    relevantSourceIds.has(source.id)
  );

  const ingested = relevantLibrary.filter(
    (source) => source.status === "ingested" || source.status === "reviewed"
  );

  const weightedClaimEvidence = storyClaims.reduce(
    (sum, claim) => {
      const sourceConnectionWeight = claim.sourceIds.length > 0 ? 1 : 0.35;
      return sum + roleWeight(claim.role) * sourceConnectionWeight;
    },
    0
  );

  const connectedCoreClaims = coreClaims.filter((claim) => claim.sourceIds.length > 0).length;
  const connectedMechanismClaims = mechanismClaims.filter((claim) => claim.sourceIds.length > 0).length;

  const evidence = clamp(
    28 +
      connectedCoreClaims * 10 +
      connectedMechanismClaims * 7 +
      Math.min(18, weightedClaimEvidence * 3) +
      Math.min(16, ingested.length * 5)
  );

  const contradiction = input.contradictions.length
    ? clamp(68 + input.contradictions[0].severity * 0.25)
    : 48;

  const map = input.datasets.some((dataset) => dataset.recommendedMap);
  const chart = input.datasets.some((dataset) => dataset.recommendedChart);

  const visual = clamp(
    55 +
      (map ? 18 : 0) +
      (chart ? 18 : 0) +
      Math.min(10, storyClaims.filter((claim) => claim.visualPotential >= 70).length * 2)
  );

  const sourceIds = [...relevantSourceIds].slice(0, 8);
  const claimIds = storyClaims
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 8)
    .map((claim) => claim.id);

  const topCandidate =
    input.questionCandidates[0]?.question ||
    input.question ||
    `What is really happening with ${topic}?`;

  const angles: Omit<StoryHunterAngle, "id" | "overall">[] = [];

  if (input.contradictions.length) {
    angles.push({
      question: `Why does the evidence on ${topic} point in different directions?`,
      title: `${topic}: The Evidence Doesn't Agree`,
      hook: `The strongest relevant sources on ${topic} do not tell one neat story — and that disagreement is where the investigation begins.`,
      angle: "contradiction",
      evidence,
      curiosity: 96,
      stakes: 90,
      visualPotential: visual,
      tension: contradiction,
      originality: 94,
      claimIds,
      sourceIds,
      visualPlan: [
        "Split-screen conflicting claims",
        "Source-highlight sequence",
        "Evidence matrix",
        chart ? "Data chart" : "Comparison graphic",
      ],
      rationale:
        "Only contradictions among story-relevant claims contribute to this angle; excluded claims cannot manufacture tension.",
    });
  }

  angles.push(
    {
      question: topCandidate,
      title: `${topic}: What the Evidence Actually Shows`,
      hook: `There is a familiar explanation for ${topic}. The relevant evidence is more complicated — and more useful.`,
      angle: "causal",
      evidence,
      curiosity: 91,
      stakes: 88,
      visualPotential: visual,
      tension: clamp(64 + input.contradictions.length * 8),
      originality: 86,
      claimIds,
      sourceIds,
      visualPlan: [
        chart ? "Lead with the strongest chart" : "Lead with the strongest core-local source",
        map ? "Geographic comparison" : "Evidence comparison",
        "Systems diagram",
        "Trust-boundary limitation",
      ],
      rationale:
        "The evidence score now uses only core-local, mechanism and contextual claims. Excluded hazards and unrelated material do not count.",
    },
    {
      question: `How do the forces behind ${topic} interact to produce the outcome we see?`,
      title: `The Hidden System Behind ${topic}`,
      hook: `${topic} looks like one problem. The relevant evidence suggests it is several systems interacting.`,
      angle: "systems",
      evidence: clamp(evidence - 2),
      curiosity: 88,
      stakes: 93,
      visualPotential: clamp(visual + 5),
      tension: 76,
      originality: 91,
      claimIds,
      sourceIds,
      visualPlan: [
        "Driver-to-outcome systems map",
        map ? "Spatial overlay" : "Layered causal diagram",
        chart ? "Trend chart" : "Evidence cards",
        "Intervention leverage points",
      ],
      rationale:
        "This angle is built from story-relevant claims only, with local evidence prioritized over generic national or cross-city context.",
    }
  );

  if (map) {
    angles.push({
      question: `Why does ${topic} look different across places?`,
      title: `${topic} Changes When You Put It on a Map`,
      hook: `A single average hides the most important part of ${topic}: where it happens changes the explanation.`,
      angle: "comparison",
      evidence,
      curiosity: 90,
      stakes: 85,
      visualPotential: 98,
      tension: 78,
      originality: 92,
      claimIds,
      sourceIds,
      visualPlan: [
        "Animated map",
        "Place-to-place comparison",
        chart ? "Small-multiple chart" : "Evidence cards by place",
        "Local-condition overlay",
      ],
      rationale:
        "Geographic comparison is enabled only when the data supports it; comparison claims remain explicitly separated from local proof.",
    });
  }

  if (input.datasets.some((dataset) => dataset.dateColumns.length > 0)) {
    angles.push({
      question: `What changed in ${topic} over time, and what best explains the shift?`,
      title: `What Changed in ${topic}?`,
      hook: `The most revealing part of ${topic} may be the moment the pattern changed.`,
      angle: "change",
      evidence,
      curiosity: 87,
      stakes: 86,
      visualPotential: clamp(visual + 6),
      tension: 74,
      originality: 84,
      claimIds,
      sourceIds,
      visualPlan: ["Animated timeline", "Before/after", "Trend divergence", "Source-highlight turning point"],
      rationale:
        "A temporal story is offered only when the dataset contains date fields and the supporting claims survive relevance review.",
    });
  }

  angles.push({
    question: `What does the relevant evidence still fail to explain about ${topic}?`,
    title: `The Missing Evidence Behind ${topic}`,
    hook: `The biggest finding may be the part of ${topic} we still cannot honestly explain.`,
    angle: "unresolved",
    evidence: clamp(evidence - 8),
    curiosity: 82,
    stakes: 80,
    visualPotential: clamp(visual - 6),
    tension: 86,
    originality: 95,
    claimIds,
    sourceIds,
    visualPlan: ["Evidence coverage matrix", "Known vs unknown", "Source gaps", "Next-test roadmap"],
    rationale:
      "Evidence gaps are calculated after relevance filtering, so unrelated hazards cannot make the story look better supported than it is.",
  });

  return angles
    .map((angle, index) => ({
      ...angle,
      id: `story-angle-${index + 1}`,
      overall: storyScore(angle),
    }))
    .sort((a, b) => b.overall - a.overall);
}

export function buildEvidenceIntelligence(input: {
  topic: string;
  question: string;
  evidence: EvidenceItem[];
  datasets: DatasetAnalysis[];
  library: EvidenceLibraryRecord[];
  questionCandidates?: StoryQuestionCandidate[];
}): EvidenceIntelligenceReport {
  const libraryEvidence = input.library.flatMap((source) => source.evidence || []);
  const allEvidence = uniqueEvidence([...input.evidence, ...libraryEvidence]);

  const claims: ClaimNode[] = allEvidence.slice(0, 100).map((item, index) => {
    const sourceIds = sourcesForClaim(item, input.library);
    const relevance = classifyClaimForStory({
      topic: input.topic,
      question: input.question,
      item,
      library: input.library,
      sourceIds,
    });

    return {
      id: `claim-${index + 1}`,
      text: clean(item.statement),
      evidenceKind: item.kind,
      sourceIds,
      confidence: claimConfidence(item, sourceIds.length),
      visualPotential: claimVisualPotential(item, input.datasets),
      polarity: polarity(item.statement),
      role: relevance.role,
      relevance: relevance.score,
      relevanceReason: relevance.reason,
    };
  });

  const storyClaims = claims.filter((claim) => claim.role !== "exclude");

  const edges: ClaimSourceEdge[] = [];
  storyClaims.forEach((claim) => {
    const item = allEvidence.find(
      (candidate) => clean(candidate.statement) === claim.text
    );
    if (!item) return;

    claim.sourceIds.forEach((sourceId) => {
      const source = input.library.find((candidate) => candidate.id === sourceId);
      if (!source) return;
      const relation = relationFor(item, claim, source);
      edges.push({
        id: `${claim.id}-${source.id}`,
        claimId: claim.id,
        sourceId: source.id,
        relation,
        strength:
          relation === "supports"
            ? 86
            : relation === "contradicts"
              ? 82
              : relation === "limits"
                ? 76
                : 62,
        reason:
          relation === "supports"
            ? "The claim is linked to this ingested or source-visible evidence record."
            : relation === "contradicts"
              ? "The source text overlaps with the claim but appears to point in the opposite direction."
              : relation === "limits"
                ? "This evidence item explicitly limits the claim or its generality."
                : "The source provides context but should not be treated as direct proof of the claim.",
      });
    });
  });

  const contradictions: ContradictionFinding[] = [];
  for (let i = 0; i < storyClaims.length; i += 1) {
    for (let j = i + 1; j < storyClaims.length; j += 1) {
      const severity = contradictionSeverity(storyClaims[i], storyClaims[j]);
      if (severity < 58) continue;
      contradictions.push({
        id: `contradiction-${i}-${j}`,
        claimAId: storyClaims[i].id,
        claimBId: storyClaims[j].id,
        severity,
        reason: directionalConflict(storyClaims[i].text, storyClaims[j].text)
          ? "These story-relevant claims discuss overlapping subject matter but describe opposing directions of change."
          : "These story-relevant claims are lexically similar while differing in polarity; review the underlying sources before choosing a conclusion.",
      });
    }
  }
  contradictions.sort((a, b) => b.severity - a.severity);

  const warnings: string[] = [];
  const ingested = input.library.filter(
    (source) => source.status === "ingested" || source.status === "reviewed"
  );

  const excludedCount = claims.filter((claim) => claim.role === "exclude").length;
  const coreCount = claims.filter((claim) => claim.role === "core_local").length;
  const mechanismCount = claims.filter((claim) => claim.role === "mechanism").length;

  if (!input.library.length) {
    warnings.push(
      "The persistent Evidence Library is empty. Scout or ingest sources before trusting the claim graph."
    );
  }

  if (!ingested.length) {
    warnings.push(
      "No open source has been fully ingested yet. Candidate metadata is useful for discovery but is not a substitute for reviewing source content."
    );
  }

  if (excludedCount) {
    warnings.push(
      `${excludedCount} extracted claim${excludedCount === 1 ? "" : "s"} were excluded from Story Hunter because they do not sufficiently match the current story question or geography.`
    );
  }

  const connectedRelevantClaims = storyClaims.filter((claim) => claim.sourceIds.length > 0).length;

  if (!coreCount) {
    warnings.push(
      "No core-local claim currently survives the relevance gate. Treat Story Hunter scores as provisional until local evidence is added."
    );
  } else if (connectedRelevantClaims === 0) {
    warnings.push(
      "Relevant claims exist, but none is connected to a persistent source record. Story Hunter evidence scores are intentionally capped until provenance links are established."
    );
  } else if (mechanismCount === 0) {
    warnings.push(
      "Local evidence is present, but mechanism coverage is thin. Add evidence explaining how the observed outcome is produced."
    );
  }

  if (!contradictions.length) {
    warnings.push(
      "No strong contradiction was detected automatically among story-relevant claims. This does not mean the evidence agrees."
    );
  }

  if (
    storyClaims.length &&
    storyClaims.filter((claim) => claim.sourceIds.length === 0).length >
      storyClaims.length / 2
  ) {
    warnings.push(
      "More than half of story-relevant claims are not yet connected to a persistent source record."
    );
  }

  const angles = buildAngles({
    topic: input.topic,
    question: input.question,
    claims,
    contradictions,
    library: input.library,
    datasets: input.datasets,
    questionCandidates: input.questionCandidates || [],
  });

  return {
    generatedAt: new Date().toISOString(),
    claims,
    edges,
    contradictions: contradictions.slice(0, 20),
    angles,
    sourceCount: input.library.length,
    ingestedSourceCount: ingested.length,
    warnings,
  };
}
