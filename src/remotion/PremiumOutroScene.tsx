import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type {
  EpisodeProject,
  Scene,
} from "@/lib/types";

const white = "#f7f9ff";
const muted = "#9eabc8";
const cyan = "#55d8ff";
const blue = "#6c7cff";

function clamp01(
  value: number
) {
  return Math.max(
    0,
    Math.min(1, value)
  );
}

export function PremiumOutroScene({
  scene,
  project,
}: {
  scene: Scene;
  project: EpisodeProject;
}) {
  const frame =
    useCurrentFrame();

  const {
    fps,
    durationInFrames,
  } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: {
      damping: 20,
      stiffness: 90,
      mass: 0.9,
    },
  });

  const progress = clamp01(
    frame /
      Math.max(
        1,
        durationInFrames - 1
      )
  );

  const question =
    project.episode.question;

  const title =
    scene.headline ||
    project.episode
      .workingTitle;

  const questionOpacity =
    interpolate(
      progress,
      [
        0.02,
        0.22,
        0.58,
        0.78,
      ],
      [0, 1, 1, 0.28],
      {
        extrapolateLeft:
          "clamp",
        extrapolateRight:
          "clamp",
      }
    );

  const resolutionOpacity =
    interpolate(
      progress,
      [0.26, 0.48, 0.8],
      [0, 1, 1],
      {
        extrapolateLeft:
          "clamp",
        extrapolateRight:
          "clamp",
      }
    );

  const brandOpacity =
    interpolate(
      progress,
      [0.66, 0.83, 1],
      [0, 1, 1],
      {
        extrapolateLeft:
          "clamp",
        extrapolateRight:
          "clamp",
      }
    );

  const glowX =
    interpolate(
      progress,
      [0, 1],
      [-20, 110]
    );

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background:
          "radial-gradient(circle at 16% 18%, rgba(108,124,255,.2), transparent 30%), radial-gradient(circle at 84% 78%, rgba(85,216,255,.13), transparent 34%), #050914",
        color: white,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
          backgroundSize:
            "78px 78px",
          opacity: 0.28,
          transform:
            `translateX(${interpolate(
              progress,
              [0, 1],
              [0, -28]
            )}px)`,
        }}
      />

      <div
        style={{
          position:
            "absolute",
          width: 880,
          height: 880,
          borderRadius: 999,
          left: `${glowX}%`,
          top: "50%",
          transform:
            "translate(-50%,-50%)",
          background:
            "radial-gradient(circle, rgba(85,216,255,.10), rgba(108,124,255,.04) 34%, transparent 66%)",
          filter:
            "blur(20px)",
        }}
      />

      <div
        style={{
          position:
            "absolute",
          inset:
            "82px 92px",
          display:
            "grid",
          gridTemplateRows:
            "auto 1fr auto",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            opacity: enter,
          }}
        >
          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius:
                  13,
                display:
                  "grid",
                placeItems:
                  "center",
                background:
                  `linear-gradient(135deg, ${blue}, ${cyan})`,
                fontWeight:
                  1000,
              }}
            >
              E
            </div>

            <div>
              <div
                style={{
                  fontSize:
                    16,
                  letterSpacing:
                    3.5,
                  fontWeight:
                    900,
                  color:
                    cyan,
                }}
              >
                EVIDENCE STUDIO
              </div>

              <div
                style={{
                  marginTop:
                    3,
                  fontSize:
                    18,
                  color:
                    muted,
                }}
              >
                The world explained through evidence
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 15,
              color: muted,
              letterSpacing:
                2.4,
              fontWeight:
                850,
            }}
          >
            SOURCES STAY WITH THE STORY
          </div>
        </div>

        <div
          style={{
            alignSelf:
              "center",
            maxWidth:
              1540,
          }}
        >
          {question && (
            <div
              style={{
                fontSize:
                  24,
                lineHeight:
                  1.35,
                color:
                  muted,
                textTransform:
                  "uppercase",
                letterSpacing:
                  3.2,
                fontWeight:
                  850,
                opacity:
                  questionOpacity,
              }}
            >
              We started with
              <span
                style={{
                  color:
                    cyan,
                }}
              >
                {" "}
                one question
              </span>
            </div>
          )}

          {question && (
            <div
              style={{
                marginTop:
                  18,
                maxWidth:
                  1420,
                fontSize:
                  50,
                lineHeight:
                  1.08,
                fontWeight:
                  750,
                color:
                  "#cbd4e9",
                opacity:
                  questionOpacity,
              }}
            >
              {question}
            </div>
          )}

          <div
            style={{
              marginTop:
                question
                  ? 52
                  : 10,
              fontSize:
                100,
              maxWidth:
                1520,
              lineHeight:
                0.97,
              letterSpacing:
                -5.5,
              fontWeight:
                1000,
              opacity:
                resolutionOpacity,
              transform:
                `translateY(${interpolate(
                  enter,
                  [0, 1],
                  [44, 0]
                )}px)`,
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop:
                34,
              maxWidth:
                1280,
              fontSize:
                29,
              lineHeight:
                1.45,
              color:
                muted,
              opacity:
                resolutionOpacity,
            }}
          >
            {scene.body}
          </div>
        </div>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "end",
            justifyContent:
              "space-between",
            gap: 48,
            opacity:
              brandOpacity,
          }}
        >
          <div>
            <div
              style={{
                color:
                  cyan,
                fontSize:
                  18,
                fontWeight:
                  900,
                letterSpacing:
                  3.2,
                textTransform:
                  "uppercase",
              }}
            >
              Follow the evidence
            </div>

            <div
              style={{
                marginTop:
                  9,
                color:
                  white,
                fontSize:
                  29,
                fontWeight:
                  900,
              }}
            >
              Stay for the next question worth explaining.
            </div>
          </div>

          <div
            style={{
              width: 470,
              padding:
                "19px 24px",
              borderRadius:
                18,
              border:
                "1px solid rgba(85,216,255,.2)",
              background:
                "rgba(85,216,255,.055)",
            }}
          >
            <div
              style={{
                color:
                  muted,
                fontSize:
                  15,
                textTransform:
                  "uppercase",
                letterSpacing:
                  2.4,
                fontWeight:
                  850,
              }}
            >
              Editorial standard
            </div>

            <div
              style={{
                marginTop:
                  7,
                fontSize:
                  23,
                fontWeight:
                  950,
              }}
            >
              Evidence before aesthetics.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
