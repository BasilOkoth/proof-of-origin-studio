import { z } from "zod";
import type { EpisodeProject } from "@/lib/types";
import type { MediaCandidate, MediaScoutResult } from "@/lib/media-scout-types";
import { buildEpisodeMediaPlan } from "@/lib/media-scout";

export const runtime = "nodejs";

const BodySchema = z.object({
  project: z.any(),
  perScene: z.number().int().min(1).max(8).default(4),
  includePexels: z.boolean().default(true),
  includeWikimedia: z.boolean().default(true),
});

function stripHtml(value?: string) {
  return (value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function scoreCandidate(
  query: string,
  title: string,
  width?: number,
  height?: number,
  isVideo?: boolean
) {
  const terms = query.toLowerCase().split(/\s+/).filter((x) => x.length > 3);
  const hay = title.toLowerCase();
  const lexical = terms.reduce((sum, term) => sum + (hay.includes(term) ? 4 : 0), 0);
  const landscape = width && height && width > height ? 4 : 0;
  const resolution = width && width >= 1920 ? 4 : width && width >= 1280 ? 2 : 0;
  const motion = isVideo ? 3 : 0;
  return lexical + landscape + resolution + motion;
}

async function pexelsSearch(
  apiKey: string,
  query: string,
  perScene: number,
  preferred: "video" | "image"
): Promise<MediaCandidate[]> {
  const results: MediaCandidate[] = [];

  const headers = { Authorization: apiKey };

  if (preferred === "video") {
    const videoRes = await fetch(
      `https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&size=medium&per_page=${Math.min(8, perScene + 2)}`,
      { headers }
    );

    if (videoRes.ok) {
      const data = await videoRes.json();
      for (const video of data.videos || []) {
        const files = [...(video.video_files || [])]
          .filter((f: any) => f.link && f.width && f.height)
          .sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
        const best = files.find((f: any) => f.width >= 1280) || files[0];
        const preview = video.image;
        if (!best?.link || !preview) continue;

        const title = `Pexels video by ${video.user?.name || "creator"}`;
        results.push({
          id: `pexels-video-${video.id}`,
          provider: "pexels",
          mediaType: "video",
          title,
          previewUrl: preview,
          sourceUrl: video.url,
          downloadUrl: best.link,
          width: best.width,
          height: best.height,
          durationSec: video.duration,
          creator: video.user?.name,
          creatorUrl: video.user?.url,
          licenseName: "Pexels License",
          licenseUrl: "https://www.pexels.com/license/",
          attribution: `Video by ${video.user?.name || "Pexels contributor"} on Pexels`,
          query,
          relevanceScore: scoreCandidate(query, title, best.width, best.height, true),
          metadata: { pexelsId: video.id },
        });
      }
    }
  }

  const photoRes = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&size=large&per_page=${Math.min(8, perScene + 2)}`,
    { headers }
  );

  if (photoRes.ok) {
    const data = await photoRes.json();
    for (const photo of data.photos || []) {
      const url = photo.src?.large2x || photo.src?.large || photo.src?.original;
      const preview = photo.src?.medium || photo.src?.large;
      if (!url || !preview) continue;

      const title = photo.alt || `Pexels photo by ${photo.photographer || "creator"}`;
      results.push({
        id: `pexels-photo-${photo.id}`,
        provider: "pexels",
        mediaType: "image",
        title,
        previewUrl: preview,
        sourceUrl: photo.url,
        downloadUrl: url,
        width: photo.width,
        height: photo.height,
        creator: photo.photographer,
        creatorUrl: photo.photographer_url,
        licenseName: "Pexels License",
        licenseUrl: "https://www.pexels.com/license/",
        attribution: `Photo by ${photo.photographer || "Pexels contributor"} on Pexels`,
        query,
        relevanceScore: scoreCandidate(query, title, photo.width, photo.height, false),
        metadata: { pexelsId: photo.id },
      });
    }
  }

  return results;
}

async function wikimediaSearch(
  query: string,
  perScene: number
): Promise<MediaCandidate[]> {
  const searchUrl =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: `${query} filetype:bitmap`,
      gsrnamespace: "6",
      gsrlimit: String(Math.min(6, perScene + 1)),
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      iiurlwidth: "1280",
      iiextmetadatafilter:
        "Artist|LicenseShortName|LicenseUrl|Credit|ImageDescription|UsageTerms",
    });

  const response = await fetch(searchUrl, {
    headers: {
      "user-agent": "ProofOfOriginStudio/1.0 (media provenance research tool)",
    },
  });

  if (!response.ok) return [];

  const data = await response.json();
  const pages = Object.values(data?.query?.pages || {}) as any[];
  const results: MediaCandidate[] = [];

  for (const page of pages) {
    const info = page?.imageinfo?.[0];
    if (!info?.url) continue;
    const meta = info.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value) || "Wikimedia Commons license";
    const licenseUrl = meta.LicenseUrl?.value;
    const creator = stripHtml(meta.Artist?.value) || "Wikimedia Commons contributor";
    const description = stripHtml(meta.ImageDescription?.value);
    const title = description || page.title?.replace(/^File:/, "") || "Wikimedia Commons image";
    const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;

    results.push({
      id: `wikimedia-${page.pageid}`,
      provider: "wikimedia",
      mediaType: "image",
      title,
      previewUrl: info.thumburl || info.url,
      sourceUrl: pageUrl,
      downloadUrl: info.url,
      width: info.width,
      height: info.height,
      creator,
      licenseName: license,
      licenseUrl,
      attribution: `${creator} · ${license} · Wikimedia Commons`,
      query,
      relevanceScore: scoreCandidate(query, title, info.width, info.height, false),
      metadata: {
        commonsPageId: page.pageid,
        credit: stripHtml(meta.Credit?.value),
      },
    });
  }

  return results;
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const project = body.project as EpisodeProject;
    const plan = buildEpisodeMediaPlan(project);

    if (!plan.length) {
      return Response.json({
        scout: {
          version: "origin-media-scout-1",
          generatedAt: new Date().toISOString(),
          sources: [],
          scenes: [],
          notes: ["No scenes currently require documentary B-roll."],
        } satisfies MediaScoutResult,
      });
    }

    const pexelsKey = process.env.PEXELS_API_KEY;
    if (body.includePexels && !pexelsKey && !body.includeWikimedia) {
      return Response.json(
        { error: "PEXELS_API_KEY is not configured." },
        { status: 503 }
      );
    }

    const sceneResults = [];

    for (const item of plan) {
      const candidates: MediaCandidate[] = [];

      if (body.includePexels && pexelsKey) {
        candidates.push(
          ...(await pexelsSearch(
            pexelsKey,
            item.primary,
            body.perScene,
            item.recommendedType
          ))
        );
      }

      if (body.includeWikimedia) {
        candidates.push(
          ...(await wikimediaSearch(item.primary, body.perScene))
        );
      }

      if (item.alternate && candidates.length < body.perScene) {
        if (body.includePexels && pexelsKey) {
          candidates.push(
            ...(await pexelsSearch(
              pexelsKey,
              item.alternate,
              Math.max(2, body.perScene - candidates.length),
              item.recommendedType
            ))
          );
        }
      }

      const deduped = [...new Map(candidates.map((c) => [c.id, c])).values()]
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, body.perScene);

      sceneResults.push({
        sceneId: item.scene.id,
        headline: item.scene.headline,
        query: item.primary,
        alternateQuery: item.alternate,
        reason: item.reason,
        recommendedType: item.recommendedType,
        candidates: deduped,
      });
    }

    const sources = [
      ...(body.includePexels && pexelsKey ? ["pexels" as const] : []),
      ...(body.includeWikimedia ? ["wikimedia" as const] : []),
    ];

    const scout: MediaScoutResult = {
      version: "origin-media-scout-1",
      generatedAt: new Date().toISOString(),
      sources,
      scenes: sceneResults,
      notes: [
        "Pexels candidates use the Pexels License; attribution is preserved even where attribution is not mandatory.",
        "Wikimedia Commons candidates preserve the item-specific license and creator metadata returned by Commons.",
        "Media is not silently downloaded. A selected candidate is attached to a scene with its source and license provenance.",
      ],
    };

    return Response.json({ scout });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Unable to scout media." },
      { status: 500 }
    );
  }
}
