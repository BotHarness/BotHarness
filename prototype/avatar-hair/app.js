/* eslint-disable */
// PROTOTYPE (throwaway) — see index.html header for the plan and question.
// Shape math (radial profiles, hulls, unions) follows jeremy-prt/bloub (MIT).
// Not pure-function like bloub's engine (this one keeps rng state) — fine for a prototype.

/* ============================================================ math */

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (v) => Math.round(v * 100) / 100;
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const deg = (d) => (d * Math.PI) / 180;

/** normalize(lerp) — approximate great-circle interpolation on the unit sphere */
function slerp3(a, b, t) {
  const x = lerp(a[0], b[0], t);
  const y = lerp(a[1], b[1], t);
  const z = lerp(a[2], b[2], t);
  const L = Math.hypot(x, y, z) || 1;
  return [x / L, y / L, z / L];
}

/** deterministic hash → [-1, 1] — seeds the hair material noise */
function hashNoise(a, b) {
  let h = Math.imul((a * 374761393 + b * 668265263) | 0, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h / 4294967295) * 2 - 1;
}

/* ============================================================ radial profiles */

const PROFILE_N = 64;
const ANGLES = Array.from({ length: PROFILE_N }, (_, i) => (i / PROFILE_N) * TAU);
const COS = ANGLES.map(Math.cos);
const SIN = ANGLES.map(Math.sin);

function profileCircle(r = 1) {
  return new Array(PROFILE_N).fill(r);
}

function normalizeProfile(radii, max = 1) {
  const peak = Math.max(...radii);
  if (peak <= 0) return radii;
  const k = max / peak;
  return radii.map((r) => r * k);
}

/** superellipse |x|^n + |y|^n = 1 as r(theta) */
function superellipseProfile(n, sx = 1, sy = 1) {
  return ANGLES.map((_, i) => {
    const c = Math.abs(COS[i] / sx) ** n;
    const s = Math.abs(SIN[i] / sy) ** n;
    return (c + s) ** (-1 / n);
  });
}

/** union of discs as r(theta): farthest ray/circle hit. Exact while origin is inside. */
function unionOfCirclesProfile(circles) {
  const out = new Array(PROFILE_N).fill(0);
  for (let i = 0; i < PROFILE_N; i++) {
    const dx = COS[i];
    const dy = SIN[i];
    let best = 0;
    for (const c of circles) {
      const b = dx * c.x + dy * c.y;
      const disc = b * b - (c.x * c.x + c.y * c.y - c.r * c.r);
      if (disc < 0) continue;
      const t = b + Math.sqrt(disc);
      if (t > best) best = t;
    }
    out[i] = best;
  }
  return out;
}

/** arbitrary polygon -> radial profile by ray casting (for shapes that are not r(theta)) */
function profileFromPolygon(poly, cx, cy) {
  const radii = new Array(PROFILE_N).fill(0);
  const n = poly.length;
  for (let k = 0; k < PROFILE_N; k++) {
    const dx = COS[k];
    const dy = SIN[k];
    let best = 0;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const px = a.x - cx;
      const py = a.y - cy;
      const t = (px * ey - py * ex) / den;
      const u = (px * dy - py * dx) / den;
      if (t > best && u >= 0 && u <= 1) best = t;
    }
    radii[k] = best;
  }
  return radii;
}

/** convex hull of two circles (tapered capsule outline) */
function hullOfCircles(x1, y1, r1, x2, y2, r2v, steps = 72) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1e-6;
  const base = Math.atan2(dy, dx);
  const spread = Math.acos(clamp((r1 - r2v) / dist, -1, 1));
  const pts = [];
  for (let i = 0; i <= steps / 2; i++) {
    const a = base + spread + ((TAU - 2 * spread) * i) / (steps / 2);
    pts.push({ x: x1 + Math.cos(a) * r1, y: y1 + Math.sin(a) * r1 });
  }
  for (let i = 0; i <= steps / 2; i++) {
    const a = base - spread + (2 * spread * i) / (steps / 2);
    pts.push({ x: x2 + Math.cos(a) * r2v, y: y2 + Math.sin(a) * r2v });
  }
  return pts;
}

function roundedPolygon(verts, rc, arcSteps = 8) {
  const n = verts.length;
  const out = [];
  const normal = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return Math.atan2(-dx / len, dy / len);
  };
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n];
    const cur = verts[i];
    const next = verts[(i + 1) % n];
    const a0 = normal(prev, cur);
    const a1 = normal(cur, next);
    let d = a1 - a0;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    for (let k = 0; k <= arcSteps; k++) {
      const a = a0 + (d * k) / arcSteps;
      out.push({ x: cur.x + Math.cos(a) * rc, y: cur.y + Math.sin(a) * rc });
    }
  }
  return out;
}

function regularPolygonProfile(sides, radius, rc, rotationDeg = 0) {
  const rot = deg(rotationDeg);
  const verts = Array.from({ length: sides }, (_, i) => {
    const a = rot + (i / sides) * TAU;
    return { x: Math.cos(a) * (radius - rc), y: Math.sin(a) * (radius - rc) };
  });
  return profileFromPolygon(roundedPolygon(verts, rc), 0, 0);
}

/* — the customiser shapes — */

const SHAPES = {
  cercle: { id: 'cercle', radii: profileCircle(1) },
  galet: {
    id: 'galet',
    radii: normalizeProfile(
      ANGLES.map((a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)),
      1.02,
    ),
  },
  squircle: { id: 'squircle', radii: normalizeProfile(superellipseProfile(4.2), 1.15) },
  hexagone: { id: 'hexagone', radii: regularPolygonProfile(6, 1.04, 0.26, 0) },
  goutte: {
    id: 'goutte',
    radii: normalizeProfile(
      profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0),
      1.04,
    ),
  },
};

/* ============================================================ silhouette */

function silhouette(name, pose = {}) {
  return { radii: [...SHAPES[name].radii], rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose };
}

function circleSil(r, pose = {}) {
  return { radii: profileCircle(r), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose };
}

function blendSil(a, b, t, out) {
  const dst = out || { radii: new Array(PROFILE_N), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 };
  for (let i = 0; i < PROFILE_N; i++) dst.radii[i] = lerp(a.radii[i] ?? 1, b.radii[i] ?? 1, t);
  let dRot = b.rot - a.rot;
  while (dRot > Math.PI) dRot -= TAU;
  while (dRot < -Math.PI) dRot += TAU;
  dst.rot = a.rot + dRot * t;
  dst.cx = lerp(a.cx, b.cx, t);
  dst.cy = lerp(a.cy, b.cy, t);
  dst.sx = lerp(a.sx, b.sx, t);
  dst.sy = lerp(a.sy, b.sy, t);
  return dst;
}

function toPoints(sil, scale, out = []) {
  const cr = Math.cos(sil.rot);
  const sr = Math.sin(sil.rot);
  for (let i = 0; i < PROFILE_N; i++) {
    const r = sil.radii[i] ?? 1;
    const x = r * COS[i];
    const y = r * SIN[i];
    const rx = x * cr - y * sr;
    const ry = x * sr + y * cr;
    const p = out[i] || (out[i] = { x: 0, y: 0 });
    p.x = (rx * sil.sx + sil.cx) * scale;
    p.y = (ry * sil.sy + sil.cy) * scale;
  }
  out.length = PROFILE_N;
  return out;
}

