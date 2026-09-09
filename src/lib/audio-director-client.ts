import type { EpisodeProject } from "./types";
import type { AudioDirection } from "./audio-types";

export async function generateElevenLabsAudioDirection(
  project: EpisodeProject,
  options?: {
    generate?: boolean;
    includeMusic?: boolean;
    includeAmbience?: boolean;
    includeSfx?: boolean;
  }
): Promise<{
  direction: AudioDirection;
  updatedProject?: EpisodeProject;
  generated: boolean;
  assetCount?: number;
}> {
  const response = await fetch("/api/audio-director", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project,
      generate: options?.generate ?? true,
      includeMusic: options?.includeMusic ?? true,
      includeAmbience: options?.includeAmbience ?? true,
      includeSfx: options?.includeSfx ?? true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "Audio Director request failed.");
  }

  return data;
}
