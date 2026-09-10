"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  Lightbulb,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";

import { analyzeCsv } from "@/lib/data-story";
import {
  buildEvidenceIntelligence,
  type EvidenceIntelligenceReport,
  type StoryHunterAngle,
} from "@/lib/evidence-intelligence";
import type {
  EvidenceScoutResponse,
  EvidenceScoutSource,
} from "@/lib/evidence-scout";
import {
  base64ToBlob,
  deleteEvidenceLibraryRecord,
  downloadLibraryBlob,
  getEvidenceLibraryRecord,
  listEvidenceLibrary,
  mergeLibraryRecord,
  saveEvidenceLibraryRecord,
  scoutSourceToLibraryRecord,
  type EvidenceLibraryRecord,
} from "@/lib/evidence-library";
import type {
  DatasetAnalysis,
  DocumentIngestion,
  EvidenceItem,
  EvidenceSourceType,
} from "@/lib/types";

type Props = {
  topic: string;
  question: string;
  evidence: EvidenceItem[];
  datasets: DatasetAnalysis[];
  scout: EvidenceScoutResponse | null;
  onIntegrate: (
    newEvidence: EvidenceItem[],
    newDatasets: DatasetAnalysis[]
  ) => void;
  onUseAngle: (angle: StoryHunterAngle, build: boolean) => void;
};

type OpenIngestionResponse = {
  finalUrl: string;
  title: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  extractedText?: string;
  evidence: EvidenceItem[];
  dataset?: DatasetAnalysis;
  document?: DocumentIngestion;
  fileBase64: string;
};

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 14,
        lineHeight: 1.5,
        opacity: 0.9,
      }}
    >
      {children}
    </div>
  );
}

function dedupeEvidence(items: EvidenceItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}|${item.statement}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeDatasets(items: DatasetAnalysis[]) {
  const byName = new Map<string, DatasetAnalysis>();
  items.forEach((item) => byName.set(item.name, item));
  return [...byName.values()];
}

function sourceBadge(record: EvidenceLibraryRecord) {
  if (record.status === "reviewed") return "reviewed";
  if (record.status === "ingested") return "ingested";
  return record.access === "open_download" ? "open candidate" : "candidate";
}

function exportJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function roleLabel(role: string) {
  return role.replaceAll("_", " ").toUpperCase();
}

