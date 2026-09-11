import type {
  EpisodeProject,
  EvidenceAsset,
  Scene,
  VisualKind,
} from "./types";

export type VisualRequirementStatus =
  | "ready"
  | "upgrade"
  | "missing";

export type VisualRequirementKind =
  | "documentary_photo"
  | "field_photo"
  | "map"
  | "dataset"
  | "source_visual"
  | "diagram"
  | "archive"
  | "satellite_or_remote_sensing"
  | "none";

export type VisualRequirement = {
  sceneId: string;
  sceneNumber: number;
  sceneLabel: string;
  requestedKind: VisualRequirementKind;
  status: VisualRequirementStatus;
  priority: "critical" | "high" | "medium";
  reason: string;
  request: string;
  preferredMinimum?: string;
  currentAssetId?: string;
  currentAssetName?: string;
  currentAssetQuality?: number;
  replacementRecommended?: boolean;
};

export type VisualRequirementsReport = {
  generatedAt: string;
  readiness: number;
  ready: number;
  upgrade: number;
  missing: number;
  requirements: VisualRequirement[];
  topRequests: VisualRequirement[];
};

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "from",
  "into",
  "is",
  "are",
  "was",
  "were",
  "be",
  "as",
  "this",
  "that",
  "these",
  "those",
  "what",
  "why",
  "how",
  "when",
  "where",
  "it",
  "its",
  "they",
  "their",
  "your",
  "our",
  "after",
  "before",
  "through",
  "about",
  "between",
  "does",
  "do",
  "did",
]);

function clean(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function tokens(value?: string) {
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

function overlap(a: string, b: string) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));

  if (!aa.size || !bb.size) return 0;

  let matches = 0;

  aa.forEach((token) => {
    if (bb.has(token)) matches += 1;
  });

  return (
    matches /
    Math.max(
      1,
      Math.min(aa.size, bb.size)
    )
  );
}

function assetText(asset: EvidenceAsset) {
  return `${asset.name || ""} ${asset.sourceLabel || ""}`;
}

function looksPdfExtracted(
  asset: EvidenceAsset
) {
  return (
    /pdf[-_ ]?visual|plate|figure|fig\.?|page[-_ ]?\d+/i.test(
      `${asset.name} ${asset.sourceLabel || ""}`
    ) ||
    /pdf-visual-extraction/i.test(
      asset.visualEvidenceVersion || ""
    )
  );
}

function looksManualHighQuality(
  asset: EvidenceAsset
) {
  return (
    !looksPdfExtracted(asset) &&
    /^image\//.test(asset.mimeType || "") &&
    Boolean(asset.dataUrl)
  );
}

export function estimatedAssetQuality(
  asset?: EvidenceAsset
) {
  if (!asset?.dataUrl) return 0;

  let score = 65;

  if (looksManualHighQuality(asset)) {
    score += 23;
  }

  if (looksPdfExtracted(asset)) {
    score -= 18;
  }

  if (
    /thumbnail|preview|screenshot|screen[-_ ]?shot/i.test(
      asset.name
    )
  ) {
    score -= 12;
  }

  if (
    /original|field|archive|photo|photograph/i.test(
      assetText(asset)
    )
  ) {
    score += 7;
  }

  if (
    /source|page|plate|figure/i.test(
      assetText(asset)
    )
  ) {
    score += 3;
  }

  return Math.max(
    20,
    Math.min(98, score)
  );
}

function sceneText(scene: Scene) {
  return `${scene.eyebrow} ${scene.headline} ${scene.body} ${
    scene.sourceLabel || ""
  } ${scene.sourceExcerpt || ""}`;
}

function needFromScene(
  scene: Scene
): VisualRequirementKind {
  const text = sceneText(scene).toLowerCase();
  const kind = scene.visualPlan?.kind as
    | VisualKind
    | undefined;

  if (
    scene.chart ||
    kind === "data_chart"
  ) {
    return "dataset";
  }

  if (
    scene.map ||
    kind === "map_story"
  ) {
    return "map";
  }

  if (
    kind === "systems_diagram" ||
    scene.kind === "diagram"
  ) {
    return "diagram";
  }

  if (
    /satellite|ndvi|vegetation stress|land cover|remote sensing|earth observation/.test(
      text
    )
  ) {
    return "satellite_or_remote_sensing";
  }

  if (
    /field|street|people|community|farmer|livestock|drain|flood|drought|water|waste|road|building|river|maintenance|clearing|impact/.test(
      text
    )
  ) {
    return "documentary_photo";
  }

  if (
    kind === "source_highlight" ||
    scene.kind === "source_highlight" ||
    scene.kind === "document" ||
    scene.kind === "proof_card"
  ) {
    return "source_visual";
  }

  if (
    /histor|archive|before|past|earlier|then|timeline/.test(
      text
    )
  ) {
    return "archive";
  }

  return "none";
}

