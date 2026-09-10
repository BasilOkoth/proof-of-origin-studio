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

import type { EditorialBeat } from "@/lib/editorial-director";
import type { EpisodeProject, Scene } from "@/lib/types";
import {
  DataChartScene,
  MapStoryScene,
  SourceHighlightScene,
} from "./EvidenceVisualScenes";

const bg = "#070b16";
const white = "#f7f9ff";
const muted = "#9eabc8";
const blue = "#6c7cff";
const cyan = "#55d8ff";
const red = "#ff6f86";
const green = "#63e6a7";

function FrameChrome({
  eyebrow,
  project,
  children,
  quiet = false,
}: {
  eyebrow: string;
  project: EpisodeProject;
  children: React.ReactNode;
  quiet?: boolean;
}) {
  const evidenceMode =
    project.episode.storyMode && project.episode.storyMode !== "hps";

  return (
    <AbsoluteFill
      style={{
        background: quiet
          ? "#080a0f"
          : "radial-gradient(circle at 85% 8%, rgba(85,216,255,.16), transparent 32%), radial-gradient(circle at 10% 5%, rgba(108,124,255,.23), transparent 28%), #070b16",
        color: white,
        padding: 90,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: 5,
          color: quiet ? muted : cyan,
          textTransform: "uppercase",
          marginBottom: 24,
          opacity: quiet ? 0.55 : 1,
        }}
      >
        {eyebrow}
      </div>

      {children}

      <div
        style={{
          position: "absolute",
          right: 72,
          bottom: 48,
          display: "flex",
          gap: 10,
          alignItems: "center",
          color: muted,
          fontSize: 21,
          opacity: quiet ? 0.35 : 0.8,
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: `linear-gradient(135deg, ${blue}, ${cyan})`,
            color: white,
            fontSize: 16,
            fontWeight: 1000,
          }}
        >
          {evidenceMode ? "E" : "H"}
        </span>

        {evidenceMode
          ? "Evidence Studio · Show your work"
          : "Proof of Origin · HPS"}
      </div>
    </AbsoluteFill>
  );
}

function Headline({
  children,
  maxWidth = 1480,
  restrained = false,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  restrained?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: { damping: 18 },
  });

  return (
    <div
      style={{
        fontSize: restrained ? 70 : 84,
        fontWeight: 1000,
        letterSpacing: restrained ? -3.5 : -4.5,
        lineHeight: 0.98,
        maxWidth,
        transform: `translateY(${interpolate(
          enter,
          [0, 1],
          [restrained ? 20 : 50, 0]
        )}px)`,
        opacity: enter,
      }}
    >
      {children}
    </div>
  );
}

function Body({
  children,
  restrained = false,
}: {
  children: React.ReactNode;
  restrained?: boolean;
}) {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        marginTop: 30,
        maxWidth: 1280,
        fontSize: restrained ? 30 : 34,
        lineHeight: 1.42,
        color: muted,
        opacity: interpolate(frame, [8, 20], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {children}
    </div>
  );
}

