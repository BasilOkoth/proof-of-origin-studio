import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { EpisodeProject } from "@/lib/types";

type ShortProps = {
  project: EpisodeProject;
  shortIndex: number;
};

export const OriginShort: React.FC<ShortProps> = ({
  project,
  shortIndex,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const item = project.shorts[Math.max(0, Math.min(shortIndex, project.shorts.length - 1))];
  const intro = spring({ frame, fps, config: { damping: 16 } });
  const pulse = interpolate(Math.sin(frame / 15), [-1, 1], [0.9, 1.04]);

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 80% 8%, rgba(85,216,255,.22), transparent 34%), radial-gradient(circle at 15% 25%, rgba(108,124,255,.28), transparent 35%), #070b16",
        color: "#f7f9ff",
        padding: "150px 86px 110px",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 24,
          letterSpacing: 5,
          fontWeight: 900,
          color: "#55d8ff",
          textTransform: "uppercase",
        }}
      >
        PROOF OF ORIGIN · HPS
      </div>

      <div
        style={{
          marginTop: 180,
          fontSize: 92,
          fontWeight: 1000,
          lineHeight: 0.96,
          letterSpacing: -5,
          transform: `translateY(${interpolate(intro, [0, 1], [80, 0])}px)`,
          opacity: intro,
        }}
      >
        {item.hook}
      </div>

      <div
        style={{
          marginTop: 70,
          padding: 38,
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 30,
          background: "rgba(255,255,255,.045)",
          fontSize: 40,
          lineHeight: 1.38,
          color: "#b0bdd7",
        }}
      >
        {item.script}
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 20,
              color: "#94a2c1",
              textTransform: "uppercase",
              letterSpacing: 3,
            }}
          >
            NEXT
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, marginTop: 6 }}>
            {item.title}
          </div>
        </div>

        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 34,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #6c7cff, #55d8ff)",
            fontWeight: 1000,
            fontSize: 52,
            transform: `scale(${pulse})`,
          }}
        >
          H
        </div>
      </div>
    </AbsoluteFill>
  );
};
