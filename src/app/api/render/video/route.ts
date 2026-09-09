import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { renderEpisodeFile } from "@/lib/server-render";
import type { EpisodeProject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function streamRenderedFile(
  rendered: Awaited<ReturnType<typeof renderEpisodeFile>>
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
    const project = (await request.json()) as EpisodeProject;

    if (!project?.scenes?.length) {
      return Response.json(
        { error: "The project has no video scenes." },
        { status: 400 }
      );
    }

    const rendered = await renderEpisodeFile(project);
    const stream = streamRenderedFile(rendered);

    return new Response(stream, {
      headers: {
        "content-type": "video/mp4",
        "content-length": String(rendered.size),
        "content-disposition": `attachment; filename="proof-of-origin-${project.id}.mp4"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("Final video render failed:", error);

    return Response.json(
      {
        error:
          error?.message ||
          "The server could not render the final video.",
      },
      { status: 500 }
    );
  }
}