/** closed polyline -> smooth cubic path (Catmull-Rom) */
function closedPath(pts, tension = 1 / 6) {
  const n = pts.length;
  if (n < 3) return '';
  const P = (i) => pts[(i + n) % n];
  let d = `M${r2(P(0).x)} ${r2(P(0).y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += `C${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`;
  }
  return `${d}Z`;
}

function polyPath(pts) {
  if (pts.length < 3) return '';
  let d = '';
  for (let i = 0; i < pts.length; i++) d += `${i === 0 ? 'M' : 'L'}${r2(pts[i].x)} ${r2(pts[i].y)}`;
  return `${d}Z`;
}

function radiusAtAngle(radii, angle) {
  const n = radii.length;
  const t = ((((angle / TAU) % 1) + 1) % 1) * n;
  const i = Math.floor(t);
  return lerp(radii[i % n] ?? 1, radii[(i + 1) % n] ?? 1, t - i);
}

/** vertical capsule centred at origin — the eye shape */
function capsulePath(w, h) {
  const hw = Math.max(w, 0.01) / 2;
  const hh = Math.max(h, 0.01) / 2;
  const r = Math.min(hw, hh);
  return (
    `M${r2(-hw)} ${r2(-hh + r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw + r)} ${r2(-hh)}` +
    `L${r2(hw - r)} ${r2(-hh)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw)} ${r2(-hh + r)}` +
    `L${r2(hw)} ${r2(hh - r)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw - r)} ${r2(hh)}` +
    `L${r2(-hw + r)} ${r2(hh)}A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw)} ${r2(hh - r)}Z`
  );
}

function mixHex(from, to, t) {
  const parse = (h) => {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const a = parse(from);
  const b = parse(to);
  const c = a.map((x, i) => Math.round(lerp(x, b[i], t)));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/* ============================================================ face (eyes) */

const EYE_SPLIT = 16; // degrees, half angular distance between eyes on the sphere

function rotEye(p, yawDeg, pitchDeg, rollDeg) {
  let [x, y, z] = p;
  // Ry (yaw)
  const cy = Math.cos(deg(yawDeg));
  const sy = Math.sin(deg(yawDeg));
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  // Rx (pitch) — positive pitch tilts gaze downward
  const cp = Math.cos(deg(pitchDeg));
  const sp = Math.sin(deg(pitchDeg));
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  // Rz (roll, screen)
  const cr = Math.cos(deg(rollDeg));
  const sr = Math.sin(deg(rollDeg));
  [x, y] = [x * cr - y * sr, x * sr + y * cr];
  return [x, y, z];
}

/**
 * Orthographic tangent frame of a rotated sphere point: screen coords with
 * foreshortening kept (NO renormalize — this is what makes eyes feel 3D),
 * depth, and the screen-projected east/north basis for oriented shapes.
 */
function sphereFrame(p) {
  // east = cross(worldUp, p), north = cross(p, east)
  let ex = p[2];
  let ey = 0;
  let ez = -p[0];
  const el = Math.hypot(ex, ey, ez) || 1;
  ex /= el;
  ey /= el;
  ez /= el;
  let nx = p[1] * ez - p[2] * ey;
  let ny = p[2] * ex - p[0] * ez;
  let nz = p[0] * ey - p[1] * ex;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  return {
    sx: p[0],
    sy: -p[1],
    depth: p[2],
    ex, // screen-projected east (y already flipped)
    ey: -ey,
    nx,
    ny: -ny,
  };
}

/**
 * Eyes live on a sphere (radius 1): orthographic projection of the tangent
 * frame gives depth compression + tilt for free. Returns ball-unit screen
 * coords (y down) + 2D basis for the capsule + depth.
 */
function eyePoses(gaze, sil) {
  const s = deg(EYE_SPLIT);
  const out = [];
  for (const side of [-1, 1]) {
    const p = rotEye([side * Math.sin(s), 0.1, Math.cos(s)], gaze.yaw, gaze.pitch, gaze.roll);
    if (p[2] <= 0.03) {
      out.push(null);
      continue;
    }
    const f = sphereFrame(p);
    const ang = Math.atan2(f.sy, f.sx) - sil.rot;
    const fit = radiusAtAngle(sil.radii, ang);
    out.push({
      x: f.sx * fit + sil.cx,
      y: f.sy * fit + sil.cy,
      ex: f.ex,
      ey: f.ey,
      nx: f.nx,
      ny: f.ny,
      depth: f.depth,
    });
  }
  return out;
}

/**
 * Hair anchor — the exact same pipeline as an eye: a FIXED point on the unit
 * sphere in head space → rotEye → orthographic project (foreshortening kept)
 * → scale by the silhouette radius at the projected angle → depth.
 * No renormalize: that would cancel the perspective the eyes get.
 */
function hairProject(base, gaze, sil) {
  const p = rotEye(base, gaze.yaw, gaze.pitch, gaze.roll);
  const f = sphereFrame(p);
  const ang = Math.atan2(f.sy, f.sx) - sil.rot;
  const fit = radiusAtAngle(sil.radii, ang);
  return { x: f.sx * fit + sil.cx, y: f.sy * fit + sil.cy, z: f.depth };
}

/**
 * Fixed head-space base for a bang tip that should project (at gaze 0) to
 * radius k * fit along screen angle theta. hemi=+1 front hemisphere (z=sqrt…,
 * like an eye — depth fade works at rest); hemi=-1 back hemisphere (invisible
 * at rest, rotates into view when the head turns around).
 */
function hairTipBase(theta, k, hemi = 1) {
  const kk = clamp(k, -0.98, 0.98);
  return [kk * Math.cos(theta), -kk * Math.sin(theta), hemi * Math.sqrt(1 - kk * kk)];
}

/**
 * Fixed head-space base near the crown limb (outline): xy almost full radius,
 * lifted toward the viewer by zLift so depth > 0 at rest (eyes rest ~0.96;
 * edge hair rests lower but still fully lit).
 */
function hairRootBase(theta, zLift = 0.25) {
  const z = clamp(zLift, 0.02, 0.95);
  const k = Math.sqrt(1 - z * z);
  return [k * Math.cos(theta), -k * Math.sin(theta), z];
}

const blinkScale = (k) => Math.max(k, 0.04);

/* ============================================================ states */

const DOT_X = [-0.557, -0.013, 0.532];
const DOT_R = 0.165;
const DOT_PEAK = 1.25;

function dotPulse(t, index) {
  const p = ((((t - index * 0.5) / 1.5) % 1) + 1) % 1;
  const k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU) : 0;
  return clamp(k * 2);
}

const P_RNG = createRng(0xbeef);
const PARTICLES = Array.from({ length: 5 }, (_, i) => ({
  birth: i * 0.2,
  angle: P_RNG() * TAU,
  rho: 0.58 + P_RNG() * 0.18,
}));

function burstParticles(t) {
  const out = [];
  for (const p of PARTICLES) {
    const u = t - p.birth;
    if (u < 0 || u > 0.62) continue;
    const rho = p.rho * Math.pow(0.75, u * 10);
    const a = p.angle + (u * 100 * Math.PI) / 180;
    out.push({
      x: Math.cos(a) * rho,
      y: Math.sin(a) * rho,
      r: 0.04 + 0.028 * clamp(u / 0.55),
      depth: clamp(1 - rho / 0.8),
      opacity: clamp(u / 0.06) * clamp((0.62 - u) / 0.08),
    });
  }
  return out;
}

const pair = (w, h) => [
  { w, h, open: 1, tilt: 0 },
  { w, h, open: 1, tilt: 0 },
];

function basePose(over = {}) {
  return {
    sil: circleSil(1),
    gaze: { yaw: -8, pitch: -4, roll: -5 },
    split: EYE_SPLIT,
    eyes: pair(0.23, 0.45),
    eyeAlpha: 1,
    dots: [],
    dotsBehind: false,
    ...over,
  };
}

const STATES = {
  idle: {
    id: 'idle',
    duration: 2.4,
    morph: 0.45,
    blinkIn: false,
    baseBody: true,
    pose: () => basePose(),
  },
  wink: {
    id: 'wink',
    duration: 1.6,
    morph: 0.3,
    blinkIn: true,
    baseBody: true,
    pose: () =>
      basePose({
        gaze: { yaw: -5, pitch: 4, roll: 6 },
        split: 16.25,
        // closed eye = horizontal dash, wider than the open eye
        eyes: [
          { w: 0.236, h: 0.464, open: 1, tilt: 0 },
          { w: 0.447, h: 0.089, open: 1, tilt: 0 },
        ],
      }),
  },
  thinking: {
    id: 'thinking',
    duration: 2.6,
    morph: 0.4,
    blinkIn: true,
    baseBody: false, // the silhouette IS the animation here
    pose: (t) => {
      const mid = dotPulse(t, 1);
      const emerge = 0.3 + 0.7 * easeOutCubic(clamp(t / 0.3));
      return basePose({
        sil: circleSil(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cx: DOT_X[1] }),
        eyeAlpha: 0,
        dots: [0, 2].map((i) => {
          const k = dotPulse(t, i);
          return {
            x: DOT_X[i] * emerge,
            y: 0,
            r: DOT_R * (1 + (DOT_PEAK - 1) * k),
            opacity: 0.55 + 0.45 * k,
          };
        }),
      });
    },
  },
  burst: {
    id: 'burst',
    duration: 2.6,
    morph: 0.4,
    blinkIn: false,
    baseBody: false,
    pose: (t) => {
      const collapse = 1 - 0.834 * easeOutQuint(clamp(t / 0.7));
      const regrow = easeOutQuint(clamp((t - 1.7) / 0.7));
      return basePose({
        sil: circleSil(collapse + (1 - collapse) * regrow),
        eyeAlpha: clamp((t - 1.85) / 0.4),
        dots: burstParticles(t),
        dotsBehind: true,
      });
    },
  },
};

const STATE_ORDER = ['idle', 'wink', 'thinking', 'burst'];

function blendPose(a, b, t) {
  const out = 1 - t;
  return {
    sil: blendSil(a.sil, b.sil, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: a.eyes.map((e, i) => {
      const f = b.eyes[i] ?? e;
      return {
        w: lerp(e.w, f.w, t),
        h: lerp(e.h, f.h, t),
        open: lerp(e.open, f.open, t),
        tilt: lerp(e.tilt ?? 0, f.tilt ?? 0, t),
      };
    }),
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    dots: [
      ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
      ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t })),
    ],
    dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind,
  };
}

/* ============================================================ engine */

const SHAPE_MORPH = 0.45;

class ProtoEngine {
  constructor(scale = 100, initial = 'idle') {
    this.scale = scale;
    this.cur = initial;
    this.prev = null;
    this.tCur = 0;
    this.tPrev = 0;
    this.departFige = null;
    this.blinkAt = -10;
    this.nextBlink = 1.5;
    this.rng = createRng(0x51ce);
    // user customisation
    this.shape = null; // number[] | null (base radii)
    this.shapePrev = null;
    this.shapeAt = -10;
    // hairifier (variant B): folded into the silhouette on eligible states
    this.hairFn = null;
    this.hairEverywhere = false;
    // previous frame's gaze for hairFn (posed runs before gaze is computed; 1-frame lag)
    this.hairGaze = { yaw: -8, pitch: -4, roll: -5 };
    // gaze follow
    this.lookTarget = { yaw: 0, pitch: 0, mix: 0 };
    this.look = { yaw: 0, pitch: 0, mix: 0 };
    this.lookAt = -10;
    this.lastSample = null;
  }

  setShape(radii, now = 0) {
    if (radii === this.shape) return;
    this.shapePrev = this.shape;
    this.shape = radii;
    this.shapeAt = now;
  }

  setLook(yaw, pitch, mix, now = 0) {
    if (!Number.isFinite(yaw + pitch + mix)) return;
    this.look = { yaw, pitch, mix };
    this.lookAt = now;
  }

  setState(id, now = 0) {
    if (id === this.cur) return;
    // freeze the composite pose when a change lands mid-fade (keeps chained changes continuous)
    this.departFige = this.lastSample ? this.lastSample.pose : null;
    this.prev = this.cur;
    this.tPrev = this.tCur;
    this.cur = id;
    this.tCur = now;
    if (STATES[id].blinkIn) this.blinkAt = now;
  }

  shapeAtTime(now) {
    if (!this.shape) return null;
    if (!this.shapePrev) return this.shape;
    const k = (now - this.shapeAt) / SHAPE_MORPH;
    if (k >= 1) return this.shape;
    const t = easeOutQuint(clamp(k));
    return this.shape.map((r, i) => lerp(this.shapePrev[i] ?? r, r, t));
  }

  posed(def, t, shape) {
    let pose = def.pose(t);
    if (def.baseBody && shape) {
      let radii = shape;
      if (this.hairFn && (this.hairEverywhere || def.baseBody))
        radii = this.hairFn(radii, this.hairGaze);
      pose = { ...pose, sil: { ...pose.sil, radii } };
    } else if (!def.baseBody && this.hairFn && this.hairEverywhere) {
      // forced experiment: hairifier also runs on animation states
      pose = {
        ...pose,
        sil: { ...pose.sil, radii: this.hairFn(pose.sil.radii, this.hairGaze) },
      };
    }
    return pose;
  }

  sample(now) {
    const R = this.scale;
    const def = STATES[this.cur];
    const shape = this.shapeAtTime(now);

    let pose = this.posed(def, Math.max(0, now - this.tCur), shape);

    // entrance fade
    const since = now - this.tCur;
    if (since < def.morph) {
      let origine;
      if (this.departFige) origine = this.departFige;
      else if (this.prev)
        origine = this.posed(STATES[this.prev], Math.max(0, now - this.tPrev), shape);
      if (origine) pose = blendPose(origine, pose, easeOutQuint(clamp(since / def.morph)));
    }

    // gaze: ease toward the pointer target (~0.1s), then autonomous drift
    const dtS = this._ln == null ? 0.016 : clamp(now - this._ln, 0, 0.05);
    this._ln = now;
    const kLook = 1 - Math.exp(-dtS / 0.1);
    if (!this.sm) this.sm = { yaw: 0, pitch: 0, mix: 0 };
    this.sm.yaw = lerp(this.sm.yaw, this.lookTarget.yaw, kLook);
    this.sm.pitch = lerp(this.sm.pitch, this.lookTarget.pitch, kLook);
    this.sm.mix = lerp(this.sm.mix, this.lookTarget.mix, kLook);
    const mix = this.sm.mix;
    const wanderYaw = Math.sin(now * 0.6 + 1.1) * 3.5;
    const wanderPitch = Math.sin(now * 0.47) * 2.5;
    const gaze = {
      yaw: lerp(pose.gaze.yaw, this.sm.yaw, mix) + wanderYaw * (1 - mix * 0.7),
      pitch: lerp(pose.gaze.pitch, this.sm.pitch, mix) + wanderPitch * (1 - mix * 0.7),
      roll: pose.gaze.roll + Math.sin(now * 0.31) * 0.6,
    };
    this.hairGaze = gaze; // consumed by posed() on the next sample

    // blink: scheduled + forced by state entry
    if (now >= this.nextBlink && pose.eyeAlpha > 0.01) {
      this.blinkAt = now;
      this.nextBlink = now + 2.2 + this.rng() * 2.6;
    }
    const forced = clamp((now - this.blinkAt) / 0.16);
    const schedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1;

    // rest life: breath + tiny drift (bloub measures centre stable; this is just enough life)
    const breath = 1 + 0.005 * Math.sin(now * 0.9);
    const driftX = 0.003 * Math.sin(now * 0.53);
    const driftY = 0.004 * Math.sin(now * 0.41 + 2);

    const sil = {
      ...pose.sil,
      cx: pose.sil.cx + driftX,
      cy: pose.sil.cy + driftY,
      sy: pose.sil.sy * breath,
    };
    const bodyPath = closedPath(toPoints(sil, R, []));

    // eye holes for the mask
    const holes = [];
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, sil);
      for (let i = 0; i < 2; i++) {
        const e = poses[i];
        if (!e || e.depth <= 0.04) continue;
        const cfg = pose.eyes[i];
        const k = blinkScale(Math.min(schedLid, cfg.open));
        const phi = deg(cfg.tilt ?? 0);
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const ax = e.ex * cp + e.nx * sp;
        const ay = e.ey * cp + e.ny * sp;
        const bx = -e.ex * sp + e.nx * cp;
        const by = -e.ey * sp + e.ny * cp;
        holes.push({
          d: capsulePath(cfg.w * R, cfg.h * R),
          m: `matrix(${r2(ax)},${r2(ay * k)},${r2(bx)},${r2(by * k)},${r2(e.x * R)},${r2(e.y * R)})`,
          opacity: pose.eyeAlpha * clamp(e.depth / 0.12),
        });
      }
    }

    // dots (screen coords)
    const dots = pose.dots
      .filter((d) => d.opacity > 0.01 && d.r > 0.0005)
      .map((d) => ({ ...d, x: d.x * R, y: d.y * R, r: d.r * R }));

    const frame = {
      pose, // blended pose snapshot (for mid-fade freeze)
      sil,
      bodyPath,
      holes,
      dots,
      dotsBehind: pose.dotsBehind,
      eyeAlpha: pose.eyeAlpha,
      baseBody: def.baseBody,
      state: def.id,
      tLocal: Math.max(0, now - this.tCur),
      gaze,
    };
    this.lastSample = frame;
    return frame;
  }
}

/* ============================================================ hair generators */

/**
 * Resolve a patch band into per-vertex data (shared by patchStrands and the
 * hairline shadow). region = { midDeg, sweep, len, strands, hemi, wave, phase }.
 */
function vertexList(sil, opt, region = {}) {
  const N = PROFILE_N;
  const midDeg = region.midDeg ?? 270;
  const sweep = region.sweep ?? opt.sweep;
  const len = region.len ?? opt.len;
  const strands = region.strands ?? opt.strands;
  const wave = region.wave ?? 0;
  const phase = region.phase ?? 0;
  const hemi = region.hemi ?? 1;
  const mid = Math.round((midDeg / 360) * N);
  const half = Math.max(1, Math.round((sweep / 360) * N * 0.5));
  const i0 = mid - half;
  const count = half * 2;
  const STEP = TAU / N;
  const verts = [];
  for (let j = 0; j <= count; j++) {
    const ij = i0 + j; // continuous index (may be negative / past N)
    const i = ((ij % N) + N) % N;
    const theta = ANGLES[i]; // wrapped — trig-equivalent to the raw angle
    const u = j / count;
    // strand tips: long in the middle of each lock, short at the joins
    const scallop = Math.abs(Math.sin(u * strands * Math.PI));
    const lenB = len * (0.55 + 0.45 * scallop);
    const fit = Math.max(radiusAtAngle(sil.radii, theta - sil.rot), 0.05);
    // continuous angle (for hairline lerps) + lateral wave offset on the tip
    const cont = ij * STEP;
    const tipCont = cont + wave * deg(14) * Math.sin(u * Math.PI * 2 * 1.25 + phase);
    verts.push({ i, theta, cont, tipCont, u, k: clamp(1 - lenB / fit, -0.98, 0.98) });
  }
  return { verts, count, STEP, hemi };
}

/**
 * One hair PATCH: a band of meridian strips over the live outline, all
 * through the eye pipeline (so strands are curves that bend with gaze).
 * VRoid-style part vocabulary: the same generator feeds bangs (front, hemi +1),
 * side locks (narrow band beside the bangs) and back hair (hemi −1, culled at
 * rest, revealed when the head turns). Returns per-strand paths
 * [{ d, fade, j, u }] — colour/texture is the caller's job (cfg.texture).
 */
function patchStrands(sil, center, opt, gaze, region = {}) {
  const R = center.R;
  const { verts, count, STEP, hemi } = vertexList(sil, opt, region);
  const outline = toPoints(sil, R, []);
  const rootPad = region.rootPad ?? 2.5; // outward bulge — hair mass past the skull
  const STEPS = 10; // radial subdivision per strand — this is what makes it a curve
  const HAIRLINE = 3; // extra samples along the inner edge between tips

  // projected samples along the meridian limb→tip (tip last); at rest the
  // meridian plane contains the view axis (straight — correct); once the head
  // turns the plane leaves the view axis → ellipse arc (curves)
  const side = (theta, tipTheta, k) => {
    const root = [Math.cos(theta), -Math.sin(theta), 0]; // head-fixed limb point
    const tip = hairTipBase(tipTheta, k, hemi);
    const pts = [];
    for (let s = 1; s <= STEPS; s++) {
      const a = hairProject(slerp3(root, tip, s / STEPS), gaze, sil);
      pts.push({ x: a.x * R, y: a.y * R });
    }
    return pts;
  };

  const padOut = (p) => {
    let dx = p.x - center.x;
    let dy = p.y - center.y;
    const L = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / L) * rootPad, y: p.y + (dy / L) * rootPad };
  };

  const strandsOut = [];
  for (let j = 0; j < count; j++) {
    const ta = verts[j];
    const tb = verts[j + 1];
    const pa = hairProject(hairTipBase(ta.tipCont, ta.k, hemi), gaze, sil);
    const pb = hairProject(hairTipBase(tb.tipCont, tb.k, hemi), gaze, sil);
    // keep the strand while EITHER tip is in view; fade on the MEAN depth so
    // strands crossing the terminator fade gradually instead of popping flat
    if (Math.max(pa.z, pb.z) < 0.03) continue;
    const fade = clamp((pa.z + pb.z) / 2 / 0.16);
    // curved hairline: several projected samples between the tips
    const hairline = [];
    for (let h = 1; h < HAIRLINE; h++) {
      const f = h / HAIRLINE;
      const th = lerp(ta.tipCont, tb.tipCont, f);
      const kk = lerp(ta.k, tb.k, f);
      const m = hairProject(hairTipBase(th, kk, hemi), gaze, sil);
      hairline.push({ x: m.x * R, y: m.y * R });
    }
    const ring = [
      padOut(outline[ta.i]),
      ...side(ta.theta, ta.tipCont, ta.k), // …ends at tip A
      ...hairline, // smooth inner curve across to tip B
      ...side(tb.theta, tb.tipCont, tb.k).reverse(), // starts at tip B, climbs back out
      padOut(outline[tb.i]),
    ];
    strandsOut.push({ d: closedPath(ring), fade, j, u: ta.u });
  }
  return strandsOut;
}

/**
 * Scalp underlayer (VRoid ベースヘアー): a hair-coloured rim just outside the
 * body silhouette — full circle with extra volume over the crown — drawn in
 * the BACK layer. Gives 360° hair mass from any head angle and plugs the
 * roots of every patch (nothing floats).
 */
function baseCapPath(sil, center, base) {
  const boost = sil.radii.map((r, i) => {
    let d = ANGLES[i] - Math.PI * 1.5; // distance from the profile top
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const topWin = Math.max(0, 1 - Math.abs(d) / deg(130));
    return r + base * (0.035 + 0.05 * topWin * topWin);
  });
  return closedPath(toPoints({ ...sil, radii: boost }, center.R, []));
}

/**
 * Accent strand (VRoid アホ毛): a single curved flick sprouting from the
 * crown, sampled along a 3D quadratic and projected through the eye pipeline
 * like everything else, with a gentle time sway. style: ahoge (curled) |
 * spike (short straight flick).
 */
function accentPath(sil, center, gaze, clock, style = 'ahoge') {
  const R = center.R;
  const rootB = hairRootBase(Math.PI * 1.5, 0.3); // crown, slightly toward viewer
  const depth = rotEye(rootB, gaze.yaw, gaze.pitch, gaze.roll)[2];
  if (depth <= 0.04) return null;
  const sway = Math.sin(clock * 2.1) * 0.07;
  const [ctrlB, tipB] =
    style === 'spike'
      ? [
          [0.1 + sway * 0.4, 1.3, 0.12],
          [0.18 + sway * 0.8, 1.52, 0.02],
        ]
      : [
          [0.16 + sway, 1.16, 0.18],
          [0.48 + sway * 2, 1.3, 0.06],
        ];
  const STEPS = 8;
  let d = '';
  for (let s = 0; s <= STEPS; s++) {
    const t = s / STEPS;
    const mt = 1 - t;
    const b = [
      mt * mt * rootB[0] + 2 * mt * t * ctrlB[0] + t * t * tipB[0],
      mt * mt * rootB[1] + 2 * mt * t * ctrlB[1] + t * t * tipB[1],
      mt * mt * rootB[2] + 2 * mt * t * ctrlB[2] + t * t * tipB[2],
    ];
    const a = hairProject(b, gaze, sil);
    d += `${s ? 'L' : 'M'}${r2(a.x * R)} ${r2(a.y * R)}`;
  }
  return { d, fade: clamp(depth / 0.12) };
}

/**
 * Ponytail (VRoid つけ髪 attachment): rooted on the OCCIPUT (back of the
 * sphere), so it is invisible at rest (depth < 0 → fade 0) and swings into
 * view as the head turns past profile. The tail hangs screen-down from the
 * projected root with time sway — a back-layer attachment, not a face patch.
 */
function ponytailPath(sil, center, gaze, clock, len) {
  const R = center.R;
  const rootB = [0.03, 0.22, -0.97]; // upper occiput, dead back
  const depth = rotEye(rootB, gaze.yaw, gaze.pitch, gaze.roll)[2];
  const fade = clamp(depth / 0.12);
  if (fade < 0.03) return null;
  const a = hairProject(rootB, gaze, sil);
  const root = { x: a.x * R, y: a.y * R };
  const L = Math.max(len, 0.05) * R;
  const sway = Math.sin(clock * 1.9) * 0.1 * L;
  let ox = root.x - center.x;
  let oy = root.y - center.y;
  const ol = Math.hypot(ox, oy) || 1;
  ox /= ol;
  oy /= ol;
  // quadratic: bulge away from the head, tip falling screen-down
  const ctrlB = { x: root.x + ox * L * 0.35 + sway * 0.7, y: root.y + L * 0.45 };
  const tipB = { x: root.x + ox * L * 0.15 + sway, y: root.y + L * 0.95 };
  const STEPS = 8;
  let d = '';
  for (let s = 0; s <= STEPS; s++) {
    const t = s / STEPS;
    const mt = 1 - t;
    const x = mt * mt * root.x + 2 * mt * t * ctrlB.x + t * t * tipB.x;
    const y = mt * mt * root.y + 2 * mt * t * ctrlB.y + t * t * tipB.y;
    d += `${s ? 'L' : 'M'}${r2(x)} ${r2(y)}`;
  }
  return { d, fade };
}

/**
 * Occlusion strip under the bangs hairline (PureHair "textured head" idea):
 * a soft dark band hanging just below the inner edge, drawn beneath the
 * strands so the fringe reads as sitting ON the forehead, not floating.
 */
function hairlineShadowPath(sil, center, opt, gaze, region) {
  const R = center.R;
  const { verts, hemi } = vertexList(sil, opt, region);
  const segs = [];
  let cur = [];
  for (const v of verts) {
    const a = hairProject(hairTipBase(v.tipCont, v.k, hemi), gaze, sil);
    if (a.z > 0.05) cur.push({ x: a.x * R, y: a.y * R });
    else {
      if (cur.length > 1) segs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) segs.push(cur);
  let d = '';
  for (const seg of segs) {
    const n = seg.length;
    seg.forEach((p, i) => {
      d += `${i ? 'L' : 'M'}${r2(p.x)} ${r2(p.y)}`;
    });
    for (let i = n - 1; i >= 0; i--) d += `L${r2(seg[i].x)} ${r2(seg[i].y + R * 0.1)}`;
    d += 'Z';
  }
  return d;
}

/**
 * B — hair folded into r(theta): spikes (harmonic bumps, windowed to the top)
 * or a bob (union of discs). Approximate profile-space gaze follow: the spike
 * pattern/window slides with yaw+roll, the window width breathes with pitch,
 * bob lobes translate with yaw/pitch. Returns a new radii array.
 */
function hairifyRadii(radii, opt, gaze = { yaw: 0, pitch: 0, roll: 0 }) {
  if (opt.style === 'spikes') {
    const out = radii.slice();
    const dYaw = deg(gaze.yaw) * 0.7 + deg(gaze.roll);
    const top = -Math.PI / 2 + dYaw;
    const halfW =
      Math.PI * (opt.window / 180) * clamp(1 + 0.45 * Math.sin(deg(gaze.pitch)), 0.3, 1.8);
    for (let i = 0; i < PROFILE_N; i++) {
      const a = ANGLES[i];
      // angular distance from the (gaze-shifted) top
      let d = a - top;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const win = Math.abs(d) > halfW ? 0 : 0.5 + 0.5 * Math.cos((d / halfW) * Math.PI);
      if (win <= 0) continue;
      const phase = (a - top) * opt.count * 0.5;
      const spike = Math.pow(Math.abs(Math.sin(phase)), 3);
      out[i] = Math.max(out[i], out[i] + opt.amp * win * spike);
    }
    return out;
  }
  // bob: union with lobes around a radius-~1 core; hair lobes slide with gaze
  const k = opt.amp / 0.35;
  const tx = Math.sin(deg(gaze.yaw)) * 0.35;
  const ty = Math.sin(deg(gaze.pitch)) * 0.25;
  const lobes = [
    { x: -0.58 * k - 0.15 + tx, y: -0.28 * k + ty, r: 0.5 * k + 0.25 },
    { x: 0.58 * k + 0.15 + tx, y: -0.28 * k + ty, r: 0.48 * k + 0.25 },
    { x: tx, y: -0.62 * k - 0.2 + ty, r: 0.52 * k + 0.3 },
    { x: -0.42 + tx, y: 0.3 * k + ty, r: 0.4 * k + 0.3 },
    { x: 0.42 + tx, y: 0.3 * k + ty, r: 0.38 * k + 0.3 },
    { x: 0, y: 0, r: 1 }, // head core never moves
  ];
  const union = unionOfCirclesProfile(lobes);
  return radii.map((r, i) => Math.max(r, union[i]));
}

/**
 * C — layered: stroke locks along the top (front z-slot) + a lobe mane
 * behind the body. Lock roots are fixed near the crown limb (hairRootBase)
 * and run the eye pipeline; roots rotating behind the head drop out, the rest
 * depth-fade exactly like eyes. Mane lobe centres live on the BACK sphere.
 */
function manePath(center, gaze) {
  const lobes = [
    { x: -0.72, y: -0.1, r: 0.55 },
    { x: 0.72, y: -0.1, r: 0.53 },
    { x: 0, y: 0.42, r: 0.66 },
    { x: -0.5, y: 0.55, r: 0.5 },
    { x: 0.5, y: 0.55, r: 0.48 },
  ];
  // lobe centres fixed on the back of the head sphere; rotate like eyes
  const moved = lobes.map((L) => {
    const mag = Math.hypot(L.x, L.y);
    const k = Math.min(mag, 0.999);
    const bx = mag > 0 ? (L.x / mag) * k : 0;
    const by = mag > 0 ? (L.y / mag) * k : 0;
    const p = rotEye([bx, -by, -Math.sqrt(1 - k * k)], gaze.yaw, gaze.pitch, gaze.roll);
    return { x: p[0], y: -p[1], r: L.r };
  });
  // union in ball space, then the same slightly-larger-than-body placement
  const radii = unionOfCirclesProfile(moved);
  const sil = { radii, rot: 0, cx: center.cx, cy: center.cy + 0.06, sx: 1.02, sy: 1.02 };
  return closedPath(toPoints(sil, center.R, []));
}

function lockStrokes(sil, center, opt, gaze, now) {
  const N = PROFILE_N;
  const mid = Math.round(N * 0.75);
  const half = Math.round((opt.sweep / 360) * N * 0.5);
  const count = half * 2;
  const R = center.R;
  const paths = [];
  for (let k = 0; k < opt.locks; k++) {
    const u = opt.locks === 1 ? 0.5 : k / (opt.locks - 1);
    const i = (((mid - half + Math.round(u * count)) % N) + N) % N;
    const theta = ANGLES[i];
    const rootB = hairRootBase(theta, 0.2);
    const depth = rotEye(rootB, gaze.yaw, gaze.pitch, gaze.roll)[2];
    if (depth <= 0.04) continue; // root rotated behind the head — drop the lock

    // the lock is a 3D quadratic fixed on the head: root on the sphere, tip
    // pushed out along the head-radial, control leaning toward the crown so
    // the strand ARCS OVER the sphere — sample it densely, project every
    // sample through the eye pipeline, and the polyline bends with gaze
    const lenB = opt.len * (0.75 + 0.45 * Math.abs(Math.sin(k * 2.4 + 1)));
    const tipB = rootB.map((c) => c * (1 + lenB));
    const ctrlB = slerp3(rootB, [0, 1, 0], 0.22).map((c) => c * (1 + lenB * 0.14));

    // time sway (screen tangent) — grows toward the tip, applied after projection
    const a0 = hairProject(rootB, gaze, sil);
    let rdx = a0.x * R - center.x;
    let rdy = a0.y * R - center.y;
    const rL = Math.hypot(rdx, rdy) || 1;
    rdx /= rL;
    rdy /= rL;
    const tx = -rdy;
    const ty = rdx;
    const sway = opt.swing * R * 0.12 * Math.sin(now * 1.7 + k * 0.9); // full swing at tip

    const STEPS = 10;
    let d = '';
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS;
      const mt = 1 - t;
      const b = [
        mt * mt * rootB[0] + 2 * mt * t * ctrlB[0] + t * t * tipB[0],
        mt * mt * rootB[1] + 2 * mt * t * ctrlB[1] + t * t * tipB[1],
        mt * mt * rootB[2] + 2 * mt * t * ctrlB[2] + t * t * tipB[2],
      ];
      const a = hairProject(b, gaze, sil);
      const x = a.x * R + tx * sway * t;
      const y = a.y * R + ty * sway * t;
      d += `${s ? 'L' : 'M'}${r2(x)} ${r2(y)}`;
    }

    paths.push({
      d,
      fade: clamp(depth / 0.12), // same depth fade formula as the eyes
    });
  }
  return paths;
}

/* ============================================================ shared state */

const PAPER = '#f2f0eb';

const common = {
  state: 'idle',
  shape: 'galet',
  bodyColor: '#0a0a0c',
  hairColor: '#e8b34b',
  hairOnAnim: 'hide', // hide | show  (policy for non-baseBody states)
  cycling: false,
  cycleAt: 0,
};

const variantCfg = {
  A: {
    // patch assembly (VRoid-inspired): scalp base + back + side-L/R + bangs + accent
    // types: per-patch style presets (selected in the rail; each preset writes
    // that patch's len/sweep/density fields below, which stay free to edit)
    types: { bangs: 'straight', sides: 'medium', back: 'medium', accent: 'ahoge' },
    len: 0.3,
    strands: 6,
    sweep: 130,
    sides: 'both', // both | left | right | off
    sideLen: 0.42,
    sideSweep: 48,
    backLen: 0.34,
    backSweep: 250, // wide by default — wraps past the ears down toward the nape
    backStrands: 8,
    backRootPad: 6, // back hair mass bulges past the skull (not a flat line)
    ponytailLen: 0.5, // used only when types.back = 'ponytail'
    accentStyle: 'ahoge', // ahoge | spike
    base: 0.55, // scalp-cap volume (0 = bald rim)
    parting: 0, // -1..1 — shifts bangs (and the side bands follow the seam)
    wave: 0, // 0..1 — lateral tip wave
    texture: 0, // 0..1 — material noise + patch layer depth steps (off by default)
    shadow: 0, // 0..1 — hairline occlusion strip (off by default)
  },
  B: { style: 'spikes', amp: 0.28, count: 7, window: 110 },
  C: { len: 0.32, locks: 7, swing: 1, sweep: 160 },
};

let uid = 0;
const debugEngines = [];

function makeAvatar(scale = 100, state = 'idle') {
  const id = `mk${++uid}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-150 -150 300 300');
  svg.classList.add('avatar');
  svg.innerHTML = `
    <defs>
      <mask id="${id}" maskUnits="userSpaceOnUse" x="-160" y="-160" width="320" height="320">
        <rect x="-160" y="-160" width="320" height="320" fill="#fff"/>
        <g class="holes"></g>
      </mask>
    </defs>
    <g class="back"></g>
    <path class="backing"/>
    <path class="body" mask="url(#${id})"/>
    <g class="front"></g>
  `;
  const engine = new ProtoEngine(scale, state);
  const els = {
    svg,
    holes: svg.querySelector('.holes'),
    back: svg.querySelector('.back'),
    front: svg.querySelector('.front'),
    backing: svg.querySelector('.backing'),
    body: svg.querySelector('.body'),
  };
  const av = { engine, els, hairAlpha: 0, size: scale };
  debugEngines.push(av);
  return av;
}

