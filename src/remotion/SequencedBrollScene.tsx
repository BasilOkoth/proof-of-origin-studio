import React from "react";
import {
  AbsoluteFill,
  Img,
  Video,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { Scene } from "@/lib/types";
import type { SceneShotSequence, Shot } from "@/lib/shot-sequence-types";

function MediaShot({ shot }: { shot: Shot }) {
  const frame = useCurrentFrame();
  const asset = shot.candidate;
  if (!asset) return null;

  const progress = Math.min(1, frame / Math.max(1, shot.durationSec * 30));
  const scale =
    shot.treatment === "slow_push"
      ? interpolate(progress, [0, 1], [1.01, 1.12])
      : shot.treatment === "ken_burns"
      ? interpolate(progress, [0, 1], [1.06, 1.14])
      : shot.treatment === "crop_detail"
      ? interpolate(progress, [0, 1], [1.15, 1.28])
      : 1;

  const src = asset.downloadUrl || asset.previewUrl;

  return (
    <AbsoluteFill style={{ background: "#0b0b0c", overflow: "hidden" }}>
      {asset.mediaType === "video" ? (
        <Video
          src={src}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      ) : (
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      )}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(0deg, rgba(0,0,0,.4), transparent 45%), linear-gradient(90deg, rgba(0,0,0,.18), transparent 55%)",
        }}
      />
    </AbsoluteFill>
  );
}

function GraphicInterrupt({ scene }: { scene: Scene }) {
  return (
    <AbsoluteFill
      style={{
        background: "#f4f0e8",
        color: "#101114",
        display: "grid",
        placeItems: "center",
        padding: 100,
        textAlign: "center",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 3, opacity: .55 }}>
          THE POINT
        </div>
        <div style={{ marginTop: 24, maxWidth: 1380, fontSize: 86, lineHeight: .95, fontWeight: 1000, letterSpacing: -5 }}>
          {scene.headline}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Payoff({ scene }: { scene: Scene }) {
  return (
    <AbsoluteFill
      style={{
        background: "#101114",
        color: "#fff",
        display: "grid",
        placeItems: "center",
        padding: 110,
        textAlign: "center",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1300 }}>
        <div style={{ fontSize: 72, lineHeight: 1, fontWeight: 1000, letterSpacing: -4 }}>
          {scene.headline}
        </div>
        <div style={{ marginTop: 34, fontSize: 31, lineHeight: 1.35, color: "#d7d3cb" }}>
          {scene.body}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function SequencedBrollScene({
  scene,
  sequence,
}: {
  scene: Scene;
  sequence: SceneShotSequence;
}) {
  return (
    <AbsoluteFill>
      {sequence.shots.map((shot) => {
        const from = Math.max(0, Math.round(shot.startSec * 30));
        const duration = Math.max(1, Math.round(shot.durationSec * 30));

        return (
          <Sequence key={shot.id} from={from} durationInFrames={duration}>
            {shot.role === "graphic_interrupt" ? (
              <GraphicInterrupt scene={scene} />
            ) : shot.role === "payoff" ? (
              <Payoff scene={scene} />
            ) : (
              <MediaShot shot={shot} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
