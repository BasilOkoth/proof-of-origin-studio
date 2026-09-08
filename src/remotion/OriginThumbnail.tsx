import React from "react";
import { AbsoluteFill } from "remotion";
import type { EpisodeProject } from "@/lib/types";

type ThumbnailProps = {
  project: EpisodeProject;
  thumbnailIndex: number;
};

export const OriginThumbnail: React.FC<ThumbnailProps> = ({
  project,
  thumbnailIndex,
}) => {
  const item =
    project.thumbnails[
      Math.max(0, Math.min(thumbnailIndex, project.thumbnails.length - 1))
    ];

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 80% 12%, rgba(85,216,255,.34), transparent 26%), radial-gradient(circle at 10% 90%, rgba(108,124,255,.30), transparent 34%), #070b16",
        color: "#f7f9ff",
        padding: 80,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 70,
          right: 72,
          padding: "14px 18px",
          borderRadius: 14,
          border: "1px solid rgba(85,216,255,.35)",
          background: "rgba(85,216,255,.08)",
          color: "#55d8ff",
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: 3,
        }}
      >
        HPS TEST
      </div>

      <div
        style={{
          width: 1040,
          marginTop: 160,
          fontSize: 132,
          lineHeight: 0.88,
          letterSpacing: -8,
          fontWeight: 1000,
        }}
      >
        {item.title}
      </div>

      <div
        style={{
          color: "#ff6f86",
          fontSize: 100,
          lineHeight: 0.92,
          letterSpacing: -5,
          fontWeight: 1000,
          marginTop: 30,
        }}
      >
        {item.kicker}
      </div>

      <div
        style={{
          position: "absolute",
          right: 105,
          bottom: 110,
          width: 520,
          height: 420,
          borderRadius: 34,
          border: "1px solid rgba(255,255,255,.13)",
          background: "linear-gradient(180deg, #f3f6fb, #cad5e7)",
          transform: "rotate(3deg)",
          boxShadow: "0 55px 130px rgba(0,0,0,.48)",
          padding: 42,
        }}
      >
        <div style={{ height: 58, background: "#17345b", borderRadius: 7 }} />
        {[72, 62, 80, 55].map((width, i) => (
          <div
            key={i}
            style={{
              width: `${width}%`,
              height: 14,
              background: "#9cadc2",
              marginTop: 27,
              borderRadius: 7,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            bottom: 34,
            left: 42,
            right: 42,
            padding: "14px 18px",
            borderRadius: 12,
            background: "#ffe9ed",
            color: "#b82845",
            fontWeight: 1000,
            fontSize: 30,
          }}
        >
          ONE DETAIL CHANGED
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 80,
          bottom: 65,
          fontSize: 26,
          color: "#95a3c2",
          fontWeight: 800,
        }}
      >
        PROOF OF ORIGIN
      </div>
    </AbsoluteFill>
  );
};
