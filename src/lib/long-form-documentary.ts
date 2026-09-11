import type {
  DatasetAnalysis,
  EpisodeProject,
  EvidenceItem,
  Scene,
} from "./types";

export type DocumentarySceneRole =
  | "hook"
  | "frame"
  | "data"
  | "geography"
  | "mechanism"
  | "consequence"
  | "governance"
  | "trust_boundary"
  | "synthesis"
  | "closure";

export type LongFormPlan = {
  targetWords: number;
  wordsPerMinute: number;
  sceneTargets: Array<{
    sceneId: string;
    role: DocumentarySceneRole;
    targetWords: number;
  }>;
};

const LONG_FORM_MODES = new Set([
  "world_explained",
  "investigation",
  "explainer",
  "case_study",
  "research",
  "report",
]);

const INTERNAL_METADATA =
  /current story-grounded evidence|story-grounded evidence|evidence items?|current story|this draft|draft contains|scene \d+|visual intelligence|retention score|source count|dataset count/i;

const PRODUCTION_LANGUAGE =
  /a strong explanation has to|observed\s*≠\s*inferred|evidence before aesthetics|the story is built only from evidence|the analytical value of this scene|the point of the chart is not decoration|location is not decoration|source-backed observation|current interpretation/i;

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function lowerFirst(value: string) {
  const text = clean(value);
  return text
    ? `${text.charAt(0).toLowerCase()}${text.slice(1)}`
    : "";
}

function wordCount(value: string) {
  return clean(value)
    .split(/\s+/)
    .filter(Boolean).length;
}

function splitSentences(value: string) {
  return clean(value)
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean);
}

