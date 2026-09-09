import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Video,
  interpolate,
  Sequence,
  useCurrentFrame,
} from "remotion";
import type { EpisodeProject, EvidenceAsset, Scene } from "@/lib/types";
import { planMedia } from "@/lib/media-intelligence";
import { classifyAudioAsset, planSceneSound } from "@/lib/sound-design";

function visualAsset(project: EpisodeProject, id?: string) {
  return id ? project.assets.find((asset) => asset.id === id) : undefined;
}

export function shouldUseMediaScene(scene: Scene, project: EpisodeProject) {
  const plan = planMedia(scene, project);
  return Boolean(plan.preferredAssetId) &&
    ["human", "place", "process", "hero"].includes(plan.role) &&
    !["data_chart", "map_story", "source_highlight"].includes(scene.kind);
}

export function BrollScene({ scene, project }: { scene: Scene; project: EpisodeProject }) {
  const frame = useCurrentFrame();
  const plan = planMedia(scene, project);
  const asset = visualAsset(project, plan.preferredAssetId);
  if (!asset) return null;

  const zoom =
    plan.treatment === "slow_push"
      ? interpolate(frame, [0, Math.max(1, scene.durationSec * 30)], [1.02, 1.12])
      : interpolate(frame, [0, Math.max(1, scene.durationSec * 30)], [1, 1.08]);

  return (
    <AbsoluteFill style={{ background: "#0b0b0c", color: "#fff", overflow: "hidden" }}>
      {asset.mimeType.startsWith("video/") ? (
        <Video
          src={asset.dataUrl}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
        />
      ) : (
        <Img
          src={asset.dataUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
        />
      )}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,.38) 48%, rgba(0,0,0,.12) 78%), linear-gradient(0deg, rgba(0,0,0,.48), transparent 45%)",
        }}
      />
      <div style={{ position: "absolute", left: 82, top: 76, fontSize: 19, fontWeight: 950, letterSpacing: 3, textTransform: "uppercase" }}>
        {scene.eyebrow}
      </div>
      <div style={{ position: "absolute", left: 82, bottom: 112, maxWidth: 1180 }}>
        <div style={{ fontSize: 78, lineHeight: 0.98, fontWeight: 1000, letterSpacing: -4 }}>{scene.headline}</div>
        <div style={{ marginTop: 28, maxWidth: 930, fontSize: 30, lineHeight: 1.35, color: "#dedbd4" }}>{scene.body}</div>
      </div>
      <div style={{ position: "absolute", right: 48, bottom: 40, fontSize: 16, opacity: 0.65 }}>
        MEDIA · {asset.name}
      </div>
    </AbsoluteFill>
  );
}

function audioAssets(project: EpisodeProject, role: "music" | "ambience" | "sfx") {
  return project.assets.filter((asset) => classifyAudioAsset(asset) === role);
}

function chooseByName(assets: EvidenceAsset[], terms: string[]) {
  const ranked = assets
    .map((asset) => ({
      asset,
      score: terms.reduce((s, t) => s + (asset.name.toLowerCase().includes(t) ? 2 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.asset;
}

export function SoundDesignTrack({ project }: { project: EpisodeProject }) {
  const music = audioAssets(project, "music");
  const ambience = audioAssets(project, "ambience");
  const sfx = audioAssets(project, "sfx");

  let from = 0;
  const sequences: React.ReactNode[] = [];

  project.scenes.forEach((scene, index) => {
    const frames = Math.max(1, Math.round(scene.durationSec * 30));
    const plan = planSceneSound(scene, index);

    const musicAsset = chooseByName(music, [plan.mood]) || music[index % Math.max(1, music.length)];
    const ambienceAsset =
      plan.ambience === "none" ? undefined : chooseByName(ambience, [plan.ambience]) || ambience[0];
    const sfxAsset =
      plan.transition === "none" ? undefined : chooseByName(sfx, [plan.transition]) || sfx[0];

    if (musicAsset) {
      sequences.push(
        <Sequence key={`music-${scene.id}`} from={from} durationInFrames={frames}>
          <Audio src={musicAsset.dataUrl} volume={Math.min(0.18, 0.05 + plan.musicEnergy * 0.12)} />
        </Sequence>
      );
    }

    if (ambienceAsset) {
      sequences.push(
        <Sequence key={`amb-${scene.id}`} from={from} durationInFrames={frames}>
          <Audio src={ambienceAsset.dataUrl} volume={0.055} />
        </Sequence>
      );
    }

    if (sfxAsset) {
      sequences.push(
        <Sequence key={`sfx-${scene.id}`} from={from} durationInFrames={Math.min(frames, 60)}>
          <Audio src={sfxAsset.dataUrl} volume={0.16} />
        </Sequence>
      );
    }

    from += frames;
  });

  return <>{sequences}</>;
}