function dotsSvg(frame) {
  if (!frame.dots.length) return '';
  return frame.dots
    .map((d) => {
      const fill =
        d.depth != null ? mixHex(common.bodyColor, PAPER, 1 - d.depth) : common.bodyColor;
      return `<circle cx="${r2(d.x)}" cy="${r2(d.y)}" r="${r2(d.r)}" fill="${fill}" fill-opacity="${r2(d.opacity)}"/>`;
    })
    .join('');
}

function paintAvatar(av, frame, now, drawBack, drawFront) {
  const { els } = av;
  els.backing.setAttribute('d', frame.bodyPath);
  els.backing.setAttribute('fill', PAPER);
  els.body.setAttribute('d', frame.bodyPath);
  els.body.setAttribute('fill', common.bodyColor);
  els.holes.innerHTML = frame.holes
    .map((h) => `<path d="${h.d}" transform="${h.m}" fill="#000" fill-opacity="${r2(h.opacity)}"/>`)
    .join('');
  // dots obey the depth flag: behind = drawn before body+backing (swallowed inside)
  const backDots = frame.dotsBehind ? dotsSvg(frame) : '';
  const frontDots = frame.dotsBehind ? '' : dotsSvg(frame);
  els.back.innerHTML = backDots + (drawBack ? drawBack(frame, av.hairAlpha) : '');
  els.front.innerHTML = (drawFront ? drawFront(frame, av.hairAlpha) : '') + frontDots;
}

