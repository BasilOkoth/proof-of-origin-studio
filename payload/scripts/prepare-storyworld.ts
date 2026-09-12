import fs from "node:fs/promises";
import path from "node:path";
import { buildStoryworldPackage } from "../src/lib/storyworld-engine";
import { buildStoryworldGenerationPlan, summarizeGenerationPlan } from "../src/lib/storyworld-generation";

async function main() {
  const worldId = process.argv[2] || "kamau-will";
  const pkg = buildStoryworldPackage(worldId);
  const plan = buildStoryworldGenerationPlan(pkg);
  const root = path.resolve("public", "storyworld", worldId, pkg.episode.id);

  await Promise.all([
    fs.mkdir(path.join(root, "characters"), { recursive: true }),
    fs.mkdir(path.join(root, "shots"), { recursive: true }),
    fs.mkdir(path.join(root, "audio"), { recursive: true }),
    fs.mkdir(path.resolve("episodes", "storyworld"), { recursive: true }),
  ]);

  const planPath = path.resolve("episodes", "storyworld", `${worldId}-${pkg.episode.id}.production.json`);
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(root, "captions.json"), JSON.stringify(plan.render.captions, null, 2));
  await fs.writeFile(
    path.join(root, "LOCKED_REFERENCES.json"),
    JSON.stringify(
      plan.characterReferences.map((ref) => ({
        characterId: ref.characterId,
        characterName: ref.characterName,
        approved: ref.approved,
        canonicalAssetId: ref.canonicalAssetId,
        referencePath: ref.referencePath,
        sha256: ref.sha256,
        wardrobeVersion: ref.wardrobeVersion,
        voiceProfileKey: ref.voiceId,
      })),
      null,
      2
    )
  );

  const promptLines = ["# CHARACTER REFERENCES", ""];
  for (const ref of plan.characterReferences) {
    promptLines.push(
      `## ${ref.characterName}`,
      `STATUS: ${ref.approved ? "APPROVED / LOCKED" : "PENDING"}`,
      `REFERENCE: ${ref.referencePath}`,
      ref.sha256 ? `SHA-256: ${ref.sha256}` : "",
      ref.prompt,
      ""
    );
  }
  promptLines.push("# SHOT GENERATION JOBS", "");
  for (const job of plan.jobs.filter((j) => j.kind === "shot-image" || j.kind === "shot-video")) {
    promptLines.push(`## ${job.id}`, `OUTPUT: ${job.outputPath}`, `STATUS: ${job.status}`, job.prompt || "", "");
  }
  await fs.writeFile(path.join(root, "GENERATION_PROMPTS.md"), promptLines.filter(Boolean).join("\n"));

  console.log(JSON.stringify(summarizeGenerationPlan(plan), null, 2));
  console.log(`Production plan: ${planPath}`);
  console.log(`Asset workspace: ${root}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
