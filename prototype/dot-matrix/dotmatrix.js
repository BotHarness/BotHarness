/* PROTOTYPE (throwaway) — a dot-matrix loading field, as a layered component.
 *
 * The layers, bottom to top. Each one is replaceable on its own, which is the
 * whole point: the interesting design questions ("which silhouette", "which
 * motion", "which glyph") are independent, and every one of them is a table you
 * can add to without touching the layers above.
 *
 *   1  LATTICE    cellsFor(cols, rows, silhouette)  → which cells exist, where
 *   2  ORDER      orderFor(arm, col, row, n)       → 0..1 traversal position
 *   3  ENVELOPE   envelope(p, stops, rest)         → brightness over the phase
 *   4  GLYPH      DOT_SHAPES[shape]                → how one dot is drawn
 *   5  RENDERER   SVG (per frame) | CSS (delay)    → where the pixels go
 *
 * Composed by createMatrix(), which owns a clock and can mount either renderer.
 *
 * Two things this file learned the hard way, both worth stating up front:
 *
 * · An envelope must be a STOP TABLE interpolated between stops, never
 *   brightness quantised into shelves. Shelves are visible as steps and read as
 *   cheap; a piecewise-linear decay with corners still reads as a smooth
 *   gradient. A narrow travelling band resting on a dark floor for most of the
 *   cycle is what reads as "beads chasing" rather than "one soft glow".
 *
 * · The dot's SIZE carrying the brightness (a slow breath) is what makes it feel
 *   alive; opacity alone reads as a lampshade. Both renderers can do it — the
 *   CSS path just has to animate `scale()` alongside `opacity`, which is why
 *   every glyph here declares a `pulse` and not only a `css` class.
 *
 * Classic script on purpose: the page loads it as a classic script too.
 */
