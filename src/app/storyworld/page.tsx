"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  Play,
  CheckCircle2,
  Clapperboard,
  Copy,
  Download,
  Film,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRound,
  Volume2,
} from "lucide-react";
import { storyworlds } from "../../lib/storyworld-data";
import { buildRenderBrief, buildStoryworldPackage } from "../../lib/storyworld-engine";

function badgeColor(status: string) {
  if (status === "validated") return "#79d39a";
  if (status === "testing") return "#e3bc66";
  if (status === "pilot-ready") return "#89c8ff";
  return "#9da6b4";
}

export default function StoryworldPage() {
  const [worldId, setWorldId] = useState(storyworlds[0].id);
  const [builtAt, setBuiltAt] = useState(0);
  const [copied, setCopied] = useState(false);

  const world = useMemo(
    () => storyworlds.find((item) => item.id === worldId) || storyworlds[0],
    [worldId]
  );

  const pkg = useMemo(() => buildStoryworldPackage(world.id), [world.id, builtAt]);
  const accent = world.palette[1] || "#d6b87a";

  function rebuild() {
    setBuiltAt(Date.now());
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${world.id}-${pkg.episode.id}-storyworld.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(buildRenderBrief(pkg));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#07090d",
        color: "#f6f3eb",
        fontFamily: "Inter, ui-sans-serif, system-ui",
        padding: "34px 18px 72px",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <header
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.2fr) minmax(280px,.8fr)",
            gap: 24,
            alignItems: "end",
            padding: "28px 0 34px",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                color: "#aeb5c0",
                textTransform: "uppercase",
                letterSpacing: 1.8,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              <Sparkles size={15} /> Storyworld Studio · Original IP Production System
            </div>
            <h1
              style={{
                fontSize: "clamp(42px,7vw,82px)",
                lineHeight: 0.95,
                letterSpacing: -3.4,
                margin: "16px 0",
                maxWidth: 940,
              }}
            >
              Build the world once. Keep the story coherent forever.
            </h1>
            <p style={{ color: "#abb2bd", fontSize: 18, lineHeight: 1.65, maxWidth: 820, margin: 0 }}>
              World → Story → Characters → Shots → Generate → Review → Render. The generation models are replaceable; the storyworld memory, character identity and episode logic are the durable assets.
            </p>
          </div>

          <div
            style={{
              border: "1px solid #262c35",
              borderRadius: 22,
              padding: 20,
              background: "linear-gradient(180deg,#10141b,#0b0e13)",
            }}
          >
            <div style={{ color: "#8d97a5", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5 }}>
              Production gate
            </div>
            <div style={{ display: "flex", alignItems: "end", gap: 10, marginTop: 6 }}>
              <strong style={{ fontSize: 44, lineHeight: 1 }}>{pkg.quality.score}</strong>
              <span style={{ color: "#8f98a6", paddingBottom: 5 }}>/100</span>
            </div>
            <p style={{ color: "#b7bec9", lineHeight: 1.5, marginBottom: 0 }}>
              Deterministic structural score before expensive image, video or voice generation.
            </p>
          </div>
        </header>

        <StudioTabs active="Story" />

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginTop: 18 }}>
          {storyworlds.map((item) => {
            const selected = item.id === world.id;
            return (
              <button
                key={item.id}
                onClick={() => setWorldId(item.id)}
                style={{
                  textAlign: "left",
                  padding: 20,
                  borderRadius: 20,
                  border: selected ? `1px solid ${item.palette[1]}` : "1px solid #242a33",
                  background: selected ? "#121720" : "#0c0f14",
                  color: "inherit",
                  cursor: "pointer",
                  minHeight: 170,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: badgeColor(item.status), fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4 }}>
                    {item.status}
                  </span>
                  <Film size={18} color={item.palette[1]} />
                </div>
                <h2 style={{ fontSize: 29, margin: "18px 0 5px", letterSpacing: -1 }}>{item.title}</h2>
                <div style={{ color: item.palette[1], fontWeight: 800, fontSize: 13 }}>{item.subtitle}</div>
                <p style={{ color: "#9fa7b2", lineHeight: 1.5, margin: "10px 0 0" }}>{item.genre}</p>
              </button>
            );
          })}
        </section>

        <section
          id="story"
          style={{
            marginTop: 18,
            border: "1px solid #272d36",
            borderRadius: 28,
            overflow: "hidden",
            background: "#0d1016",
          }}
        >
          <div
            style={{
              padding: "32px clamp(20px,4vw,44px)",
              background: `radial-gradient(circle at 85% 10%, ${accent}22, transparent 34%), #0d1016`,
              borderBottom: "1px solid #252a33",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9, color: "#9ba4b0", fontSize: 12 }}>
              <span>{world.setting}</span><span>•</span><span>{world.format}</span><span>•</span><span>Episode {pkg.episode.number}</span>
            </div>
            <h2 style={{ fontSize: "clamp(38px,6vw,68px)", margin: "12px 0 4px", letterSpacing: -2.4 }}>{world.title}</h2>
            <h3 style={{ margin: 0, fontSize: 22, color: accent }}>EP{String(pkg.episode.number).padStart(2, "0")} · {pkg.episode.title}</h3>
            <p style={{ color: "#c4cad3", fontSize: 17, lineHeight: 1.65, maxWidth: 900, marginTop: 18 }}>{world.premise}</p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
                gap: 12,
                marginTop: 24,
                maxWidth: 920,
              }}
            >
              <label style={selectorCard()}>
                <span style={eyebrow()}>World</span>
                <select
                  value={world.id}
                  onChange={(event) => setWorldId(event.target.value)}
                  style={selectStyle()}
                >
                  {storyworlds.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
              </label>

              <label style={selectorCard()}>
                <span style={eyebrow()}>Episode</span>
                <select value={pkg.episode.id} onChange={() => undefined} style={selectStyle()}>
                  <option value={pkg.episode.id}>EP{String(pkg.episode.number).padStart(2, "0")} · {pkg.episode.title}</option>
                </select>
                <span style={{ color: "#77818e", fontSize: 11 }}>1 episode currently available in this world</span>
              </label>

              <div style={selectorCard()}>
                <span style={eyebrow()}>Status</span>
                <strong style={{ marginTop: 10, color: "#9ed9ad", fontSize: 18 }}>Ready for production</strong>
                <span style={{ color: "#77818e", fontSize: 11 }}>{pkg.episode.shots.length} shots · {pkg.episode.runtimeSec}s · {pkg.episode.aspectRatio}</span>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
              <button
                onClick={() => {
                  rebuild();
                  window.location.assign(`/storyworld/generate?world=${encodeURIComponent(world.id)}&episode=${encodeURIComponent(pkg.episode.id)}`);
                }}
                style={primaryButton(accent)}
              >
                <Play size={17} fill="currentColor" /> Build Episode
              </button>
              <button onClick={rebuild} style={secondaryButton()}>
                Build production manifest <ArrowRight size={17} />
              </button>
              <button onClick={downloadJson} style={secondaryButton()}>
                <Download size={17} /> Download JSON
              </button>
              <button onClick={copyBrief} style={secondaryButton()}>
                <Copy size={17} /> {copied ? "Copied" : "Copy render brief"}
              </button>
            </div>
          </div>

          <div style={{ padding: "28px clamp(18px,4vw,42px)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
              {[
                ["Episode question", pkg.episode.episodeQuestion],
                ["Payoff", pkg.episode.payoff],
                ["Cliffhanger", pkg.episode.cliffhanger],
                ["First frame", pkg.episode.firstFrame],
              ].map(([label, copy]) => (
                <div key={label} style={cardStyle()}>
                  <div style={eyebrow()}>{label}</div>
                  <p style={{ margin: "9px 0 0", lineHeight: 1.55, color: "#d7dbe1" }}>{copy}</p>
                </div>
              ))}
            </div>

            <div id="characters"><SectionTitle icon={<LockKeyhole size={18} />} title="Character Vault" copy="These identity locks feed every visual prompt. Change them deliberately, never accidentally." />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))", gap: 12 }}>
              {world.characters.map((character) => (
                <div key={character.id} style={cardStyle()}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <UserRound size={20} color={accent} />
                    <span style={{ color: "#8b94a0", fontSize: 12 }}>{character.age}</span>
                  </div>
                  <h4 style={{ fontSize: 20, margin: "14px 0 4px" }}>{character.name}</h4>
                  <div style={{ color: accent, fontSize: 12, fontWeight: 800 }}>{character.role}</div>
                  <p style={{ color: "#b7bec7", lineHeight: 1.5 }}>{character.appearance}</p>
                  <div style={eyebrow()}>Continuity locks</div>
                  <ul style={{ paddingLeft: 18, color: "#959eaa", lineHeight: 1.45, fontSize: 13 }}>
                    {character.continuityRules.map((rule) => <li key={rule}>{rule}</li>)}
                  </ul>
                </div>
              ))}
            </div></div>

            <div id="shots"><SectionTitle icon={<Clapperboard size={18} />} title="Shot Manifest" copy={`${pkg.episode.shots.length} shots · ${pkg.episode.runtimeSec}s · ${pkg.episode.aspectRatio}. Every shot already carries world and character continuity into its generation prompt.`} />
            <div style={{ display: "grid", gap: 10 }}>
              {pkg.episode.shots.map((shot, index) => (
                <details key={shot.id} style={{ ...cardStyle(), padding: 0, overflow: "hidden" }} open={index < 3}>
                  <summary
                    style={{
                      cursor: "pointer",
                      listStyle: "none",
                      padding: "16px 18px",
                      display: "grid",
                      gridTemplateColumns: "70px minmax(150px,.7fr) minmax(0,1.5fr)",
                      gap: 14,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ color: accent, fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>
                      {shot.startSec.toFixed(0)}–{shot.endSec.toFixed(0)}s
                    </span>
                    <strong>{shot.label}</strong>
                    <span style={{ color: "#9ba4af", fontSize: 14 }}>{shot.camera}</span>
                  </summary>
                  <div style={{ borderTop: "1px solid #242a33", padding: 18 }}>
                    <p style={{ color: "#d1d6dd", lineHeight: 1.6, marginTop: 0 }}>{shot.visual}</p>
                    <div style={eyebrow()}>Generation prompt</div>
                    <p style={{ color: "#969faa", lineHeight: 1.55, fontSize: 13 }}>{shot.imagePrompt}</p>
                    {shot.sound && <><div style={eyebrow()}>Sound</div><p style={{ color: "#aab2bd", marginBottom: 0 }}>{shot.sound}</p></>}
                  </div>
                </details>
              ))}
            </div></div>

            <div id="review"><SectionTitle icon={<ShieldCheck size={18} />} title="Pre-generation Quality Gate" copy="Block structural or continuity problems before spending credits on images, video or voices." />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10 }}>
              {[
                ["Hook", pkg.quality.hook],
                ["Clarity", pkg.quality.clarity],
                ["Progress", pkg.quality.progress],
                ["Payoff", pkg.quality.payoff],
                ["Cliffhanger", pkg.quality.cliffhanger],
                ["Continuity", pkg.quality.continuity],
                ["Visual", pkg.quality.visual],
                ["Sound", pkg.quality.sound],
              ].map(([label, value]) => (
                <div key={String(label)} style={cardStyle()}>
                  <div style={eyebrow()}>{label}</div>
                  <strong style={{ display: "block", fontSize: 31, marginTop: 8 }}>{value}</strong>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, ...cardStyle() }}>
              {pkg.quality.issues.map((issue) => (
                <div key={issue.message} style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "7px 0" }}>
                  <CheckCircle2 size={17} color={issue.severity === "blocker" ? "#ff8585" : issue.severity === "warning" ? "#e4bd65" : "#79d39a"} style={{ marginTop: 2 }} />
                  <span style={{ color: "#b6bec8", lineHeight: 1.5 }}>{issue.message}</span>
                </div>
              ))}
            </div></div>

            <div id="render"><SectionTitle icon={<Volume2 size={18} />} title="Render Handoff" copy="The episode package now hands approved character locks, shot jobs, audio jobs and timing data into the generation workspace and Remotion render pipeline." />
            <div style={{ ...cardStyle(), borderColor: `${accent}55` }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
                {[
                  "1 · Story Bible",
                  "2 · Character Vault",
                  "3 · Episode Manifest",
                  "4 · Visual Generation",
                  "5 · Continuity Check",
                  "6 · Voice + Sound",
                  "7 · Remotion Render",
                  "8 · Distribution Analytics",
                ].map((step) => <div key={step} style={{ color: "#cbd1d9", fontWeight: 700 }}>{step}</div>)}
              </div>
            </div></div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StudioTabs({ active }: { active: string }) {
  const tabs = [
    ["Story", "/storyworld#story"],
    ["Characters", "/storyworld#characters"],
    ["Shots", "/storyworld#shots"],
    ["Generate", "/storyworld/generate"],
    ["Review", "/storyworld#review"],
    ["Render", "/storyworld#render"],
  ];

  return (
    <nav
      aria-label="Storyworld workflow"
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        padding: 7,
        border: "1px solid #252b34",
        borderRadius: 999,
        background: "#0b0e13",
      }}
    >
      {tabs.map(([label, href]) => (
        <a
          key={label}
          href={href}
          style={{
            whiteSpace: "nowrap",
            textDecoration: "none",
            padding: "10px 15px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 850,
            color: active === label ? "#08090d" : "#aab2bf",
            background: active === label ? "#f0d595" : "transparent",
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

function selectorCard(): CSSProperties {
  return {
    minHeight: 104,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 7,
    border: "1px solid #2a3039",
    background: "#0a0d12",
    borderRadius: 16,
    padding: "14px 16px",
  };
}

function selectStyle(): CSSProperties {
  return {
    width: "100%",
    border: 0,
    outline: 0,
    background: "transparent",
    color: "#f6f3eb",
    fontSize: 17,
    fontWeight: 800,
    padding: 0,
    cursor: "pointer",
  };
}

function SectionTitle({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div style={{ margin: "34px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {icon}
        <h3 style={{ fontSize: 22, margin: 0 }}>{title}</h3>
      </div>
      <p style={{ color: "#929ba8", lineHeight: 1.55, margin: "7px 0 0", maxWidth: 820 }}>{copy}</p>
    </div>
  );
}

function eyebrow(): CSSProperties {
  return { color: "#8b95a2", fontSize: 11, letterSpacing: 1.35, textTransform: "uppercase", fontWeight: 800 };
}

function cardStyle(): CSSProperties {
  return { border: "1px solid #252b34", borderRadius: 17, padding: 17, background: "#0a0d12" };
}

function primaryButton(accent: string): CSSProperties {
  return {
    border: 0,
    borderRadius: 999,
    padding: "13px 18px",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    background: accent,
    color: "#0a0d12",
  };
}

function secondaryButton(): CSSProperties {
  return {
    border: "1px solid #303743",
    borderRadius: 999,
    padding: "12px 17px",
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    background: "#11151c",
    color: "#e9ebee",
  };
}
