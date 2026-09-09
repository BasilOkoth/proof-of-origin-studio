import type { EpisodeProject, Scene } from "./types";

const STOP = new Set([
  "this","that","with","from","into","your","their","what","when","where","which",
  "have","will","would","could","should","about","there","they","them","then",
  "than","does","doing","because","while","through","after","before","under",
  "really","very","more","most","some","such","only","also","show","scene",
]);

function cleanWords(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

export function sceneNeedsMedia(scene: Scene) {
  if (["data_chart", "map_story", "source_highlight", "confidence", "timeline"].includes(scene.kind)) {
    return false;
  }
  const text = `${scene.headline} ${scene.body} ${scene.narration}`;
  return (
    scene.kind === "hook" ||
    scene.kind === "document" ||
    /\b(people|workers|farmers|women|youth|families|communities|households|residents|street|city|market|landfill|farm|river|forest|coast|factory|collect|sort|recycle|transport|build|repair|produce)\b/i.test(text)
  );
}

export function buildMediaQuery(scene: Scene) {
  const text = `${scene.headline} ${scene.body} ${scene.narration}`;
  const words = unique(cleanWords(text));

  const locations = [
    ...text.matchAll(/\b(Nairobi|Kenya|Accra|Ghana|Lagos|Nigeria|Dakar|Senegal|Africa|Dandora|Kibera|Comoros|Madagascar|Mauritius|Seychelles)\b/gi),
  ].map((m) => m[0]);

  const people =
    /\b(workers|farmers|women|youth|families|communities|households|residents|collectors|recyclers)\b/i.exec(text)?.[0];

  const activity =
    /\b(recycling|waste|farming|agriculture|sorting|collection|transport|market|landfill|river|forest|mangrove|construction|demolition|technology|research)\b/i.exec(text)?.[0];

  const parts = unique([
    ...locations,
    people || "",
    activity || "",
    ...words.slice(0, 4),
  ].filter(Boolean));

  let primary = parts.slice(0, 6).join(" ");
  if (!primary) primary = scene.headline;

  let alternate = primary;
  if (people) {
    alternate = `${locations[0] || ""} ${people} ${activity || ""} documentary`.trim();
  } else if (locations.length) {
    alternate = `${locations[0]} ${activity || words[0] || "daily life"} documentary`.trim();
  }

  return {
    primary,
    alternate: alternate !== primary ? alternate : undefined,
    recommendedType:
      /\b(people|workers|farmers|market|street|landfill|recycling|sorting|transport|construction)\b/i.test(text)
        ? ("video" as const)
        : ("image" as const),
    reason:
      scene.kind === "hook"
        ? "The opening benefits from a strong real-world establishing visual."
        : "This scene describes people, a place or a physical process that is clearer with documentary B-roll.",
  };
}

export function buildEpisodeMediaPlan(project: EpisodeProject) {
  return project.scenes
    .filter(sceneNeedsMedia)
    .map((scene) => ({
      scene,
      ...buildMediaQuery(scene),
    }));
}
