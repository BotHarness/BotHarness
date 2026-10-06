/**
 * PROTOTYPE (throwaway) — 页面装配。组件本身在 dotmatrix.js（五层：栅格轮廓 /
 * order / 亮包络 / 字形 / 渲染器）；这里只把层与层绑到右栏，并把每个组合摊开
 * 让人眼扫一遍。
 */
(function () {
  const DM = globalThis.DotMatrix;
  const { PRESET_KEYS, SILHOUETTE_KEYS, DOT_SHAPE_KEYS, DOT_SHAPES, STATE_KEYS, STATE_PRESETS } =
    DM;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // icon 那一档的尺寸梯度：14px 是 shell 自己 StateDot 的 ongoing 尺寸，
  // 3px 以下点就不再是点了
  const SIZE_LADDER = [64, 48, 32, 24, 18, 14];
  const ICON_SIZES = [16, 20, 24, 32, 48];

  const opts = {
    ...DM.DEFAULTS,
    preset: 'spiral',
    silhouette: 'circle',
    dot: 'square',
    cols: 5,
    rows: 5,
    size: 240, // px — 组件盒子；两个渲染器都从它出发，谁也不测量 DOM
    dotSize: 0.55, // 格子占比，不是绝对长度
    grow: 0.5,
    floor: 0.16,
    speed: 1,
    spec: { ...DM.GLYPH_DEFAULTS, ...DOT_SHAPES.square.spec },
  };

  const el = (html) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  };
  const heroSvg = document.getElementById('hero-svg');
  const heroCss = document.getElementById('hero-css');
  const rail = document.getElementById('rail');
  const sizes = document.getElementById('sizes');
  const keyframeTag = document.getElementById('dmx-keyframes');

  // 每帧重新生成所有 keyframes 是不必要的；但它们依赖 --dm-s / --dm-s-min 这类
  // CSS 变量而非具体数值，所以只需在 preset 变化时写一次
  const writeKeyframes = () => {
    keyframeTag.textContent = PRESET_KEYS.map((k) => DM.keyframesFor(k))
      .filter(Boolean)
      .join('\n');
  };
  writeKeyframes();

  /* ---- 两条 hero ------------------------------------------------------- */
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-55 -55 110 110');
  svg.setAttribute('fill', 'currentColor');
  heroSvg.appendChild(svg);
  const cssHost = el('<div class="dmx-host"></div>');
  heroCss.appendChild(cssHost);

  const svgMatrix = DM.createMatrix(opts);
  svgMatrix.mount(svg, 'svg');
  const cssMatrix = DM.createMatrix(opts);
  cssMatrix.mount(cssHost, 'css');

  function syncRenderers() {
    svgMatrix.set(opts);
    cssMatrix.set(opts);
    if (!cssMatrix.cssGap()) {
      cssHost.replaceChildren();
      cssMatrix.mount(cssHost, 'css');
    } else {
      cssHost.replaceChildren(el(`<div class="dmx-gap">${cssMatrix.cssGap()}</div>`));
    }
    gapNote.textContent = cssMatrix.cssGap() ? `CSS 缺口：${cssMatrix.cssGap()}` : '';
  }

  /* ---- 尺寸阶梯：把每个 动效×轮廓×字形 组合摊开 ---------------------- */
  function buildLadder() {
    sizes.innerHTML = `
      <h2>组合阶梯</h2>
      <p>每个动效一行，在 64/36/24/18/14px 上各一格。14px 是 shell 自己 ongoing
         指示器的尺寸；再小点就糊了，那时候该缩网格而不是缩点。改变轮廓不会重排
         order（order 仍在完整方阵上算），所以换剪影时动画不会重启。</p>
      <div class="rows"></div>`;
    const rows = sizes.querySelector('.rows');
    for (const preset of PRESET_KEYS.filter((p) => p !== 'off')) {
      const task = DM.PRESETS[preset]?.task ?? preset;
      const row = el(`<div class="row"><span class="name">${task}<br />${preset}</span></div>`);
      for (const px of SIZE_LADDER) {
        const cell = px / Math.max(opts.cols, opts.rows);
        const svgSmall = document.createElementNS(SVG_NS, 'svg');
        svgSmall.setAttribute('viewBox', '-55 -55 110 110');
        svgSmall.setAttribute('width', px);
        svgSmall.setAttribute('height', px);
        svgSmall.setAttribute('fill', 'currentColor');
        svgSmall.innerHTML = DM.toSvg(
          { ...opts, preset, dotSize: cell / 100 / 2, grow: opts.grow, t: 0.15 },
          0.15,
        );
        row.appendChild(
          el(`<div class="cell">${svgSmall.outerHTML}<span class="px">${px}</span></div>`),
        );
      }
      // 每个动效附一个 CSS 格子做同尺度对照；表达不了的留一个显式缺口
      const built = DM.toDom({ ...opts, preset, cols: 5, rows: 5, dotSize: 0 });
      if (built) {
        const mini = el('<div class="dmx-host"></div>');
        mini.style.width = '36px';
        mini.style.height = '36px';
        mini.style.overflow = 'hidden';
        mini.style.gridTemplateColumns = 'repeat(5, 5px)';
        mini.style.gridTemplateRows = 'repeat(5, 5px)';
        mini.style.setProperty('--dm-anim', `dm-${preset}`);
        mini.style.setProperty('--dm-k', String(built.preset.spread));
        mini.style.setProperty('--dm-seed', String(-built.preset.spread));
        mini.style.setProperty('--dm-mask', built.mask);
        mini.style.setProperty('--dm-fill', '0.7');
        mini.style.setProperty('--dm-s-min', (1 - opts.grow).toFixed(3));
        mini.style.setProperty('--dm-s', (1 + opts.grow * 0.9).toFixed(3));
        mini.style.setProperty('--dm-floor', String(opts.floor));
        mini.dataset.timing = built.env.steps ? `steps-${built.env.steps}` : 'linear';
        mini.appendChild(built.frag);
        row.appendChild(el('<figure></figure>').appendChild(mini).parentElement);
        row.lastElementChild.appendChild(el('<figcaption>css 36px</figcaption>'));
      } else {
        row.appendChild(el('<div class="gap-note">无 css 等价物</div>'));
      }
      rows.appendChild(row);
    }
    // the narrow-grid strip: the same presets on a 2×5, which is where a spiral
    // stops being a loop and the snake becomes the right answer
    const narrow = el(`<div class="rows"></div>`);
    for (const preset of PRESET_KEYS.filter((p) => p !== 'off')) {
      const row = el(`<div class="row"><span class="name">${preset}</span></div>`);
      for (const [c, r] of [
        [2, 5],
        [5, 2],
        [3, 3],
      ]) {
        const px = 84;
        const s2 = document.createElementNS(SVG_NS, 'svg');
        s2.setAttribute('viewBox', `${-px / 2} ${-px / 2} ${px} ${px}`);
        s2.setAttribute('width', px);
        s2.setAttribute('height', px);
        s2.setAttribute('fill', 'currentColor');
        s2.innerHTML = DM.toSvg({ ...opts, preset, size: px, cols: c, rows: r }, 0.15);
        row.appendChild(
          el(`<div class="cell">${s2.outerHTML}<span class="px">${c}×${r}</span></div>`),
        );
      }
      narrow.appendChild(row);
    }
    const block = el(`<div style="margin-top:14px"><h2>窄栅格</h2>
      <p>同一个动效在 2×5 / 5×2 / 3×3 上的样子。螺旋需要转弯的空间——只有两格宽时
         「环」会断成不相连的碎片，那就不是一条路径了；此时它退回到列蛇形，而这正是
         窄栅格该有的循环（第一列从上到下，第二列从下到上）。</p></div>`);
    block.appendChild(narrow);
    rows.parentElement.appendChild(block);
  }

  /* ---- 右栏 ------------------------------------------------------------ */
  const pick = (label, value, options, onChange, labeller = (o) => o) => {
    const row = el(
      `<div class="row"><label>${label}</label><select>${options
        .map((o) => `<option value="${o}">${labeller(o)}</option>`)
        .join('')}</select></div>`,
    );
    const s = row.querySelector('select');
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return row;
  };
  /**
   * `tick` draws a labelled mark on the track at a live position — used where a
   * meaningful value is not where a naive scale would put it. The dot slider is
   * the case that needs it: the dot is a share of its CELL, so two dots touch at
   * `1 + gap`, and that point slides whenever the gap dial moves. A tick that
   * tracks it is the difference between "I think I'm at 100%" and knowing it.
   */
  let dotRow = null;
  const range = (label, get, set, min, max, step, fmt, tick) => {
    const row = el(
      `<div class="row"><label>${label}</label><div class="track"><input type="range" min="${min}" max="${max}" step="${step}" /><i class="tick"></i></div><span class="val"></span></div>`,
    );
    const input = row.querySelector('input');
    const out = row.querySelector('.val');
    const mark = row.querySelector('.tick');
    const sync = () => {
      input.value = get();
      out.textContent = fmt(get());
      if (!tick) {
        mark.hidden = true;
        return;
      }
      const t = tick();
      if (!t || t.at < min || t.at > max) {
        mark.hidden = true;
        return;
      }
      mark.hidden = false;
      mark.style.left = `${((t.at - min) / (max - min)) * 100}%`;
      mark.dataset.label = t.label;
    };
    input.addEventListener('input', () => {
      set(parseFloat(input.value));
      sync();
    });
    row.sync = sync;
    sync();
    return row;
  };
  const colorRow = (label, get, set) => {
    const row = el(`<div class="row"><label>${label}</label><input type="color" /></div>`);
    const input = row.querySelector('input');
    input.value = get();
    input.addEventListener('input', () => set(input.value));
    return row;
  };
  const title = (t) => el(`<div class="panel-title">${t}</div>`);

  /**
   * size, the way an icon component takes it: one number in px, with the usual
   * presets a click away. The hero boxes are pinned to the largest preset while
   * previewing, so the pane never has to resize itself.
   */
  function sizeRow() {
    const wrap = el('<div></div>');
    wrap.appendChild(
      range(
        'size px',
        () => opts.size,
        setOpt('size'),
        12,
        320,
        1,
        (v) => v.toFixed(0),
      ),
    );
    const picks = el('<div class="btns" style="margin-top:6px"></div>');
    for (const px of ICON_SIZES) {
      const b = el(`<button data-px="${px}">${px}</button>`);
      b.addEventListener('click', () => {
        opts.size = px;
        // the hero cannot shrink below a readable size, so the panes keep their
        // own box and the ladder is where small sizes are judged
        changed();
      });
      picks.appendChild(b);
    }
    wrap.appendChild(picks);
    return wrap;
  }

  const state = el('<pre class="state"></pre>');
  const gapNote = el('<p class="note gap-warn"></p>');
  const gallery = document.getElementById('gallery');

  /** every mutation funnels through here: the glyph's spec is owned by `opts` */
  const changed = () => {
    syncRenderers();
    buildLadder();
    buildGallery();
    refresh();
    // the dot slider's 紧贴 tick is a function of the gap dials, so it has to be
    // re-read whenever anything else moves
    dotRow?.sync?.();
  };
  const setOpt = (key) => (v) => {
    opts[key] = v;
    changed();
  };
  const setSpec = (key) => (v) => {
    opts.spec = { ...opts.spec, [key]: v };
    opts.dot = 'custom'; // the sliders now own the polygon
    changed();
  };

  /**
   * The polygon gallery: one real fillet path per named glyph, and a live
   * highlight of the one in use. Clicking seeds `opts.spec` from it.
   */
  function buildGallery() {
    gallery.innerHTML = '';
    for (const key of DOT_SHAPE_KEYS) {
      const entry = DOT_SHAPES[key];
      const { d } = DM.glyphPath({ ...DM.GLYPH_DEFAULTS, ...entry.spec });
      const active = opts.dot === key;
      const btn = el(
        `<button aria-pressed="${active}" title="sides=${entry.spec.sides ?? 4} radius=${entry.spec.radius ?? 0} inner=${entry.spec.innerRadius ?? 0}">` +
          `<svg viewBox="-1.3 -1.3 2.6 2.6" width="46" height="46"><path d="${d}" fill="currentColor"/></svg>` +
          `<span class="g-label">${entry.label}</span></button>`,
      );
      btn.addEventListener('click', () => {
        opts.spec = { ...DM.GLYPH_DEFAULTS, ...entry.spec };
        opts.dot = key;
        changed();
      });
      gallery.appendChild(btn);
    }
    // a live preview of the CURRENT polygon, with the inradius marked, so the
    // "fully rounded == circle" relationship is visible rather than folklore
    const { d, inradius } = DM.glyphPath(opts.spec);
    const live = el(
      `<button aria-pressed="true" title="当前多边形：内切半径 ${inradius.toFixed(3)}">` +
        `<svg viewBox="-1.3 -1.3 2.6 2.6" width="46" height="46">` +
        `<path d="${d}" fill="currentColor"/>` +
        `<circle cx="0" cy="0" r="${inradius.toFixed(3)}" fill="none" stroke="var(--accent)" stroke-width="0.03" stroke-dasharray="0.08 0.06"/>` +
        `</svg><span class="g-label">当前</span></button>`,
    );
    live.addEventListener('click', () => changed());
    gallery.appendChild(live);
  }

  rail.append(
    title('1 · 尺寸'),
    sizeRow(),
    range(
      '留白',
      () => opts.fill,
      setOpt('fill'),
      0.3,
      1,
      0.02,
      (v) => `${Math.round(v * 100)}%`,
    ),
    el(`<p class="note">size 是组件盒子（px），像 icon 组件那样；下面是常用档位。
         点大小是<b>格子的百分比</b>，所以同一组参数在 14px 和 240px 下观感一致。</p>`),
    title('2 · 栅格与轮廓'),
    pick('动效', opts.preset, PRESET_KEYS, setOpt('preset'), (k) =>
      DM.PRESETS[k] ? `${DM.PRESETS[k].task} · ${k}` : k,
    ),
    pick(
      'agent 状态',
      'thinking',
      STATE_KEYS,
      (v) => {
        opts.preset = STATE_PRESETS[v];
        changed();
      },
      (k) => `${k} → ${STATE_PRESETS[k]}`,
    ),
    el(`<p class="note">动效按<b>动作</b>命名，状态按<b>agent 语义</b>命名 —— 右边这一栏
         就是「产品语言 → 动效」的翻译表。</p>`),
    pick('轮廓', opts.silhouette, SILHOUETTE_KEYS, setOpt('silhouette')),
    range(
      '列数',
      () => opts.cols,
      setOpt('cols'),
      1,
      16,
      1,
      (v) => v.toFixed(0),
    ),
    range(
      '行数',
      () => opts.rows,
      setOpt('rows'),
      1,
      16,
      1,
      (v) => v.toFixed(0),
    ),
    range(
      '列间 gap',
      () => opts.gapX,
      setOpt('gapX'),
      0,
      3,
      0.05,
      (v) => `${v.toFixed(2)}×格`,
    ),
    range(
      '行间 gap',
      () => opts.gapY,
      setOpt('gapY'),
      0,
      3,
      0.05,
      (v) => `${v.toFixed(2)}×格`,
    ),
    el(`<p class="note">gap 是<b>格子</b>的倍数，两个轴独立 —— 竖排和横排本来就是两种东西。
         点按<b>较紧那一轴</b>定尺寸，所以永远不会挤到邻居。</p>`),
    title('3 · 多边形字形'),
    pick('预设', opts.dot, [...DOT_SHAPE_KEYS, 'custom'], (v) => {
      if (v !== 'custom') opts.spec = { ...DM.GLYPH_DEFAULTS, ...DOT_SHAPES[v].spec };
      opts.dot = v;
      changed();
    }),
    range(
      '顶点数',
      () => opts.spec.sides,
      setSpec('sides'),
      3,
      12,
      1,
      (v) => v.toFixed(0),
    ),
    range(
      '外圆角',
      () => opts.spec.radius,
      setSpec('radius'),
      0,
      1,
      0.02,
      (v) => (v >= DM.glyphPath(opts.spec).inradius - 0.02 ? `${v.toFixed(2)} 满` : v.toFixed(2)),
    ),
    range(
      '内圆角',
      () => opts.spec.innerRadius,
      setSpec('innerRadius'),
      0,
      0.6,
      0.02,
      (v) => v.toFixed(2),
    ),
    range(
      '星形比',
      () => opts.spec.star,
      setSpec('star'),
      0,
      0.6,
      0.02,
      (v) => v.toFixed(2),
    ),
    range(
      '旋转 °',
      () => (opts.spec.spin * 180) / Math.PI,
      (v) => {
        opts.spec = { ...opts.spec, spin: v / 180 };
        opts.dot = 'custom';
        changed();
      },
      -180,
      180,
      5,
      (v) => v.toFixed(0),
    ),
    range(
      '横纵比',
      () => opts.spec.aspect,
      setSpec('aspect'),
      0.25,
      1,
      0.05,
      (v) => v.toFixed(2),
    ),
    el(
      `<p class="note">外圆角拉到<b>满</b>（内切半径）时多边形就并成了圆 —— 矩形和圆是同一组顶点。
         内圆角只作用在凹角上：0 是硬边星，拉高腰部变柔。</p>`,
    ),
    title('4 · 质感'),
    range(
      '点涨缩',
      () => opts.grow,
      setOpt('grow'),
      0,
      1,
      0.05,
      (v) => v.toFixed(2),
    ),
    (dotRow = range(
      '点大小',
      () => opts.dotSize,
      setOpt('dotSize'),
      0.05,
      3,
      0.01,
      (v) => `${Math.round(v * 100)}%`,
      // two dots touch when the dot is exactly one PITCH wide, and the pitch is
      // the cell times (1 + gap) — so the touching point is a function of the gap
      // dial, not a fixed 100%. Marked on the track instead of hidden.
      () => ({ at: 1 + Math.max(opts.gapX, opts.gapY), label: '紧贴' }),
    )),
    range(
      '底噪',
      () => opts.floor,
      setOpt('floor'),
      0.04,
      0.5,
      0.02,
      (v) => v.toFixed(2),
    ),
    range(
      '速度',
      () => opts.speed,
      setOpt('speed'),
      0.3,
      2.5,
      0.05,
      (v) => v.toFixed(2),
    ),
    range(
      '错峰 stagger',
      () => opts.stagger ?? DM.PRESETS[opts.preset].spread,
      (v) => {
        opts.stagger = v;
        changed();
      },
      0,
      1.5,
      0.01,
      (v) => (v < 0.005 ? '预设' : v.toFixed(2)),
    ),
    range(
      '波宽 softness',
      () => opts.softness,
      setOpt('softness'),
      0,
      1,
      0.02,
      (v) => v.toFixed(2),
    ),
    el(
      `<p class="note"><b>stagger</b> 是相邻两批点错开多少相位；拧到 0 就是整场一起亮、
         整场不移动。<b>softness</b> 把波形自己在<b>时间上</b>拉长：爬升和回落铺得越久，
         相邻两点的亮度差就越小（100%→95%→85% 那种），而波峰波谷的亮度<b>不变</b>。
         真正决定"顺不顺"的是两者的比值 <b>softness ÷ stagger</b>——所以拧一个不够，
         要看波是"太快铺满"还是"错峰太挤"。</p>`,
    ),
    title('5 · 渲染'),
    colorRow(
      '点颜色',
      () => opts.color,
      (v) => {
        opts.color = v;
        document.documentElement.style.setProperty('--ink', v);
        changed();
      },
    ),
    el(
      `<p class="note">SVG 那条可 seek：<code>svgMatrix.t = 0.4</code>。CSS 那条由浏览器
         自己跑，只能整体重建。</p>`,
    ),
    gapNote,
    title('读数'),
    state,
  );

  /* ---- 读数 ------------------------------------------------------------ */
  function refresh() {
    const f = DM.field(opts, svgMatrix.t);
    const lit = f.filter((d) => d.opacity > 0.6).length;
    const sizesSeen = new Set(f.map((d) => d.r)).size;
    state.textContent = JSON.stringify(
      {
        动效: `${DM.PRESETS[opts.preset]?.task ?? '-'} · ${opts.preset}`,
        轮廓: opts.silhouette,
        预设: opts.dot,
        顶点数: opts.spec.sides,
        外圆角: +opts.spec.radius.toFixed(2),
        内圆角: +opts.spec.innerRadius.toFixed(2),
        内切半径: +DM.glyphPath(opts.spec).inradius.toFixed(3),
        size: opts.size,
        点占格: `${Math.round(opts.dotSize * 100)}%`,
        点占间距: `${Math.round((opts.dotSize / (1 + Math.max(opts.gapX, opts.gapY))) * 100)}%`,
        点直径: `${DM.layout(opts).dotPx.toFixed(1)}px`,
        格距: +DM.layout(opts).pitchX.toFixed(2),
        点宽: +DM.layout(opts).dotPx.toFixed(2),
        网格: `${opts.cols}×${opts.rows}`,
        点数: f.length,
        轮廓保留: `${Math.round((f.length / (opts.cols * opts.rows)) * 100)}%`,
        当前亮点: lit,
        不同半径档: sizesSeen,
        涨缩: opts.grow,
        底噪: opts.floor,
        速度: opts.speed,
        错峰: opts.stagger ?? '预设',
        柔化: opts.softness,
        css缺口: cssMatrix.cssGap() ?? '无',
      },
      null,
      2,
    );
  }

  buildLadder();
  buildGallery();
  syncRenderers();
  refresh();
  svgMatrix.start();
  // CSS 那条不需要时钟：浏览器自己跑 keyframes
  setInterval(refresh, 250);

  globalThis.__dotMatrix = { opts, svgMatrix, cssMatrix, DM };
})();
