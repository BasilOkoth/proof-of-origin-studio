import { NextRequest, NextResponse } from "next/server";

import { renderEpisodeBuffer } from "@/lib/server-render";
import type { EpisodeProject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const project = (await request.json()) as EpisodeProject;

    if (!project?.scenes?.length) {
      return NextResponse.json(
        { error: "The project has no video scenes." },
        { status: 400 }
      );
    }

    const output = await renderEpisodeBuffer(project);

    return new NextResponse(output, {
      headers: {
        "content-type": "video/mp4",
        "content-disposition": `attachment; filename="proof-of-origin-${project.id}.mp4"`,
        "cache-control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Final video render failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "The server could not render the final video.",
      },
      { status: 500 }
    );
  }
}