function requestText(
  scene: Scene,
  requestedKind: VisualRequirementKind
) {
  const subject =
    clean(scene.headline) ||
    clean(scene.eyebrow);

  switch (requestedKind) {
    case "documentary_photo":
      return `Provide a high-resolution documentary image that directly shows: ${subject}. Prefer a real place, process, person, infrastructure or consequence discussed in this scene.`;

    case "field_photo":
      return `Provide a field photograph that directly documents: ${subject}.`;

    case "map":
      return `Provide mapped or geocoded evidence for: ${subject}. The map should answer a spatial question, not simply decorate the scene.`;

    case "dataset":
      return `Provide structured quantitative data for: ${subject}. Prefer CSV/XLSX with clear units, time or categories, and source metadata.`;

    case "source_visual":
      return `Provide the strongest source visual for: ${subject}. An original figure/photo is preferred over a low-resolution PDF page crop.`;

    case "archive":
      return `Provide source-labelled archival imagery for: ${subject}. Keep date, place and source visible.`;

    case "satellite_or_remote_sensing":
      return `Provide a satellite or remote-sensing layer for: ${subject}. Include date, geography, legend or units, and source.`;

    case "diagram":
      return `No external image is required unless stronger evidence exists. Explain ${subject} with an animated systems diagram.`;

    default:
      return `No additional external visual is required for this scene unless a stronger evidence asset becomes available.`;
  }
}

function preferredMinimum(
  requestedKind: VisualRequirementKind
) {
  if (
    requestedKind === "documentary_photo" ||
    requestedKind === "field_photo" ||
    requestedKind === "archive" ||
    requestedKind === "source_visual"
  ) {
    return "Prefer at least 1600×900; 1920×1080 or larger for full-screen use.";
  }

  if (
    requestedKind === "map" ||
    requestedKind ===
      "satellite_or_remote_sensing"
  ) {
    return "Prefer vector/GeoJSON or at least 2000 px raster with readable labels and provenance.";
  }

  if (requestedKind === "dataset") {
    return "CSV/XLSX preferred; include units, dates/categories and source metadata.";
  }

  return undefined;
}

function bestAssetForScene(
  project: EpisodeProject,
  scene: Scene
) {
  const explicit = scene.assetId
    ? project.assets.find(
        (asset) =>
          asset.id === scene.assetId
      )
    : undefined;

  if (explicit) return explicit;

  const scored = project.assets
    .filter((asset) =>
      Boolean(asset.dataUrl)
    )
    .map((asset) => ({
      asset,
      score:
        overlap(
          sceneText(scene),
          assetText(asset)
        ) *
          100 +
        estimatedAssetQuality(asset) *
          0.24,
    }))
    .sort(
      (a, b) =>
        b.score - a.score
    );

  return scored[0]?.score >= 31
    ? scored[0].asset
    : undefined;
}

