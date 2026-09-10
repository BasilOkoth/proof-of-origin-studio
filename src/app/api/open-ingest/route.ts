import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { z } from "zod";

import { analyzeCsv } from "@/lib/data-story";
import { ingestDocumentText } from "@/lib/document-evidence";
import type {
  DatasetAnalysis,
  DocumentIngestion,
  EvidenceItem,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MIN_PAPER_TEXT_CHARS = 8_000;
const MIN_PDF_BYTES = 12_000;

const BodySchema = z.object({
  url: z.string().url().max(4000),
  title: z.string().max(1000).default("Open evidence"),
  sourceType: z
    .enum([
      "paper",
      "report",
      "dataset",
      "field",
      "web",
      "interview",
      "hps",
      "other",
    ])
    .default("other"),
  provider: z.string().max(200).optional(),
  license: z.string().max(1000).optional(),
  sourceUrl: z.string().url().max(4000).optional(),
  doi: z.string().max(500).optional(),
  libraryId: z.string().min(1).max(500).optional(),
});

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

type DownloadedFile = {
  finalUrl: string;
  bytes: Uint8Array;
  contentType: string;
  disposition: string;
};

function blockedIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function blockedIpv6(address: string) {
  const value = address.toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb")
  );
}

async function assertPublicHttps(url: URL) {
  if (url.protocol !== "https:") {
    throw new Error("Automatic ingestion only accepts HTTPS sources.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Local or private network sources cannot be ingested.");
  }

  if (isIP(hostname)) {
    if (blockedIpv4(hostname) || blockedIpv6(hostname)) {
      throw new Error("Private network addresses cannot be ingested.");
    }
    return;
  }

  const addresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  if (!addresses.length) {
    throw new Error("The evidence host could not be resolved.");
  }

  for (const item of addresses) {
    if (item.family === 4 && blockedIpv4(item.address)) {
      throw new Error(
        "The evidence host resolves to a private IPv4 address."
      );
    }
    if (item.family === 6 && blockedIpv6(item.address)) {
      throw new Error(
        "The evidence host resolves to a private IPv6 address."
      );
    }
  }
}

function looksLikePdf(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function looksLikeZip(bytes: Uint8Array) {
  return (
    bytes.length >= 2 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b
  );
}

function textFromBytes(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes)
    .replace(/\u0000/g, "");
}

function looksLikeHtml(text: string) {
  const sample = text.slice(0, 20_000);
  return (
    /<!doctype\s+html/i.test(sample) ||
    /<html\b/i.test(sample) ||
    /<head\b/i.test(sample) ||
    /<body\b/i.test(sample) ||
    /<iframe\b/i.test(sample) ||
    /<script\b/i.test(sample)
  );
}

function looksLikeChallengePage(text: string) {
  const sample = text.slice(0, 30_000);
  return /\b(akamai|interstitial|captcha|cloudflare|access denied|verify you are human|bot detection|security challenge|enable javascript|checking your browser|request blocked)\b/i.test(
    sample
  );
}

