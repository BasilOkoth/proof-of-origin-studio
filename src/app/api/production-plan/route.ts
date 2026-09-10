import { z } from "zod";
import { buildProductionIntelligence } from "@/lib/production-intelligence";
import type { EpisodeProject } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  project: z.unknown(),
});

export async function POST(request: Request) {
  try {
    const parsed = BodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return Response.json(
        { error: "A render project is required." },
        { status: 400 }
      );
    }

    const project = parsed.data.project as EpisodeProject;

    if (!project || !Array.isArray(project.scenes)) {
      return Response.json(
        { error: "Invalid episode project." },
        { status: 400 }
      );
    }

    return Response.json(
      { plan: buildProductionIntelligence(project) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error: any) {
    return Response.json(
      {
        error:
          error?.message || "Unable to build production intelligence.",
      },
      { status: 500 }
    );
  }
}