function normalise(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.%/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenise(value: string) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for",
    "with", "from", "that", "this", "these", "those", "is", "are",
    "was", "were", "be", "been", "being", "it", "its", "as", "at",
    "by", "into", "than", "then", "now", "evidence", "data", "scene",
    "story", "shows", "show", "question", "answer", "system", "current",
    "draft", "items",
  ]);

  return normalise(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

function overlapScore(a: string, b: string) {
  const aa = new Set(tokenise(a));
  const bb = new Set(tokenise(b));

  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  aa.forEach((token) => {
    if (bb.has(token)) overlap += 1;
  });

  return overlap / Math.max(1, Math.min(aa.size, bb.size));
}

function semanticSimilarity(a: string, b: string) {
  const aa = new Set(tokenise(a));
  const bb = new Set(tokenise(b));

  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  aa.forEach((token) => {
    if (bb.has(token)) overlap += 1;
  });

  const union = new Set([...aa, ...bb]).size;
  return union ? overlap / union : 0;
}

function numericFingerprint(value: string) {
  return Array.from(
    new Set(clean(value).match(/\b\d+(?:\.\d+)?\b/g) || [])
  )
    .sort()
    .join("|");
}

function conceptKey(value: string) {
  const text = normalise(value);

  if (
    /follow .*(trigger|cause).*(outcome|damage)|follow .*mechanism|between .*trigger .*outcome|pathway/.test(
      text
    )
  ) {
    return "pathway";
  }

  if (
    /put .*measurements .*map|put .*evidence .*place|mapped observations|geographic context/.test(
      text
    )
  ) {
    return "map-transition";
  }

  if (
    /start with what can be measured|what can be measured|measure the trigger|measuring the trigger/.test(
      text
    )
  ) {
    return "measure-transition";
  }

  if (
    /does not prove|cannot establish|limitation|boundary|should not be read as evidence/.test(
      text
    )
  ) {
    return "trust-boundary";
  }

  if (
    /single cause|rather than one cause|rather than a single cause|system rather than/.test(
      text
    )
  ) {
    return "system-synthesis";
  }

  return "";
}

function extractWhyClause(value: string) {
  const text = clean(value);
  const index = text.toLowerCase().lastIndexOf("why ");
  if (index < 0) return "";
  return text.slice(index).replace(/[?.!]+$/, "");
}

export function resolvedNarrationQuestion(project: EpisodeProject) {
  const original = clean(project.episode.question);
  const title = clean(project.episode.workingTitle);

  const malformed =
    /forces behind\s+why\b/i.test(original) ||
    /how do the forces behind/i.test(original) ||
    /produce the outcome we see/i.test(original) ||
    /^what is really driving the hidden system behind why/i.test(original);

  if (original && !malformed) {
    return original.replace(/[?.!]+$/, "") + "?";
  }

  const whyClause =
    extractWhyClause(original) ||
    extractWhyClause(title);

  if (whyClause) {
    const pluralFloods = whyClause.match(/^why\s+(.+?)\s+floods$/i);
    if (pluralFloods) {
      return `Why does ${pluralFloods[1]} flood so often?`;
    }

    const singularFlood = whyClause.match(/^why\s+(.+?)\s+flood$/i);
    if (singularFlood) {
      return `Why does ${singularFlood[1]} flood so often?`;
    }

    return whyClause + "?";
  }

  if (original) {
    return original.replace(/[?.!]+$/, "") + "?";
  }

  if (title) {
    return `What is really driving ${title.replace(/[?.!]+$/, "")}?`;
  }

  return "";
}

function stripProductionLanguage(value: string) {
  return clean(value)
    .replace(/\b(?:the source is|source:)\s+[^.]+\.?/gi, " ")
    .replace(/\bthe source-backed observation is:\s*/gi, "")
    .replace(/\bthe current interpretation is:\s*/gi, "")
    .replace(/\bone limitation is explicit:\s*/gi, "")
    .replace(/\bthe story is built only from evidence[^.]*\.?/gi, " ")
    .replace(/\bthe evidence card remains visible[^.]*\.?/gi, " ")
    .replace(/\bthe analytical value of this scene[^.]*\.?/gi, " ")
    .replace(/\ba mechanism is convincing only when the arrows[^.]*\.?/gi, " ")
    .replace(/\bthe chart makes the comparison visible\.?/gi, " ")
    .replace(/\bthe point of the chart is not decoration\.?/gi, " ")
    .replace(/\blocation is not decoration here[^.]*\.?/gi, " ")
    .replace(/\bnumbers are most useful when they change the question[^.]*\.?/gi, " ")
    .replace(/\ba strong explanation has to move from the visible event[^.]*\.?/gi, " ")
    .replace(/\bcurrent story-grounded evidence[^.]*\.?/gi, " ")
    .replace(/\bstory-grounded evidence[^.]*\.?/gi, " ")
    .replace(/\b(?:figure|plate|table|map)\s+\d+(?:[-.:]\d+)*:\s*/gi, "")
    .replace(/^\s*[a-z]\)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeRawSource(value: string) {
  const text = clean(value);

  if (!text) return true;
  if (INTERNAL_METADATA.test(text)) return true;
  if (PRODUCTION_LANGUAGE.test(text)) return true;
  if (/^\s*[a-z]\)\s+/i.test(text)) return true;
  if (/^(?:figure|plate|table|map)\s+\d/i.test(text)) return true;
  if (/\bsource:\b/i.test(text)) return true;
  if (wordCount(text) > 42) return true;

  const awkward = [
    /this has built up by the fact that/i,
    /urban flooding is significantly differs/i,
    /another form of .* identified takes place when/i,
    /apart from the rising of/i,
    /on top of the storm/i,
    /secondly,\s*flooding has been seen over time as either/i,
  ];

  return awkward.some((pattern) => pattern.test(text));
}

function sameAsSceneLabel(scene: Scene, value: string) {
  const candidate = normalise(value);
  if (!candidate) return true;

  return (
    candidate === normalise(scene.headline) ||
    candidate === normalise(scene.eyebrow)
  );
}

function readableBody(scene: Scene) {
  const cleaned = stripProductionLanguage(scene.body);

  return splitSentences(cleaned)
    .filter((sentence) => !looksLikeRawSource(sentence))
    .filter((sentence) => !sameAsSceneLabel(scene, sentence))
    .filter((sentence) => wordCount(sentence) >= 5)
    .slice(0, 3)
    .join(" ");
}

function readableSourceExcerpt(scene: Scene) {
  const text = stripProductionLanguage(scene.sourceExcerpt || "");
  if (
    !text ||
    looksLikeRawSource(text) ||
    sameAsSceneLabel(scene, text)
  ) {
    return "";
  }
  return text;
}

function evidenceForScene(project: EpisodeProject, scene: Scene) {
  const ids = new Set(scene.factIds || []);
  return project.evidence.filter((item) => ids.has(item.id));
}

function readableEvidenceStatement(item: EvidenceItem) {
  const text = stripProductionLanguage(item.statement);

  if (
    !text ||
    text.length < 20 ||
    looksLikeRawSource(text)
  ) {
    return "";
  }

  return text;
}

function relatedEvidenceForScene(
  project: EpisodeProject,
  scene: Scene,
  usedEvidence: Set<string>,
  kind: "observation" | "limitation",
  limit: number
) {
  const sceneText =
    `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.sourceExcerpt || ""}`;

  const explicit = evidenceForScene(project, scene);
  const explicitIds = new Set(explicit.map((item) => item.id));

  const candidates = [
    ...explicit.map((item) => ({
      item,
      priority: 1000,
    })),
    ...project.evidence
      .filter((item) => !explicitIds.has(item.id))
      .map((item) => ({
        item,
        priority: overlapScore(sceneText, item.statement) * 100,
      }))
      .filter((row) => row.priority >= 24),
  ]
    .filter(({ item }) =>
      kind === "limitation"
        ? item.kind === "limitation"
        : item.kind !== "limitation"
    )
    .map(({ item, priority }) => ({
      item,
      priority,
      text: readableEvidenceStatement(item),
    }))
    .filter((row) => row.text)
    .filter((row) => !usedEvidence.has(normalise(row.text)))
    .sort((a, b) => {
      const observedA = a.item.kind === "observed" ? 12 : 0;
      const observedB = b.item.kind === "observed" ? 12 : 0;
      return b.priority + observedB - (a.priority + observedA);
    });

  const selected = candidates.slice(0, limit);

  selected.forEach((row) => {
    usedEvidence.add(normalise(row.text));
  });

  return selected.map((row) => row.text);
}

export function roleForScene(
  project: EpisodeProject,
  scene: Scene,
  index: number
): DocumentarySceneRole {
  const text =
    `${scene.eyebrow} ${scene.headline} ${scene.body}`.toLowerCase();

  if (index === 0) return "hook";
  if (scene.kind === "cta") return "closure";

  if (
    scene.chart ||
    scene.kind === "data_chart"
  ) {
    return "data";
  }

  /*
   * Geography should be evidence-native. Do not classify a sentence like
   * "The city changes where water can go" as geography merely because it
   * contains the word "where".
   */
  if (
    scene.map ||
    scene.kind === "map_story"
  ) {
    return "geography";
  }

  if (
    /trust boundary|limitation|uncertain|does not prove|still not prove|not establish|scope/.test(
      text
    ) ||
    scene.kind === "quote"
  ) {
    return "trust_boundary";
  }

  if (
    /governance|policy|maintenance|institution|response|management|planning|enforcement|regulation/.test(
      text
    )
  ) {
    return "governance";
  }

  if (
    /impact|consequence|people|community|household|worker|farmer|health|livelihood|loss|damage|exposure/.test(
      text
    )
  ) {
    return "consequence";
  }

  if (
    /mechanism|flow|path|process|driver|cause|chain|interaction|network|cycle|what happens after|turns it into|water can go|built surface|infiltration|runoff/.test(
      text
    ) ||
    scene.kind === "diagram" ||
    scene.kind === "timeline"
  ) {
    return "mechanism";
  }

  if (index >= Math.floor(project.scenes.length * 0.78)) {
    return "synthesis";
  }

  return "frame";
}

function roleWeight(role: DocumentarySceneRole) {
  const weights: Record<DocumentarySceneRole, number> = {
    hook: 0.95,
    frame: 0.9,
    data: 1.0,
    geography: 0.9,
    mechanism: 1.25,
    consequence: 1.0,
    governance: 1.1,
    trust_boundary: 0.85,
    synthesis: 1.05,
    closure: 0.45,
  };

  return weights[role];
}

export function documentaryWordsPerMinute(project: EpisodeProject) {
  if (
    project.episode.targetMinutes < 7 ||
    !LONG_FORM_MODES.has(project.episode.storyMode || "")
  ) {
    return 155;
  }

  return project.episode.targetMinutes >= 10 ? 142 : 145;
}

function targetWordCount(project: EpisodeProject) {
  const target = Math.round(
    project.episode.targetMinutes *
      documentaryWordsPerMinute(project)
  );

  return Math.max(850, Math.min(1800, target));
}

export function buildLongFormPlan(
  project: EpisodeProject
): LongFormPlan {
  const targetWords = targetWordCount(project);
  const wordsPerMinute = documentaryWordsPerMinute(project);

  const rows = project.scenes.map((scene, index) => ({
    sceneId: scene.id,
    role: roleForScene(project, scene, index),
  }));

  const totalWeight =
    rows.reduce(
      (sum, row) => sum + roleWeight(row.role),
      0
    ) || 1;

  const sceneTargets = rows.map((row) => {
    const raw = Math.round(
      targetWords * (roleWeight(row.role) / totalWeight)
    );

    const min =
      row.role === "closure"
        ? 35
        : row.role === "trust_boundary"
          ? 65
          : 80;

    const max =
      row.role === "hook"
        ? 125
        : row.role === "mechanism"
          ? 180
          : row.role === "governance"
            ? 165
            : row.role === "closure"
              ? 75
              : 150;

    return {
      sceneId: row.sceneId,
      role: row.role,
      targetWords: Math.max(min, Math.min(max, raw)),
    };
  });

  return {
    targetWords,
    wordsPerMinute,
    sceneTargets,
  };
}

function formatValue(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function chartFacts(scene: Scene) {
  const chart = scene.chart;
  if (!chart) return [];

  const data = chart.data.filter((item) =>
    Number.isFinite(item.value)
  );

  if (!data.length) return [];

  const unit = clean(chart.unit || chart.yLabel || "");
  const suffix = unit ? ` ${unit}` : "";

  if (chart.type === "line") {
    const ranked = [...data].sort((a, b) => b.value - a.value);
    const peak = ranked[0];
    const second = ranked[1];

    const intro =
      data.length >= 4
        ? "Across the plotted period, the pattern is uneven rather than a simple rise or fall."
        : "The measurements vary across the plotted period.";

    const detail = second
      ? `${peak.label} records the highest value at ${formatValue(
          peak.value
        )}${suffix}, followed by ${second.label} at ${formatValue(
          second.value
        )}${suffix}.`
      : `${peak.label} records the highest value at ${formatValue(
          peak.value
        )}${suffix}.`;

    return [intro, detail];
  }

  const ranked = [...data].sort((a, b) => b.value - a.value);
  const first = ranked[0];
  const second = ranked[1];

  if (!second) {
    return [
      `${first.label} records the highest plotted value at ${formatValue(
        first.value
      )}${suffix}.`,
    ];
  }

  return [
    `${first.label} records the highest plotted value at ${formatValue(
      first.value
    )}${suffix}, followed by ${second.label} at ${formatValue(
      second.value
    )}${suffix}.`,
  ];
}

function mapFacts(scene: Scene) {
  if (!scene.map) return [];

  const labels = scene.map.points
    .slice(0, 4)
    .map((point) => clean(point.label))
    .filter(Boolean);

  const count = scene.map.points.length;

  const placed = labels.length
    ? `The dataset places ${count} observations on the map, including ${labels.join(
        ", "
      )}.`
    : `The dataset places ${count} observations on the map.`;

  return [placed];
}

function purposeSentence(
  project: EpisodeProject,
  scene: Scene,
  role: DocumentarySceneRole
) {
  const body = readableBody(scene);

  switch (role) {
    case "hook": {
      const question = resolvedNarrationQuestion(project);
      return question
        ? `${question} Heavy rain may be part of the answer, but that explanation stops too early.`
        : "The visible event is easy to describe. The system behind it is harder to see.";
    }

    case "frame":
      return body;

    case "data":
      return "Start by measuring the trigger.";

    case "geography":
      return "Now put those measurements on the map.";

    case "mechanism":
      return "To understand the outcome, follow what happens after the trigger enters the system.";

    case "consequence":
      return "That pathway matters because its effects are experienced in real places and by real people.";

    case "governance":
      return "Infrastructure only works as a system when it is maintained, managed and matched to the pressures placed on it.";

    case "trust_boundary":
      return "This is where the evidence becomes narrower.";

    case "synthesis":
      return "Taken together, the evidence points to a chain of conditions rather than one simple cause.";

    default:
      return "";
  }
}

function analysisSentences(role: DocumentarySceneRole) {
  switch (role) {
    case "data":
      return [
        "The numbers establish magnitude and timing.",
        "They do not, by themselves, explain the mechanism that turns an event into damage.",
      ];

    case "geography":
      return [
        "Geography matters because measurements only describe the places where observations actually exist.",
        "A mapped point is evidence of an observation location, not proof that the same conditions apply everywhere around it.",
      ];

    case "mechanism":
      return [
        "The key is the pathway: conditions along the route can absorb, redirect, constrain or amplify the original trigger.",
        "That is why the same trigger can produce different outcomes across different parts of a city or landscape.",
      ];

    case "consequence":
      return [
        "That is where a physical process becomes a social and economic outcome.",
        "Exposure matters because the consequences depend not only on the hazard but also on who, what and which places sit in its path.",
      ];

    case "governance":
      return [
        "Capacity on paper and capacity in practice are not the same thing.",
        "Maintenance, blockage, enforcement and coordination can change how infrastructure performs when pressure rises.",
      ];

    case "trust_boundary":
      return [
        "That limit does not weaken the explanation; it defines how far the conclusion can responsibly travel.",
        "Local evidence can be strong without automatically becoming evidence for every other place.",
      ];

    case "synthesis":
      return [
        "The strongest explanation connects the trigger, the pathway, the conditions that amplify it and the places exposed to the result.",
        "The visible event is therefore the end of a chain, not the whole explanation.",
      ];

    default:
      return [];
  }
}

function paraphraseEvidence(
  text: string,
  role: DocumentarySceneRole,
  index: number
) {
  const statement = clean(text).replace(/[.?!]+$/, "");

  if (!statement) return "";

  if (role === "trust_boundary") {
    return index === 0
      ? `One important boundary is that ${lowerFirst(statement)}.`
      : `A second limitation is that ${lowerFirst(statement)}.`;
  }

  if (role === "data") {
    return index === 0
      ? `The supporting evidence also shows that ${lowerFirst(statement)}.`
      : `Another measured observation is that ${lowerFirst(statement)}.`;
  }

  if (role === "mechanism") {
    return index === 0
      ? `At this point in the pathway, the evidence indicates that ${lowerFirst(statement)}.`
      : `A related mechanism is that ${lowerFirst(statement)}.`;
  }

  if (role === "governance") {
    return index === 0
      ? `The local evidence adds another layer: ${lowerFirst(statement)}.`
      : `It also indicates that ${lowerFirst(statement)}.`;
  }

  return index === 0
    ? `The evidence indicates that ${lowerFirst(statement)}.`
    : `A related observation is that ${lowerFirst(statement)}.`;
}

function selectUnique(
  candidates: string[],
  scene: Scene,
  globalSentences: string[],
  globalConcepts: Set<string>,
  globalNumbers: Set<string>
) {
  const accepted: string[] = [];

  for (const candidate of candidates.flatMap(splitSentences)) {
    const text = clean(candidate);

    if (
      !text ||
      looksLikeRawSource(text) ||
      sameAsSceneLabel(scene, text)
    ) {
      continue;
    }

    const concept = conceptKey(text);
    if (concept && globalConcepts.has(concept)) {
      continue;
    }

    const duplicate = [...globalSentences, ...accepted].some(
      (existing) => {
        const score = semanticSimilarity(existing, text);
        const shorter = Math.min(
          wordCount(existing),
          wordCount(text)
        );

        return score >= (shorter <= 12 ? 0.42 : 0.52);
      }
    );

    if (duplicate) continue;

    const numeric = numericFingerprint(text);
    if (numeric && globalNumbers.has(numeric)) {
      continue;
    }

    accepted.push(text);

    if (concept) {
      globalConcepts.add(concept);
    }

    if (numeric) {
      globalNumbers.add(numeric);
    }
  }

  globalSentences.push(...accepted);
  return accepted;
}

function trimToWords(value: string, maxWords: number) {
  const parts = splitSentences(value);
  const kept: string[] = [];
  let count = 0;

  for (const sentence of parts) {
    const length = wordCount(sentence);

    if (kept.length && count + length > maxWords) break;

    if (!kept.length && length > maxWords) {
      return clean(sentence)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, maxWords)
        .join(" ")
        .replace(/[,;:]?$/, ".")
        .trim();
    }

    kept.push(sentence);
    count += length;
  }

  return clean(kept.join(" "));
}

function composeScene(
  project: EpisodeProject,
  scene: Scene,
  role: DocumentarySceneRole,
  targetWords: number,
  usedEvidence: Set<string>,
  globalSentences: string[],
  globalConcepts: Set<string>,
  globalNumbers: Set<string>
) {
  const body = readableBody(scene);
  const excerpt = readableSourceExcerpt(scene);

  const evidenceKind =
    role === "trust_boundary"
      ? "limitation"
      : "observation";

  const evidenceLimit =
    role === "mechanism" || role === "governance"
      ? 5
      : role === "trust_boundary"
        ? 4
        : 3;

  const evidence = relatedEvidenceForScene(
    project,
    scene,
    usedEvidence,
    evidenceKind,
    evidenceLimit
  );

  const evidenceSentences = evidence.map((item, index) =>
    paraphraseEvidence(item, role, index)
  );

  let candidates: string[] = [];

  if (role === "hook") {
    candidates = [
      purposeSentence(project, scene, role),
      "The better question is what happens between the trigger and the visible outcome.",
      body,
      excerpt,
      ...evidenceSentences,
      "To answer that, the story has to move through measurements, place, physical pathways, infrastructure and the limits of the available evidence.",
    ];
  } else if (role === "data") {
    candidates = [
      purposeSentence(project, scene, role),
      ...chartFacts(scene),
      ...evidenceSentences,
      ...analysisSentences(role),
    ];
  } else if (role === "geography") {
    candidates = [
      purposeSentence(project, scene, role),
      ...mapFacts(scene),
      ...evidenceSentences,
      ...analysisSentences(role),
    ];
  } else if (role === "trust_boundary") {
    candidates = [
      purposeSentence(project, scene, role),
      ...evidenceSentences,
      excerpt,
      body,
      ...analysisSentences(role),
    ];
  } else if (role === "closure") {
    candidates = [];
  } else {
    candidates = [
      purposeSentence(project, scene, role),
      body,
      excerpt,
      ...evidenceSentences,
      ...analysisSentences(role),
    ];
  }

  const selected = selectUnique(
    candidates.filter(Boolean),
    scene,
    globalSentences,
    globalConcepts,
    globalNumbers
  );

  return trimToWords(
    selected.join(" "),
    Math.max(55, Math.round(targetWords * 1.08))
  );
}

function currentWordCount(scenes: Scene[]) {
  return scenes.reduce(
    (sum, scene) => sum + wordCount(scene.narration),
    0
  );
}

function unusedEvidenceExpansion(
  project: EpisodeProject,
  scenes: Scene[],
  plan: LongFormPlan,
  usedEvidence: Set<string>,
  globalSentences: string[],
  globalConcepts: Set<string>,
  globalNumbers: Set<string>
) {
  const targetById = new Map(
    plan.sceneTargets.map((row) => [row.sceneId, row])
  );

  const next = scenes.map((scene) => ({ ...scene }));
  let total = currentWordCount(next);

  if (total >= plan.targetWords * 0.9) {
    return next;
  }

  for (let index = 0; index < next.length; index += 1) {
    if (total >= plan.targetWords * 0.95) break;

    const scene = next[index];
    const target = targetById.get(scene.id);

    if (!target || target.role === "closure") continue;

    const deficit =
      target.targetWords - wordCount(scene.narration);

    if (deficit < 18) continue;

    const kind =
      target.role === "trust_boundary"
        ? "limitation"
        : "observation";

    const extraEvidence = relatedEvidenceForScene(
      project,
      scene,
      usedEvidence,
      kind,
      4
    );

    const extras = selectUnique(
      extraEvidence.map((item, evidenceIndex) =>
        paraphraseEvidence(item, target.role, evidenceIndex + 3)
      ),
      scene,
      globalSentences,
      globalConcepts,
      globalNumbers
    );

    if (!extras.length) continue;

    const extraText = trimToWords(
      extras.join(" "),
      Math.min(85, Math.max(25, deficit))
    );

    if (!extraText) continue;

    scene.narration = clean(
      `${scene.narration} ${extraText}`
    );

    total = currentWordCount(next);
  }

  return next;
}

export function buildGenericLongFormNarration(
  project: EpisodeProject,
  _datasetsOverride?: DatasetAnalysis[]
) {
  const isLongForm =
    project.episode.targetMinutes >= 7 &&
    LONG_FORM_MODES.has(project.episode.storyMode || "");

  if (!isLongForm) {
    return project.scenes.map((scene, index) => {
      const role = roleForScene(project, scene, index);
      const body = readableBody(scene);

      return {
        ...scene,
        narration:
          purposeSentence(project, scene, role) ||
          body ||
          "",
      };
    });
  }

  const plan = buildLongFormPlan(project);

  const targetById = new Map(
    plan.sceneTargets.map((row) => [row.sceneId, row])
  );

  const usedEvidence = new Set<string>();
  const globalSentences: string[] = [];
  const globalConcepts = new Set<string>();
  const globalNumbers = new Set<string>();

  const firstPass = project.scenes.map((scene) => {
    const target = targetById.get(scene.id);

    if (!target) {
      return {
        ...scene,
        narration: readableBody(scene),
      };
    }

    const narration = composeScene(
      project,
      scene,
      target.role,
      target.targetWords,
      usedEvidence,
      globalSentences,
      globalConcepts,
      globalNumbers
    );

    return {
      ...scene,
      narration,
    };
  });

  return unusedEvidenceExpansion(
    project,
    firstPass,
    plan,
    usedEvidence,
    globalSentences,
    globalConcepts,
    globalNumbers
  );
}
