import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  buildOpenStreetMapTiles,
  enrichMapSpec,
  fitMapView,
  layerPath,
  projectMapPoint,
} from "@/lib/map-engine";
import type {
  ChartDatum,
  MapLayerSpec,
  Scene,
} from "@/lib/types";

const bg = "#070b16";
const white = "#f7f9ff";
const muted = "#9eabc8";
const blue = "#6c7cff";
const cyan = "#55d8ff";
const green = "#63e6a7";
const gold = "#ffd166";

function Shell({
  scene,
  children,
}: {
  scene: Scene;
  children: React.ReactNode;
}) {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 82% 7%, rgba(85,216,255,.14), transparent 32%), radial-gradient(circle at 8% 4%, rgba(108,124,255,.2), transparent 30%), #070b16",
        color: white,
        padding: 90,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 23,
          fontWeight: 900,
          letterSpacing: 5,
          color: cyan,
          textTransform: "uppercase",
        }}
      >
        {scene.eyebrow}
      </div>

      {children}

      <div
        style={{
          position: "absolute",
          right: 72,
          bottom: 45,
          color: muted,
          fontSize: 19,
          letterSpacing: 1,
        }}
      >
        EVIDENCE STUDIO · SHOW YOUR WORK
      </div>
    </AbsoluteFill>
  );
}

function Title({ children }: { children: React.ReactNode }) {
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
        marginTop: 28,
        maxWidth: 1500,
        fontSize: 70,
        fontWeight: 1000,
        letterSpacing: -3.7,
        lineHeight: 1,
        opacity: enter,
        transform: `translateY(${interpolate(
          enter,
          [0, 1],
          [32, 0]
        )}px)`,
      }}
    >
      {children}
    </div>
  );
}

function SourceLine({ source }: { source?: string }) {
  if (!source) return null;

  return (
    <div
      style={{
        marginTop: 18,
        color: muted,
        fontSize: 20,
        maxWidth: 1450,
      }}
    >
      Source · {source}
    </div>
  );
}

function maxAbs(data: ChartDatum[]) {
  return Math.max(
    1,
    ...data.map((item) => Math.abs(item.value))
  );
}

