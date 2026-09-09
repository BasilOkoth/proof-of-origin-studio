import type { EpisodeProject } from "./types";
import type { MediaCandidate, MediaScoutResult } from "./media-scout-types";

export async function scoutEpisodeMedia(
  project: EpisodeProject,
  options?: {
    perScene?: number;
    includePexels?: boolean;
    includeWikimedia?: boolean;
  }
): Promise<MediaScoutResult> {
  const response = await fetch("/api/media-scout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project,
      perScene: options?.perScene ?? 4,
      includePexels: options?.includePexels ?? true,
      includeWikimedia: options?.includeWikimedia ?? true,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Media scout failed.");
  }

  return data.scout;
}

export function attachMediaCandidate(
  project: EpisodeProject,
  sceneId: string,
  candidate: MediaCandidate
): EpisodeProject {
  const mimeType =
    candidate.mediaType === "video" ? "video/mp4" : "image/jpeg";

  const assetId = `scouted-${candidate.id}`;

  const mediaProvenance = {
    provider: candidate.provider,
    sourceUrl: candidate.sourceUrl,
    creator: candidate.creator,
    creatorUrl: candidate.creatorUrl,
    licenseName: candidate.licenseName,
    licenseUrl: candidate.licenseUrl,
    attribution: candidate.attribution,
    query: candidate.query,
    scoutedAt: new Date().toISOString(),
  };

  const nextAssets = [
    ...(project.assets || []).filter((asset: any) => asset.id !== assetId),
    {
      id: assetId,
      name: candidate.title,
      mimeType,
      dataUrl: candidate.downloadUrl || candidate.previewUrl,
      mediaProvenance,
    } as any,
  ];

  return {
    ...project,
    assets: nextAssets,
    scenes: project.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, assetId } : scene
    ),
  };
}
