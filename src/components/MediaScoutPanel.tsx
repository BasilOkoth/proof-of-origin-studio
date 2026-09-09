"use client";

import React, { useState } from "react";
import type { EpisodeProject } from "@/lib/types";
import type { MediaCandidate, MediaScoutResult } from "@/lib/media-scout-types";
import { attachMediaCandidate, scoutEpisodeMedia } from "@/lib/media-scout-client";

export function MediaScoutPanel({
  project,
  onProjectChange,
}: {
  project: EpisodeProject;
  onProjectChange: (project: EpisodeProject) => void;
}) {
  const [scout, setScout] = useState<MediaScoutResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function runScout() {
    setBusy(true);
    setMessage("Scouting licensed B-roll...");
    try {
      const result = await scoutEpisodeMedia(project, { perScene: 4 });
      setScout(result);
      const count = result.scenes.reduce((sum, scene) => sum + scene.candidates.length, 0);
      setMessage(`Found ${count} licensed/open media candidates across ${result.scenes.length} scenes.`);
    } catch (error: any) {
      setMessage(error?.message || "Media scouting failed.");
    } finally {
      setBusy(false);
    }
  }

  function attach(sceneId: string, candidate: MediaCandidate) {
    onProjectChange(attachMediaCandidate(project, sceneId, candidate));
    setMessage(`Attached "${candidate.title}" with provenance metadata.`);
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
            LICENSED B-ROLL SCOUT
          </div>
          <h3 style={{ margin: "7px 0 4px", fontSize: 24 }}>
            Find footage that actually fits the story.
          </h3>
          <p style={{ margin: 0, opacity: .72, lineHeight: 1.45 }}>
            Searches Pexels video/photo and Wikimedia Commons while preserving creator, source and license metadata.
          </p>
        </div>
        <button
          onClick={runScout}
          disabled={busy}
          style={{
            padding: "11px 16px",
            borderRadius: 10,
            cursor: "pointer",
            border: 0,
            background: "#f3d64e",
            color: "#111",
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {busy ? "Scouting…" : "Scout B-roll"}
        </button>
      </div>

      {message && <div style={{ marginTop: 14, fontSize: 14, opacity: .78 }}>{message}</div>}

      {scout && (
        <div style={{ marginTop: 20, display: "grid", gap: 24 }}>
          {scout.scenes.map((scene) => (
            <div key={scene.sceneId}>
              <div style={{ marginBottom: 10 }}>
                <strong>{scene.headline}</strong>
                <div style={{ fontSize: 12, opacity: .62, marginTop: 3 }}>
                  Search: {scene.query}
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: 12,
              }}>
                {scene.candidates.map((candidate) => (
                  <article
                    key={candidate.id}
                    style={{
                      overflow: "hidden",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,.11)",
                      background: "rgba(255,255,255,.035)",
                    }}
                  >
                    <div style={{ aspectRatio: "16 / 9", background: "#111" }}>
                      <img
                        src={candidate.previewUrl}
                        alt={candidate.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>

                    <div style={{ padding: 11 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.25 }}>
                        {candidate.title}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, opacity: .65 }}>
                        {candidate.mediaType.toUpperCase()} · {candidate.provider.toUpperCase()}
                      </div>
                      <div style={{ marginTop: 5, fontSize: 11, opacity: .65, lineHeight: 1.3 }}>
                        {candidate.attribution}
                      </div>
                      <button
                        onClick={() => attach(scene.sceneId, candidate)}
                        style={{
                          marginTop: 9,
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(255,255,255,.18)",
                          background: "transparent",
                          color: "inherit",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Use in scene
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
