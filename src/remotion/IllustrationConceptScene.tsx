import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type {
  IllustrationEdge,
  IllustrationNode,
  IllustrationScenePlan,
} from "@/lib/illustration-director";
import type { Scene } from "@/lib/types";

const BG = "#07101f";
const WHITE = "#f7f4ea";
const MUTED = "#9eabc8";
const CYAN = "#64d2ff";
const PURPLE = "#7c5cfc";
const GOLD = "#ffd166";
const RED = "#ff6f86";
const GREEN = "#63e6a7";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function phaseNumber(phase: number | undefined) {
  return Math.max(0, phase ?? 0);
}

function nodeColor(node: IllustrationNode) {
  if (node.evidenceStatus === "uncertain") return GOLD;
  if (node.evidenceStatus === "interpreted") return PURPLE;
  if (node.role === "outcome") return RED;
  if (node.role === "constraint") return GOLD;
  return CYAN;
}

function edgeColor(edge: IllustrationEdge) {
  if (edge.evidenceStatus === "uncertain") return GOLD;
  if (edge.evidenceStatus === "interpreted") return PURPLE;
  return CYAN;
}

function statusLabel(status: IllustrationNode["evidenceStatus"]) {
  if (status === "observed") return "OBSERVED";
  if (status === "interpreted") return "INTERPRETED";
  return "UNCERTAIN";
}

function StageChrome({
  scene,
  plan,
  children,
}: {
  scene: Scene;
  plan: IllustrationScenePlan;
  children: React.ReactNode;
}) {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 88% 8%, rgba(100,210,255,.13), transparent 28%), radial-gradient(circle at 10% 90%, rgba(124,92,252,.12), transparent 30%), #07101f",
        color: WHITE,
        padding: "72px 82px 62px",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 30,
          alignItems: "start",
        }}
      >
        <div style={{ maxWidth: 1170 }}>
          <div
            style={{
              fontSize: 16,
              letterSpacing: 4,
              fontWeight: 900,
              color: CYAN,
              textTransform: "uppercase",
            }}
          >
            VISUAL EXPLANATION · {plan.metaphor?.label || "SYSTEM"}
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 58,
              lineHeight: 1,
              fontWeight: 1000,
              letterSpacing: -2.7,
            }}
          >
            {scene.headline}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            justifyItems: "end",
            color: MUTED,
            fontSize: 14,
            letterSpacing: 1.4,
          }}
        >
          <div>OBSERVED <span style={{ color: CYAN }}>●</span></div>
          <div>INTERPRETED <span style={{ color: PURPLE }}>●</span></div>
          <div>UNCERTAIN <span style={{ color: GOLD }}>●</span></div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>

      <div
        style={{
          position: "absolute",
          left: 82,
          bottom: 28,
          color: MUTED,
          fontSize: 14,
          maxWidth: 1250,
          opacity: 0.78,
        }}
      >
        {plan.execution?.evidenceBoundary ||
          "Illustration distinguishes source-backed evidence from interpretation."}
      </div>
    </AbsoluteFill>
  );
}

