import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  evidenceFromHps,
  parseHpsResult,
  suggestEpisodeFromHps,
} from "@/lib/hps-ingest";

const BodySchema = z.object({
  input: z.string().min(3).max(100_000),
});

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ");
}

function publicHpsUrl(input: string) {
  const trimmed = input.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    const allowed =
      url.protocol === "https:" &&
      (url.hostname === "humanprovenancestandard.org" ||
        url.hostname === "www.humanprovenancestandard.org");

    return allowed ? url : null;
  }

  const recordId = trimmed.match(/\bHPS-\d{4}-[A-Z0-9]{6,}\b/i)?.[0];
  if (!recordId || trimmed.includes("\n")) return null;

  return new URL(
    `https://www.humanprovenancestandard.org/records/${encodeURIComponent(
      recordId.toUpperCase()
    )}`
  );
}

function enrich(rawText: string, sourceUrl?: string) {
  const ingestion = parseHpsResult(rawText);
  if (sourceUrl) ingestion.sourceUrl = sourceUrl;

  const suggested = suggestEpisodeFromHps(ingestion);

  return {
    ingestion,
    evidence: evidenceFromHps(ingestion),
    suggestedTopic: suggested.topic,
    suggestedQuestion: suggested.question,
    suggestedExperiment: suggested.experiment,
  };
}

export async function POST(request: NextRequest) {
  const body = BodySchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json(
      { error: "Paste an HPS verification result, record ID or public HPS URL." },
      { status: 400 }
    );
  }

  const input = body.data.input;
  const url = publicHpsUrl(input);

  // Long/multiline input is a verifier receipt and should be parsed directly.
  if (!url || input.includes("\n") || input.length > 300) {
    return NextResponse.json({
      result: enrich(input),
      fetched: false,
    });
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "user-agent": "Proof-of-Origin-Studio/0.3",
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        result: enrich(input),
        fetched: false,
        warning: `The public HPS page returned HTTP ${response.status}; the supplied identifier/text was parsed instead.`,
      });
    }

    const text = stripHtml(await response.text());

    return NextResponse.json({
      result: enrich(text, url.toString()),
      fetched: true,
    });
  } catch {
    return NextResponse.json({
      result: enrich(input),
      fetched: false,
      warning:
        "The public HPS page could not be fetched, so the supplied identifier/text was parsed instead.",
    });
  }
}
