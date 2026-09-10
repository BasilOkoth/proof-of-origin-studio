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

type AcquisitionSource = EvidenceScoutSource & {
  downloadCandidates?: string[];
  verifiedDownload?: boolean;
  mechanismScore?: number;
  acquisitionScore?: number;
};

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
  link?: {
    URL?: string;
    "content-type"?: string;
    "intended-application"?: string;
  }[];
  "is-referenced-by-count"?: number;
};

type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  license?: string | null;
  is_oa?: boolean | null;
  source?: {
    display_name?: string | null;
    host_organization_name?: string | null;
    type?: string | null;
  } | null;
};

type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  type?: string | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
  }>;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  locations?: OpenAlexLocation[] | null;
  open_access?: {
    is_oa?: boolean;
    oa_status?: string | null;
    oa_url?: string | null;
  } | null;
};

type OpenAlexResponse = {
  results?: OpenAlexWork[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
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

function lexicalRelevance(query: string, text: string) {
  const queryTokens = new Set(tokenise(query));
  if (!queryTokens.size) return 0;

  const textTokens = new Set(tokenise(text));
  let matches = 0;

  queryTokens.forEach((token) => {
    if (textTokens.has(token)) matches += 1;
  });

  return clamp((matches / queryTokens.size) * 100);
}

function openAlexAbstract(index?: Record<string, number[]> | null) {
  if (!index) return undefined;

  const pairs: Array<[number, string]> = [];

  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions || []) {
      pairs.push([position, word]);
    }
  }

  if (!pairs.length) return undefined;

  pairs.sort((a, b) => a[0] - b[0]);
  const text = cleanText(pairs.map(([, word]) => word).join(" "));

  return text.length > 520 ? `${text.slice(0, 517)}…` : text;
}

function normalizedDoi(value?: string | null) {
  if (!value) return undefined;
  return value.replace(/^https?:\/\/doi\.org\//i, "").trim() || undefined;
}

function openAlexLicense(location?: OpenAlexLocation | null) {
  const raw = cleanText(location?.license || "");
  if (!raw) return undefined;

  const labels: Record<string, string> = {
    cc0: "CC0",
    "cc-by": "CC BY",
    "cc-by-sa": "CC BY-SA",
    "cc-by-nc": "CC BY-NC",
    "cc-by-nd": "CC BY-ND",
    "cc-by-nc-sa": "CC BY-NC-SA",
    "cc-by-nc-nd": "CC BY-NC-ND",
  };

  return labels[raw.toLowerCase()] || raw;
}

function openLicense(url?: string) {
  if (!url) return false;

  return /creativecommons\.org\/licenses|creativecommons\.org\/publicdomain|opensource\.org|apache\.org\/licenses|gnu\.org\/licenses/i.test(
    url
  );
}

function uniqueUrls(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    if (!raw) continue;

    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") continue;

      const value = url.toString();
      if (seen.has(value)) continue;

      seen.add(value);
      output.push(value);
    } catch {
      // Ignore malformed provider URLs.
    }
  }

  return output;
}

function allOpenAlexLocations(work: OpenAlexWork) {
  const locations = [
    work.best_oa_location,
    work.primary_location,
    ...(work.locations || []),
  ].filter(Boolean) as OpenAlexLocation[];

  const byKey = new Map<string, OpenAlexLocation>();

  for (const location of locations) {
    const key =
      location.pdf_url ||
      location.landing_page_url ||
      `${location.source?.display_name || ""}-${location.license || ""}`;

    if (!key || byKey.has(key)) continue;
    byKey.set(key, location);
  }

  return [...byKey.values()];
}

function openAlexSourceLabel(work: OpenAlexWork) {
  const locations = allOpenAlexLocations(work);
  const location =
    locations.find((item) => item.pdf_url) ||
    work.best_oa_location ||
    work.primary_location;

  return (
    cleanText(
      location?.source?.host_organization_name ||
        location?.source?.display_name ||
        ""
    ) || undefined
  );
}