function hairTarget(frame) {
  return frame.baseBody || common.hairOnAnim === 'show' ? 1 : 0;
}

function stepHairAlpha(av, frame, dt) {
  const target = hairTarget(frame);
  av.hairAlpha += (target - av.hairAlpha) * Math.min(1, dt * 10);
  if (Math.abs(av.hairAlpha - target) < 0.01) av.hairAlpha = target;
}

function followPointer(svg, engine) {
  let active = false;
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const ux = ((e.clientX - r.left) / r.width) * 300 - 150;
    const uy = ((e.clientY - r.top) / r.height) * 300 - 150;
    engine.lookTarget = {
      yaw: clamp((ux / 100) * 42, -38, 38),
      pitch: clamp((-uy / 100) * 42, -34, 34),
      mix: 1,
    };
    active = true;
  };
  const leave = () => {
    engine.lookTarget = { ...engine.lookTarget, mix: 0 };
    active = false;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', leave);
  return () => {
    svg.removeEventListener('pointermove', move);
    svg.removeEventListener('pointerleave', leave);
  };
}

/* ============================================================ control builders */

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function range(label, cfg, key, min, max, step, fmt = (v) => v, onInput) {
  const row = el(`
    <div class="row">
      <label style="flex:1">${label}</label>
      <input type="range" min="${min}" max="${max}" step="${step}" />
      <span class="val"></span>
    </div>`);
  const input = row.querySelector('input');
  const val = row.querySelector('.val');
  const sync = () => {
    input.value = cfg[key];
    val.textContent = fmt(cfg[key]);
  };
  input.addEventListener('input', () => {
    cfg[key] = parseFloat(input.value);
    sync();
    if (onInput) onInput(cfg[key]);
    document.dispatchEvent(new Event('proto-state'));
  });
  sync();
  row._sync = sync; // a type preset can rewrite cfg keys — resync every row
  return row;
}

