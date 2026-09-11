import type {
  EpisodeProject,
  Scene,
} from "./types";

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWeakCta(
  text: string
) {
  return clean(text)
    .replace(
      /\b(?:like|share|subscribe)\b[^.?!]*[.?!]?/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function premiumEndingNarration(
  project: EpisodeProject,
  scene: Scene
) {
  const question = clean(
    project.episode.question
  );

  const existing =
    stripWeakCta(
      scene.narration
    );

  const resolution = existing
    ? existing
    : "The evidence does not point to one simple answer. It points to a system whose parts have to be understood together.";

  const callback = question
    ? `We started with a question: ${question} The answer is clearer now, but the evidence also shows where the next questions begin.`
    : "The answer is clearer now, but the evidence also shows where the next questions begin.";

  return clean(
    `${resolution} ${callback} If evidence-led stories like this change how you see the world, stay with Evidence Studio. The sources remain with the story, the uncertainty remains visible, and the next episode starts where the evidence leads.`
  );
}

export function applyPremiumEnding(
  project: EpisodeProject,
  scenes: Scene[] =
    project.scenes
): Scene[] {
  const lastCtaIndex =
    scenes
      .map(
        (scene, index) => ({
          scene,
          index,
        })
      )
      .reverse()
      .find(
        ({ scene }) =>
          scene.kind === "cta"
      )?.index;

  if (
    lastCtaIndex === undefined
  ) {
    return scenes;
  }

  return scenes.map(
    (scene, index) => {
      if (
        index !== lastCtaIndex
      ) {
        return scene;
      }

      return {
        ...scene,
        eyebrow:
          "THE FINAL FRAME",
        headline:
          clean(
            scene.headline
          ) ||
          "The visible event is only the surface.",
        body:
          clean(scene.body) ||
          "Follow the evidence. Keep the uncertainty visible.",
        narration:
          premiumEndingNarration(
            project,
            scene
          ),
        retentionPurpose:
          "Premium closure: resolve the opening question, leave one memorable final idea, then invite the viewer into the next evidence-led story without a generic social-media CTA.",
        visualLabels: [
          "Question",
          "Evidence",
          "System",
          "What remains uncertain",
          "Next question",
        ],
      };
    }
  );
}