function mechanismScore(source: EvidenceScoutSource) {
  const text = cleanText(
    `${source.title} ${source.summary || ""}`
  ).toLowerCase();

  const patterns = [
    /\bdrainage\b/,
    /\bstormwater\b/,
    /\brunoff\b/,
    /\briparian\b/,
    /\bfloodplain\b/,
    /\bencroach(?:ment|ed|ing)?\b/,
    /\burban(?:ization|isation| growth)?\b/,
    /\bland[- ]use\b/,
    /\bsettlement planning\b/,
    /\binformal settlement\b/,
    /\bimpervious\b/,
    /\bpermeab(?:le|ility)\b/,
    /\binfiltrat(?:e|ion)\b/,
    /\bblocked drains?\b/,
    /\bwaste accumulation\b/,
    /\bculvert\b/,
    /\bsewer\b/,
    /\bchannel\b/,
    /\briver\b/,
    /\bmaintenance\b/,
    /\bdrain capacity\b/,
    /\bflood modelling\b/,
    /\bflood modeling\b/,
    /\bheavy rainfall\b/,
    /\bmulti-day rainfall\b/,
  ];

  let score = 0;

  for (const pattern of patterns) {
    if (pattern.test(text)) score += 7;
  }

  if (/\bnairobi\b/.test(text)) score += 14;
  if (/\bflood(?:s|ing|ed)?\b/.test(text)) score += 10;

  return clamp(score);
}

function looksLikePdfHeader(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function textLooksLikeChallenge(bytes: Uint8Array) {
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 12_000))
    .toLowerCase();

  return (
    /<html|<!doctype|<script|<iframe/.test(sample) ||
    /\b(akamai|cloudflare|captcha|interstitial|access denied|verify you are human|security challenge|request blocked)\b/.test(
      sample
    )
  );
}

async function readProbeBytes(response: Response) {
  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < 12_000) {
      const { value, done } = await reader.read();
      if (done || !value) break;

      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Nothing to do.
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    const slice =
      offset + chunk.byteLength <= total
        ? chunk
        : chunk.slice(0, total - offset);

    merged.set(slice, offset);
    offset += slice.byteLength;

    if (offset >= total) break;
  }

  return merged;
}

async function probePdf(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "application/pdf,*/*;q=0.5",
        range: "bytes=0-11999",
        "user-agent":
          "Evidence-Studio-Scout/1.4 (+https://github.com/BasilOkoth/proof-of-origin-studio)",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok && response.status !== 206) {
      return {
        ok: false,
        reason: `HTTP ${response.status}`,
      };
    }

    const bytes = await readProbeBytes(response);

    if (looksLikePdfHeader(bytes)) {
      return {
        ok: true,
        finalUrl: response.url || url,
        reason: "verified PDF signature",
      };
    }

    if (textLooksLikeChallenge(bytes)) {
      return {
        ok: false,
        reason: "HTML/challenge response",
      };
    }

    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();

    return {
      ok: false,
      reason: contentType
        ? `not a verified PDF (${contentType})`
        : "not a verified PDF",
    };
  } catch (error: any) {
    return {
      ok: false,
      reason: error?.name === "TimeoutError"
        ? "verification timed out"
        : error?.message || "verification failed",
    };
  }
}


