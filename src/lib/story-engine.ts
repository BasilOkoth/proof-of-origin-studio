import { buildEpisode } from "./generator";
import { analyzeRetention } from "./retention";
import { getStoryPack } from "./story-packs";
import { refreshVisualIntelligence } from "./visual-reasoning";
import type {
  EpisodeProject,
  EvidenceItem,
  Scene,
  StoryMode,
  ThumbnailConcept,
} from "./types";

export type StoryIntake = {
  mode: StoryMode;
  channelName: string;
  byline: string;
  topic: string;
  question: string;
  experiment: string;
  audience: string;
  targetMinutes: number;
  evidence: EvidenceItem[];
};

const clean = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const STORY_STOP = new Set([
  "about",
  "after",
  "also",
  "among",
  "and",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "can",
  "could",
  "did",
  "does",
  "during",
  "for",
  "from",
  "have",
  "how",
  "into",
  "more",
  "most",
  "not",
  "that",
  "the",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "very",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
  "than",
  "then",
  "such",
  "only",
  "over",
]);

const FLOOD_MECHANISM =
  /\b(drainage|stormwater|runoff|riparian|floodplain|encroach(?:ment|ed|ing)?|impervious|permeab(?:le|ility)|infiltrat(?:e|ion)|blocked drains?|waterways?|waste accumulation|garbage|culvert|sewer|channel|river|urban(?:ization|isation| growth)?|land[- ]use|settlement planning|informal settlement|maintenance|rainfall|heavy rain|multi-day rain|flood(?:s|ing|ed)?)\b/i;

const STALE_HAZARD_NOISE =
  /\b(earthquake|volcano|volcanic|landslide|drought|agricultural income|crop loss|seismic)\b/i;


const EXTRACTION_NOISE =
  /(?:^|\s)(?:\d{1,3}\s+)?(?:\d+(?:\.\d+)+\s+)?(?:chapter\s+\w+|table of contents|list of (?:figures|tables|plates|charts)|references|appendix|appendices)\b|\.{4,}/i;

const SECTION_HEADING_FRAGMENT =
  /^(?:\d{1,3}\s+)?(?:\d+(?:\.\d+)+\s+)?[A-Z][A-Za-z &/,-]{3,90}(?:\.{3,}|$)/;

const COMPARATOR_GEOGRAPHY =
  /\b(delhi|india|bangladesh|germany|mississippi|budalangi|river nzoia|nyando|bangalore|bengaluru|mumbai|jakarta|london|new york|china|pakistan)\b/i;


const VISUAL_CAPTION =
  /^(?:\d{1,3}\s+)?(?:plate|figure|fig\.?|map|chart|table|photo(?:graph)?)\s*\d*(?:[-.:]\d+)*\s*[:.\-]?/i;

const TRUE_LIMITATION =
  /\b(case study|single (?:case|site|neighbou?rhood)|scope|sample|sampling|generaliz(?:e|ed|ability)|generalis(?:e|ed|ability)|cannot establish|cannot determine|could not determine|not measured|not assessed|not evaluated|data gap|limited data|limited evidence|validation data|uncertain(?:ty)?|further study|further research|future research)\b/i;

const RAINFALL_SPECIFIC =
  /\b(multi-day|daily rainfall|monthly rainfall|rainfall totals?|rainfall event|rainfall episode|precipitation|wettest|rain intensity|rainfall intensity|heavy rainfall|heavy rain|long rains|short rains|millimet(?:er|re)s?|mm\b)\b/i;

function isVisualCaption(value: string) {
  return VISUAL_CAPTION.test(cleanEvidenceStatement(value));
}

function isNarrationSafeEvidence(value: string) {
  const statement = cleanEvidenceStatement(value);
  if (!statement) return false;
  if (looksLikeExtractionNoise(statement)) return false;
  if (isVisualCaption(statement)) return false;
  return statement.length >= 45;
}

function provenanceTail(item?: EvidenceItem) {
  const label = sourceLabel(item);
  return label ? ` Source: ${label}.` : "";
}

