/**
 * PROTOTYPE (throwaway) — the avatar prototype rebuilt from scratch on three.js.
 *
 * No import from prototype/avatar-hair: the 2D version's hand-rolled silhouette
 * projection, terminator fade and painter-order discipline are all replaced by a
 * real mesh, lights and a depth buffer. What is left is the same product
 * question — can a person customise a bot's hair part by part? — answered with
 * geometry instead of paths.
 *
 * Structure:
 *   shape family   superellipsoid blob (one exponent + two scale knobs)
 *   head           headGeometry() — the body
 *   hair parts     hairShellGeometry() per patch (curved shell "hair cards"),
 *                  taperedTube() for attachments (ahoge, ponytail)
 *   plan → parts   hairParts(cfg, shape): a whole hairstyle as data
 *   boot           renderer, toon lighting, 2x2 scissored views, rail, HUD
 *
 * Everything above boot() is DOM-free, so the geometry can be exercised headless
 * (the smoke test does exactly that) without a WebGL context.
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const deg = (d) => (d * Math.PI) / 180;

/* ------------------------------------------------------------------ shapes */

/**
 * Blob family: a unit sphere pushed onto a superellipsoid of exponent p.
 * p = 2 is a plain sphere, p > 2 flattens the faces toward a squircle, p < 2
 * pinches them toward the axes (drop). sy / sxz then stretch it along Y / XZ.
 */
export const SHAPES = {
  cercle: { p: 2.0, sy: 1.0, sxz: 1.0 },
  galet: { p: 2.25, sy: 0.92, sxz: 1.07 },
  squircle: { p: 2.7, sy: 1.05, sxz: 0.97 },
  goutte: { p: 1.7, sy: 1.08, sxz: 0.9 },
};

export function superR(d, p) {
  if (p === 2) return 1;
  const s = Math.abs(d[0]) ** p + Math.abs(d[1]) ** p + Math.abs(d[2]) ** p;
  return 1 / s ** (1 / p);
}

/** unit direction → point on the blob surface (shared by head and every hair part) */
export function shapePoint(d, shape) {
  const r = superR(d, shape.p);
  return [d[0] * r * shape.sxz, d[1] * r * shape.sy, d[2] * r * shape.sxz];
}

const surface = (shape, dir) => {
  const L = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return shapePoint([dir[0] / L, dir[1] / L, dir[2] / L], shape);
};

/** lat/long grid → BufferGeometry, flipping the winding if normals came out inward */
function gridGeometry(pos, rowLen, rows, cols) {
  const idx = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * rowLen + c;
      const b = a + 1;
      const d = a + rowLen;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const pa = g.attributes.position;
  const na = g.attributes.normal;
  const step = Math.max(1, (pa.count / 96) | 0);
  for (let i = 0; i < pa.count; i += step) {
    if (pa.getX(i) * na.getX(i) + pa.getY(i) * na.getY(i) + pa.getZ(i) * na.getZ(i) < 0) {
      const ix = g.getIndex().array;
      for (let k = 0; k < ix.length; k += 3) {
        const t = ix[k + 1];
        ix[k + 1] = ix[k + 2];
        ix[k + 2] = t;
      }
      g.getIndex().needsUpdate = true;
      g.computeVertexNormals();
      break;
    }
  }
  return g;
}

/**
 * The head: a lat/long grid on the blob. φ = 0 at the crown (+Y), θ = 0 toward
 * the face (+Z) — hair sectors are quoted in those terms (bangs at 0, sides at
 * ±90°, back at 180°).
 */
export function headGeometry(shape, { seg = 96, rings = 64 } = {}) {
  const pos = [];
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * TAU;
      pos.push(...shapePoint([sp * Math.sin(th), cp, sp * Math.cos(th)], shape));
    }
  }
  return gridGeometry(pos, seg + 1, rings, seg);
}

/* -------------------------------------------------------------------- hair */

