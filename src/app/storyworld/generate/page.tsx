"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Film,
  Fingerprint,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Music2,
  Play,
  RefreshCw,
  Sparkles,
  Volume2,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { buildStoryworldPackage } from "@/lib/storyworld-engine";
import { buildStoryworldGenerationPlan } from "@/lib/storyworld-generation";
import { storyworlds } from "@/lib/storyworld-data";
import type { GenerationJob } from "@/lib/storyworld-generation-types";

type RuntimeJob = {
  jobId: string;
  status: "generating" | "generated" | "approved" | "failed";
  outputPath: string;
  provider: string;
  updatedAt: string;
  taskId?: string;
  model?: string;
  error?: string;
};

type RuntimeState = {
  version: number;
  worldId: string;
  episodeId: string;
  updatedAt: string;
  jobs: Record<string, RuntimeJob>;
};

type Providers = {
  openaiImages: boolean;
  elevenlabs: boolean;
  runway: boolean;
  voiceMapCount: number;
  imageModel: string;
  imageSize?: string;
  videoModel: string;
  persistentStorageConfigured: boolean;
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function publicUrl(path: string) {
  return `/${path.replace(/^public\//, "")}`;
}

function assetUrl(worldId: string, jobId: string, stamp?: string) {
  return `/api/storyworld/asset?worldId=${encodeURIComponent(worldId)}&jobId=${encodeURIComponent(jobId)}&v=${encodeURIComponent(stamp || "0")}`;
}

export default function StoryworldGeneratePage() {
  const [worldId, setWorldId] = useState("kamau-will");
  const [state, setState] = useState<RuntimeState | null>(null);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [batchProgress, setBatchProgress] = useState("");
  const plan = useMemo(() => buildStoryworldGenerationPlan(buildStoryworldPackage(worldId)), [worldId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedWorld = params.get("world");
    if (requestedWorld && storyworlds.some((world) => world.id === requestedWorld)) setWorldId(requestedWorld);
  }, []);

  async function refresh() {
    try {
      const response = await fetch(`/api/storyworld/production?worldId=${encodeURIComponent(worldId)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load production state.");
      setState(payload.state);
      setProviders(payload.providers);
    } catch (err: any) {
      setError(err?.message || "Unable to load production state.");
    }
  }

  useEffect(() => { void refresh(); }, [worldId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: string, jobId?: string, opts?: { quiet?: boolean }) {
    const key = jobId || action;
    setBusy((current) => ({ ...current, [key]: true }));
    if (!opts?.quiet) { setError(""); setMessage(""); }
    try {
      const response = await fetch("/api/storyworld/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, worldId, jobId, quality }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `${action} failed.`);
      if (payload.state) setState(payload.state);
      return payload;
    } catch (err: any) {
      const text = err?.message || `${action} failed.`;
      setError(text);
      throw err;
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  }

  async function generateBatch(jobs: GenerationJob[], action: string, label: string) {
    setError(""); setMessage("");
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      setBatchProgress(`${label}: ${index + 1}/${jobs.length} · ${job.shotId || job.id}`);
      try { await act(action, job.id, { quiet: true }); }
      catch { setBatchProgress(""); return; }
    }
    setBatchProgress("");
    setMessage(`${label} complete.`);
    await refresh();
  }

  async function checkGeneratingVideos() {
    const ids = Object.values(state?.jobs || {}).filter((job) => job.provider === "runway" && job.status === "generating").map((job) => job.jobId);
    if (!ids.length) return;
    setBatchProgress(`Checking ${ids.length} animation job${ids.length === 1 ? "" : "s"}…`);
    for (const id of ids) {
      try { await act("check-video", id, { quiet: true }); } catch { /* surface last error */ }
    }
    setBatchProgress("");
    await refresh();
  }

  const shotImageJobs = plan.jobs.filter((job) => job.kind === "shot-image");
  const shotVideoJobs = plan.jobs.filter((job) => job.kind === "shot-video");
  const voiceJobs = plan.jobs.filter((job) => job.kind === "voice");
  const sfxJobs = plan.jobs.filter((job) => job.kind === "sfx");
  const runtimeJobs = state?.jobs || {};
  const count = (jobs: GenerationJob[], statuses: RuntimeJob["status"][]) => jobs.filter((job) => statuses.includes(runtimeJobs[job.id]?.status)).length;
  const stillGenerated = count(shotImageJobs, ["generated", "approved"]);
  const stillApproved = count(shotImageJobs, ["approved"]);
  const videoGenerated = count(shotVideoJobs, ["generated", "approved"]);
  const voicesGenerated = count(voiceJobs, ["generated", "approved"]);
  const sfxGenerated = count(sfxJobs, ["generated", "approved"]);
  const musicGenerated = runtimeJobs["music-master"]?.status === "generated" || runtimeJobs["music-master"]?.status === "approved";
  const openingFive = shotImageJobs.slice(0, 5);

  return (
    <main style={{ minHeight: "100vh", background: "#08090d", color: "#f5efe6", padding: "34px 20px 90px", fontFamily: "Inter,ui-sans-serif,system-ui" }}>
      <div style={{ maxWidth: 1220, margin: "0 auto" }}>
        <a href="/storyworld" style={{ color: "#aab2bf", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}><ArrowLeft size={16}/> Storyworld</a>
        <div style={{ marginTop: 22 }}><StudioTabs active="Generate" worldId={worldId} /></div>
        <div style={{ marginTop: 26, display: "flex", gap: 10, color: "#c8a968", textTransform: "uppercase", letterSpacing: 2, fontSize: 13 }}><WandSparkles size={16}/> Storyworld Studio · Production Executor V0.4</div>
        <h1 style={{ fontSize: "clamp(40px,6vw,72px)", letterSpacing: -3, lineHeight: .97, margin: "16px 0" }}>Generate. Approve. Animate. Render.</h1>
        <p style={{ maxWidth: 850, color: "#b7bdc8", fontSize: 18, lineHeight: 1.6 }}>The manifest is now executable. Character references guide still generation, human approval unlocks motion, and generated voice, sound and music feed the Remotion render.</p>

        <section style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
          <label style={selectorCard()}><span style={eyebrow()}>World</span><select value={worldId} onChange={(event) => setWorldId(event.target.value)} style={selectStyle()}>{storyworlds.map((world) => <option key={world.id} value={world.id}>{world.title}</option>)}</select></label>
          <div style={selectorCard()}><span style={eyebrow()}>Episode</span><strong style={{ fontSize: 17 }}>EP01 · {plan.render.episodeTitle}</strong><span style={{ color: "#7f8997", fontSize: 11 }}>{plan.render.shots.length} shots · {plan.render.durationSec}s</span></div>
          <label style={selectorCard()}><span style={eyebrow()}>Still quality</span><select value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)} style={selectStyle()}><option value="low">Draft · low cost</option><option value="medium">Review · medium</option><option value="high">Final · high</option></select></label>
        </section>

        <section style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <ProviderChip ok={Boolean(providers?.openaiImages)} label="OpenAI images" detail={providers ? `${providers.imageModel} · ${providers.imageSize || "1024x1536"}` : undefined}/>
          <ProviderChip ok={Boolean(providers?.elevenlabs)} label="ElevenLabs audio" />
          <ProviderChip ok={Boolean(providers?.runway)} label="Runway motion" detail={providers?.videoModel}/>
          <ProviderChip ok={Boolean(providers?.voiceMapCount)} label="Voice casting" detail={`${providers?.voiceMapCount || 0} mapped`}/>
          <ProviderChip ok={Boolean(providers?.persistentStorageConfigured)} label="Persistent assets" detail={providers?.persistentStorageConfigured ? "configured" : "ephemeral"}/>
        </section>

        {providers && !providers.openaiImages ? <Notice tone="error">Still generation is disabled because OPENAI_API_KEY is not configured on the Render service. Add OPENAI_API_KEY under Render → Environment, save, then restart/redeploy the service.</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}
        {batchProgress ? <Notice tone="working"><LoaderCircle size={15} className="spin"/> {batchProgress}</Notice> : null}

        <section style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
          <Metric label="Characters" value="5/5" note="locked" />
          <Metric label="Stills" value={`${stillApproved}/${shotImageJobs.length}`} note={`${stillGenerated} generated`} />
          <Metric label="Motion" value={`${videoGenerated}/${shotVideoJobs.length}`} note="generated" />
          <Metric label="Voice" value={`${voicesGenerated}/${voiceJobs.length}`} note="generated" />
          <Metric label="SFX" value={`${sfxGenerated}/${sfxJobs.length}`} note="generated" />
          <Metric label="Music" value={musicGenerated ? "1/1" : "0/1"} note="master" />
        </section>

        <section style={{ marginTop: 26, border: "1px solid #3a3323", borderRadius: 22, background: "#15120c", padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div><div style={{ ...eyebrow(), color: "#d1b06b" }}>Generate episode assets</div><h2 style={{ margin: "7px 0 5px", fontSize: 30 }}>Start with the opening five shots.</h2><div style={{ color: "#aab2bf", maxWidth: 680 }}>Generate K01–K05 first, review identity and cinematic language, then commit credits to the remaining episode.</div></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button disabled={!providers?.openaiImages || Boolean(batchProgress)} onClick={() => void generateBatch(openingFive, "generate-still", "Opening five stills")} style={primaryButton(Boolean(!providers?.openaiImages || batchProgress))}><Sparkles size={16}/> Generate opening 5</button>
              <button disabled={!providers?.openaiImages || Boolean(batchProgress)} onClick={() => void generateBatch(shotImageJobs, "generate-still", "All episode stills")} style={secondaryButton(Boolean(!providers?.openaiImages || batchProgress))}>Generate all 19</button>
            </div>
          </div>
        </section>

        <section id="generate" style={{ marginTop: 30 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}><div><div style={{ ...eyebrow(), color: "#d1b06b" }}>Visual production</div><h2 style={{ fontSize: 32, margin: "7px 0 0" }}>Shot review board</h2></div><button onClick={() => void refresh()} style={ghostButton()}><RefreshCw size={15}/> Refresh state</button></div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 14 }}>
            {plan.render.shots.map((shot) => {
              const imageJob = plan.jobs.find((job) => job.id === `image-${shot.id}`)!;
              const videoJob = plan.jobs.find((job) => job.id === `video-${shot.id}`)!;
              const imageState = runtimeJobs[imageJob.id];
              const videoState = runtimeJobs[videoJob.id];
              const imageStatus = imageState?.status || imageJob.status;
              const videoStatus = videoState?.status || (imageState?.status === "approved" ? "ready" : "blocked");
              const hasGeneratedStill = imageState?.status === "generated" || imageState?.status === "approved";
              return <article key={shot.id} style={{ border: "1px solid #292f38", borderRadius: 18, background: "#0d1015", overflow: "hidden" }}>
                <div style={{ aspectRatio: "9/16", background: "#11151b", position: "relative", maxHeight: 440, overflow: "hidden" }}>
                  {hasGeneratedStill ? <img src={assetUrl(worldId, imageJob.id, imageState?.updatedAt)} alt={`${shot.id} generated still`} style={{ width: "100%", height: "100%", objectFit: "cover" }}/> : shot.seedImagePath ? <img src={publicUrl(shot.seedImagePath)} alt={`${shot.id} seed`} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: .72 }}/> : <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#657080" }}><ImageIcon size={34}/></div>}
                  <div style={{ position: "absolute", top: 10, left: 10, ...statusPill(imageStatus) }}>{String(imageStatus).toUpperCase()}</div>
                  {shot.seedImagePath && !hasGeneratedStill ? <div style={{ position: "absolute", bottom: 10, right: 10, ...statusPill("seed") }}>SEED</div> : null}
                </div>
                <div style={{ padding: 15 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong>{shot.id.toUpperCase()} · {shot.label}</strong><span style={{ color: "#87919f", fontSize: 12 }}>{shot.startSec}–{shot.endSec}s</span></div>
                  <div style={{ color: "#9da6b3", fontSize: 13, lineHeight: 1.45, marginTop: 8, minHeight: 58 }}>{shot.visual}</div>
                  <div style={{ color: "#727d8c", fontSize: 11, marginTop: 8 }}>{shot.camera}</div>
                  {imageState?.error ? <div style={{ color: "#ef9b9b", fontSize: 12, marginTop: 9 }}>{imageState.error}</div> : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 13 }}>
                    <button title={!providers?.openaiImages ? "Configure OPENAI_API_KEY in Render to enable still generation." : undefined} disabled={!providers?.openaiImages || busy[imageJob.id]} onClick={() => void act("generate-still", imageJob.id)} style={smallButton(Boolean(!providers?.openaiImages || busy[imageJob.id]))}>{busy[imageJob.id] ? <LoaderCircle size={14}/> : <WandSparkles size={14}/>} {hasGeneratedStill ? "Regenerate" : "Generate still"}</button>
                    {hasGeneratedStill && imageState?.status !== "approved" ? <button disabled={busy[imageJob.id]} onClick={() => void act("approve-still", imageJob.id)} style={approveButton()}><Check size={14}/> Approve</button> : null}
                    <button disabled={imageState?.status !== "approved" || !providers?.runway || busy[videoJob.id] || videoState?.status === "generating"} onClick={() => void act("start-video", videoJob.id)} style={smallButton()}><Film size={14}/> {videoStatus === "generated" ? "Regenerate motion" : videoStatus === "generating" ? "Animating…" : "Animate"}</button>
                    {videoState?.status === "generating" ? <button onClick={() => void act("check-video", videoJob.id)} style={ghostButton()}><RefreshCw size={13}/> Check</button> : null}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 12, fontSize: 11 }}><span style={{ color: imageState?.status === "approved" ? "#9ed9ad" : "#8c95a2" }}>Still: {String(imageStatus)}</span><span style={{ color: videoStatus === "generated" ? "#9ed9ad" : "#8c95a2" }}>Motion: {String(videoStatus)}</span></div>
                  {videoState?.status === "generated" ? <video src={assetUrl(worldId, videoJob.id, videoState.updatedAt)} controls playsInline style={{ width: "100%", marginTop: 12, borderRadius: 10, background: "black" }}/> : null}
                </div>
              </article>;
            })}
          </div>
        </section>

        <section id="review" style={{ marginTop: 34, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 14 }}>
          <ProductionPanel icon={<Volume2 size={18}/>} title="Character voices" stat={`${voicesGenerated}/${voiceJobs.length}`} description={providers?.voiceMapCount ? `${providers.voiceMapCount} permanent voice profiles mapped.` : "Map the five Storyworld voice profile keys to permanent ElevenLabs voice IDs first."}>
            <button disabled={!providers?.elevenlabs || !providers?.voiceMapCount || Boolean(batchProgress)} onClick={() => void generateBatch(voiceJobs, "generate-voice", "Character voices")} style={primaryButton(Boolean(!providers?.elevenlabs || !providers?.voiceMapCount || batchProgress))}>Generate voices</button>
          </ProductionPanel>
          <ProductionPanel icon={<Sparkles size={18}/>} title="Sound effects" stat={`${sfxGenerated}/${sfxJobs.length}`} description="Each shot's sound brief becomes a separate ElevenLabs SFX asset for editorial control.">
            <button disabled={!providers?.elevenlabs || Boolean(batchProgress)} onClick={() => void generateBatch(sfxJobs, "generate-sfx", "Sound effects")} style={primaryButton(Boolean(!providers?.elevenlabs || batchProgress))}>Generate SFX</button>
          </ProductionPanel>
          <ProductionPanel icon={<Music2 size={18}/>} title="Music master" stat={musicGenerated ? "1/1" : "0/1"} description="Generate one restrained score master to sit underneath dialogue and scene sound.">
            <button disabled={!providers?.elevenlabs || busy["music-master"]} onClick={() => void act("generate-music", "music-master")} style={primaryButton(Boolean(!providers?.elevenlabs || busy["music-master"]))}>{musicGenerated ? "Regenerate music" : "Generate music"}</button>
          </ProductionPanel>
        </section>

        <section style={{ marginTop: 18, border: "1px solid #252b34", background: "#0c0f14", borderRadius: 18, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><strong>Captions</strong><div style={{ color: "#87919f", fontSize: 12, marginTop: 4 }}>The timed caption JSON is deterministic and can be materialized without an external provider.</div></div><button disabled={busy["captions-master"]} onClick={() => void act("materialize-captions", "captions-master")} style={smallButton()}>Prepare captions</button></div>
        </section>

        <section id="render" style={{ marginTop: 30, padding: 22, borderRadius: 20, border: "1px solid #342f22", background: "#15120c" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><div style={{ display: "flex", gap: 10, alignItems: "center", color: "#d5b46f" }}><Play size={18}/><strong>Final render</strong></div><div style={{ color: "#aeb6c2", marginTop: 7 }}>When approved media exists, Remotion automatically prefers video → still → seed → storyboard fallback.</div></div><button onClick={() => downloadJson(`${worldId}-production-plan-v04.json`, plan)} style={secondaryButton(false)}><Download size={15}/> Download plan</button></div>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 15, color: "#eae3d6", fontSize: 13 }}>npm run storyworld:prepare -- {worldId}{"\n"}npm run render:storyworld -- episodes/storyworld/{worldId}-{plan.render.episodeId}.production.json</pre>
          <div style={{ color: providers?.persistentStorageConfigured ? "#9ed9ad" : "#d5b46f", fontSize: 12, marginTop: 9 }}>{providers?.persistentStorageConfigured ? "Persistent asset storage is configured." : "For Render production, attach a persistent disk and set STORYWORLD_ASSET_DIR so generated media survives redeploys."}</div>
        </section>

        <details style={{ marginTop: 28, border: "1px solid #252a33", borderRadius: 18, background: "#0d0f14", padding: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Advanced production queue · {plan.jobs.length} jobs</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {plan.jobs.map((job) => {
              const rt = runtimeJobs[job.id];
              const derived = job.kind === "shot-video" && !rt && runtimeJobs[`image-${job.shotId}`]?.status === "approved" ? "ready" : rt?.status || job.status;
              return <div key={job.id} style={{ display: "grid", gridTemplateColumns: "minmax(160px,.6fr) 100px 1fr", gap: 12, borderTop: "1px solid #1f242c", paddingTop: 9, fontSize: 12 }}><strong>{job.id}</strong><span style={{ color: derived === "approved" || derived === "generated" || derived === "ready" ? "#9ed9ad" : derived === "failed" ? "#ef9b9b" : "#d5b46f" }}>{derived}</span><span style={{ color: "#8e98a6", overflow: "hidden", textOverflow: "ellipsis" }}>{job.outputPath}</span></div>;
            })}
          </div>
        </details>

        {Object.values(runtimeJobs).some((job) => job.provider === "runway" && job.status === "generating") ? <div style={{ position: "sticky", bottom: 18, marginTop: 18, display: "flex", justifyContent: "center" }}><button onClick={() => void checkGeneratingVideos()} style={primaryButton(false)}><RefreshCw size={15}/> Check all animations</button></div> : null}
      </div>
      <style>{`.spin{animation:swspin 1s linear infinite}@keyframes swspin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}

function StudioTabs({ active, worldId }: { active: string; worldId: string }) {
  const query = `?world=${encodeURIComponent(worldId)}`;
  const tabs = [["Story", "/storyworld#story"], ["Characters", "/storyworld#characters"], ["Shots", "/storyworld#shots"], ["Generate", `/storyworld/generate${query}`], ["Review", `/storyworld/generate${query}#review`], ["Render", `/storyworld/generate${query}#render`]];
  return <nav aria-label="Storyworld workflow" style={{ display: "flex", gap: 8, overflowX: "auto", padding: 7, border: "1px solid #252b34", borderRadius: 999, background: "#0b0e13" }}>{tabs.map(([label, href]) => <a key={label} href={href} style={{ whiteSpace: "nowrap", textDecoration: "none", padding: "10px 15px", borderRadius: 999, fontSize: 13, fontWeight: 850, color: active === label ? "#08090d" : "#aab2bf", background: active === label ? "#f0d595" : "transparent" }}>{label}</a>)}</nav>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div style={{ border: "1px solid #272c35", background: "#101218", borderRadius: 18, padding: 17 }}><div style={eyebrow()}>{label}</div><div style={{ fontSize: 30, fontWeight: 850, marginTop: 7 }}>{value}</div><div style={{ color: "#7d8794", fontSize: 11, marginTop: 3 }}>{note}</div></div>;
}

function ProviderChip({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return <div style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${ok ? "#35523d" : "#4b3e2b"}`, background: ok ? "#101a14" : "#19150e", borderRadius: 999, padding: "7px 11px", fontSize: 11, color: ok ? "#a9dfb5" : "#d8bb7d" }}>{ok ? <CheckCircle2 size={13}/> : <XCircle size={13}/>}<strong>{label}</strong>{detail ? <span style={{ opacity: .72 }}>· {detail}</span> : null}</div>;
}

function Notice({ children, tone }: { children: ReactNode; tone: "error" | "success" | "working" }) {
  const palette = tone === "error" ? ["#381a1d", "#ef9b9b"] : tone === "success" ? ["#102018", "#9ed9ad"] : ["#1a1b24", "#c9c2f7"];
  return <div style={{ marginTop: 15, border: `1px solid ${palette[1]}55`, background: palette[0], color: palette[1], borderRadius: 12, padding: "10px 13px", display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>{children}</div>;
}

function ProductionPanel({ icon, title, stat, description, children }: { icon: ReactNode; title: string; stat: string; description: string; children: ReactNode }) {
  return <div style={{ border: "1px solid #272d36", borderRadius: 18, background: "#0d1015", padding: 18 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><div style={{ display: "flex", alignItems: "center", gap: 8, color: "#d1b06b" }}>{icon}<strong>{title}</strong></div><strong style={{ fontSize: 24 }}>{stat}</strong></div><p style={{ color: "#909aa8", fontSize: 13, lineHeight: 1.5, minHeight: 58 }}>{description}</p>{children}</div>;
}

function eyebrow(): CSSProperties { return { color: "#8b95a2", fontSize: 11, letterSpacing: 1.35, textTransform: "uppercase" as const, fontWeight: 800 }; }
function selectorCard(): CSSProperties { return { minHeight: 90, display: "flex", flexDirection: "column" as const, justifyContent: "center", gap: 7, border: "1px solid #2a3039", background: "#0a0d12", borderRadius: 16, padding: "14px 16px" }; }
function selectStyle(): CSSProperties { return { width: "100%", border: 0, outline: 0, background: "transparent", color: "#f5efe6", fontSize: 17, fontWeight: 800, padding: 0, cursor: "pointer" }; }
function primaryButton(disabled: boolean): CSSProperties { return { border: 0, borderRadius: 999, padding: "12px 17px", background: disabled ? "#51493b" : "#f0d595", color: disabled ? "#9b9386" : "#08090d", fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 7, cursor: disabled ? "not-allowed" : "pointer" }; }
function secondaryButton(disabled: boolean): CSSProperties { return { border: "1px solid #555e6c", borderRadius: 999, padding: "11px 15px", background: "transparent", color: disabled ? "#6f7680" : "#e9e3da", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7, cursor: disabled ? "not-allowed" : "pointer" }; }
function smallButton(disabled = false): CSSProperties { return { border: "1px solid #39414d", borderRadius: 9, padding: "8px 10px", background: disabled ? "#111318" : "#151a21", color: disabled ? "#666f7c" : "#e8e4dc", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 5, cursor: disabled ? "not-allowed" : "pointer" }; }
function approveButton(): CSSProperties { return { ...smallButton(), border: "1px solid #42604a", background: "#142019", color: "#a9dfb5" }; }
function ghostButton(): CSSProperties { return { border: "1px solid #323945", borderRadius: 9, padding: "7px 9px", background: "transparent", color: "#aeb6c2", fontSize: 11, fontWeight: 750, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }; }
function statusPill(status: string): CSSProperties { const good = status === "approved" || status === "generated" || status === "ready"; return { padding: "5px 8px", borderRadius: 999, fontSize: 9, fontWeight: 900, letterSpacing: .8, background: good ? "rgba(12,45,24,.88)" : status === "failed" ? "rgba(70,20,22,.9)" : "rgba(20,23,29,.85)", color: good ? "#a9dfb5" : status === "failed" ? "#ef9b9b" : "#d6bd84", backdropFilter: "blur(8px)" }; }
