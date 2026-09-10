"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Film,
  Map,
  Music2,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";

type IngestResult = {
  title: string;
  suggestedQuestion: string;
  suggestedBrief: string;
  evidence: Array<{
    id: string;
    kind: string;
    statement: string;
  }>;
};

export default function CreatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState("");

  const canBuild = useMemo(() => Boolean(file), [file]);

  async function ingest() {
    if (!file) return;

    setError("");
    setResult(null);
    setStatus("Reading source and extracting evidence…");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "report");

      const response = await fetch("/api/document-ingest", {
        method: "POST",
        body: form,
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Could not ingest source.");
      }

      const next = json.result as IngestResult;
      setResult(next);

      if (!question.trim()) {
        setQuestion(
          next.suggestedQuestion ||
            "What is the most important story hidden in this evidence?"
        );
      }

      setStatus(
        "Evidence ready. Continue in the Studio to build the episode, then run Production Intelligence before rendering."
      );
    } catch (error: any) {
      setError(error?.message || "Something went wrong.");
      setStatus("");
    }
  }

  const cards = [
    [Search, "Evidence", "Claims stay tied to sources"],
    [Film, "Media", "B-roll + archive shot planning"],
    [Map, "Maps", "Geographic storytelling"],
    [BarChart3, "Data", "Narration-led charts"],
    [Music2, "Sound", "Score, ambience + SFX direction"],
  ] as const;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#090b10",
        color: "#f7f7f3",
        padding: "48px 20px",
        fontFamily: "Inter, ui-sans-serif, system-ui",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#aeb7c7",
            fontSize: 13,
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          <Sparkles size={16} />
          Simple production mode
        </div>

        <h1
          style={{
            fontSize: "clamp(42px,7vw,82px)",
            lineHeight: 0.96,
            letterSpacing: -3,
            margin: "18px 0 18px",
            maxWidth: 900,
          }}
        >
          Source in. Premium story out.
        </h1>

        <p
          style={{
            fontSize: 19,
            lineHeight: 1.6,
            color: "#b9c0cc",
            maxWidth: 760,
          }}
        >
          Upload a report, paper or text source. Origin Studio extracts evidence
          first, then helps turn it into a documentary-grade visual story with
          B-roll, maps, charts, sound direction, narration and retention-aware
          pacing.
        </p>

        <section
          style={{
            marginTop: 36,
            border: "1px solid #252a34",
            borderRadius: 24,
            padding: 24,
            background: "#10131a",
          }}
        >
          <label
            style={{
              display: "block",
              border: "1px dashed #39404d",
              borderRadius: 18,
              padding: 28,
              cursor: "pointer",
              background: "#0c0f15",
            }}
          >
            <input
              type="file"
              accept=".pdf,.txt,.md,.markdown"
              style={{ display: "none" }}
              onChange={(event) =>
                setFile(event.target.files?.[0] || null)
              }
            />

            <div
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
              }}
            >
              <Upload size={28} />
              <div>
                <strong>{file ? file.name : "Upload your source"}</strong>
                <div
                  style={{
                    color: "#8f98a8",
                    marginTop: 5,
                  }}
                >
                  PDF, TXT or Markdown
                </div>
              </div>
            </div>
          </label>

          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Optional: what question should this story answer?"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 16,
              minHeight: 110,
              borderRadius: 16,
              border: "1px solid #2b313c",
              background: "#0b0e13",
              color: "white",
              padding: 16,
              fontSize: 16,
              resize: "vertical",
            }}
          />

          <button
            disabled={!canBuild}
            onClick={ingest}
            style={{
              marginTop: 16,
              border: 0,
              borderRadius: 999,
              padding: "14px 20px",
              fontWeight: 800,
              fontSize: 15,
              cursor: canBuild ? "pointer" : "not-allowed",
              background: canBuild ? "#f5f2e8" : "#343842",
              color: canBuild ? "#0b0d11" : "#848b98",
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            Analyze source
            <ArrowRight size={17} />
          </button>

          {status && (
            <p style={{ color: "#a8d9b4", marginTop: 16 }}>{status}</p>
          )}

          {error && (
            <p style={{ color: "#ff9c9c", marginTop: 16 }}>{error}</p>
          )}
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(190px,1fr))",
            gap: 12,
            marginTop: 18,
          }}
        >
          {cards.map(([Icon, title, copy]) => (
            <div
              key={title}
              style={{
                border: "1px solid #242a33",
                borderRadius: 18,
                padding: 18,
                background: "#0d1016",
              }}
            >
              <Icon size={21} />
              <strong
                style={{
                  display: "block",
                  marginTop: 18,
                }}
              >
                {title}
              </strong>
              <span
                style={{
                  display: "block",
                  marginTop: 6,
                  color: "#8f98a8",
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {copy}
              </span>
            </div>
          ))}
        </div>

        {result && (
          <section
            style={{
              marginTop: 28,
              border: "1px solid #29313c",
              borderRadius: 24,
              padding: 24,
              background: "#0e1218",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                color: "#a8d9b4",
              }}
            >
              <CheckCircle2 size={18} />
              Evidence extraction complete
            </div>

            <h2 style={{ fontSize: 28, margin: "14px 0 8px" }}>
              {result.title}
            </h2>

            <p style={{ color: "#aeb7c7", lineHeight: 1.55 }}>
              {question || result.suggestedQuestion}
            </p>

            <p style={{ color: "#7f8998", fontSize: 14 }}>
              {result.evidence?.length || 0} evidence items extracted.
              Missing claims remain missing by design.
            </p>

            <a
              href="/"
              style={{
                display: "inline-flex",
                marginTop: 12,
                alignItems: "center",
                gap: 8,
                color: "#fff",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Open full Studio
              <ArrowRight size={16} />
            </a>
          </section>
        )}
      </div>
    </main>
  );
}