/**
 * One hair PATCH as a real curved surface: `nStrands` columns at azimuth θ,
 * each running from a collar near the crown (phiRoot) out to a tip at
 * phiRoot + len. Length is scalloped by lock — long mid-lock, short at the
 * joins — and `thick` grows the surface outward toward the tip, which is the
 * volume the 2D version faked with an outline pad.
 *
 * Vertex colours carry the per-strand material noise (grey: 1 = flat).
 */
export function hairShellGeometry(shape, o = {}) {
  const {
    theta0 = 0,
    theta1 = deg(130),
    nStrands = 24,
    nRows = 9,
    len = 1,
    scallop = 5,
    phiRoot = 0.5,
    pad = 0.014,
    thick = 0.035,
    wave = 0,
    phase = 0,
    shade = () => 1,
  } = o;
  const pos = [];
  const col = [];
  const rows = nRows + 1;
  for (let j = 0; j <= nStrands; j++) {
    const u = j / nStrands;
    const th = lerp(theta0, theta1, u);
    const lock = Math.abs(Math.sin(u * scallop * Math.PI));
    const lenB = len * (0.55 + 0.45 * lock);
    const dTh = wave * 0.3 * Math.sin(u * TAU * 1.25 + phase);
    const s = shade(j);
    for (let i = 0; i < rows; i++) {
      const t = i / nRows;
      const phi = phiRoot + lenB * t;
      const th2 = th + dTh * t * t;
      const grow = 1 + pad + thick * t * t;
      const p = shapePoint(
        [Math.sin(phi) * Math.sin(th2), Math.cos(phi), Math.sin(phi) * Math.cos(th2)],
        shape,
      );
      pos.push(p[0] * grow, p[1] * grow, p[2] * grow);
      col.push(s, s, s);
    }
  }
  return gridGeometry(pos, rows, nStrands, nRows);
}

/**
 * Tapered tube along a Catmull-Rom curve (ahoge, ponytail). Normals are written
 * explicitly: away from the curve axis is the only correct answer for a tube,
 * and it costs nothing.
 */
export function taperedTube(points, radiusAt, { tubular = 26, radial = 10 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos = [];
  const nor = [];
  const idx = [];
  const row = radial + 1;
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    const P = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = Math.max(radiusAt(t), 0.008);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      pos.push(P.x + N.x * ca + B.x * sa, P.y + N.y * ca + B.y * sa, P.z + N.z * ca + B.z * sa);
      nor.push(
        N.x * Math.cos(a) + B.x * Math.sin(a),
        N.y * Math.cos(a) + B.y * Math.sin(a),
        N.z * Math.cos(a) + B.z * Math.sin(a),
      );
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3),
  );
  g.setIndex(idx);
  return g;
}

/* ------------------------------------------------------------------ config */

const hash01 = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Per-patch type presets, VRoid-style: choosing a type writes that patch's
 * geometry numbers, which stay editable afterwards — a starting point, not a
 * cage. null = part off. `skew` slides the bangs sector off the centreline.
 */
export const HAIR_TYPES = {
  bangs: {
    straight: { len: 0.95, sweep: 130, strands: 26, scallop: 5, wave: 0, skew: 0 },
    side: { len: 1.02, sweep: 150, strands: 22, scallop: 4, wave: 0.4, skew: -0.55 },
    wispy: { len: 0.62, sweep: 145, strands: 30, scallop: 8, wave: 0.65, skew: 0 },
    curly: { len: 0.92, sweep: 130, strands: 28, scallop: 7, wave: 1, skew: 0.2 },
    off: null,
  },
  sides: {
    short: { len: 0.7, sweep: 38, strands: 8, scallop: 3 },
    medium: { len: 0.86, sweep: 46, strands: 10, scallop: 3 },
    long: { len: 1.12, sweep: 60, strands: 14, scallop: 4 },
    off: null,
  },
  back: {
    short: { len: 0.66, sweep: 220, strands: 26, scallop: 6, wave: 0 },
    medium: { len: 1.05, sweep: 250, strands: 34, scallop: 6, wave: 0 },
    long: { len: 1.5, sweep: 300, strands: 44, scallop: 8, wave: 0.25 },
    bob: { len: 0.92, sweep: 260, strands: 36, scallop: 7, wave: 0.1 },
    ponytail: { len: 0.42, sweep: 230, strands: 26, scallop: 6, wave: 0, ponytail: 0.85 },
    off: null,
  },
  accent: {
    ahoge: { len: 0.5, thick: 0.05, curl: 1 },
    spike: { len: 0.42, thick: 0.06, curl: 0.25 },
    off: null,
  },
};