export function EvidenceIntelligenceLab({
  topic,
  question,
  evidence,
  datasets,
  scout,
  onIntegrate,
  onUseAngle,
}: Props) {
  const [library, setLibrary] = useState<EvidenceLibraryRecord[]>([]);
  const [report, setReport] =
    useState<EvidenceIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoStatus, setAutoStatus] = useState("");
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [rebuildStatus, setRebuildStatus] = useState("");
  const [error, setError] = useState("");
  const [localType, setLocalType] =
    useState<EvidenceSourceType>("paper");
  const [localBusy, setLocalBusy] = useState(false);

  const questionCandidates = useMemo(
    () => scout?.questions || [],
    [scout]
  );

  async function refreshLibrary() {
    const next = await listEvidenceLibrary();
    setLibrary(next);
    return next;
  }

  function reanalyze(nextLibrary = library) {
    const next = buildEvidenceIntelligence({
      topic,
      question,
      evidence,
      datasets,
      library: nextLibrary,
      questionCandidates,
    });
    setReport(next);
    return next;
  }

  async function rebuildIntelligence() {
    if (rebuildBusy) return;

    setRebuildBusy(true);
    setError("");
    setRebuildStatus("Refreshing evidence library…");

    try {
      const records = await listEvidenceLibrary();
      setLibrary(records);

      setRebuildStatus(
        "Recomputing claim relevance and Story Hunter…"
      );

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const next = buildEvidenceIntelligence({
        topic,
        question,
        evidence,
        datasets,
        library: records,
        questionCandidates,
      });

      setReport(next);

      const stamp = new Date(
        next.generatedAt
      ).toLocaleTimeString();

      setRebuildStatus(
        `Rebuilt at ${stamp} · ${next.claims.length} claims · ${next.angles.length} story angles`
      );
    } catch (err: any) {
      setError(
        err?.message ||
          "Unable to rebuild evidence intelligence."
      );
      setRebuildStatus("");
    } finally {
      setRebuildBusy(false);
    }
  }

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const records = await listEvidenceLibrary();
        if (!live) return;

        setLibrary(records);
        setReport(
          buildEvidenceIntelligence({
            topic,
            question,
            evidence,
            datasets,
            library: records,
            questionCandidates,
          })
        );
      } catch (err: any) {
        if (live) {
          setError(
            err?.message ||
              "Unable to open the persistent Evidence Library."
          );
        }
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!scout?.sources.length) return;

    let live = true;

    void (async () => {
      try {
        const currentScoutIds = new Set(
          scout.sources.map((source) => source.id)
        );

        /*
         * Scout candidates are refreshable discovery records.
         * Remove stale, unreviewed scout candidates from older searches,
         * but preserve ingested/reviewed/local/manual evidence.
         */
        const previous = await listEvidenceLibrary();

        for (const record of previous) {
          const staleScoutCandidate =
            record.origin === "scout" &&
            record.status === "candidate" &&
            !currentScoutIds.has(record.id);

          if (staleScoutCandidate) {
            await deleteEvidenceLibraryRecord(record.id);
          }
        }

        for (const source of scout.sources) {
          const existing = await getEvidenceLibraryRecord(
            source.id
          );

          if (
            existing?.status === "ingested" ||
            existing?.status === "reviewed"
          ) {
            continue;
          }

          await saveEvidenceLibraryRecord(
            existing
              ? mergeLibraryRecord(
                  existing,
                  {
                    ...scoutSourceToLibraryRecord(source),
                    id: source.id,
                    title: source.title,
                    sourceType: source.sourceType,
                    status: "candidate",
                    origin: "scout",
                  }
                )
              : scoutSourceToLibraryRecord(source)
          );
        }

        const records = await listEvidenceLibrary();
        if (!live) return;

        setLibrary(records);
        setReport(
          buildEvidenceIntelligence({
            topic,
            question,
            evidence,
            datasets,
            library: records,
            questionCandidates: scout.questions,
          })
        );
      } catch (err: any) {
        if (live) {
          setError(
            err?.message ||
              "Unable to synchronize Evidence Scout results with the library."
          );
        }
      }
    })();

    return () => {
      live = false;
    };
  }, [scout?.searchedAt]);

  useEffect(() => {
    if (loading) return;
    reanalyze();
  }, [
    topic,
    question,
    evidence,
    datasets,
    questionCandidates,
    loading,
  ]);

  async function ingestScoutSource(
    source: EvidenceScoutSource
  ) {
    if (
      !source.downloadUrl ||
      source.access !== "open_download" ||
      !source.license
    ) {
      return null;
    }

    const existing = await getEvidenceLibraryRecord(source.id);

    if (
      existing?.status === "ingested" ||
      existing?.status === "reviewed"
    ) {
      return existing;
    }

    const response = await fetch("/api/open-ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: source.downloadUrl,
        title: source.title,
        sourceType: source.sourceType,
        provider: source.provider,
        license: source.license,
        sourceUrl: source.url,
        doi: source.doi,
        libraryId: source.id,
      }),
    });

    const data = (await response.json()) as
      | (OpenIngestionResponse & { error?: string });

    if (!response.ok) {
      throw new Error(
        data.error || `Unable to ingest ${source.title}.`
      );
    }

    const blob = base64ToBlob(
      data.fileBase64,
      data.mimeType
    );

    const linkedEvidence = data.evidence.map((item) => ({
      ...item,
      source: `library:${source.id}`,
      sourceLabel: source.title,
      sourceType: source.sourceType,
    }));

    const record = mergeLibraryRecord(
      existing || scoutSourceToLibraryRecord(source),
      {
        id: source.id,
        title: source.title,
        sourceType: source.sourceType,
        status: "ingested",
        fileName: data.fileName,
        mimeType: data.mimeType,
        byteLength: data.byteLength,
        extractedText: data.extractedText,
        evidence: linkedEvidence,
        dataset: data.dataset,
        fileBlob: blob,
        url: source.url,
        downloadUrl: data.finalUrl || source.downloadUrl,
        provider: source.provider,
        license: source.license,
        access: source.access,
        origin: "scout",
        tags: [
          source.provider,
          source.sourceType,
          "auto-ingested",
        ],
      }
    );

    await saveEvidenceLibraryRecord(record);
    return record;
  }

  async function autoIngestOpenEvidence() {
    if (!scout) {
      setError(
        "Run Evidence Scout first so the library has open sources to ingest."
      );
      return;
    }

    const candidates = scout.sources.filter(
      (source) =>
        source.access === "open_download" &&
        source.downloadUrl &&
        source.license
    );

    if (!candidates.length) {
      setError(
        "The current scout results do not contain a safely downloadable open source."
      );
      return;
    }

    setAutoBusy(true);
    setError("");

    const addedEvidence: EvidenceItem[] = [];
    const addedDatasets: DatasetAnalysis[] = [];
    const failures: string[] = [];
    let completed = 0;
    let failed = 0;

    try {
      for (const source of candidates.slice(0, 6)) {
        setAutoStatus(
          `Ingesting ${completed + failed + 1}/${Math.min(
            6,
            candidates.length
          )} · ${source.title}`
        );

        try {
          const record = await ingestScoutSource(source);

          if (record) {
            addedEvidence.push(...record.evidence);
            if (record.dataset) {
              addedDatasets.push(record.dataset);
            }
          }

          completed += 1;
        } catch (err: any) {
          failed += 1;
          failures.push(
            `${source.title}: ${err?.message || "ingestion failed"}`
          );
        }
      }

      if (addedEvidence.length || addedDatasets.length) {
        onIntegrate(
          dedupeEvidence(addedEvidence),
          dedupeDatasets(addedDatasets)
        );
      }

      const records = await refreshLibrary();
      reanalyze(records);

      setAutoStatus(
        `Finished · ${completed} ingested${
          failed
            ? ` · ${failed} failed · ${failures.slice(0, 2).join(" | ")}`
            : ""
        }`
      );
    } catch (err: any) {
      setError(
        err?.message ||
          "Automatic open-evidence ingestion failed."
      );
    } finally {
      setAutoBusy(false);
    }
  }

  async function importLocalFile(file?: File) {
    if (!file) return;

    setLocalBusy(true);
    setError("");

    try {
      const id = `local-${crypto.randomUUID()}`;
      let newEvidence: EvidenceItem[] = [];
      let dataset: DatasetAnalysis | undefined;
      let extractedText = "";
      let title = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ");

      if (
        file.name.toLowerCase().endsWith(".csv") ||
        file.type === "text/csv"
      ) {
        extractedText = await file.text();
        dataset = analyzeCsv(extractedText, file.name);

        if (dataset.insight) {
          newEvidence = [
            {
              id: crypto.randomUUID(),
              kind: "observed",
              statement: dataset.insight,
              source: `library:${id}`,
              sourceLabel: file.name,
              sourceType: "dataset",
            },
          ];
        }
      } else {
        const form = new FormData();
        form.append("file", file);
        form.append(
          "kind",
          localType === "paper"
            ? "research"
            : localType === "report"
              ? "report"
              : "text"
        );

        const response = await fetch(
          "/api/document-ingest",
          {
            method: "POST",
            body: form,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Local evidence ingestion failed."
          );
        }

        const parsed = data.result as DocumentIngestion;
        title = parsed.title || title;

        newEvidence = parsed.evidence.map((item) => ({
          ...item,
          source: `library:${id}`,
          // Keep the parsed document title as context, not only
          // the opaque uploaded filename.
          sourceLabel: parsed.title || file.name,
          sourceType: localType,
        }));

        extractedText =
          file.type === "application/pdf"
            ? ""
            : await file.text();
      }

      const now = new Date().toISOString();

      const record: EvidenceLibraryRecord = {
        id,
        createdAt: now,
        updatedAt: now,
        title,
        sourceType: dataset ? "dataset" : localType,
        status: "ingested",
        origin: "upload",
        tags: [
          "local",
          dataset ? "dataset" : localType,
        ],
        fileName: file.name,
        mimeType:
          file.type ||
          (dataset
            ? "text/csv"
            : "application/octet-stream"),
        byteLength: file.size,
        extractedText: extractedText.slice(0, 120_000),
        evidence: newEvidence,
        dataset,
        fileBlob: file,
      };

      await saveEvidenceLibraryRecord(record);

      onIntegrate(
        newEvidence,
        dataset ? [dataset] : []
      );

      const records = await refreshLibrary();
      reanalyze(records);
    } catch (err: any) {
      setError(
        err?.message ||
          "Unable to import evidence into the persistent library."
      );
    } finally {
      setLocalBusy(false);
    }
  }

  async function removeRecord(id: string) {
    await deleteEvidenceLibraryRecord(id);
    const records = await refreshLibrary();
    reanalyze(records);
  }

  async function markReviewed(
    record: EvidenceLibraryRecord
  ) {
    const updated = mergeLibraryRecord(record, {
      id: record.id,
      title: record.title,
      sourceType: record.sourceType,
      status: "reviewed",
    });

    await saveEvidenceLibraryRecord(updated);

    const records = await refreshLibrary();
    reanalyze(records);
  }

  function useAngle(
    angle: StoryHunterAngle,
    build: boolean
  ) {
    onUseAngle(angle, build);
  }

  if (loading) {
    return (
      <section className="workspace">
        <div className="panel">
          <LoaderCircle size={18} /> Opening persistent
          Evidence Library…
        </div>
      </section>
    );
  }

  return (
    <section
      className="workspace"
      style={{ display: "grid", gap: 18 }}
    >
      <div className="panel">
        <div className="panelHead">
          <div>
            <p className="micro">
              PERSISTENT EVIDENCE LIBRARY
            </p>
            <h2>
              Keep the sources. Ingest the open files. Build
              from what survives review.
            </h2>
          </div>
          <Database />
        </div>

        <p className="muted">
          This library persists in IndexedDB on this browser
          and deployed domain, including stored file Blobs.
          It survives reloads without requiring a database. A
          later cloud-storage adapter can make the same library
          cross-device and team-shared.
        </p>

        {error && (
          <div className="studioError">{error}</div>
        )}

        <div
          className="exportRow"
          style={{
            marginTop: 16,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="button primary"
            onClick={autoIngestOpenEvidence}
            disabled={autoBusy}
          >
            {autoBusy ? (
              <LoaderCircle size={16} />
            ) : (
              <FileSearch size={16} />
            )}
            {autoBusy
              ? "Auto-ingesting open evidence…"
              : "Auto-ingest open scout evidence"}
          </button>

          <button
            type="button"
            className="button"
            onClick={rebuildIntelligence}
            disabled={rebuildBusy}
          >
            {rebuildBusy ? (
              <LoaderCircle size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {rebuildBusy
              ? "Rebuilding intelligence…"
              : "Rebuild intelligence"}
          </button>

          <button
            type="button"
            className="button"
            onClick={() =>
              exportJson(
                "evidence-intelligence.json",
                { library, report }
              )
            }
          >
            <Download size={16} /> Export intelligence
          </button>
        </div>

        {autoStatus && <Notice>{autoStatus}</Notice>}
        {rebuildStatus && (
          <Notice>{rebuildStatus}</Notice>
        )}

        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label>
            Local source type
            <select
              value={localType}
              onChange={(event) =>
                setLocalType(
                  event.target.value as EvidenceSourceType
                )
              }
            >
              <option value="paper">
                Research paper
              </option>
              <option value="report">Report</option>
              <option value="dataset">Dataset</option>
              <option value="other">
                Other source
              </option>
            </select>
          </label>

          <label
            className="uploadBox"
            style={{ margin: 0 }}
          >
            <Plus />
            <strong>
              {localBusy
                ? "Adding to library…"
                : "Add local PDF, TXT, Markdown or CSV to the persistent library"}
            </strong>
            <span>
              The original file is retained as a browser Blob.
            </span>
            <input
              type="file"
              accept=".pdf,.txt,.md,.csv,text/plain,text/csv,application/pdf"
              hidden
              onChange={(event) =>
                importLocalFile(
                  event.target.files?.[0]
                )
              }
            />
          </label>
        </div>

        <div style={{ marginTop: 26 }}>
          <p className="micro">
            LIBRARY · {library.length} SOURCES
          </p>

          {!library.length && (
            <Notice>
              Run Evidence Scout or add a source. The library
              will persist here after reload.
            </Notice>
          )}

          {library.slice(0, 30).map(
            (record, index) => (
              <article
                className="sceneCard"
                key={record.id}
              >
                <div className="sceneIndex">
                  {String(index + 1).padStart(
                    2,
                    "0"
                  )}
                </div>

                <div style={{ width: "100%" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      gap: 12,
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <p className="micro">
                        {record.provider ||
                          record.origin}{" "}
                        · {record.sourceType} ·{" "}
                        {sourceBadge(record)}
                      </p>
                      <h3>{record.title}</h3>
                    </div>

                    {record.status ===
                    "reviewed" ? (
                      <CheckCircle2 size={20} />
                    ) : record.dataset ? (
                      <Database size={20} />
                    ) : (
                      <BookOpen size={20} />
                    )}
                  </div>

                  <p className="muted">
                    {[
                      record.authors
                        ?.slice(0, 3)
                        .join(", "),
                      record.publisher,
                      record.year,
                      record.fileName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {record.summary && (
                    <p>{record.summary}</p>
                  )}

                  <div className="sceneMeta">
                    <span>
                      {record.evidence.length}{" "}
                      extracted evidence items
                    </span>
                    <span>
                      {record.byteLength
                        ? `${(
                            record.byteLength /
                            1024 /
                            1024
                          ).toFixed(2)} MB stored`
                        : "metadata"}
                    </span>
                    <span>
                      {record.dataset
                        ? `${record.dataset.rowCount} data rows`
                        : record.extractedText
                          ? `${record.extractedText.length.toLocaleString()} chars`
                          : "not ingested"}
                    </span>
                  </div>

                  <div
                    className="exportRow"
                    style={{
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {record.url && (
                      <a
                        className="button"
                        href={record.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink
                          size={14}
                        />{" "}
                        Open source
                      </a>
                    )}

                    {record.fileBlob && (
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          downloadLibraryBlob(
                            record
                          )
                        }
                      >
                        <Download
                          size={14}
                        />{" "}
                        Download stored file
                      </button>
                    )}

                    {record.status ===
                      "ingested" && (
                      <button
                        type="button"
                        className="button"
                        onClick={() =>
                          markReviewed(record)
                        }
                      >
                        <CheckCircle2
                          size={14}
                        />{" "}
                        Mark reviewed
                      </button>
                    )}

                    <button
                      type="button"
                      className="button ghost"
                      onClick={() =>
                        removeRecord(
                          record.id
                        )
                      }
                    >
                      <Trash2 size={14} />{" "}
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            )
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1.15fr .85fr",
          gap: 18,
        }}
      >
        <div className="panel">
          <div className="panelHead">
            <div>
              <p className="micro">
                CLAIM ↔ SOURCE GRAPH
              </p>
              <h2>
                Every important claim should
                know where it came from.
              </h2>
            </div>
            <Search />
          </div>

          {!report?.claims.length && (
            <Notice>
              Add or ingest evidence to
              generate claim nodes.
            </Notice>
          )}

          {report?.claims
            .slice(0, 18)
            .map((claim, index) => {
              const edges =
                report.edges.filter(
                  (edge) =>
                    edge.claimId ===
                    claim.id
                );

              return (
                <article
                  className="sceneCard"
                  key={claim.id}
                >
                  <div className="sceneIndex">
                    {String(
                      index + 1
                    ).padStart(2, "0")}
                  </div>

                  <div
                    style={{
                      width: "100%",
                    }}
                  >
                    <p className="micro">
                      {roleLabel(
                        claim.role
                      )}{" "}
                      · relevance{" "}
                      {claim.relevance} ·{" "}
                      {claim.evidenceKind} ·
                      confidence{" "}
                      {claim.confidence} ·
                      visual{" "}
                      {
                        claim.visualPotential
                      }
                    </p>

                    <p
                      className="muted"
                      style={{
                        marginTop: 6,
                      }}
                    >
                      {
                        claim.relevanceReason
                      }
                    </p>

                    <h3>{claim.text}</h3>

                    <div
                      style={{
                        marginTop: 12,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {edges.length ? (
                        edges.map(
                          (edge) => {
                            const source =
                              library.find(
                                (
                                  item
                                ) =>
                                  item.id ===
                                  edge.sourceId
                              );

                            return (
                              <div
                                key={
                                  edge.id
                                }
                                style={{
                                  padding: 10,
                                  borderRadius: 10,
                                  border:
                                    "1px solid rgba(255,255,255,.09)",
                                }}
                              >
                                <strong>
                                  {edge.relation.toUpperCase()}
                                </strong>{" "}
                                ·{" "}
                                {source?.title ||
                                  edge.sourceId}

                                <p
                                  className="muted"
                                  style={{
                                    margin:
                                      "4px 0 0",
                                  }}
                                >
                                  {
                                    edge.reason
                                  }
                                </p>
                              </div>
                            );
                          }
                        )
                      ) : (
                        <p className="muted">
                          No persistent
                          source connection
                          yet.
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
        </div>

        <div className="panel">
          <div className="panelHead">
            <div>
              <p className="micro">
                CONTRADICTION DETECTION
              </p>
              <h2>
                Make disagreement visible
                before the script hides it.
              </h2>
            </div>
            <Lightbulb />
          </div>

          {!report?.contradictions
            .length ? (
            <Notice>
              No strong automatic
              contradiction is currently
              flagged. This is a screening
              result, not proof that all
              sources agree.
            </Notice>
          ) : (
            report.contradictions
              .slice(0, 10)
              .map(
                (finding, index) => {
                  const a =
                    report.claims.find(
                      (claim) =>
                        claim.id ===
                        finding.claimAId
                    );

                  const b =
                    report.claims.find(
                      (claim) =>
                        claim.id ===
                        finding.claimBId
                    );

                  return (
                    <article
                      className="sceneCard"
                      key={finding.id}
                    >
                      <div className="sceneIndex">
                        {String(
                          index + 1
                        ).padStart(
                          2,
                          "0"
                        )}
                      </div>

                      <div
                        style={{
                          width: "100%",
                        }}
                      >
                        <p className="micro">
                          SEVERITY{" "}
                          {
                            finding.severity
                          }
                          /100
                        </p>

                        <strong>
                          {a?.text}
                        </strong>

                        <div
                          style={{
                            margin:
                              "10px 0",
                            textAlign:
                              "center",
                            opacity: 0.65,
                          }}
                        >
                          ↕
                        </div>

                        <strong>
                          {b?.text}
                        </strong>

                        <p className="muted">
                          {
                            finding.reason
                          }
                        </p>
                      </div>
                    </article>
                  );
                }
              )
          )}

          {!!report?.warnings.length && (
            <div
              className="retentionWarnings"
              style={{ marginTop: 18 }}
            >
              <p className="micro">
                TRUST WARNINGS
              </p>

              {report.warnings.map(
                (warning, index) => (
                  <div key={warning}>
                    <span>
                      {index + 1}
                    </span>
                    <p>{warning}</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panelHead">
          <div>
            <p className="micro">
              STORY HUNTER
            </p>
            <h2>
              Choose the angle with
              evidence, tension, visual
              power and viewer curiosity.
            </h2>
          </div>
          <WandSparkles />
        </div>

        <p className="muted">
          Story Hunter does not reward
          clickbait alone. It scores
          evidence support, curiosity,
          stakes, visual potential, genuine
          tension and originality, then
          keeps the source and claim IDs
          behind the angle.
        </p>

        {report?.angles.map(
          (angle, index) => (
            <article
              className="sceneCard"
              key={angle.id}
            >
              <div className="sceneIndex">
                {String(
                  index + 1
                ).padStart(2, "0")}
              </div>

              <div
                style={{ width: "100%" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: 14,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <p className="micro">
                      {index === 0
                        ? "RECOMMENDED STORY"
                        : angle.angle.toUpperCase()}
                    </p>

                    <h3>{angle.title}</h3>
                    <strong>
                      {angle.question}
                    </strong>
                  </div>

                  <strong
                    style={{
                      fontSize: 24,
                    }}
                  >
                    {angle.overall}/100
                  </strong>
                </div>

                <p
                  style={{
                    marginTop: 12,
                  }}
                >
                  {angle.hook}
                </p>

                <p className="muted">
                  {angle.rationale}
                </p>

                <div className="sceneMeta">
                  <span>
                    evidence{" "}
                    {angle.evidence}
                  </span>
                  <span>
                    curiosity{" "}
                    {angle.curiosity}
                  </span>
                  <span>
                    stakes {angle.stakes}
                  </span>
                  <span>
                    visual{" "}
                    {
                      angle.visualPotential
                    }
                  </span>
                  <span>
                    tension{" "}
                    {angle.tension}
                  </span>
                  <span>
                    originality{" "}
                    {
                      angle.originality
                    }
                  </span>
                </div>

                <div
                  className="retentionPurpose"
                  style={{
                    marginTop: 12,
                  }}
                >
                  <strong>
                    Visual plan:
                  </strong>{" "}
                  {angle.visualPlan.join(
                    " → "
                  )}
                </div>

                <div
                  className="exportRow"
                  style={{
                    marginTop: 12,
                  }}
                >
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      useAngle(
                        angle,
                        false
                      )
                    }
                  >
                    <Plus size={14} />{" "}
                    Use question
                  </button>

                  <button
                    type="button"
                    className="button primary"
                    onClick={() =>
                      useAngle(
                        angle,
                        true
                      )
                    }
                  >
                    <WandSparkles
                      size={14}
                    />{" "}
                    Build this story
                  </button>
                </div>
              </div>
            </article>
          )
        )}
      </div>
    </section>
  );
}
