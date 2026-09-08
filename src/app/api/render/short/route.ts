import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { renderShortBuffer } from "@/lib/server-render";
import type { EpisodeProject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  project: z.any(),
  shortIndex: z.number().int().min(0).max(20),
});

export async function POST(request: NextRequest) {
  try {
    const body = BodySchema.parse(await request.json());
    const project = body.project as EpisodeProject;

    const output = await renderShortBuffer(
      project,
      body.shortIndex
    );

    return new NextResponse(output, {
      headers: {
        "content-type": "video/mp4",
        "content-disposition": `attachment; filename="proof-of-origin-${project.id}-short-${body.shortIndex + 1}.mp4"`,
        "cache-control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Short render failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "The server could not render the Short.",
      },
      { status: 500 }
    );
  }
}
