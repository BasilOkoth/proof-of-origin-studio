import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { renderThumbnailFile } from "@/lib/server-render";
import type { EpisodeProject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  project: z.any(),
  thumbnailIndex: z.number().int().min(0).max(20),
});

function streamRenderedFile(
  rendered: Awaited<ReturnType<typeof renderThumbnailFile>>
) {
  const nodeStream = createReadStream(rendered.path);

  const cleanup = () => {
    void rendered.cleanup();
  };

  nodeStream.once("close", cleanup);
  nodeStream.once("error", cleanup);

  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
}

export async function POST(request: NextRequest) {
  try {
    const body = BodySchema.parse(await request.json());
    const project = body.project as EpisodeProject;

    const rendered = await renderThumbnailFile(
      project,
      body.thumbnailIndex
    );
    const stream = streamRenderedFile(rendered);

    return new NextResponse(stream, {
      headers: {
        "content-type": "image/png",
        "content-length": String(rendered.size),
        "content-disposition": `attachment; filename="proof-of-origin-${project.id}-thumbnail-${body.thumbnailIndex + 1}.png"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("Thumbnail render failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "The server could not render the thumbnail.",
      },
      { status: 500 }
    );
  }
}
