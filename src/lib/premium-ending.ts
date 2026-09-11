import {
  resolvedNarrationQuestion,
} from "./long-form-documentary";
import type {
  EpisodeProject,
  Scene,
} from "./types";

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWeakCta(text: string) {
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
  const question =
    resolvedNarrationQuestion(project);

  const existing =
    stripWeakCta(scene.narration);

  const resolution =
    existing ||
    "The evidence points to a chain of conditions rather than one simple cause.";

  const callback = question
    ? `We started with a simple question: ${question} The answer is clearer now, but the limits of the current evidence still matter.`
    : "The answer is clearer now, but the limits of the current evidence still matter.";

  return clean(
    `${resolution} ${callback} Follow the evidence with Evidence Studio.`
  );
}

export function applyPremiumEnding(
  project: EpisodeProject,
  scenes: Scene[] = project.scenes
): Scene[] {
  const lastCtaIndex = scenes
    .map((scene, index) => ({
      scene,
      index,
    }))
    .reverse()
    .find(
      ({ scene }) =>
        scene.kind === "cta"
    )?.index;

  if (lastCtaIndex === undefined) {
    return scenes;
  }

  return scenes.map((scene, index) => {
    if (index !== lastCtaIndex) {
      return scene;
    }

    return {
      ...scene,
      eyebrow: "THE FINAL FRAME",
      headline:
        clean(scene.headline) ||
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
        "Resolve the opening question, preserve the evidence boundary, and leave one memorable final idea.",
      visualLabels: [
        "Question",
        "Evidence",
        "System",
        "What remains uncertain",
      ],
    };
  });
}
