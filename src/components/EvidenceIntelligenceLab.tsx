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

import {
  analyzeCsv,
  DATASET_ANALYSIS_VERSION,
  isDatasetAnalysisCurrent,
} from "@/lib/data-story";
import { analyzeXlsx } from "@/lib/xlsx-story";
import { analyzeGeoJson } from "@/lib/geojson-map";
import {
  cleanVisualTitle,
  isNativeImageFile,
  isNativeImageRecord,
  looksLikeBinaryGarbage,
  visualAssetFromBlob,
  visualEvidenceSummary,
  VISUAL_EVIDENCE_VERSION,
} from "@/lib/visual-evidence";
import {
  extractPdfVisuals,
  PDF_VISUAL_EXTRACTION_VERSION,
} from "@/lib/pdf-visual-extractor";
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
  EvidenceAsset,
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
  onIntegrateVisualAssets: (
    newAssets: EvidenceAsset[]
  ) => void;
  onPurgeEvidenceSources: (
    sources: string[]
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


function datasetsFromLibrary(
  records: EvidenceLibraryRecord[]
) {
  return dedupeDatasets(
    records.flatMap((record) =>
      record.datasets?.length
        ? record.datasets
        : record.dataset &&
            isDatasetAnalysisCurrent(record.dataset)
          ? [record.dataset]
          : []
    )
  );
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


function looksLikeExcel(file: Pick<File, "name" | "type">) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xlsm") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel.sheet.macroEnabled.12"
  );
}


function looksLikeGeoJson(file: Pick<File, "name" | "type">) {
  return (
    file.name.toLowerCase().endsWith(".geojson") ||
    file.type === "application/geo+json"
  );
}

function isStoredDatasetFile(record: EvidenceLibraryRecord) {
  return Boolean(
    record.fileName &&
      /\.(csv|xlsx|xlsm|geojson)$/i.test(record.fileName)
  );
}

function datasetRecordNeedsRefresh(record: EvidenceLibraryRecord) {
  if (!isStoredDatasetFile(record) || !record.fileBlob) {
    return false;
  }

  const title = record.title || "";
  const hasReplacementCharacters = /�/.test(title);
  const hasControlCharacters =
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(
      title
    );

  return (
    !record.dataset ||
    !isDatasetAnalysisCurrent(record.dataset) ||
    hasReplacementCharacters ||
    hasControlCharacters
  );
}

function replaceAnalysisTag(tags: string[] = []) {
  return [
    ...tags.filter((tag) => !tag.startsWith("analysis:")),
    `analysis:${DATASET_ANALYSIS_VERSION}`,
  ];
}

