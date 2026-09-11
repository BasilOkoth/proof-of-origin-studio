import type {
  EpisodeProject,
  EvidenceAsset,
  Scene,
} from "./types";

export type CinematicIssueSeverity =
  | "critical"
  | "high"
  | "medium";

export type CinematicIssue = {
  sceneId?: string;
  sceneNumber?: number;
  severity: CinematicIssueSeverity;
  code:
    | "late_scene_empty"
    | "card_fatigue"
    | "real_world_gap"
    | "motion_gap"
    | "weak_opening"
    | "weak_closure";
  message: string;
  recommendation: string;
};

export type CinematicPresentationReport = {
  version: "cinematic-presentation-1";
  generatedAt: string;
  score: number;
  realWorldCoverage: number;
  lateSceneRichness: number;
  visualRhythm: number;
  openingStrength: number;
  closureStrength: number;
  issues: CinematicIssue[];
  warnings: string[];
};

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sceneText(scene: Scene) {
  return clean(
    `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.sourceLabel || ""}`
  );
}

function assetText(asset: EvidenceAsset) {
  return clean(
    `${asset.name} ${asset.sourceLabel || ""}`
  );
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "into",
  "that", "this", "what", "where", "when", "why",
  "how", "does", "did", "are", "was", "were",
  "has", "have", "about", "after", "before",
  "through", "your", "their",
]);

function tokens(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) =>
      token.replace(/(?:ing|ed|es|s)$/i, "")
    )
    .filter(
      (token) =>
        token.length >= 3 &&
        !STOP.has(token)
    );
}

function relevance(
  scene: Scene,
  asset: EvidenceAsset
) {
  const left =
    new Set(tokens(sceneText(scene)));
  const right =
    new Set(tokens(assetText(asset)));

  if (!left.size || !right.size) {
    return 0;
  }

  let overlap = 0;

  left.forEach((token) => {
    if (right.has(token)) {
      overlap += 1;
    }
  });

  return (
    overlap /
    Math.max(
      1,
      Math.min(left.size, right.size)
    )
  );
}

function openingImpactScore(asset: EvidenceAsset) {
  const text = assetText(asset).toLowerCase();
  let score = 0;

  /*
   * For a documentary hook, begin with consequence/place before response
   * infrastructure. A culvert or maintenance image can be excellent evidence
   * later, but it is a weak first emotional/causal anchor.
   */
  if (/\bflooded?\b|\bsubmerged\b|\bstranded\b|\bmotorist\b|\bvehicle\b/.test(text)) {
    score += 120;
  }
  if (/\broad\b|\bstreet\b|\bwater\b|\bflood\b/.test(text)) {
    score += 80;
  }
  if (/\brain\b|\brainfall\b|\bstorm\b/.test(text)) {
    score += 55;
  }
  if (/\bnairobi\b|\bsouth c\b/.test(text)) {
    score += 25;
  }

  if (/\bculvert\b|\btrench\b|\bclearing\b|\bmaintenance\b/.test(text)) {
    score -= 100;
  }
  if (/\bconstruction\b|\binfrastructure\b/.test(text)) {
    score -= 45;
  }

  return score;
}

export function openingAssetsForScene(
  project: EpisodeProject,
  scene: Scene
) {
  return project.assets
    .filter(
      (asset) =>
        Boolean(asset.dataUrl) &&
        (
          asset.mimeType.startsWith("image/") ||
          asset.mimeType.startsWith("video/")
        )
    )
    .map((asset) => ({
      asset,
      impact: openingImpactScore(asset),
      semantic: relevance(scene, asset),
    }))
    .sort(
      (a, b) =>
        b.impact - a.impact ||
        b.semantic - a.semantic
    )
    .map(({ asset }) => asset);
}

function sceneHasRealVisual(
  project: EpisodeProject,
  scene: Scene
) {
  if (
    scene.map ||
    scene.chart
  ) {
    return true;
  }

  if (
    scene.assetId &&
    project.assets.some(
      (asset) =>
        asset.id === scene.assetId &&
        Boolean(asset.dataUrl)
    )
  ) {
    return true;
  }

  return false;
}

