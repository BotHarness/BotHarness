# DeepSeekBot Town

DeepSeekBot（BotHarness）像素小镇宣传片：Three.js r186 单文件 HTML，10920 帧 @ 60fps（约 3 分钟），首尾都是标题卡，动画只由帧号驱动；8bit BGM 在页面内由确定性合成器生成，按 120 BPM 与帧对齐（一小节 = 120 帧）。

```bash
python3 -m http.server 8765   # 在本目录运行，再打开 http://127.0.0.1:8765/
```

- `?lang=en` 切换英文；所有句子都在 `index.html` 顶部的 `STR` 表里，新增语言只需加一列。
- 点击画面或按 `M` 播放 BGM；空格暂停，左右方向键逐帧；`?play=0&f=3450` 停在某一帧。
- `DEBUG_FRAMES`：左上角帧号。导出前改成 `false`，或按 `D`，或打开 `?debug=0`。
- 导出：`window.botTown.renderFrame(f)` 逐帧渲染，`window.botTown.wavBase64()` 取得完整音轨 WAV。
- `avatars/`：由 #806 像素 Avatar Family 生成器（`pixelFigure`、`pixelFaceCells`、`pixelSymbolCells`）直接导出，未重绘。Mira = 预设 2，Theo = 预设 1，Nova = 预设 10；`-turn` 为 yaw 40°；`morph.json` 是 morph 用的脸部与状态符号像素；`crowd/` 是 12 个预设加 36 个按名字生成的头像；`wall-atlas.png` 是 60 个头像各 20 步、每步只改一个参数的序列。
- `ui/`：仓库内 PR 验收截图与 README 吉祥物，作为真实产品 UI 展示。Discord 与 Marketplace（Soul registry）尚未交付，画面中标注「规划中」。
- `v1-15s.html`：第一版 15 秒短片。
