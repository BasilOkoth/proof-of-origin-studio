import React from "react";
import {
  AbsoluteFill,
  Img,
  Video,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  openingAssetsForScene,
  rankedAssetsForScene,
} from "@/lib/cinematic-director";
import type {
  EpisodeProject,
  EvidenceAsset,
  Scene,
} from "@/lib/types";

const WHITE = "#f7f9ff";
const MUTED = "#a7b3cd";
const CYAN = "#55d8ff";
const BG = "#050914";

function sourceLabel(
  asset: EvidenceAsset
) {
  return (
    asset.sourceLabel ||
    asset.name ||
    "Visual evidence"
  );
}

function imageMotion(
  frame: number,
  fps: number,
  index: number
) {
  const duration =
    Math.max(
      1,
      fps * 12
    );

  const progress =
    interpolate(
      frame,
      [
        index * fps * 1.4,
        index * fps * 1.4 +
          duration,
      ],
      [0, 1],
      {
        extrapolateLeft:
          "clamp",
        extrapolateRight:
          "clamp",
      }
    );

  const scale =
    1.025 +
    progress * 0.055;

  const x =
    index % 2 === 0
      ? progress * -2.4
      : progress * 2.4;

  return {
    transform:
      `scale(${scale}) translateX(${x}%)`,
  };
}

function EvidenceImage({
  asset,
  frame,
  fps,
  index,
  dominant = false,
}: {
  asset: EvidenceAsset;
  frame: number;
  fps: number;
  index: number;
  dominant?: boolean;
}) {
  const reveal = spring({
    frame:
      Math.max(
        0,
        frame -
          Math.round(
            index *
              fps *
              0.55
          )
      ),
    fps,
    config: {
      damping: 18,
      stiffness: 90,
    },
  });

  const isVideo =
    asset.mimeType.startsWith(
      "video/"
    );

  return (
    <div
      style={{
        position:
          "relative",
        width: "100%",
        height: "100%",
        overflow:
          "hidden",
        borderRadius:
          dominant
            ? 0
            : 26,
        border:
          dominant
            ? "none"
            : "1px solid rgba(255,255,255,.12)",
        boxShadow:
          dominant
            ? "none"
            : "0 20px 80px rgba(0,0,0,.28)",
        opacity:
          reveal,
      }}
    >
      {isVideo ? (
        <Video
          src={asset.dataUrl}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            ...imageMotion(
              frame,
              fps,
              index
            ),
          }}
        />
      ) : (
        <Img
          src={asset.dataUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            ...imageMotion(
              frame,
              fps,
              index
            ),
          }}
        />
      )}

      <div
        style={{
          position:
            "absolute",
          inset: 0,
          background:
            dominant
              ? "linear-gradient(90deg, rgba(5,9,20,.82) 0%, rgba(5,9,20,.38) 47%, rgba(5,9,20,.16) 70%, rgba(5,9,20,.38) 100%), linear-gradient(0deg, rgba(5,9,20,.75), transparent 44%)"
              : "linear-gradient(0deg, rgba(5,9,20,.82), transparent 58%)",
        }}
      />

      <div
        style={{
          position:
            "absolute",
          left:
            dominant
              ? 90
              : 22,
          bottom:
            dominant
              ? 46
              : 20,
          maxWidth:
            dominant
              ? 1100
              : "88%",
          color:
            MUTED,
          fontSize:
            dominant
              ? 17
              : 13,
          lineHeight:
            1.35,
          letterSpacing:
            0.4,
        }}
      >
        Visual evidence ·{" "}
        {sourceLabel(
          asset
        )}
      </div>
    </div>
  );
}

function openingHeadline(
  project: EpisodeProject,
  scene: Scene
) {
  const text =
    `${project.episode.question} ${scene.headline}`;

  if (
    /\bnairobi\b/i.test(text) &&
    /\bflood/i.test(text)
  ) {
    return "Why does Nairobi flood so often?";
  }

  return (
    project.episode.question ||
    scene.headline
  );
}