function looksLikePaperUrl(url: string) {
  return (
    /\.pdf(?:$|[?#])/i.test(url) ||
    /\/pdf(?:$|[/?#])/i.test(url) ||
    /article\/download/i.test(url)
  );
}

function validateDownloadedCandidate(
  file: DownloadedFile,
  sourceType: string
) {
  const declaredPdf =
    file.contentType === "application/pdf" ||
    looksLikePaperUrl(file.finalUrl);

  if (declaredPdf && !looksLikePdf(file.bytes)) {
    const text = textFromBytes(file.bytes);

    if (looksLikeChallengePage(text)) {
      throw new Error(
        "The advertised PDF returned an anti-bot/interstitial page instead of evidence."
      );
    }

    if (looksLikeHtml(text)) {
      throw new Error(
        "The advertised PDF returned HTML instead of a real PDF."
      );
    }

    throw new Error(
      "The advertised PDF failed PDF signature validation."
    );
  }

  if (looksLikePdf(file.bytes) && file.bytes.byteLength < MIN_PDF_BYTES) {
    throw new Error(
      "The downloaded PDF is unusually small and was rejected as incomplete."
    );
  }

  if (
    sourceType === "paper" &&
    !looksLikePdf(file.bytes) &&
    !looksLikeZip(file.bytes)
  ) {
    const text = textFromBytes(file.bytes);

    if (looksLikeChallengePage(text)) {
      throw new Error(
        "The open-access endpoint returned a challenge/interstitial page instead of the paper."
      );
    }

    if (looksLikeHtml(text)) {
      throw new Error(
        "The open-access endpoint returned an HTML landing page rather than full text."
      );
    }

    if (text.trim().length < MIN_PAPER_TEXT_CHARS) {
      throw new Error(
        `The open-access endpoint returned only ${text
          .trim()
          .length.toLocaleString()} text characters; this is too small to treat as a full research paper.`
      );
    }
  }
}

async function fetchOpenFile(initialUrl: string): Promise<DownloadedFile> {
  let current = new URL(initialUrl);

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    await assertPublicHttps(current);

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept:
          "application/pdf,application/zip,application/x-zip-compressed,text/csv,text/plain,text/markdown,application/json,application/octet-stream;q=0.8,*/*;q=0.4",
        "user-agent":
          "Evidence-Studio-Open-Ingest/1.0 (+https://github.com/BasilOkoth/proof-of-origin-studio)",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          "The source redirected without a destination URL."
        );
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Open evidence download returned HTTP ${response.status}.`
      );
    }

    const length = Number(
      response.headers.get("content-length") || "0"
    );

    if (length && length > MAX_BYTES) {
      throw new Error(
        "The open file is larger than the 15 MB automatic-ingestion limit."
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(
        "The open file is larger than the 15 MB automatic-ingestion limit."
      );
    }

    return {
      finalUrl: current.toString(),
      bytes,
      contentType: (
        response.headers.get("content-type") || ""
      )
        .split(";")[0]
        .trim()
        .toLowerCase(),
      disposition:
        response.headers.get("content-disposition") || "",
    };
  }

  throw new Error("The source redirected too many times.");
}

function normalizeDoi(raw?: string) {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
}

function doiFromUrl(url?: string) {
  if (!url) return "";
  const match = url.match(
    /(?:doi\.org\/|doi:)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i
  );
  return match?.[1] || "";
}

function cleanCandidateUrl(value?: string | null) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function uniqueUrls(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = cleanCandidateUrl(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }

  return result;
}

async function openAlexFullTextCandidates(doi: string) {
  if (!doi) return [];

  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set(
    "filter",
    `doi:https://doi.org/${doi}`
  );
  endpoint.searchParams.set("per-page", "1");

  await assertPublicHttps(endpoint);

  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent":
          "Evidence-Studio-Open-Ingest/1.0 (+https://github.com/BasilOkoth/proof-of-origin-studio)",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as any;
    const work = data?.results?.[0];
    if (!work) return [];

    const locations = [
      work.best_oa_location,
      work.primary_location,
      ...(Array.isArray(work.locations) ? work.locations : []),
    ].filter(Boolean);

    return uniqueUrls(
      locations.flatMap((location: any) => [
        location?.pdf_url,
        location?.landing_page_url &&
        /\.pdf(?:$|[?#])|\/pdf(?:$|[/?#])|article\/download/i.test(
          location.landing_page_url
        )
          ? location.landing_page_url
          : undefined,
      ])
    );
  } catch {
    return [];
  }
}

async function resolveAndFetch(args: {
  primaryUrl: string;
  doi?: string;
  sourceUrl?: string;
  sourceType: string;
}) {
  const doi =
    normalizeDoi(args.doi) ||
    normalizeDoi(doiFromUrl(args.sourceUrl));

  const oaCandidates = await openAlexFullTextCandidates(doi);

  const candidates = uniqueUrls([
    args.primaryUrl,
    ...oaCandidates,
  ]);

  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const fetched = await fetchOpenFile(candidate);
      validateDownloadedCandidate(fetched, args.sourceType);
      return fetched;
    } catch (error: any) {
      errors.push(
        `${candidate}: ${error?.message || "download failed"}`
      );
    }
  }

  const compact = errors
    .slice(0, 4)
    .map((value) => value.replace(/\s+/g, " "))
    .join(" | ");

  throw new Error(
    doi
      ? `No verified full-text file could be resolved for DOI ${doi}. ${compact}`
      : `No verified full-text file could be downloaded. ${compact}`
  );
}

