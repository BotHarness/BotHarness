import { Badge } from "@/components/coss/badge";
import { Button } from "@/components/coss/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/coss/card";
import { Frame, FramePanel } from "@/components/coss/frame";
import { Group, GroupSeparator, GroupText } from "@/components/coss/group";
import { Separator } from "@/components/coss/separator";

const PATHS = [
  {
    href: "/docs/overview",
    title: "用户文档",
    description: "BotHarness 是什么、怎么上手 —— 从总览与快速开始进入。",
  },
  {
    href: "/dev/architecture",
    title: "开发与审计",
    description: "架构、数据流、ADR 与平台规格，面向贡献者与审计者。",
  },
  {
    href: "/changelog",
    title: "Changelog",
    description: "每个版本改了什么，一行一条，按时间倒序。",
  },
] as const;

const CAPABILITIES = [
  {
    title: "PersonaBot",
    detail: "独立人格，跨 session、跨群聊持续存在。",
  },
  {
    title: "记忆即文件",
    detail: "Markdown + front-matter，可读可改可回滚。",
  },
  {
    title: "状态可见",
    states: [
      { label: "thinking", variant: "info" },
      { label: "working", variant: "default" },
      { label: "waiting", variant: "warning" },
      { label: "blocked", variant: "error" },
      { label: "done", variant: "success" },
      { label: "idle", variant: "outline" },
    ],
  },
  {
    title: "不 fork，不重建",
    detail: "DSH 之上的插件层，通道与路由复用 dsh-im。",
  },
] as const;

const CHANGELOG = [
  { date: "2026-09-17", title: "Astryx 首页（landing）" },
  { date: "2026-09-17", title: "v1.0 基线 · M1 骨架 · 文档站上线" },
] as const;

const GITHUB_URL = "https://github.com/BotHarness/BotHarness";

export default function Landing() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto w-full max-w-5xl px-4 pb-4 sm:px-6"
    >
      <section className="flex max-w-3xl flex-col items-start gap-5 border-b border-border py-12 sm:py-16">
        <Badge variant="outline">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: "var(--bh-brand-strong, #15803d)" }}
          />
          BotHarness · DSH 插件层
        </Badge>

        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          给 LLM agent 一份持久身份
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty sm:text-base">
          PersonaBot —— 带人格、跨 session 记忆、可并发工作的 Bot。BotHarness
          把「BOT」变成 DeepSeek Harness 上的一等实体。
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <GroupText className="font-mono text-xs text-foreground">
            <span aria-hidden="true" className="text-muted-foreground">
              $
            </span>
            {"pnpm install && pnpm build"}
          </GroupText>
          <span className="text-xs text-muted-foreground">
            从仓库构建 · npm 包未发布
          </span>
        </div>

        <Group>
          <Button render={<a href="/docs/quickstart" />}>快速开始</Button>
          <GroupSeparator />
          <Button variant="outline" render={<a href="/dev/architecture" />}>
            架构与数据流
          </Button>
        </Group>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button
            variant="link"
            size="sm"
            render={
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" />
            }
          >
            GitHub
          </Button>
          <span aria-hidden="true" className="text-xs text-border">
            ·
          </span>
          <Button variant="link" size="sm" render={<a href="/en/docs/overview" />}>
            English
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-b border-border py-10">
        <h2 className="text-lg font-semibold tracking-tight">三条路径</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PATHS.map((path) => (
            <a
              key={path.href}
              href={path.href}
              className="block h-full rounded-2xl outline-offset-2"
            >
              <Card className="h-full transition-colors hover:border-border-strong">
                <CardHeader className="gap-1 p-4">
                  <CardTitle className="text-base leading-snug">
                    {path.title}
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {path.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </a>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 border-b border-border py-10">
        <h2 className="text-lg font-semibold tracking-tight">核心能力</h2>
        <Frame>
          <FramePanel className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((capability) => (
              <div key={capability.title} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{capability.title}</span>
                {"detail" in capability ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {capability.detail}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {capability.states.map((state) => (
                      <Badge key={state.label} size="sm" variant={state.variant}>
                        {state.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </FramePanel>
        </Frame>
      </section>

      <section className="flex flex-col gap-4 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">最近变更</h2>
          <a
            href="/changelog"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            全部 →
          </a>
        </div>
        <Frame>
          <FramePanel className="p-1">
            <ul className="flex flex-col">
              {CHANGELOG.map((entry, index) => (
                <li key={entry.title} className="flex flex-col">
                  {index > 0 && <Separator />}
                  <a
                    href="/changelog"
                    className="flex items-baseline justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <span className="text-sm font-medium">{entry.title}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {entry.date}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </FramePanel>
        </Frame>
      </section>

      <footer className="border-t border-border py-6">
        <p className="font-mono text-xs text-muted-foreground">
          botharness.ai · MIT · © 2026 BotHarness
        </p>
      </footer>
    </main>
  );
}
