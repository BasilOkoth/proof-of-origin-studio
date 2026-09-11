import {
  buildGenericLongFormNarration,
  buildLongFormPlan,
} from "./long-form-documentary";
import {
  applyPremiumEnding,
} from "./premium-ending";
import type {
  DatasetAnalysis,
  EpisodeProject,
  Scene,
} from "./types";

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function spokenUnits(value: string) {
  return clean(value)
    .replace(/\b7-day\b/gi, "seven-day")
    .replace(/\b24h\b/gi, "twenty-four-hour")
    .replace(/\b24-hour\b/gi, "twenty-four-hour")
    .replace(/\bmm\b/gi, "millimetres")
    .replace(/\bkm2\b/gi, "square kilometres")
    .replace(/\bkm\b/gi, "kilometres")
    .replace(/\b%/g, " percent");
}

function cleanup(scene: Scene) {
  return {
    ...scene,
    narration: spokenUnits(scene.narration)
      .replace(/\bcurrent story-grounded evidence[^.]*\.?/gi, "")
      .replace(/\bstory-grounded evidence[^.]*\.?/gi, "")
      .replace(/\b(?:figure|plate|table|map)\s+\d+(?:[-.:]\d+)*:\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function wordCount(value: string) {
  return clean(value).match(/\S+/g)?.length || 0;
}

function totalWords(scenes: Scene[]) {
  return scenes.reduce(
    (sum, scene) => sum + wordCount(scene.narration),
    0
  );
}

export function applyNarrationDirector(
  project: EpisodeProject,
  datasetsOverride?: DatasetAnalysis[]
): EpisodeProject {
  const composed =
    buildGenericLongFormNarration(
      project,
      datasetsOverride
    ).map(cleanup);

  const finalScenes =
    applyPremiumEnding(
      project,
      composed
    );

  const plan = buildLongFormPlan(project);
  const actualWords = totalWords(finalScenes);
  const coverage = Math.round(
    (actualWords / Math.max(1, plan.targetWords)) * 100
  );

  return {
    ...project,
    episode: {
      ...project.episode,
      targetMinutes: project.episode.targetMinutes,
    },
    scenes: finalScenes,
    retention: project.retention
      ? {
          ...project.retention,
          warnings:
            coverage < 72
              ? Array.from(
                  new Set([
                    ...(project.retention.warnings || []),
                    `Narration coverage is ${coverage}% of the requested ${project.episode.targetMinutes}-minute episode. The director has expanded mechanism depth without inventing unsupported facts; additional usable evidence may still be required for the full target duration.`,
                  ])
                )
              : project.retention.warnings,
        }
      : project.retention,
  };
}
