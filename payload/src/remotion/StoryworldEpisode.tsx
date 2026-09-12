import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { StoryworldGenerationPlan } from "@/lib/storyworld-generation-types";

type Props = {
  plan: StoryworldGenerationPlan;
  assetAvailability?: Record<string, boolean>;
};

function publicPath(path: string) {
  return path.replace(/^public\//, "");
}

function FallbackShot({ label, visual, camera, onScreenText }: { label: string; visual: string; camera: string; onScreenText?: string[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.25], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "linear-gradient(145deg,#0a0b0f,#1c2029)", color: "#f4efe6", padding: 88, justifyContent: "flex-end" }}>
      <div style={{ opacity, maxWidth: 840 }}>
        <div style={{ fontSize: 22, letterSpacing: 5, textTransform: "uppercase", color: "#c7a96a", marginBottom: 24 }}>{label}</div>
        <div style={{ fontSize: 54, lineHeight: 1.04, fontWeight: 750, letterSpacing: -1.5 }}>{visual}</div>
        <div style={{ marginTop: 30, fontSize: 24, color: "#9aa2af", letterSpacing: 1 }}>{camera}</div>
        {onScreenText?.length ? (
          <div style={{ marginTop: 46, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {onScreenText.map((text) => <div key={text} style={{ border: "1px solid rgba(255,255,255,.18)", padding: "12px 16px", borderRadius: 999, fontSize: 20 }}>{text}</div>)}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function CaptionTrack({ plan }: { plan: StoryworldGenerationPlan }) {
  const { fps } = useVideoConfig();
  return <>
    {plan.render.captions.map((cue) => (
      <Sequence key={cue.id} from={Math.round(cue.startSec * fps)} durationInFrames={Math.max(1, Math.round((cue.endSec - cue.startSec) * fps))}>
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 84px 170px", pointerEvents: "none" }}>
          <div style={{ maxWidth: 860, textAlign: "center", fontFamily: "Inter, ui-sans-serif, system-ui", fontSize: 42, lineHeight: 1.16, fontWeight: 700, color: "white", textShadow: "0 2px 12px rgba(0,0,0,.8)", background: "rgba(0,0,0,.28)", borderRadius: 16, padding: "12px 18px" }}>{cue.text}</div>
        </AbsoluteFill>
      </Sequence>
    ))}
  </>;
}

export const StoryworldEpisode: React.FC<Props> = ({ plan, assetAvailability = {} }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#050608" }}>
      {plan.render.shots.map((shot) => {
        const from = Math.round(shot.startSec * fps);
        const duration = Math.max(1, Math.round(shot.durationSec * fps));
        const hasVideo = Boolean(assetAvailability[shot.videoPath]);
        const hasImage = Boolean(assetAvailability[shot.imagePath]);
        const hasSeed = Boolean(shot.seedImagePath && assetAvailability[shot.seedImagePath]);
        return (
          <Sequence key={shot.id} from={from} durationInFrames={duration}>
            <AbsoluteFill>
              {hasVideo ? (
                <OffthreadVideo src={staticFile(publicPath(shot.videoPath))} muted />
              ) : hasImage ? (
                <Img src={staticFile(publicPath(shot.imagePath))} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : hasSeed && shot.seedImagePath ? (
                <Img src={staticFile(publicPath(shot.seedImagePath))} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <FallbackShot label={shot.label} visual={shot.visual} camera={shot.camera} onScreenText={shot.onScreenText} />
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {plan.render.voices.map((voice) => (
        assetAvailability[voice.outputPath] ? (
          <Sequence key={voice.id} from={Math.round(voice.startSec * fps)}>
            <Audio src={staticFile(publicPath(voice.outputPath))} />
          </Sequence>
        ) : null
      ))}

      {assetAvailability[`public/storyworld/${plan.render.worldId}/${plan.render.episodeId}/audio/music-master.mp3`] ? (
        <Audio src={staticFile(`storyworld/${plan.render.worldId}/${plan.render.episodeId}/audio/music-master.mp3`)} volume={0.22} />
      ) : null}

      <CaptionTrack plan={plan} />
    </AbsoluteFill>
  );
};
