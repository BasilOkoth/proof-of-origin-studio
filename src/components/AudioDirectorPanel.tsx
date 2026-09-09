"use client";

import React, { useState } from "react";
import type { EpisodeProject } from "@/lib/types";
import type { AudioDirection } from "@/lib/audio-types";
import { generateElevenLabsAudioDirection } from "@/lib/audio-director-client";

export function AudioDirectorPanel({
  project,
  onProjectChange,
}: {
  project: EpisodeProject;
  onProjectChange: (project: EpisodeProject) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [direction, setDirection] = useState<AudioDirection | null>(null);

  async function generate() {
    setBusy(true);
    setStatus("Directing the episode sound...");
    try {
      const result = await generateElevenLabsAudioDirection(project, {
        generate: true,
        includeMusic: true,
        includeAmbience: true,
        includeSfx: true,
      });
      setDirection(result.direction);
      if (result.updatedProject) onProjectChange(result.updatedProject);
      setStatus(`Generated ${result.assetCount || 0} audio assets and attached them to the episode.`);
    } catch (error: any) {
      setStatus(error?.message || "Audio generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function previewPlan() {
    setBusy(true);
    setStatus("Analyzing story beats...");
    try {
      const result = await generateElevenLabsAudioDirection(project, { generate: false });
      setDirection(result.direction);
      setStatus("Audio direction plan ready. No ElevenLabs credits were used.");
    } catch (error: any) {
      setStatus(error?.message || "Audio planning failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: 20,
      padding: 22,
      background: "rgba(255,255,255,.035)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 2.5, opacity: .66, fontWeight: 900 }}>
            ELEVENLABS AUDIO DIRECTOR
          </div>
          <h3 style={{ margin: "7px 0 4px", fontSize: 24 }}>One coherent score. Story-aware sound.</h3>
          <p style={{ margin: 0, opacity: .72, lineHeight: 1.45 }}>
            Generates a full documentary score plus reusable ambience and editorial SFX from the episode structure.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={previewPlan} disabled={busy} style={{
            padding: "11px 14px", borderRadius: 10, cursor: "pointer",
            border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "inherit",
          }}>
            Preview direction
          </button>
          <button onClick={generate} disabled={busy} style={{
            padding: "11px 16px", borderRadius: 10, cursor: "pointer",
            border: 0, background: "#f3d64e", color: "#111", fontWeight: 900,
          }}>
            {busy ? "Generating…" : "Generate audio"}
          </button>
        </div>
      </div>

      {status && <div style={{ marginTop: 14, fontSize: 14, opacity: .78 }}>{status}</div>}

      {direction && (
        <div style={{ marginTop: 18, display: "grid", gap: 9 }}>
          <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,.04)" }}>
            <strong>Score</strong>
            <div style={{ marginTop: 6, opacity: .72, fontSize: 13, lineHeight: 1.45 }}>
              {direction.score.prompt}
            </div>
          </div>
          <div style={{ fontSize: 13, opacity: .72 }}>
            {direction.cues.length} timed ambience/SFX cues · {Math.round(direction.score.durationSec)}s score
          </div>
        </div>
      )}
    </section>
  );
}
