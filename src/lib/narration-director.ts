import type { EpisodeProject, Scene } from "./types";

function clean(value?: string) {
  return (value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function stripMetaNarration(text: string) {
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
      /The map shows where the measured evidence exists and keeps the viewer from treating every part of Nairobi as interchangeable\.?/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function polishSystemsIntro(scene: Scene, text: string) {
  const headline = clean(scene.headline).toLowerCase();

  if (
    headline.includes("rain is the trigger") ||
    headline.includes("what turns it into a disaster")
  ) {
    return [
      "Heavy rain can trigger flooding.",
      "But between the rain and the damage sits an urban system: drains, waterways, built surfaces, settlement patterns and the institutions that maintain them.",
      "The question is what happens to water as it moves through that system.",
    ].join(" ");
  }

  return text;
}

function polishTrustBoundary(scene: Scene, text: string) {
  const trustBoundary =
    clean(scene.eyebrow).toLowerCase().includes("trust boundary") ||
    clean(scene.headline).toLowerCase().includes("evidence still not prove");

  if (!trustBoundary) return text;

  return clean(text)
    .replace(
      /^This is where the evidence stops\.\s*/i,
      "This is where the evidence becomes narrower. "
    );
}

function removeDuplicateOpening(scene: Scene, text: string) {
  if (!scene.chart && !scene.map) return text;

  return clean(text)
    .replace(/^Now look at the data itself\.\s*/i, "")
    .replace(/^Now compare the event across stations or locations\.\s*/i, "Now compare the measured locations. ")
    .replace(/^Now put the observations in place\.\s*/i, "Now place the measurements on the city. ");
}

function approvedSceneNarration(scene: Scene) {
  let narration = clean(scene.narration);
  narration = stripMetaNarration(narration);
  narration = polishSystemsIntro(scene, narration);
  narration = polishTrustBoundary(scene, narration);
  narration = removeDuplicateOpening(scene, narration);

  return clean(narration);
}

function similarityKey(text: string) {
  return clean(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\b(the|a|an|this|that|now|shows|show|data|evidence)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: string, b: string) {
  const aa = new Set(similarityKey(a).split(" ").filter(Boolean));
  const bb = new Set(similarityKey(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  for (const token of aa) {
    if (bb.has(token)) overlap += 1;
  }

  const union = new Set([...aa, ...bb]).size;
  return union ? overlap / union : 0;
}

export function applyNarrationDirector(
  project: EpisodeProject
): EpisodeProject {
  let previous = "";

  const scenes = project.scenes.map((scene) => {
    let narration = approvedSceneNarration(scene);

    /*
     * Avoid adjacent scenes repeating the same observation.
     * Keep the later scene's distinct visual job, but remove duplicated
     * lead-in language rather than silently inventing a new claim.
     */
    if (previous && jaccard(previous, narration) > 0.72) {
      if (scene.map) {
        narration = clean(
          `Now place the measurements on the map. ${scene.body}`
        );
      } else if (scene.chart) {
        narration = clean(
          `Now compare the measured values directly. ${scene.body}`
        );
      }
    }

    previous = narration;

    return {
      ...scene,
      narration,
    };
  });

  return {
    ...project,
    scenes,
  };
}