function OpeningRhythmScene({
  scene,
  project,
}: {
  scene: Scene;
  project: EpisodeProject;
}) {
  const frame =
    useCurrentFrame();
  const { fps } =
    useVideoConfig();

  const assets =
    openingAssetsForScene(
      project,
      scene
    ).slice(0, 4);

  if (!assets.length) {
    return (
      <AbsoluteFill
        style={{
          background: BG,
        }}
      />
    );
  }

  const shotSeconds = 5.5;
  const shotFrames =
    Math.max(
      1,
      Math.round(
        shotSeconds * fps
      )
    );

  const shotNumber =
    Math.floor(
      frame / shotFrames
    );

  const asset =
    assets[
      shotNumber %
        assets.length
    ];

  const localFrame =
    frame % shotFrames;

  const opacity =
    interpolate(
      localFrame,
      [0, 8],
      [0.28, 1],
      {
        extrapolateLeft:
          "clamp",
        extrapolateRight:
          "clamp",
      }
    );

  const localProgress =
    interpolate(
      localFrame,
      [0, shotFrames],
      [0, 1],
      {
        extrapolateLeft:
          "clamp",
        extrapolateRight:
          "clamp",
      }
    );

  const scale =
    1.03 +
    localProgress * 0.06;

  const titleOpacity =
    interpolate(
      frame,
      [
        0,
        Math.round(fps * 0.4),
        Math.round(fps * 7.2),
        Math.round(fps * 8.4),
      ],
      [0, 1, 1, 0],
      {
        extrapolateLeft:
          "clamp",
        extrapolateRight:
          "clamp",
      }
    );

  const isVideo =
    asset.mimeType.startsWith(
      "video/"
    );

  return (
    <AbsoluteFill
      style={{
        background: BG,
        color: WHITE,
        overflow: "hidden",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      {isVideo ? (
        <Video
          key={asset.id}
          src={asset.dataUrl}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity,
            transform:
              `scale(${scale})`,
          }}
        />
      ) : (
        <Img
          key={asset.id}
          src={asset.dataUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity,
            transform:
              `scale(${scale})`,
          }}
        />
      )}

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg, rgba(4,7,15,.80) 0%, rgba(4,7,15,.36) 48%, rgba(4,7,15,.10) 76%), linear-gradient(0deg, rgba(4,7,15,.70), transparent 46%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 84,
          top: 70,
          color: CYAN,
          fontSize: 19,
          letterSpacing: 3.8,
          fontWeight: 900,
          textTransform:
            "uppercase",
        }}
      >
        THE WORLD EXPLAINED THROUGH EVIDENCE
      </div>

      <div
        style={{
          position: "absolute",
          left: 84,
          bottom: 120,
          width: 1320,
          opacity:
            titleOpacity,
        }}
      >
        <div
          style={{
            fontSize: 106,
            lineHeight: 0.93,
            letterSpacing: -5.2,
            fontWeight: 1000,
          }}
        >
          {openingHeadline(
            project,
            scene
          )}
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 34,
            lineHeight: 1.28,
            color:
              "#d8deed",
            maxWidth: 1120,
          }}
        >
          Heavy rain is part of the answer. The city determines what happens next.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 72,
          bottom: 46,
          color: MUTED,
          fontSize: 16,
          letterSpacing: 0.35,
          background:
            "rgba(5,9,20,.55)",
          padding:
            "8px 12px",
          borderRadius: 999,
          border:
            "1px solid rgba(255,255,255,.10)",
        }}
      >
        Visual evidence ·{" "}
        {sourceLabel(asset)}
      </div>
    </AbsoluteFill>
  );
}

