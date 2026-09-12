"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Film, Fingerprint, LockKeyhole, Sparkles, WandSparkles } from "lucide-react";
import { buildStoryworldPackage } from "@/lib/storyworld-engine";
import { buildStoryworldGenerationPlan, summarizeGenerationPlan } from "@/lib/storyworld-generation";
import { storyworlds } from "@/lib/storyworld-data";

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

export default function StoryworldGeneratePage() {
  const [worldId, setWorldId] = useState("kamau-will");
  const plan = useMemo(() => buildStoryworldGenerationPlan(buildStoryworldPackage(worldId)), [worldId]);
  const summary = summarizeGenerationPlan(plan);
  const ready = plan.jobs.filter((job) => job.status === "ready").length;
  const approved = plan.jobs.filter((job) => job.status === "approved").length;
  const blocked = plan.jobs.filter((job) => job.status === "blocked").length;

  return (
    <main style={{ minHeight: "100vh", background: "#08090d", color: "#f5efe6", padding: "34px 20px 80px", fontFamily: "Inter,ui-sans-serif,system-ui" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <a href="/storyworld" style={{ color: "#aab2bf", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}><ArrowLeft size={16}/> Storyworld</a>
        <div style={{ marginTop: 26, display: "flex", gap: 10, color: "#c8a968", textTransform: "uppercase", letterSpacing: 2, fontSize: 13 }}><WandSparkles size={16}/> Generation layer v0.3</div>
        <h1 style={{ fontSize: "clamp(42px,7vw,78px)", letterSpacing: -3, lineHeight: .96, margin: "16px 0" }}>Identity locked. Shots unlocked.</h1>
        <p style={{ maxWidth: 810, color: "#b7bdc8", fontSize: 18, lineHeight: 1.6 }}>Canonical characters now have stable asset IDs and SHA-256 fingerprints. Approved identities unlock their scene jobs; seed frames guide composition while the canonical vault controls identity.</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 26 }}>
          {storyworlds.map((world) => <button key={world.id} onClick={() => setWorldId(world.id)} style={{ border: `1px solid ${world.id === worldId ? "#d1b06b" : "#303641"}`, background: world.id === worldId ? "#201c14" : "#101218", color: "#f5efe6", borderRadius: 999, padding: "11px 16px", cursor: "pointer" }}>{world.title}</button>)}
        </div>

        <section style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 12 }}>
          {[
            ["Locked characters", `${summary.approvedCharacters}/${summary.characters}`], ["Shots", summary.shots], ["Seeded shots", summary.seededShots], ["Ready jobs", ready], ["Approved jobs", approved], ["Blocked", blocked], ["Runtime", `${summary.runtimeSec}s`]
          ].map(([label, value]) => <div key={String(label)} style={{ border: "1px solid #272c35", background: "#101218", borderRadius: 18, padding: 18 }}><div style={{ color: "#858e9d", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.4 }}>{label}</div><div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>{value}</div></div>)}
        </section>

        <section style={{ marginTop: 34, border: "1px solid #272c35", borderRadius: 22, background: "#0e1015", padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div><div style={{ color: "#c8a968", textTransform: "uppercase", letterSpacing: 2, fontSize: 12 }}>Canonical character vault</div><h2 style={{ margin: "8px 0 0", fontSize: 30 }}>The face is an asset, not a prompt.</h2></div>
            <button onClick={() => downloadJson(`${worldId}-production-plan-v03.json`, plan)} style={{ border: 0, borderRadius: 999, padding: "12px 17px", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}><Download size={16}/> Download production plan</button>
          </div>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
            {plan.characterReferences.map((ref) => <div key={ref.characterId} style={{ border: `1px solid ${ref.approved ? "#4c684d" : "#2a3039"}`, borderRadius: 16, padding: 12, background: "#0a0c10" }}>
              {ref.approved ? <img src={publicUrl(ref.referencePath)} alt={ref.characterName} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: 12, display: "block" }}/> : <div style={{ aspectRatio: "3/4", borderRadius: 12, background: "#11151c", display: "grid", placeItems: "center" }}><LockKeyhole size={28} color="#d1b06b"/></div>}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 12 }}><strong>{ref.characterName}</strong>{ref.approved ? <CheckCircle2 size={16} color="#9ed9ad"/> : <LockKeyhole size={16} color="#d1b06b"/>}</div>
              <div style={{ color: "#9aa3b1", fontSize: 12, marginTop: 7 }}>{ref.canonicalAssetId || "Reference pending"}</div>
              {ref.sha256 ? <div title={ref.sha256} style={{ display: "flex", gap: 6, alignItems: "center", color: "#75808f", fontSize: 11, marginTop: 7 }}><Fingerprint size={13}/>{ref.sha256.slice(0, 16)}…</div> : null}
              <div style={{ color: ref.approved ? "#9ed9ad" : "#d5b46f", fontSize: 12, marginTop: 9 }}>{ref.approved ? "APPROVED / LOCKED" : "PENDING"}</div>
            </div>)}
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 30 }}>Generation queue</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {plan.jobs.map((job) => <div key={job.id} style={{ display: "grid", gridTemplateColumns: "160px 120px 1fr", gap: 14, border: "1px solid #252a33", borderRadius: 15, padding: 15, alignItems: "center", background: "#0d0f14" }}><div style={{ fontWeight: 800 }}>{job.kind}</div><div style={{ color: job.status === "ready" || job.status === "approved" ? "#9ed9ad" : "#d5b46f", display: "flex", alignItems: "center", gap: 6 }}>{job.status === "ready" || job.status === "approved" ? <CheckCircle2 size={14}/> : <LockKeyhole size={14}/>} {job.status}</div><div style={{ color: "#9ba4b2", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{job.outputPath}</div></div>)}
          </div>
        </section>

        <section style={{ marginTop: 30, padding: 22, borderRadius: 20, border: "1px solid #342f22", background: "#15120c" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#d5b46f" }}><Sparkles size={18}/><strong>Commands</strong></div>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 14, color: "#eae3d6", fontSize: 14 }}>npm run storyworld:verify-vault{"\n"}npm run storyworld:prepare -- {worldId}{"\n"}npm run render:storyworld -- episodes/storyworld/{worldId}-{plan.render.episodeId}.production.json</pre>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#aeb6c2", marginTop: 8 }}><Film size={15}/> Until generated shots exist, approved seed frames are used before storyboard fallbacks.</div>
        </section>
      </div>
    </main>
  );
}