function FlowNetwork({
  plan,
  phase,
}: {
  plan: IllustrationScenePlan;
  phase: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const execution = plan.execution;
  if (!execution) return null;

  const nodes = execution.nodes.slice(0, 6);
  const edges = execution.edges.slice(0, Math.max(0, nodes.length - 1));
  const width = 1500;
  const left = 65;
  const nodeWidth = 215;
  const gap =
    nodes.length > 1
      ? (width - nodeWidth - left * 2) / (nodes.length - 1)
      : 0;
  const y = 360;

  const localProgress = interpolate(
    frame,
    [0, Math.max(1, fps * 4)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );

  const revealBudget = Math.min(
    nodes.length,
    Math.max(1, phase + 2 + Math.floor(localProgress * 2))
  );

  return (
    <div
      style={{
        position: "relative",
        height: 650,
        marginTop: 35,
      }}
    >
      <svg
        viewBox="0 0 1600 650"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
        }}
      >
        <defs>
          <marker
            id="arrowObserved"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L10,4 L0,8 Z" fill={CYAN} />
          </marker>
          <marker
            id="arrowInterpreted"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L10,4 L0,8 Z" fill={PURPLE} />
          </marker>
          <marker
            id="arrowUncertain"
            markerWidth="12"
            markerHeight="12"
            refX="9"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L10,4 L0,8 Z" fill={GOLD} />
          </marker>
        </defs>

        {edges.map((edge, index) => {
          if (index + 1 >= revealBudget) return null;

          const x1 = left + index * gap + nodeWidth;
          const x2 = left + (index + 1) * gap;
          const color = edgeColor(edge);
          const edgeProgress = clamp01(
            (localProgress * 1.6 - index * 0.12) + phase * 0.35
          );
          const pathLength = Math.max(40, x2 - x1);

          return (
            <g key={edge.id}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={color}
                strokeWidth={5}
                strokeLinecap="round"
                strokeDasharray={
                  edge.evidenceStatus === "observed"
                    ? `${pathLength} ${pathLength}`
                    : "13 12"
                }
                strokeDashoffset={
                  edge.evidenceStatus === "observed"
                    ? pathLength * (1 - edgeProgress)
                    : 0
                }
                opacity={0.82}
                markerEnd={`url(#arrow${
                  edge.evidenceStatus === "observed"
                    ? "Observed"
                    : edge.evidenceStatus === "interpreted"
                      ? "Interpreted"
                      : "Uncertain"
                })`}
              />

              {edgeProgress > 0.65 && (
                <circle
                  cx={
                    x1 +
                    (x2 - x1) *
                      ((frame / Math.max(1, fps * 1.4) + index * 0.17) % 1)
                  }
                  cy={y}
                  r={8}
                  fill={color}
                  opacity={0.95}
                />
              )}
            </g>
          );
        })}
      </svg>

      {nodes.map((node, index) => {
        if (index >= revealBudget) return null;

        const x = left + index * gap;
        const delay = Math.max(0, index * 6 - phase * 12);
        const enter = spring({
          frame: Math.max(0, frame - delay),
          fps,
          config: { damping: 17, stiffness: 100 },
        });
        const color = nodeColor(node);

        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: `${(x / 1600) * 100}%`,
              top: y - 105,
              width: nodeWidth,
              minHeight: 205,
              padding: "23px 20px",
              borderRadius: 28,
              border: `2px solid ${color}55`,
              background: `linear-gradient(180deg, ${color}1c, rgba(255,255,255,.035))`,
              boxShadow: `0 24px 70px ${color}12`,
              transform: `translateY(${interpolate(
                enter,
                [0, 1],
                [35, 0]
              )}px) scale(${interpolate(enter, [0, 1], [0.92, 1])})`,
              opacity: enter,
            }}
          >
            <div
              style={{
                fontSize: 12,
                letterSpacing: 2.2,
                fontWeight: 900,
                color,
              }}
            >
              {statusLabel(node.evidenceStatus)}
            </div>
            <div
              style={{
                marginTop: 15,
                fontSize: 25,
                lineHeight: 1.08,
                fontWeight: 950,
              }}
            >
              {node.label}
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 13,
                letterSpacing: 1.4,
                color: MUTED,
                textTransform: "uppercase",
              }}
            >
              {node.role}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Comparison({
  plan,
  phase,
}: {
  plan: IllustrationScenePlan;
  phase: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const execution = plan.execution;
  if (!execution) return null;

  const leftEnter = spring({
    frame,
    fps,
    config: { damping: 18 },
  });
  const rightEnter = spring({
    frame: Math.max(0, frame - Math.round(fps * 0.55)),
    fps,
    config: { damping: 18 },
  });

  const difference = interpolate(
    frame + phase * fps,
    [0, fps * 2.2],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <div
      style={{
        height: 640,
        marginTop: 35,
        display: "grid",
        gridTemplateColumns: "1fr 120px 1fr",
        alignItems: "center",
        gap: 22,
      }}
    >
      {[{
        label: execution.beforeLabel || "Before",
        enter: leftEnter,
        color: MUTED,
        fill: "rgba(255,255,255,.04)",
      }, {
        label: execution.afterLabel || "After",
        enter: rightEnter,
        color: CYAN,
        fill: "rgba(100,210,255,.08)",
      }].map((state, index) => (
        <React.Fragment key={state.label}>
          {index === 1 && (
            <div
              style={{
                textAlign: "center",
                fontSize: 60,
                color: difference > 0.5 ? CYAN : MUTED,
                transform: `scale(${0.8 + difference * 0.2})`,
              }}
            >
              →
            </div>
          )}
          <div
            style={{
              height: 410,
              borderRadius: 34,
              border: `2px solid ${state.color}55`,
              background: state.fill,
              padding: 42,
              display: "grid",
              alignContent: "center",
              opacity: state.enter,
              transform: `translateY(${interpolate(
                state.enter,
                [0, 1],
                [40, 0]
              )}px)`,
            }}
          >
            <div
              style={{
                fontSize: 15,
                letterSpacing: 3,
                color: state.color,
                fontWeight: 900,
              }}
            >
              {index === 0 ? "BASELINE" : "CHANGED STATE"}
            </div>
            <div
              style={{
                marginTop: 20,
                fontSize: 50,
                lineHeight: 1,
                fontWeight: 1000,
                maxWidth: 520,
              }}
            >
              {state.label}
            </div>
            <div
              style={{
                marginTop: 35,
                height: 14,
                width: `${index === 0 ? 46 : 46 + difference * 38}%`,
                background: state.color,
                borderRadius: 999,
                opacity: 0.85,
              }}
            />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function ScaleLadder({
  plan,
  phase,
}: {
  plan: IllustrationScenePlan;
  phase: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nodes = plan.execution?.nodes.slice(0, 5) || [];

  return (
    <div
      style={{
        height: 620,
        marginTop: 50,
        display: "flex",
        alignItems: "end",
        justifyContent: "center",
        gap: 44,
      }}
    >
      {nodes.map((node, index) => {
        const enter = spring({
          frame: Math.max(0, frame + phase * 12 - index * 8),
          fps,
          config: { damping: 17 },
        });
        const height = 135 + index * 72;
        const width = 150 + index * 27;
        const color = nodeColor(node);

        return (
          <div
            key={node.id}
            style={{
              display: "grid",
              justifyItems: "center",
              gap: 16,
              opacity: enter,
              transform: `translateY(${interpolate(
                enter,
                [0, 1],
                [50, 0]
              )}px)`,
            }}
          >
            <div
              style={{
                width,
                height,
                borderRadius: 30,
                background: `linear-gradient(180deg, ${color}30, ${color}0f)`,
                border: `2px solid ${color}66`,
                display: "grid",
                placeItems: "center",
                fontSize: 40,
                fontWeight: 1000,
                color,
              }}
            >
              {index + 1}
            </div>
            <div
              style={{
                width: 220,
                textAlign: "center",
                fontSize: 20,
                lineHeight: 1.1,
                fontWeight: 850,
              }}
            >
              {node.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function IllustrationConceptScene({
  scene,
  plan,
  phase = 0,
}: {
  scene: Scene;
  plan: IllustrationScenePlan;
  phase?: number;
}) {
  const execution = plan.execution;

  return (
    <StageChrome scene={scene} plan={plan}>
      {!execution ? (
        <div
          style={{
            marginTop: 120,
            padding: 42,
            borderRadius: 30,
            border: "1px solid rgba(255,255,255,.12)",
            color: MUTED,
            fontSize: 30,
          }}
        >
          No executable visual structure was generated for this scene.
        </div>
      ) : execution.kind === "comparison" ? (
        <Comparison plan={plan} phase={phaseNumber(phase)} />
      ) : execution.kind === "scale_ladder" ? (
        <ScaleLadder plan={plan} phase={phaseNumber(phase)} />
      ) : (
        <FlowNetwork plan={plan} phase={phaseNumber(phase)} />
      )}
    </StageChrome>
  );
}
