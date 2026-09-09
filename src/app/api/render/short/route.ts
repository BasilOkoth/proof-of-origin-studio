import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { z } from "zod";

import { renderShortFile } from "@/lib/server-render";
import type { EpisodeProject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  project: z.any(),
  shortIndex: z.number().int().min(0).max(20),
});

function streamRenderedFile(
  rendered: Awaited<ReturnType<typeof renderShortFile>>
) {
  const nodeStream = createReadStream(rendered.path);

  const cleanup = () => {
    void rendered.cleanup();
  };

  nodeStream.once("close", cleanup);
  nodeStream.once("error", cleanup);

  return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const project = body.project as EpisodeProject;

    const rendered = await renderShortFile(project, body.shortIndex);
    const stream = streamRenderedFile(rendered);

    return new Response(stream, {
      headers: {
        "content-type": "video/mp4",
        "content-length": String(rendered.size),
        "content-disposition": `attachment; filename="proof-of-origin-${project.id}-short-${body.shortIndex + 1}.mp4"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("Short render failed:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "The server could not render the Short.",
      },
      { status: 500 }
    );
  }
}