(function (root) {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const frac = (v) => v - Math.floor(v);

  /* ================================================== 1 · lattice + silhouette */

  /**
   * Which cells exist. `square` keeps everything; the rest are masks over the
   * same lattice, defined on normalised coords nx/ny ∈ [-1, 1] so a shape reads
   * the same at any cols/rows.
   */
  const SILHOUETTES = {
    square: () => true,
    circle: (nx, ny) => nx * nx + ny * ny <= 1,
    diamond: (nx, ny) => (Math.abs(nx) + Math.abs(ny)) / 1.15 <= 1,
    hex: (nx, ny) => {
      const x = Math.abs(nx);
      const y = Math.abs(ny);
      return y <= 0.82 && x * 0.62 + y * 0.78 <= 1;
    },
    ring: (nx, ny) => {
      const d = Math.hypot(nx, ny);
      return d <= 1 && d >= 0.62;
    },
    cross: (nx, ny) => Math.abs(nx) * 0.75 + Math.abs(ny) * 0.75 <= 1,
  };
  const SILHOUETTE_KEYS = Object.keys(SILHOUETTES);

  /** the kept cells of a silhouette, as [{ col, row, nx, ny }] */
  function cellsFor(cols, rows, silhouette) {
    const keep = SILHOUETTES[silhouette] ?? SILHOUETTES.square;
    const out = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const nx = cols === 1 ? 0 : (col / (cols - 1)) * 2 - 1;
        const ny = rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1;
        if (keep(nx, ny)) out.push({ col, row, nx, ny });
      }
    }
    return out;
  }

  /* ============================================================== 2 · order */

  /**
   * Orders are defined on the ACTUAL cols×rows lattice, never on a square of
   * max(cols, rows). That square was the original sin: on a 2×5 grid the spiral
   * was computed over a 5×5 lattice and the two live columns took whatever
   * fragment of it they happened to cover, so the motion was geometrically
   * meaningless. Every order below is correct for any rectangle.
   *
   * An order is 0…1 along a traversal: 0 leads, 1 trails.
   */
  const spiralCache = new Map();

  /** the boustrophedon cells: down a column, back up the next (or its transpose) */
  function snakePath(cols, rows, columnMajor) {
    const out = [];
    if (columnMajor) {
      for (let c = 0; c < cols; c++) {
        for (let k = 0; k < rows; k++) out.push([c, c % 2 ? rows - 1 - k : k]);
      }
    } else {
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) out.push([r % 2 ? cols - 1 - k : k, r]);
      }
    }
    return out;
  }

  /**
   * The cells of a grid in spiral order, ring by ring from the OUTSIDE in.
   *
   * A spiral needs room to turn. On a grid only two cells wide the "rings" come
   * apart into disconnected pieces, so a spiral is not a traversal there at all —
   * which is why the enumeration is restricted to squares, and why everything
   * else falls back to the column snake. That fallback is not a compromise: on a
   * 2×5 or 5×2 field the snake IS the loop a person expects (down one column,
   * back up the next), while a spiral would have to jump.
   */
  function spiralPath(cols, rows) {
    if (cols !== rows || cols < 3) return snakePath(cols, rows, true);
    const key = `${cols}x${rows}`;
    const hit = spiralCache.get(key);
    if (hit) return hit;
    const mid = (cols - 1) / 2;
    const out = [];
    const seen = new Set();
    const at = (c, r) => {
      const k = r * cols + c;
      if (!seen.has(k)) {
        seen.add(k);
        out.push([c, r]);
      }
    };
    for (let d = Math.ceil(mid); d >= 0; d--) {
      // ceil for the inner bound, floor for the outer one. Rounding is wrong on
      // an EVEN grid: at 4×4 the middle is 1.5, and Math.round(2.5) = 3 would
      // make the inner ring span 1..3 — a ring wider than the grid.
      const lo = Math.max(0, Math.ceil(mid - d));
      const hi = Math.min(cols - 1, Math.floor(mid + d));
      if (lo > hi) continue; // an even grid has no single centre cell
      // the four edges, with the corners emitted exactly once
      for (let c = lo; c <= hi; c++) at(c, lo);
      for (let r = lo + 1; r <= hi; r++) at(hi, r);
      for (let c = hi - 1; c >= lo; c--) at(c, hi);
      for (let r = hi - 1; r >= lo + 1; r--) at(lo, r);
    }
    spiralCache.set(key, out);
    return out;
  }

  /** the boustrophedon index: down a column, up the next (and its transpose) */
  const snakeIndex = (col, row, cols, rows, columnMajor) => {
    if (columnMajor) {
      const i = col * rows + (col % 2 ? rows - 1 - row : row);
      return i / Math.max(1, cols * rows - 1);
    }
    const i = row * cols + (row % 2 ? cols - 1 - col : col);
    return i / Math.max(1, cols * rows - 1);
  };

  const ORDERS = {
    /** inward spiral — correct on a rectangle, not just a square */
    spiral: (col, row, cols, rows) => {
      const path = spiralPath(cols, rows);
      for (let i = 0; i < path.length; i++) {
        if (path[i][0] === col && path[i][1] === row)
          return path.length > 1 ? i / (path.length - 1) : 0;
      }
      return 0;
    },
    /** row-major snake: left→right, then right→left, and so on */
    snake: (col, row, cols, rows) => snakeIndex(col, row, cols, rows, false),
    /**
     * column-major snake: the one a 2-column grid actually wants. Down the first
     * column, back up the second — a loop with no jump, which a spiral over a
     * 2×5 lattice cannot give you.
     */
    columnSnake: (col, row, cols, rows) => snakeIndex(col, row, cols, rows, true),
    /** anti-diagonal sweep, normalised over the real rectangle */
    diagonal: (col, row, cols, rows) => (cols + rows > 2 ? (col + row) / (cols + rows - 2) : 0),
    /**
     * Concentric rings — Chebyshev distance, so a rectangle gives ellipses.
     *
     * Deliberately QUANTISED, and that is the whole character of the look: on an
     * integer lattice the Chebyshev radius takes only a handful of distinct
     * values (four on a 7×7), so each ring shares one phase and the field reads
     * as discrete bands — the concentric-LED-panel effect. It cannot be made
     * smooth, because the lattice has no values in between. For a smooth
     * travelling wave use `radial`.
     */
    ring: (col, row, cols, rows) => {
      const dx = cols > 1 ? (col - (cols - 1) / 2) / ((cols - 1) / 2) : 0;
      const dy = rows > 1 ? (row - (rows - 1) / 2) / ((rows - 1) / 2) : 0;
      return Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)));
    },
    /**
     * Radial from the middle, elliptical on a rectangle, and CONTINUOUS.
     *
     * The Euclidean radius of an integer lattice point is almost never a
     * fraction of anything, so unlike `ring` this gives nearly every dot its own
     * value. That is what a smooth travelling wave needs: the envelope decides
     * how fast the level falls, but if the order only hands out four levels the
     * field is four bands no matter how smooth the envelope is. With a
     * continuous order the neighbour step becomes (ramp width) / (spread), and
     * `softness` can actually reach it.
     */
    radial: (col, row, cols, rows) => {
      const dx = cols > 1 ? (col - (cols - 1) / 2) / ((cols - 1) / 2) : 0;
      const dy = rows > 1 ? (row - (rows - 1) / 2) / ((rows - 1) / 2) : 0;
      return Math.min(1, Math.hypot(dx, dy) / Math.SQRT2);
    },
    /** radial ramp, the same geometry; kept for the global-pulse presets */
    center: (col, row, cols, rows) => ORDERS.radial(col, row, cols, rows),
    row: (col, row, cols, rows) => (rows > 1 ? row / (rows - 1) : 0),
    column: (col, row, cols) => (cols > 1 ? col / (cols - 1) : 0),
  };
  const ORDER_KEYS = Object.keys(ORDERS);

  /* =========================================================== 3 · envelope */

  /**
   * A comet, as a stop table — the thing a smooth falloff actually is.
   * `p` is the position in the cycle; stops are [position, brightness].
   */
  function envelope(p, stops, rest) {
    if (p >= 1) return rest;
    for (let i = 1; i < stops.length; i++) {
      const [p1, v1] = stops[i];
      if (p <= p1) {
        const [p0, v0] = stops[i - 1];
        const f = p1 === p0 ? 1 : (p - p0) / (p1 - p0);
        return v0 + (v1 - v0) * f;
      }
    }
    return rest;
  }

  const REST = 0.08; // deliberately dark, so the band has somewhere to travel through
  const ENVELOPES = {
    /** the reference comet: fast rise, six-stop decay, long dark tail */
    comet: {
      stops: [
        [0, REST],
        [0.08, 1],
        [0.16, 0.64],
        [0.24, 0.44],
        [0.32, 0.24],
        [0.4, REST],
      ],
      rest: REST,
    },
    /**
     * A ring is wide, so the band has to be short in time or it swallows the
     * field.
     *
     * The rise at the front is deliberate and not a rounding artefact: born at
     * full brightness the crest steps from REST to 1 across the p = 0 → 1 seam
     * once per cycle, and the eye reads that step as a twitch rather than a
     * wave. Rising over 0.04 leaves the seam continuous and leaves the softness
     * blur something to smooth.
     */
    wave: {
      stops: [
        [0, REST],
        [0.04, 1],
        [0.1, 1],
        [0.17, 0.5],
        [0.22, REST],
      ],
      rest: REST,
    },
    /** a soft global pulse — the "breathing" read */
    breathe: {
      stops: [
        [0, 0.24],
        [0.5, 1],
        [1, 0.24],
      ],
      rest: 0.24,
    },
    /**
     * A PLATEAU rather than a comet: the level is held across the middle of the
     * band instead of falling straight through it. With a large dot this reads as
     * a mass swelling and settling — a morph — where a comet reads as a bead
     * travelling however fat the bead is.
     */
    plateau: {
      stops: [
        [0, 0.18],
        [0.2, 0.88],
        [0.45, 1],
        [0.62, 0.88],
        [0.82, 0.18],
      ],
      rest: 0.18,
    },
    /** three discrete shelves over a short band, then the floor; pairs with `steps(3, end)` */
    chase: {
      steps: 3,
      duty: 0.34,
      stops: [
        [0, 0.16],
        [0.34, 1],
      ],
      rest: 0.16,
    },
    /**
     * A travelling gaussian for the moving-highlight arm. `duty` is where the
     * band ends — the gaussian is symmetric about p=0, so without it the tail
     * never quite reaches zero and the field stays faintly lit.
     */
    spike: { gauss: 0.006, duty: 0.2, stops: [[0, 1]], rest: 0 },
  };
  const ENVELOPE_KEYS = Object.keys(ENVELOPES);

  /**
   * Brightness v ∈ [0, 1] for one cell at phase p.
   *
   * `duty` (optional) is where the band ends: past it the cell sits at the
   * floor for the rest of the cycle. Without it a stepped envelope would end on
   * its top shelf and the field would never go quiet.
   */
  function level(p, env) {
    if (env.duty != null && p > env.duty) return env.rest;
    if (env.gauss) {
      const d = Math.min(p, 1 - p);
      return Math.exp(-(d * d) / env.gauss);
    }
    if (env.steps) {
      // `steps` shelves across the BAND, normalised to 0..1, so the shelves are
      // floor..peak and not floor..something-below-peak
      const u = Math.min(env.steps - 1, Math.floor((p / (env.duty ?? 1)) * env.steps));
      return env.rest + (1 - env.rest) * (u / (env.steps - 1));
    }
    return clamp01(envelope(p, env.stops, env.rest));
  }

  /**
   * The same envelope, stretched along the TIME axis.
   *
   * This is the knob behind "100% → 95% → 85% instead of one cliff". How much
   * two neighbouring dots differ is
   *
   *     neighbour step  =  (d level / d p)  x  (stagger / cell count)
   *
   * so the falloff between neighbours is the RATIO of the wave's own ramp width
   * to the stagger per dot. `stagger` therefore cannot fix smoothness on its
   * own: turning it down to make neighbours agree also stops the wave travelling
   * across the field. Stretching the envelope widens the ramp and leaves the
   * travel alone, which is the only way to get both.
   *
   * Stretching, not blurring. A box blur wide enough to soften a step is also
   * wider than any plateau narrower than itself, so it dissolves the crest of a
   * short envelope into a flat smear; widening the ramp keeps the crest at
   * exactly `peak` and the floor at exactly `rest`, and cuts the neighbour step
   * by the stretch factor.
   *
   * Memoised on the envelope, because the renderer asks for this once per dot
   * per frame. The stretch is capped so the band can never swallow the cycle —
   * a wave with no dark tail stops reading as a wave.
   */
  function stretched(env, soft) {
    if (!(soft > 0)) return null;
    if (env.gauss) return null; // already smooth: a gaussian has no corner to widen
    const cache = env._stretched;
    if (cache && cache.soft === soft) return cache.env;
    const k = 1 + soft * 2;
    const span = env.duty != null ? env.duty : env.stops[env.stops.length - 1][0];
    const limit = 0.92;
    const kk = span * k > limit ? limit / span : k;
    const out = {
      ...env,
      _stretched: undefined,
      stops: env.stops.map(([p, v]) => [p * kk, v]),
      duty: env.duty != null ? Math.min(limit, env.duty * kk) : null,
    };
    env._stretched = { soft, env: out };
    return out;
  }

  function softLevel(p, env, soft) {
    const e = stretched(env, soft);
    return e ? clamp01(level(p, e)) : level(p, env);
  }

  /**
   * Presets bind the three independent layers into the named motions the page
   * offers. A preset is just a triple — adding one is a table entry.
   */
  /**
   * Presets bind the three independent layers into the named motions.
   *
   * A preset is a triple plus two flags, and it also carries a `task`: the
   * agent state it is meant to express. Naming the presets after MOTION
   * ("spiral", "ripple") makes the caller do the translation from product
   * language; naming them after the STATE ("thinking", "searching") is the
   * vocabulary the rest of the UI already speaks. Both are kept — the key is the
   * motion, the label is the job.
   *
   *   css   whether the CSS path can render it at all
   *   solid whether the envelope fills its band (a "solid" morph wants a level
   *         plateau rather than a thin comet)
   */
  const PRESETS = {
    spiral: { order: 'spiral', env: 'comet', spread: 0.95, css: true, task: '思考中' },
    // the two snakes exist because they are the traversals that make sense on a
    // narrow grid: a 2×5 field wants a column snake (down, then back up), and a
    // spiral over it is not a loop at all
    snake: { order: 'snake', env: 'comet', spread: 0.95, css: true, task: '逐行推进' },
    columnSnake: { order: 'columnSnake', env: 'comet', spread: 0.95, css: true, task: '逐列折返' },
    ripple: { order: 'radial', env: 'wave', spread: 0.7, css: true, task: '扩散' },
    ring: { order: 'ring', env: 'chase', spread: 0.34, css: true, task: '追逐' },
    diagonal: { order: 'diagonal', env: 'comet', spread: 0.95, css: true, task: '斜扫' },
    // a per-dot delay can only offset a dot's phase; a highlight MOVING down
    // the column is not a phase offset, so this preset has no CSS form
    columns: { order: 'column', env: 'spike', spread: 1, css: false, task: '逐列下落' },
    breathe: { order: 'center', env: 'breathe', spread: 0, css: true, task: '呼吸' },
    // a plateau rather than a thin comet: the level holds, so a fat dot reads as
    // a morphing mass instead of a travelling bead
    morph: { order: 'spiral', env: 'plateau', spread: 0.5, css: true, task: '变形', solid: true },
    off: null,
  };
  const PRESET_KEYS = Object.keys(PRESETS);

  /** the agent states this component is meant to cover, and what each maps to */
  const STATE_PRESETS = {
    thinking: 'spiral',
    working: 'morph',
    searching: 'diagonal',
    streaming: 'columnSnake',
    waiting: 'ring',
    error: 'ring',
  };
  const STATE_KEYS = Object.keys(STATE_PRESETS);

  /* ============================================================== 4 · glyph */

  /**
   * A dot is a POLYGON plus two corner radii — not a glyph from a fixed table.
   * Vertices on a unit circle (so `sides: 5` is a pentagon), then:
   *
   *   radius     outer fillet: the convex corners. At radius = the inradius the
   *              polygon is fully rounded and a square becomes a circle, which
   *              is the whole reason this is vertices-and-radius and not a
   *              lookup table of named shapes.
   *   innerRadius fillet on the reflex corners — the notches of a star. A star
   *              with innerRadius 0 is a hard-edged star; raising it softens
   *              the waist. 0.5 turns the points into teardrops.
   *   spin       rotation, for the 5-point star's upright orientation
   *
   * So a shape is THREE numbers, and every one of them is a slider. `sides: 4`
   * with radius 0 is the default rectangle; with radius = inradius it is a
   * circle. Nothing else needs a name.
   */
  const GLYPH_DEFAULTS = { sides: 4, radius: 0, innerRadius: 0, star: 0, spin: 0, aspect: 1 };

  /**
   * Vertices of an n-gon on the unit circle, optionally with a star's ratio
   * between the points and the notches (star: 0 = plain n-gon, 0.5 = the
   * classic 5-point star).
   */
  function vertices({ sides, star = 0, spin = 0, aspect = 1 }) {
    const n = Math.max(3, Math.round(sides));
    // an EVEN count is offset by half a step so the vertices land on the axes
    // and `sides: 4` is an axis-aligned square rather than a diamond
    const base = spin - Math.PI / 2 + (n % 2 === 0 ? Math.PI / n : 0);
    const out = [];
    if (star > 0) {
      // a star is 2n vertices — n points AND n notches, not n alternating radii.
      // With one vertex per arm the notches do not exist, so they cannot be
      // reflex, so innerRadius has nothing to round.
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * TAU;
        const b = a + TAU / (n * 2);
        out.push([Math.cos(a) * aspect, Math.sin(a)]);
        out.push([Math.cos(b) * (1 - star) * aspect, Math.sin(b) * (1 - star)]);
      }
    } else {
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * TAU;
        out.push([Math.cos(a) * aspect, Math.sin(a)]);
      }
    }
    return out;
  }

  /**
   * Fillet a polygon. At each vertex, cut `t = radius / tan(θ/2)` back along
   * both incident edges and bridge the gap with a quadratic through the original
   * corner. `t` is clamped to half the shorter edge, which is what stops a
   * fully-rounded square from inverting at the corners.
   *
   * Reflex vertices (the notches) get `innerRadius` instead, detected by the
   * sign of the cross product against the winding direction.
   */
  function fillet(pts, radius, innerRadius = 0) {
    const n = pts.length;
    if (n < 3) return '';
    // winding, so we can tell a convex corner from a notch
    let area = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const ccw = area > 0;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      const v1 = [prev[0] - cur[0], prev[1] - cur[1]];
      const v2 = [next[0] - cur[0], next[1] - cur[1]];
      const l1 = Math.hypot(v1[0], v1[1]) || 1;
      const l2 = Math.hypot(v2[0], v2[1]) || 1;
      const u1 = [v1[0] / l1, v1[1] / l1];
      const u2 = [v2[0] / l2, v2[1] / l2];
      const cosT = clamp(u1[0] * u2[0] + u1[1] * u2[1], -1, 1);
      const theta = Math.acos(cosT); // interior angle at cur
      const cross = v1[0] * v2[1] - v1[1] * v2[0];
      const convex = ccw ? cross < 0 : cross > 0;
      const r = Math.max(0, convex ? radius : innerRadius);
      // reflex corners need a negative tangent to fillet the other side
      const sign = convex ? 1 : -1;
      const denom = Math.tan(theta / 2);
      let t = denom > 1e-6 ? (r * sign) / denom : 0;
      t = Math.max(-Math.min(l1, l2) / 2, Math.min(Math.min(l1, l2) / 2, t));
      const p1 = [cur[0] + u1[0] * t, cur[1] + u1[1] * t];
      const p2 = [cur[0] + u2[0] * t, cur[1] + u2[1] * t];
      parts.push({ cur, p1, p2, round: Math.abs(t) > 1e-6 });
    }
    let d = '';
    parts.forEach((p, i) => {
      // a space between every pair of numbers: without it "…-1.00000.5000" is
      // parsed as the single number -1.00000.5
      d += `${i ? 'L' : 'M'}${p.p1[0].toFixed(4)} ${p.p1[1].toFixed(4)}`;
      if (p.round) {
        d += `Q${p.cur[0].toFixed(4)} ${p.cur[1].toFixed(4)} ${p.p2[0].toFixed(4)} ${p.p2[1].toFixed(4)}`;
      }
    });
    return `${d}Z`;
  }

  /**
   * The inradius of a vertex list — the radius at which a corner is fully
   * rounded. This is the value that turns a square into a circle, and it is
   * derived rather than tabulated so `sides: 6` behaves the same way.
   */
  function inradius(pts) {
    let min = Infinity;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      const v1 = [prev[0] - cur[0], prev[1] - cur[1]];
      const v2 = [next[0] - cur[0], next[1] - cur[1]];
      const l1 = Math.hypot(v1[0], v1[1]) || 1;
      const l2 = Math.hypot(v2[0], v2[1]) || 1;
      const cosT = clamp((v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2), -1, 1);
      const t = Math.tan(Math.acos(cosT) / 2);
      if (t > 1e-6) min = Math.min(min, (Math.min(l1, l2) / 2) * t);
    }
    return Number.isFinite(min) ? min : 0;
  }

  /**
   * The bounding box of a vertex list — the reference the dot is SIZED against.
   *
   * This has to be the box, not the inradius. Normalising by the inradius looks
   * right for a square and is catastrophic for a star: a 5-point star's
   * inradius is ~0.10, so "divide by the inradius" inflates it tenfold and the
   * points overlap their neighbours. Normalising by the box means every glyph
   * occupies exactly `dotSize` — so a square tiles its cell, a fully rounded
   * square is the same size (its fillets land on the same tangent points), and
   * a star fits the cell instead of bursting out of it.
   */
  function bbox(pts) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return Math.max(maxX - minX, maxY - minY) || 1;
  }

  /**
   * The path for one dot, in units of its own bounding box, centred on the
   * origin. Both renderers consume this, so the two can never disagree about the
   * silhouette — which is the reason the CSS path is a mask of THIS path rather
   * than a set of hand-written border-radius rules.
   */
  function glyphPath(spec) {
    const g = { ...GLYPH_DEFAULTS, ...spec };
    const pts = vertices(g);
    return {
      d: fillet(pts, g.radius, g.innerRadius),
      inradius: inradius(pts),
      box: bbox(pts),
      pts,
    };
  }

  /**
   * The dot table, kept as NAMED PRESETS over those three numbers so the picker
   * has something to offer — but every one is just a starting value, and the
   * rail's sliders overwrite all of them.
   */
  const DOT_SHAPES = {
    square: { label: '方', spec: { sides: 4, radius: 0, aspect: 1 } },
    rounded: { label: '圆角', spec: { sides: 4, radius: 0.3, aspect: 1 } },
    circle: { label: '圆', spec: { sides: 4, radius: 0.5, aspect: 1 } },
    ellipse: { label: '椭圆', spec: { sides: 4, radius: 0.5, aspect: 0.55 } },
    triangle: { label: '三角', spec: { sides: 3, radius: 0, aspect: 1 } },
    diamond: { label: '菱形', spec: { sides: 4, radius: 0, spin: Math.PI / 4, aspect: 1 } },
    pentagon: { label: '五边形', spec: { sides: 5, radius: 0, aspect: 1 } },
    hexagon: { label: '六边形', spec: { sides: 6, radius: 0, aspect: 1 } },
    star4: { label: '四角星', spec: { sides: 4, star: 0.42, innerRadius: 0, aspect: 1 } },
    star5: { label: '五角星', spec: { sides: 5, star: 0.44, innerRadius: 0, aspect: 1 } },
    star6: { label: '六角星', spec: { sides: 6, star: 0.4, innerRadius: 0, aspect: 1 } },
    burst: {
      label: '柔角星',
      spec: { sides: 5, star: 0.44, innerRadius: 0.16, aspect: 1 },
    },
    drop: {
      label: '水滴',
      spec: { sides: 5, star: 0.44, innerRadius: 0.5, aspect: 1 },
    },
    bar: { label: '竖条', spec: { sides: 4, radius: 0.3, aspect: 0.3 } },
  };
  const DOT_SHAPE_KEYS = Object.keys(DOT_SHAPES);
  // every glyph reaches BOTH renderers now: the CSS path masks the same path
  // data, so there is no glyph-shaped gap left — only preset-shaped ones

  /* ============================================================ 5 · renderer */

  const DEFAULTS = {
    /**
     * size — the component's box, in px, the way an icon component takes a size.
     * It is the ONLY length in the public vocabulary: everything else is
     * expressed as a fraction of it, so a field at 16 and the same field at 240
     * are the same drawing at two scales.
     */
    size: 240,
    cols: 7,
    rows: 7,
    fill: 1, // share of the box the field's centre span takes (1 = fills it)
    silhouette: 'circle',
    dot: 'square', // a key into DOT_SHAPES, or 'custom' to use the spec below
    /**
     * dotSize — the dot's footprint as a FRACTION OF THE CELL. Above 1 the dot
     * is wider than its cell, so neighbours touch and the field reads as one
     * continuous mass of dots rather than a grid of separate ones; the size
     * algebra still lands the field exactly on the box at any value, because
     * `f` is solved for rather than clipped.
     */
    dotSize: 0.55,
    /**
     * gapX / gapY — the space BETWEEN cells, as a multiple of the cell, on each
     * axis independently. This is CSS-grid's own vocabulary: the dot fills a
     * share of its cell, and the gap is the space between cells. A vertical
     * stack and a horizontal band are different objects, so they get different
     * gaps.
     */
    gapX: 0.45,
    gapY: 0.45,
    preset: 'spiral',
    floor: 0.16,
    peak: 1,
    speed: 1,
    grow: 0.5, // 0 = fixed size (an LED panel), 1 = full breath
    /**
     * stagger — how far apart in phase two neighbouring dots start, as a
     * fraction of the cycle. This is the "when does the next batch begin" dial.
     * null means "use the preset's own value"; 0 collapses the stagger entirely
     * and the whole field pulses as one, which is smooth but stops travelling.
     */
    stagger: null,
    /** softness — blur of the wavefront in time; see softLevel() */
    softness: 0,
    color: '#16161a',
    // the live polygon: sides + two radii + spin. A named `dot` seeds it; the
    // rail's sliders then own it, which is why `custom` is a real state.
    spec: { ...GLYPH_DEFAULTS },
  };

  /** resolve the named glyph (or keep the custom spec) into a polygon spec */
  function specFor(o) {
    if (o.dot === 'custom' || !DOT_SHAPES[o.dot]) return { ...GLYPH_DEFAULTS, ...o.spec };
    return { ...GLYPH_DEFAULTS, ...DOT_SHAPES[o.dot].spec };
  }

  /**
   * The geometry, in PX, for a field of the given size — the one computation
   * both renderers use.
   *
   * The size algebra is the whole design. Let `f` be dotSize (the dot's share of
   * its cell), `g` the gap (a multiple of the cell) and `n` the count on that
   * axis. A cell of size `c` gives a pitch of `c(1 + g)`, so:
   *
   *     centre span = (n - 1) · c(1 + g)     distance between the outer centres
   *     dot         = f · c
   *     size        = centre span + dot      the field exactly fills the box
   *
   *     ⟹ c = size / ((n - 1)(1 + g) + f)
   *
   * Four consequences, all wanted:
   *
   *   · a dot can never overflow the box, so no clipping margin is needed
   *   · the pitch is a function of `size` alone at fixed f and g, so changing
   *     `size` scales the field without changing its proportions
   *   · `dotSize` and `gap` are independent: the dot's share of its cell and the
   *     space between cells are separate dials, as they are in CSS grid
   *   · `gapX ≠ gapY` is legal and meaningful — a vertical stack and a
   *     horizontal band are different objects
   *
   * Each axis is solved on its own, so cols and rows never have to agree. With
   * unequal gaps the two cells differ, and the dot is sized from the SMALLER one
   * so it never overlaps on either axis. The consequence, stated rather than
   * hidden: the tighter axis fills the box exactly and the roomier one gets
   * slack. Growing the dot to fill that slack would need two dot sizes, and a
   * non-square dot is worse than a little air.
   */
  function layout(options) {
    const o = { ...DEFAULTS, ...options }; // self-sufficient: callers may pass a partial
    const n = o.cols - 1;
    const m = o.rows - 1;
    const f = Math.max(0.01, o.dotSize);
    const box = o.size * clamp(o.fill, 0.2, 1);
    const gx = Math.max(0, o.gapX);
    const gy = Math.max(0, o.gapY);
    const cellX = n > 0 ? box / (n * (1 + gx) + f) : 0;
    const cellY = m > 0 ? box / (m * (1 + gy) + f) : 0;
    const cell = Math.min(cellX || box, cellY || box) || box;
    return {
      cellX,
      cellY,
      gapX: gx,
      gapY: gy,
      // the pitch is the cell plus the gap — this is what the grid tracks are
      pitchX: n > 0 ? cellX * (1 + gx) : 0,
      pitchY: m > 0 ? cellY * (1 + gy) : 0,
      dotPx: f * cell,
      size: o.size,
    };
  }

  /**
   * The field, IN PIXELS for a field of the given `size`. Pure function of
   * (options, t) — the caller owns the phase, so the field is seekable, pausable
   * and replayable, with no internal clock.
   *
   * Each record carries the resolved glyph path, so a renderer never has to
   * re-derive the silhouette and the two paths cannot drift apart.
   */
  function field(options, t) {
    const o = { ...DEFAULTS, ...options };
    const preset = PRESETS[o.preset];
    if (!preset) return [];
    const orderOf = ORDERS[preset.order];
    const env = ENVELOPES[preset.env];
    const spread = o.stagger ?? preset.spread;
    const spec = specFor(o);
    const { d: glyphD, box } = glyphPath(spec);
    const L = layout(o);
    // every glyph is scaled to the SAME bounding box, so dotSize means "how much
    // of the cell the dot takes" for a square, a circle and a star alike
    const r0 = L.dotPx / 2 / box;
    const out = [];
    for (const c of cellsFor(o.cols, o.rows, o.silhouette)) {
      // the order is taken on the full square lattice, so trimming the
      // silhouette never renumbers the motion and a shape change never restarts it
      const ord = orderOf(c.col, c.row, o.cols, o.rows);
      const v = clamp01(softLevel(frac(t * o.speed - ord * spread), env, o.softness));
      out.push({
        x: +((c.col - (o.cols - 1) / 2) * L.pitchX).toFixed(3),
        y: +((c.row - (o.rows - 1) / 2) * L.pitchY).toFixed(3),
        r: +(r0 * (1 - o.grow + o.grow * v)).toFixed(3),
        opacity: +(o.floor + (o.peak - o.floor) * v).toFixed(3),
        order: +ord.toFixed(4),
        v: +v.toFixed(4),
        col: c.col,
        row: c.row,
        d: glyphD,
      });
    }
    return out;
  }

  /**
   * The field as SVG markup. Coordinates are already px, so the viewBox is
   * literally the component's box — there is no unit conversion anywhere, which
   * is what went wrong twice before.
   */
  function toSvg(options, t) {
    const o = { ...DEFAULTS, ...options };
    return field(o, t)
      .map((d) => {
        // the glyph path is unit-scale around the origin, so one transform
        // places and sizes it per dot
        const s = d.r.toFixed(3);
        return (
          `<path d="${d.d}" transform="translate(${d.x.toFixed(2)} ${d.y.toFixed(2)}) scale(${s})" ` +
          `fill-opacity="${d.opacity.toFixed(3)}"/>`
        );
      })
      .join('');
  }

  /**
   * The same field as DOM for the CSS path: a grid of <i> where the ONLY motion
   * is `@keyframes` on opacity and scale, offset per dot by `--o` from
   * `animation-delay`. The JS stops after mount.
   *
   * The glyph is applied as a CSS `mask` built from the SAME path data the SVG
   * path draws. That is the reason the CSS renderer can do a five-point star at
   * all: a border-radius class can express a circle and a rounded box and
   * nothing else, whereas a mask is the same geometry. The cost is one data URI
   * per field, set once on the host — not per dot.
   *
   * Returns null when the preset is a moving highlight: a per-dot delay can only
   * offset a dot's phase, not move a highlight down a column.
   */
  function toDom(options, presetName) {
    const o = { ...DEFAULTS, ...options };
    const preset = PRESETS[presetName ?? o.preset];
    if (!preset) return null;
    if (!preset.css) return null;
    const spread = o.stagger ?? preset.spread;
    const spec = specFor(o);
    const { d } = glyphPath(spec);
    const env = ENVELOPES[preset.env];
    const frag = document.createDocumentFragment();
    for (const c of cellsFor(o.cols, o.rows, o.silhouette)) {
      const i = document.createElement('i');
      i.className = 'ds-dot';
      // Each dot must be PLACED, not just appended. Grid auto-placement packs
      // items into the free cells, so omitting the cells a silhouette masks
      // slides every later dot up and to the left — a circle turns into a
      // ragged block in the corner instead of a ring. Naming the cell keeps the
      // holes as holes, which is what makes the CSS layout match the SVG one.
      i.style.gridArea = `${c.row + 1} / ${c.col + 1}`;
      // the raw 0..1 order, kept for the reduced-motion static ramp
      i.style.setProperty('--o', ORDERS[preset.order](c.col, c.row, o.cols, o.rows).toFixed(3));
      frag.appendChild(i);
    }
    return { frag, preset, env, spec, spread, mask: maskFor(d), layout: layout(o) };
  }

  /**
   * A data-URI mask of a unit-scale path. viewBox -1…-1…1 with the path mapped
   * through the same transform the SVG renderer uses, so both paths are the same
   * shape by construction rather than by eye.
   */
  function maskFor(d) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.15 -1.15 2.3 2.3">` +
      `<path d="${d}" fill="#fff" transform="scale(1)"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  /**
   * The @keyframes a preset needs, as a rule string.
   *
   * Every stop animates BOTH `opacity` and `scale`. That pairing is the whole
   * breath: a dot whose opacity alone changes reads as a lampshade, while the
   * size following the brightness reads as alive. `scale` is animated rather
   * than folded into `transform` so a glyph can keep its own transform (a
   * rotated diamond) without the animation overwriting it every frame.
   */
  function keyframesFor(presetName, softness = 0) {
    const preset = PRESETS[presetName];
    if (!preset) return null;
    const env = ENVELOPES[preset.env];
    const at = (p) => {
      const s = clamp01(softLevel(p, env, softness));
      return `${(p * 100).toFixed(2)}%{opacity:${s.toFixed(3)};scale:calc(var(--dm-s-min) + (var(--dm-s) - var(--dm-s-min)) * ${s.toFixed(3)})}`;
    };
    // Stop positions come from the envelope's own (possibly stretched) stops, so
    // the CSS curve is the SAME curve the SVG path evaluates — sampling the
    // original positions through a stretched envelope would put every keyframe
    // on the wrong side of the wave.
    const positions = (stretched(env, softness) ?? env).stops.map(([p]) => p);
    const stops = positions.map((p) => at(p, 0));
    const end = at(1, env.rest);
    return `@keyframes dm-${presetName}{${stops.join('')}${end}}`;
  }

  /* ============================================================ the component */

  /**
   * createMatrix(options) — the component. Owns a clock, renders through one
   * renderer, and exposes the layer tables so a caller can enumerate what is
   * available without hard-coding a list.
   */
  function createMatrix(options = {}) {
    const o = { ...DEFAULTS, ...options };
    let t = 0;
    let raf = 0;
    let host = null;
    let live = o; // whatever was last passed to set()

    const paint = () => {
      if (!host) return;
      if (o.renderer === 'svg') {
        // The viewBox IS the component's box, centred on the origin — which is
        // where `field()` puts the dots, and where the CSS grid centres its
        // tracks. The field is already in px, so there is nothing to measure and
        // nothing to convert; a renderer that measures its own box closes a loop
        // (box → pitch → content → box) and the pane grows on every input.
        const s = live.size;
        host.setAttribute('viewBox', `${-s / 2} ${-s / 2} ${s} ${s}`);
        host.setAttribute('width', s);
        host.setAttribute('height', s);
        host.setAttribute('fill', live.color);
        host.innerHTML = toSvg(live, t);
      }
    };

    const frame = (ms) => {
      t += Math.min(0.05, (ms - (frame.last ?? ms)) / 1000);
      frame.last = ms;
      paint();
      raf = requestAnimationFrame(frame);
    };

    return {
      get options() {
        return { ...live };
      },
      get t() {
        return t;
      },
      set t(v) {
        t = v;
        paint();
      },
      set(next) {
        live = { ...live, ...next };
        if (host) applyCss();
        paint();
      },
      /** mount into an element; `renderer` picks the path */
      mount(element, renderer = 'svg') {
        host = element;
        o.renderer = renderer;
        if (renderer === 'css') {
          const built = toDom(live);
          if (!built) {
            host.textContent = '—';
            return false;
          }
          applyCss();
          host.replaceChildren(built.frag);
        } else {
          paint(); // the SVG path paints nothing until it is told to
        }
        return true;
      },
      cssGap() {
        const p = PRESETS[live.preset];
        if (!p) return 'preset off';
        if (!p.css) return 'moving highlight — no CSS equivalent';
        return null;
      },
      destroy() {
        cancelAnimationFrame(raf);
        host = null;
      },
      start() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      },
      stop() {
        cancelAnimationFrame(raf);
      },
    };

    function applyCss() {
      const built = toDom(live);
      if (!built) return;
      const { env, mask, spread } = built;
      // the SAME layout numbers the SVG path used — in px, from the explicit
      // `size`, never from a measurement
      const side = live.size;
      host.style.width = `${side}px`;
      host.style.height = `${side}px`;
      const L = layout(live);
      const pitchX = L.pitchX || L.dotPx;
      const pitchY = L.pitchY || L.dotPx;
      // Explicit track sizes, not 1fr: `1fr` divides the box between tracks and
      // ignores the field's own pitch, so the CSS layout drifts away from the
      // SVG one. The tracks are also named per dot (grid-area in toDom), so the
      // holes a silhouette leaves stay holes.
      host.style.gridTemplateColumns =
        live.cols > 1 ? `repeat(${live.cols}, ${pitchX.toFixed(2)}px)` : `${L.dotPx.toFixed(2)}px`;
      host.style.gridTemplateRows =
        live.rows > 1 ? `repeat(${live.rows}, ${pitchY.toFixed(2)}px)` : `${L.dotPx.toFixed(2)}px`;
      // the dot's share of its cell — this is what makes the dotSize slider
      // reach the CSS path at all. `contain` would pin every dot to 100% of its
      // cell and the slider would do nothing.
      host.style.setProperty('--dm-fill', (L.dotPx / pitchX).toFixed(4));
      host.style.setProperty('--dm-mask', mask);
      // Seed each cell partway into ONE shared cycle with a NEGATIVE delay.
      //
      // A positive delay would leave the first cells sitting at the floor for a
      // whole cycle before the comet sets off; negative seeds them mid-flight,
      // so the field is already moving on the first painted frame. It also
      // means every cell runs the identical keyframes — the only per-cell value
      // is one number, which is what keeps the CSS path at zero JS per frame.
      host.style.setProperty('--dm-anim', `dm-${live.preset}`);
      host.style.setProperty('--dm-cycle', `${(env.cycleMs ?? 1500) / live.speed}ms`);
      host.style.setProperty('--dm-k', String(spread));
      host.style.setProperty('--dm-seed', String(-spread));
      host.style.setProperty('--dm-floor', String(live.floor));
      host.style.setProperty('--dm-s-min', (1 - live.grow).toFixed(3));
      host.style.setProperty('--dm-s', (1 + live.grow * 0.9).toFixed(3));
      host.dataset.timing = env.steps ? `steps-${env.steps}` : 'linear';
      const style = document.getElementById('dmx-keyframes');
      if (style) {
        // regenerated from the same softLevel() the SVG path uses, so the two
        // renderers cannot drift; the cost is that moving the softness slider
        // restarts the CSS animations (they re-seed, so it is a jump not a
        // change of state)
        style.textContent = PRESET_KEYS.map((k) => keyframesFor(k, live.softness))
          .filter(Boolean)
          .join('\n');
      }
    }
  }

  root.DotMatrix = {
    // layers
    SILHOUETTES,
    SILHOUETTE_KEYS,
    ORDERS,
    ORDER_KEYS,
    ENVELOPES,
    ENVELOPE_KEYS,
    DOT_SHAPES,
    DOT_SHAPE_KEYS,
    GLYPH_DEFAULTS,
    PRESETS,
    PRESET_KEYS,
    STATE_PRESETS,
    STATE_KEYS,
    DEFAULTS,
    // pieces
    cellsFor,
    softLevel,
    stretched,
    spiralPath,
    snakePath,
    envelope,
    level,
    vertices,
    fillet,
    inradius,
    glyphPath,
    bbox,
    layout,
    specFor,
    maskFor,
    field,
    toSvg,
    toDom,
    keyframesFor,
    createMatrix,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