function BarChart({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const chart = scene.chart!;
  const max = maxAbs(chart.data);

  return (
    <div
      style={{
        marginTop: 54,
        display: "grid",
        gap: 18,
        maxWidth: 1500,
      }}
    >
      {chart.data.slice(0, 10).map((item, index) => {
        const progress = interpolate(
          frame - index * 3,
          [8, 50],
          [0, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }
        );

        const width =
          (Math.abs(item.value) / max) * 100 * progress;

        return (
          <div
            key={`${item.label}-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns:
                "300px 1fr 170px",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div
              style={{
                color: white,
                fontSize: 23,
                fontWeight: 750,
              }}
            >
              {item.label}
            </div>

            <div
              style={{
                height: 36,
                borderRadius: 999,
                background: "rgba(255,255,255,.07)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${width}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${blue}, ${cyan})`,
                }}
              />
            </div>

            <div
              style={{
                fontSize: 26,
                fontWeight: 950,
                textAlign: "right",
              }}
            >
              {item.value.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
              {chart.unit ? ` ${chart.unit}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const chart = scene.chart!;
  const data = chart.data.slice(0, 30);

  const values = data.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  const progress = interpolate(
    frame,
    [12, 70],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const points = data.map((item, index) => {
    const x =
      data.length <= 1
        ? 50
        : 70 +
          (index / (data.length - 1)) * 1370;
    const y =
      500 - ((item.value - min) / span) * 360;
    return { ...item, x, y };
  });

  const visibleCount = Math.max(
    1,
    Math.ceil(points.length * progress)
  );
  const visible = points.slice(0, visibleCount);
  const path = visible
    .map(
      (point, index) =>
        `${index ? "L" : "M"} ${point.x} ${point.y}`
    )
    .join(" ");

  return (
    <div style={{ marginTop: 38 }}>
      <svg
        width="1510"
        height="580"
        viewBox="0 0 1510 580"
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <line
            key={index}
            x1="70"
            x2="1440"
            y1={140 + index * 90}
            y2={140 + index * 90}
            stroke="rgba(255,255,255,.08)"
            strokeWidth="2"
          />
        ))}

        <path
          d={path}
          fill="none"
          stroke={cyan}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {visible.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="10"
              fill={white}
            />
            {(index === 0 ||
              index === visible.length - 1 ||
              index %
                Math.max(
                  1,
                  Math.floor(points.length / 5)
                ) ===
                0) && (
              <text
                x={point.x}
                y="555"
                textAnchor="middle"
                fill={muted}
                fontSize="20"
              >
                {point.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ScatterChart({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const chart = scene.chart!;
  const data = chart.data
    .filter((item) => item.x !== undefined)
    .slice(0, 40);

  const xs = data.map((item) => Number(item.x));
  const ys = data.map((item) => item.value);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  return (
    <div style={{ marginTop: 36 }}>
      <svg
        width="1510"
        height="580"
        viewBox="0 0 1510 580"
      >
        <line
          x1="90"
          x2="1450"
          y1="510"
          y2="510"
          stroke="rgba(255,255,255,.18)"
          strokeWidth="3"
        />
        <line
          x1="90"
          x2="90"
          y1="90"
          y2="510"
          stroke="rgba(255,255,255,.18)"
          strokeWidth="3"
        />

        {data.map((item, index) => {
          const x =
            100 +
            ((Number(item.x) - minX) / spanX) *
              1320;
          const y =
            500 -
            ((item.value - minY) / spanY) *
              390;

          const enter = spring({
            frame: Math.max(0, frame - index * 2),
            fps: 30,
            config: { damping: 20 },
          });

          return (
            <circle
              key={`${item.label}-${index}`}
              cx={x}
              cy={y}
              r={7 + 6 * enter}
              fill={index % 2 ? cyan : blue}
              opacity={0.3 + 0.7 * enter}
            />
          );
        })}

        <text
          x="770"
          y="560"
          fill={muted}
          fontSize="22"
          textAnchor="middle"
        >
          {chart.xLabel}
        </text>

        <text
          x="28"
          y="300"
          fill={muted}
          fontSize="22"
          textAnchor="middle"
          transform="rotate(-90 28 300)"
        >
          {chart.yLabel}
        </text>
      </svg>
    </div>
  );
}

export function DataChartScene({
  scene,
}: {
  scene: Scene;
}) {
  const chart = scene.chart;
  if (!chart) return null;

  return (
    <Shell scene={scene}>
      <Title>{scene.headline}</Title>

      {chart.type === "line" ? (
        <LineChart scene={scene} />
      ) : chart.type === "scatter" ? (
        <ScatterChart scene={scene} />
      ) : (
        <BarChart scene={scene} />
      )}

      <SourceLine source={chart.sourceLabel} />
    </Shell>
  );
}

function LayerOverlay({
  layer,
  scene,
  mapWidth,
  mapHeight,
  view,
  progress,
  maxLayerValue,
}: {
  layer: MapLayerSpec;
  scene: Scene;
  mapWidth: number;
  mapHeight: number;
  view: ReturnType<typeof fitMapView>;
  progress: number;
  maxLayerValue: number;
}) {
  if (layer.kind === "point") {
    return (
      <>
        {layer.points.map((point, index) => {
          const p = projectMapPoint(
            point,
            view,
            mapWidth,
            mapHeight
          );

          return (
            <div
              key={`${layer.id}-${index}`}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                width: 12,
                height: 12,
                marginLeft: -6,
                marginTop: -6,
                borderRadius: 999,
                background: gold,
                opacity: progress,
              }}
            />
          );
        })}
      </>
    );
  }

  const d = layerPath(
    layer,
    view,
    mapWidth,
    mapHeight
  );

  const valueStrength =
    "value" in layer &&
    typeof layer.value === "number" &&
    Number.isFinite(layer.value)
      ? Math.max(
          0.18,
          Math.min(1, Math.abs(layer.value) / maxLayerValue)
        )
      : 0.45;

  return (
    <svg
      width={mapWidth}
      height={mapHeight}
      viewBox={`0 0 ${mapWidth} ${mapHeight}`}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <path
        d={d}
        fill={
          layer.kind === "polygon"
            ? `rgba(85,216,255,${0.08 + valueStrength * 0.28})`
            : "none"
        }
        stroke={
          layer.kind === "polygon" ? cyan : gold
        }
        strokeWidth={layer.kind === "polygon" ? 4 : 6}
        strokeDasharray={
          layer.kind === "line" ? "18 10" : undefined
        }
        opacity={0.85 * progress}
      />
    </svg>
  );
}

export function MapStoryScene({
  scene,
}: {
  scene: Scene;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rawMap = scene.map;
  if (!rawMap) return null;

  const map = enrichMapSpec(rawMap);
  const mapWidth = 1510;
  const mapHeight = 690;
  const view = fitMapView(
    map,
    mapWidth,
    mapHeight
  );

  const tiles =
    map.basemap === "openstreetmap"
      ? buildOpenStreetMapTiles(
          view,
          mapWidth,
          mapHeight,
          2
        )
      : [];

  const cameraProgress = interpolate(
    frame,
    [0, Math.max(1, fps * 2.4)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  /*
   * Cinematic camera move: begin slightly wider, then settle on the evidence
   * extent. Tiles are real Web Mercator map tiles rather than decorative grid.
   */
  const cameraScale = interpolate(
    cameraProgress,
    [0, 1],
    [0.82, 1]
  );

  const layerValues = (map.layers || [])
    .map((layer) =>
      "value" in layer ? layer.value : undefined
    )
    .filter(
      (value): value is number =>
        typeof value === "number" &&
        Number.isFinite(value)
    );
  const maxLayerValue = Math.max(
    1,
    ...layerValues.map(Math.abs)
  );

  const values = map.points
    .map((point) => point.value)
    .filter(
      (value): value is number =>
        value !== undefined
    );
  const max = Math.max(
    1,
    ...values.map(Math.abs)
  );

  return (
    <Shell scene={scene}>
      <Title>{scene.headline}</Title>

      <div
        style={{
          marginTop: 34,
          width: mapWidth,
          height: mapHeight,
          position: "relative",
          borderRadius: 34,
          overflow: "hidden",
          border:
            "1px solid rgba(255,255,255,.11)",
          background: "#101722",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${cameraScale})`,
            transformOrigin: "center",
          }}
        >
          {tiles.map((tile) => (
            <Img
              key={tile.key}
              src={tile.url}
              style={{
                position: "absolute",
                left: tile.left,
                top: tile.top,
                width: tile.size,
                height: tile.size,
                objectFit: "cover",
                filter:
                  "saturate(.7) brightness(.55) contrast(1.08)",
              }}
            />
          ))}

          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(5,10,20,.10), rgba(5,10,20,.30))",
            }}
          />

          {(map.layers || []).map(
            (layer, index) => {
              const progress = interpolate(
                frame - index * 8,
                [18, 55],
                [0, 1],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }
              );

              return (
                <LayerOverlay
                  key={layer.id}
                  layer={layer}
                  scene={scene}
                  mapWidth={mapWidth}
                  mapHeight={mapHeight}
                  view={view}
                  progress={progress}
                  maxLayerValue={maxLayerValue}
                />
              );
            }
          )}

          {map.points.map((point, index) => {
            const { x, y } = projectMapPoint(
              point,
              view,
              mapWidth,
              mapHeight
            );

            const enter = spring({
              frame: Math.max(
                0,
                frame - index * 4 - 18
              ),
              fps,
              config: { damping: 17 },
            });

            const size =
              point.value === undefined
                ? 18
                : 14 +
                  (Math.abs(point.value) / max) *
                    24;

            return (
              <div
                key={`${point.label}-${index}`}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) scale(${enter})`,
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    width:
                      map.pointMode === "heat" ? size * 4.5 : size,
                    height:
                      map.pointMode === "heat" ? size * 4.5 : size,
                    borderRadius: 999,
                    background:
                      map.pointMode === "heat"
                        ? "radial-gradient(circle, rgba(255,209,102,.78) 0%, rgba(85,216,255,.38) 38%, rgba(85,216,255,0) 72%)"
                        : cyan,
                    border:
                      map.pointMode === "heat"
                        ? "none"
                        : "3px solid rgba(255,255,255,.9)",
                    boxShadow:
                      map.pointMode === "heat"
                        ? "none"
                        : "0 0 0 8px rgba(85,216,255,.14), 0 0 30px rgba(85,216,255,.55)",
                  }}
                />

                {map.points.length <= 12 && (
                  <div
                    style={{
                      padding: "8px 11px",
                      borderRadius: 10,
                      background:
                        "rgba(7,11,22,.88)",
                      border:
                        "1px solid rgba(255,255,255,.12)",
                      fontSize: 18,
                      whiteSpace: "nowrap",
                      color: white,
                    }}
                  >
                    {point.label}
                    {point.value !== undefined
                      ? ` · ${point.value.toLocaleString(
                          undefined,
                          {
                            maximumFractionDigits: 1,
                          }
                        )}`
                      : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            left: 18,
            bottom: 14,
            padding: "7px 10px",
            borderRadius: 8,
            background: "rgba(0,0,0,.68)",
            color: "rgba(255,255,255,.8)",
            fontSize: 13,
            zIndex: 20,
          }}
        >
          {map.attribution ||
            "© OpenStreetMap contributors"}
        </div>

        <div
          style={{
            position: "absolute",
            right: 18,
            top: 16,
            padding: "8px 11px",
            borderRadius: 999,
            background: "rgba(7,11,22,.82)",
            border:
              "1px solid rgba(255,255,255,.12)",
            fontSize: 13,
            color: muted,
            zIndex: 20,
          }}
        >
          REAL BASEMAP · z{Math.round(view.zoom)}
        </div>
      </div>

      <SourceLine source={map.sourceLabel} />
    </Shell>
  );
}

export function SourceHighlightScene({
  scene,
}: {
  scene: Scene;
}) {
  const frame = useCurrentFrame();
  const reveal = interpolate(
    frame,
    [12, 45],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const sourceScene = scene as any;
  const assetUrl = sourceScene.assetUrl as string | undefined;
  const assetCaption = sourceScene.assetCaption as string | undefined;

  return (
    <Shell scene={scene}>
      <Title>{scene.headline}</Title>

      <div
        style={{
          marginTop: 58,
          display: "grid",
          gridTemplateColumns: assetUrl ? ".95fr 1.05fr" : ".82fr 1.18fr",
          gap: 52,
          alignItems: "stretch",
          maxWidth: 1510,
        }}
      >
        {assetUrl ? (
          <div
            style={{
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,.11)",
              background: "rgba(255,255,255,.03)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <Img
              src={assetUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 20,
                right: 20,
                bottom: 20,
                padding: "14px 16px",
                borderRadius: 14,
                background: "rgba(7,11,22,.8)",
                border: "1px solid rgba(255,255,255,.12)",
              }}
            >
              <div
                style={{
                  color: cyan,
                  fontSize: 17,
                  fontWeight: 900,
                  letterSpacing: 2.5,
                }}
              >
                SOURCE IMAGE
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 22,
                  lineHeight: 1.35,
                  fontWeight: 760,
                }}
              >
                {assetCaption || scene.sourceLabel || "Visual evidence"}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              borderRadius: 28,
              border:
                "1px solid rgba(255,255,255,.11)",
              background:
                "rgba(255,255,255,.035)",
              padding: 38,
            }}
          >
            <div
              style={{
                color: cyan,
                fontSize: 19,
                fontWeight: 900,
                letterSpacing: 3,
              }}
            >
              SOURCE
            </div>

            <div
              style={{
                marginTop: 24,
                fontSize: 30,
                lineHeight: 1.25,
                fontWeight: 900,
              }}
            >
              {scene.sourceLabel || "Source evidence"}
            </div>

            <div
              style={{
                marginTop: 36,
                color: muted,
                fontSize: 22,
                lineHeight: 1.5,
              }}
            >
              Evidence is part of the frame, not buried
              after the conclusion.
            </div>
          </div>
        )}

        <div
          style={{
            borderRadius: 28,
            border:
              "1px solid rgba(85,216,255,.19)",
            background:
              "linear-gradient(135deg, rgba(108,124,255,.11), rgba(85,216,255,.035))",
            padding: 44,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              color: muted,
              fontSize: 20,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            Relevant evidence
          </div>

          <div
            style={{
              marginTop: 24,
              fontSize: 34,
              lineHeight: 1.35,
              fontWeight: 760,
            }}
          >
            {scene.sourceExcerpt || scene.body}
          </div>

          <div
            style={{
              position: "absolute",
              left: 44,
              right: 44,
              bottom: 36,
              height: 8,
              borderRadius: 999,
              background: "rgba(255,255,255,.07)",
            }}
          >
            <div
              style={{
                width: `${reveal * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: green,
              }}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}