function sceneRequirement(
  project: EpisodeProject,
  scene: Scene,
  index: number
): VisualRequirement {
  const requestedKind =
    needFromScene(scene);

  const asset = bestAssetForScene(
    project,
    scene
  );

  const assetQuality =
    estimatedAssetQuality(asset);

  const nativeReady =
    Boolean(scene.chart) ||
    Boolean(scene.map) ||
    requestedKind === "diagram" ||
    requestedKind === "none";

  let status: VisualRequirementStatus =
    "missing";

  if (nativeReady) {
    status = "ready";
  } else if (
    asset &&
    assetQuality >= 78
  ) {
    status = "ready";
  } else if (asset) {
    status = "upgrade";
  }

  const priority: VisualRequirement["priority"] =
    index === 0 ||
    scene.kind === "cta" ||
    /impact|mechanism|maintenance|flow path|geographic|map|trigger/i.test(
      sceneText(scene)
    )
      ? "critical"
      : status === "missing"
        ? "high"
        : "medium";

  const qualityNote =
    asset &&
    assetQuality < 78
      ? ` Current asset quality is estimated at ${assetQuality}/100. Keep it for provenance, but replace it in the production cut if a better original is available.`
      : "";

  return {
    sceneId: scene.id,
    sceneNumber: index + 1,
    sceneLabel:
      clean(scene.headline) ||
      `Scene ${index + 1}`,
    requestedKind,
    status,
    priority,
    reason:
      status === "ready"
        ? "The scene already has an appropriate production visual."
        : status === "upgrade"
          ? `The scene has relevant evidence, but the production asset is not strong enough for a premium full-screen cut.${qualityNote}`
          : "The scene has no strong production visual yet. Request one instead of filling the scene with a generic card.",
    request: requestText(
      scene,
      requestedKind
    ),
    preferredMinimum:
      preferredMinimum(
        requestedKind
      ),
    currentAssetId: asset?.id,
    currentAssetName: asset?.name,
    currentAssetQuality: asset
      ? assetQuality
      : undefined,
    replacementRecommended:
      Boolean(asset) &&
      assetQuality < 78,
  };
}

export function buildVisualRequirements(
  project: EpisodeProject
): VisualRequirementsReport {
  const requirements =
    project.scenes.map(
      (scene, index) =>
        sceneRequirement(
          project,
          scene,
          index
        )
    );

  const ready =
    requirements.filter(
      (item) =>
        item.status === "ready"
    ).length;

  const upgrade =
    requirements.filter(
      (item) =>
        item.status === "upgrade"
    ).length;

  const missing =
    requirements.filter(
      (item) =>
        item.status === "missing"
    ).length;

  const weighted =
    requirements.reduce(
      (sum, item) => {
        if (
          item.status === "ready"
        ) {
          return sum + 1;
        }

        if (
          item.status === "upgrade"
        ) {
          return sum + 0.55;
        }

        return sum;
      },
      0
    );

  const readiness = Math.round(
    (weighted /
      Math.max(
        1,
        requirements.length
      )) *
      100
  );

  const priorityRank = {
    critical: 3,
    high: 2,
    medium: 1,
  };

  const topRequests = [
    ...requirements,
  ]
    .filter(
      (item) =>
        item.status !== "ready"
    )
    .sort((a, b) => {
      const priority =
        priorityRank[b.priority] -
        priorityRank[a.priority];

      if (priority) {
        return priority;
      }

      return (
        a.sceneNumber -
        b.sceneNumber
      );
    })
    .slice(0, 8);

  return {
    generatedAt:
      new Date().toISOString(),
    readiness,
    ready,
    upgrade,
    missing,
    requirements,
    topRequests,
  };
}

export function applyVisualAssetRequirements(
  project: EpisodeProject,
  scenes: Scene[] =
    project.scenes
): Scene[] {
  const nextProject = {
    ...project,
    scenes,
  };

  return scenes.map(
    (scene, index) => {
      if (
        scene.chart ||
        scene.map
      ) {
        return scene;
      }

      if (
        scene.visualPlan?.kind ===
        "systems_diagram"
      ) {
        return scene;
      }

      const requirement =
        sceneRequirement(
          nextProject,
          scene,
          index
        );

      if (
        !scene.assetId &&
        requirement.currentAssetId &&
        (requirement.status ===
          "ready" ||
          requirement.status ===
            "upgrade")
      ) {
        return {
          ...scene,
          assetId:
            requirement.currentAssetId,
        };
      }

      return scene;
    }
  );
}

export function visualRequirementWarnings(
  project: EpisodeProject
) {
  const report =
    buildVisualRequirements(
      project
    );

  const lines =
    report.topRequests.map(
      (item) => {
        const action =
          item.status === "upgrade"
            ? "UPGRADE"
            : "PROVIDE";

        return [
          `VISUAL REQUEST · Scene ${String(
            item.sceneNumber
          ).padStart(
            2,
            "0"
          )} · ${action}`,
          item.request,
          item.preferredMinimum,
          item.currentAssetQuality !==
          undefined
            ? `Current production quality: ${item.currentAssetQuality}/100.`
            : undefined,
        ]
          .filter(Boolean)
          .join(" ");
      }
    );

  return {
    report,
    lines,
  };
}
