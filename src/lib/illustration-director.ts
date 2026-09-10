import type { EpisodeProject, Scene } from "./types";

export type StyleMode =
  | "vox_documentary"
  | "johnny_cinematic"
  | "kurzgesagt_illustrated"
  | "hybrid_world_explained";

export type VisualMetaphor = {
  label: string;
  description: string;
  purpose:
    | "scale"
    | "flow"
    | "comparison"
    | "risk"
    | "journey"
    | "system"
    | "human_impact"
    | "reveal";
};

export type IllustrationFrame = {
  id: string;
  order: number;
  title: string;
  action: string;
  visual: string;
  durationSec: number;
};

export type IllustrationNode = {
  id: string;
  label: string;
  role: "input" | "process" | "constraint" | "outcome" | "context";
  evidenceStatus: "observed" | "interpreted" | "uncertain";
};

export type IllustrationEdge = {
  id: string;
  from: string;
  to: string;
  relation: "drives" | "increases" | "reduces" | "constrains" | "leads_to";
  evidenceStatus: "observed" | "interpreted" | "uncertain";
};

export type IllustrationExecution = {
  kind: "flow_network" | "risk_path" | "comparison" | "scale_ladder" | "system_reveal";
  nodes: IllustrationNode[];
  edges: IllustrationEdge[];
  beforeLabel?: string;
  afterLabel?: string;
  evidenceBoundary?: string;
};

export type IllustrationScenePlan = {
  sceneId: string;
  mode: StyleMode;
  emphasis: "low" | "medium" | "high";
  shouldIllustrate: boolean;
  reason: string;
  metaphor?: VisualMetaphor;
  frames: IllustrationFrame[];
  palette: string[];
  motionLanguage: string[];
  iconStrategy: string;
  transitionStyle: string;
  execution?: IllustrationExecution;
};

export type IllustrationDirection = {
  version: "illustration-director-2";
  generatedAt: string;
  defaultMode: StyleMode;
  scenes: IllustrationScenePlan[];
  warnings: string[];
  score: number;
};

const ABSTRACT_WORDS =
  /\b(system|network|flow|chain|relationship|mechanism|process|cycle|economy|distance|scale|growth|decline|trend|risk|probability|impact|trajectory|future|past|history|power|waste|trade|carbon|supply|drainage|flooding|health|runoff|infiltration|capacity|maintenance|governance)\b/i;

const HUMAN_WORDS =
  /\b(people|workers|children|families|residents|communities|farmers|students|patients|citizens)\b/i;

const QUANT_WORDS =
  /\b(percent|%|million|billion|thousand|times|rate|ratio|faster|slower|larger|smaller)\b/i;

function text(scene: Scene) {
  return `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.narration}`;
}

function paletteFor(mode: StyleMode) {
  if (mode === "vox_documentary") {
    return ["#111827", "#F9FAFB", "#E11D48", "#2563EB", "#10B981"];
  }
  if (mode === "johnny_cinematic") {
    return ["#0B1220", "#F5F1E8", "#55D8FF", "#6C7CFF", "#FFB36B"];
  }
  if (mode === "kurzgesagt_illustrated") {
    return ["#0B132B", "#F7F4EA", "#64D2FF", "#7C5CFC", "#FFD166"];
  }
  return ["#0C1222", "#F5F5F0", "#55D8FF", "#6C7CFF", "#FF6F86"];
}

function motionFor(mode: StyleMode) {
  if (mode === "kurzgesagt_illustrated") {
    return [
      "continuous object motion",
      "progressive diagram build",
      "scale transitions",
      "spatial zooming",
    ];
  }

  if (mode === "johnny_cinematic") {
    return [
      "slow camera push",
      "map travel",
      "document crop and pan",
      "measured editorial hold",
    ];
  }

  if (mode === "vox_documentary") {
    return [
      "timeline reveal",
      "chart-led transitions",
      "map overlays",
      "headline interruptions",
    ];
  }

  return [
    "start in documentary space",
    "switch to illustration for explanation",
    "return to evidence",
    "use restrained map/chart bridges",
  ];
}

