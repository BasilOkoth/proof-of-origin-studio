import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { EpisodeProject, Scene } from "@/lib/types";
import { classifyEditorialVisual, extractHeroNumber } from "@/lib/editorial-grammar";

const ink = "#101114";
const paper = "#f4f0e8";
const white = "#ffffff";
const yellow = "#f3d64e";
const red = "#ff5b4d";
const blue = "#3157d5";
const muted = "#74706a";

function enter(frame: number, fps: number, delay = 0) {
  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.8 },
  });
}

function EditorialChrome({
  scene,
  children,
  dark = false,
}: {
  scene: Scene;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <AbsoluteFill
      style={{
        background: dark ? ink : paper,
        color: dark ? white : ink,
        padding: "72px 88px",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          fontSize: 20,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: 3,
        }}
      >
        <span style={{ width: 34, height: 8, background: yellow }} />
        {scene.eyebrow}
      </div>
      {children}
      <div
        style={{
          position: "absolute",
          bottom: 38,
          right: 58,
          fontSize: 17,
          fontWeight: 850,
          letterSpacing: 1.5,
          opacity: 0.55,
        }}
      >
        PROOF OF ORIGIN · VISUAL EVIDENCE
      </div>
    </AbsoluteFill>
  );
}

function KineticHook({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = enter(frame, fps);
  const b = enter(frame, fps, 10);

  return (
    <EditorialChrome scene={scene} dark>
      <div style={{ marginTop: 120, maxWidth: 1500 }}>
        <div
          style={{
            fontSize: 104,
            lineHeight: 0.91,
            letterSpacing: -6,
            fontWeight: 1000,
            transform: `translateY(${interpolate(a, [0, 1], [90, 0])}px)`,
            opacity: a,
          }}
        >
          {scene.headline}
        </div>
        <div
          style={{
            marginTop: 40,
            maxWidth: 1080,
            fontSize: 35,
            lineHeight: 1.25,
            fontWeight: 720,
            color: "#d8d5ce",
            transform: `translateX(${interpolate(b, [0, 1], [-70, 0])}px)`,
            opacity: b,
          }}
        >
          {scene.body}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 560,
          borderRadius: 999,
          right: -120,
          top: 170,
          border: `52px solid ${yellow}`,
          opacity: 0.9,
          transform: `scale(${0.7 + a * 0.3})`,
        }}
      />
    </EditorialChrome>
  );
}

