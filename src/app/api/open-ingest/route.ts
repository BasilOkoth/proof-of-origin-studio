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

function blockedIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => Number.isNaN(part))
  ) {
    return false;
  }

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
    throw new Error(
      "Automatic ingestion only accepts HTTPS sources."
    );
  }

  const hostname = url.hostname.toLowerCase();

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error(
      "Local or private network sources cannot be ingested."
    );
  }

  if (isIP(hostname)) {
    if (
      blockedIpv4(hostname) ||
      blockedIpv6(hostname)
    ) {
      throw new Error(
        "Private network addresses cannot be ingested."
      );
    }
    return;
  }

  const addresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  if (!addresses.length) {
    throw new Error(
      "The evidence host could not be resolved."
    );
  }

  for (const item of addresses) {
    if (
      item.family === 4 &&
      blockedIpv4(item.address)
    ) {
      throw new Error(
        "The evidence host resolves to a private IPv4 address."
      );
    }

    if (
      item.family === 6 &&
      blockedIpv6(item.address)
    ) {
      throw new Error(
        "The evidence host resolves to a private IPv6 address."
      );
    }
  }
}

async function fetchOpenFile(initialUrl: string) {
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
          "application/pdf,application/zip,application/x-zip-compressed,text/csv,text/plain,text/markdown,application/json,application/octet-stream;q=0.8,*/*;q=0.5",
        "user-agent":
          "Evidence-Studio-Open-Ingest/0.7",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (
      [301, 302, 303, 307, 308].includes(
        response.status
      )
    ) {
      const location =
        response.headers.get("location");

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

    const bytes = new Uint8Array(
      await response.arrayBuffer()
    );

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
        response.headers.get(
          "content-disposition"
        ) || "",
    };
  }

  throw new Error(
    "The source redirected too many times."
  );
}

