import {
  buildGenericLongFormNarration,
  buildLongFormPlan,
} from "./long-form-documentary";
import {
  buildMechanismCoveragePlan,
} from "./mechanism-coverage";
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
  const sentences = spokenUnits(scene.narration)
    .replace(/\bcurrent story-grounded evidence[^.]*\.?/gi, "")
    .replace(/\bstory-grounded evidence[^.]*\.?/gi, "")
    .replace(/\bthe story is built only from evidence[^.]*\.?/gi, "")
    .replace(/\b(?:figure|plate|table|map)\s+\d+(?:[-.:]\d+)*:\s*/gi, "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => clean(sentence))
    .filter(Boolean)
    .filter(
      (sentence) =>
        !/^source\s*:/i.test(sentence) &&
        !/\bdelhi\b|\bindia\b/i.test(sentence) &&
        !/\bsteven\s*\(\d{4}\)/i.test(sentence) &&
        !/\bworld meteorological organization\b/i.test(sentence) &&
        !/urban flooding is significantly differs/i.test(sentence) &&
        !/this has built up by the fact that/i.test(sentence) &&
        !/rainfall .*decreased from .*jan .* to .*dec/i.test(sentence) &&
        !/^the evidence indicates that clogged drainage systems\.?$/i.test(sentence) &&
        !/^source\s*:/i.test(sentence)
    );

  return {
    ...scene,
    narration: sentences.join(" ").replace(/\s+/g, " ").trim(),
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
  const coveragePlan = buildMechanismCoveragePlan(
    project,
    datasetsOverride
  );

  const actualWords = totalWords(finalScenes);
  const coverage = Math.round(
    (actualWords / Math.max(1, plan.targetWords)) * 100
  );

  const directorWarnings = [
    ...(project.retention?.warnings || []),
    ...coveragePlan.warnings,
  ];

  if (coverage < 78) {
    directorWarnings.push(
      `Narration coverage is ${coverage}% of the requested ${project.episode.targetMinutes}-minute episode. The mechanism coverage plan has been exhausted; additional usable evidence or additional story scenes may be required to reach the full duration without filler.`
    );
  }

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
          warnings: Array.from(
            new Set(directorWarnings)
          ),
        }
      : project.retention,
  };
}