function stateButtons(apply) {
  const box = el(`<div class="btns"></div>`);
  for (const id of STATE_ORDER) {
    const b = el(`<button data-s="${id}">${id}</button>`);
    b.addEventListener('click', () => {
      common.state = id;
      common.cycleAt = performance.now() / 1000;
      apply();
      document.dispatchEvent(new Event('proto-state'));
      document.dispatchEvent(new Event('proto-state-sync'));
    });
    box.appendChild(b);
  }
  const cyc = el(`<button data-s="cycle">▶ cycle</button>`);
  cyc.addEventListener('click', () => {
    common.cycling = !common.cycling;
    common.cycleAt = performance.now() / 1000;
    cyc.classList.toggle('on', common.cycling);
    document.dispatchEvent(new Event('proto-state'));
  });
  box.appendChild(cyc);
  const sync = () => {
    box.querySelectorAll('button[data-s]').forEach((b) => {
      const s = b.dataset.s;
      if (s === 'cycle') b.classList.toggle('on', common.cycling);
      else b.classList.toggle('on', common.state === s);
    });
  };
  sync();
  document.addEventListener('proto-state-sync', sync);
  box._sync = sync;
  return box;
}

function commonControls(apply) {
  const box = el(`<div class="ctl"></div>`);
  const shapeRow = el(`
    <div class="row"><label style="flex:1">shape</label>
      <select>${Object.keys(SHAPES)
        .map((s) => `<option value="${s}">${s}</option>`)
        .join('')}</select>
    </div>`);
  const sel = shapeRow.querySelector('select');
  sel.value = common.shape;
  sel.addEventListener('change', () => {
    common.shape = sel.value;
    apply();
    document.dispatchEvent(new Event('proto-state'));
  });
  const colorRow = el(`
    <div class="row"><label style="flex:1">body / hair</label>
      <input type="color" class="c-body" /><input type="color" class="c-hair" />
    </div>`);
  const cb = colorRow.querySelector('.c-body');
  const ch = colorRow.querySelector('.c-hair');
  cb.value = common.bodyColor;
  ch.value = common.hairColor;
  cb.addEventListener('input', () => {
    common.bodyColor = cb.value;
    document.dispatchEvent(new Event('proto-state'));
  });
  ch.addEventListener('input', () => {
    common.hairColor = ch.value;
    document.dispatchEvent(new Event('proto-state'));
  });
  const polRow = el(`
    <div class="row"><label style="flex:1">hair on anim states</label>
      <select class="pol"><option value="hide">hide (blink off)</option><option value="show">force show</option></select>
    </div>`);
  const pol = polRow.querySelector('select');
  pol.value = common.hairOnAnim;
  pol.addEventListener('change', () => {
    common.hairOnAnim = pol.value;
    document.dispatchEvent(new Event('proto-state'));
  });
  box.append(shapeRow, colorRow, polRow);
  return box;
}

function statePanel() {
  return el(`<pre class="state">…</pre>`);
}

/**
 * Per-patch type presets (VRoid part vocabulary, simplified). Selecting a
 * type assigns that patch's geometry params — the sliders then stay editable,
 * so types are a starting point, not a cage. null = patch off.
 */