function transitionFor(mode: StyleMode) {
  if (mode === "kurzgesagt_illustrated") {
    return "morphs, scale reveals, object continuity";
  }
  if (mode === "johnny_cinematic") {
    return "hard cuts, map bridges, quiet holds";
  }
  if (mode === "vox_documentary") {
    return "graphic bridges, chart wipes, editorial cuts";
  }
  return "hybrid transitions: real world → evidence → illustration → payoff";
}

function iconStrategyFor(mode: StyleMode) {
  if (mode === "kurzgesagt_illustrated") {
    return "Use a coherent illustrated icon/world system rather than mixed stock visuals.";
  }
  if (mode === "vox_documentary") {
    return "Use icons sparingly; prefer labels, maps, documents and charts.";
  }
  if (mode === "johnny_cinematic") {
    return "Use icons only to support transitions or clarify structure.";
  }
  return "Use icons for explanation only when documentary footage cannot explain the idea cleanly.";
}

function detectMode(project: EpisodeProject, scene: Scene): StyleMode {
  const content = text(scene);

  if (scene.kind === "map_story" || scene.kind === "data_chart") {
    return "vox_documentary";
  }

  if (scene.kind === "hook" && HUMAN_WORDS.test(content)) {
    return "johnny_cinematic";
  }

  if (
    scene.kind === "diagram" ||
    scene.kind === "timeline" ||
    ABSTRACT_WORDS.test(content)
  ) {
    return "kurzgesagt_illustrated";
  }

  if (project.episode.storyMode && project.episode.storyMode !== "hps") {
    return "hybrid_world_explained";
  }

  return "hybrid_world_explained";
}

function shouldIllustrate(scene: Scene) {
  const approvedVisualKind = String(scene.visualPlan?.kind || "");

  /*
   * Visual Intelligence is the approved render job.
   * A stale scene.kind from an earlier story build must not override it.
   */
  if (approvedVisualKind === "systems_diagram") return true;

  if (
    approvedVisualKind === "map_story" ||
    approvedVisualKind === "data_chart" ||
    approvedVisualKind === "source_highlight" ||
    approvedVisualKind === "field_evidence"
  ) {
    return false;
  }

  if (scene.kind === "diagram" || scene.kind === "timeline") return true;

  if (
    scene.kind === "map_story" ||
    scene.kind === "data_chart" ||
    scene.kind === "document" ||
    scene.kind === "source_highlight" ||
    scene.kind === "proof_card"
  ) {
    return false;
  }

  const content = text(scene);
  return ABSTRACT_WORDS.test(content) || QUANT_WORDS.test(content);
}

function metaphorFor(scene: Scene): VisualMetaphor | undefined {
  const content = text(scene);

  if (/\b(flow|chain|cycle|system|process|runoff|drainage|infiltration|water)\b/i.test(content)) {
    return {
      label: "Flow Network",
      description:
        "Show the concept as a moving network with nodes, pathways and accumulation points.",
      purpose: "flow",
    };
  }

  if (/\b(distance|scale|large|small|million|billion|times)\b/i.test(content)) {
    return {
      label: "Scale Ladder",
      description:
        "Convert abstract magnitude into a progressive scale comparison viewers can intuitively feel.",
      purpose: "scale",
    };
  }

  if (/\b(before|after|change|increase|decrease|rise|fall)\b/i.test(content)) {
    return {
      label: "Before / After Contrast",
      description:
        "Use a split comparison to dramatise what changed and why it matters.",
      purpose: "comparison",
    };
  }

  if (/\b(risk|danger|threat|hazard|collision|flood|exposure)\b/i.test(content)) {
    return {
      label: "Risk Path",
      description:
        "Trace how one condition increases exposure step by step toward the harmful outcome.",
      purpose: "risk",
    };
  }

  if (HUMAN_WORDS.test(content)) {
    return {
      label: "Human Journey",
      description:
        "Anchor the explanation through one person, household or worker moving through the system.",
      purpose: "human_impact",
    };
  }

  return {
    label: "System Reveal",
    description:
      "Turn the idea into a simple explanatory mechanism that unfolds progressively.",
    purpose: "system",
  };
}

