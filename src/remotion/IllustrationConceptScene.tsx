import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { IllustrationScenePlan } from "@/lib/illustration-director";
import type { Scene } from "@/lib/types";

const bg = "#0B132B";
const white = "#F7F4EA";
const muted = "#B8C2D9";

export function IllustrationConceptScene({
  scene,
  plan,
}: {
  scene: Scene;
  plan: IllustrationScenePlan;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 },
  });

  const visibleFrames = Math.max(
    1,
    Math.ceil(
      interpolate(frame, [0, 120], [1, plan.frames.length], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    )
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 85% 10%, rgba(100,210,255,.18), transparent 30%), ${bg}`,
        color: white,
        padding: 84,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#64D2FF",
        }}
      >
        Illustrated explanation
      </div>

      <div
        style={{
          marginTop: 20,
          fontSize: 76,
          lineHeight: 0.98,
          fontWeight: 1000,
          letterSpacing: -4,
          maxWidth: 1200,
          transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
          opacity: s,
        }}
      >
        {scene.headline}
      </div>

      <div
        style={{
          marginTop: 24,
          fontSize: 30,
          lineHeight: 1.4,
          color: muted,
          maxWidth: 1120,
        }}
      >
        {plan.metaphor?.description || scene.body}
      </div>

      <div
        style={{
          marginTop: 52,
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(3, visibleFrames)}, 1fr)`,
          gap: 22,
          alignItems: "stretch",
        }}
      >
        {plan.frames.slice(0, visibleFrames).map((item, index) => (
          <div
            key={item.id}
            style={{
              minHeight: 280,
              borderRadius: 28,
              background: "rgba(255,255,255,.05)",
              border: "1px solid rgba(255,255,255,.1)",
              padding: 26,
              boxShadow: "0 30px 80px rgba(0,0,0,.28)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: plan.palette[index + 2] || "#64D2FF",
                color: "#09111F",
                fontWeight: 1000,
                fontSize: 20,
              }}
            >
              {index + 1}
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize: 28,
                fontWeight: 900,
                lineHeight: 1.1,
              }}
            >
              {item.title}
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: 20,
                lineHeight: 1.45,
                color: "#D6DDEE",
              }}
            >
              {item.action}
            </div>

            <div
              style={{
                marginTop: 18,
                fontSize: 16,
                lineHeight: 1.4,
                color: "#8EA2C9",
              }}
            >
              {item.visual}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          right: 74,
          bottom: 42,
          color: "#90A0C3",
          fontSize: 18,
        }}
      >
        {plan.mode.replaceAll("_", " ")}
      </div>
    </AbsoluteFill>
  );
}
