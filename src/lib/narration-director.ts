import {
  buildGenericLongFormNarration,
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
    .replace(/\b%\b/g, " percent");
}

function finalNarrationCleanup(scene: Scene) {
  let narration = spokenUnits(scene.narration);

  narration = narration
    .replace(
      /\b(?:the source is|source:)\s+[^.]+\.?/gi,
      " "
    )
    .replace(
      /\bthe source-backed observation is:\s*/gi,
      ""
    )
    .replace(
      /\bthe story is built only from evidence[^.]*\.?/gi,
      ""
    )
    .replace(
      /\bthe analytical value of this scene[^.]*\.?/gi,
      ""
    )
    .replace(
      /\ba mechanism is convincing only when the arrows[^.]*\.?/gi,
      ""
    )
    .replace(
      /\bthe chart makes the comparison visible\.?/gi,
      ""
    )
    .replace(
      /\bnow move from description to measurement\.?/gi,
      ""
    )
    .replace(
      /\blocation is not decoration here[^.]*\.?/gi,
      ""
    )
    .replace(
      /\b(?:figure|plate|table|map)\s+\d+(?:[-.:]\d+)*:\s*/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return {
    ...scene,
    narration,
  };
}

function sentenceKey(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeExactGlobalRepeats(scenes: Scene[]) {
  const seen = new Set<string>();

  return scenes.map((scene) => {
    const parts = clean(scene.narration)
      .split(/(?<=[.!?])\s+/)
      .map(clean)
      .filter(Boolean);

    const kept = parts.filter((sentence) => {
      const key = sentenceKey(sentence);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    return {
      ...scene,
      narration: clean(kept.join(" ")),
    };
  });
}

export function applyNarrationDirector(
  project: EpisodeProject,
  datasetsOverride?: DatasetAnalysis[]
): EpisodeProject {
  /*
   * The long-form composer is now the only place that builds documentary
   * narration. Do not separately append chart, map, source or analytical
   * paragraphs here; that was the main cause of repetition.
   */
  const composed = buildGenericLongFormNarration(
    project,
    datasetsOverride
  )
    .map(finalNarrationCleanup);

  const deduped = removeExactGlobalRepeats(composed);

  const finalScenes = applyPremiumEnding(
    project,
    deduped
  );

  return {
    ...project,
    scenes: finalScenes,
  };
}