function MediaBeat({
  scene,
  project,
  beat,
}: {
  scene: Scene;
  project: EpisodeProject;
  beat: EditorialBeat;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const asset = project.assets.find(
    (item) => item.id === scene.assetId
  );

  const progress = interpolate(
    frame,
    [0, Math.max(1, beat.durationSec * fps)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const scale =
    beat.type === "cold_open"
      ? interpolate(progress, [0, 1], [1.03, 1.13])
      : interpolate(progress, [0, 1], [1.01, 1.08]);

  if (asset?.dataUrl) {
    const isVideo = asset.mimeType.startsWith("video/");

    return (
      <AbsoluteFill
        style={{
          background: bg,
          overflow: "hidden",
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
              transform: `scale(${scale})`,
            }}
          />
        ) : (
          <Img
            src={asset.dataUrl}
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
              "linear-gradient(90deg, rgba(4,7,15,.76), rgba(4,7,15,.08) 65%), linear-gradient(0deg, rgba(4,7,15,.68), transparent 48%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 88,
            bottom: 120,
            maxWidth: 1050,
            color: white,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: 21,
              fontWeight: 900,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: cyan,
            }}
          >
            {scene.eyebrow}
          </div>

          <div
            style={{
              marginTop: 16,
              fontSize: 68,
              lineHeight: 0.98,
              fontWeight: 1000,
              letterSpacing: -3.5,
            }}
          >
            {scene.headline}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <FrameChrome
      eyebrow={
        beat.shotRole === "archive"
          ? "ARCHIVAL CONTEXT"
          : scene.eyebrow
      }
      project={project}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr .8fr",
          gap: 70,
          alignItems: "center",
          height: "78%",
        }}
      >
        <div>
          <Headline maxWidth={920}>{scene.headline}</Headline>
          <Body>{scene.body}</Body>
        </div>

        <div
          style={{
            height: 620,
            borderRadius: 30,
            border: "1px solid rgba(255,255,255,.1)",
            background:
              beat.shotRole === "archive"
                ? "linear-gradient(135deg,#d8d0bf,#8d877a)"
                : "linear-gradient(135deg,#18233a,#0b111d)",
            display: "grid",
            placeItems: "center",
            padding: 50,
            boxShadow: "0 40px 120px rgba(0,0,0,.35)",
          }}
        >
          <div
            style={{
              textAlign: "center",
              maxWidth: 480,
            }}
          >
            <div
              style={{
                fontSize: 18,
                textTransform: "uppercase",
                letterSpacing: 4,
                fontWeight: 900,
                color:
                  beat.shotRole === "archive"
                    ? "#4b463f"
                    : cyan,
              }}
            >
              {beat.shotRole === "archive"
                ? "Source-labelled archive"
                : "Documentary B-roll"}
            </div>

            <div
              style={{
                marginTop: 24,
                fontSize: 31,
                lineHeight: 1.2,
                fontWeight: 900,
                color:
                  beat.shotRole === "archive"
                    ? "#171512"
                    : white,
              }}
            >
              {beat.visualAction}
            </div>
          </div>
        </div>
      </div>
    </FrameChrome>
  );
}

function DocumentBeat({
  scene,
  project,
  beat,
}: {
  scene: Scene;
  project: EpisodeProject;
  beat: EditorialBeat;
}) {
  const asset = project.assets.find(
    (item) => item.id === scene.assetId
  )?.dataUrl;

  const frame = useCurrentFrame();
  const zoom =
    beat.type === "reveal" || beat.emphasis === "high"
      ? interpolate(frame, [0, 50], [1, 1.07], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <FrameChrome eyebrow={scene.eyebrow} project={project}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: ".9fr 1.1fr",
          gap: 66,
          alignItems: "center",
          height: "80%",
        }}
      >
        <div>
          <Headline maxWidth={760} restrained>
            {scene.headline}
          </Headline>
          <Body restrained>{scene.body}</Body>
        </div>

        <div
          style={{
            height: 690,
            borderRadius: 28,
            border: "1px solid rgba(255,255,255,.12)",
            background: asset
              ? "#0e1424"
              : "linear-gradient(180deg,#f4f6fb,#dce3f0)",
            boxShadow: "0 40px 120px rgba(0,0,0,.45)",
            overflow: "hidden",
            transform: `scale(${zoom})`,
            transformOrigin: "center",
          }}
        >
          {asset ? (
            <Img
              src={asset}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <>
              <div
                style={{
                  height: 86,
                  background: "#17345b",
                  marginBottom: 34,
                }}
              />
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <div
                  key={n}
                  style={{
                    height: 15,
                    width: `${78 - n * 4}%`,
                    background:
                      n === 3
                        ? "rgba(255,111,134,.75)"
                        : "#aab7ca",
                    borderRadius: 8,
                    margin: "22px 52px",
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 90,
          bottom: 72,
          fontSize: 17,
          color: muted,
          maxWidth: 930,
        }}
      >
        {beat.visualAction}
      </div>
    </FrameChrome>
  );
}

function ValueSwapBeat({
  scene,
  project,
  beat,
}: {
  scene: Scene;
  project: EpisodeProject;
  beat: EditorialBeat;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: Math.max(0, frame - Math.round(fps * 0.35)),
    fps,
    config: { damping: 15 },
  });

  return (
    <FrameChrome eyebrow={scene.eyebrow} project={project}>
      <Headline>{scene.headline}</Headline>

      <div
        style={{
          marginTop: 95,
          display: "flex",
          alignItems: "center",
          gap: 54,
        }}
      >
        <div
          style={{
            padding: "30px 38px",
            border: "1px solid rgba(255,255,255,.13)",
            borderRadius: 24,
            fontSize: 72,
            fontWeight: 1000,
            textDecoration: "line-through",
            textDecorationColor: red,
          }}
        >
          {scene.before || "ORIGINAL"}
        </div>

        <div style={{ fontSize: 60, color: muted }}>→</div>

        <div
          style={{
            padding: "30px 38px",
            border: `1px solid ${red}`,
            borderRadius: 24,
            background: "rgba(255,111,134,.09)",
            fontSize: 72,
            fontWeight: 1000,
            color: red,
            transform: `scale(${interpolate(
              enter,
              [0, 1],
              [0.82, 1]
            )})`,
            opacity: enter,
          }}
        >
          {scene.after || "CHANGED"}
        </div>
      </div>

      <Body>{scene.body}</Body>

      {beat.type === "reveal" && (
        <div
          style={{
            position: "absolute",
            right: 90,
            top: 90,
            padding: "12px 18px",
            borderRadius: 999,
            border: "1px solid rgba(255,111,134,.35)",
            color: red,
            fontWeight: 900,
            letterSpacing: 2,
            fontSize: 16,
          }}
        >
          REVEAL
        </div>
      )}
    </FrameChrome>
  );
}

