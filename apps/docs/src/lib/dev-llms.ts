export interface DevLlmsPage {
  title: string;
  description?: string;
  url: string;
}

const GROUPS = ["design", "guides", "reference", "adr"] as const;
type DevGroup = (typeof GROUPS)[number];

const LABELS: Record<"en" | "zh", Record<DevGroup, string>> = {
  en: {
    design: "Design",
    guides: "Guides",
    reference: "Reference",
    adr: "Decisions",
  },
  zh: {
    design: "Design",
    guides: "Guides",
    reference: "Reference",
    adr: "Decisions",
  },
};

export function cleanMarkdownUrl(url: string): string {
  const canonical = url.replace(/\/+$/, "");
  return canonical.length === 0 ? "/index.md" : `${canonical}.md`;
}

function devGroup(url: string): DevGroup | null {
  const segments = url.replace(/^\/+|\/+$/g, "").split("/");
  if (segments[0] === "zh") segments.shift();
  if (segments[0] !== "dev") return null;
  if (segments.length === 1) return "design";
  return GROUPS.includes(segments[1] as DevGroup) ? (segments[1] as DevGroup) : null;
}

export function renderDevLlms(options: {
  origin: string;
  language: "en" | "zh";
  pages: DevLlmsPage[];
}): string {
  const grouped = new Map<DevGroup, DevLlmsPage[]>(GROUPS.map((group) => [group, []]));
  for (const page of options.pages) {
    const group = devGroup(page.url);
    if (!group) throw new Error(`Unclassified /dev page in llms.txt: ${page.url}`);
    grouped.get(group)?.push(page);
  }

  const lines = [
    options.language === "zh"
      ? "# BotHarness 开发文档"
      : "# BotHarness developer documentation",
    "",
    options.language === "zh"
      ? "Design 描述目标；Reference 描述当前代码。"
      : "Design describes the target; Reference describes the current code.",
    "",
  ];
  for (const group of GROUPS) {
    lines.push(`## ${LABELS[options.language][group]}`, "");
    for (const page of (grouped.get(group) ?? []).sort((a, b) => a.url.localeCompare(b.url))) {
      const url = `${options.origin}${cleanMarkdownUrl(page.url)}`;
      lines.push(
        `- [${page.title}](${url})${page.description ? ` — ${page.description}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
