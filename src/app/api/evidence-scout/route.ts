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
import {
  buildLockedSearchQuery,
  filterAndRescoreSources,
  filterEvidenceForStory,
  guardStoryQuestions,
} from "@/lib/research-relevance-guard";
import {
  buildResearchIntent,
  buildResearchQueries,
} from "@/lib/research-intent";
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

type WorldBankSearchResponse = {
  source?: Array<{
    id?: string;
    concept?: Array<{
      id?: string;
      variable?: Array<{
        id?: string;
        name?: string | null;
        metatype?: Array<{ id?: string; value?: string }>;
      }>;
    }>;
  }>;
};

type WorldBankIndicatorResponse = [
  Record<string, unknown>?,
  Array<{
    id?: string;
    name?: string;
    source?: { id?: string; value?: string };
    sourceNote?: string;
    sourceOrganization?: string;
    topics?: Array<{ id?: string; value?: string }>;
  }>?
];

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
  return /creativecommons\.org\/licenses|creativecommons\.org\/publicdomain|opensource\.org|apache\.org\/licenses|gnu\.org\/licenses/i.test(url);
}

function lexicalRelevance(query: string, text: string) {
  const queryTokens = new Set(tokenise(query));
  if (!queryTokens.size) return 0;

  const textTokens = new Set(tokenise(text));
  let matches = 0;

  queryTokens.forEach((token) => {
    if (textTokens.has(token)) matches += 1;
  });

  return Math.max(
    0,
    Math.min(100, Math.round((matches / queryTokens.size) * 100))
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(8_000, Math.max(750, seconds * 1000));
    }
  }

  return Math.min(6_000, 900 * Math.pow(2, attempt));
}