export function makeCfg() {
  const cfg = {
    shape: 'cercle',
    types: { bangs: 'straight', sides: 'medium', back: 'medium', accent: 'ahoge' },
    hairColor: '#e8b34b',
    bodyColor: '#f5dcb8',
    layers: 1, // shorter under-shell per patch: real overlap + real self-shadow
    texture: 0, // 0..1 material noise (flat at 0, as in the 2D version)
    scalp: 0.66, // polar depth of the scalp under-layer
    bangSkew: 0,
  };
  for (const part of ['bangs', 'sides', 'back', 'accent']) applyHairType(cfg, part);
  return cfg;
}

export function applyHairType(cfg, part) {
  const preset = HAIR_TYPES[part][cfg.types[part]];
  if (preset) Object.assign(cfg, preset);
  cfg.bangSkew = preset ? (preset.skew ?? 0) : 0;
}

/* -------------------------------------------------------------- the plan */

/**
 * Resolve a whole hairstyle into concrete parts. This is the work the 2D version
 * spread across a rail plus a paint order; here it is data → geometry:
 *
 *   scalp      full-circle shell just under everything (keeps the crown covered)
 *   <part>     sector shell, outer layer
 *   <part>·u   the same sector at 0.72 len, thinner, darker and strictly inside
 *              the outer shell — a real layer under a real layer
 *   ahoge      tapered tube off the crown
 *   ponytail   tapered tube off the occiput
 *
 * Returns [{ name, geometry, color, cast }] in no particular order: opaque toon
 * materials plus a depth buffer mean the renderer sorts the layers, not us.
 */
