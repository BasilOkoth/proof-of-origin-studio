import { z } from "zod";

import {
  buildScoutQuery,
  cleanText,
  discoverQuestions,
  tokenise,
  type EvidenceCoverage,
  type EvidenceScoutResponse,
  type EvidenceScoutSource,
} from "@/lib/evidence-scout";
import type { DatasetAnalysis, EvidenceItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EvidenceSchema = z.object({
  id: z.string(),
  kind: z.enum(["observed", "inference", "limitation"]),
  statement: z.string(),
  source: z.string().optional(),
  sourceType: z
    .enum(["paper", "report", "dataset", "field", "web", "interview", "hps", "other"])
    .optional(),
  sourceLabel: z.string().optional(),
  sourcePage: z.number().optional(),
  year: z.number().optional(),
  value: z.number().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const BodySchema = z.object({
  topic: z.string().max(500).default(""),
  question: z.string().max(1200).default(""),
  searchQuery: z.string().max(1200).optional(),
  evidence: z.array(EvidenceSchema).max(150).default([]),
  datasets: z.array(z.any()).max(20).default([]),
  maxSources: z.number().int().min(4).max(30).default(18),
});

type CrossrefWork = {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string }[];
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  publisher?: string;
  URL?: string;
  type?: string;
  abstract?: string;
  license?: { URL?: string }[];
  link?: { URL?: string; "content-type"?: string; "intended-application"?: string }[];
  "is-referenced-by-count"?: number;
};

function safeYear(work: CrossrefWork) {
  return (
    work.published?.["date-parts"]?.[0]?.[0] ||
    work["published-online"]?.["date-parts"]?.[0]?.[0] ||
    work["published-print"]?.["date-parts"]?.[0]?.[0]
  );
}

function stripMarkup(value?: string) {
  if (!value) return undefined;
  const cleaned = cleanText(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
  if (!cleaned) return undefined;
  return cleaned.length > 520 ? `${cleaned.slice(0, 517)}…` : cleaned;
}

function openLicense(url?: string) {
  if (!url) return false;
  return /creativecommons\.org\/licenses|creativecommons\.org\/publicdomain|opensource\.org|apache\.org\/licenses|gnu\.org\/licenses/i.test(
    url
  );
}

function lexicalRelevance(query: string, text: string) {
  const queryTokens = new Set(tokenise(query));
  if (!queryTokens.size) return 60;
  const textTokens = new Set(tokenise(text));
  let matches = 0;
  queryTokens.forEach((token) => {
    if (textTokens.has(token)) matches += 1;
  });
  return Math.max(35, Math.min(100, Math.round(45 + (matches / queryTokens.size) * 55)));
}

async function searchCrossref(query: string, limit: number): Promise<EvidenceScoutSource[]> {
  const params = new URLSearchParams({
    "query.bibliographic": query,
    rows: String(Math.min(15, limit)),
  });

  const mailto = process.env.CROSSREF_MAILTO?.trim();
  if (mailto) params.set("mailto", mailto);

  const response = await fetch(`https://api.crossref.org/works?${params.toString()}`, {
    headers: {
      "user-agent": `Evidence-Studio/0.5${mailto ? ` (mailto:${mailto})` : ""}`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Crossref returned HTTP ${response.status}.`);
  const data = await response.json();
  const items: CrossrefWork[] = Array.isArray(data?.message?.items) ? data.message.items : [];

  return items.flatMap((work, index) => {
    const title = cleanText(work.title?.[0] || "");
    if (!title) return [];

    const doi = cleanText(work.DOI || "") || undefined;
    const landing = work.URL || (doi ? `https://doi.org/${doi}` : "");
    if (!landing) return [];

    const license = work.license?.map((item) => item.URL).find(Boolean);
    const candidateLinks = work.link || [];
    const pdfLink = candidateLinks.find(
      (link) =>
        Boolean(link.URL) &&
        (/pdf/i.test(link["content-type"] || "") || /\.pdf(?:$|\?)/i.test(link.URL || ""))
    )?.URL;
    const downloadable = Boolean(pdfLink && openLicense(license));
    const abstract = stripMarkup(work.abstract);
    const year = safeYear(work);
    const citations = work["is-referenced-by-count"] || 0;
    const relevance = lexicalRelevance(query, `${title} ${abstract || ""} ${work.publisher || ""}`);

    const authors = (work.author || [])
      .map((author) => cleanText([author.given, author.family].filter(Boolean).join(" ")))
      .filter(Boolean)
      .slice(0, 8);

    const strength = Math.min(
      98,
      72 + (doi ? 7 : 0) + (abstract ? 5 : 0) + (citations > 10 ? 5 : 0) + (citations > 100 ? 4 : 0)
    );

    return [
      {
        id: `crossref-${doi || index}`,
        provider: "crossref" as const,
        sourceType: work.type === "report" ? ("report" as const) : ("paper" as const),
        title,
        authors,
        year,
        publisher: work.publisher,
        doi,
        url: landing,
        downloadUrl: downloadable ? pdfLink : undefined,
        license,
        summary: abstract,
        access: downloadable ? ("open_download" as const) : ("landing_page" as const),
        relevance,
        evidenceStrength: strength,
        visualPotential: abstract ? 68 : 58,
        reason: downloadable
          ? "Scholarly source with DOI metadata and an openly licensed full-text link reported by Crossref."
          : "Scholarly source discovered through Crossref. Review the landing page/full text before using substantive findings.",
      },
    ];
  });
}

function data360Rows(data: any): any[] {
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data?.value)) return data.data.value;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function field(row: any, name: string) {
  return (
    row?.series_description?.[name] ??
    row?.[`series_description/${name}`] ??
    row?.[name] ??
    row?.document?.series_description?.[name]
  );
}

function wdiCode(id?: string) {
  if (!id?.startsWith("WB_WDI_")) return undefined;
  return id.slice("WB_WDI_".length).replace(/_/g, ".");
}

async function searchWorldBank(query: string, limit: number): Promise<EvidenceScoutSource[]> {
  const response = await fetch("https://data360api.worldbank.org/data360/searchv2", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      count: true,
      select: "series_description/idno, series_description/name, series_description/database_id",
      search: query,
      top: Math.min(12, limit),
      skip: 0,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`World Bank Data360 returned HTTP ${response.status}.`);
  const data = await response.json();
  const rows = data360Rows(data);

  return rows.flatMap((row, index) => {
    const id = cleanText(String(field(row, "idno") || ""));
    const title = cleanText(String(field(row, "name") || ""));
    if (!id || !title) return [];

    const databaseId = cleanText(String(field(row, "database_id") || ""));
    const description = stripMarkup(String(field(row, "description") || ""));
    const code = wdiCode(id);
    const metadataUrl = code
      ? `https://api.worldbank.org/v2/indicator/${encodeURIComponent(code)}?format=json`
      : "https://data360.worldbank.org/";
    const downloadUrl = code
      ? `https://api.worldbank.org/v2/country/all/indicator/${encodeURIComponent(
          code
        )}?source=2&downloadformat=csv&dataformat=list`
      : undefined;

    return [
      {
        id: `world-bank-${id || index}`,
        provider: "world_bank" as const,
        sourceType: "dataset" as const,
        title,
        publisher: "World Bank",
        url: metadataUrl,
        downloadUrl,
        license: "CC BY 4.0 (Data360 platform metadata/API)",
        summary: description,
        access: downloadUrl ? ("open_download" as const) : ("landing_page" as const),
        relevance: lexicalRelevance(query, `${title} ${description || ""} ${databaseId}`),
        evidenceStrength: databaseId === "WB_WDI" ? 94 : 90,
        visualPotential: 97,
        reason: downloadUrl
          ? "Official World Bank indicator with a direct machine-readable CSV download path."
          : "World Bank Data360 indicator metadata relevant to the search; inspect the dataset before using it in the story.",
      },
    ];
  });
}

function existingSources(evidence: EvidenceItem[], query: string): EvidenceScoutSource[] {
  return evidence.flatMap((item, index) => {
    const source = cleanText(item.source || "");
    if (!source) return [];
    const isUrl = /^https?:\/\//i.test(source);
    const isDoi = /^10\.\d{4,9}\//i.test(source);
    if (!isUrl && !isDoi) return [];
    const url = isDoi ? `https://doi.org/${source}` : source;
    const title = cleanText(item.sourceLabel || item.statement).slice(0, 220) || "Existing source";
    return [
      {
        id: `existing-${index}`,
        provider: "existing" as const,
        sourceType: item.sourceType || "other",
        title,
        year: item.year,
        url,
        access: "landing_page" as const,
        relevance: lexicalRelevance(query, `${title} ${item.statement}`),
        evidenceStrength: item.kind === "observed" ? 80 : 64,
        visualPotential: item.sourceType === "dataset" ? 90 : item.sourceType === "field" ? 88 : 62,
        reason: "Already present in the Evidence Studio ledger; retained so the scout can compare new discoveries with existing sources.",
      },
    ];
  });
}

function dedupeSources(sources: EvidenceScoutSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = (source.doi || source.url || source.title).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function coverage(sources: EvidenceScoutSource[]): EvidenceCoverage {
  const scholarly = sources.filter((source) => source.sourceType === "paper").length;
  const data = sources.filter((source) => source.sourceType === "dataset").length;
  const providers = new Set(sources.map((source) => source.provider));
  const open = sources.filter((source) => source.access === "open_download").length;
  return {
    scholarly: Math.min(100, scholarly * 18),
    data: Math.min(100, data * 24),
    sourceDiversity: Math.min(100, providers.size * 34),
    openAccess: sources.length ? Math.round((open / sources.length) * 100) : 0,
  };
}

export async function POST(request: Request) {
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Evidence Scout received an invalid story/evidence payload." }, { status: 400 });
    }

    const evidence = parsed.data.evidence as EvidenceItem[];
    const datasets = parsed.data.datasets as DatasetAnalysis[];
    const query =
      cleanText(parsed.data.searchQuery || "") ||
      buildScoutQuery({ topic: parsed.data.topic, question: parsed.data.question, evidence }) ||
      cleanText(parsed.data.question || parsed.data.topic) ||
      "evidence research";

    const questions = discoverQuestions({
      topic: parsed.data.topic,
      evidence,
      datasets,
    });

    const providerErrors: string[] = [];
    const perProvider = Math.max(4, Math.ceil(parsed.data.maxSources / 2));

    const [crossrefResult, worldBankResult] = await Promise.allSettled([
      searchCrossref(query, perProvider),
      searchWorldBank(query, perProvider),
    ]);

    const discovered: EvidenceScoutSource[] = [...existingSources(evidence, query)];
    if (crossrefResult.status === "fulfilled") discovered.push(...crossrefResult.value);
    else providerErrors.push(`Crossref: ${crossrefResult.reason?.message || "search failed"}`);

    if (worldBankResult.status === "fulfilled") discovered.push(...worldBankResult.value);
    else providerErrors.push(`World Bank Data360: ${worldBankResult.reason?.message || "search failed"}`);

    const sources = dedupeSources(discovered)
      .sort(
        (a, b) =>
          b.relevance * 0.5 + b.evidenceStrength * 0.35 + b.visualPotential * 0.15 -
          (a.relevance * 0.5 + a.evidenceStrength * 0.35 + a.visualPotential * 0.15)
      )
      .slice(0, parsed.data.maxSources);

    const result: EvidenceScoutResponse = {
      query,
      searchedAt: new Date().toISOString(),
      questions,
      sources,
      coverage: coverage(sources),
      providerErrors,
    };

    return Response.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Evidence Scout failed." },
      { status: 500 }
    );
  }
}
