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
};

export type IllustrationDirection = {
  version: "illustration-director-1";
  generatedAt: string;
  defaultMode: StyleMode;
  scenes: IllustrationScenePlan[];
  warnings: string[];
  score: number;
};

const ABSTRACT_WORDS =
  /\b(system|network|flow|chain|relationship|mechanism|process|cycle|economy|distance|scale|growth|decline|trend|risk|probability|impact|trajectory|future|past|history|power|waste|trade|carbon|supply|drainage|flooding|health)\b/i;

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
  if (scene.kind === "diagram" || scene.kind === "timeline") return true;
  if (scene.kind === "map_story" || scene.kind === "data_chart") return false;

  const content = text(scene);
  return ABSTRACT_WORDS.test(content) || QUANT_WORDS.test(content);
}

function metaphorFor(scene: Scene): VisualMetaphor | undefined {
  const content = text(scene);

  if (/\b(flow|chain|cycle|system|process)\b/i.test(content)) {
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

  if (metaphor.purpose === "flow") {
    return [
      {
        id: `${scene.id}-frame-1`,
        order: 1,
        title: "System nodes",
        action: "Show the main actors or nodes first.",
        visual: "Simple labelled node layout.",
        durationSec: 3,
      },
      {
        id: `${scene.id}-frame-2`,
        order: 2,
        title: "Movement",
        action: "Animate movement across pathways in narration order.",
        visual: "Arrows, routes, transfers, flow pulses.",
        durationSec: 4,
      },
      {
        id: `${scene.id}-frame-3`,
        order: 3,
        title: "Accumulation / outcome",
        action: "Reveal where the system leads and why it matters.",
        visual: "Bottleneck, spillover or final destination emphasis.",
        durationSec: 4,
      },
    ];
  }

  if (metaphor.purpose === "scale") {
    return [
      {
        id: `${scene.id}-frame-1`,
        order: 1,
        title: "Reference object",
        action: "Begin with something familiar in scale.",
        visual: "House, truck, person, map unit or timeline segment.",
        durationSec: 3,
      },
      {
        id: `${scene.id}-frame-2`,
        order: 2,
        title: "Escalation",
        action: "Multiply or zoom outward to show the next scale level.",
        visual: "Progressive stacked or zoomed comparison.",
        durationSec: 4,
      },
      {
        id: `${scene.id}-frame-3`,
        order: 3,
        title: "Implication",
        action: "Tie the scale back to the claim being made.",
        visual: "Final comparison with labelled takeaway.",
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
        action: "Show the original state first.",
        visual: "Clear left-side baseline.",
        durationSec: 3,
      },
      {
        id: `${scene.id}-frame-2`,
        order: 2,
        title: "Change",
        action: "Reveal the changed state with one emphasized difference.",
        visual: "Split-screen or sliding before/after transition.",
        durationSec: 4,
      },
      {
        id: `${scene.id}-frame-3`,
        order: 3,
        title: "Meaning",
        action: "Summarize why the difference matters.",
        visual: "Callout or highlighted consequence.",
        durationSec: 3,
      },
    ];
  }

  return [
    {
      id: `${scene.id}-frame-1`,
      order: 1,
      title: "Setup",
      action: "Introduce the main actors or idea.",
      visual: "Simple stage with one focal concept.",
      durationSec: 3,
    },
    {
      id: `${scene.id}-frame-2`,
      order: 2,
      title: "Development",
      action: "Add motion and one explanatory layer.",
      visual: "Progressive build with labels.",
      durationSec: 4,
    },
    {
      id: `${scene.id}-frame-3`,
      order: 3,
      title: "Payoff",
      action: "Deliver the explanatory insight visually.",
      visual: "Resolved metaphor with takeaway.",
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
        ? `This scene contains abstract or quantitative reasoning that benefits from explanatory illustration.`
        : `This scene is better served by documentary, chart or map treatment.`,
      metaphor,
      frames: framePlan(scene, metaphor),
      palette: paletteFor(mode),
      motionLanguage: motionFor(mode),
      iconStrategy: iconStrategyFor(mode),
      transitionStyle: transitionFor(mode),
    };
  });

  const warnings: string[] = [];
  const illustrated = scenes.filter((scene) => scene.shouldIllustrate).length;
  const documentary = scenes.filter(
    (scene) => scene.mode === "vox_documentary" || scene.mode === "johnny_cinematic"
  ).length;

  if (!illustrated) {
    warnings.push(
      "No scenes were flagged for explanatory illustration. This may leave abstract sections feeling too literal."
    );
  }

  if (illustrated < Math.ceil(project.scenes.length * 0.2)) {
    warnings.push(
      "Illustration coverage is light. Hybrid explainers often need at least a few clearly designed metaphor scenes."
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
        45 +
          Math.min(30, illustrated * 5) +
          Math.min(15, documentary * 2) -
          warnings.length * 6
      )
    )
  );

  return {
    version: "illustration-director-1",
    generatedAt: new Date().toISOString(),
    defaultMode: "hybrid_world_explained",
    scenes,
    warnings,
    score,
  };
}