export function hairParts(cfg, shape) {
  const parts = [];
  const base = new THREE.Color(cfg.hairColor);
  const ink = new THREE.Color(0x000000);
  // layer depth is a material parameter, not baked lighting: at texture = 0 every
  // part is the same flat colour, exactly as in the 2D version
  const tint = (dark) =>
    `#${base
      .clone()
      .lerp(ink, clamp(dark * cfg.texture, 0, 0.75))
      .getHexString()}`;
  const shadeAt = (j) =>
    cfg.texture <= 0
      ? 1
      : 1 -
        cfg.texture * 0.3 * (hash01(j * 12.9898) * 0.4 + hash01(Math.floor(j / 2) * 78.233) * 0.6);

  const push = (name, geometry, dark) => {
    parts.push({ name, geometry, color: tint(dark), cast: true });
  };
  const patch = (name, spec, center, dark, phase) => {
    if (!spec) return;
    const t0 = center - deg(spec.sweep) / 2;
    const t1 = center + deg(spec.sweep) / 2;
    const thick = 0.02 + 0.024 * (spec.len ?? 1);
    push(
      name,
      hairShellGeometry(shape, { ...spec, theta0: t0, theta1: t1, thick, phase, shade: shadeAt }),
      dark,
    );
    if (cfg.layers) {
      push(
        `${name}·u`,
        hairShellGeometry(shape, {
          ...spec,
          theta0: t0,
          theta1: t1,
          len: spec.len * 0.72,
          pad: 0.002,
          thick: thick * 0.55,
          phase,
          shade: shadeAt,
        }),
        dark + 0.14,
      );
    }
  };

  push(
    'scalp',
    hairShellGeometry(shape, {
      theta0: 0,
      theta1: TAU,
      nStrands: 72,
      nRows: 8,
      len: cfg.scalp,
      scallop: 1,
      phiRoot: 0.1,
      pad: -0.008,
      thick: 0.016,
      shade: shadeAt,
    }),
    0.2,
  );

  if (cfg.types.bangs !== 'off')
    patch('bangs', HAIR_TYPES.bangs[cfg.types.bangs], cfg.bangSkew, 0, 0);
  if (cfg.types.sides !== 'off') {
    const spec = HAIR_TYPES.sides[cfg.types.sides];
    patch('sideA', spec, Math.PI / 2, 0.12, 0.7);
    patch('sideB', spec, -Math.PI / 2, 0.12, 2.5);
  }
  if (cfg.types.back !== 'off') {
    const spec = HAIR_TYPES.back[cfg.types.back];
    patch('back', spec, Math.PI, 0.26, 1.7);
    if (spec.ponytail) {
      const root = surface(shape, [0.06, 0.34, -0.94]);
      const L = spec.ponytail;
      push(
        'ponytail',
        taperedTube(
          [
            new THREE.Vector3(...root).multiplyScalar(0.96),
            new THREE.Vector3(root[0] + 0.06, root[1] + 0.12, root[2] - 0.22),
            new THREE.Vector3(root[0] + 0.1, root[1] - L * 0.42, root[2] - 0.3),
            new THREE.Vector3(root[0] + 0.04, root[1] - L * 0.95, root[2] - 0.34),
          ],
          (t) => 0.11 * (1 - 0.72 * t ** 1.4),
        ),
        0.26,
      );
    }
  }
  if (cfg.types.accent !== 'off') {
    const spec = HAIR_TYPES.accent[cfg.types.accent];
    const root = surface(shape, [0.12, 0.94, 0.32]);
    const L = spec.len;
    push(
      'accent',
      taperedTube(
        [
          new THREE.Vector3(...root).multiplyScalar(0.99),
          new THREE.Vector3(
            root[0] + 0.04 * spec.curl,
            root[1] + L * 0.5,
            root[2] + 0.1 * spec.curl,
          ),
          new THREE.Vector3(
            root[0] + 0.16 * spec.curl,
            root[1] + L * 0.95,
            root[2] + 0.02 * spec.curl,
          ),
        ],
        (t) => spec.thick * (1 - 0.8 * t),
        { tubular: 18, radial: 8 },
      ),
      0,
    );
  }
  return parts;
}

/* ------------------------------------------------------------------- boot */

const VIEWS = [
  { label: 'front', yaw: 0 },
  { label: 'three-quarter', yaw: 40 },
  { label: 'profile', yaw: 90 },
  { label: 'back', yaw: 170 },
];

export const EYE = { az: 34, el: 6, r: 0.17 };
const eyeDir = (side) => {
  const phi = deg(90 - EYE.el);
  const az = deg(EYE.az) * side;
  return [Math.sin(phi) * Math.sin(az), Math.cos(phi), Math.sin(phi) * Math.cos(az)];
};