export function CinematicEvidenceMontageScene({
  scene,
  project,
  sceneIndex,
}: {
  scene: Scene;
  project: EpisodeProject;
  sceneIndex: number;
}) {
  const frame =
    useCurrentFrame();

  const { fps } =
    useVideoConfig();

  if (
    sceneIndex === 0 &&
    scene.kind === "hook"
  ) {
    return (
      <OpeningRhythmScene
        scene={scene}
        project={project}
      />
    );
  }

  const assets =
    rankedAssetsForScene(
      project,
      scene
    ).slice(0, 3);

  if (!assets.length) {
    return (
      <AbsoluteFill
        style={{
          background: BG,
        }}
      />
    );
  }

  const titleEnter =
    spring({
      frame:
        Math.max(
          0,
          frame -
            Math.round(
              fps * 0.28
            )
        ),
      fps,
      config: {
        damping: 18,
        stiffness: 92,
      },
    });

  const labels =
    scene.visualLabels?.length
      ? scene.visualLabels.slice(
          0,
          5
        )
      : [];

  if (assets.length === 1) {
    return (
      <AbsoluteFill
        style={{
          background: BG,
          color: WHITE,
          overflow:
            "hidden",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        }}
      >
        <EvidenceImage
          asset={assets[0]}
          frame={frame}
          fps={fps}
          index={0}
          dominant
        />

        <div
          style={{
            position:
              "absolute",
            left: 90,
            top: 90,
            width: 950,
          }}
        >
          <div
            style={{
              color: CYAN,
              fontSize: 15,
              letterSpacing:
                3.5,
              fontWeight: 900,
              textTransform:
                "uppercase",
            }}
          >
            VISUAL CALLBACK · EARLIER EVIDENCE
          </div>

          <div
            style={{
              marginTop: 16,
              fontSize: 67,
              lineHeight: 0.98,
              letterSpacing:
                -3.1,
              fontWeight: 1000,
              opacity:
                titleEnter,
              transform:
                `translateY(${interpolate(
                  titleEnter,
                  [0, 1],
                  [28, 0]
                )}px)`,
            }}
          >
            {scene.headline}
          </div>

          <div
            style={{
              marginTop: 26,
              maxWidth: 1120,
              fontSize: 25,
              lineHeight: 1.42,
              color: "#d0d7e8",
              opacity: 0.92,
            }}
          >
            {scene.body}
          </div>
        </div>

        {labels.length > 0 && (
          <div
            style={{
              position:
                "absolute",
              right: 84,
              bottom: 76,
              display:
                "flex",
              gap: 12,
              flexWrap:
                "wrap",
              justifyContent:
                "flex-end",
              maxWidth: 700,
            }}
          >
            {labels.map(
              (label, index) => (
                <div
                  key={`${label}-${index}`}
                  style={{
                    padding:
                      "11px 15px",
                    borderRadius:
                      999,
                    background:
                      "rgba(5,9,20,.64)",
                    border:
                      "1px solid rgba(255,255,255,.16)",
                    backdropFilter:
                      "blur(10px)",
                    fontSize:
                      16,
                    fontWeight:
                      800,
                  }}
                >
                  {label}
                </div>
              )
            )}
          </div>
        )}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 18% 12%, rgba(85,216,255,.10), transparent 28%), #050914",
        color: WHITE,
        overflow:
          "hidden",
        padding:
          "74px 82px 58px",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "1.35fr .75fr",
          gap: 24,
          height: "100%",
        }}
      >
        <div
          style={{
            position:
              "relative",
            minHeight: 0,
          }}
        >
          <EvidenceImage
            asset={assets[0]}
            frame={frame}
            fps={fps}
            index={0}
            dominant
          />

          <div
            style={{
              position:
                "absolute",
              left: 42,
              top: 42,
              width: "76%",
            }}
          >
            <div
              style={{
                color: CYAN,
                fontSize:
                  14,
                letterSpacing:
                  3.2,
                fontWeight:
                  900,
                textTransform:
                  "uppercase",
              }}
            >
              CINEMATIC EVIDENCE CALLBACK
            </div>

            <div
              style={{
                marginTop:
                  13,
                fontSize:
                  58,
                lineHeight:
                  0.98,
                letterSpacing:
                  -2.8,
                fontWeight:
                  1000,
                opacity:
                  titleEnter,
              }}
            >
              {scene.headline}
            </div>
          </div>
        </div>

        <div
          style={{
            display:
              "grid",
            gridTemplateRows:
              assets.length >= 3
                ? "1fr 1fr"
                : "1fr auto",
            gap: 24,
            minHeight: 0,
          }}
        >
          <EvidenceImage
            asset={assets[1]}
            frame={frame}
            fps={fps}
            index={1}
          />

          {assets[2] ? (
            <EvidenceImage
              asset={assets[2]}
              frame={frame}
              fps={fps}
              index={2}
            />
          ) : (
            <div
              style={{
                padding:
                  "28px 30px",
                borderRadius:
                  26,
                border:
                  "1px solid rgba(85,216,255,.18)",
                background:
                  "rgba(85,216,255,.055)",
                alignSelf:
                  "end",
              }}
            >
              <div
                style={{
                  color:
                    CYAN,
                  fontSize:
                    13,
                  letterSpacing:
                    2.7,
                  fontWeight:
                    900,
                  textTransform:
                    "uppercase",
                }}
              >
                WHAT THIS MEANS
              </div>

              <div
                style={{
                  marginTop:
                    12,
                  fontSize:
                    23,
                  lineHeight:
                    1.42,
                  color:
                    "#d5dced",
                }}
              >
                {scene.body}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position:
            "absolute",
          left: 82,
          bottom: 20,
          color: MUTED,
          fontSize: 13,
          letterSpacing:
            0.4,
        }}
      >
        Scene {String(
          sceneIndex + 1
        ).padStart(
          2,
          "0"
        )} · Reuses real project evidence as a visual callback; no new proof is implied.
      </div>
    </AbsoluteFill>
  );
}