function isCardLike(scene: Scene) {
  const kind =
    scene.visualPlan?.kind;

  return (
    kind === "systems_diagram" ||
    kind === "evidence_card" ||
    kind === "source_highlight" ||
    kind === "minimal" ||
    scene.kind === "diagram" ||
    scene.kind === "timeline" ||
    scene.kind === "proof_card" ||
    scene.kind === "document"
  );
}

function isLateScene(
  project: EpisodeProject,
  index: number
) {
  return (
    index >=
    Math.floor(
      project.scenes.length * 0.58
    )
  );
}

export function rankedAssetsForScene(
  project: EpisodeProject,
  scene: Scene
) {
  const explicit =
    scene.assetId
      ? project.assets.find(
          (asset) =>
            asset.id ===
            scene.assetId
        )
      : undefined;

  const candidates =
    project.assets
      .filter((asset) =>
        Boolean(asset.dataUrl)
      )
      .map((asset) => ({
        asset,
        score:
          relevance(
            scene,
            asset
          ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

  const ordered:
    EvidenceAsset[] = [];

  if (explicit?.dataUrl) {
    ordered.push(explicit);
  }

  candidates.forEach(
    ({ asset }) => {
      if (
        !ordered.some(
          (candidate) =>
            candidate.id ===
            asset.id
        )
      ) {
        ordered.push(asset);
      }
    }
  );

  return ordered;
}

export function shouldUseCinematicMontage(
  project: EpisodeProject,
  scene: Scene,
  sceneIndex: number
) {
  if (
    scene.kind === "cta" ||
    scene.map ||
    scene.chart
  ) {
    return false;
  }

  /*
   * Opening scenes are now allowed to use the cinematic montage when at
   * least two usable visuals exist. This prevents one assigned image from
   * occupying a 30–45 second hook.
   */
  if (
    sceneIndex === 0 &&
    scene.kind === "hook"
  ) {
    return (
      openingAssetsForScene(
        project,
        scene
      ).length >= 2
    );
  }

  if (
    !isLateScene(
      project,
      sceneIndex
    )
  ) {
    return false;
  }

  const assets =
    rankedAssetsForScene(
      project,
      scene
    );

  if (!assets.length) {
    return false;
  }

  if (
    sceneHasRealVisual(
      project,
      scene
    )
  ) {
    return true;
  }

  return (
    isCardLike(scene) &&
    assets.length >= 1
  );
}

function clamp(value: number) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value)
    )
  );
}

