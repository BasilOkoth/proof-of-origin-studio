import type { EpisodeProject, Scene } from "./types";
import { buildEpisodeMediaPlan } from "./media-scout";
import { buildAudioDirectionPlan } from "./audio-director";

export type ShotRole =
  | "broll"
  | "archive"
  | "map"
  | "chart"
  | "document"
  | "diagram"
  | "quiet"
  | "headline";

export type ShotInstruction = {
  sceneId: string;
  role: ShotRole;
  query?: string;
  alternateQuery?: string;
  reason: string;
  motion: "static" | "slow_push" | "pan" | "parallax" | "kinetic" | "route" | "plot";
  treatment: string;
  evidenceIds: string[];
  priority: "hero" | "support" | "texture";
};

export type ProductionIntelligence = {
  version: "production-intelligence-1";
  generatedAt: string;
  shots: ShotInstruction[];
  maps: Array<{
    sceneId: string;
    title: string;
    pointCount: number;
    source?: string;
  }>;
  charts: Array<{
    sceneId: string;
    title: string;
    type: string;
    source?: string;
  }>;
  audio: ReturnType<typeof buildAudioDirectionPlan>;
  rhythm: Array<{
    sceneId: string;
    startSec: number;
    durationSec: number;
    reset: boolean;
    note: string;
  }>;
  warnings: string[];
  score: number;
};

const physicalWorld =
  /\b(city|street|market|landfill|river|forest|farm|factory|workers|people|residents|community|transport|construction|coast|mangrove|school|hospital|port|mine|waste|recycling)\b/i;

const archiveWords =
  /\b(history|historical|formerly|decade|year|archive|newspaper|policy|law|agreement|report|announced|launched|founded)\b/i;

const systemWords =
  /\b(flow|system|network|chain|process|cycle|relationship|mechanism|pathway)\b/i;

function text(scene: Scene) {
  return `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.narration}`;
}

function sceneStart(project: EpisodeProject, index: number) {
  return project.scenes
    .slice(0, index)
    .reduce((sum, scene) => sum + scene.durationSec, 0);
}

function chooseRole(scene: Scene): ShotRole {
  if (scene.kind === "map_story" || scene.map) return "map";
  if (scene.kind === "data_chart" || scene.chart) return "chart";

  if (
    scene.kind === "document" ||
    scene.kind === "source_highlight" ||
    scene.kind === "proof_card"
  ) {
    return "document";
  }

  if (scene.kind === "diagram" || systemWords.test(text(scene))) return "diagram";
  if (archiveWords.test(text(scene))) return "archive";
  if (scene.kind === "quote") return "quiet";
  if (scene.kind === "hook" || physicalWorld.test(text(scene))) return "broll";

  return "headline";
}

function motionFor(
  role: ShotRole,
  scene: Scene
): ShotInstruction["motion"] {
  if (role === "map") return "route";
  if (role === "chart") return "plot";
  if (role === "diagram") return "kinetic";
  if (role === "broll" || role === "archive") {
    return scene.kind === "hook" ? "slow_push" : "pan";
  }
  if (role === "document") return "parallax";
  return "static";
}

function treatmentFor(role: ShotRole) {
  const treatments: Record<ShotRole, string> = {
    broll:
      "Documentary-real imagery. Prefer authentic location and process over generic stock. Use restrained crop movement and avoid obvious loops.",
    archive:
      "Use dated and source-labelled archival material with visible provenance. Add subtle paper or screen texture, not fake vintage damage.",
    map:
      "Start wide, establish geography, then animate a route, cluster, boundary or point reveal tied directly to narration.",
    chart:
      "One visual claim per chart. Animate values in narration order, label the source, and highlight only the comparison being discussed.",
    document:
      "Show the source itself. Crop to the exact line or value being discussed and use callouts with page and source labels.",
    diagram:
      "Build the mechanism progressively. Reveal nodes and arrows only when narration introduces them.",
    quiet:
      "Reduce visual movement and score energy. Give the line room with one strong image or typography.",
    headline:
      "Use clean editorial typography as a reset, then return quickly to evidence or real-world imagery.",
  };

  return treatments[role];
}

