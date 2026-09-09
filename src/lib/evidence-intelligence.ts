import type { DatasetAnalysis, EvidenceItem } from "./types";
import type { EvidenceLibraryRecord } from "./evidence-library";
import type { StoryQuestionCandidate } from "./evidence-scout";

export type ClaimRelation = "supports" | "contradicts" | "limits" | "context";

export type ClaimNode = {
  id: string;
  text: string;
  evidenceKind: EvidenceItem["kind"];
  sourceIds: string[];
  confidence: number;
  visualPotential: number;
  polarity: "positive" | "negative" | "uncertain";
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

function tokens(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
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
      Boolean(candidate) && (candidate === direct || candidate === label || direct.includes(candidate) || label.includes(candidate))
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
    .sort((a, b) => similarity(text, `${b.title} ${b.summary || ""}`) - similarity(text, `${a.title} ${a.summary || ""}`))
    .slice(0, 4)
    .map((source) => source.id);
  return [...new Set([...(direct ? [direct] : []), ...lexical])];
}

function relationFor(item: EvidenceItem, claim: ClaimNode, source: EvidenceLibraryRecord): ClaimRelation {
  if (item.kind === "limitation") return "limits";
  const sourceText = `${source.title} ${source.summary || ""} ${source.extractedText?.slice(0, 2800) || ""}`;
  if (similarity(claim.text, sourceText) < 0.12) return "context";
  const sourcePolarity = polarity(sourceText);
  if (sourcePolarity !== "uncertain" && claim.polarity !== "uncertain" && sourcePolarity !== claim.polarity) return "contradicts";
  return item.kind === "observed" ? "supports" : "context";
}

function contradictionSeverity(a: ClaimNode, b: ClaimNode) {
  const lexical = similarity(a.text, b.text);
  if (lexical < 0.28) return 0;
  let severity = lexical * 65;
  if (a.polarity !== "uncertain" && b.polarity !== "uncertain" && a.polarity !== b.polarity) severity += 28;
  if (directionalConflict(a.text, b.text)) severity += 30;
  return clamp(severity);
}

function storyScore(values: Omit<StoryHunterAngle, "id" | "question" | "title" | "hook" | "angle" | "overall" | "claimIds" | "sourceIds" | "visualPlan" | "rationale">) {
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
  const ingested = input.library.filter((source) => source.status === "ingested" || source.status === "reviewed");
  const sourceCount = input.library.length;
  const evidence = clamp(48 + input.claims.length * 5 + Math.min(24, ingested.length * 5));
  const contradiction = input.contradictions.length ? clamp(68 + input.contradictions[0].severity * 0.25) : 48;
  const map = input.datasets.some((dataset) => dataset.recommendedMap);
  const chart = input.datasets.some((dataset) => dataset.recommendedChart);
  const visual = clamp(58 + (map ? 18 : 0) + (chart ? 18 : 0) + Math.min(10, ingested.length * 2));
  const sourceIds = input.library.slice(0, 8).map((source) => source.id);
  const claimIds = input.claims.slice(0, 8).map((claim) => claim.id);

  const topCandidate = input.questionCandidates[0]?.question || input.question || `What is really happening with ${topic}?`;
  const angles: Omit<StoryHunterAngle, "id" | "overall">[] = [];

  if (input.contradictions.length) {
    angles.push({
      question: `Why does the evidence on ${topic} point in different directions?`,
      title: `${topic}: The Evidence Doesn't Agree`,
      hook: `The strongest sources on ${topic} do not tell one neat story — and that disagreement is where the real explanation begins.`,
      angle: "contradiction",
      evidence,
      curiosity: 96,
      stakes: 90,
      visualPotential: visual,
      tension: contradiction,
      originality: 94,
      claimIds,
      sourceIds,
      visualPlan: ["Split-screen conflicting claims", "Source-highlight sequence", "Evidence matrix", chart ? "Data chart" : "Comparison graphic"],
      rationale: "Contradictory evidence creates genuine tension without manufacturing drama. It also gives the episode a reason to investigate rather than summarize.",
    });
  }

  angles.push(
    {
      question: topCandidate,
      title: `${topic}: What the Evidence Actually Shows`,
      hook: `There is a familiar explanation for ${topic}. The evidence is more complicated — and more useful.`,
      angle: "causal",
      evidence,
      curiosity: 91,
      stakes: 88,
      visualPotential: visual,
      tension: clamp(64 + input.contradictions.length * 8),
      originality: 86,
      claimIds,
      sourceIds,
      visualPlan: [chart ? "Lead with the strongest chart" : "Lead with the strongest observed source", map ? "Geographic comparison" : "Evidence comparison", "Systems diagram", "Trust-boundary limitation"],
      rationale: "A causal investigation gives the viewer a clear promise: compare competing explanations and show which ones survive contact with the evidence.",
    },
    {
      question: `How do the forces behind ${topic} interact to produce the outcome we see?`,
      title: `The Hidden System Behind ${topic}`,
      hook: `${topic} looks like one problem. The evidence suggests it is actually several systems colliding.`,
      angle: "systems",
      evidence: clamp(evidence - 2),
      curiosity: 88,
      stakes: 93,
      visualPotential: clamp(visual + 5),
      tension: 76,
      originality: 91,
      claimIds,
      sourceIds,
      visualPlan: ["Driver-to-outcome systems map", map ? "Spatial overlay" : "Layered causal diagram", chart ? "Trend chart" : "Evidence cards", "Intervention leverage points"],
      rationale: "Systems stories are especially strong when the library contains multiple source types and the audience needs to understand interaction rather than one isolated cause.",
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
      visualPlan: ["Animated map", "Place-to-place comparison", chart ? "Small-multiple chart" : "Evidence cards by place", "Local-condition overlay"],
      rationale: "Geographic variation is naturally visual and can reveal mechanisms that disappear in aggregate statistics.",
    });
  }

  if (input.datasets.some((dataset) => dataset.dateColumns.length > 0)) {
    angles.push({
      question: `What changed in ${topic} over time, and what best explains the shift?`,
      title: `What Changed in ${topic}?`,
      hook: `The most revealing part of ${topic} is not where it is now — it is the moment the pattern changed.`,
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
      rationale: "A temporal story gives the episode a natural narrative arc and lets the viewer see change rather than hear a list of static facts.",
    });
  }

  angles.push({
    question: `What does the evidence still fail to explain about ${topic}?`,
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
    rationale: "An unresolved angle can be highly distinctive when the evidence base is incomplete, but it should be chosen only when the missing evidence itself is consequential.",
  });

  return angles
    .map((angle, index) => ({ ...angle, id: `story-angle-${index + 1}`, overall: storyScore(angle) }))
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

  const claims: ClaimNode[] = allEvidence.slice(0, 80).map((item, index) => {
    const sourceIds = sourcesForClaim(item, input.library);
    return {
      id: `claim-${index + 1}`,
      text: clean(item.statement),
      evidenceKind: item.kind,
      sourceIds,
      confidence: claimConfidence(item, sourceIds.length),
      visualPotential: claimVisualPotential(item, input.datasets),
      polarity: polarity(item.statement),
    };
  });

  const edges: ClaimSourceEdge[] = [];
  claims.forEach((claim, claimIndex) => {
    const item = allEvidence[claimIndex];
    claim.sourceIds.forEach((sourceId) => {
      const source = input.library.find((candidate) => candidate.id === sourceId);
      if (!source) return;
      const relation = relationFor(item, claim, source);
      edges.push({
        id: `${claim.id}-${source.id}`,
        claimId: claim.id,
        sourceId: source.id,
        relation,
        strength: relation === "supports" ? 86 : relation === "contradicts" ? 82 : relation === "limits" ? 76 : 62,
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
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const severity = contradictionSeverity(claims[i], claims[j]);
      if (severity < 58) continue;
      contradictions.push({
        id: `contradiction-${i}-${j}`,
        claimAId: claims[i].id,
        claimBId: claims[j].id,
        severity,
        reason: directionalConflict(claims[i].text, claims[j].text)
          ? "These claims discuss overlapping subject matter but describe opposing directions of change."
          : "These claims are lexically similar while differing in polarity; review the underlying sources before choosing a conclusion.",
      });
    }
  }
  contradictions.sort((a, b) => b.severity - a.severity);

  const warnings: string[] = [];
  const ingested = input.library.filter((source) => source.status === "ingested" || source.status === "reviewed");
  if (!input.library.length) warnings.push("The persistent Evidence Library is empty. Scout or ingest sources before trusting the claim graph.");
  if (!ingested.length) warnings.push("No open source has been fully ingested yet. Candidate metadata is useful for discovery but is not a substitute for reviewing source content.");
  if (!contradictions.length) warnings.push("No strong contradiction was detected automatically. This does not mean the evidence agrees; contradiction detection is a screening aid, not a final scholarly judgment.");
  if (claims.filter((claim) => claim.sourceIds.length === 0).length > claims.length / 2) warnings.push("More than half of extracted claims are not yet connected to a persistent source record.");

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