function narrationSafeClaim(
  item: EvidenceItem | undefined,
  role: "hook" | "trigger" | "drainage" | "land" | "governance"
) {
  if (!item) return "";
  const s = cleanEvidenceStatement(item.statement || "");

  if (role === "trigger") {
    if (!RAINFALL_SPECIFIC.test(s)) return "";
    if (/\bmulti-day\b/i.test(s)) {
      return "The rainfall evidence points to multi-day heavy-rain episodes, not simply a single dramatic downpour.";
    }
    if (/\bwettest|monthly rainfall|rainfall totals?\b/i.test(s)) {
      return "The rainfall evidence shows unusually high rainfall totals during the flood-producing period.";
    }
    return "The rainfall evidence identifies heavy or intense rainfall as the immediate trigger.";
  }

  if (role === "drainage") {
    const parts: string[] = [];
    if (/\b(blocked|clogged|waste|garbage|debris)\b/i.test(s)) {
      parts.push("blocked or debris-filled drainage can reduce the space available for stormwater to move");
    }
    if (/\b(capacity|overflow|exceed)\b/i.test(s)) {
      parts.push("drainage capacity can be exceeded when incoming flow is greater than the system can carry");
    }
    if (/\b(culvert|channel|waterway|drainage course|drainage route)\b/i.test(s)) {
      parts.push("altered channels, culverts or drainage routes can constrain the path water takes through the city");
    }
    if (parts.length) {
      return `Local evidence indicates that ${parts.join("; and ")}.`;
    }
    return "Local evidence identifies drainage and stormwater pathways as part of the flood mechanism.";
  }

  if (role === "land") {
    const parts: string[] = [];
    if (/\b(paved|pavement|impervious|roof|built[- ]?up|buildings?)\b/i.test(s)) {
      parts.push("more built and paved surfaces leave less open ground for water to enter the soil");
    }
    if (/\b(infiltrat|absorption)\b/i.test(s)) {
      parts.push("reduced infiltration means a larger share of rainfall remains at the surface");
    }
    if (/\b(runoff|flood peaks?)\b/i.test(s)) {
      parts.push("that can increase surface runoff and the volume the drainage network must handle");
    }
    if (/\b(natural drainage|channel|waterway|land[- ]use|development)\b/i.test(s)) {
      parts.push("development can also alter natural drainage routes");
    }
    if (parts.length) {
      return `The local evidence describes a land-and-water mechanism: ${parts.join("; ")}.`;
    }
    return "The local evidence shows that urban form can change how rainfall becomes runoff and where that runoff can go.";
  }

  if (role === "governance") {
    const parts: string[] = [];
    if (/\b(clear|clearing|unclog|clean|garbage|maintenance)\b/i.test(s)) {
      parts.push("drains require clearing and maintenance to preserve usable capacity");
    }
    if (/\b(development control|enforcement|by-?law|planning)\b/i.test(s)) {
      parts.push("development control and planning affect whether new construction adds pressure to vulnerable flow paths");
    }
    if (/\b(coordination|county|institution|response|budget|politic)\b/i.test(s)) {
      parts.push("institutional coordination shapes whether known risks are addressed before or only after flooding");
    }
    if (parts.length) {
      return `The governance evidence adds another layer: ${parts.join("; and ")}.`;
    }
    return "The evidence indicates that maintenance and institutional response are part of the urban flood system.";
  }

  // hook
  if (/\b(infiltrat|absorption|runoff|paved|urbanization|urbanisation|built[- ]?up)\b/i.test(s)) {
    return "Local Nairobi evidence shows that the city itself changes the journey of rainwater: built surfaces reduce infiltration and increase runoff.";
  }
  if (/\b(drainage|channel|waterway|culvert)\b/i.test(s)) {
    return "Local Nairobi evidence points to a second part of the story beyond rainfall: the routes that carry water through the city.";
  }
  return "Local evidence shows that Nairobi flooding is shaped by more than rainfall alone.";
}

function cleanEvidenceStatement(value: string) {
  let result = clean(value)
    .replace(/^\s*\d{1,3}\s+(?=[A-Z])/g, "")
    .replace(/^\s*\d+(?:\.\d+){1,4}\s+/g, "")
    .replace(/\s*\.{4,}\s*/g, " ")
    .replace(/\s+\d{1,3}\s*$/g, "")
    .trim();

  // OCR/text extractors sometimes leave bare page numbers in front of prose.
  result = result.replace(/^\d{1,3}\s+(?=[A-Z][a-z])/g, "").trim();

  return result;
}

function looksLikeExtractionNoise(value: string) {
  const statement = clean(value);
  if (!statement) return true;
  if (EXTRACTION_NOISE.test(statement)) return true;
  if (SECTION_HEADING_FRAGMENT.test(statement) && statement.length < 150) return true;
  if (/^(?:page\s*)?\d{1,3}$/i.test(statement)) return true;
  if (/^\d{1,3}\s+\d+(?:\.\d+)+\s+/.test(statement)) return true;
  return false;
}

function topicLocalityScore(anchor: string, statement: string) {
  let score = 0;
  const wantsNairobi = /\bnairobi\b/i.test(anchor);

  if (wantsNairobi) {
    if (/\bnairobi\b/i.test(statement)) score += 40;
    if (/\bsouth\s+c\b/i.test(statement)) score += 34;

    // A source can be Nairobi-specific while quoting international literature.
    // Do not let those comparator examples become core local story scenes.
    if (
      COMPARATOR_GEOGRAPHY.test(statement) &&
      !/\bnairobi\b|\bsouth\s+c\b/i.test(statement)
    ) {
      score -= 55;
    }
  }

  return score;
}

function evidenceQualityScore(item: EvidenceItem, anchor: string) {
  const statement = cleanEvidenceStatement(item.statement || "");
  if (!statement || looksLikeExtractionNoise(statement)) return -1000;

  let score = topicLocalityScore(anchor, statement);

  if (item.kind === "observed") score += 16;
  if (item.source || item.sourceLabel) score += 8;
  if (statement.length >= 70 && statement.length <= 380) score += 8;
  if (FLOOD_MECHANISM.test(statement)) score += 14;

  if (/^\d/.test(statement)) score -= 8;
  if (/\baccording to\b/i.test(statement) && COMPARATOR_GEOGRAPHY.test(statement)) score -= 20;

  return score;
}

