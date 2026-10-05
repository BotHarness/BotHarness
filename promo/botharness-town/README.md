# DeepSeekBot Town

15 秒像素小镇宣传片：Three.js r186 单文件 HTML，900 帧 @ 60fps，循环首尾一致，动画只由帧号驱动。

```bash
python3 -m http.server 8765   # 在本目录运行，再打开 http://127.0.0.1:8765/
```

- `DEBUG_FRAMES`：左上角帧号。导出前改成 `false`，或按 `D`，或打开 `?debug=0`。
- `?play=0&f=330`：停在某一帧；空格暂停，左右方向键逐帧。
- `window.botTown.renderFrame(f)`：逐帧导出用。
- `avatars/`：由 #806 像素 Avatar Family 生成器（`packages/core/src/bots/avatar-pixel.ts` 的 `pixelFigure`）直接导出的 32×32 PNG，未重绘。Mira = 预设 2（辫子花冠），Theo = 预设 1（贝雷帽），Nova = 预设 10（耳机眼镜）；`-turn` 为 yaw 40° 输出。