function compactLabel(value: string) {
  return value
    .replace(/[.:;!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

function labelsFromScene(scene: Scene) {
  if (scene.visualLabels?.length) {
    return scene.visualLabels
      .map(compactLabel)
      .filter(Boolean)
      .slice(0, 6);
  }

  const content = text(scene);
  const candidates: string[] = [];

  const rules: Array<[RegExp, string]> = [
    [/\bheavy rain(?:fall)?\b/i, "Heavy rainfall"],
    [/\bimpervious|built surfaces?|paved surfaces?\b/i, "Built surfaces"],
    [/\binfiltration\b/i, "Reduced infiltration"],
    [/\brunoff\b/i, "Surface runoff"],
    [/\bdrainage|drains?\b/i, "Drainage network"],
    [/\bblocked|blockage|waste accumulation\b/i, "Blockage"],
    [/\bcapacity\b/i, "Capacity limit"],
    [/\briver|waterways?\b/i, "Rivers & waterways"],
    [/\bmaintenance\b/i, "Maintenance"],
    [/\bgovernance|institutions?|planning\b/i, "Planning & governance"],
    [/\bexposure|settlement\b/i, "Exposure"],
    [/\bflooding|flood risk\b/i, "Flooding"],
    [/\bdamage\b/i, "Damage"],
  ];

  for (const [pattern, label] of rules) {
    if (pattern.test(content) && !candidates.includes(label)) {
      candidates.push(label);
    }
  }

  if (candidates.length >= 3) return candidates.slice(0, 6);

  const clauses = `${scene.headline}. ${scene.body}`
    .split(/[.;:!?]\s+/)
    .map(compactLabel)
    .filter((item) => item.length >= 5 && item.length <= 44);

  for (const clause of clauses) {
    if (!candidates.includes(clause)) candidates.push(clause);
    if (candidates.length >= 5) break;
  }

  return candidates.length
    ? candidates
    : ["Trigger", "Urban system", "Constraint", "Outcome"];
}

function statusFor(label: string, scene: Scene): IllustrationNode["evidenceStatus"] {
  const lower = label.toLowerCase();
  const sceneText = text(scene).toLowerCase();

  if (
    lower.includes("uncertain") ||
    lower.includes("gap") ||
    lower.includes("not prove") ||
    scene.kind === "quote"
  ) {
    return "uncertain";
  }

  if (scene.factIds?.length) return "observed";

  if (
    sceneText.includes("evidence indicates") ||
    sceneText.includes("local evidence") ||
    sceneText.includes("evidence shows")
  ) {
    return "observed";
  }

  return "interpreted";
}

function roleFor(label: string, index: number, total: number): IllustrationNode["role"] {
  const lower = label.toLowerCase();
  if (index === 0 || /\brain|trigger|input\b/.test(lower)) return "input";
  if (index === total - 1 || /\bflood|damage|outcome|result\b/.test(lower)) return "outcome";
  if (/\bblock|capacity|constraint|limit|exposure\b/.test(lower)) return "constraint";
  if (/\bgovernance|planning|maintenance|context\b/.test(lower)) return "context";
  return "process";
}

function relationFor(from: string, to: string): IllustrationEdge["relation"] {
  const pair = `${from} ${to}`.toLowerCase();
  if (/\breduc|infiltration\b/.test(pair)) return "reduces";
  if (/\bblock|capacity|constraint|limit\b/.test(pair)) return "constrains";
  if (/\bincrease|runoff|exposure\b/.test(pair)) return "increases";
  if (/\boutcome|flood|damage\b/.test(to.toLowerCase())) return "leads_to";
  return "drives";
}

function executionFor(
  scene: Scene,
  metaphor?: VisualMetaphor
): IllustrationExecution | undefined {
  if (!metaphor) return undefined;

  const labels = labelsFromScene(scene);
  const nodes: IllustrationNode[] = labels.map((label, index) => ({
    id: `${scene.id}-node-${index + 1}`,
    label,
    role: roleFor(label, index, labels.length),
    evidenceStatus: statusFor(label, scene),
  }));

  const edges: IllustrationEdge[] = nodes.slice(0, -1).map((node, index) => ({
    id: `${scene.id}-edge-${index + 1}`,
    from: node.id,
    to: nodes[index + 1].id,
    relation: relationFor(node.label, nodes[index + 1].label),
    evidenceStatus:
      node.evidenceStatus === "uncertain" ||
      nodes[index + 1].evidenceStatus === "uncertain"
        ? "uncertain"
        : node.evidenceStatus === "observed" &&
            nodes[index + 1].evidenceStatus === "observed"
          ? "observed"
          : "interpreted",
  }));

  if (metaphor.purpose === "comparison") {
    return {
      kind: "comparison",
      nodes,
      edges,
      beforeLabel: scene.before || labels[0] || "Before",
      afterLabel: scene.after || labels[1] || "After",
      evidenceBoundary:
        "Visual comparison follows the scene's stated evidence; it does not imply an unmeasured effect.",
    };
  }

  if (metaphor.purpose === "scale") {
    return {
      kind: "scale_ladder",
      nodes,
      edges,
      evidenceBoundary:
        "Scale is explanatory unless the scene contains source-backed quantitative values.",
    };
  }

  if (metaphor.purpose === "risk") {
    return {
      kind: "risk_path",
      nodes,
      edges,
      evidenceBoundary:
        "Dashed links mark interpreted or uncertain causal steps.",
    };
  }

  if (metaphor.purpose === "flow") {
    return {
      kind: "flow_network",
      nodes,
      edges,
      evidenceBoundary:
        "Observed and interpreted links are visually distinguished.",
    };
  }

  return {
    kind: "system_reveal",
    nodes,
    edges,
    evidenceBoundary:
      "Observed evidence and interpretation remain visually distinct.",
  };
}

function framePlan(scene: Scene, metaphor?: VisualMetaphor): IllustrationFrame[] {
  if (!metaphor) {
    return [
      {
        id: `${scene.id}-frame-1`,
        order: 1,
        title: "Core idea",
        action: "Introduce the concept cleanly before adding detail.",
        visual: "Use editorial title + one supporting explanatory visual.",
        durationSec: Math.max(3, Math.min(6, scene.durationSec)),
      },
    ];
  }

  if (metaphor.purpose === "flow" || metaphor.purpose === "risk") {
    return [
      {
        id: `${scene.id}-frame-1`,
        order: 1,
        title: "System nodes",
        action: "Reveal the first conditions and actors.",
        visual: "Executable labelled node layout.",
        durationSec: 3,
      },
      {
        id: `${scene.id}-frame-2`,
        order: 2,
        title: "Movement",
        action: "Animate links and flow pulses in narration order.",
        visual: "Executable SVG paths, arrows and moving pulses.",
        durationSec: 4,
      },
      {
        id: `${scene.id}-frame-3`,
        order: 3,
        title: "Outcome",
        action: "Reveal the bottleneck or final consequence.",
        visual: "Executable outcome emphasis with evidence-status styling.",
        durationSec: 4,
      },
    ];
  }

  if (metaphor.purpose === "scale") {
    return [
      {
        id: `${scene.id}-frame-1`,
        order: 1,
        title: "Reference",
        action: "Start with the smallest reference.",
        visual: "Executable scale object.",
        durationSec: 3,
      },
      {
        id: `${scene.id}-frame-2`,
        order: 2,
        title: "Escalation",
        action: "Grow the comparison progressively.",
        visual: "Executable scale ladder.",
        durationSec: 4,
      },
      {
        id: `${scene.id}-frame-3`,
        order: 3,
        title: "Meaning",
        action: "Hold the largest comparison and takeaway.",
        visual: "Resolved scale composition.",
        durationSec: 4,
      },
    ];
  }

  if (metaphor.purpose === "comparison") {
    return [
      {
        id: `${scene.id}-frame-1`,
        order: 1,
        title: "Baseline",
        action: "Show the first state.",
        visual: "Executable left-side state.",
        durationSec: 3,
      },
      {
        id: `${scene.id}-frame-2`,
        order: 2,
        title: "Change",
        action: "Reveal the second state.",
        visual: "Animated before/after transition.",
        durationSec: 4,
      },
      {
        id: `${scene.id}-frame-3`,
        order: 3,
        title: "Meaning",
        action: "Highlight the difference without overclaiming.",
        visual: "Evidence-bound comparison.",
        durationSec: 3,
      },
    ];
  }

  return [
    {
      id: `${scene.id}-frame-1`,
      order: 1,
      title: "Setup",
      action: "Introduce the focal concept.",
      visual: "Executable focal node.",
      durationSec: 3,
    },
    {
      id: `${scene.id}-frame-2`,
      order: 2,
      title: "Development",
      action: "Add relationships progressively.",
      visual: "Executable nodes and links.",
      durationSec: 4,
    },
    {
      id: `${scene.id}-frame-3`,
      order: 3,
      title: "Payoff",
      action: "Resolve the system visually.",
      visual: "Complete evidence-labelled mechanism.",
      durationSec: 4,
    },
  ];
}

export function buildIllustrationDirection(
  project: EpisodeProject
): IllustrationDirection {
  const scenes: IllustrationScenePlan[] = project.scenes.map((scene) => {
    const mode = detectMode(project, scene);
    const illustrate = shouldIllustrate(scene);
    const metaphor = illustrate ? metaphorFor(scene) : undefined;

    return {
      sceneId: scene.id,
      mode,
      emphasis:
        scene.kind === "hook" ||
        scene.kind === "value_swap" ||
        scene.kind === "confidence"
          ? "high"
          : illustrate
            ? "medium"
            : "low",
      shouldIllustrate: illustrate,
      reason: illustrate
        ? "This scene contains a mechanism, relationship or abstraction that can now be executed as an animated visual."
        : "This scene is better served by documentary, source, chart or map treatment.",
      metaphor,
      frames: framePlan(scene, metaphor),
      palette: paletteFor(mode),
      motionLanguage: motionFor(mode),
      iconStrategy: iconStrategyFor(mode),
      transitionStyle: transitionFor(mode),
      execution: illustrate ? executionFor(scene, metaphor) : undefined,
    };
  });

  const warnings: string[] = [];
  const illustrated = scenes.filter((scene) => scene.shouldIllustrate).length;
  const executable = scenes.filter((scene) => scene.execution?.nodes.length).length;
  const documentary = scenes.filter(
    (scene) =>
      scene.mode === "vox_documentary" ||
      scene.mode === "johnny_cinematic"
  ).length;

  if (!illustrated) {
    warnings.push(
      "No scenes were flagged for explanatory illustration."
    );
  }

  if (illustrated && executable < illustrated) {
    warnings.push(
      "At least one illustration plan has no executable visual structure."
    );
  }

  if (!documentary) {
    warnings.push(
      "The episode leans heavily into illustration without enough documentary grounding."
    );
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        40 +
          Math.min(25, illustrated * 4) +
          Math.min(25, executable * 5) +
          Math.min(10, documentary * 2) -
          warnings.length * 5
      )
    )
  );

  return {
    version: "illustration-director-2",
    generatedAt: new Date().toISOString(),
    defaultMode: "hybrid_world_explained",
    scenes,
    warnings,
    score,
  };
}