function Comparison({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = enter(frame, fps, 5);
  const before = scene.before || scene.visualLabels?.[0] || "BEFORE";
  const after = scene.after || scene.visualLabels?.[1] || "AFTER";

  return (
    <EditorialChrome scene={scene}>
      <div style={{ marginTop: 46, fontSize: 68, fontWeight: 1000, letterSpacing: -3 }}>
        {scene.headline}
      </div>
      <div style={{ marginTop: 58, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, height: 560 }}>
        <div style={{ background: white, border: `3px solid ${ink}`, padding: 44, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 3, color: muted }}>BEFORE</div>
          <div style={{ marginTop: 18, fontSize: 72, lineHeight: 1, fontWeight: 1000, textDecoration: "line-through", textDecorationColor: red }}>
            {before}
          </div>
        </div>
        <div
          style={{
            background: yellow,
            border: `3px solid ${ink}`,
            padding: 44,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            transform: `translateY(${interpolate(a, [0, 1], [60, 0])}px)`,
            opacity: a,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 3 }}>AFTER</div>
          <div style={{ marginTop: 18, fontSize: 72, lineHeight: 1, fontWeight: 1000 }}>{after}</div>
        </div>
      </div>
    </EditorialChrome>
  );
}

function Flow({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const labels = scene.visualLabels?.length
    ? scene.visualLabels.slice(0, 5)
    : ["SOURCE", "PROCESS", "CHANGE", "EVIDENCE", "MEANING"];

  return (
    <EditorialChrome scene={scene} dark>
      <div style={{ marginTop: 44, fontSize: 68, lineHeight: 1, fontWeight: 1000, maxWidth: 1450 }}>
        {scene.headline}
      </div>
      <div style={{ marginTop: 86, display: "flex", alignItems: "center", gap: 12 }}>
        {labels.map((label, index) => {
          const a = enter(frame, fps, index * 6);
          return (
            <React.Fragment key={`${label}-${index}`}>
              <div
                style={{
                  width: 250,
                  minHeight: 180,
                  padding: 28,
                  background: index === labels.length - 1 ? yellow : "#22252b",
                  color: index === labels.length - 1 ? ink : white,
                  border: "2px solid rgba(255,255,255,.18)",
                  transform: `translateY(${interpolate(a, [0, 1], [55, 0])}px)`,
                  opacity: a,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, opacity: 0.6 }}>0{index + 1}</div>
                <div style={{ marginTop: 38, fontSize: 29, lineHeight: 1.05, fontWeight: 1000 }}>{label}</div>
              </div>
              {index < labels.length - 1 && (
                <div style={{ width: 55, height: 6, background: red, position: "relative" }}>
                  <div style={{ position: "absolute", right: -2, top: -9, borderTop: "12px solid transparent", borderBottom: "12px solid transparent", borderLeft: `18px solid ${red}` }} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ marginTop: 54, maxWidth: 1200, fontSize: 29, lineHeight: 1.35, color: "#cbc8c1" }}>{scene.body}</div>
    </EditorialChrome>
  );
}

function Timeline({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const labels = scene.visualLabels?.length
    ? scene.visualLabels.slice(0, 6)
    : ["BASELINE", "CHANGE", "CHECK", "EVIDENCE", "INTERPRET", "PAYOFF"];

  return (
    <EditorialChrome scene={scene}>
      <div style={{ marginTop: 42, fontSize: 70, fontWeight: 1000, letterSpacing: -3 }}>{scene.headline}</div>
      <div style={{ marginTop: 120, position: "relative", height: 280 }}>
        <div style={{ position: "absolute", top: 62, left: 40, right: 40, height: 8, background: ink }} />
        <div
          style={{
            position: "absolute",
            top: 62,
            left: 40,
            height: 8,
            width: `${interpolate(frame, [8, 70], [0, 92], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}%`,
            background: red,
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
          {labels.map((label, index) => {
            const a = enter(frame, fps, index * 5);
            return (
              <div key={`${label}-${index}`} style={{ width: 210, textAlign: "center", opacity: a }}>
                <div style={{ margin: "20px auto 0", width: 90, height: 90, borderRadius: 999, background: index === labels.length - 1 ? yellow : white, border: `8px solid ${ink}`, display: "grid", placeItems: "center", fontSize: 28, fontWeight: 1000 }}>
                  {index + 1}
                </div>
                <div style={{ marginTop: 28, fontSize: 21, lineHeight: 1.08, fontWeight: 1000 }}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ maxWidth: 1280, fontSize: 31, lineHeight: 1.35, color: "#4d4a45" }}>{scene.body}</div>
    </EditorialChrome>
  );
}

function MapRoute({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const map = scene.map;
  if (!map) return <Flow scene={scene} />;

  const points = map.points.slice(0, 10);
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats) - 3;
  const maxLat = Math.max(...lats) + 3;
  const minLon = Math.min(...lons) - 3;
  const maxLon = Math.max(...lons) + 3;
  const spanLat = Math.max(1, maxLat - minLat);
  const spanLon = Math.max(1, maxLon - minLon);

  const pos = (lat: number, lon: number) => ({
    x: 120 + ((lon - minLon) / spanLon) * 1270,
    y: 590 - ((lat - minLat) / spanLat) * 470,
  });

  const path = points.map((p, i) => {
    const { x, y } = pos(p.latitude, p.longitude);
    return `${i ? "L" : "M"} ${x} ${y}`;
  }).join(" ");

  const dash = interpolate(frame, [8, 75], [1800, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <EditorialChrome scene={scene} dark>
      <div style={{ marginTop: 34, fontSize: 66, fontWeight: 1000, letterSpacing: -3, maxWidth: 1450 }}>{scene.headline}</div>
      <svg width="1500" height="660" viewBox="0 0 1500 660" style={{ marginTop: 26 }}>
        {[0,1,2,3,4].map((i) => <line key={`h${i}`} x1="70" x2="1450" y1={100+i*110} y2={100+i*110} stroke="rgba(255,255,255,.08)" strokeWidth="2" />)}
        {[0,1,2,3,4,5,6].map((i) => <line key={`v${i}`} y1="70" y2="610" x1={90+i*220} x2={90+i*220} stroke="rgba(255,255,255,.08)" strokeWidth="2" />)}
        <path d={path} fill="none" stroke={yellow} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1800" strokeDashoffset={dash} />
        {points.map((p, index) => {
          const { x, y } = pos(p.latitude, p.longitude);
          const a = interpolate(frame - index * 4, [12, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <g key={`${p.label}-${index}`} opacity={a}>
              <circle cx={x} cy={y} r={15} fill={red} />
              <circle cx={x} cy={y} r={29} fill="none" stroke={red} strokeWidth="3" opacity={0.35} />
              <text x={x + 24} y={y - 18} fill={white} fontSize="20" fontWeight="900">{p.label}</text>
            </g>
          );
        })}
      </svg>
      {map.sourceLabel && <div style={{ position: "absolute", left: 90, bottom: 42, fontSize: 18, color: "#aaa69f" }}>SOURCE · {map.sourceLabel}</div>}
    </EditorialChrome>
  );
}

function PullQuote({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = enter(frame, fps, 8);
  return (
    <EditorialChrome scene={scene}>
      <div style={{ marginTop: 80, display: "grid", gridTemplateColumns: "360px 1fr", gap: 70, alignItems: "start" }}>
        <div>
          <div style={{ width: 300, height: 390, background: white, border: `3px solid ${ink}`, boxShadow: "18px 18px 0 #3157d5", padding: 34 }}>
            <div style={{ height: 24, width: "70%", background: ink, marginBottom: 28 }} />
            {[80,92,70,86,58,76].map((w, i) => <div key={i} style={{ height: 13, width: `${w}%`, background: "#c8c3ba", margin: "17px 0" }} />)}
            <div style={{ marginTop: 35, height: 62, background: yellow }} />
          </div>
        </div>
        <div style={{ transform: `translateX(${interpolate(a, [0,1], [70,0])}px)`, opacity: a }}>
          <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: 3, color: blue }}>THE EVIDENCE</div>
          <div style={{ marginTop: 24, fontSize: 68, lineHeight: 1.02, fontWeight: 1000, letterSpacing: -3 }}>{scene.headline}</div>
          <div style={{ marginTop: 38, paddingLeft: 30, borderLeft: `12px solid ${yellow}`, fontSize: 34, lineHeight: 1.32, fontWeight: 720 }}>
            {scene.sourceExcerpt || scene.body}
          </div>
          {scene.sourceLabel && <div style={{ marginTop: 26, fontSize: 19, color: muted }}>SOURCE · {scene.sourceLabel}</div>}
        </div>
      </div>
    </EditorialChrome>
  );
}

function Stat({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = enter(frame, fps, 5);
  const number = extractHeroNumber(scene) || "01";
  return (
    <EditorialChrome scene={scene} dark>
      <div style={{ marginTop: 72, display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 70, alignItems: "center" }}>
        <div style={{ fontSize: 240, lineHeight: 0.8, fontWeight: 1000, color: yellow, letterSpacing: -14, transform: `scale(${0.8 + a*0.2})`, transformOrigin: "left center" }}>
          {number}
        </div>
        <div>
          <div style={{ fontSize: 70, lineHeight: 1, fontWeight: 1000, letterSpacing: -3 }}>{scene.headline}</div>
          <div style={{ marginTop: 32, fontSize: 30, lineHeight: 1.35, color: "#cbc8c1" }}>{scene.body}</div>
        </div>
      </div>
    </EditorialChrome>
  );
}

function Minimal({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = enter(frame, fps);
  return (
    <EditorialChrome scene={scene}>
      <div style={{ marginTop: 150, maxWidth: 1450, fontSize: 96, lineHeight: 0.94, fontWeight: 1000, letterSpacing: -5, opacity: a }}>
        {scene.headline}
      </div>
      <div style={{ marginTop: 42, width: interpolate(a, [0, 1], [0, 520]), height: 14, background: red }} />
      <div style={{ marginTop: 44, maxWidth: 1100, fontSize: 32, lineHeight: 1.38, color: "#514e49" }}>{scene.body}</div>
    </EditorialChrome>
  );
}

export function shouldUseEditorialScene(scene: Scene) {
  return ["hook", "value_swap", "proof_card", "diagram", "timeline", "quote", "map_story"].includes(scene.kind);
}

export function EditorialScene({ scene, project: _project }: { scene: Scene; project: EpisodeProject }) {
  const plan = classifyEditorialVisual(scene);
  if (plan.kind === "kinetic_hook") return <KineticHook scene={scene} />;
  if (plan.kind === "comparison") return <Comparison scene={scene} />;
  if (plan.kind === "flow") return <Flow scene={scene} />;
  if (plan.kind === "timeline") return <Timeline scene={scene} />;
  if (plan.kind === "map_route") return <MapRoute scene={scene} />;
  if (plan.kind === "source_pullquote") return <PullQuote scene={scene} />;
  if (plan.kind === "stat") return <Stat scene={scene} />;
  return <Minimal scene={scene} />;
}
