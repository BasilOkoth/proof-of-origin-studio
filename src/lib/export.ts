import type { EpisodeProject } from "./types";

export function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function projectAsMarkdown(project: EpisodeProject) {
  const scenes = project.scenes
    .map(
      (scene, index) =>
        `## ${index + 1}. ${scene.headline}\n\n**${scene.eyebrow}**\n\n${scene.narration}\n`
    )
    .join("\n");

  return `# ${project.episode.workingTitle}

${project.episode.question}

## Evidence ledger

${project.evidence.map((e) => `- **${e.kind.toUpperCase()}** — ${e.statement}${e.source ? ` (${e.source})` : ""}`).join("\n")}

# Script

${scenes}

# Titles

${project.titles.map((t) => `- ${t}`).join("\n")}

# Shorts

${project.shorts.map((s) => `## ${s.title}\n${s.script}`).join("\n\n")}

# Thumbnail concepts

${project.thumbnails.map((t) => `- **${t.title} / ${t.kicker}** — ${t.visual}`).join("\n")}
`;
}
