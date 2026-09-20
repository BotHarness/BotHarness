import projection from "@/data/development-status.json";
import deepSeekBotEnglish from "../../../../CHANGELOG.md?raw";
import deepSeekBotChinese from "../../../../CHANGELOG.zh.md?raw";
import dshSkillEnglish from "../../../../.agents/skills/dsh-plugin-dev/CHANGELOG.md?raw";
import dshSkillChinese from "../../../../.agents/skills/dsh-plugin-dev/CHANGELOG.zh.md?raw";
import {
  buildDevelopmentStatus,
  type DevelopmentStatusArtifact,
  type DevelopmentStatusModel,
  type DevelopmentStatusState,
} from "../../../../scripts/development-status-view.mjs";

export type StatusLocale = "en" | "zh";

export const developmentStatus = buildDevelopmentStatus({
  projection: projection as Parameters<typeof buildDevelopmentStatus>[0]["projection"],
  deepSeekBot: { english: deepSeekBotEnglish, chinese: deepSeekBotChinese },
  dshSkill: { english: dshSkillEnglish, chinese: dshSkillChinese },
});

export const statusCopy = {
  en: {
    title: "Development status",
    description: "Current work and release state for DeepSeekBot and the DSH Skill.",
    intro:
      "This page keeps active and merged work visible without turning the Changelog into a project tracker.",
    states: {
      "in-progress": {
        title: "In progress",
        description: "Public work explicitly marked In Progress in the project roadmap.",
        empty: "No public work is currently assigned to this artifact.",
      },
      "merged-awaiting-release": {
        title: "Merged, awaiting release",
        description:
          "These changes are merged, but are not included in the latest stable artifact.",
        empty: "No merged changes are waiting for release.",
      },
      "pre-release": {
        title: "Pre-release",
        description: "Tagged, installable alpha, beta, or release-candidate artifacts.",
        empty: "No tagged installable pre-release is recorded.",
      },
      released: {
        title: "Released",
        description: "Stable versions recorded by this artifact's canonical Release Ledger.",
        empty: "No stable version has been released yet.",
      },
    },
    milestone: "Milestone",
    updated: "Updated",
    verifiedAgainst: "Verified against",
    sources: "Sources",
    synced: "Roadmap snapshot",
    artifacts: "Artifacts",
    releaseLedger: "Canonical Release Ledger",
  },
  zh: {
    title: "开发状态",
    description: "DeepSeekBot 与 DSH Skill 的当前工作及发布状态。",
    intro: "本页用于展示进行中和已合并的工作，不把 Changelog 变成项目进度追踪器。",
    states: {
      "in-progress": {
        title: "In progress",
        description: "在项目 Roadmap 中明确标记为 In Progress 的公开工作。",
        empty: "当前没有归属于这个 artifact 的公开进行中工作。",
      },
      "merged-awaiting-release": {
        title: "Merged, awaiting release",
        description: "这些变更已经合并，但尚未包含在最新的稳定 artifact 中。",
        empty: "当前没有等待发布的已合并变更。",
      },
      "pre-release": {
        title: "Pre-release",
        description: "已经 tag、可以安装的 alpha、beta 或 release candidate artifact。",
        empty: "当前没有记录已 tag 且可安装的预发布版本。",
      },
      released: {
        title: "Released",
        description: "由该 artifact 的 canonical Release Ledger 记录的稳定版本。",
        empty: "目前还没有发布稳定版本。",
      },
    },
    milestone: "Milestone",
    updated: "最近更新",
    verifiedAgainst: "核验版本",
    sources: "来源",
    synced: "Roadmap 快照",
    artifacts: "Artifacts",
    releaseLedger: "Canonical Release Ledger",
  },
} as const;

function linkLabel(url: string): string {
  const match = url.match(/\/(issues|pull)\/(\d+)(?:[?#].*)?$/);
  if (match) return `${match[1] === "pull" ? "PR" : "Issue"} #${match[2]}`;
  if (url.includes("/commit/")) return "DSH upstream";
  return "Source";
}

function localized(value: { en: string; zh: string }, locale: StatusLocale): string {
  return locale === "zh" ? value.zh : value.en;
}

function markdownArtifact(
  artifact: DevelopmentStatusArtifact,
  states: DevelopmentStatusState[],
  locale: StatusLocale,
): string[] {
  const copy = statusCopy[locale];
  const authorityPath = artifact.id === "deepseekbot" ? "/changelog" : "/dsh/releases";
  const authorityHref = locale === "zh" ? `/zh${authorityPath}` : authorityPath;
  const lines = [
    `## ${artifact.label}`,
    "",
    `[${copy.releaseLedger}](${authorityHref})`,
    "",
  ];
  for (const state of states) {
    const stateCopy = copy.states[state];
    lines.push(`### ${stateCopy.title}`, "", stateCopy.description, "");
    const items = artifact.states[state];
    if (items.length === 0) {
      lines.push(stateCopy.empty, "");
      continue;
    }
    for (const item of items) {
      if (item.kind === "in-progress") {
        lines.push(
          `- [${localized(item.title, locale)}](${item.url}) — ${copy.milestone}: ${item.milestone}; ${copy.updated}: ${item.updatedAt}`,
        );
      } else if (item.kind === "merged-awaiting-release") {
        const sources = item.links.map((url) => `[${linkLabel(url)}](${url})`).join(", ");
        lines.push(
          `- **${item.category}:** ${localized(item.title, locale)}${sources ? ` — ${copy.sources}: ${sources}` : ""}`,
        );
      } else {
        const sources = item.links.map((url) => `[${linkLabel(url)}](${url})`).join(", ");
        lines.push(
          `- **${item.version}** — ${item.date}; ${localized(item.title, locale)}${sources ? ` — ${copy.sources}: ${sources}` : ""}`,
        );
        if (item.provenance?.verifiedAgainst) {
          lines.push(`  - ${copy.verifiedAgainst}: ${item.provenance.verifiedAgainst}`);
        }
      }
    }
    lines.push("");
  }
  return lines;
}

/** Agent-readable counterpart of the bilingual Development status page. */
export function developmentStatusMarkdown(
  status: DevelopmentStatusModel,
  locale: StatusLocale,
): string {
  const copy = statusCopy[locale];
  const lines = [
    `# ${copy.title}`,
    "",
    copy.description,
    "",
    copy.intro,
    "",
    `${copy.synced}: ${status.syncedAt}`,
    "",
  ];
  for (const artifact of status.artifacts) {
    lines.push(...markdownArtifact(artifact, status.states, locale));
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function developmentStatusMarkdownResponse(locale: StatusLocale): Response {
  return new Response(developmentStatusMarkdown(developmentStatus, locale), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export { linkLabel, localized };
export type { DevelopmentStatusArtifact, DevelopmentStatusState };