async function searchCrossref(
  query: string,
  limit: number
): Promise<EvidenceScoutSource[]> {
  const params = new URLSearchParams({
    "query.bibliographic": query,
    rows: String(Math.min(15, limit)),
  });

  const mailto = process.env.CROSSREF_MAILTO?.trim();
  if (mailto) params.set("mailto", mailto);

  let response: Response | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(
      `https://api.crossref.org/works?${params.toString()}`,
      {
        headers: {
          "user-agent": `Evidence-Studio/0.9${mailto ? ` (mailto:${mailto})` : ""}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      }
    );

    if (response.status !== 429) break;

    if (attempt < 2) {
      await sleep(retryDelayMs(response, attempt));
    }
  }

  if (!response || !response.ok) {
    throw new Error(
      `Crossref returned HTTP ${response?.status || "unknown"} after retry.`
    );
  }

  const data = await response.json();
  const items: CrossrefWork[] = Array.isArray(data?.message?.items)
    ? data.message.items
    : [];

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
        (/pdf/i.test(link["content-type"] || "") ||
          /\.pdf(?:$|\?)/i.test(link.URL || ""))
    )?.URL;

    const downloadable = Boolean(pdfLink && openLicense(license));
    const abstract = stripMarkup(work.abstract);
    const year = safeYear(work);
    const citations = work["is-referenced-by-count"] || 0;

    const relevance = lexicalRelevance(
      query,
      `${title} ${abstract || ""} ${work.publisher || ""}`
    );

    const authors = (work.author || [])
      .map((author) =>
        cleanText([author.given, author.family].filter(Boolean).join(" "))
      )
      .filter(Boolean)
      .slice(0, 8);

    const strength = Math.min(
      98,
      72 +
        (doi ? 7 : 0) +
        (abstract ? 5 : 0) +
        (citations > 10 ? 5 : 0) +
        (citations > 100 ? 4 : 0)
    );

    return [{
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
    }];
  });
}

function meaningfulWorldBankTerms(query: string) {
  const preferred = tokenise(query).filter((token) =>
    /^(flood|flooding|urban|drainage|rainfall|stormwater|climate|population|growth|land|infrastructure|risk|hazard|resilience|waste)$/.test(token)
  );

  const fallback = tokenise(query).filter(
    (token) => !/^(nairobi|kenya)$/.test(token)
  );

  return [...new Set(preferred.length ? preferred : fallback)].slice(0, 4);
}

function extractWorldBankCodes(data: WorldBankSearchResponse) {
  const codes: string[] = [];

  for (const source of data.source || []) {
    for (const concept of source.concept || []) {
      if (concept.id?.toLowerCase() !== "series") continue;

      for (const variable of concept.variable || []) {
        const code = cleanText(variable.id || "");
        if (!code) continue;
        if (!codes.includes(code)) codes.push(code);
      }
    }
  }

  return codes;
}

async function indicatorMetadata(code: string) {
  const response = await fetch(
    `https://api.worldbank.org/v2/indicator/${encodeURIComponent(code)}?format=json`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as WorldBankIndicatorResponse;
  const record = Array.isArray(data?.[1]) ? data[1]?.[0] : undefined;
  if (!record?.id || !record?.name) return null;

  return record;
}

async function searchWorldBank(
  query: string,
  limit: number
): Promise<EvidenceScoutSource[]> {
  const terms = meaningfulWorldBankTerms(query);
  if (!terms.length) return [];

  const searches = await Promise.allSettled(
    terms.map(async (term) => {
      const response = await fetch(
        `https://api.worldbank.org/v2/sources/2/search/${encodeURIComponent(term)}?format=json`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!response.ok) {
        throw new Error(`World Bank metadata search returned HTTP ${response.status}.`);
      }

      return (await response.json()) as WorldBankSearchResponse;
    })
  );

  const codes: string[] = [];

  for (const result of searches) {
    if (result.status !== "fulfilled") continue;

    for (const code of extractWorldBankCodes(result.value)) {
      if (!codes.includes(code)) codes.push(code);
      if (codes.length >= Math.min(20, Math.max(8, limit * 2))) break;
    }
  }

  const metadataResults = await Promise.allSettled(
    codes.map((code) => indicatorMetadata(code))
  );

  const candidates: EvidenceScoutSource[] = [];

  metadataResults.forEach((result, index) => {
    if (result.status !== "fulfilled" || !result.value) return;

    const record = result.value;
    const code = record.id || codes[index];
    const title = cleanText(record.name || "");
    if (!code || !title) return;

    const summary = stripMarkup(
      [
        record.sourceNote,
        record.sourceOrganization,
        ...(record.topics || []).map((item) => item.value || ""),
      ]
        .filter(Boolean)
        .join(" ")
    );

    const relevance = lexicalRelevance(
      query,
      `${title} ${summary || ""}`
    );

    candidates.push({
      id: `world-bank-${code}`,
      provider: "world_bank",
      sourceType: "dataset",
      title,
      publisher: "World Bank",
      url: `https://api.worldbank.org/v2/indicator/${encodeURIComponent(code)}?format=json`,
      downloadUrl: `https://api.worldbank.org/v2/country/all/indicator/${encodeURIComponent(code)}?source=2&downloadformat=csv&dataformat=list`,
      license: "World Bank data terms / CC BY 4.0 where indicated by source metadata",
      summary,
      access: "open_download",
      relevance,
      evidenceStrength: 94,
      visualPotential: 97,
      reason:
        "Official World Bank indicator discovered through the World Bank V2 metadata search API. Review indicator definition and geographic coverage before use.",
    });
  });

  return candidates
    .sort(
      (a, b) =>
        b.relevance * 0.7 +
          b.visualPotential * 0.15 +
          b.evidenceStrength * 0.15 -
        (a.relevance * 0.7 +
          a.visualPotential * 0.15 +
          a.evidenceStrength * 0.15)
    )
    .slice(0, limit);
}

function existingSources(
  evidence: EvidenceItem[],
  query: string
): EvidenceScoutSource[] {
  return evidence.flatMap((item, index) => {
    const source = cleanText(item.source || "");
    if (!source) return [];

    const isUrl = /^https?:\/\//i.test(source);
    const isDoi = /^10\.\d{4,9}\//i.test(source);

    if (!isUrl && !isDoi) return [];

    const url = isDoi ? `https://doi.org/${source}` : source;
    const title =
      cleanText(item.sourceLabel || item.statement).slice(0, 220) ||
      "Existing source";

    return [{
      id: `existing-${index}`,
      provider: "existing" as const,
      sourceType: item.sourceType || "other",
      title,
      year: item.year,
      url,
      access: "landing_page" as const,
      relevance: lexicalRelevance(
        query,
        `${title} ${item.statement}`
      ),
      evidenceStrength: item.kind === "observed" ? 80 : 64,
      visualPotential:
        item.sourceType === "dataset"
          ? 90
          : item.sourceType === "field"
            ? 88
            : 62,
      reason:
        "Already present in the Evidence Studio ledger; retained so the scout can compare new discoveries with existing sources.",
    }];
  });
}

function dedupeSources(sources: EvidenceScoutSource[]) {
  const byKey = new Map<string, EvidenceScoutSource>();

  for (const source of sources) {
    const key = (
      source.doi ||
      source.url ||
      source.title
    ).toLowerCase();

    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, source);
      continue;
    }

    // Keep the strongest metadata when the same source is found by multiple queries.
    byKey.set(key, {
      ...existing,
      ...source,
      relevance: Math.max(existing.relevance, source.relevance),
      evidenceStrength: Math.max(existing.evidenceStrength, source.evidenceStrength),
      visualPotential: Math.max(existing.visualPotential, source.visualPotential),
      downloadUrl: existing.downloadUrl || source.downloadUrl,
      license: existing.license || source.license,
      summary: existing.summary || source.summary,
      reason: `${existing.reason} Found across multiple story-focused searches.`,
    });
  }

  return [...byKey.values()];
}

function coverage(sources: EvidenceScoutSource[]): EvidenceCoverage {
  const scholarly = sources.filter(
    (source) => source.sourceType === "paper"
  ).length;

  const data = sources.filter(
    (source) => source.sourceType === "dataset"
  ).length;

  const providers = new Set(
    sources.map((source) => source.provider)
  );

  const open = sources.filter(
    (source) => source.access === "open_download"
  ).length;

  return {
    scholarly: Math.min(100, scholarly * 18),
    data: Math.min(100, data * 24),
    sourceDiversity: Math.min(100, providers.size * 34),
    openAccess: sources.length
      ? Math.round((open / sources.length) * 100)
      : 0,
  };
}

export async function POST(request: Request) {
  try {
    const parsed = BodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json(
        {
          error:
            "Evidence Scout received an invalid story/evidence payload.",
        },
        { status: 400 }
      );
    }

    const rawEvidence = parsed.data.evidence as EvidenceItem[];
    const datasets = parsed.data.datasets as DatasetAnalysis[];

    const evidence = filterEvidenceForStory({
      topic: parsed.data.topic,
      question: parsed.data.question,
      evidence: rawEvidence,
    });

    const intent = buildResearchIntent({
      topic: parsed.data.topic,
      question: parsed.data.question,
      evidence,
    });

    const generatedQueries = buildResearchQueries(intent);

    const fallbackQuery =
      buildLockedSearchQuery({
        topic: parsed.data.topic,
        question: parsed.data.question,
        evidence,
      }) ||
      buildScoutQuery({
        topic: parsed.data.topic,
        question: parsed.data.question,
        evidence,
      }) ||
      cleanText(parsed.data.question || parsed.data.topic) ||
      "evidence research";

    // A manual searchQuery remains a deliberate override. Otherwise use the layered set.
    const manualQuery = cleanText(parsed.data.searchQuery || "");
    const queries = manualQuery
      ? [manualQuery]
      : generatedQueries.length
        ? generatedQueries
        : [fallbackQuery];

    const query = queries.join(" | ");

    const discoveredQuestions = discoverQuestions({
      topic: parsed.data.topic,
      evidence,
      datasets,
    });

    const questions = guardStoryQuestions({
      topic: parsed.data.topic,
      question: parsed.data.question,
      questions: discoveredQuestions,
      evidence,
      datasets,
    });

    const providerErrors: string[] = [];
    const perQueryLimit = Math.max(
      4,
      Math.ceil(parsed.data.maxSources / Math.max(2, queries.length))
    );

    // Crossref is deliberately queried sequentially. Bursting several scholarly
    // searches in parallel can trigger HTTP 429 and silently starve the evidence pool.
    const crossrefResults: PromiseSettledResult<EvidenceScoutSource[]>[] = [];

    for (let index = 0; index < queries.length; index += 1) {
      if (index > 0) {
        await sleep(650);
      }

      try {
        const value = await searchCrossref(queries[index], perQueryLimit);
        crossrefResults.push({ status: "fulfilled", value });
      } catch (reason) {
        crossrefResults.push({ status: "rejected", reason });
      }
    }

    // World Bank can remain concurrent because only two low-volume metadata
    // searches are issued and its endpoint has not been the limiting provider.
    const worldBankResults = await Promise.allSettled(
      queries.slice(0, 2).map((candidateQuery) =>
        searchWorldBank(candidateQuery, perQueryLimit)
      )
    );

    const discovered: EvidenceScoutSource[] = [
      ...existingSources(evidence, queries[0] || fallbackQuery),
    ];

    crossrefResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        discovered.push(...result.value);
      } else {
        providerErrors.push(
          `Crossref [${queries[index]}]: ${
            result.reason?.message || "search failed"
          }`
        );
      }
    });

    worldBankResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        discovered.push(...result.value);
      } else {
        providerErrors.push(
          `World Bank [${queries[index]}]: ${
            result.reason?.message || "search failed"
          }`
        );
      }
    });

    const sources = filterAndRescoreSources({
      topic: parsed.data.topic,
      question: parsed.data.question,
      sources: dedupeSources(discovered),
    }).slice(0, parsed.data.maxSources);

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
      {
        error: error?.message || "Evidence Scout failed.",
      },
      { status: 500 }
    );
  }
}
