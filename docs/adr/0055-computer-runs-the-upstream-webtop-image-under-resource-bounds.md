---
Status: Accepted
Date: 2026-09-22
---

# The Computer pulls the upstream webtop image and runs under hard resource bounds

The Computer is a convenience resource a Human starts on their own machine, not the product's main workload. Every megabyte of image and every gigabyte of resident memory is paid on laptops that are also running DSH, so the default must be the smallest thing that is still a real desktop: an XFCE session with a browser, opened from the Channel sidebar, stopped when idle.

## Decision

- **The default image is the upstream `lscr.io/linuxserver/webtop:ubuntu-xfce`.** It already ships the XFCE desktop, a Chromium browser, and the generated `en_US.UTF-8` / `zh_CN.UTF-8` locales, so BotHarness pulls it instead of maintaining a derived image. The previous `botharness-computer:xfce-chrome` build (Google Chrome + locales on top of the same base) is removed: 3.76 GB and a local build step replaced by a 3.29 GB pull that is shared with every other webtop user.
- **BotHarness builds no image by default.** The `imageContext` / `buildOnMissing` configuration is gone; a deployment that wants extra packages points `image` at its own image and is responsible for building it. This removes the build path and its tests from the provider.
- **The browser shortcut lives in the volume and is created at start.** The base image's menu entry is not enough for a desktop a Human opens; `docker exec` copies `chromium.desktop` into `/config/Desktop` after the container is up (idempotent, best effort), and removes a stale `google-chrome.desktop` left by an older volume. Build-time writes under `/config` are shadowed by the mounted volume, which is why this cannot be an image layer.
- **Resource bounds are part of the contract, not a suggestion.** The default is 2C2G — `--cpus 2` and `--memory 2g --memory-swap 2g` (swap disabled, so memory cannot silently become disk) — plus `--shm-size 512m` (Chromium's shared memory is charged to the container), `--pids-limit 4096`, and an idle policy that stops the container after 30 minutes without viewers. Every bound is a plugin config key (`cpus`, `memory`, `shmSize`, `pidsLimit`, `idleStopMinutes`) so a Host can raise or lower it; the DSH Settings 插件配置 tab does not render them yet, because that surface only shows plugins that serve a settings namespace with a matching card (the Computer settings slice, [#168](https://github.com/BotHarness/BotHarness/issues/168)). Measured resident memory for the resting desktop fell from ~2.4 GiB (4 GiB limit, 1 GiB shm) to ~1.15 GiB of a 2 GiB limit.
- **An image change recreates the container on the next start**, including when it is currently running: the provider compares `Config.Image` with the configured image, force-removes the stale container, and creates a fresh one against the same volume. The volume, and therefore the browser profile, survives.

## Consequences

- Google-specific browser features (account sync, proprietary media codecs, Chrome-only enterprise policy) are not available in the default Computer. A deployment that needs them supplies its own image.
- The first start pulls ~1.5 GB and unpacks to ~3.3 GB on disk; there is no smaller upstream XFCE variant with a browser, and lighter window managers (icewm/openbox) were rejected as not desktop-like enough for the product.
- Resource limits are configuration, not code: `cpus`, `memory`, `shmSize`, `pidsLimit`, and `idleStopMinutes` are overridable per Host through the plugin config; a friendly Settings surface for them is part of [#168](https://github.com/BotHarness/BotHarness/issues/168).
- The desktop shortcut is created by an exec after start, so a container that starts without a running DSH start path (for example `docker start` by hand) may show an empty desktop until the next Computer start.
