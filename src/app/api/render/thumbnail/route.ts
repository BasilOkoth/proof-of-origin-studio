import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { renderThumbnailBuffer } from "@/lib/server-render";
import type { EpisodeProject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  project: z.any(),
  thumbnailIndex: z.number().int().min(0).max(20),
});

export async function POST(request: NextRequest) {
  try {
    const body = BodySchema.parse(await request.json());
    const project = body.project as EpisodeProject;

    const output = await renderThumbnailBuffer(
      project,
      body.thumbnailIndex
    );

    return new NextResponse(output, {
      headers: {
        "content-type": "image/png",
        "content-disposition": `attachment; filename="proof-of-origin-${project.id}-thumbnail-${body.thumbnailIndex + 1}.png"`,
        "cache-control": "no-store",
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