function nameFromDisposition(value: string) {
  const utf = value.match(
    /filename\*=UTF-8''([^;]+)/i
  )?.[1];

  if (utf) {
    try {
      return decodeURIComponent(utf.replace(/["']/g, ""));
    } catch {
      return utf.replace(/["']/g, "");
    }
  }

  return value.match(
    /filename="?([^";]+)"?/i
  )?.[1];
}

function fileNameFor(
  url: string,
  disposition: string,
  contentType: string,
  bytes: Uint8Array
) {
  const fromHeader = nameFromDisposition(disposition);
  if (fromHeader) return fromHeader;

  if (looksLikePdf(bytes)) return "open-evidence.pdf";
  if (looksLikeZip(bytes)) return "open-evidence.zip";

  const pathName = new URL(url)
    .pathname.split("/")
    .filter(Boolean)
    .pop();

  if (pathName && /\.[a-z0-9]{1,8}$/i.test(pathName)) {
    return decodeURIComponent(pathName);
  }

  if (contentType.includes("csv")) return "open-evidence.csv";
  if (contentType.includes("json")) return "open-evidence.json";
  return "open-evidence.txt";
}

function inferMime(
  contentType: string,
  fileName: string,
  bytes: Uint8Array
) {
  if (looksLikePdf(bytes)) return "application/pdf";
  if (looksLikeZip(bytes)) return "application/zip";

  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md")) return "text/markdown";

  if (
    contentType &&
    contentType !== "application/octet-stream"
  ) {
    return contentType;
  }

  return "text/plain";
}

function sourceKind(
  sourceType: string
): "research" | "report" | "text" {
  if (sourceType === "paper") return "research";
  if (sourceType === "report") return "report";
  return "text";
}

function relabelEvidence(
  items: EvidenceItem[],
  provenanceSource: string,
  title: string,
  sourceType: EvidenceItem["sourceType"]
) {
  return items
    .filter((item) => {
      const text = item.statement || "";
      return (
        !looksLikeHtml(text) &&
        !looksLikeChallengePage(text) &&
        !/[<>]{2,}|<\/?(?:script|iframe|html|body|head)\b/i.test(
          text
        )
      );
    })
    .map((item) => ({
      ...item,
      source: provenanceSource,
      sourceLabel: title,
      sourceType: sourceType || item.sourceType,
    }));
}

export async function POST(request: Request) {
  try {
    const parsed = BodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json(
        {
          error:
            "Open-file ingestion received invalid source metadata.",
        },
        { status: 400 }
      );
    }

    if (!parsed.data.license?.trim()) {
      return Response.json(
        {
          error:
            "Automatic ingestion requires an explicit open-access/license signal from the Evidence Scout.",
        },
        { status: 400 }
      );
    }

    const fetched = await resolveAndFetch({
      primaryUrl: parsed.data.url,
      doi: parsed.data.doi,
      sourceUrl: parsed.data.sourceUrl,
      sourceType: parsed.data.sourceType,
    });

    const fileName = fileNameFor(
      fetched.finalUrl,
      fetched.disposition,
      fetched.contentType,
      fetched.bytes
    );

    const mimeType = inferMime(
      fetched.contentType,
      fileName,
      fetched.bytes
    );

    const canonicalSource =
      parsed.data.sourceUrl || fetched.finalUrl;

    const provenanceSource = parsed.data.libraryId
      ? `library:${parsed.data.libraryId}`
      : canonicalSource;

    const title = parsed.data.title || fileName;

    let extractedText = "";
    let document: DocumentIngestion | undefined;
    let dataset: DatasetAnalysis | undefined;
    let evidence: EvidenceItem[] = [];

    if (mimeType === "application/pdf") {
      const pdfModule = await import("pdf-parse");
      const pdfParse = pdfModule.default;

      const result = await pdfParse(Buffer.from(fetched.bytes));
      extractedText = result.text || "";

      if (!extractedText.trim()) {
        throw new Error(
          "The verified open PDF did not contain readable text."
        );
      }

      if (
        looksLikeChallengePage(extractedText) ||
        looksLikeHtml(extractedText)
      ) {
        throw new Error(
          "The PDF parser recovered challenge/HTML content rather than scholarly full text."
        );
      }

      document = ingestDocumentText({
        text: extractedText,
        fileName,
        kind: sourceKind(parsed.data.sourceType),
      });

      evidence = relabelEvidence(
        document.evidence,
        provenanceSource,
        title,
        parsed.data.sourceType
      );
    } else if (
      mimeType.includes("zip") ||
      fileName.toLowerCase().endsWith(".zip")
    ) {
      const zipModule = await import("jszip");
      const JSZip = zipModule.default;

      const zip = await JSZip.loadAsync(
        Buffer.from(fetched.bytes)
      );

      const csvNames = Object.keys(zip.files).filter(
        (name) =>
          /\.csv$/i.test(name) &&
          !/(?:^|\/)Metadata_(?:Country|Indicator)/i.test(
            name
          )
      );

      const preferred =
        csvNames.find((name) => /(?:^|\/)API_/i.test(name)) ||
        csvNames.find((name) => !/metadata/i.test(name)) ||
        csvNames[0];

      if (!preferred) {
        throw new Error(
          "The open ZIP did not contain a usable CSV data file."
        );
      }

      extractedText = await zip.files[preferred].async("string");
      dataset = analyzeCsv(extractedText, title);

      if (dataset.insight) {
        evidence = [
          {
            id: crypto.randomUUID(),
            kind: "observed",
            statement: dataset.insight,
            source: provenanceSource,
            sourceLabel: title,
            sourceType: "dataset",
          },
        ];
      }
    } else if (
      mimeType.includes("csv") ||
      fileName.toLowerCase().endsWith(".csv")
    ) {
      extractedText = textFromBytes(fetched.bytes);
      dataset = analyzeCsv(extractedText, title);

      if (dataset.insight) {
        evidence = [
          {
            id: crypto.randomUUID(),
            kind: "observed",
            statement: dataset.insight,
            source: provenanceSource,
            sourceLabel: title,
            sourceType: "dataset",
          },
        ];
      }
    } else if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      /\.(txt|md|markdown|json)$/i.test(fileName)
    ) {
      extractedText = textFromBytes(fetched.bytes);

      if (!extractedText.trim()) {
        throw new Error("The open text source was empty.");
      }

      if (
        parsed.data.sourceType === "paper" &&
        extractedText.trim().length < MIN_PAPER_TEXT_CHARS
      ) {
        throw new Error(
          "The downloaded text is too small to treat as a complete research paper."
        );
      }

      if (
        looksLikeChallengePage(extractedText) ||
        looksLikeHtml(extractedText)
      ) {
        throw new Error(
          "The downloaded text contains a challenge/HTML page rather than evidence."
        );
      }

      document = ingestDocumentText({
        text: extractedText,
        fileName,
        kind: sourceKind(parsed.data.sourceType),
      });

      evidence = relabelEvidence(
        document.evidence,
        provenanceSource,
        title,
        parsed.data.sourceType
      );
    } else {
      throw new Error(
        `Automatic ingestion does not yet support ${
          mimeType || "this file type"
        }.`
      );
    }

    if (!evidence.length && !dataset) {
      const extractedChars = extractedText.trim().length;

      throw new Error(
        extractedChars
          ? `The verified source contained ${extractedChars.toLocaleString()} readable characters, but no usable evidence claims survived extraction and integrity checks.`
          : "The source downloaded successfully, but no readable evidence text was extracted."
      );
    }

    const response: OpenIngestionResponse = {
      finalUrl: fetched.finalUrl,
      title,
      fileName,
      mimeType,
      byteLength: fetched.bytes.byteLength,
      extractedText: extractedText.slice(0, 120_000),
      evidence,
      dataset,
      document,
      fileBase64: Buffer.from(fetched.bytes).toString("base64"),
    };

    return Response.json(response, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error: any) {
    return Response.json(
      {
        error:
          error?.message ||
          "Unable to ingest open evidence.",
      },
      { status: 500 }
    );
  }
}