function toonGradient() {
  // 3-step ramp — the whole NPR look is this texture (three's documented recipe)
  const tex = new THREE.DataTexture(new Uint8Array([70, 165, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function boot() {
  const stage = document.getElementById('stage');
  const rail = document.getElementById('rail');
  if (!stage || !rail) return;
  const cfg = makeCfg();
  const ui = { turn: 0, autoTurn: false, outline: true, shadow: true, fps: 0 };
  const gradient = toonGradient();
  let hud = null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (err) {
    // the research flagged this as an open question: say so loudly instead of
    // leaving a blank canvas (some sandboxes have no WebGL at all)
    stage.innerHTML = `<p style="padding:16px;font:13px/1.5 ui-monospace,monospace">WebGL unavailable here: ${String(err)}</p>`;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xf2f0eb, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc7b6, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(2.2, 3.4, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, {
    left: -2.4,
    right: 2.4,
    top: 2.4,
    bottom: -2.4,
    near: 0.5,
    far: 12,
  });
  key.shadow.bias = -0.0009;
  key.shadow.camera.updateProjectionMatrix(); // bounds changed after construction
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-2.4, -0.6, 1.4);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  camera.position.set(0, 0.08, 4.7);
  camera.lookAt(0, 0, 0);

  const head = new THREE.Group();
  scene.add(head);
  const headMat = new THREE.MeshToonMaterial({ color: cfg.bodyColor, gradientMap: gradient });
  const hairMat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap: gradient,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x16161a, side: THREE.BackSide });

  const bodyMesh = new THREE.Mesh(headGeometry(SHAPES[cfg.shape]), headMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  head.add(bodyMesh);
  const outlineMesh = new THREE.Mesh(bodyMesh.geometry, outlineMat);
  outlineMesh.scale.setScalar(1.035);
  head.add(outlineMesh);

  // Eyes ride on the surface: flat ink dot + a glint, the 2D read, but they
  // foreshorten and travel across the face on their own.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x16161a });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [-1, 1].map(() => {
    const g = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.SphereGeometry(EYE.r, 20, 14), eyeMat);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), glintMat);
    glint.position.set(-0.06, 0.07, 0.14);
    g.add(dot, glint);
    head.add(g);
    return g;
  });

  const hairGroup = new THREE.Group();
  head.add(hairGroup);

  function placeEyes() {
    eyes.forEach((g, i) => {
      const p = surface(SHAPES[cfg.shape], eyeDir(i === 0 ? -1 : 1));
      g.position.set(p[0] * 1.005, p[1] * 1.005, p[2] * 1.005);
    });
  }
  function rebuildHair() {
    for (const child of Array.from(hairGroup.children)) {
      hairGroup.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }
    for (const part of hairParts(cfg, SHAPES[cfg.shape])) {
      const mesh = new THREE.Mesh(part.geometry, hairMat.clone());
      mesh.material.color.set(part.color);
      mesh.castShadow = part.cast && ui.shadow;
      mesh.receiveShadow = true;
      mesh.name = part.name;
      hairGroup.add(mesh);
    }
  }
  function rebuildBody() {
    const geo = headGeometry(SHAPES[cfg.shape]);
    bodyMesh.geometry = geo;
    outlineMesh.geometry = geo;
    headMat.color.set(cfg.bodyColor);
    placeEyes();
  }
  rebuildBody();
  rebuildHair();

  /* ---- controls ---- */
  const el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const sel = (label, value, options, onChange) => {
    const row = el(
      `<div class="row"><label>${label}</label><select>${options.map((o) => `<option value="${o}">${o}</option>`).join('')}</select></div>`,
    );
    const s = row.querySelector('select');
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return row;
  };
  const range = (label, get, set, min, max, step, fmt) => {
    const row = el(
      `<div class="row"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" /><span class="val"></span></div>`,
    );
    const input = row.querySelector('input');
    const out = row.querySelector('.val');
    const sync = () => {
      input.value = get();
      out.textContent = fmt(get());
    };
    input.addEventListener('input', () => {
      set(parseFloat(input.value));
      sync();
    });
    sync();
    return row;
  };
  const check = (label, get, set) => {
    const row = el(`<div class="row"><label>${label}</label><input type="checkbox" /></div>`);
    const input = row.querySelector('input');
    const sync = () => {
      input.checked = !!get();
    };
    input.addEventListener('change', () => set(input.checked));
    sync();
    return row;
  };
  const title = (t) => el(`<div class="panel-title">${t}</div>`);

  const turnRow = range(
    'turn °',
    () => ui.turn,
    (v) => {
      ui.turn = v;
    },
    -180,
    180,
    1,
    (v) => v.toFixed(0),
  );
  rail.append(
    title('head'),
    sel('shape', cfg.shape, Object.keys(SHAPES), (v) => {
      cfg.shape = v;
      rebuildBody();
      rebuildHair();
    }),
    check(
      'ink outline',
      () => ui.outline,
      (v) => {
        ui.outline = v;
        outlineMesh.visible = v;
      },
    ),
    check(
      'hair cast shadow',
      () => ui.shadow,
      (v) => {
        ui.shadow = v;
        key.castShadow = v;
        for (const m of hairGroup.children) m.castShadow = v;
      },
    ),
    title('hair parts'),
    ...['bangs', 'sides', 'back', 'accent'].map((part) =>
      sel(part, cfg.types[part], Object.keys(HAIR_TYPES[part]), (v) => {
        cfg.types[part] = v;
        applyHairType(cfg, part);
        rebuildHair();
      }),
    ),
    check(
      'under-layer per part',
      () => cfg.layers,
      (v) => {
        cfg.layers = v;
        rebuildHair();
      },
    ),
    range(
      'scalp depth',
      () => cfg.scalp,
      (v) => {
        cfg.scalp = v;
        rebuildHair();
      },
      0,
      1.6,
      0.02,
      (v) => v.toFixed(2),
    ),
    title('material'),
    range(
      'texture',
      () => cfg.texture,
      (v) => {
        cfg.texture = v;
        rebuildHair();
      },
      0,
      1,
      0.05,
      (v) => v.toFixed(2),
    ),
    title('inspect'),
    turnRow,
    check(
      'auto-turn',
      () => ui.autoTurn,
      (v) => {
        ui.autoTurn = v;
      },
    ),
  );
  const colorRow = el(
    `<div class="row"><label>body / hair</label><input type="color" class="cb" /><input type="color" class="ch" /></div>`,
  );
  const cb = colorRow.querySelector('.cb');
  const ch = colorRow.querySelector('.ch');
  cb.value = cfg.bodyColor;
  ch.value = cfg.hairColor;
  cb.addEventListener('input', () => {
    cfg.bodyColor = cb.value;
    headMat.color.set(cfg.bodyColor);
  });
  ch.addEventListener('input', () => {
    cfg.hairColor = ch.value;
    rebuildHair();
  });
  rail.append(
    title('colours'),
    colorRow,
    el(`<p class="note">Drag the stage to turn the head. One renderer, four scissored views.</p>`),
  );

  /* ---- labels + HUD ---- */
  for (const v of VIEWS)
    stage.appendChild(el(`<div class="view-label">${v.label} · ${v.yaw}°</div>`));
  hud = el('<div class="hud"></div>');
  stage.appendChild(hud);
  const labels = [...stage.querySelectorAll('.view-label')];

  /**
   * In-page invariants over the same geometry the headless smoke test checks:
   * nothing floats, every patch sits on the head, the back patch really is
   * behind, attachments hang below the crown.
   */
  function selfCheck() {
    const shape = SHAPES[cfg.shape];
    const parts = hairParts(cfg, shape);
    const headTris = headGeometry(shape).index.count / 3;
    const hairTris = parts.reduce((n, p) => n + p.geometry.index.count / 3, 0);
    let maxR = 0;
    let minR = Infinity;
    for (const p of parts) {
      const a = p.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        const r = Math.hypot(a[i], a[i + 1], a[i + 2]);
        if (r > maxR) maxR = r;
        if (r < minR) minR = r;
      }
    }
    // a sector is symmetric about its centre, so its centroid says nothing —
    // ask where it *reaches*: bangs must stay in front, the back patch must
    // wrap past the ears and cover the skull behind
    const zRange = (name) => {
      const part = parts.find((p) => p.name === name);
      if (!part) return null;
      const a = part.geometry.attributes.position.array;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 2; i < a.length; i += 3) {
        if (a[i] < lo) lo = a[i];
        if (a[i] > hi) hi = a[i];
      }
      return { lo, hi };
    };
    const bangsZ = zRange('bangs') ?? { lo: 1, hi: 1 };
    const backZ = zRange('back') ?? { lo: -1, hi: -1 };
    const rows = [
      [headTris > 8000, `head mesh ${headTris | 0} tris`],
      [parts.length >= 1, `${parts.length} hair parts, ${hairTris | 0} tris`],
      [maxR < 1.7, `hair hugs the skull (r ${minR.toFixed(2)}–${maxR.toFixed(2)})`],
      [bangsZ.lo > 0.1, `bangs sit in front of the face (z ≥ ${bangsZ.lo.toFixed(2)})`],
      [backZ.lo < -0.4, `back patch covers the skull behind (z ≤ ${backZ.lo.toFixed(2)})`],
    ];
    const tail = parts.find((p) => p.name === 'ponytail');
    if (tail) {
      const a = tail.geometry.attributes.position.array;
      let minY = Infinity;
      for (let i = 1; i < a.length; i += 3) if (a[i] < minY) minY = a[i];
      rows.push([minY < -0.2, `ponytail hangs below the crown (y ${minY.toFixed(2)})`]);
    }
    return rows;
  }

  function refreshHud() {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(
      ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    ).slice(0, 58);
    const checks = selfCheck()
      .map(
        ([ok, label]) => `<span class="${ok ? 'pass' : 'fail'}">${ok ? '✓' : '✗'}</span> ${label}`,
      )
      .join('\n');
    hud.innerHTML =
      `<b>${ui.fps.toFixed(0)} fps</b> · ${renderer.info.render.triangles | 0} tris · ` +
      `${renderer.info.render.calls} calls · ${hairGroup.children.length} hair meshes\n${gpu}\n${checks}`;
  }

  /* ---- pointer turn ---- */
  let dragging = false;
  let dragFrom = 0;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragFrom = e.clientX - ui.turn;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    ui.turn = clamp(dragFrom + (e.clientX - dragFrom), -180, 180);
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
  });

  /* ---- loop: one renderer, four scissored viewports, one head ---- */
  let lastW = 0;
  let lastH = 0;
  const layout = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w !== lastW || h !== lastH) {
      lastW = w;
      lastH = h;
      renderer.setSize(w, h, false);
    }
    const cw = Math.floor(w / 2);
    const chh = Math.floor(h / 2);
    labels.forEach((tag, i) => {
      tag.style.left = `${(i % 2) * cw + 10}px`;
      tag.style.top = `${Math.floor(i / 2) * chh + 8}px`;
    });
    return [cw, chh, h];
  };
  new ResizeObserver(layout).observe(stage);
  layout();

  let last = performance.now() / 1000;
  let acc = 0;
  let frames = 0;
  function tick(ms) {
    const t = ms / 1000;
    const dt = Math.min(0.05, t - last);
    last = t;
    if (ui.autoTurn) ui.turn = (ui.turn + dt * 14) % 360;
    const [cw, chh, h] = layout();
    const open = Math.sin(t * 1.7) ** 8 > 0.12 ? 1 : 0.08;
    eyes.forEach((e) => {
      e.scale.y = open;
    });
    head.position.y = Math.sin(t * 1.1) * 0.015;
    head.rotation.z = Math.sin(t * 0.7) * 0.02;
    renderer.setScissorTest(true);
    VIEWS.forEach((v, i) => {
      head.rotation.y = deg(v.yaw + ui.turn);
      camera.aspect = cw / chh;
      camera.updateProjectionMatrix();
      const x = (i % 2) * cw;
      const y = h - chh - Math.floor(i / 2) * chh; // viewport origin is bottom-left
      renderer.setViewport(x, y, cw, chh);
      renderer.setScissor(x, y, cw, chh);
      renderer.render(scene, camera);
    });
    renderer.setScissorTest(false);
    acc += dt;
    frames += 1;
    if (acc > 0.5) {
      ui.fps = frames / acc;
      acc = 0;
      frames = 0;
      refreshHud();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  refreshHud();
}

if (typeof document !== 'undefined') boot();

export { VIEWS };
