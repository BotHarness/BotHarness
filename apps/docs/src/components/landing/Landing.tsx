import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

const FEATURES = [
  {
    title: "PersonaBot",
    body: "独立人格与跨会话记忆；一个 Bot 可同时处理多个 Session。",
  },
  {
    title: "记忆即文件",
    body: "Markdown + front-matter，可读可改可 git 回滚，正文按需检索。",
  },
  {
    title: "状态可见",
    body: "六态（thinking / working / waiting / blocked / done / idle）聚合到 Bot，roster 与形象实时反映。",
  },
  {
    title: "不 fork，不重造",
    body: "DSH 之上的插件层；通道、卡片、路由复用 dsh-im。",
  },
] as const;

const STATES = [
  { label: "thinking", variant: "info" },
  { label: "working", variant: "blue" },
  { label: "waiting", variant: "warning" },
  { label: "blocked", variant: "error" },
  { label: "done", variant: "success" },
  { label: "idle", variant: "neutral" },
] as const;

const DOC_LINKS = [
  {
    href: "/spec/platform",
    title: "平台规格",
    description: "PersonaBot、记忆、状态与工作方式",
  },
  {
    href: "/spec/app-prd",
    title: "应用 PRD",
    description: "DeepSeekBot 的用户故事与验收标准",
  },
  {
    href: "/adr/0015-botharness-is-a-dsh-plugin-layer",
    title: "决策记录",
    description: "ADR-0015：BotHarness 是 DSH 插件层",
  },
  {
    href: "/changelog",
    title: "Changelog",
    description: "每个版本的变更",
  },
] as const;

export default function Landing() {
  return (
    <div data-bh-landing>
      <main id="main-content" tabIndex={-1}>
        <Section paddingBlock={10} paddingInline={4} dividers={["bottom"]}>
          <Center axis="horizontal">
            <VStack gap={4} hAlign="center" width="100%" maxWidth={880}>
              <Badge variant="green" label="BotHarness · DSH 插件层" />
              <Heading level={1} type="display-2" justify="center">
                给 LLM agent 一份持久身份
              </Heading>
              <Text type="large" color="secondary" justify="center" textWrap="pretty">
                PersonaBot —— 带人格、跨 session 记忆、可并发工作的 Bot。BotHarness 把「BOT」变成
                DeepSeek Harness 上的一等实体。
              </Text>
              <HStack
                gap={3}
                wrap="wrap"
                hAlign="center"
                vAlign="center"
                paddingBlockStart={1}
              >
                <Button label="快速开始" variant="primary" href="/quickstart" />
                <Button label="架构与数据流" variant="secondary" href="/architecture" />
                <Link
                  href="https://github.com/BotHarness/BotHarness"
                  isExternalLink
                  weight="medium"
                >
                  GitHub
                </Link>
              </HStack>
            </VStack>
          </Center>
        </Section>

        <Section paddingBlock={8} paddingInline={4}>
          <Center axis="horizontal">
            <VStack gap={5} width="100%" maxWidth={1120}>
              <VStack gap={1}>
                <Heading level={2}>核心能力</Heading>
                <Text color="secondary">
                  人格、记忆、状态、复用——BotHarness 的四个关键词。
                </Text>
              </VStack>

              <Grid columns={{ minWidth: 250, max: 4 }} gap={3}>
                <Card variant="green" padding={4}>
                  <VStack gap={2}>
                    <Heading level={3}>{FEATURES[0].title}</Heading>
                    <Text color="secondary">{FEATURES[0].body}</Text>
                  </VStack>
                </Card>

                <Card variant="default" padding={4}>
                  <VStack gap={2}>
                    <Heading level={3}>{FEATURES[1].title}</Heading>
                    <Text color="secondary">{FEATURES[1].body}</Text>
                    <Divider />
                    <Text type="code">{"bots/<slug>/memory/"}</Text>
                  </VStack>
                </Card>

                <Card variant="muted" padding={4}>
                  <VStack gap={2}>
                    <Heading level={3}>{FEATURES[2].title}</Heading>
                    <Text color="secondary">{FEATURES[2].body}</Text>
                    <HStack gap={1} wrap="wrap">
                      {STATES.map((state) => (
                        <Badge
                          key={state.label}
                          variant={state.variant}
                          label={state.label}
                        />
                      ))}
                    </HStack>
                  </VStack>
                </Card>

                <Card variant="default" padding={4}>
                  <VStack gap={2}>
                    <Heading level={3}>{FEATURES[3].title}</Heading>
                    <Text color="secondary">{FEATURES[3].body}</Text>
                    <Text type="supporting">SDK + bundle 形态交付，DSH 内核不动。</Text>
                  </VStack>
                </Card>
              </Grid>
            </VStack>
          </Center>
        </Section>

        <Section variant="muted" paddingBlock={8} paddingInline={4} dividers={["bottom"]}>
          <Center axis="horizontal">
            <VStack gap={3} width="100%" maxWidth={820}>
              <Badge variant="neutral" label="为什么" />
              <Heading level={2}>为什么需要 BotHarness</Heading>
              <Text type="large" color="secondary" textWrap="pretty">
                现有 harness 都以 session 为单位，跨 session 至多是一份「云记忆」，没有一个带人格、
                可跨会话工作的 Bot 实体。BotHarness 补的正是这一层——灵感来自 Grok Bot 与 DeepSeek
                Harness。
              </Text>
            </VStack>
          </Center>
        </Section>

        <Section paddingBlock={8} paddingInline={4}>
          <Center axis="horizontal">
            <VStack gap={4} width="100%" maxWidth={1120}>
              <VStack gap={1}>
                <Heading level={2}>文档</Heading>
                <Text color="secondary">从这几篇开始了解 BotHarness。</Text>
              </VStack>

              <Grid columns={{ minWidth: 220, max: 4 }} gap={3}>
                {DOC_LINKS.map((doc) => (
                  <ClickableCard key={doc.href} label={doc.title} href={doc.href} padding={4}>
                    <VStack gap={1}>
                      <Heading level={3}>{doc.title}</Heading>
                      <Text type="supporting">{doc.description}</Text>
                    </VStack>
                  </ClickableCard>
                ))}
              </Grid>
            </VStack>
          </Center>
        </Section>

        <Section variant="transparent" paddingBlock={6} paddingInline={4}>
          <Center axis="horizontal">
            <VStack gap={4} width="100%" maxWidth={1120}>
              <Divider />
              <Text type="supporting" className="bh-mono bh-muted">
                botharness.ai · MIT · © 2026 BotHarness
              </Text>
            </VStack>
          </Center>
        </Section>
      </main>
    </div>
  );
}