export function buildCinematicPresentationReport(
  project: EpisodeProject
): CinematicPresentationReport {
  const issues:
    CinematicIssue[] = [];

  const scenes =
    project.scenes;

  const realWorldScenes =
    scenes.filter(
      (scene) =>
        sceneHasRealVisual(
          project,
          scene
        )
    ).length;

  const realWorldCoverage =
    clamp(
      (realWorldScenes /
        Math.max(
          1,
          scenes.length
        )) *
        100
    );

  const lateScenes =
    scenes
      .map(
        (scene, index) => ({
          scene,
          index,
        })
      )
      .filter(({ index }) =>
        isLateScene(
          project,
          index
        )
      );

  const lateRich =
    lateScenes.filter(
      ({ scene }) =>
        sceneHasRealVisual(
          project,
          scene
        ) ||
        scene.kind === "cta"
    ).length;

  const lateSceneRichness =
    clamp(
      (lateRich /
        Math.max(
          1,
          lateScenes.length
        )) *
        100
    );

  lateScenes.forEach(
    ({ scene, index }) => {
      if (
        scene.kind === "cta"
      ) {
        return;
      }

      if (
        !sceneHasRealVisual(
          project,
          scene
        ) &&
        isCardLike(scene)
      ) {
        issues.push({
          sceneId: scene.id,
          sceneNumber:
            index + 1,
          severity: "high",
          code:
            "late_scene_empty",
          message:
            `Late scene ${index + 1} is still abstract/card-led: "${scene.headline}".`,
          recommendation:
            "Upload or assign a strong documentary/source image. If a project image already exists, the Cinematic Director will reuse it as a labelled visual callback instead of leaving the scene as an empty diagram card.",
        });
      }
    }
  );

  let longestCardRun = 0;
  let currentCardRun = 0;

  scenes.forEach((scene) => {
    if (
      isCardLike(scene) &&
      !sceneHasRealVisual(
        project,
        scene
      )
    ) {
      currentCardRun += 1;
      longestCardRun =
        Math.max(
          longestCardRun,
          currentCardRun
        );
    } else {
      currentCardRun = 0;
    }
  });

  if (
    longestCardRun >= 3
  ) {
    issues.push({
      severity: "high",
      code:
        "card_fatigue",
      message:
        `${longestCardRun} consecutive scenes can read as cards/diagrams rather than a documentary sequence.`,
      recommendation:
        "Break the run with full-screen evidence imagery, a map, a chart, an archival/source visual, or a cinematic visual callback.",
    });
  }

  if (
    realWorldCoverage < 45
  ) {
    issues.push({
      severity: "high",
      code:
        "real_world_gap",
      message:
        `Only ${realWorldCoverage}% of scenes currently have a concrete production visual such as a real image, map or chart.`,
      recommendation:
        "Increase real-world/source imagery so abstract explanations are surrounded by physical evidence and place.",
    });
  }

  const visualKinds =
    new Set(
      scenes.map(
        (scene) =>
          scene.visualPlan?.kind ||
          scene.kind
      )
    );

  const visualRhythm =
    clamp(
      Math.min(
        100,
        visualKinds.size * 15 +
          Math.min(
            25,
            realWorldScenes * 3
          )
      )
    );

  if (
    visualRhythm < 70
  ) {
    issues.push({
      severity: "medium",
      code:
        "motion_gap",
      message:
        "The visual language is not varied enough yet to feel continuously authored.",
      recommendation:
        "Alternate documentary imagery, evidence crops, maps, charts, diagrams, quiet holds and callbacks rather than repeating one treatment.",
    });
  }

  const opening =
    scenes[0];

  const openingAssets =
    opening
      ? openingAssetsForScene(
          project,
          opening
        )
      : [];

  const openingStrength =
    opening
      ? clamp(
          (openingAssets.length >= 2
            ? 82
            : sceneHasRealVisual(
                project,
                opening
              )
              ? 70
              : 40) +
            (opening.kind ===
            "hook"
              ? 18
              : 0)
        )
      : 0;

  if (
    openingStrength < 75
  ) {
    issues.push({
      sceneId:
        opening?.id,
      sceneNumber:
        opening ? 1 : undefined,
      severity:
        "critical",
      code:
        "weak_opening",
      message:
        "The opening still lacks a strong concrete visual anchor.",
      recommendation:
        "Use the strongest real flood/impact image or footage in the first seconds and change visual grammar within the hook rather than holding one response-infrastructure image.",
    });
  }

  const closing =
    scenes[
      scenes.length - 1
    ];

  const closureStrength =
    closing?.kind ===
    "cta"
      ? 96
      : 45;

  if (
    closureStrength < 80
  ) {
    issues.push({
      sceneId:
        closing?.id,
      sceneNumber:
        closing
          ? scenes.length
          : undefined,
      severity: "high",
      code:
        "weak_closure",
      message:
        "The episode does not yet end with an authored documentary closure.",
      recommendation:
        "Resolve the opening question, land one memorable idea, then move into the branded Evidence Studio outro.",
    });
  }

  const score =
    clamp(
      realWorldCoverage * 0.28 +
        lateSceneRichness * 0.28 +
        visualRhythm * 0.22 +
        openingStrength * 0.12 +
        closureStrength * 0.1
    );

  const warnings =
    issues.map((issue) => {
      const scene =
        issue.sceneNumber
          ? ` · Scene ${String(
              issue.sceneNumber
            ).padStart(
              2,
              "0"
            )}`
          : "";

      return `CINEMATIC ${issue.severity.toUpperCase()}${scene} · ${issue.message} ${issue.recommendation}`;
    });

  return {
    version:
      "cinematic-presentation-1",
    generatedAt:
      new Date().toISOString(),
    score,
    realWorldCoverage,
    lateSceneRichness,
    visualRhythm,
    openingStrength,
    closureStrength,
    issues,
    warnings,
  };
}