export function buildProductionIntelligence(
  project: EpisodeProject
): ProductionIntelligence {
  const media = new Map(
    buildEpisodeMediaPlan(project).map((item) => [item.scene.id, item])
  );

  const shots: ShotInstruction[] = project.scenes.map((scene) => {
    const role = chooseRole(scene);
    const scout = media.get(scene.id);

    return {
      sceneId: scene.id,
      role,
      query: scout?.primary,
      alternateQuery: scout?.alternate,
      reason: scout?.reason || `The scene is best expressed as ${role}.`,
      motion: motionFor(role, scene),
      treatment: treatmentFor(role),
      evidenceIds: scene.factIds,
      priority:
        scene.kind === "hook" ||
        scene.kind === "confidence" ||
        scene.kind === "value_swap"
          ? "hero"
          : role === "headline"
          ? "texture"
          : "support",
    };
  });

  const maps = project.scenes.flatMap((scene) =>
    scene.map
      ? [
          {
            sceneId: scene.id,
            title: scene.map.title,
            pointCount: scene.map.points.length,
            source: scene.map.sourceLabel,
          },
        ]
      : []
  );

  const charts = project.scenes.flatMap((scene) =>
    scene.chart
      ? [
          {
            sceneId: scene.id,
            title: scene.chart.title,
            type: scene.chart.type,
            source: scene.chart.sourceLabel,
          },
        ]
      : []
  );

  const rhythm = project.scenes.map((scene, index) => {
    const startSec = sceneStart(project, index);
    const previousRole = index ? shots[index - 1].role : undefined;
    const role = shots[index].role;

    const reset =
      index === 0 ||
      role !== previousRole ||
      scene.durationSec > 35 ||
      scene.kind === "quote" ||
      scene.kind === "value_swap";

    return {
      sceneId: scene.id,
      startSec,
      durationSec: scene.durationSec,
      reset,
      note: reset
        ? `Visual reset: ${previousRole ? `${previousRole} → ` : ""}${role}.`
        : `Maintain visual continuity in ${role}.`,
    };
  });

  const warnings: string[] = [];

  const brollCount = shots.filter(
    (shot) => shot.role === "broll" || shot.role === "archive"
  ).length;

  const evidenceScenes = shots.filter((shot) =>
    ["map", "chart", "document", "diagram"].includes(shot.role)
  ).length;

  if (brollCount < Math.max(2, Math.floor(project.scenes.length * 0.2))) {
    warnings.push(
      "The episode may feel too card-heavy. Add more real-world or archival imagery."
    );
  }

  if (
    !maps.length &&
    project.evidence.some(
      (item) => item.latitude != null && item.longitude != null
    )
  ) {
    warnings.push(
      "Geocoded evidence exists but no map scene is currently using it."
    );
  }

  if (
    !charts.length &&
    project.evidence.filter((item) => item.value != null).length >= 2
  ) {
    warnings.push(
      "Numeric evidence exists but no chart scene is currently using it."
    );
  }

  if (
    rhythm.filter((item) => item.reset).length <
    Math.ceil(project.scenes.length / 3)
  ) {
    warnings.push(
      "Visual rhythm is too uniform. Add pattern interrupts or visual resets."
    );
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        35 +
          Math.min(25, brollCount * 5) +
          Math.min(25, evidenceScenes * 4) +
          Math.min(15, rhythm.filter((item) => item.reset).length * 2) -
          warnings.length * 5
      )
    )
  );

  return {
    version: "production-intelligence-1",
    generatedAt: new Date().toISOString(),
    shots,
    maps,
    charts,
    audio: buildAudioDirectionPlan(project),
    rhythm,
    warnings,
    score,
  };
}
