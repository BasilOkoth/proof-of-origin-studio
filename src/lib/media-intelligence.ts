import type { EpisodeProject, EvidenceAsset, Scene } from "./types";

export type MediaRole =
  | "hero"
  | "human"
  | "place"
  | "process"
  | "texture"
  | "document"
  | "detail"
  | "none";

export type MediaShotPlan = {
  role: MediaRole;
  reason: string;
  searchTerms: string[];
  preferredAssetId?: string;
  treatment: "ken_burns" | "slow_push" | "split" | "documentary" | "texture" | "none";
};

const words = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((x) => x.length > 3);

const stop = new Set([
  "this","that","with","from","into","your","their","what","when","where","which",
  "have","will","would","could","should","about","there","they","them","then",
  "than","does","doing","because","while","through","after","before","under",
]);

function keywords(scene: Scene) {
  const all = words(`${scene.headline} ${scene.body} ${scene.narration}`)
    .filter((x) => !stop.has(x));
  return [...new Set(all)].slice(0, 8);
}

function semanticScore(asset: EvidenceAsset, terms: string[]) {
  const hay = `${asset.name} ${asset.mimeType}`.toLowerCase();
  return terms.reduce((score, term) => score + (hay.includes(term) ? 3 : 0), 0);
}

function chooseAsset(project: EpisodeProject, scene: Scene, terms: string[]) {
  if (scene.assetId) return scene.assetId;
  const visualAssets = project.assets.filter((a) =>
    a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/")
  );
  const ranked = visualAssets
    .map((asset) => ({ asset, score: semanticScore(asset, terms) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].asset.id : undefined;
}

export function planMedia(scene: Scene, project: EpisodeProject): MediaShotPlan {
  const text = `${scene.eyebrow} ${scene.headline} ${scene.body} ${scene.narration}`;
  const terms = keywords(scene);

  let role: MediaRole = "none";
  let treatment: MediaShotPlan["treatment"] = "none";
  let reason = "No documentary media is necessary; let the graphic scene carry the idea.";

  if (/\b(people|workers|farmers|women|youth|families|communities|households|residents)\b/i.test(text)) {
    role = "human";
    treatment = "documentary";
    reason = "The claim is human-centered; show people before returning to abstraction.";
  } else if (/\b(city|country|street|river|forest|farm|market|landfill|site|neighbourhood|neighborhood)\b/i.test(text)) {
    role = "place";
    treatment = "slow_push";
    reason = "Establishing geography with real-world imagery makes the story feel situated.";
  } else if (/\b(process|collect|sort|recycle|build|repair|produce|transport|move|work|manufacture)\b/i.test(text)) {
    role = "process";
    treatment = "ken_burns";
    reason = "A real process benefits from observational B-roll rather than only diagrams.";
  } else if (scene.kind === "document" || scene.kind === "source_highlight") {
    role = "document";
    treatment = "slow_push";
    reason = "The source itself should be visible as evidence.";
  } else if (scene.kind === "hook") {
    role = "hero";
    treatment = "ken_burns";
    reason = "A strong opening image can establish stakes before the first explanation.";
  }

  const preferredAssetId = chooseAsset(project, scene, terms);

  return {
    role,
    reason,
    searchTerms: terms,
    preferredAssetId,
    treatment,
  };
}

export function mediaCoverage(project: EpisodeProject) {
  return project.scenes.map((scene) => {
    const plan = planMedia(scene, project);
    return {
      sceneId: scene.id,
      headline: scene.headline,
      ...plan,
      hasMatchedAsset: Boolean(plan.preferredAssetId),
    };
  });
}
