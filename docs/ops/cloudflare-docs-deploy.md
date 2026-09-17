# 文档站部署（Cloudflare Workers）

`apps/docs` 是 Nimbus（Astro 7）静态站点，产出 `dist/`，由 Cloudflare Workers Static Assets 托管。

- 生产域名：`botharness.ai`
- `.dev`：301 → `botharness.ai`（zone 级 Single Redirect，**不**绑 Worker）
- Account：`332e72d480d7cb3e60ee671d3ca0cad0`（yangmufeng233@gmail.com）
- Worker 名：`botharness-docs`（见 `apps/docs/wrangler.jsonc`）

## 首次部署（Workers Builds，Git 集成，无需 API Token）

1. Cloudflare Dashboard → Workers & Pages → Create → **Import a repository** → 选 `BotHarness/BotHarness`。
2. Worker 名称填 `botharness-docs`（必须与 `wrangler.jsonc` 的 `name` 一致）。
3. Build 配置：
   - **Root directory**：`apps/docs`
   - **Build command**：`pnpm build`（会先跑 `scripts/sync-docs.mjs`）
   - **Deploy command**：`pnpm exec wrangler deploy`
4. 首次构建通过后，Worker 会拿到 `<version>-botharness-docs.<subdomain>.workers.dev`；把它加为自定义域名 `botharness.ai`（Settings → Domains & Routes → Add custom domain）。
5. `.dev` 不绑定 Worker：在 `botharness.dev` zone 加一条 **Single Redirect**（Rules → Redirect Rules）：
   - 条件：`Hostname equals botharness.dev`（以及 `www.botharness.dev` 可选）
   - 目标：`https://botharness.ai$1`，状态码 `301`
   - 需要 `.dev` zone 里有一条代理的占位记录（`A 192.0.2.0` 或 `AAAA 100::`，Proxied）。

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
