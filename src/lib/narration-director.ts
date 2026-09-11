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

function spokenUnits(text: string) {
  return clean(text)
    .replace(
      /\((?:mm|millimetres)\)/gi,
      ""
    )
    .replace(
      /\b7-day\b/gi,
      "seven-day"
    )
    .replace(
      /\b24h\b/gi,
      "twenty-four-hour"
    )
    .replace(
      /\b24-hour\b/gi,
      "twenty-four-hour"
    )
    .replace(
      /\bmm\b/gi,
      "millimetres"
    )
    .replace(
      /\bkm\b/gi,
      "kilometres"
    )
    .replace(
      /\bkm2\b/gi,
      "square kilometres"
    )
    .replace(
      /\b%\b/g,
      " percent"
    );
}

function stripMetaNarration(
  text: string
) {
  return clean(text)
    .replace(
      /The story is built only from evidence that still matches the active topic and question\.?/gi,
      ""
    )
    .replace(
      /The evidence card remains visible so the viewer can inspect the source behind the claim\.?/gi,
      ""
    )
    .replace(
      /The point of the chart is not decoration\.?/gi,
      ""
    )
    .replace(
      /The map shows where the measured evidence exists and keeps the viewer from treating every part of .*? as interchangeable\.?/gi,
      ""
    )
    .replace(
      /Where the evidence is still incomplete, that gap becomes the next research task.?not a sentence invented for the video\.?/gi,
      "Where the evidence is incomplete, that uncertainty stays visible."
    )
    .replace(
      /\s{2,}/g,
      " "
    )
    .trim();
}

function chartNarration(
  scene: Scene,
  current: string
) {
  const chart =
    scene.chart;

  if (!chart) {
    return current;
  }

  const ranked =
    [...chart.data]
      .filter((item) =>
        Number.isFinite(
          item.value
        )
      )
      .sort(
        (a, b) =>
          b.value - a.value
      );

  const top =
    ranked[0];

  const second =
    ranked[1];

  const unit =
    chart.unit
      ? spokenUnits(
          chart.unit
        )
      : spokenUnits(
          chart.yLabel ||
            "units"
        );

  if (
    top &&
    second
  ) {
    return clean(
      `${current} The measured comparison is clear: ${top.label} has the highest plotted value at ${top.value.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })} ${unit}, followed by ${second.label} at ${second.value.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })} ${unit}. The chart establishes the measured pattern; any causal explanation still has to come from evidence that directly addresses the mechanism.`
    );
  }

  return clean(
    `${current} The chart turns the available measurements into a visible pattern, while the causal interpretation remains separate from the measurement itself.`
  );
}

function mapNarration(
  scene: Scene,
  current: string
) {
  if (!scene.map) {
    return current;
  }

  const labels =
    scene.map.points
      .slice(0, 5)
      .map((point) =>
        point.label
      )
      .filter(Boolean);

  const mapped =
    labels.length
      ? `The mapped observations include ${labels.join(", ")}.`
      : `The map locates the available observations in space.`;

  return clean(
    `${current} ${mapped} Geography matters because evidence from one place should not automatically be treated as representative of every other place.`
  );
}

function polishScene(
  scene: Scene
) {
  let narration =
    stripMetaNarration(
      scene.narration
    );

  if (scene.chart) {
    narration =
      chartNarration(
        scene,
        narration
      );
  } else if (scene.map) {
    narration =
      mapNarration(
        scene,
        narration
      );
  }

  return {
    ...scene,
    narration:
      spokenUnits(
        narration
      ),
  };
}

function similarityKey(
  text: string
) {
  return clean(text)
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      ""
    )
    .replace(
      /\b(the|a|an|this|that|now|shows|show|data|evidence)\b/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function jaccard(
  a: string,
  b: string
) {
  const aa =
    new Set(
      similarityKey(a)
        .split(" ")
        .filter(Boolean)
    );

  const bb =
    new Set(
      similarityKey(b)
        .split(" ")
        .filter(Boolean)
    );

  if (
    !aa.size ||
    !bb.size
  ) {
    return 0;
  }

  let overlap = 0;

  for (
    const token of aa
  ) {
    if (
      bb.has(token)
    ) {
      overlap += 1;
    }
  }

  const union =
    new Set([
      ...aa,
      ...bb,
    ]).size;

  return union
    ? overlap / union
    : 0;
}

function removeAdjacentDuplication(
  scenes: Scene[]
) {
  let previous = "";

  return scenes.map(
    (scene) => {
      let narration =
        clean(
          scene.narration
        );

      if (
        previous &&
        jaccard(
          previous,
          narration
        ) > 0.78
      ) {
        const body =
          spokenUnits(
            scene.body
          );

        if (
          scene.map
        ) {
          narration =
            clean(
              `Now put the evidence in place. ${body}`
            );
        } else if (
          scene.chart
        ) {
          narration =
            clean(
              `Now compare the measured pattern directly. ${body}`
            );
        } else {
          narration =
            clean(
              `${body} This scene adds a distinct part of the explanation rather than repeating the previous point.`
            );
        }
      }

      previous =
        narration;

      return {
        ...scene,
        narration,
      };
    }
  );
}

export function applyNarrationDirector(
  project: EpisodeProject,
  datasetsOverride?: DatasetAnalysis[]
): EpisodeProject {
  /*
   * 1. Clean the story's existing narration without inserting topic-specific
   *    assumptions.
   */
  const polished =
    project.scenes.map(
      polishScene
    );

  /*
   * 2. Expand long-form documentary stories from the actual project question,
   *    scenes, evidence, charts, maps and limitations.
   *
   *    There is deliberately no "Nairobi", "flood", "drought", "mining",
   *    "waste" or other topic-specific switch here.
   */
  const expanded =
    buildGenericLongFormNarration(
      {
        ...project,
        scenes: polished,
      },
      datasetsOverride
    );

  /*
   * 3. Remove accidental adjacent repetition after the generic expansion.
   */
  const deduped =
    removeAdjacentDuplication(
      expanded
    );

  /*
   * 4. Finish with the reusable premium documentary closure.
   */
  const finalScenes =
    applyPremiumEnding(
      project,
      deduped
    );

  return {
    ...project,
    scenes: finalScenes,
  };
}
