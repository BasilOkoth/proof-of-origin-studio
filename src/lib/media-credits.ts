import type { EpisodeProject } from "./types";

export type MediaCredit = {
  assetId: string;
  name: string;
  provider?: string;
  creator?: string;
  attribution?: string;
  licenseName?: string;
  licenseUrl?: string;
  sourceUrl?: string;
};

export function projectMediaCredits(project: EpisodeProject): MediaCredit[] {
  return (project.assets || [])
    .map((asset: any) => {
      const p = asset.mediaProvenance;
      if (!p) return null;
      return {
        assetId: asset.id,
        name: asset.name,
        provider: p.provider,
        creator: p.creator,
        attribution: p.attribution,
        licenseName: p.licenseName,
        licenseUrl: p.licenseUrl,
        sourceUrl: p.sourceUrl,
      };
    })
    .filter(Boolean) as MediaCredit[];
}

export function creditsText(project: EpisodeProject) {
  const credits = projectMediaCredits(project);
  if (!credits.length) return "";

  return [
    "MEDIA CREDITS",
    ...credits.map((credit) => {
      const parts = [
        credit.attribution || credit.name,
        credit.licenseName,
        credit.sourceUrl,
      ].filter(Boolean);
      return `- ${parts.join(" · ")}`;
    }),
  ].join("\n");
}