function safeHttpsUrl(value?: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";

    const host = url.hostname.toLowerCase();
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "127.0.0.1" ||
      host === "::1"
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function htmlPdfLinks(html: string, baseUrl: string) {
  const found: string[] = [];

  const hrefRegex = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null = null;

  while ((match = hrefRegex.exec(html))) {
    const href = match[1]?.trim();
    if (!href) continue;

    if (
      !/\.pdf(?:$|[?#])/i.test(href) &&
      !/\/pdf(?:$|[/?#])/i.test(href) &&
      !/article\/download/i.test(href) &&
      !/download[^"'<>]*pdf/i.test(href)
    ) {
      continue;
    }

    try {
      const url = new URL(href, baseUrl);
      const safe = safeHttpsUrl(url.toString());
      if (safe) found.push(safe);
    } catch {
      // Ignore malformed links.
    }
  }

  const metaRegex =
    /<meta[^>]+(?:name|property)\s*=\s*["'](?:citation_pdf_url|og:pdf|dc\.identifier)["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/gi;

  while ((match = metaRegex.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const url = new URL(raw, baseUrl);
      const safe = safeHttpsUrl(url.toString());
      if (safe) found.push(safe);
    } catch {
      // Ignore malformed metadata URLs.
    }
  }

  return uniqueUrls(found);
}

async function discoverPdfLinksFromLandingPage(url: string) {
  const safe = safeHttpsUrl(url);
  if (!safe) return [];

  try {
    const response = await fetch(safe, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.3",
        "user-agent":
          "Evidence-Studio-Scout/1.4 (+https://github.com/BasilOkoth/proof-of-origin-studio)",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) return [];

    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();

    if (
      !contentType.includes("html") &&
      !contentType.includes("xhtml") &&
      !contentType.includes("text/")
    ) {
      return [];
    }

    const html = (await response.text()).slice(0, 750_000);
    return htmlPdfLinks(html, response.url || safe).slice(0, 10);
  } catch {
    return [];
  }
}

type UnpaywallLocation = {
  url?: string | null;
  url_for_pdf?: string | null;
  url_for_landing_page?: string | null;
  host_type?: string | null;
  license?: string | null;
  version?: string | null;
};

type UnpaywallResponse = {
  doi?: string | null;
  is_oa?: boolean | null;
  best_oa_location?: UnpaywallLocation | null;
  first_oa_location?: UnpaywallLocation | null;
  oa_locations?: UnpaywallLocation[] | null;
};

async function unpaywallCandidates(doi?: string) {
  if (!doi) return [];

  const email =
    process.env.UNPAYWALL_EMAIL?.trim() ||
    process.env.OPENALEX_MAILTO?.trim() ||
    process.env.CROSSREF_MAILTO?.trim();

  // Unpaywall requires an email parameter. If none is configured, skip cleanly.
  if (!email) return [];

  try {
    const endpoint = new URL(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}`
    );
    endpoint.searchParams.set("email", email);

    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent":
          "Evidence-Studio-Scout/1.4 (+https://github.com/BasilOkoth/proof-of-origin-studio)",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as UnpaywallResponse;

    const locations = [
      data.best_oa_location,
      data.first_oa_location,
      ...(data.oa_locations || []),
    ].filter(Boolean) as UnpaywallLocation[];

    return uniqueUrls(
      locations.flatMap((location) => [
        location.url_for_pdf,
        location.url &&
        (/\.pdf(?:$|[?#])/i.test(location.url) ||
          /\/pdf(?:$|[/?#])/i.test(location.url) ||
          /article\/download/i.test(location.url))
          ? location.url
          : undefined,
      ])
    );
  } catch {
    return [];
  }
}

async function expandFullTextCandidates(
  source: AcquisitionSource
): Promise<AcquisitionSource> {
  if (source.sourceType !== "paper") return source;

  const doi = source.doi;
  const providerCandidates = uniqueUrls([
    ...(source.downloadCandidates || []),
    source.downloadUrl,
  ]);

  const [unpaywall, landingLinks, doiLinks] = await Promise.all([
    unpaywallCandidates(doi),
    discoverPdfLinksFromLandingPage(source.url),
    doi && source.url !== `https://doi.org/${doi}`
      ? discoverPdfLinksFromLandingPage(`https://doi.org/${doi}`)
      : Promise.resolve([]),
  ]);

  const expanded = uniqueUrls([
    ...providerCandidates,
    ...unpaywall,
    ...landingLinks,
    ...doiLinks,
  ]);

  if (!expanded.length) {
    return {
      ...source,
      downloadCandidates: [],
      downloadUrl: undefined,
      access: "landing_page",
      reason: `${source.reason} DOI/repository/publisher discovery found no direct PDF endpoint.`,
    };
  }

  const extras = expanded.length - providerCandidates.length;

  return {
    ...source,
    downloadCandidates: expanded,
    downloadUrl: expanded[0],
    access: "open_download",
    reason: `${source.reason} Full-text acquisition found ${expanded.length} candidate endpoint${
      expanded.length === 1 ? "" : "s"
    }${extras > 0 ? `, including ${extras} DOI/repository/publisher fallback${extras === 1 ? "" : "s"}` : ""}.`,
  };
}

async function searchOpenAlex(
  query: string,
  limit: number
): Promise<AcquisitionSource[]> {
  const params = new URLSearchParams({
    search: query,
    "per-page": String(Math.min(25, Math.max(5, limit))),
  });

  const mailto =
    process.env.OPENALEX_MAILTO?.trim() ||
    process.env.CROSSREF_MAILTO?.trim();

  if (mailto) params.set("mailto", mailto);

  let response: Response | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(
      `https://api.openalex.org/works?${params.toString()}`,
      {
        headers: {
          "user-agent": `Evidence-Studio/1.4${
            mailto ? ` (mailto:${mailto})` : ""
          }`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      }
    );

    if (response.status !== 429) break;

    if (attempt < 3) {
      await sleep(retryDelayMs(response, attempt));
    }
  }

  if (!response || !response.ok) {
    throw new Error(
      `OpenAlex returned HTTP ${response?.status || "unknown"} after retry.`
    );
  }

  const data = (await response.json()) as OpenAlexResponse;
  const works = Array.isArray(data.results) ? data.results : [];

  return works.flatMap((work, index) => {
    const title = cleanText(work.display_name || "");
    if (!title) return [];

    const doi = normalizedDoi(work.doi);
    const locations = allOpenAlexLocations(work);

    const pdfCandidates = uniqueUrls(
      locations.flatMap((location) => [
        location.pdf_url,
        location.landing_page_url &&
        /\.pdf(?:$|[?#])|\/pdf(?:$|[/?#])|article\/download/i.test(
          location.landing_page_url
        )
          ? location.landing_page_url
          : undefined,
      ])
    );

    const primaryLocation =
      locations.find((location) => location.pdf_url) ||
      work.best_oa_location ||
      work.primary_location;

    const landing =
      primaryLocation?.landing_page_url ||
      work.open_access?.oa_url ||
      work.doi ||
      work.id ||
      "";

    if (!landing) return [];

    const abstract = openAlexAbstract(work.abstract_inverted_index);
    const isOpen = Boolean(work.open_access?.is_oa);
    const license =
      openAlexLicense(primaryLocation) ||
      locations.map(openAlexLicense).find(Boolean);

    const relevance = lexicalRelevance(
      query,
      `${title} ${abstract || ""} ${openAlexSourceLabel(work) || ""}`
    );

    const authors = (work.authorships || [])
      .map((item) => cleanText(item.author?.display_name || ""))
      .filter(Boolean)
      .slice(0, 8);

    const citations = work.cited_by_count || 0;

    const strength = Math.min(
      98,
      74 +
        (doi ? 6 : 0) +
        (abstract ? 5 : 0) +
        (isOpen ? 4 : 0) +
        (citations > 10 ? 4 : 0) +
        (citations > 100 ? 3 : 0)
    );

    const source: AcquisitionSource = {
      id: `openalex-${(work.id || doi || index)
        .toString()
        .replace(/^https?:\/\/openalex\.org\//i, "")}`,
      provider: "openalex" as unknown as EvidenceScoutSource["provider"],
      sourceType:
        work.type === "report"
          ? ("report" as const)
          : ("paper" as const),
      title,
      authors,
      year: work.publication_year || undefined,
      publisher: openAlexSourceLabel(work),
      doi,
      url: landing,
      downloadUrl: pdfCandidates[0],
      downloadCandidates: pdfCandidates,
      license:
        license ||
        (isOpen
          ? `Open access (${work.open_access?.oa_status || "OA"})`
          : undefined),
      summary: abstract,
      access: pdfCandidates.length
        ? ("open_download" as const)
        : ("landing_page" as const),
      relevance,
      evidenceStrength: strength,
      visualPotential: abstract ? 70 : 60,
      reason: pdfCandidates.length
        ? `OpenAlex found ${pdfCandidates.length} potential full-text location${
            pdfCandidates.length === 1 ? "" : "s"
          }; download verification pending.`
        : "OpenAlex found the scholarly work but no direct full-text PDF location.",
    };

    source.mechanismScore = mechanismScore(source);
    return [source];
  });
}

async function searchCrossref(
  query: string,
  limit: number
): Promise<AcquisitionSource[]> {
  const params = new URLSearchParams({
    "query.bibliographic": query,
    rows: String(Math.min(15, Math.max(5, limit))),
  });

  const mailto = process.env.CROSSREF_MAILTO?.trim();
  if (mailto) params.set("mailto", mailto);

  let response: Response | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(
      `https://api.crossref.org/works?${params.toString()}`,
      {
        headers: {
          "user-agent": `Evidence-Studio/1.4${
            mailto ? ` (mailto:${mailto})` : ""
          }`,
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
    const landing =
      work.URL || (doi ? `https://doi.org/${doi}` : "");

    if (!landing) return [];

    const license = work.license
      ?.map((item) => item.URL)
      .find(Boolean);

    const pdfCandidates = uniqueUrls(
      (work.link || [])
        .filter(
          (link) =>
            Boolean(link.URL) &&
            (
              /pdf/i.test(link["content-type"] || "") ||
              /\.pdf(?:$|[?#])/i.test(link.URL || "") ||
              /article\/download/i.test(link.URL || "")
            )
        )
        .map((link) => link.URL)
    );

    const openlyLicensed = openLicense(license);
    const abstract = stripMarkup(work.abstract);
    const year = safeYear(work);
    const citations = work["is-referenced-by-count"] || 0;

    const relevance = lexicalRelevance(
      query,
      `${title} ${abstract || ""} ${work.publisher || ""}`
    );

    const authors = (work.author || [])
      .map((author) =>
        cleanText(
          [author.given, author.family].filter(Boolean).join(" ")
        )
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

    const source: AcquisitionSource = {
      id: `crossref-${doi || index}`,
      provider: "crossref",
      sourceType:
        work.type === "report"
          ? ("report" as const)
          : ("paper" as const),
      title,
      authors,
      year,
      publisher: work.publisher,
      doi,
      url: landing,
      downloadUrl:
        openlyLicensed && pdfCandidates.length
          ? pdfCandidates[0]
          : undefined,
      downloadCandidates:
        openlyLicensed ? pdfCandidates : [],
      license,
      summary: abstract,
      access:
        openlyLicensed && pdfCandidates.length
          ? ("open_download" as const)
          : ("landing_page" as const),
      relevance,
      evidenceStrength: strength,
      visualPotential: abstract ? 68 : 58,
      reason:
        openlyLicensed && pdfCandidates.length
          ? `Crossref reported ${pdfCandidates.length} openly licensed full-text location${
              pdfCandidates.length === 1 ? "" : "s"
            }; download verification pending.`
          : "Crossref found the scholarly source, but no verified openly licensed PDF is currently attached.",
    };

    source.mechanismScore = mechanismScore(source);
    return [source];
  });
}

function existingSources(
  evidence: EvidenceItem[],
  query: string
): AcquisitionSource[] {
  return evidence.flatMap((item, index) => {
    const source = cleanText(item.source || "");
    if (!source) return [];

    const isUrl = /^https?:\/\//i.test(source);
    const isDoi = /^10\.\d{4,9}\//i.test(source);

    if (!isUrl && !isDoi) return [];

    const url = isDoi
      ? `https://doi.org/${source}`
      : source;

    const title =
      cleanText(item.sourceLabel || item.statement).slice(0, 220) ||
      "Existing source";

    const record: AcquisitionSource = {
      id: `existing-${index}`,
      provider: "existing",
      sourceType: item.sourceType || "other",
      title,
      year: item.year,
      url,
      access: "landing_page",
      relevance: lexicalRelevance(
        query,
        `${title} ${item.statement}`
      ),
      evidenceStrength:
        item.kind === "observed" ? 80 : 64,
      visualPotential:
        item.sourceType === "dataset"
          ? 90
          : item.sourceType === "field"
            ? 88
            : 62,
      reason:
        "Already present in the Evidence Studio ledger; retained for comparison with new discoveries.",
    };

    record.mechanismScore = mechanismScore(record);
    return [record];
  });
}

function dedupeSources(
  sources: AcquisitionSource[]
): AcquisitionSource[] {
  const byKey = new Map<string, AcquisitionSource>();

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

    const providerRank = (provider: string) =>
      provider === "openalex"
        ? 4
        : provider === "crossref"
          ? 3
          : provider === "world_bank"
            ? 2
            : provider === "existing"
              ? 1
              : 0;

    const allCandidates = uniqueUrls([
      ...(existing.downloadCandidates || []),
      existing.downloadUrl,
      ...(source.downloadCandidates || []),
      source.downloadUrl,
    ]);

    const sourceWinsProvider =
      providerRank(String(source.provider)) >
      providerRank(String(existing.provider));

    const sourceWinsMechanism =
      (source.mechanismScore || 0) >
      (existing.mechanismScore || 0) + 10;

    const preferred =
      sourceWinsProvider || sourceWinsMechanism
        ? source
        : existing;

    const secondary =
      preferred === existing ? source : existing;

    byKey.set(key, {
      ...secondary,
      ...preferred,
      relevance: Math.max(
        existing.relevance,
        source.relevance
      ),
      evidenceStrength: Math.max(
        existing.evidenceStrength,
        source.evidenceStrength
      ),
      visualPotential: Math.max(
        existing.visualPotential,
        source.visualPotential
      ),
      mechanismScore: Math.max(
        existing.mechanismScore || 0,
        source.mechanismScore || 0
      ),
      downloadCandidates: allCandidates,
      downloadUrl: allCandidates[0],
      license:
        existing.license ||
        source.license,
      summary:
        existing.summary ||
        source.summary,
      reason: `${preferred.reason} Found across multiple story-focused searches/providers.`,
    });
  }

  return [...byKey.values()];
}

async function verifyAcquisitionSources(
  sources: AcquisitionSource[]
) {
  const candidates = [...sources]
    .filter(
      (source) =>
        source.sourceType === "paper" &&
        source.downloadCandidates?.length
    )
    .sort((a, b) => {
      const aPre =
        a.relevance * 0.5 +
        (a.mechanismScore || 0) * 0.35 +
        a.evidenceStrength * 0.15;

      const bPre =
        b.relevance * 0.5 +
        (b.mechanismScore || 0) * 0.35 +
        b.evidenceStrength * 0.15;

      return bPre - aPre;
    })
    .slice(0, 12);

  const checked = new Map<string, AcquisitionSource>();

  for (const source of candidates) {
    let verifiedUrl = "";
    const failures: string[] = [];

    for (const url of (source.downloadCandidates || []).slice(0, 5)) {
      const probe = await probePdf(url);

      if (probe.ok) {
        verifiedUrl = probe.finalUrl || url;
        break;
      }

      failures.push(probe.reason);
      await sleep(100);
    }

    if (verifiedUrl) {
      checked.set(source.id, {
        ...source,
        verifiedDownload: true,
        downloadUrl: verifiedUrl,
        access: "open_download",
        evidenceStrength: clamp(
          source.evidenceStrength + 4
        ),
        reason: `${source.reason} Verified full-text PDF endpoint passed signature checking.`,
      });
    } else {
      checked.set(source.id, {
        ...source,
        verifiedDownload: false,
        downloadUrl: undefined,
        access: "landing_page",
        reason: `${source.reason} Full-text candidates did not pass verification${
          failures.length
            ? ` (${[...new Set(failures)].slice(0, 2).join(", ")})`
            : ""
        }; kept as a discovery candidate, not auto-ingestible evidence.`,
      });
    }
  }

  return sources.map(
    (source) => checked.get(source.id) || source
  );
}

function acquisitionRank(source: AcquisitionSource) {
  const mechanism = source.mechanismScore ?? mechanismScore(source);
  const verifiedBonus = source.verifiedDownload ? 18 : 0;
  const openBonus =
    source.access === "open_download" ? 7 : 0;

  return (
    source.relevance * 0.43 +
    mechanism * 0.27 +
    source.evidenceStrength * 0.18 +
    source.visualPotential * 0.05 +
    verifiedBonus +
    openBonus
  );
}

function coverage(
  sources: EvidenceScoutSource[]
): EvidenceCoverage {
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
    const parsed = BodySchema.safeParse(
      await request.json()
    );

    if (!parsed.success) {
      return Response.json(
        {
          error:
            "Evidence Scout received an invalid story/evidence payload.",
        },
        { status: 400 }
      );
    }

    const rawEvidence =
      parsed.data.evidence as EvidenceItem[];

    const datasets =
      parsed.data.datasets as DatasetAnalysis[];

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

    const generatedQueries =
      buildResearchQueries(intent);

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
      cleanText(
        parsed.data.question ||
        parsed.data.topic
      ) ||
      "evidence research";

    const manualQuery = cleanText(
      parsed.data.searchQuery || ""
    );

    const queries = manualQuery
      ? [manualQuery]
      : generatedQueries.length
        ? generatedQueries
        : [fallbackQuery];

    const query = queries.join(" | ");

    const discoveredQuestions =
      discoverQuestions({
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
      5,
      Math.ceil(
        parsed.data.maxSources /
          Math.max(2, queries.length)
      )
    );

    const crossrefResults:
      PromiseSettledResult<AcquisitionSource[]>[] = [];

    for (
      let index = 0;
      index < queries.length;
      index += 1
    ) {
      if (index > 0) await sleep(650);

      try {
        crossrefResults.push({
          status: "fulfilled",
          value: await searchCrossref(
            queries[index],
            perQueryLimit
          ),
        });
      } catch (reason) {
        crossrefResults.push({
          status: "rejected",
          reason,
        });
      }
    }

    const openAlexResults:
      PromiseSettledResult<AcquisitionSource[]>[] = [];

    for (
      let index = 0;
      index < queries.length;
      index += 1
    ) {
      if (index > 0) await sleep(900);

      try {
        openAlexResults.push({
          status: "fulfilled",
          value: await searchOpenAlex(
            queries[index],
            Math.max(6, perQueryLimit + 3)
          ),
        });
      } catch (reason) {
        openAlexResults.push({
          status: "rejected",
          reason,
        });
      }
    }

    const discovered: AcquisitionSource[] = [
      ...existingSources(
        evidence,
        queries[0] || fallbackQuery
      ),
    ];

    crossrefResults.forEach(
      (result, index) => {
        if (result.status === "fulfilled") {
          discovered.push(...result.value);
        } else {
          providerErrors.push(
            `Crossref [${queries[index]}]: ${
              (result.reason as any)?.message ||
              "search failed"
            }`
          );
        }
      }
    );

    openAlexResults.forEach(
      (result, index) => {
        if (result.status === "fulfilled") {
          discovered.push(...result.value);
        } else {
          providerErrors.push(
            `OpenAlex [${queries[index]}]: ${
              (result.reason as any)?.message ||
              "search failed"
            }`
          );
        }
      }
    );

    /*
     * Acquisition upgrade:
     * 1. merge the same work across providers and preserve every PDF candidate;
     * 2. test the strongest mechanism-focused candidates before ranking;
     * 3. downgrade dead/blocked links to landing-page candidates;
     * 4. strongly reward verified full text + local causal mechanisms.
     */
    const deduped = dedupeSources(discovered);

    /*
     * Last-mile scholarly acquisition:
     * - OpenAlex/Crossref direct candidates
     * - Unpaywall OA locations when an email is configured
     * - DOI/publisher landing-page PDF link extraction
     * - institutional/repository links exposed from those pages
     *
     * Discovery does not make a source trusted. Every resulting endpoint is
     * still required to pass the PDF signature probe below.
     */
    const expansionPool = [...deduped]
      .sort((a, b) => {
        const aScore =
          a.relevance * 0.48 +
          (a.mechanismScore || 0) * 0.34 +
          a.evidenceStrength * 0.18;

        const bScore =
          b.relevance * 0.48 +
          (b.mechanismScore || 0) * 0.34 +
          b.evidenceStrength * 0.18;

        return bScore - aScore;
      });

    const expanded: AcquisitionSource[] = [];

    for (let index = 0; index < expansionPool.length; index += 1) {
      const source = expansionPool[index];

      // Limit network expansion to the strongest scholarly candidates.
      if (source.sourceType === "paper" && index < 14) {
        expanded.push(await expandFullTextCandidates(source));
      } else {
        expanded.push(source);
      }
    }

    const verified = await verifyAcquisitionSources(
      expanded
    );

    const relevanceFiltered =
      filterAndRescoreSources({
        topic: parsed.data.topic,
        question: parsed.data.question,
        sources: verified,
      }) as AcquisitionSource[];

    const sources = relevanceFiltered
      .map((source) => {
        const mechanism =
          source.mechanismScore ??
          mechanismScore(source);

        return {
          ...source,
          mechanismScore: mechanism,
          acquisitionScore:
            acquisitionRank({
              ...source,
              mechanismScore: mechanism,
            }),
        };
      })
      .sort(
        (a, b) =>
          (b.acquisitionScore || 0) -
          (a.acquisitionScore || 0)
      )
      .slice(0, parsed.data.maxSources);

    const result: EvidenceScoutResponse = {
      query,
      searchedAt:
        new Date().toISOString(),
      questions,
      sources,
      coverage: coverage(sources),
      providerErrors,
    };

    return Response.json(result, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        error:
          error?.message ||
          "Evidence Scout failed.",
      },
      { status: 500 }
    );
  }
}
