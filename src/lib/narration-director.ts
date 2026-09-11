import {
  buildGenericLongFormNarration,
  buildLongFormPlan,
  roleForScene,
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
      .replace(/\b(?:the source is|source:)\s+[^.]+\.?/gi, " ")
      .replace(/\bthe source-backed observation is:\s*/gi, "")
      .replace(/\bthe story is built only from evidence[^.]*\.?/gi, "")
      .replace(/\bthe analytical value of this scene[^.]*\.?/gi, "")
      .replace(/\ba mechanism is convincing only when the arrows[^.]*\.?/gi, "")
      .replace(/\ba strong explanation has to move from the visible event[^.]*\.?/gi, "")
      .replace(/\bcurrent story-grounded evidence[^.]*\.?/gi, "")
      .replace(/\bstory-grounded evidence[^.]*\.?/gi, "")
      .replace(/\b(?:figure|plate|table|map)\s+\d+(?:[-.:]\d+)*:\s*/gi, "")
      .replace(/^\s*[a-z]\)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function words(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function semanticSimilarity(a: string, b: string) {
  const aa = new Set(words(a));
  const bb = new Set(words(b));

  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  aa.forEach((word) => {
    if (bb.has(word)) overlap += 1;
  });

  return overlap / Math.max(1, Math.min(aa.size, bb.size));
}

function conceptualKey(value: string) {
  const text = clean(value).toLowerCase();

  if (
    /follow .*(trigger|cause).*(outcome|damage)|follow .*mechanism|pathway/.test(
      text
    )
  ) {
    return "pathway";
  }

  if (
    /put .*measurements .*map|put .*evidence .*place|mapped observations/.test(
      text
    )
  ) {
    return "map";
  }

  if (
    /start .*measure|what can be measured|measure the trigger/.test(text)
  ) {
    return "measure";
  }

  if (
    /does not prove|cannot establish|limitation|boundary|should not be read as evidence/.test(
      text
    )
  ) {
    return "boundary";
  }

  if (
    /single cause|rather than one cause|rather than a single cause/.test(text)
  ) {
    return "synthesis";
  }

  return "";
}

function exactSceneLabel(scene: Scene, sentence: string) {
  const key = (value: string) =>
    clean(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();

  const candidate = key(sentence);

  return (
    candidate &&
    (
      candidate === key(scene.headline) ||
      candidate === key(scene.eyebrow)
    )
  );
}

function storyLevelDeduplication(
  project: EpisodeProject,
  scenes: Scene[]
) {
  const seenSentences: string[] = [];
  const seenConcepts = new Set<string>();

  return scenes.map((scene, index) => {
    const role = roleForScene(project, scene, index);

    const kept = clean(scene.narration)
      .split(/(?<=[.!?])\s+/)
      .map(clean)
      .filter(Boolean)
      .filter((sentence) => {
        if (
          exactSceneLabel(scene, sentence) ||
          /current story-grounded evidence|story-grounded evidence|evidence items?|this draft|current story/i.test(
            sentence
          )
        ) {
          return false;
        }

        const concept = conceptualKey(sentence);

        if (
          concept &&
          seenConcepts.has(concept) &&
          role !== "closure"
        ) {
          return false;
        }

        const duplicate = seenSentences.some((existing) => {
          const score = semanticSimilarity(existing, sentence);
          const short =
            Math.min(words(existing).length, words(sentence).length) <= 10;

          return score >= (short ? 0.6 : 0.7);
        });

        if (duplicate) {
          return false;
        }

        if (concept) {
          seenConcepts.add(concept);
        }

        seenSentences.push(sentence);
        return true;
      });

    return {
      ...scene,
      narration: clean(kept.join(" ")),
    };
  });
}

function narrationWordCount(scenes: Scene[]) {
  return scenes.reduce(
    (sum, scene) =>
      sum +
      (clean(scene.narration).match(/\S+/g)?.length || 0),
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

  const deduped =
    storyLevelDeduplication(
      project,
      composed
    );

  const finalScenes =
    applyPremiumEnding(
      project,
      deduped
    );

  const plan = buildLongFormPlan(project);
  const actualWords = narrationWordCount(finalScenes);

  /*
   * Keep the original requested duration. The narration route reports
   * coverage separately, but the director must never silently rewrite
   * episode.targetMinutes to match a short script.
   */
  return {
    ...project,
    episode: {
      ...project.episode,
      targetMinutes:
        project.episode.targetMinutes,
    },
    scenes: finalScenes,
    titles: project.titles,
    publishing: project.publishing,
    ...(actualWords < plan.targetWords * 0.72
      ? {
          retention: project.retention
            ? {
                ...project.retention,
                warnings: Array.from(
                  new Set([
                    ...(project.retention.warnings || []),
                    `Narration coverage is only ${Math.round(
                      (actualWords /
                        Math.max(1, plan.targetWords)) *
                        100
                    )}% of the requested ${project.episode.targetMinutes}-minute episode. Add more source-backed evidence rather than padding with generic filler.`,
                  ])
                ),
              }
            : project.retention,
        }
      : {}),
  };
}
