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
        !/^the evidence indicates that clogged drainage systems\.?$/i.test(sentence)
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


function includesAnyNarration(
  scenes: Scene[],
  patterns: RegExp[]
) {
  const text = scenes
    .map((scene) => clean(scene.narration))
    .join(" ");
  return patterns.some((pattern) => pattern.test(text));
}

function ensureFinalThird(
  project: EpisodeProject,
  scenes: Scene[]
): Scene[] {
  const next = scenes.map((scene) => ({ ...scene }));

  const ctaIndex = next
    .map((scene, index) => ({ scene, index }))
    .reverse()
    .find(({ scene }) => scene.kind === "cta")?.index;

  if (ctaIndex === undefined || ctaIndex < 1) {
    return next;
  }

  const targetIndex = ctaIndex - 1;
  const target = next[targetIndex];

  const additions: string[] = [];

  if (
    !includesAnyNarration(next, [
      /flooded roads/i,
      /stranded vehicles/i,
      /mobility.+safety/i,
    ])
  ) {
    additions.push(
      "The consequences become visible when water interrupts movement, damages property or cuts access through the city.",
      "The South C evidence includes flooded roads and stranded vehicles, showing the point where a drainage problem becomes an urban mobility and safety problem.",
      "At that stage, the cost of flooding spreads beyond stormwater infrastructure into access, travel time, property and everyday urban life."
    );
  }

  if (
    !includesAnyNarration(next, [
      /planning trade-off/i,
      /planning tradeoff/i,
      /maintenance alone cannot/i,
    ])
  ) {
    additions.push(
      "There is also a planning trade-off.",
      "Nairobi needs housing, roads and continued development, but changes in land cover can increase runoff and add pressure to existing drainage.",
      "Maintenance alone cannot solve a structural mismatch if runoff keeps increasing faster than drainage capacity.",
      "The response therefore has to combine drainage investment, land-use control, routine maintenance and protection of natural flow paths."
    );
  }

  if (
    !includesAnyNarration(next, [
      /most detailed evidence.+south c/i,
      /what can travel beyond south c/i,
      /does not prove.+every.+nairobi/i,
    ])
  ) {
    additions.push(
      "Before the final conclusion, one evidence boundary has to stay visible.",
      "The most detailed evidence on paving, drainage condition, blockage, maintenance and local flood impacts in this story comes from the South C case study.",
      "That gives us a well-documented local mechanism, but it does not prove that exactly the same combination of drivers operates in every flood-prone part of Nairobi.",
      "What can travel beyond South C is the causal logic; what cannot be assumed is that every neighbourhood has the same drainage condition, land-use pattern or exposure."
    );
  }

  if (additions.length) {
    next[targetIndex] = {
      ...target,
      narration: clean(
        `${target.narration} ${additions.join(" ")}`
      ),
    };
  }

  return next;
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

  const withFinalThird =
    ensureFinalThird(
      project,
      composed
    );

  const finalScenes =
    applyPremiumEnding(
      project,
      withFinalThird
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
