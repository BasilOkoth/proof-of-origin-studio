"use client";

import React, { useMemo } from "react";
import type { EpisodeProject } from "@/lib/types";
import type { MediaScoutResult } from "@/lib/media-scout-types";
import { buildEpisodeShotSequences } from "@/lib/shot-sequencer";

export function ShotSequencerPanel({
  project,
  scout,
}: {
  project: EpisodeProject;
  scout: MediaScoutResult;
}) {
  const sequences = useMemo(
    () => buildEpisodeShotSequences(project, scout),
    [project, scout]
  );

  return (
    <section style={{
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: 20,
      padding: 22,
      background: "rgba(255,255,255,.035)",
    }}>
      <div style={{ fontSize: 12, letterSpacing: 2.5, opacity: .66, fontWeight: 900 }}>
        EDITORIAL SHOT SEQUENCER
      </div>
      <h3 style={{ margin: "7px 0 4px", fontSize: 24 }}>
        Edit the story, not just the clips.
      </h3>
      <p style={{ margin: 0, opacity: .72, lineHeight: 1.45 }}>
        Builds establishing → human → process/detail → graphic interruption → payoff sequences from scouted media.
      </p>

      <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
        {sequences.map((sequence) => (
          <div key={sequence.sceneId} style={{
            padding: 14,
            borderRadius: 14,
            background: "rgba(255,255,255,.035)",
            border: "1px solid rgba(255,255,255,.08)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <strong>{sequence.headline}</strong>
              <span style={{ fontSize: 12, opacity: .6 }}>{sequence.rhythm.toUpperCase()}</span>
            </div>

            <div style={{ marginTop: 11, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sequence.shots.map((shot) => (
                <span key={shot.id} style={{
                  padding: "7px 9px",
                  borderRadius: 999,
                  fontSize: 11,
                  background: shot.candidate ? "rgba(243,214,78,.18)" : "rgba(255,255,255,.07)",
                  border: "1px solid rgba(255,255,255,.09)",
                }}>
                  {shot.role} · {shot.durationSec.toFixed(1)}s
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