function ConfidenceBeat({
  scene,
  project,
}: {
  scene: Scene;
  project: EpisodeProject;
}) {
  const frame = useCurrentFrame();
  const score = scene.metric ?? 79;

  const width = interpolate(frame, [12, 65], [0, score], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <FrameChrome eyebrow={scene.eyebrow} project={project}>
      <Headline>{scene.headline}</Headline>

      <div style={{ marginTop: 70, maxWidth: 1250 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
          }}
        >
          <span style={{ fontSize: 28, color: muted }}>
            Relationship confidence
          </span>

          <strong style={{ fontSize: 76 }}>
            {Math.round(width)}/100
          </strong>
        </div>

        <div
          style={{
            height: 24,
            marginTop: 18,
            background: "rgba(255,255,255,.08)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${width}%`,
              height: "100%",
              borderRadius: 999,
              background: `linear-gradient(90deg,${blue},${cyan})`,
            }}
          />
        </div>
      </div>

      <Body>{scene.body}</Body>
    </FrameChrome>
  );
}

function DiagramBeat({
  scene,
  project,
}: {
  scene: Scene;
  project: EpisodeProject;
}) {
  const frame = useCurrentFrame();
  const labels = scene.visualLabels?.length
    ? scene.visualLabels
    : ["Observation", "Interpretation", "Context", "Implication"];

  const visible = Math.max(
    1,
    Math.ceil(
      interpolate(
        frame,
        [0, 80],
        [1, labels.length],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }
      )
    )
  );

  return (
    <FrameChrome eyebrow={scene.eyebrow} project={project}>
      <Headline>{scene.headline}</Headline>

      <div
        style={{
          display: "flex",
          gap: 18,
          marginTop: 70,
        }}
      >
        {labels.slice(0, visible).map((item, index) => (
          <React.Fragment key={`${item}-${index}`}>
            <div
              style={{
                width: 300,
                minHeight: 150,
                borderRadius: 22,
                padding: 24,
                border: "1px solid rgba(255,255,255,.11)",
                background: "rgba(255,255,255,.04)",
              }}
            >
              <span style={{ color: muted, fontSize: 18 }}>
                0{index + 1}
              </span>
              <strong
                style={{
                  display: "block",
                  fontSize: 29,
                  marginTop: 14,
                }}
              >
                {item}
              </strong>
            </div>

            {index < visible - 1 && (
              <div
                style={{
                  alignSelf: "center",
                  fontSize: 36,
                  color: muted,
                }}
              >
                →
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <Body>{scene.body}</Body>
    </FrameChrome>
  );
}

function TimelineBeat({
  scene,
  project,
}: {
  scene: Scene;
  project: EpisodeProject;
}) {
  const labels = scene.visualLabels?.length
    ? scene.visualLabels
    : ["Baseline", "Change", "Evidence", "Context", "Meaning"];

  return (
    <FrameChrome eyebrow={scene.eyebrow} project={project}>
      <Headline>{scene.headline}</Headline>

      <div
        style={{
          marginTop: 88,
          display: "flex",
          alignItems: "center",
        }}
      >
        {labels.map((step, index) => (
          <React.Fragment key={`${step}-${index}`}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  background:
                    index === labels.length - 1 ? green : blue,
                  fontWeight: 1000,
                  fontSize: 26,
                }}
              >
                {index + 1}
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: 22,
                  fontWeight: 900,
                  maxWidth: 170,
                }}
              >
                {step}
              </div>
            </div>

            {index < labels.length - 1 && (
              <div
                style={{
                  height: 4,
                  flex: 1,
                  background: "rgba(255,255,255,.13)",
                  margin: "0 15px 42px",
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      <Body>{scene.body}</Body>
    </FrameChrome>
  );
}

function QuietBeat({
  scene,
  project,
}: {
  scene: Scene;
  project: EpisodeProject;
}) {
  return (
    <FrameChrome
      eyebrow={scene.eyebrow}
      project={project}
      quiet
    >
      <div
        style={{
          marginTop: 120,
          maxWidth: 1420,
        }}
      >
        <div
          style={{
            fontSize: 150,
            lineHeight: 0.5,
            color: cyan,
            opacity: 0.18,
          }}
        >
          “
        </div>

        <Headline restrained>{scene.headline}</Headline>

        <div
          style={{
            marginTop: 48,
            fontSize: 42,
            lineHeight: 1.28,
            color: "#d6dceb",
            fontWeight: 700,
            maxWidth: 1200,
          }}
        >
          {scene.body}
        </div>
      </div>
    </FrameChrome>
  );
}

function HeadlineBeat({
  scene,
  project,
  beat,
}: {
  scene: Scene;
  project: EpisodeProject;
  beat: EditorialBeat;
}) {
  return (
    <FrameChrome eyebrow={scene.eyebrow} project={project}>
      <div style={{ marginTop: scene.kind === "hook" ? 120 : 50 }}>
        <Headline>{scene.headline}</Headline>
        <Body>{scene.body}</Body>

        {beat.type === "callback" && (
          <div
            style={{
              marginTop: 42,
              display: "inline-flex",
              padding: "12px 17px",
              borderRadius: 999,
              border: "1px solid rgba(85,216,255,.22)",
              color: cyan,
              fontSize: 16,
              letterSpacing: 2.5,
              fontWeight: 900,
            }}
          >
            CALLBACK
          </div>
        )}
      </div>
    </FrameChrome>
  );
}

export function EditorialBeatScene({
  scene,
  project,
  beat,
}: {
  scene: Scene;
  project: EpisodeProject;
  beat: EditorialBeat;
}) {
  const approvedVisualKind = String(scene.visualPlan?.kind || "");
  const hasAssignedAsset = Boolean(
    scene.assetId &&
      project.assets.some(
        (asset) => asset.id === scene.assetId && Boolean(asset.dataUrl)
      )
  );

  /*
   * First-class visual evidence must render as media whenever a scene has a
   * real assigned asset. This is intentionally broader than field_evidence
   * alone because many saved scenes still carry a stale source_highlight kind.
   */
  if (
    hasAssignedAsset &&
    approvedVisualKind !== "systems_diagram" &&
    !scene.map &&
    !scene.chart
  ) {
    return (
      <MediaBeat
        scene={scene}
        project={project}
        beat={{ ...beat, shotRole: "broll" }}
      />
    );
  }

  if (beat.shotRole === "map" && scene.map) {
    return <MapStoryScene scene={scene} />;
  }

  if (beat.shotRole === "chart" && scene.chart) {
    return <DataChartScene scene={scene} />;
  }

  if (
    scene.kind === "source_highlight" &&
    approvedVisualKind !== "systems_diagram" &&
    approvedVisualKind !== "field_evidence"
  ) {
    return <SourceHighlightScene scene={scene} />;
  }

  if (
    beat.shotRole === "broll" ||
    beat.shotRole === "archive"
  ) {
    return (
      <MediaBeat scene={scene} project={project} beat={beat} />
    );
  }

  if (
    approvedVisualKind !== "systems_diagram" &&
    approvedVisualKind !== "field_evidence" &&
    (
      beat.shotRole === "document" ||
      scene.kind === "document" ||
      scene.kind === "proof_card"
    )
  ) {
    return (
      <DocumentBeat
        scene={scene}
        project={project}
        beat={beat}
      />
    );
  }

  if (scene.kind === "value_swap") {
    return (
      <ValueSwapBeat
        scene={scene}
        project={project}
        beat={beat}
      />
    );
  }

  if (scene.kind === "confidence") {
    return <ConfidenceBeat scene={scene} project={project} />;
  }

  if (scene.kind === "diagram") {
    return <DiagramBeat scene={scene} project={project} />;
  }

  if (scene.kind === "timeline") {
    return <TimelineBeat scene={scene} project={project} />;
  }

  if (beat.type === "breath" || beat.shotRole === "quiet") {
    return <QuietBeat scene={scene} project={project} />;
  }

  return (
    <HeadlineBeat
      scene={scene}
      project={project}
      beat={beat}
    />
  );
}