function normalizeToken(token: string) {
  let value = token
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

  if (/^flood(?:s|ed|ing)?$/.test(value)) return "flood";
  if (/^drain(?:s|ed|ing|age)?$/.test(value)) return "drain";
  if (/^rain(?:s|ed|ing|fall)?$/.test(value)) return "rain";
  if (/^river(?:s)?$/.test(value)) return "river";
  if (/^urbaniz(?:e|ed|ing|ation)$/.test(value)) return "urban";
  if (/^urbanis(?:e|ed|ing|ation)$/.test(value)) return "urban";

  if (value.length > 6 && value.endsWith("ing")) {
    value = value.slice(0, -3);
  } else if (value.length > 5 && value.endsWith("ed")) {
    value = value.slice(0, -2);
  } else if (value.length > 4 && value.endsWith("s")) {
    value = value.slice(0, -1);
  }

  return value;
}

function storyTokens(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter(
      (token) =>
        token.length >= 3 &&
        !STORY_STOP.has(token)
    );
}

function overlapScore(a: string, b: string) {
  const left = new Set(storyTokens(a));
  const right = new Set(storyTokens(b));

  if (!left.size || !right.size) return 0;

  let overlap = 0;

  left.forEach((token) => {
    if (right.has(token)) overlap += 1;
  });

  return overlap / Math.max(1, Math.min(left.size, right.size));
}

function storyLockedEvidence(
  intake: StoryIntake
) {
  const anchor = clean(
    `${intake.topic} ${intake.question}`
  );

  const topicMentionsFlood =
    /\bflood/i.test(anchor);

  const scored = intake.evidence
    .map((item) => ({
      ...item,
      statement: cleanEvidenceStatement(item.statement || ""),
    }))
    .filter(
      (item) =>
        clean(item.statement || "") &&
        !looksLikeExtractionNoise(item.statement)
    )
    .map((item, index) => {
      const statement = cleanEvidenceStatement(item.statement);
      const sourceText = clean(
        `${item.sourceLabel || ""} ${item.source || ""}`
      );

      const lexical = Math.max(
        overlapScore(anchor, statement),
        overlapScore(anchor, sourceText)
      );

      const mechanism =
        FLOOD_MECHANISM.test(statement) ||
        FLOOD_MECHANISM.test(sourceText);

      const staleHazard =
        topicMentionsFlood &&
        STALE_HAZARD_NOISE.test(statement) &&
        !/\bflood/i.test(statement);

      let score =
        lexical * 100 +
        evidenceQualityScore(item, anchor);

      if (mechanism) score += 28;
      if (item.kind === "observed") score += 8;
      if (item.source || item.sourceLabel) score += 7;
      if (/\bnairobi\b/i.test(anchor) &&
          /\bnairobi\b/i.test(
            `${statement} ${sourceText}`
          )) {
        score += 22;
      }

      if (staleHazard) score -= 90;

      return {
        item,
        index,
        score,
        staleHazard,
      };
    })
    .filter(
      (entry) =>
        !entry.staleHazard &&
        entry.score >= 34
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.index - b.index
    );

  const seen = new Set<string>();

  return scored
    .map((entry) => entry.item)
    .filter((item) => {
      const key = clean(item.statement)
        .toLowerCase();

      if (!key || seen.has(key)) return false;

      seen.add(key);
      return true;
    });
}

function durationPlan(totalSec: number) {
  const weights = [
    0.08,
    0.12,
    0.14,
    0.14,
    0.15,
    0.13,
    0.11,
    0.13,
  ];

  return weights.map((weight) =>
    Math.max(
      6,
      Math.round(totalSec * weight)
    )
  );
}

function sourceLabel(item?: EvidenceItem) {
  if (!item) return "";

  const label = clean(
    item.sourceLabel ||
      item.source ||
      ""
  );

  if (!label) return "";

  if (label.startsWith("library:")) {
    return "";
  }

  return label;
}

function evidenceText(item?: EvidenceItem) {
  if (!item) {
    return "No sufficiently story-grounded supporting evidence has been added yet.";
  }

  const statement = clean(item.statement);

  if (!statement) {
    return "An evidence item is present but has not been described yet.";
  }

  const label = sourceLabel(item);

  return label
    ? `${statement} Source: ${label}.`
    : statement;
}

function scene(
  kind: Scene["kind"],
  durationSec: number,
  eyebrow: string,
  headline: string,
  body: string,
  narration: string,
  factIds: string[] = [],
  extra: Partial<Scene> = {}
): Scene {
  return {
    id: crypto.randomUUID(),
    kind,
    durationSec,
    eyebrow,
    headline,
    body,
    narration,
    factIds,
    ...extra,
  };
}

function questionTitle(question: string) {
  const value = clean(question);

  if (!value) {
    return "What Does the Evidence Actually Show?";
  }

  return value.endsWith("?")
    ? value
    : `${value}?`;
}