const HAIR_TYPES = {
  bangs: {
    straight: { len: 0.3, strands: 6, sweep: 130, parting: 0, wave: 0 },
    side: { len: 0.32, strands: 5, sweep: 150, parting: -0.7, wave: 0.3 },
    wispy: { len: 0.18, strands: 4, sweep: 140, parting: 0, wave: 0.5 },
    curly: { len: 0.3, strands: 8, sweep: 130, parting: 0.15, wave: 1 },
    off: null,
  },
  sides: {
    short: { sideLen: 0.26, sideSweep: 40 },
    medium: { sideLen: 0.42, sideSweep: 48 },
    long: { sideLen: 0.58, sideSweep: 64 },
    off: null,
  },
  back: {
    short: { backLen: 0.16, backSweep: 230, backStrands: 7, backRootPad: 4 },
    medium: { backLen: 0.34, backSweep: 250, backStrands: 8, backRootPad: 6 },
    long: { backLen: 0.58, backSweep: 300, backStrands: 10, backRootPad: 10, wave: 0.2 },
    bob: { backLen: 0.42, backSweep: 260, backStrands: 8, backRootPad: 6, wave: 0.1 },
    ponytail: {
      backLen: 0.14,
      backSweep: 230,
      backStrands: 6,
      backRootPad: 5,
      ponytailLen: 0.55,
    },
    off: null,
  },
  accent: {
    ahoge: { accentStyle: 'ahoge' },
    spike: { accentStyle: 'spike' },
    off: null,
  },
};

/** select a per-patch type: store it, then apply that preset's params */
function applyHairType(cfg, key) {
  const preset = HAIR_TYPES[key][cfg.types[key]];
  if (preset) Object.assign(cfg, preset);
}

/* ============================================================ variants */

