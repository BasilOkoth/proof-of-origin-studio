import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { lockedCharacterVault, seedShotVault } from "../src/lib/storyworld-character-vault";

async function sha256(file: string) {
  const bytes = await fs.readFile(path.resolve(file));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function verify(label: string, file: string, expected: string) {
  try {
    const actual = await sha256(file);
    if (actual !== expected) {
      console.error(`✗ ${label}: fingerprint mismatch\n  expected ${expected}\n  actual   ${actual}`);
      return false;
    }
    console.log(`✓ ${label}`);
    return true;
  } catch (error: any) {
    console.error(`✗ ${label}: ${error?.message || error}`);
    return false;
  }
}

async function main() {
  let ok = true;
  for (const asset of lockedCharacterVault) ok = (await verify(`${asset.characterName} (${asset.assetId})`, asset.canonicalPath, asset.sha256)) && ok;
  for (const seed of seedShotVault) ok = (await verify(`Seed ${seed.shotId}`, seed.seedPath, seed.sha256)) && ok;
  if (!ok) process.exit(1);
  console.log(`\nVault verified: ${lockedCharacterVault.length} character locks + ${seedShotVault.length} seed shots.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
