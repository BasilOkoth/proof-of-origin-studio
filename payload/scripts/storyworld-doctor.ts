import fs from "node:fs/promises";
import path from "node:path";
import { buildStoryworldPackage } from "../src/lib/storyworld-engine";
import { buildStoryworldGenerationPlan } from "../src/lib/storyworld-generation";
import { lockedCharacterVault, seedShotVault } from "../src/lib/storyworld-character-vault";

const required = [
  "src/app/storyworld/page.tsx",
  "src/app/storyworld/generate/page.tsx",
  "src/lib/storyworld-types.ts",
  "src/lib/storyworld-data.ts",
  "src/lib/storyworld-engine.ts",
  "src/lib/storyworld-generation-types.ts",
  "src/lib/storyworld-generation.ts",
  "src/lib/storyworld-character-vault.ts",
  "src/remotion/StoryworldEpisode.tsx",
  "src/remotion/storyworld-index.tsx",
  "scripts/prepare-storyworld.ts",
  "scripts/render-storyworld.ts",
  "scripts/verify-storyworld-vault.ts",
];

async function exists(p: string) {
  try { await fs.access(path.resolve(p)); return true; } catch { return false; }
}

async function main() {
  let ok = true;
  for (const file of required) {
    if (!(await exists(file))) { console.error(`✗ missing ${file}`); ok = false; }
  }
  const worlds = ["kamau-will", "217", "sanctuary-7"];
  for (const worldId of worlds) {
    try {
      const pkg = buildStoryworldPackage(worldId);
      const plan = buildStoryworldGenerationPlan(pkg);
      console.log(`✓ ${pkg.world.title}: ${pkg.quality.score}/100 · ${plan.jobs.length} jobs`);
    } catch (error: any) {
      console.error(`✗ ${worldId}: ${error?.message || error}`);
      ok = false;
    }
  }
  console.log(`Vault: ${lockedCharacterVault.length} locked characters · ${seedShotVault.length} seed shots`);
  if (!ok) process.exit(1);
  console.log("Storyworld doctor: OK");
}

main().catch((error) => { console.error(error); process.exit(1); });