export function EvidenceIntelligenceLab({
  topic,
  question,
  evidence,
  datasets,
  scout,
  onIntegrate,
  onIntegrateVisualAssets,
  onPurgeEvidenceSources,
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
  const [pdfVisualBusyId, setPdfVisualBusyId] = useState<string | null>(null);
  const [pdfVisualStatus, setPdfVisualStatus] = useState("");

  const questionCandidates = useMemo(
    () => scout?.questions || [],
    [scout]
  );

  async function refreshLibrary() {
    const next = await listEvidenceLibrary();
    setLibrary(next);
    return next;
  }


  async function refreshStoredDatasets(
    records: EvidenceLibraryRecord[]
  ) {
    const refreshed: EvidenceLibraryRecord[] = [];
    const refreshedEvidence: EvidenceItem[] = [];
    const refreshedDatasets: DatasetAnalysis[] = [];

    for (const record of records) {
      if (
        !datasetRecordNeedsRefresh(record) ||
        !record.fileBlob ||
        !record.fileName
      ) {
        refreshed.push(record);

        if (record.sourceType === "dataset") {
          refreshedEvidence.push(...(record.evidence || []));

          if (record.datasets?.length) {
            refreshedDatasets.push(...record.datasets);
          } else if (
            record.dataset &&
            isDatasetAnalysisCurrent(record.dataset)
          ) {
            refreshedDatasets.push(record.dataset);
          }
        }

        continue;
      }

      try {
        const lowerName = record.fileName.toLowerCase();
        const excel =
          lowerName.endsWith(".xlsx") ||
          lowerName.endsWith(".xlsm");

        let parsedDatasets: DatasetAnalysis[] = [];
        let primaryDataset: DatasetAnalysis | undefined;
        let extractedText = record.extractedText || "";
        let title = record.title;
        let summary = record.summary;

        const geoJson =
          lowerName.endsWith(".geojson");

        if (excel) {
          const workbook = await analyzeXlsx(
            record.fileBlob,
            record.fileName
          );

          parsedDatasets = workbook.datasets;
          primaryDataset = workbook.primaryDataset;
          extractedText = workbook.extractedText;
          title = workbook.title;
          summary = `${workbook.datasets.length} chartable dataset${
            workbook.datasets.length === 1 ? "" : "s"
          } refreshed from ${workbook.sheetNames.length} readable Excel sheet${
            workbook.sheetNames.length === 1 ? "" : "s"
          } using ${DATASET_ANALYSIS_VERSION}.`;
        } else if (geoJson) {
          const geoText = await record.fileBlob.text();
          const map = analyzeGeoJson(
            geoText,
            record.fileName
          );
          const analysis: DatasetAnalysis = {
            name: record.fileName,
            rowCount:
              map.points.length +
              (map.layers?.length || 0),
            columns: [],
            numericColumns: [],
            dateColumns: [],
            recommendedMap: map,
            insight: `The GeoJSON contains ${map.points.length} mapped points and ${map.layers?.length || 0} vector layers.`,
            analysisVersion:
              DATASET_ANALYSIS_VERSION,
            sourceKind: "geojson",
            sourceText:
              geoText.length <= 250_000
                ? geoText
                : undefined,
          };

          parsedDatasets = [analysis];
          primaryDataset = analysis;
          extractedText = geoText.slice(0, 120_000);
          title = record.fileName
            .replace(/\.geojson$/i, "")
            .replace(/[_-]+/g, " ");
          summary = `GeoJSON re-analysed using ${DATASET_ANALYSIS_VERSION}.`;
        } else {
          const csvText = await record.fileBlob.text();
          const analysis = analyzeCsv(
            csvText,
            record.fileName
          );

          parsedDatasets = [analysis];
          primaryDataset = analysis;
          extractedText = csvText.slice(0, 120_000);
          title = record.fileName
            .replace(/\.csv$/i, "")
            .replace(/[_-]+/g, " ");
          summary = `CSV re-analysed using ${DATASET_ANALYSIS_VERSION}.`;
        }

        const datasetEvidence = parsedDatasets.flatMap(
          (item) =>
            item.insight
              ? [
                  {
                    id: crypto.randomUUID(),
                    kind: "observed" as const,
                    statement: item.insight,
                    source: `library:${record.id}`,
                    sourceLabel: `${record.fileName} · ${item.name}`,
                    sourceType: "dataset" as const,
                  },
                ]
              : []
        );

        const updated = mergeLibraryRecord(record, {
          id: record.id,
          title,
          sourceType: "dataset",
          status: "ingested",
          summary,
          extractedText,
          evidence: datasetEvidence,
          dataset: primaryDataset,
          datasets: parsedDatasets,
          tags: replaceAnalysisTag([
            ...(record.tags || []),
            "dataset",
            ...(excel
              ? ["spreadsheet", "xlsx"]
              : ["csv"]),
            "auto-refreshed",
          ]),
        });

        await saveEvidenceLibraryRecord(updated);
        refreshed.push(updated);
        refreshedEvidence.push(...datasetEvidence);
        refreshedDatasets.push(...parsedDatasets);
      } catch (datasetError) {
        console.warn(
          `Unable to refresh stored dataset ${record.fileName}:`,
          datasetError
        );
        refreshed.push(record);
      }
    }

    if (refreshedEvidence.length || refreshedDatasets.length) {
      onIntegrate(
        dedupeEvidence(refreshedEvidence),
        dedupeDatasets(refreshedDatasets)
      );
    }

    return refreshed.sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }


  async function refreshStoredVisualAssets(
    records: EvidenceLibraryRecord[]
  ) {
    const refreshed: EvidenceLibraryRecord[] = [];
    const assets: EvidenceAsset[] = [];
    const purgeSources: string[] = [];

    for (const record of records) {
      if (
        !isNativeImageRecord(record) ||
        !record.fileBlob ||
        !record.fileName
      ) {
        refreshed.push(record);
        continue;
      }

      try {
        const needsRepair =
          !record.visualAsset ||
          record.visualAsset.visualEvidenceVersion !==
            VISUAL_EVIDENCE_VERSION ||
          Boolean(record.evidence?.length) ||
          looksLikeBinaryGarbage(record.extractedText) ||
          looksLikeBinaryGarbage(record.title);

        if (!needsRepair && record.visualAsset) {
          refreshed.push(record);
          assets.push(record.visualAsset);
          continue;
        }

        const asset = await visualAssetFromBlob({
          blob: record.fileBlob,
          fileName: record.fileName,
          id: record.visualAsset?.id || record.id,
          sourceLabel: record.fileName,
          sourceType: "field",
        });

        if (
          record.evidence?.length ||
          looksLikeBinaryGarbage(record.extractedText) ||
          looksLikeBinaryGarbage(record.title)
        ) {
          purgeSources.push(`library:${record.id}`);
        }

        const updated = mergeLibraryRecord(record, {
          id: record.id,
          title: cleanVisualTitle(record.fileName),
          sourceType: "field",
          status: "ingested",
          summary: visualEvidenceSummary(record.fileName),
          extractedText: "",
          evidence: [],
          dataset: undefined,
          datasets: undefined,
          visualAsset: asset,
          tags: Array.from(
            new Set([
              ...(record.tags || []).filter(
                (tag) =>
                  tag !== "paper" &&
                  tag !== "report" &&
                  !tag.startsWith("analysis:")
              ),
              "local",
              "visual-evidence",
              "image",
              `visual:${VISUAL_EVIDENCE_VERSION}`,
              "auto-repaired",
            ])
          ),
        });

        await saveEvidenceLibraryRecord(updated);
        refreshed.push(updated);
        assets.push(asset);
      } catch (visualError) {
        console.warn(
          `Unable to refresh stored image ${record.fileName}:`,
          visualError
        );
        refreshed.push(record);
      }
    }

    if (assets.length) {
      onIntegrateVisualAssets(assets);
    }

    if (purgeSources.length) {
      onPurgeEvidenceSources(
        Array.from(new Set(purgeSources))
      );
    }

    return refreshed.sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  async function refreshLibraryAssets(
    records: EvidenceLibraryRecord[]
  ) {
    const datasetRefreshed =
      await refreshStoredDatasets(records);
    return refreshStoredVisualAssets(datasetRefreshed);
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
      const listed = await listEvidenceLibrary();
      const records = await refreshLibraryAssets(listed);
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
        datasets: dedupeDatasets([
          ...datasets,
          ...datasetsFromLibrary(records),
        ]),
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
        const listed = await listEvidenceLibrary();
        const records = await refreshLibraryAssets(listed);
        if (!live) return;

        setLibrary(records);
        setReport(
          buildEvidenceIntelligence({
            topic,
            question,
            evidence,
            datasets: dedupeDatasets([
              ...datasets,
              ...datasetsFromLibrary(records),
            ]),
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
        for (const source of scout.sources) {
          const existing = await getEvidenceLibraryRecord(
            source.id
          );
          if (existing) continue;
          await saveEvidenceLibraryRecord(
            scoutSourceToLibraryRecord(source)
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
            datasets: dedupeDatasets([
              ...datasets,
              ...datasetsFromLibrary(records),
            ]),
            library: records,
            questionCandidates: scout.questions,
          })
        );
      } catch (err: any) {
        if (live) {
          setError(
            err?.message ||
              "Unable to save Evidence Scout results to the library."
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
        evidence: data.evidence,
        dataset: data.dataset,
        fileBlob: blob,
        url: source.url,
        downloadUrl: source.downloadUrl,
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
        } catch {
          failed += 1;
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
            ? ` · ${failed} could not be ingested`
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

  async function extractAndStorePdfVisuals(
    record: EvidenceLibraryRecord,
    options: { quiet?: boolean } = {}
  ) {
    if (
      !record.fileBlob ||
      !record.fileName ||
      !(
        record.mimeType === "application/pdf" ||
        record.fileName.toLowerCase().endsWith(".pdf")
      )
    ) {
      if (!options.quiet) {
        setError("This library item does not contain a stored PDF.");
      }
      return [];
    }

    setPdfVisualBusyId(record.id);
    setPdfVisualStatus(
      `Scanning ${record.fileName} for figures, maps, charts and plates…`
    );

    try {
      const visuals = await extractPdfVisuals({
        blob: record.fileBlob,
        fileName: record.fileName,
        maxVisuals: 32,
        maxPages: 160,
        onProgress: setPdfVisualStatus,
      });

      if (!visuals.length) {
        setPdfVisualStatus(
          `No explicit Plate, Figure, Map or Chart captions were detected in ${record.fileName}.`
        );
        return [];
      }

      const now = new Date().toISOString();

      for (const visual of visuals) {
        const extractedRecord: EvidenceLibraryRecord = {
          id: visual.id,
          createdAt: now,
          updatedAt: now,
          title: visual.caption,
          provider: "PDF Visual Extraction",
          sourceType: "field",
          status: "ingested",
          origin: "extracted",
          tags: [
            "visual-evidence",
            "pdf-extracted",
            visual.kind,
            `parent:${record.id}`,
            `page:${visual.pageNumber}`,
            `pdf-visual:${PDF_VISUAL_EXTRACTION_VERSION}`,
          ],
          fileName: visual.fileName,
          mimeType: visual.mimeType,
          byteLength: visual.blob.size,
          extractedText: "",
          summary:
            `${visual.label} extracted from ${record.fileName}, page ${visual.pageNumber}. ` +
            `Crop confidence ${Math.round(visual.cropConfidence * 100)}%. ` +
            "The original PDF remains the provenance source.",
          evidence: [],
          visualAsset: visual.asset,
          fileBlob: visual.blob,
        };

        await saveEvidenceLibraryRecord(extractedRecord);
      }

      onIntegrateVisualAssets(
        visuals.map((visual) => visual.asset)
      );

      const records = await refreshLibrary();
      setLibrary(records);
      reanalyze(records);

      setPdfVisualStatus(
        `✓ Extracted ${visuals.length} PDF visual${visuals.length === 1 ? "" : "s"} from ${record.fileName}. They are now persistent visual evidence and available to Story & Video.`
      );

      return visuals;
    } catch (err: any) {
      const message =
        err?.message ||
        "PDF visual extraction failed.";

      setError(message);
      setPdfVisualStatus("");
      return [];
    } finally {
      setPdfVisualBusyId(null);
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
      let importedDatasets: DatasetAnalysis[] = [];
      let extractedText = "";
      let summary: string | undefined;
      let title = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ");

      const isCsv =
        file.name.toLowerCase().endsWith(".csv") ||
        file.type === "text/csv";
      const isImage = isNativeImageFile(file);
      let visualAsset: EvidenceAsset | undefined;

      if (isImage) {
        visualAsset = await visualAssetFromBlob({
          blob: file,
          fileName: file.name,
          id,
          sourceLabel: file.name,
          sourceType: "field",
        });

        title = cleanVisualTitle(file.name);
        extractedText = "";
        summary = visualEvidenceSummary(file.name);
        newEvidence = [];
        dataset = undefined;
        importedDatasets = [];
      } else if (isCsv) {
        extractedText = await file.text();
        dataset = analyzeCsv(extractedText, file.name);
        importedDatasets = [dataset];

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
      } else if (looksLikeGeoJson(file)) {
        extractedText = await file.text();
        const map = analyzeGeoJson(
          extractedText,
          file.name
        );

        dataset = {
          name: file.name,
          rowCount:
            map.points.length +
            (map.layers?.length || 0),
          columns: [],
          numericColumns: [],
          dateColumns: [],
          recommendedMap: map,
          insight: `The GeoJSON contains ${map.points.length} mapped points and ${map.layers?.length || 0} vector layers.`,
          analysisVersion:
            DATASET_ANALYSIS_VERSION,
          sourceKind: "geojson",
          sourceText:
            extractedText.length <= 250_000
              ? extractedText
              : undefined,
        };
        importedDatasets = [dataset];

        newEvidence = [
          {
            id: crypto.randomUUID(),
            kind: "observed",
            statement: dataset.insight!,
            source: `library:${id}`,
            sourceLabel: file.name,
            sourceType: "dataset",
          },
        ];
      } else if (looksLikeExcel(file)) {
        const workbook = await analyzeXlsx(file, file.name);

        title = workbook.title;
        extractedText = workbook.extractedText;
        dataset = workbook.primaryDataset;
        importedDatasets = workbook.datasets;
        summary = `${workbook.datasets.length} tabular sheet${
          workbook.datasets.length === 1 ? "" : "s"
        } parsed from ${workbook.sheetNames.length} readable workbook sheet${
          workbook.sheetNames.length === 1 ? "" : "s"
        }.`;

        newEvidence = workbook.datasets.flatMap((item) =>
          item.insight
            ? [
                {
                  id: crypto.randomUUID(),
                  kind: "observed" as const,
                  statement: item.insight,
                  source: `library:${id}`,
                  sourceLabel: `${file.name} · ${item.name}`,
                  sourceType: "dataset" as const,
                },
              ]
            : []
        );
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
        sourceType:
          visualAsset
            ? "field"
            : dataset || importedDatasets.length
              ? "dataset"
              : localType,
        status: "ingested",
        origin: "upload",
        tags: [
          "local",
          visualAsset
            ? "visual-evidence"
            : dataset || importedDatasets.length
              ? "dataset"
              : localType,
          ...(visualAsset
            ? [
                "image",
                `visual:${VISUAL_EVIDENCE_VERSION}`,
              ]
            : []),
          ...(dataset || importedDatasets.length
            ? [`analysis:${DATASET_ANALYSIS_VERSION}`]
            : []),
          ...(looksLikeExcel(file)
            ? ["spreadsheet", "xlsx"]
            : looksLikeGeoJson(file)
              ? ["geojson", "map-layer"]
              : []),
        ],
        fileName: file.name,
        mimeType:
          file.type ||
          (looksLikeExcel(file)
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : dataset
              ? "text/csv"
              : "application/octet-stream"),
        byteLength: file.size,
        extractedText: extractedText.slice(0, 120_000),
        summary,
        evidence: newEvidence,
        dataset,
        datasets: importedDatasets.length
          ? importedDatasets
          : dataset
            ? [dataset]
            : undefined,
        visualAsset,
        fileBlob: file,
      };

      await saveEvidenceLibraryRecord(record);

      /*
       * PDF visual extraction is automatic for locally uploaded papers/reports.
       * It is asynchronous from text ingestion but completes before the import
       * busy state clears so the user immediately sees the extracted visuals.
       */
      const isPdf =
        record.mimeType === "application/pdf" ||
        record.fileName?.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        await extractAndStorePdfVisuals(record, {
          quiet: true,
        });
      }

      onIntegrate(
        newEvidence,
        importedDatasets.length
          ? importedDatasets
          : dataset
            ? [dataset]
            : []
      );

      if (visualAsset) {
        onIntegrateVisualAssets([visualAsset]);
      }

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
        {pdfVisualStatus && (
          <Notice>{pdfVisualStatus}</Notice>
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
                : "Add local PDF, TXT, Markdown, CSV, Excel, GeoJSON or image evidence to the persistent library"}
            </strong>
            <span>
              The original file is retained as a browser Blob.
            </span>
            <input
              type="file"
              accept=".pdf,.txt,.md,.csv,.xlsx,.xlsm,.geojson,.jpg,.jpeg,.png,.webp,.gif,text/plain,text/csv,image/jpeg,image/png,image/webp,image/gif,application/pdf,application/geo+json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
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
                      {record.visualAsset
                        ? record.tags.includes("pdf-extracted")
                          ? `PDF visual · ${record.tags.find((tag) => tag.startsWith("page:"))?.replace("page:", "page ") || "page provenance"}`
                          : "visual evidence"
                        : record.dataset
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

                    {record.fileBlob &&
                      (record.mimeType === "application/pdf" ||
                        record.fileName?.toLowerCase().endsWith(".pdf")) && (
                        <button
                          type="button"
                          className="button"
                          disabled={pdfVisualBusyId === record.id}
                          onClick={() =>
                            extractAndStorePdfVisuals(record)
                          }
                        >
                          {pdfVisualBusyId === record.id ? (
                            <LoaderCircle size={14} />
                          ) : (
                            <FileSearch size={14} />
                          )}{" "}
                          {pdfVisualBusyId === record.id
                            ? "Extracting PDF visuals…"
                            : "Extract figures / maps / plates"}
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
