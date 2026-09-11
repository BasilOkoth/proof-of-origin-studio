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
    "The evidence points to a system rather than one simple cause.";

  const callback = question
    ? `We started with a question: ${question} The answer is clearer now, and so are the limits of what the current evidence can establish.`
    : "The answer is clearer now, and so are the limits of what the current evidence can establish.";

  return clean(
    `${resolution} ${callback} Follow the evidence with Evidence Studio. The sources stay with the story, the uncertainty stays visible, and the next episode starts with the next question worth explaining.`
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
        "Premium closure: resolve the opening question, leave one memorable final idea, then invite the viewer into the next evidence-led story.",
      visualLabels: [
        "Question",
        "Evidence",
        "System",
        "What remains uncertain",
        "Next question",
      ],
    };
  });
}
