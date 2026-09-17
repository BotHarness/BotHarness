# 文档站部署（Cloudflare Workers）

`apps/docs` 是 Nimbus（Astro 7）静态站点，产出 `dist/`，由 Cloudflare Workers Static Assets 托管。

- 域名：**`botharness.ai` 与 `botharness.dev` 都绑定同一个 Worker**，服务同一份站点（同一构建、同一内容）
- 区块：`/docs` 用户文档 · `/dev` 开发者与审计（规格 / PRD / ADR / 架构） · `/changelog`
- Account：`332e72d480d7cb3e60ee671d3ca0cad0`（yangmufeng233@gmail.com）
- Worker 名：`botharness-docs`（见 `apps/docs/wrangler.jsonc`）

## 首次部署（Workers Builds，Git 集成，无需 API Token）

1. Cloudflare Dashboard → Workers & Pages → Create → **Import a repository** → 选 `BotHarness/BotHarness`。
2. Worker 名称填 `botharness-docs`（必须与 `wrangler.jsonc` 的 `name` 一致）。
3. Build 配置：
   - **Root directory**：`apps/docs`
   - **Build command**：`pnpm build`（会先跑 `scripts/sync-docs.mjs`）
   - **Deploy command**：`pnpm exec wrangler deploy`
4. 首次构建通过后，Worker 会拿到 `<version>-botharness-docs.<subdomain>.workers.dev`；在 Settings → Domains & Routes 把 **`botharness.ai` 和 `botharness.dev` 都加为自定义域名**（同一 Worker、同一份内容，无需重定向）。

## PR 预览

Workers Builds 对非生产分支自动产出预览 URL（`preview_urls: true`），PR 里会评论链接；免费额度 1 并发构建 / 3000 构建分钟每月。

## 本地部署（可选）

```bash
pnpm docs:build            # 同步 + 构建
pnpm docs:deploy           # 构建 + wrangler deploy（需 wrangler login）
```

API Token（如用 GitHub Actions 路线）放 GitHub secrets，权限仅需 **Workers Scripts: Edit**；**不要**提交到仓库或贴进对话。

## 缓存

`apps/docs/public/_headers` 已为 `/_astro/*`（带指纹的资源）设置一年 immutable 缓存；HTML 走 Workers 默认的 `must-revalidate` + ETag。