function nameFromDisposition(value: string) {
  const utf =
    value.match(
      /filename\*=UTF-8''([^;]+)/i
    )?.[1];

  if (utf) {
    try {
      return decodeURIComponent(
        utf.replace(/["']/g, "")
      );
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
  contentType: string
) {
  const fromHeader =
    nameFromDisposition(disposition);

  if (fromHeader) return fromHeader;

  const pathName = new URL(url)
    .pathname.split("/")
    .filter(Boolean)
    .pop();

  if (
    pathName &&
    /\.[a-z0-9]{1,8}$/i.test(pathName)
  ) {
    return decodeURIComponent(pathName);
  }

  if (contentType === "application/pdf") {
    return "open-evidence.pdf";
  }
  if (contentType.includes("zip")) {
    return "open-evidence.zip";
  }
  if (contentType.includes("csv")) {
    return "open-evidence.csv";
  }
  if (contentType.includes("json")) {
    return "open-evidence.json";
  }

  return "open-evidence.txt";
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

function inferMime(
  contentType: string,
  fileName: string,
  bytes: Uint8Array
) {
  // File signatures beat incorrect web-server headers.
  if (looksLikePdf(bytes)) {
    return "application/pdf";
  }

  if (looksLikeZip(bytes)) {
    return "application/zip";
  }

  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".zip")) {
    return "application/zip";
  }
  if (lower.endsWith(".csv")) {
    return "text/csv";
  }
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  if (lower.endsWith(".md")) {
    return "text/markdown";
  }

  if (
    contentType &&
    contentType !==
      "application/octet-stream"
  ) {
    return contentType;
  }

  return "text/plain";
}

function textFromBytes(bytes: Uint8Array) {
  return new TextDecoder("utf-8", {
    fatal: false,
  })
    .decode(bytes)
    .replace(/\u0000/g, "");
}

function sourceKind(
  sourceType: string
): "research" | "report" | "text" {
  if (sourceType === "paper") {
    return "research";
  }
  if (sourceType === "report") {
    return "report";
  }
  return "text";
}

function relabelEvidence(
  items: EvidenceItem[],
  provenanceSource: string,
  title: string,
  sourceType: EvidenceItem["sourceType"]
) {
  return items.map((item) => ({
    ...item,
    source: provenanceSource,
    sourceLabel: title,
    sourceType:
      sourceType || item.sourceType,
  }));
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

    const fetched = await fetchOpenFile(
      parsed.data.url
    );

    const fileName = fileNameFor(
      fetched.finalUrl,
      fetched.disposition,
      fetched.contentType
    );

    const mimeType = inferMime(
      fetched.contentType,
      fileName,
      fetched.bytes
    );

    const canonicalSource =
      parsed.data.sourceUrl ||
      fetched.finalUrl;

    const provenanceSource =
      parsed.data.libraryId
        ? `library:${parsed.data.libraryId}`
        : canonicalSource;

    const title =
      parsed.data.title || fileName;

    let extractedText = "";
    let document:
      | DocumentIngestion
      | undefined;
    let dataset:
      | DatasetAnalysis
      | undefined;
    let evidence: EvidenceItem[] = [];

    if (
      mimeType === "application/pdf" ||
      fileName
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      const pdfModule =
        await import("pdf-parse");
      const pdfParse = pdfModule.default;

      const result = await pdfParse(
        Buffer.from(fetched.bytes)
      );

      extractedText = result.text || "";

      if (!extractedText.trim()) {
        throw new Error(
          "The open PDF did not contain readable text."
        );
      }

      document = ingestDocumentText({
        text: extractedText,
        fileName,
        kind: sourceKind(
          parsed.data.sourceType
        ),
      });

      evidence = relabelEvidence(
        document.evidence,
        provenanceSource,
        title,
        parsed.data.sourceType
      );
    } else if (
      mimeType.includes("zip") ||
      fileName
        .toLowerCase()
        .endsWith(".zip")
    ) {
      const zipModule =
        await import("jszip");
      const JSZip = zipModule.default;

      const zip = await JSZip.loadAsync(
        Buffer.from(fetched.bytes)
      );

      const csvNames = Object.keys(
        zip.files
      ).filter(
        (name) =>
          /\.csv$/i.test(name) &&
          !/(?:^|\/)Metadata_(?:Country|Indicator)/i.test(
            name
          )
      );

      const preferred =
        csvNames.find((name) =>
          /(?:^|\/)API_/i.test(name)
        ) ||
        csvNames.find(
          (name) => !/metadata/i.test(name)
        ) ||
        csvNames[0];

      if (!preferred) {
        throw new Error(
          "The open ZIP did not contain a usable CSV data file."
        );
      }

      extractedText =
        await zip.files[
          preferred
        ].async("string");

      dataset = analyzeCsv(
        extractedText,
        title
      );

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
      fileName
        .toLowerCase()
        .endsWith(".csv")
    ) {
      extractedText = textFromBytes(
        fetched.bytes
      );

      dataset = analyzeCsv(
        extractedText,
        title
      );

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
      mimeType ===
        "application/json" ||
      /\.(txt|md|markdown|json)$/i.test(
        fileName
      )
    ) {
      extractedText = textFromBytes(
        fetched.bytes
      );

      if (!extractedText.trim()) {
        throw new Error(
          "The open text source was empty."
        );
      }

      document = ingestDocumentText({
        text: extractedText,
        fileName,
        kind: sourceKind(
          parsed.data.sourceType
        ),
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
      throw new Error(
        "The source downloaded successfully, but no usable evidence items were extracted."
      );
    }

    const response:
      OpenIngestionResponse = {
      finalUrl: fetched.finalUrl,
      title,
      fileName,
      mimeType,
      byteLength:
        fetched.bytes.byteLength,
      extractedText:
        extractedText.slice(
          0,
          120_000
        ),
      evidence,
      dataset,
      document,
      fileBase64: Buffer.from(
        fetched.bytes
      ).toString("base64"),
    };

    return Response.json(response, {
      headers: {
        "cache-control": "no-store",
      },
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