const VARIANTS = {
  /* ---------- A: patch hair (bangs / sides / back / ahoge + scalp base) ---------- */
  A: {
    name: 'Patch hair',
    build(root) {
      const cfg = variantCfg.A;
      const header = el(`
        <header class="vh">
          <h1>A — Patch hair</h1>
          <p>VRoid-style assembly: scalp base behind the body, back hair, one-sided
             side locks and bangs as separate sphere patches, plus an ahoge accent.
             One config across four shapes; turn the head to reveal the back patch.</p>
          <div class="look">LOOK FOR: per-patch style types (bangs/sides/back/accent
             in the rail — try back = long / ponytail) · back hair volume past the
             skull as you turn (root pad) · smooth terminator fade instead of a
             flat cut line · parting shifting the seam across bangs + sides ·
             texture slider = material noise (off by default)</div>
        </header>`);
      const grid = el(`<div class="a-grid"></div>`);
      const shapeNames = ['cercle', 'galet', 'squircle', 'goutte'];
      const avs = shapeNames.map((s) => {
        const fig = el(`<figure class="a-cell" style="margin:0"></figure>`);
        const av = makeAvatar(95, common.state);
        av.els.svg.style.width = av.els.svg.style.height = '200px';
        av.engine.setShape([...SHAPES[s].radii], 0);
        fig.append(av.els.svg, el(`<figcaption>${s}</figcaption>`));
        grid.appendChild(fig);
        return av;
      });
      const inspect = { yaw: 0 };
      const applyYaw = (v) =>
        avs.forEach((a) => {
          a.engine.lookTarget = { yaw: v, pitch: 0, mix: 1 };
        });
      const sidesRow = el(`
        <div class="row"><label style="flex:1">sides on</label>
          <select class="sd">
            <option value="both">both</option>
            <option value="left">left only</option>
            <option value="right">right only</option>
            <option value="off">off</option>
          </select>
        </div>`);
      const sd = sidesRow.querySelector('select');
      sd.value = cfg.sides;
      sd.addEventListener('change', () => {
        cfg.sides = sd.value;
        document.dispatchEvent(new Event('proto-state'));
      });
      const rail = el(`<aside class="card ctl"></aside>`);
      const syncRail = () => rail.querySelectorAll('.row').forEach((r) => r._sync && r._sync());
      /** plain option select, unrelated to the per-patch hair type tables */
      const pick = (label, value, options, onChange) => {
        const row = el(`
          <div class="row"><label style="flex:1">${label}</label>
            <select>${options.map((o) => `<option value="${o}">${o}</option>`).join('')}</select>
          </div>`);
        const node = row.querySelector('select');
        node.value = value;
        node.addEventListener('change', () => onChange(node.value));
        return row;
      };
      const typeRow = (label, css, table, key) => {
        const row = el(`
          <div class="row"><label style="flex:1">${label}</label>
            <select class="${css}">${Object.keys(table)
              .map((t) => `<option value="${t}">${t}</option>`)
              .join('')}</select>
          </div>`);
        const sel = row.querySelector('select');
        sel.value = cfg.types[key];
        sel.addEventListener('change', () => {
          cfg.types[key] = sel.value;
          applyHairType(cfg, key);
          syncRail();
          document.dispatchEvent(new Event('proto-state'));
        });
        return row;
      };
      rail.append(
        el(`<div class="panel-title">patches</div>`),
        typeRow('bangs style', 'ty-bangs', HAIR_TYPES.bangs, 'bangs'),
        range('bangs length', cfg, 'len', 0.08, 0.55, 0.01, (v) => v.toFixed(2)),
        range('bangs density', cfg, 'strands', 3, 14, 1),
        range('bangs sweep °', cfg, 'sweep', 60, 220, 5),
        typeRow('sides style', 'ty-sides', HAIR_TYPES.sides, 'sides'),
        sidesRow,
        range('side length', cfg, 'sideLen', 0.1, 0.6, 0.01, (v) => v.toFixed(2)),
        range('side sweep °', cfg, 'sideSweep', 20, 80, 2),
        typeRow('back style', 'ty-back', HAIR_TYPES.back, 'back'),
        range('back length', cfg, 'backLen', 0.08, 0.7, 0.01, (v) => v.toFixed(2)),
        range('back density', cfg, 'backStrands', 3, 14, 1),
        range('back sweep °', cfg, 'backSweep', 160, 340, 5),
        range('back root pad', cfg, 'backRootPad', 0, 14, 0.5, (v) => v.toFixed(1)),
        range('ponytail length', cfg, 'ponytailLen', 0.1, 0.8, 0.01, (v) => v.toFixed(2)),
        typeRow('accent', 'ty-accent', HAIR_TYPES.accent, 'accent'),
        range('scalp volume', cfg, 'base', 0, 1, 0.05, (v) => v.toFixed(2)),
        el(`<div class="panel-title">style</div>`),
        range('parting', cfg, 'parting', -1, 1, 0.05, (v) => v.toFixed(2)),
        range('wave', cfg, 'wave', 0, 1, 0.05, (v) => v.toFixed(2)),
        el(`<div class="panel-title">material</div>`),
        range('texture', cfg, 'texture', 0, 1, 0.05, (v) => v.toFixed(2)),
        range('hairline shadow', cfg, 'shadow', 0, 1, 0.05, (v) => v.toFixed(2)),
        el(`<div class="panel-title">inspect</div>`),
        range('head yaw °', inspect, 'yaw', -180, 180, 1, (v) => v.toFixed(0), applyYaw),
        el(`<div class="panel-title">shared</div>`),
        commonControls(() => avs.forEach((a) => a.engine.setState(common.state, now()))),
        stateButtons(() => avs.forEach((a) => a.engine.setState(common.state, now()))),
        el(`<div class="panel-title">state</div>`),
        statePanel(),
      );
      const main = el(`<div class="a-main"></div>`);
      main.append(grid, rail);
      root.append(header, main);

      const unFollow = avs.map((av) => followPointer(av.els.svg, av.engine));
      const panel = rail.querySelector('pre.state');
      let raf = 0;
      let last = performance.now() / 1000;
      let clock = 0;

      const centerOf = (frame) => {
        const R = avs[0].size;
        return { x: frame.sil.cx * R, y: frame.sil.cy * R, cx: frame.sil.cx, cy: frame.sil.cy, R };
      };

      // paint order: optional hairline shadow (parameter, default off) → scalp
      // base (back) → back → sides → bangs → ahoge. Colour is flat hairColor
      // unless cfg.texture > 0: then a deterministic material noise varies each
      // strand (clumped pairs) and each patch steps darker by its layer depth
      // (back sits under sides under bangs) — thickness, not outlines.
      const LAYER_DARK = { back: 0.3, sides: 0.15, bangs: 0 };
      const PATCH_ID = { back: 0, sideL: 1, sideR: 2, bangs: 3 };
      const strandColor = (patchId, layerDark, s) => {
        const t = cfg.texture;
        if (t <= 0) return common.hairColor;
        // clump noise: neighbouring pairs share a tone, plus per-strand jitter
        const seed =
          hashNoise(patchId * 101, Math.floor(s.j / 2)) * 0.7 +
          hashNoise(patchId * 101 + 7, s.j) * 0.3;
        const off = t * (layerDark + 0.3 * seed);
        return off >= 0
          ? mixHex(common.hairColor, '#000000', clamp(off, 0, 0.7))
          : mixHex(common.hairColor, '#ffffff', clamp(-off, 0, 0.7));
      };
      const drawBack = (frame, ha) => {
        if (ha < 0.02 || cfg.base <= 0) return '';
        const d = baseCapPath(frame.sil, centerOf(frame), cfg.base);
        // underlayer stays a touch under the hair; depth scales with texture
        const col = mixHex(common.hairColor, '#000000', 0.12 + 0.25 * cfg.texture);
        return `<path d="${d}" fill="${col}" fill-opacity="${ha.toFixed(2)}"/>`;
      };
      const drawFront = (frame, ha) => {
        if (ha < 0.02) return '';
        const center = centerOf(frame);
        const parts = [];
        const emit = (region, patchId, layerKey) => {
          for (const s of patchStrands(frame.sil, center, cfg, frame.gaze, region)) {
            parts.push(
              `<path d="${s.d}" fill="${strandColor(patchId, LAYER_DARK[layerKey], s)}" fill-opacity="${(ha * s.fade).toFixed(2)}"/>`,
            );
          }
        };
        const bangsRegion = {
          midDeg: 270 + cfg.parting * 20,
          sweep: cfg.sweep,
          len: cfg.len,
          strands: cfg.strands,
          wave: cfg.wave,
          rootPad: 2.5,
        };
        const showBangs = cfg.types.bangs !== 'off';
        // optional occlusion strip under the fringe (cfg.shadow, default off)
        if (showBangs && cfg.shadow > 0) {
          const sh = hairlineShadowPath(frame.sil, center, cfg, frame.gaze, bangsRegion);
          if (sh) {
            parts.push(
              `<path d="${sh}" fill="#000000" fill-opacity="${(0.2 * cfg.shadow * ha).toFixed(2)}"/>`,
            );
          }
        }
        const sideStrands = Math.max(2, Math.round((cfg.strands * cfg.sideSweep) / cfg.sweep));
        if (cfg.types.back !== 'off') {
          emit(
            {
              midDeg: 270,
              sweep: cfg.backSweep,
              len: cfg.backLen,
              strands: cfg.backStrands,
              hemi: -1,
              wave: cfg.wave * 0.6,
              phase: 1.7,
              rootPad: cfg.backRootPad,
            },
            PATCH_ID.back,
            'back',
          );
          if (cfg.types.back === 'ponytail') {
            const pt = ponytailPath(frame.sil, center, frame.gaze, clock, cfg.ponytailLen);
            if (pt && pt.fade > 0.03) {
              const col =
                cfg.texture > 0
                  ? strandColor(PATCH_ID.back, LAYER_DARK.back, { j: 0 })
                  : common.hairColor;
              parts.push(
                `<path d="${pt.d}" fill="none" stroke="${col}" stroke-width="${(center.R * 0.11).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="${(ha * pt.fade).toFixed(2)}"/>`,
              );
            }
          }
        }
        const showSides = cfg.types.sides !== 'off';
        if (showSides && (cfg.sides === 'both' || cfg.sides === 'left')) {
          emit(
            {
              midDeg: 270 - cfg.sweep / 2 - cfg.sideSweep / 2,
              sweep: cfg.sideSweep,
              len: cfg.sideLen,
              strands: sideStrands,
              wave: cfg.wave,
              phase: 0.6,
              rootPad: 3.5,
            },
            PATCH_ID.sideL,
            'sides',
          );
        }
        if (showSides && (cfg.sides === 'both' || cfg.sides === 'right')) {
          emit(
            {
              midDeg: 270 + cfg.sweep / 2 + cfg.sideSweep / 2,
              sweep: cfg.sideSweep,
              len: cfg.sideLen,
              strands: sideStrands,
              wave: cfg.wave,
              phase: 2.4,
              rootPad: 3.5,
            },
            PATCH_ID.sideR,
            'sides',
          );
        }
        if (showBangs) emit(bangsRegion, PATCH_ID.bangs, 'bangs');
        if (cfg.types.accent !== 'off') {
          const a = accentPath(frame.sil, center, frame.gaze, clock, cfg.accentStyle);
          if (a) {
            parts.push(
              `<path d="${a.d}" fill="none" stroke="${common.hairColor}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="${(ha * a.fade).toFixed(2)}"/>`,
            );
          }
        }
        return parts.join('');
      };

      const tick = (ms) => {
        const t = ms / 1000;
        const dt = Math.min(0.05, t - last);
        last = t;
        clock = t;
        maybeCycle(t, () => avs.forEach((a) => a.engine.setState(common.state, t)));
        for (const av of avs) {
          const frame = av.engine.sample(t);
          stepHairAlpha(av, frame, dt);
          paintAvatar(av, frame, t, drawBack, drawFront);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const updatePanel = () => {
        const f = avs[0].engine.lastSample;
        if (!f) return;
        panel.textContent = JSON.stringify(
          {
            variant: 'A',
            state: f.state,
            tLocal: +f.tLocal.toFixed(2),
            baseBody: f.baseBody,
            hairAlpha: +avs[0].hairAlpha.toFixed(2),
            hairPolicy: common.hairOnAnim,
            gaze: { yaw: +f.gaze.yaw.toFixed(1), pitch: +f.gaze.pitch.toFixed(1) },
            eyeAlpha: +f.eyeAlpha.toFixed(2),
            shapes: shapeNames,
            patches: {
              bangs: cfg.types.bangs,
              sides: `${cfg.types.sides}/${cfg.sides}`,
              back: cfg.types.back,
              accent: cfg.types.accent,
              scalp: +cfg.base.toFixed(2),
              ponytailLen: cfg.ponytailLen,
            },
            hair: {
              len: cfg.len,
              strands: cfg.strands,
              sweep: cfg.sweep,
              backLen: cfg.backLen,
              backSweep: cfg.backSweep,
              backStrands: cfg.backStrands,
              backRootPad: cfg.backRootPad,
              parting: cfg.parting,
              wave: cfg.wave,
              texture: cfg.texture,
              shadow: cfg.shadow,
              color: common.hairColor,
            },
            pointerMix: +avs[0].engine.lookTarget.mix.toFixed(2),
          },
          null,
          2,
        );
      };
      document.addEventListener('proto-state', updatePanel);
      const iv = setInterval(updatePanel, 250);
      updatePanel();

      return {
        cleanup() {
          cancelAnimationFrame(raf);
          clearInterval(iv);
          unFollow.forEach((f) => f());
          document.removeEventListener('proto-state', updatePanel);
        },
      };
    },
  },

  /* ---------- B: hair fused into the silhouette ---------- */
  B: {
    name: 'Silhouette hair',
    build(root) {
      const cfg = variantCfg.B;
      const header = el(`
        <header class="vh">
          <h1>B — Silhouette hair</h1>
          <p>Hair is not a layer: it is folded into r(θ) before the body is drawn,
             so it morphs with the body and needs no anchor logic. One big avatar
             plus an editor rail.</p>
          <div class="look">LOOK FOR: clean shape-morph · spikes vs bob ·
             thinking/burst — force show makes the dots themselves hairy</div>
        </header>`);
      const heroWrap = el(`<div class="b-hero"></div>`);
      const av = makeAvatar(160, common.state);
      av.els.svg.style.width = av.els.svg.style.height = '400px';
      heroWrap.appendChild(av.els.svg);

      const rail = el(`<div class="b-rail"></div>`);
      const styleRow = el(`
        <div class="row"><label style="flex:1">hair style</label>
          <select class="st"><option value="spikes">spikes</option><option value="bob">bob lobes</option></select>
        </div>`);
      const st = styleRow.querySelector('select');
      st.value = cfg.style;
      st.addEventListener('change', () => {
        cfg.style = st.value;
        document.dispatchEvent(new Event('proto-state'));
      });

      rail.append(
        el(`<div class="card ctl">
              <div class="panel-title">silhouette hair</div>
            </div>`),
      );
      const hairCard = rail.firstElementChild;
      hairCard.append(
        styleRow,
        range('amplitude', cfg, 'amp', 0.05, 0.5, 0.01, (v) => v.toFixed(2)),
        range('count', cfg, 'count', 3, 14, 1),
        range('window °', cfg, 'window', 60, 180, 5),
      );
      const sharedCard = el(`<div class="card ctl"><div class="panel-title">shared</div></div>`);
      sharedCard.append(
        commonControls(applyShape),
        stateButtons(() => av.engine.setState(common.state, now())),
      );
      const panelCard = el(
        `<div class="card"><div class="panel-title" style="margin-bottom:6px">state</div></div>`,
      );
      const panel = statePanel();
      panelCard.appendChild(panel);
      rail.append(sharedCard, panelCard);

      const main = el(`<div class="b-main"></div>`);
      main.append(heroWrap, rail);
      root.append(header, main);

      function applyShape() {
        const base = [...SHAPES[common.shape].radii];
        av.engine.setShape(base, now());
      }

      applyShape();
      av.engine.hairFn = (radii, gaze) => hairifyRadii(radii, cfg, gaze);
      const unFollow = followPointer(av.els.svg, av.engine);

      let raf = 0;
      let last = performance.now() / 1000;
      const tick = (ms) => {
        const t = ms / 1000;
        const dt = Math.min(0.05, t - last);
        last = t;
        maybeCycle(t, () => av.engine.setState(common.state, t));
        av.engine.hairFn = (radii, gaze) => hairifyRadii(radii, cfg, gaze);
        av.engine.hairEverywhere = common.hairOnAnim === 'show';
        // B's hair lives inside the silhouette: alpha = how much of the body we draw —
        // nothing to fade separately; policy show/hide is expressed by hairEverywhere
        // (hide → hair only on baseBody states, handled inside engine).
        av.hairAlpha = 1;
        const frame = av.engine.sample(t);
        paintAvatar(av, frame, t, null, null);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const updatePanel = () => {
        const f = av.engine.lastSample;
        if (!f) return;
        panel.textContent = JSON.stringify(
          {
            variant: 'B',
            state: f.state,
            tLocal: +f.tLocal.toFixed(2),
            baseBody: f.baseBody,
            hairAttached: f.baseBody || common.hairOnAnim === 'show',
            hairPolicy: common.hairOnAnim,
            shape: common.shape,
            hair: { ...cfg, note: 'folded into radii' },
            gaze: { yaw: +f.gaze.yaw.toFixed(1), pitch: +f.gaze.pitch.toFixed(1) },
            eyeAlpha: +f.eyeAlpha.toFixed(2),
          },
          null,
          2,
        );
      };
      document.addEventListener('proto-state', updatePanel);
      const iv = setInterval(updatePanel, 250);
      updatePanel();

      return {
        cleanup() {
          cancelAnimationFrame(raf);
          clearInterval(iv);
          unFollow();
          document.removeEventListener('proto-state', updatePanel);
        },
      };
    },
  },

  /* ---------- C: layered locks + mane, roster density ---------- */
  C: {
    name: 'Layered roster',
    build(root) {
      const cfg = variantCfg.C;
      const header = el(`
        <header class="vh">
          <h1>C — Layered roster</h1>
          <p>Front locks (stroked paths) + back mane as separate z-slots around the
             body, with per-strand sway and gaze lag. Shown as a bot roster:
             does it read at 48px and in a row?</p>
          <div class="look">LOOK FOR: mane peeking around the silhouette · locks swinging
             with gaze · small-size legibility in the roster rows</div>
        </header>`);

      const left = el(`<div class="c-left"></div>`);
      const heroCard = el(`<div class="c-hero">
        <div class="panel-title" style="margin-bottom:8px">hero — move the pointer</div>
      </div>`);
      const hero = makeAvatar(120, common.state);
      hero.els.svg.style.width = hero.els.svg.style.height = '260px';
      heroCard.append(
        hero.els.svg,
        el(`<div class="hint">gaze follows · locks lag behind it</div>`),
      );

      const ctlCard = el(`<div class="card ctl"><div class="panel-title">locks</div></div>`);
      ctlCard.append(
        range('length', cfg, 'len', 0.08, 0.5, 0.01, (v) => v.toFixed(2)),
        range('locks', cfg, 'locks', 3, 11, 1),
        range('swing', cfg, 'swing', 0, 2, 0.1, (v) => v.toFixed(1)),
        range('sweep °', cfg, 'sweep', 100, 260, 5),
        el(`<div class="panel-title" style="margin-top:6px">shared</div>`),
        commonControls(applyAll),
        stateButtons(() => applyAll(true)),
      );
      const panelCard = el(
        `<div class="card"><div class="panel-title" style="margin-bottom:6px">state</div></div>`,
      );
      const panel = statePanel();
      panelCard.appendChild(panel);
      left.append(heroCard, ctlCard, panelCard);

      const roster = el(`<div class="c-roster"></div>`);
      const rows = [
        { name: 'nova', shape: 'cercle', hair: '#2b2b33', len: 0.3, locks: 8, note: 'dark bob' },
        { name: 'pip', shape: 'galet', hair: '#f0b429', len: 0.24, locks: 5, note: 'short spikes' },
        {
          name: 'moss',
          shape: 'squircle',
          hair: '#1f6b4a',
          len: 0.38,
          locks: 9,
          note: 'long fringe',
        },
        { name: 'hex', shape: 'hexagone', hair: '#f1efe9', len: 0.2, locks: 4, note: 'cream cap' },
        { name: 'drop', shape: 'goutte', hair: '#e152b0', len: 0.34, locks: 6, note: 'pink locks' },
      ].map((r) => ({ ...r, cfg: { ...cfg, len: r.len, locks: r.locks, sweep: 170 } }));

      const rosterAvs = rows.map((r) => {
        const av = makeAvatar(60, common.state);
        av.els.svg.style.width = av.els.svg.style.height = '52px';
        av.engine.setShape([...SHAPES[r.shape].radii], 0);
        const row = el(`<div class="c-row">
          <div></div>
          <div class="who">${r.name}<small>${r.shape} · ${r.note}</small></div>
          <div class="chip">locks:${r.locks} len:${r.len}</div>
        </div>`);
        row.children[0].appendChild(av.els.svg);
        roster.appendChild(row);
        return { av, r };
      });

      const main = el(`<div class="c-main"></div>`);
      main.append(left, roster);
      root.append(header, main);

      function applyAll(stateOnly) {
        const t = now();
        if (!stateOnly) {
          hero.engine.setShape([...SHAPES[common.shape].radii], t);
          rosterAvs.forEach(({ av, r }) => av.engine.setShape([...SHAPES[r.shape].radii], t));
        }
        hero.engine.setState(common.state, t);
        rosterAvs.forEach(({ av }) => av.engine.setState(common.state, t));
      }
      applyAll(false);

      const unFollow = followPointer(hero.els.svg, hero.engine);

      const drawBackMane = (frame, ha) => {
        if (ha < 0.02) return '';
        const R = 120;
        const center = {
          x: frame.sil.cx * R,
          y: frame.sil.cy * R,
          cx: frame.sil.cx,
          cy: frame.sil.cy,
          R,
        };
        const d = manePath(center, frame.gaze);
        return `<path d="${d}" fill="${common.bodyColor}" fill-opacity="${(0.92 * ha).toFixed(2)}"/>`;
      };
      const drawFrontLocks = (frame, ha) => {
        if (ha < 0.02) return '';
        const R = 120;
        const center = {
          x: frame.sil.cx * R,
          y: frame.sil.cy * R,
          cx: frame.sil.cx,
          cy: frame.sil.cy,
          R,
        };
        const paths = lockStrokes(frame.sil, center, cfg, frame.gaze, lastT);
        return paths
          .map(
            ({ d, fade }) =>
              `<path d="${d}" fill="none" stroke="${common.hairColor}" stroke-width="11" stroke-linecap="round" opacity="${(ha * fade).toFixed(2)}"/>`,
          )
          .join('');
      };
      const drawRosterLocks = (frame, ha, rcfg) => {
        if (ha < 0.02) return '';
        const R = 60;
        const center = {
          x: frame.sil.cx * R,
          y: frame.sil.cy * R,
          cx: frame.sil.cx,
          cy: frame.sil.cy,
          R,
        };
        const paths = lockStrokes(frame.sil, center, rcfg, frame.gaze, lastT);
        return paths
          .map(
            ({ d, fade }) =>
              `<path d="${d}" fill="none" stroke="${common.hairColor}" stroke-width="6" stroke-linecap="round" opacity="${(ha * fade).toFixed(2)}"/>`,
          )
          .join('');
      };

      let raf = 0;
      let last = performance.now() / 1000;
      let lastT = 0;
      const tick = (ms) => {
        const t = ms / 1000;
        lastT = t;
        const dt = Math.min(0.05, t - last);
        last = t;
        maybeCycle(t, () => applyAll(true));
        // hero
        const fHero = hero.engine.sample(t);
        stepHairAlpha(hero, fHero, dt);
        paintAvatar(hero, fHero, t, drawBackMane, drawFrontLocks);
        // roster
        for (const { av, r } of rosterAvs) {
          const f = av.engine.sample(t);
          stepHairAlpha(av, f, dt);
          const back = (fr, ha) => {
            if (ha < 0.02) return '';
            const R = 60;
            const center = { x: fr.sil.cx * R, y: fr.sil.cy * R, cx: fr.sil.cx, cy: fr.sil.cy, R };
            return `<path d="${manePath(center, fr.gaze)}" fill="${common.bodyColor}" fill-opacity="${(0.92 * ha).toFixed(2)}"/>`;
          };
          paintAvatar(av, f, t, back, (fr, ha) => drawRosterLocks(fr, ha, r.cfg));
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const updatePanel = () => {
        const f = hero.engine.lastSample;
        if (!f) return;
        panel.textContent = JSON.stringify(
          {
            variant: 'C',
            state: f.state,
            tLocal: +f.tLocal.toFixed(2),
            baseBody: f.baseBody,
            hairAlpha: +hero.hairAlpha.toFixed(2),
            hairPolicy: common.hairOnAnim,
            layers: ['back:mane', 'body+mask', 'front:locks'],
            locks: f.holes.length
              ? { ...cfg, color: common.hairColor }
              : { ...cfg, color: common.hairColor },
            gaze: { yaw: +f.gaze.yaw.toFixed(1), pitch: +f.gaze.pitch.toFixed(1) },
            roster: rows.map((r) => r.name),
            pointerMix: +hero.engine.lookTarget.mix.toFixed(2),
          },
          null,
          2,
        );
      };
      document.addEventListener('proto-state', updatePanel);
      const iv = setInterval(updatePanel, 250);
      updatePanel();

      return {
        cleanup() {
          cancelAnimationFrame(raf);
          clearInterval(iv);
          unFollow();
          document.removeEventListener('proto-state', updatePanel);
        },
      };
    },
  },
};

/* ============================================================ helpers used by variants */

function now() {
  return performance.now() / 1000;
}

function maybeCycle(t, apply) {
  if (!common.cycling) return;
  const def = STATES[common.state];
  if (t - common.cycleAt < def.duration) return;
  const i = STATE_ORDER.indexOf(common.state);
  common.state = STATE_ORDER[(i + 1) % STATE_ORDER.length];
  common.cycleAt = t;
  apply();
  document.dispatchEvent(new Event('proto-state'));
  document.dispatchEvent(new Event('proto-state-sync'));
}

/* ============================================================ switcher + mount */

const KEYS = ['A', 'B', 'C'];

function currentVariant() {
  const v = new URLSearchParams(location.search).get('variant');
  return KEYS.includes(v) ? v : 'A';
}

let active = null;

function mount(key) {
  if (active) active.cleanup();
  active = null;
  debugEngines.length = 0;
  const stage = document.getElementById('stage');
  stage.replaceChildren();
  active = VARIANTS[key].build(stage);
  renderSwitcher(key);
}

function setVariant(key) {
  const url = new URL(location.href);
  url.searchParams.set('variant', key);
  history.replaceState(null, '', url);
  mount(key);
}

function renderSwitcher(key) {
  const host = document.getElementById('switcher');
  host.innerHTML = '';
  const bar = el(`
    <div class="switcher" role="toolbar" aria-label="prototype variant">
      <button class="prev" title="previous variant" aria-label="previous">←</button>
      <div class="label"></div>
      <button class="next" title="next variant" aria-label="next">→</button>
    </div>`);
  const label = bar.querySelector('.label');
  const update = (k) => {
    label.innerHTML = `<span class="k">${k}</span> — ${VARIANTS[k].name}`;
  };
  update(key);
  const step = (dir) => {
    const i = KEYS.indexOf(currentVariant());
    const next = KEYS[(i + dir + KEYS.length) % KEYS.length];
    setVariant(next);
  };
  bar.querySelector('.prev').addEventListener('click', () => step(-1));
  bar.querySelector('.next').addEventListener('click', () => step(1));
  host.appendChild(bar);
}

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.matches('input, textarea, select') || t.isContentEditable)) return;
  if (e.key === 'ArrowLeft') stepFromKey(-1);
  if (e.key === 'ArrowRight') stepFromKey(1);
});

function stepFromKey(dir) {
  const i = KEYS.indexOf(currentVariant());
  const next = KEYS[(i + dir + KEYS.length) % KEYS.length];
  setVariant(next);
}

// cross-variant button sync (state buttons live inside each variant)
document.addEventListener('proto-state-sync', () => {});

mount(currentVariant());

// debug handle (prototype only): poke state from the console / smoke tests
globalThis.__protoAvatar = {
  common,
  variantCfg,
  STATES,
  STATE_ORDER,
  debugEngines,
  setVariant,
  mount,
  VARIANTS,
  now,
  HAIR_TYPES,
  applyHairType,
};