function bestEvidenceBy(
  evidence: EvidenceItem[],
  pattern: RegExp,
  kinds: EvidenceItem["kind"][] = [
    "observed",
    "inference",
  ],
  options?: {
    anchor?: string;
    prefer?: RegExp;
    avoid?: RegExp;
    excludeIds?: string[];
  }
) {
  const anchor = options?.anchor || "";
  const excluded = new Set(options?.excludeIds || []);

  return evidence
    .filter(
      (item) =>
        !excluded.has(item.id) &&
        kinds.includes(item.kind) &&
        pattern.test(
          `${item.statement} ${item.sourceLabel || ""}`
        ) &&
        !looksLikeExtractionNoise(item.statement) &&
        !isVisualCaption(item.statement) &&
        isNarrationSafeEvidence(item.statement)
    )
    .map((item, index) => {
      const statement = cleanEvidenceStatement(item.statement);
      let score = evidenceQualityScore(item, anchor);

      if (options?.prefer?.test(statement)) score += 40;
      if (options?.avoid?.test(statement)) score -= 35;

      return { item, score, index };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.index - b.index
    )[0]?.item;
}

function uniqueEvidencePick(
  candidates: Array<
    EvidenceItem | undefined
  >
) {
  const seen = new Set<string>();

  return candidates.filter(
    (
      item
    ): item is EvidenceItem => {
      if (!item) return false;

      const key = clean(
        item.statement
      ).toLowerCase();

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );
}

function buildWorldExplainedEpisode(
  intake: StoryIntake,
  evidence: EvidenceItem[]
): EpisodeProject {
  const pack = getStoryPack(intake.mode);

  const observed = evidence.filter(
    (item) =>
      item.kind === "observed" &&
      clean(item.statement)
  );

  const inferences = evidence.filter(
    (item) =>
      item.kind === "inference" &&
      clean(item.statement)
  );

  const limitations = evidence.filter(
    (item) =>
      item.kind === "limitation" &&
      clean(item.statement)
  );

  const anchor = `${intake.topic} ${intake.question}`;

  const triggerCandidate = bestEvidenceBy(
    evidence,
    /\b(rainfall|heavy rain|multi-day rain|precipitation|storm|wettest|rainy season|rain intensity|rainfall intensity)\b/i,
    ["observed", "inference"],
    {
      anchor,
      prefer: RAINFALL_SPECIFIC,
      avoid:
        /\b(urbanization|urbanisation|impervious|pavement|drainage|waste|garbage|development|capacity)\b/i,
    }
  );

  /*
   * Scene 03 is a strict evidence role. A generic sentence that merely
   * mentions "storm" or "climate change" is not enough. If a separately
   * useful rainfall statement is absent, the story must show the gap.
   */
  const trigger =
    triggerCandidate &&
    RAINFALL_SPECIFIC.test(triggerCandidate.statement) &&
    !/\b(drainage capacity|urbanization|urbanisation|impervious|pavement|waste|garbage)\b/i.test(
      triggerCandidate.statement
    )
      ? triggerCandidate
      : undefined;

  const drainage = bestEvidenceBy(
    evidence,
    /\b(drainage|stormwater|blocked drains?|waterways?|culvert|sewer|garbage|waste|channel capacity)\b/i,
    ["observed", "inference"],
    {
      anchor,
      prefer:
        /\b(blocked|clogged|capacity|maintenance|waste|garbage|overflow|free flow)\b/i,
      excludeIds: trigger ? [trigger.id] : [],
    }
  );

  const landSystem = bestEvidenceBy(
    evidence,
    /\b(riparian|floodplain|urban(?:ization|isation)?|settlement planning|informal settlement|impervious|permeab|infiltrat|land[- ]use|runoff|built[- ]?up|paved|densification)\b/i,
    ["observed", "inference"],
    {
      anchor,
      prefer:
        /\b(nairobi|south c|impervious|infiltration|built[- ]?up|paved|densification|runoff|land use)\b/i,
      avoid: COMPARATOR_GEOGRAPHY,
      excludeIds: [
        ...(trigger ? [trigger.id] : []),
        ...(drainage ? [drainage.id] : []),
      ],
    }
  );

  const governance = bestEvidenceBy(
    evidence,
    /\b(governance|maintenance|response|politic|budget|coordination|planning|county|institution|development control|by-?law|enforcement)\b/i,
    ["observed", "inference"],
    {
      anchor,
      prefer:
        /\b(nairobi|south c|county|maintenance|development control|enforcement|coordination|response)\b/i,
      avoid: COMPARATOR_GEOGRAPHY,
      excludeIds: [
        ...(trigger ? [trigger.id] : []),
        ...(drainage ? [drainage.id] : []),
        ...(landSystem ? [landSystem.id] : []),
      ],
    }
  );

  const picked = uniqueEvidencePick([
    trigger,
    drainage,
    landSystem,
    governance,
    ...observed,
    ...inferences,
  ]);

  const primary =
    bestEvidenceBy(
      evidence,
      /\b(flood|flooding|runoff|drainage|infiltration|urbanization|urbanisation|built[- ]?up)\b/i,
      ["observed", "inference"],
      {
        anchor,
        prefer:
          /\b(nairobi|south c|runoff|drainage|infiltration|built[- ]?up)\b/i,
        avoid: COMPARATOR_GEOGRAPHY,
      }
    ) ||
    picked[0] ||
    observed[0] ||
    evidence[0];

  const triggerItem =
    trigger;

  const drainageItem =
    drainage ||
    picked[2] ||
    observed[2] ||
    primary;

  const landItem =
    landSystem ||
    picked[3] ||
    inferences[0] ||
    primary;

  const governanceItem =
    governance ||
    picked[4] ||
    observed[3] ||
    inferences[1] ||
    primary;

  const limitation =
    limitations
      .filter((item) => {
        const statement = cleanEvidenceStatement(item.statement || "");
        if (!isNarrationSafeEvidence(statement)) return false;
        if (!TRUE_LIMITATION.test(statement)) return false;

        // A causal mechanism is not a trust boundary merely because the
        // extractor labelled it "limitation".
        const causalMechanism =
          /\b(runoff|infiltrat|drainage|waterway|channel|pavement|impervious|development|capacity|flood hazard|stormwater)\b/i.test(
            statement
          ) &&
          !/\b(scope|case study|sample|generaliz|generalis|not measured|not assessed|cannot establish|limited evidence|data gap|uncertain)/i.test(
            statement
          );

        return !causalMechanism;
      })
      .sort(
        (a, b) =>
          evidenceQualityScore(b, anchor) -
          evidenceQualityScore(a, anchor)
      )[0];

  const totalSec = Math.round(
    Math.max(
      1,
      intake.targetMinutes
    ) * 60
  );

  const d = durationPlan(totalSec);

  const question =
    clean(intake.question) ||
    pack.questionPlaceholder;

  const topic =
    clean(intake.topic) ||
    pack.label;

  const primaryText =
    evidenceText(primary);

  const triggerText =
    trigger ? evidenceText(trigger) : "";

  const drainageText =
    evidenceText(drainageItem);

  const landText =
    evidenceText(landItem);

  const governanceText =
    evidenceText(governanceItem);

  const hookNarrationClaim =
    narrationSafeClaim(primary, "hook");

  const triggerNarrationClaim =
    narrationSafeClaim(trigger, "trigger");

  const drainageNarrationClaim =
    narrationSafeClaim(drainageItem, "drainage");

  const landNarrationClaim =
    narrationSafeClaim(landItem, "land");

  const governanceNarrationClaim =
    narrationSafeClaim(governanceItem, "governance");

  const hasSouthCEvidence =
    /\bnairobi\b/i.test(anchor) &&
    /\bsouth\s+c\b/i.test(
      evidence
        .map((item) => `${item.sourceLabel || ""} ${item.statement}`)
        .join(" ")
    );

  const limitationText = hasSouthCEvidence
    ? "The strongest detailed mechanism evidence in this draft comes from a South C case study. That makes it valuable local evidence, but it does not establish that exactly the same combination of drivers explains flooding across every part of Nairobi."
    : limitation
      ? evidenceText(limitation)
      : "The current evidence does not yet establish every link in the causal chain. Missing mechanism evidence should remain visible rather than being filled with assumptions.";

  const evidenceCount =
    evidence.length;

  const sourceBackedCount =
    evidence.filter(
      (item) =>
        item.source ||
        item.sourceLabel
    ).length;

  const weakGrounding =
    evidenceCount < 3 ||
    sourceBackedCount < 2;

  const groundingNote = weakGrounding
    ? "This is a draft evidence map: the current story-grounded evidence is still thin, so unsupported causal links remain questions rather than conclusions."
    : "The story is built only from evidence that still matches the active topic and question.";

  const scenes: Scene[] = [
    scene(
      "hook",
      d[0],
      pack.accentLabel,
      question,
      primaryText,
      `When heavy rain hits Nairobi, water does not become a disaster everywhere in the same way. ${hookNarrationClaim} So the useful question is not simply whether it rained. It is what happens to that water after it lands on the city.`,
      primary ? [primary.id] : []
    ),

    scene(
      "document",
      d[1],
      "THE SYSTEM",
      "Rain is the trigger. What turns it into a disaster?",
      groundingNote,
      `Heavy rain can trigger flooding, but the episode will test a deeper systems question: what happens between rainfall, the city's drainage and waterways, the way land is built on, and the institutions responsible for maintaining that system? ${groundingNote}`,
      [],
      {
        visualLabels: [
          "Rainfall",
          "Runoff",
          "Drainage",
          "Rivers",
          "Urban form",
          "Exposure",
        ],
      }
    ),

    scene(
      "proof_card",
      d[2],
      "TRIGGER",
      "Start with the rain — but do not stop there.",
      trigger
        ? triggerText
        : "Rainfall-specific evidence gap: no sufficiently strong, separately grounded rainfall measurement or event description is currently ingested for this story.",
      trigger
        ? `First, the trigger. ${triggerNarrationClaim} But rainfall alone does not explain why damage concentrates in particular streets and neighbourhoods.`
        : `Heavy rainfall is the trigger we still need to establish with stronger evidence. The current local sources explain important urban mechanisms, but they do not provide a sufficiently clean, rainfall-specific measurement for this scene. That gap stays visible rather than being filled with a weaker proxy claim.`,
      trigger ? [trigger.id] : []
    ),

    scene(
      "diagram",
      d[3],
      "FLOW PATH",
      "What happens after water hits the city?",
      drainageText,
      `Now follow the water. ${drainageNarrationClaim} That turns the story from a weather question into a flow-path question: how much water arrives, where it can move, and where capacity or obstruction causes it to back up. The evidence card remains visible so the viewer can inspect the source behind the claim.`,
      drainageItem ? [drainageItem.id] : [],
      {
        visualLabels: [
          "Rain",
          "Surface runoff",
          "Drain",
          "Blockage / capacity",
          "River",
          "Flooded street",
        ],
      }
    ),

    scene(
      "proof_card",
      d[4],
      "URBAN FORM",
      "The city changes where water can go.",
      landText,
      `The city also changes the surface the rain lands on. ${landNarrationClaim} The point is not that every building or paved surface causes flooding. It is that urban form changes both how much water stays on the surface and the routes available for moving it away.`,
      landItem ? [landItem.id] : []
    ),

    scene(
      "timeline",
      d[5],
      "MAINTENANCE & RESPONSE",
      "Infrastructure is a system only if it is maintained.",
      governanceText,
      `Drainage capacity is not fixed once concrete is poured. ${governanceNarrationClaim} This is why flooding is also an institutional story: the physical network and the way it is maintained, protected and managed operate as one system.`,
      governanceItem ? [governanceItem.id] : [],
      {
        visualLabels: [
          "Before rain",
          "Maintenance",
          "Forecast",
          "Storm",
          "Response",
          "Aftermath",
        ],
      }
    ),

    scene(
      "quote",
      d[6],
      "TRUST BOUNDARY",
      "What does the evidence still not prove?",
      limitationText,
      `This is where the evidence stops. ${limitationText} That boundary belongs in the final video, because a Nairobi-wide conclusion needs evidence that is wider than one neighbourhood or one type of source.`,
      limitation ? [limitation.id] : []
    ),

    scene(
      "cta",
      d[7],
      "THE TAKEAWAY",
      "Flooding is an event. Flood risk is a system.",
      `Current story-grounded evidence: ${evidenceCount} items, ${sourceBackedCount} source-linked.`,
      `The strongest responsible conclusion is a systems one: rainfall is a trigger, while the scale and location of damage depend on how water moves through the urban system and how exposure and infrastructure are managed. Where the evidence is still incomplete, that gap becomes the next research task—not a sentence invented for the video.`,
      []
    ),
  ];

  const purposes = [
    "Open on the active question and strongest story-grounded evidence.",
    "Frame the causal system without narrating the user's production brief.",
    "Establish rainfall as trigger rather than complete explanation.",
    "Trace a visible mechanism from rainfall to drainage and flooding.",
    "Explain how urban form can alter exposure and water movement.",
    "Add maintenance, governance and response as a separate system layer.",
    "Keep missing evidence and uncertainty visible.",
    "Resolve the systems question without overclaiming.",
  ];

  scenes.forEach(
    (item, index) => {
      item.retentionPurpose =
        purposes[index];
    }
  );

  const titles = [
    questionTitle(question),
    `The Hidden System Behind ${topic}`,
    `${topic}: What the Evidence Actually Shows`,
    `Why Rain Alone Does Not Explain ${topic}`,
    `${topic}: Follow the Water`,
  ];

  const thumbnails: ThumbnailConcept[] = [
    {
      title: "FOLLOW THE WATER",
      kicker: "WHY IT FLOODS",
      visual:
        "A Nairobi street or mapped drainage path showing rain moving from surface runoff into constrained drainage and river systems.",
    },
    {
      title: "RAIN ISN'T THE WHOLE STORY",
      kicker: "THE HIDDEN SYSTEM",
      visual:
        "Rainfall on one side and a layered city systems diagram on the other: drainage, rivers, built surfaces and settlements.",
    },
    {
      title: "WHY HERE?",
      kicker: "LOOK AT THE MAP",
      visual:
        "A Nairobi map with flood exposure, rivers and built-up areas layered as evidence becomes available.",
    },
  ];

  const hook =
    `${question} The evidence suggests the answer is not one cause but a chain of interacting urban systems.`;

  const shorts = [
    {
      title:
        `Why ${topic} is not just a rainfall story`,
      hook,
      script:
        `${hook} ${triggerText} The next question is what happens to that water after it reaches the city.`,
    },
    {
      title:
        "Follow the water",
      hook:
        "If you want to understand an urban flood, follow the water.",
      script:
        `${drainageText} The useful question is where runoff is supposed to go—and what prevents it from getting there.`,
    },
    {
      title:
        "The missing link matters",
      hook:
        "A causal diagram can look convincing even when one arrow has no evidence.",
      script:
        `${limitationText} In an evidence-led explainer, unsupported arrows stay labelled as uncertain.`,
    },
  ];

  const draft: EpisodeProject = {
    version: "origin-studio-1",
    id: crypto.randomUUID(),
    createdAt:
      new Date().toISOString(),

    brand: {
      channelName:
        intake.channelName ||
        "Evidence Studio",
      byline:
        intake.byline ||
        "Evidence-led video workflow",
      accentLabel:
        pack.accentLabel,
    },

    episode: {
      workingTitle:
        titles[0],
      question,
      // Preserve the brief as project metadata, but do not narrate it.
      experiment:
        clean(intake.experiment),
      targetMinutes:
        intake.targetMinutes,
      audience:
        intake.audience,
      storyMode:
        intake.mode,
    },

    evidence,
    assets: [],
    scenes,
    titles,
    shorts,
    thumbnails,

    publishing: {
      description:
        `${question}\n\nThis episode uses only evidence that remains relevant to the active story. Observations, interpretation and limitations stay separate, and unsupported causal links remain visible as uncertainty.\n\nMode: ${pack.label}.`,
      pinnedComment:
        "Which part of this causal chain needs stronger local evidence before the final cut?",
      linkedinPost:
        `I am testing a systems-first way to explain ${topic}: start with the trigger, follow the mechanism, show the source, and leave unsupported links visibly uncertain.\n\nQuestion: ${question}`,
    },
  };

  draft.retention =
    analyzeRetention(draft);

  return refreshVisualIntelligence(
    draft
  );
}

function buildGenericEpisode(
  intake: StoryIntake
): EpisodeProject {
  const pack =
    getStoryPack(intake.mode);

  /*
   * STEP 05 GROUNDING GATE
   *
   * Never send the raw project evidence pool directly into scene selection.
   * The page can contain evidence from earlier documents and earlier stories.
   * Filter it again at the scene-builder boundary so excluded archival material
   * cannot re-enter simply because it remains in React state.
   */
  const evidence =
    storyLockedEvidence(intake);

  if (
    intake.mode ===
    "world_explained"
  ) {
    return buildWorldExplainedEpisode(
      intake,
      evidence
    );
  }

  const observed =
    evidence.filter(
      (item) =>
        item.kind === "observed" &&
        clean(item.statement)
    );

  const inferences =
    evidence.filter(
      (item) =>
        item.kind === "inference" &&
        clean(item.statement)
    );

  const limitations =
    evidence.filter(
      (item) =>
        item.kind === "limitation" &&
        clean(item.statement)
    );

  const primary =
    observed[0];

  const secondary =
    observed[1];

  const tertiary =
    observed[2];

  const inference =
    inferences[0];

  const limitation =
    limitations[0];

  const totalSec =
    Math.round(
      Math.max(
        1,
        intake.targetMinutes
      ) * 60
    );

  const d =
    durationPlan(totalSec);

  const question =
    clean(intake.question) ||
    pack.questionPlaceholder;

  const topic =
    clean(intake.topic) ||
    pack.label;

  const primaryText =
    evidenceText(primary);

  const secondaryText =
    evidenceText(
      secondary ??
      primary
    );

  const tertiaryText =
    evidenceText(
      tertiary ??
      secondary ??
      primary
    );

  const inferenceText =
    evidenceText(inference);

  const limitationText =
    limitation
      ? evidenceText(
          limitation
        )
      : "The available story-grounded evidence has limits. This story should not claim more than the sources and observations can support.";

  const scenes: Scene[] = [
    scene(
      "hook",
      d[0],
      pack.accentLabel,
      question,
      primaryText,
      `Here is the question: ${question} Start with the strongest story-grounded observation. ${primaryText} The rest of this story separates what the evidence shows from what we think it means and what it still cannot establish.`,
      primary
        ? [primary.id]
        : []
    ),

    scene(
      "document",
      d[1],
      "THE SETUP",
      topic,
      `Story frame: ${question}`,
      `The context matters, but the user's production brief is not evidence and should not be narrated. The story will test ${question} using only evidence that still matches the active topic.`,
      []
    ),

    scene(
      "proof_card",
      d[2],
      "OBSERVED EVIDENCE",
      "Start with what can be shown.",
      primaryText,
      `The first story-grounded observation is: ${primaryText} Show the real source, figure, measurement or record wherever possible.`,
      primary
        ? [primary.id]
        : []
    ),

    scene(
      "diagram",
      d[3],
      "INTERPRETATION",
      "What does that evidence suggest?",
      inferenceText,
      inference
        ? `Now move from observation to interpretation. ${inferenceText} This remains labelled as interpretation rather than a new fact.`
        : "There is not yet a story-grounded inference in the evidence ledger. The video should not manufacture one.",
      inference
        ? [inference.id]
        : []
    ),

    scene(
      "proof_card",
      d[4],
      "MORE EVIDENCE",
      "Does another observation support or complicate the story?",
      secondaryText,
      `The next relevant observation is: ${secondaryText} Keep tension visible if it complicates the first claim.`,
      secondary
        ? [secondary.id]
        : primary
          ? [primary.id]
          : []
    ),

    scene(
      "timeline",
      d[5],
      "CONTEXT",
      "Put the result back into the process.",
      tertiaryText,
      `The result also needs story-relevant context. ${tertiaryText} Ask what happened before it, what changed and what conditions could have influenced the outcome.`,
      tertiary
        ? [tertiary.id]
        : []
    ),

    scene(
      "quote",
      d[6],
      "LIMITATION",
      "What does this not prove?",
      limitationText,
      `This is the trust boundary. ${limitationText} Keep that boundary visible in the final edit.`,
      limitation
        ? [limitation.id]
        : []
    ),

    scene(
      "cta",
      d[7],
      "THE TAKEAWAY",
      "Show the evidence. Label the inference. Keep the limitation.",
      `The current story-grounded evidence supports a careful answer to: ${question}`,
      "The responsible ending follows only from the evidence that survived story locking. Missing support becomes a visible next research task rather than filler narration.",
      []
    ),
  ];

  const purposes = [
    "Stop the scroll with the active question and strongest grounded evidence.",
    "Give setup without narrating the production brief.",
    "Deliver visible proof early.",
    "Separate interpretation from observation.",
    "Add corroborating or complicating evidence.",
    "Reset attention with relevant process or context.",
    "State the limitation before the conclusion overreaches.",
    "Resolve only what the current story-grounded evidence supports.",
  ];

  scenes.forEach(
    (item, index) => {
      item.retentionPurpose =
        purposes[index];
    }
  );

  const titles = [
    questionTitle(question),
    `${topic}: What the Evidence Actually Shows`,
    `I Looked at the Evidence Behind ${topic}`,
    `${topic}: The Result, the Limitation, and What It Means`,
    `Before You Believe the Claim About ${topic}, Look at This Evidence`,
  ];

  const thumbnails: ThumbnailConcept[] = [
    {
      title:
        "THE EVIDENCE",
      kicker:
        "WHAT IT SHOWS",
      visual:
        "The strongest real source or result centered with one highlighted finding.",
    },
    {
      title:
        "CLAIM vs PROOF",
      kicker:
        "NOT THE SAME",
      visual:
        "Claim on one side and the supporting evidence object on the other.",
    },
    {
      title:
        "WHAT CHANGED?",
      kicker:
        "LOOK CLOSER",
      visual:
        "Before/after, baseline/result or source/finding comparison depending on the story pack.",
    },
  ];

  const hook =
    `${question} Here is the strongest story-grounded evidence I found.`;

  const shorts = [
    {
      title:
        `What the evidence says about ${topic}`,
      hook,
      script:
        `${hook} ${primaryText} The important part is separating that observation from the conclusion we draw from it.`,
    },
    {
      title:
        "Observation is not interpretation",
      hook:
        "One of the easiest ways to overstate evidence is to blur what happened with what we think it means.",
      script:
        `${primaryText} ${
          inference
            ? `The interpretation is: ${inferenceText}`
            : "The interpretation still needs to be stated and justified."
        }`,
    },
    {
      title:
        "The limitation matters",
      hook:
        "A strong result can still have a boundary.",
      script:
        `${limitationText} Good evidence communication keeps that boundary visible instead of editing it out.`,
    },
  ];

  const draft: EpisodeProject = {
    version:
      "origin-studio-1",
    id:
      crypto.randomUUID(),
    createdAt:
      new Date().toISOString(),

    brand: {
      channelName:
        intake.channelName ||
        "Evidence Studio",
      byline:
        intake.byline ||
        "Evidence-led video workflow",
      accentLabel:
        pack.accentLabel,
    },

    episode: {
      workingTitle:
        titles[0],
      question,
      experiment:
        clean(
          intake.experiment
        ),
      targetMinutes:
        intake.targetMinutes,
      audience:
        intake.audience,
      storyMode:
        intake.mode,
    },

    evidence,
    assets: [],
    scenes,
    titles,
    shorts,
    thumbnails,

    publishing: {
      description:
        `${question}\n\nThis episode is built from evidence that survives active-story locking. Observations, interpretation and limitations remain separate while sources, data and geography stay visible where the evidence supports them.\n\nMode: ${pack.label}.`,
      pinnedComment:
        "What evidence, source or counter-example should be added before the next version of this story?",
      linkedinPost:
        `I am testing a different way to turn evidence into video: start with what can actually be shown, label the interpretation, and keep the limitation visible.\n\nQuestion: ${question}\n\nStrongest observation: ${primaryText}`,
    },
  };

  draft.retention =
    analyzeRetention(draft);

  return refreshVisualIntelligence(
    draft
  );
}

export function buildStoryEpisode(
  intake: StoryIntake
): EpisodeProject {
  if (
    intake.mode ===
    "hps"
  ) {
    const project =
      buildEpisode({
        channelName:
          intake.channelName,
        byline:
          intake.byline,
        topic:
          intake.topic,
        question:
          intake.question,
        experiment:
          intake.experiment,
        audience:
          intake.audience,
        targetMinutes:
          intake.targetMinutes,
        evidence:
          intake.evidence,
      });

    project.episode.storyMode =
      "hps";

    return refreshVisualIntelligence(
      project
    );
  }

  return buildGenericEpisode(
    intake
  );
}
