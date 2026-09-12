export type LockedCharacterVaultAsset = {
  assetId: string;
  worldId: string;
  characterId: string;
  characterName: string;
  canonicalPath: string;
  sha256: string;
  approvedAt: string;
  source: string;
  wardrobeVersion: string;
  voiceProfileKey: string;
  notes: string[];
};

export type SeedShotAsset = {
  worldId: string;
  shotId: string;
  seedPath: string;
  sha256: string;
  role: "generation-reference" | "storyboard-only";
  notes: string[];
};

export const lockedCharacterVault: LockedCharacterVaultAsset[] = [
  {
    assetId: "kamau-amara-canonical-v1",
    worldId: "kamau-will",
    characterId: "amara",
    characterName: "Amara Otieno",
    canonicalPath: "public/storyworld/_vault/kamau-will/characters/amara-canonical-v1.png",
    sha256: "4bf3d0f2951b7bd7d3421c9a933d650e25e4b3bc8ceb8481ddb8c6bed51f7ad7",
    approvedAt: "2026-09-12T12:41:00+03:00",
    source: "The Kamau Will approved premium visual bible",
    wardrobeVersion: "episode-01-v1",
    voiceProfileKey: "kamau-amara-v1",
    notes: ["Canonical face and Episode 1 wardrobe identity.", "Do not replace without incrementing assetId and wardrobeVersion."],
  },
  {
    assetId: "kamau-victor-canonical-v1",
    worldId: "kamau-will",
    characterId: "victor",
    characterName: "Victor Kamau Jr.",
    canonicalPath: "public/storyworld/_vault/kamau-will/characters/victor-canonical-v1.png",
    sha256: "e3047ab42ea88ec38d6603d8ff418849c1766129be6edf356cccf3c3e026794d",
    approvedAt: "2026-09-12T12:41:00+03:00",
    source: "The Kamau Will approved premium visual bible",
    wardrobeVersion: "episode-01-v1",
    voiceProfileKey: "kamau-victor-v1",
    notes: ["Canonical face, beard line and charcoal-suit identity."],
  },
  {
    assetId: "kamau-evelyn-canonical-v1",
    worldId: "kamau-will",
    characterId: "evelyn",
    characterName: "Evelyn Kamau",
    canonicalPath: "public/storyworld/_vault/kamau-will/characters/evelyn-canonical-v1.png",
    sha256: "10f87861eeccc29c7062b2f237e0df41bfb687ed016147d585d4b8c25aadeb2c",
    approvedAt: "2026-09-12T12:41:00+03:00",
    source: "The Kamau Will approved premium visual bible",
    wardrobeVersion: "episode-01-v1",
    voiceProfileKey: "kamau-evelyn-v1",
    notes: ["Canonical face, hair and burgundy wardrobe identity."],
  },
  {
    assetId: "kamau-muriuki-canonical-v1",
    worldId: "kamau-will",
    characterId: "muriuki",
    characterName: "Daniel Muriuki",
    canonicalPath: "public/storyworld/_vault/kamau-will/characters/muriuki-canonical-v1.png",
    sha256: "cb6553ac9e5d024f2b99aff1fcb81118a80b979ac8482a1adba681630f86beb2",
    approvedAt: "2026-09-12T12:41:00+03:00",
    source: "The Kamau Will approved premium visual bible",
    wardrobeVersion: "episode-01-v1",
    voiceProfileKey: "kamau-muriuki-v1",
    notes: ["Canonical older-lawyer identity and dark conservative suit."],
  },
  {
    assetId: "kamau-elias-canonical-v1",
    worldId: "kamau-will",
    characterId: "elias",
    characterName: "Elias Kamau",
    canonicalPath: "public/storyworld/_vault/kamau-will/characters/elias-canonical-v1.png",
    sha256: "0b0b51ffca124614b146aeace54d7823b7b2f18d1ad5214d5767c9cae7e3aa08",
    approvedAt: "2026-09-12T12:41:00+03:00",
    source: "The Kamau Will approved premium visual bible",
    wardrobeVersion: "founder-portrait-v1",
    voiceProfileKey: "kamau-elias-v1",
    notes: ["Canonical late-life Elias identity. Younger archival depictions must preserve recognizable facial geometry."],
  },
];

export const seedShotVault: SeedShotAsset[] = [
  { worldId: "kamau-will", shotId: "k01", seedPath: "public/storyworld/_vault/kamau-will/seed-shots/will-seed-v1.png", sha256: "de8c5e7fe96f4fc3f9a3181f597efdbdf605f85a408c566ff3a30bbd62576254", role: "generation-reference", notes: ["Concept seed for will macro composition."] },
  { worldId: "kamau-will", shotId: "k04", seedPath: "public/storyworld/_vault/kamau-will/seed-shots/announcement-seed-v1.png", sha256: "5b9d21ddceb61e56da70a9e7f12866354d54963649fb58e7dd4eef250d3f4267", role: "generation-reference", notes: ["Concept seed for Muriuki announcement framing."] },
  { worldId: "kamau-will", shotId: "k05", seedPath: "public/storyworld/_vault/kamau-will/seed-shots/victor-reaction-seed-v1.png", sha256: "40e9ba14846ee485334345aebcd06c75cab4d872508f0b2bc916ea34f3dd84b8", role: "generation-reference", notes: ["Concept seed for Victor reaction framing."] },
  { worldId: "kamau-will", shotId: "k06", seedPath: "public/storyworld/_vault/kamau-will/seed-shots/amaras-world-seed-v1.png", sha256: "64420a2caa74e06da01845d497c41f06c2790d56fb39469eb53c6a23d1cc8cdf", role: "generation-reference", notes: ["Concept seed for warm classroom look."] },
  { worldId: "kamau-will", shotId: "k10", seedPath: "public/storyworld/_vault/kamau-will/seed-shots/summons-seed-v1.png", sha256: "1b4e1ab1f890a523d140c36b00c3f678b4fb120a64869389610b70b593239229", role: "generation-reference", notes: ["Concept seed for school arrival composition."] },
  { worldId: "kamau-will", shotId: "k12", seedPath: "public/storyworld/_vault/kamau-will/seed-shots/letter-seed-v1.png", sha256: "e008c770aabc82b64869ce7b375e2721cebfcd6eb0970788dbcad25d02cc7876", role: "generation-reference", notes: ["Concept seed for envelope handoff."] },
  { worldId: "kamau-will", shotId: "k16", seedPath: "public/storyworld/_vault/kamau-will/seed-shots/revelation-seed-v1.png", sha256: "8e19300ba556cbd5be1831ca071984076d32b930ab92d8e8d62bdafd7caa732a", role: "generation-reference", notes: ["Concept seed for archival co-founder reveal."] },
  { worldId: "kamau-will", shotId: "k18", seedPath: "public/storyworld/_vault/kamau-will/seed-shots/confession-seed-v1.png", sha256: "4931b80c83267bb9684f01a30b4f260f42b1da76dc1ad680e733e2484197a49c", role: "generation-reference", notes: ["Concept seed for Amara confession reaction."] },
];

export function getLockedCharacter(worldId: string, characterId: string) {
  return lockedCharacterVault.find((asset) => asset.worldId === worldId && asset.characterId === characterId);
}

export function getSeedShot(worldId: string, shotId: string) {
  return seedShotVault.find((asset) => asset.worldId === worldId && asset.shotId === shotId);
}

export function getWorldLockedCharacters(worldId: string) {
  return lockedCharacterVault.filter((asset) => asset.worldId === worldId);
}
