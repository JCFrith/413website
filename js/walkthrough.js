/* 413 Solution: scroll-driven building walkthrough.
   Stage 1 of the build: blockout geometry and the camera path only.
   Everything on screen is a pure function of one number, scroll progress p in [0, 1]. */
import * as THREE from './vendor/three.module.min.js';

const root = document.querySelector('[data-walkthrough]');
if (root) init(root);

function init(root) {
  const stage = root.querySelector('.walk-stage');
  const canvas = root.querySelector('canvas');
  const blackout = root.querySelector('.walk-black');
  const intro = root.querySelector('.walk-intro');
  const hudNum = root.querySelector('[data-walk-num]');
  const hudName = root.querySelector('[data-walk-name]');
  const hudLabels = root.querySelector('[data-walk-labels]');
  const hudBar = root.querySelector('[data-walk-bar]');
  const fallback = root.querySelector('.walk-fallback');
  const btnPrev = root.querySelector('[data-walk-prev]');
  const btnNext = root.querySelector('[data-walk-next]');
  const live = root.querySelector('[data-walk-live]');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    root.classList.add('walk-nogl');
    if (fallback) fallback.hidden = false;
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const V3 = THREE.Vector3;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const seg = (p, a, b) => clamp01((p - a) / (b - a));
  const ease = (t) => t * t * (3 - 2 * t);

  /* ---------- scene ---------- */
  const BLACK = 0x0a0a0a;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BLACK);
  scene.fog = new THREE.Fog(BLACK, 55, 130);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 300);

  scene.add(new THREE.HemisphereLight(0xe6eef7, 0x5d6772, 1.15)); // ground colour lights ceilings and deck undersides
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(12, 20, 16);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xcfe0f2, 0.45);
  fill.position.set(-10, 8, -12);
  scene.add(fill);

  const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
  const M = {
    veneer: lam(0x55616c), cmu: lam(0xaab3bb), drywall: lam(0xeef1f4), slab: lam(0x2b333a),
    pit: lam(0x14181c), footing: lam(0x8b949c), steel: lam(0x7d8fa3), deck: lam(0x93a1b0),
    insul: lam(0xdfe5ea), membrane: lam(0xffffff), rtu: lam(0xb9c2ca), ceiling: lam(0xd9dfe4),
    counter: lam(0x3d464d), panel: lam(0x6a7580), breaker: lam(0x1b2026), coping: lam(0xc5ced6),
    door: lam(0x39424a), ground: lam(0x0f1317),
    glass: lam(0x3b79b4, { transparent: true, opacity: 0.32 }),
  };

  const colliders = [];      // objects the camera must never be inside
  const staticBoxes = [];    // hand-placed collision boxes (instanced geometry)

  function addEdges(mesh, color = 0x9fb4c9, opacity = 0.28) {
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    );
    line.userData.base = opacity;
    mesh.add(line);
    mesh.userData.edges = line;
  }

  // box(size, center, material, options)
  function box(w, h, d, x, y, z, material, o = {}) {
    let mat = material;
    if (o.fade) { mat = material.clone(); mat.transparent = true; }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.name = o.name || '';
    mesh.userData.base = mat.opacity;
    if (o.edges !== false) addEdges(mesh);
    (o.parent || scene).add(mesh);
    if (o.collide !== false) colliders.push(mesh);
    return mesh;
  }

  function setOpacity(mesh, v) {
    mesh.visible = v > 0.01;
    mesh.material.opacity = v * mesh.userData.base;
    const e = mesh.userData.edges;
    if (e) e.material.opacity = v * e.userData.base;
  }

  /* ---------- building: 12 m x 22 m, front faces +z ----------
     Exterior wall: 0.1 brick veneer over 0.2 unreinforced CMU. Inner CMU face at x = +-5.7, z = +-10.7. */
  const VEN = 0.1, CMU = 0.2, H = 5.0, GRADE = -0.16;

  function wall({ axis, outer, sign, from, to, openings = [], liner = null, name }) {
    const layer = (a, b, y0, y1, offset, th, mat, opts) => {
      const c = outer - sign * offset, len = b - a, hh = y1 - y0, mid = (a + b) / 2, cy = (y0 + y1) / 2;
      return axis === 'x' ? box(len, hh, th, mid, cy, c, mat, opts) : box(th, hh, len, c, cy, mid, mat, opts);
    };
    const spans = [];
    let cur = from;
    for (const o of openings.slice().sort((p, q) => p.a - q.a)) {
      if (o.a > cur) spans.push([cur, o.a, 0, H]);
      if (o.y0 > 0) spans.push([o.a, o.b, 0, o.y0]);
      else layer(o.a, o.b, GRADE, 0, 0.15, 0.3, M.slab, { name: name + ' threshold' });
      if (o.y1 < H) spans.push([o.a, o.b, o.y1, H]);
      if (o.fill === 'glass') layer(o.a, o.b, o.y0, o.y1, 0.15, 0.03, M.glass, { name: name + ' glazing' });
      if (o.fill === 'door') layer(o.a, o.b, o.y0, o.y1, 0.12, 0.05, M.door, { name: name + ' door' });
      cur = o.b;
    }
    if (cur < to) spans.push([cur, to, 0, H]);
    for (const [a, b, y0, y1] of spans) {
      const base = y0 === 0 ? GRADE : y0;
      layer(a, b, base, y1, VEN / 2, VEN, M.veneer, { name: name + ' veneer' });
      layer(a, b, base, y1, VEN + CMU / 2, CMU, M.cmu, { name: name + ' CMU' });
      if (liner) {
        const la = Math.max(a, liner.from), lb = Math.min(b, liner.to), ly = Math.min(y1, 3.0);
        if (lb - la > 0.01 && ly - y0 > 0.01) layer(la, lb, y0, ly, VEN + CMU + 0.03, 0.02, M.drywall, { name: name + ' drywall' });
      }
    }
  }

  wall({ name: 'front', axis: 'x', outer: 11, sign: 1, from: -5.7, to: 5.7, liner: { from: -5.7, to: 5.7 },
    openings: [{ a: -3.4, b: -1.6, y0: 0, y1: 2.3 }, { a: -0.9, b: 5.0, y0: 0.7, y1: 2.6, fill: 'glass' }] });
  wall({ name: 'rear', axis: 'x', outer: -11, sign: -1, from: -5.7, to: 5.7,
    openings: [{ a: 2.2, b: 3.2, y0: 0, y1: 2.2, fill: 'door' }] });
  wall({ name: 'east', axis: 'z', outer: 6, sign: 1, from: -11, to: 11, liner: { from: 1.56, to: 10.7 },
    openings: [{ a: -3.2, b: -2.0, y0: 1.0, y1: 2.2, fill: 'glass' }, { a: 3.6, b: 10.0, y0: 0.7, y1: 2.6, fill: 'glass' }] });
  wall({ name: 'west', axis: 'z', outer: -6, sign: -1, from: -11, to: 11,
    openings: [{ a: -8.6, b: -7.6, y0: 0, y1: 2.2, fill: 'door' }] });

  // parapet coping (edge metal)
  box(12.1, 0.06, 0.38, 0, 5.03, 10.85, M.coping, { name: 'coping' });
  box(12.1, 0.06, 0.38, 0, 5.03, -10.85, M.coping, { name: 'coping' });
  box(0.38, 0.06, 22.1, 5.85, 5.03, 0, M.coping, { name: 'coping' });
  box(0.38, 0.06, 22.1, -5.85, 5.03, 0, M.coping, { name: 'coping' });

  // front entry: two glass leaves that swing inward
  function leaf(hingeX, dir) {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, 10.85);
    scene.add(pivot);
    const m = box(0.88, 2.25, 0.04, dir * 0.45, 1.125, 0, M.glass, { parent: pivot, name: 'entry door' });
    m.userData.edges.material.opacity = 0.6;
    return pivot;
  }
  const doorL = leaf(-3.4, 1), doorR = leaf(-1.6, -1);

  // ground (with the footprint cut out) and grid
  {
    const s = new THREE.Shape();
    s.moveTo(-90, -90); s.lineTo(90, -90); s.lineTo(90, 90); s.lineTo(-90, 90); s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-6, -11); hole.lineTo(-6, 11); hole.lineTo(6, 11); hole.lineTo(6, -11); hole.closePath();
    s.holes.push(hole);
    const g = new THREE.Mesh(new THREE.ShapeGeometry(s), M.ground);
    g.rotation.x = -Math.PI / 2;
    g.position.y = GRADE;
    scene.add(g);
    const grid = new THREE.GridHelper(180, 90, 0x1f2c3a, 0x18212b);
    grid.position.y = GRADE + 0.005;
    scene.add(grid);
  }

  // slab, with a cutaway at the west wall to show the foundation connection
  const CUT = { x0: -5.7, x1: -4.7, z0: 4.2, z1: 7.0 };
  box(10.4, 0.15, 21.4, 0.5, -0.075, 0, M.slab, { name: 'slab' });
  box(1.0, 0.15, CUT.z0 + 10.7, -5.2, -0.075, (CUT.z0 - 10.7) / 2, M.slab, { name: 'slab' });
  box(1.0, 0.15, 10.7 - CUT.z1, -5.2, -0.075, (CUT.z1 + 10.7) / 2, M.slab, { name: 'slab' });
  const cutCover = box(1.0, 0.15, CUT.z1 - CUT.z0, -5.2, -0.075, (CUT.z0 + CUT.z1) / 2, M.slab, { fade: true, name: 'slab cutaway cover', collide: false });
  {
    const zc = (CUT.z0 + CUT.z1) / 2, zl = CUT.z1 - CUT.z0;
    box(1.0, 0.04, zl, -5.2, -0.97, zc, M.pit, { edges: false, name: 'pit' });
    box(0.04, 0.8, zl, -4.68, -0.55, zc, M.pit, { edges: false, name: 'pit' });
    box(1.0, 0.8, 0.04, -5.2, -0.55, CUT.z0 - 0.02, M.pit, { edges: false, name: 'pit' });
    box(1.0, 0.8, 0.04, -5.2, -0.55, CUT.z1 + 0.02, M.pit, { edges: false, name: 'pit' });
    box(1.1, 0.3, zl, -5.75, -0.8, zc, M.footing, { name: 'footing' });
    box(0.3, 0.49, zl, -5.85, -0.405, zc, M.cmu, { name: 'stem wall' });
  }
  const bolts = [];
  for (const z of [4.6, 5.4, 6.2, 6.8]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.2, 10),
      new THREE.MeshBasicMaterial({ color: 0x7fb2e0, transparent: true }));
    b.position.set(-5.64, -0.2, z);
    b.userData.base = 1;
    scene.add(b);
    bolts.push(b);
  }

  // interior: partition between dining and back of house, service counter
  box(6.7, 2.9, 0.12, -2.35, 1.45, 1.5, M.drywall, { name: 'partition' });
  box(3.7, 2.9, 0.12, 3.85, 1.45, 1.5, M.drywall, { name: 'partition' });
  box(1.0, 0.7, 0.12, 1.5, 2.55, 1.5, M.drywall, { name: 'partition header' });
  box(6.0, 1.05, 0.7, 0.4, 0.525, 2.7, M.counter, { name: 'counter' });

  // west wall, dining side: furring over CMU, then removable drywall panels
  const FUR = [];
  for (let z = 1.7; z < 10.7; z += 0.6) FUR.push(z);
  {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 3.0, 0.045), lam(0xc9d2da), FUR.length);
    const m4 = new THREE.Matrix4();
    FUR.forEach((z, i) => { m4.makeTranslation(-5.6825, 1.5, z); im.setMatrixAt(i, m4); });
    scene.add(im);
  }
  const drywall = [];
  {
    const n = 8, z0 = 1.56, w = (10.7 - z0) / n;
    for (let i = 0; i < n; i++) {
      const z = z0 + w * (i + 0.5);
      const mesh = box(0.016, 3.0, w - 0.01, -5.655, 1.5, z, M.drywall, { fade: true, name: 'drywall panel' });
      drywall.push({ mesh, z, dist: Math.abs(z - 5.5) });
    }
    drywall.slice().sort((a, b) => a.dist - b.dist).forEach((d, rank) => { d.delay = (rank / (n - 1)) * 0.5; });
  }

  // suspended ceiling, as strips that drop away
  const strips = [];
  {
    const n = 18, z0 = -10.7, d = 21.4 / n;
    for (let i = 0; i < n; i++) {
      const z = z0 + d * (i + 0.5);
      const mesh = box(11.4, 0.02, d - 0.03, 0, 2.9, z, M.ceiling, { fade: true, name: 'ceiling' });
      strips.push({ mesh, dist: Math.abs(z - 5.25) });
    }
    strips.slice().sort((a, b) => a.dist - b.dist).forEach((s, rank) => { s.delay = (rank / (n - 1)) * 0.6; });
  }

  // roof structure: open-web steel bar joists spanning east-west, 1.5 m on centre
  const JOIST_Z = [];
  for (let k = 0; k < 15; k++) JOIST_Z.push(-10.5 + 1.5 * k);
  {
    const parts = [];
    const q = new THREE.Quaternion(), zAxis = new V3(0, 0, 1);
    for (const z of JOIST_Z) {
      parts.push({ p: [0, 4.075, z], s: [11.4, 0.05, 0.12], r: 0 });
      parts.push({ p: [0, 3.625, z], s: [10.6, 0.05, 0.1], r: 0 });
      const n = 14, x0 = -5.3, dx = 10.6 / n;
      for (let i = 0; i < n; i++) {
        const xa = x0 + dx * i, xb = xa + dx;
        const ya = i % 2 === 0 ? 4.05 : 3.65, yb = i % 2 === 0 ? 3.65 : 4.05;
        parts.push({ p: [(xa + xb) / 2, (ya + yb) / 2, z], s: [Math.hypot(dx, yb - ya), 0.035, 0.035], r: Math.atan2(yb - ya, dx) });
      }
      staticBoxes.push({ name: 'joist', box: new THREE.Box3(new V3(-5.7, 3.58, z - 0.07), new V3(5.7, 4.1, z + 0.07)) });
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.steel, parts.length);
    const m4 = new THREE.Matrix4();
    parts.forEach((pt, i) => {
      q.setFromAxisAngle(zAxis, pt.r);
      m4.compose(new V3(...pt.p), q, new V3(...pt.s));
      im.setMatrixAt(i, m4);
    });
    scene.add(im);
  }

  // roof assembly, bottom to top: metal deck, insulation, single-ply membrane, rooftop equipment
  const deck = box(11.4, 0.08, 21.4, 0, 4.14, 0, M.deck, { name: 'metal deck' });
  const insul = box(11.4, 0.2, 21.4, 0, 4.28, 0, M.insul, { name: 'insulation' });
  const membrane = box(11.4, 0.04, 21.4, 0, 4.40, 0, M.membrane, { name: 'membrane' });
  const rtus = new THREE.Group();
  rtus.position.y = 4.42;
  scene.add(rtus);
  for (const [x, z, w, d] of [[-2.4, -6.2, 2.4, 1.4], [2.3, -1.6, 2.4, 1.4], [1.6, 6.6, 2.0, 1.3]]) {
    box(w + 0.16, 0.3, d + 0.16, x, 0.15, z, M.coping, { parent: rtus, name: 'RTU curb', collide: false });
    box(w, 1.25, d, x, 0.925, z, M.rtu, { parent: rtus, name: 'RTU', collide: false });
  }
  for (const [x, z] of [[-3.2, -1.2], [-2.2, -1.2], [-3.2, 0.2]]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 20), M.rtu);
    f.position.set(x, 0.25, z);
    rtus.add(f);
  }
  colliders.push(rtus);
  rtus.name = 'rooftop equipment';

  // electrical panel on the west wall, back of house
  const PANEL = { y: 1.5, z: -3.77, w: 0.42, h: 1.125, rows: 20, row0: 1.95, pitch: 0.0474, colZ: 0.062, bw: 0.1, bh: 0.036 };
  box(0.1, PANEL.h, PANEL.w, -5.65, PANEL.y, PANEL.z, M.panel, { name: 'panel enclosure' });
  box(0.006, PANEL.h - 0.1, PANEL.w - 0.08, -5.597, PANEL.y, PANEL.z, lam(0x8792a0), { name: 'dead front', collide: false });
  {
    const rows = PANEL.rows, im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, PANEL.bh, PANEL.bw), M.breaker, rows * 2);
    const m4 = new THREE.Matrix4();
    for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
      m4.makeTranslation(-5.588, PANEL.row0 - r * PANEL.pitch, PANEL.z + (c === 0 ? PANEL.colZ : -PANEL.colZ));
      im.setMatrixAt(r * 2 + c, m4);
    }
    scene.add(im);
  }
  const panelDoor = new THREE.Group();
  panelDoor.position.set(-5.585, PANEL.y, PANEL.z + PANEL.w / 2);
  scene.add(panelDoor);
  box(0.012, PANEL.h, PANEL.w, 0, 0, -PANEL.w / 2, M.panel, { parent: panelDoor, name: 'panel door', collide: false });

  // Thermal view: a render of the modelled panel, drawn to match it breaker for breaker.
  // Illustrative only. Temperatures are surface readings of breaker bodies with the dead front in place.
  const THERMAL = { x: -5.5, y: PANEL.y, z: PANEL.z, w: 4.0, h: 2.8 };
  const HOT_ROW = 7;
  const HOT = new V3(THERMAL.x, PANEL.row0 - HOT_ROW * PANEL.pitch, PANEL.z - PANEL.colZ);

  function drawThermal() {
    const cw = 2400, ch = 1680, cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    const S = cw / THERMAL.w;                                         // pixels per metre
    const X = (z) => ((THERMAL.z + THERMAL.w / 2) - z) * S;           // the camera's right is -z
    const Y = (y) => ((THERMAL.y + THERMAL.h / 2) - y) * S;
    const T0 = 68, T1 = 135;
    const PAL = [[0, [8, 3, 28]], [0.18, [48, 10, 104]], [0.38, [128, 22, 140]], [0.58, [214, 62, 52]],
      [0.78, [248, 160, 28]], [0.93, [255, 240, 150]], [1, [255, 255, 255]]];
    const rgb = (temp) => {
      const t = clamp01((temp - T0) / (T1 - T0));
      let i = 0;
      while (i < PAL.length - 2 && t > PAL[i + 1][0]) i++;
      const [ta, ca] = PAL[i], [tb, cb] = PAL[i + 1], k = clamp01((t - ta) / (tb - ta));
      return ca.map((v, j) => Math.round(v + (cb[j] - v) * k));
    };
    const col = (temp, alpha = 1) => { const c = rgb(temp); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')'; };
    const rect = (zc, yc, w, h, temp, blur = 0) => {
      g.fillStyle = g.shadowColor = col(temp);
      g.shadowBlur = blur;
      g.fillRect(X(zc + w / 2), Y(yc + h / 2), w * S, h * S);
      g.shadowBlur = 0;
    };

    // wall: cool masonry, slightly warmer around the panel
    g.fillStyle = col(70); g.fillRect(0, 0, cw, ch);
    let rg = g.createRadialGradient(X(PANEL.z), Y(PANEL.y), 0.2 * S, X(PANEL.z), Y(PANEL.y), 1.5 * S);
    rg.addColorStop(0, col(76)); rg.addColorStop(1, col(70, 0));
    g.fillStyle = rg; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = col(68, 0.5); g.lineWidth = 2;                    // block coursing, a touch cooler at the joints
    for (let y = 0; y <= 3.0; y += 0.2) { g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(cw, Y(y)); g.stroke(); }
    for (let y = 0, r = 0; y < 3.0; y += 0.2, r++) for (let z = -8 + (r % 2) * 0.2; z < 0; z += 0.4) {
      g.beginPath(); g.moveTo(X(z), Y(y)); g.lineTo(X(z), Y(y + 0.2)); g.stroke();
    }

    rect(PANEL.z + PANEL.w, PANEL.y, PANEL.w, PANEL.h, 72.5, 6);      // open door, flat on the wall
    rect(PANEL.z, PANEL.y, PANEL.w, PANEL.h, 77, 14);                 // enclosure
    rect(PANEL.z, PANEL.y, PANEL.w - 0.08, PANEL.h - 0.1, 81, 4);     // dead front

    const noise = (r, c) => ((Math.sin(r * 12.9898 + c * 78.233) * 43758.5453) % 1 + 1) % 1;
    const tempAt = (r, c) => {
      const hotCol = c === 1, dr = Math.abs(r - HOT_ROW);
      if (hotCol && dr === 0) return 132;
      if (hotCol && dr === 1) return 111;
      if (hotCol && dr === 2) return 99;
      if (!hotCol && dr === 0) return 101;
      if (!hotCol && dr === 1) return 94;
      return 84 + noise(r, c) * 6;
    };
    const cz = (c) => PANEL.z + (c === 0 ? PANEL.colZ : -PANEL.colZ);
    const ry = (r) => PANEL.row0 - r * PANEL.pitch;
    for (let r = 0; r < PANEL.rows; r++) for (let c = 0; c < 2; c++) rect(cz(c), ry(r), PANEL.bw, PANEL.bh, tempAt(r, c), 7);

    // heat bleeding out of the hot breaker
    rg = g.createRadialGradient(X(HOT.z), Y(HOT.y), 0, X(HOT.z), Y(HOT.y), 0.19 * S);
    rg.addColorStop(0, col(134, 0.95)); rg.addColorStop(0.35, col(120, 0.55)); rg.addColorStop(1, col(100, 0));
    g.fillStyle = rg; g.fillRect(X(HOT.z) - 0.2 * S, Y(HOT.y) - 0.2 * S, 0.4 * S, 0.4 * S);
    rect(HOT.z, HOT.y, PANEL.bw, PANEL.bh, 133, 10);

    // readouts
    const FONT = '600 30px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
    const tag = (x, y, text) => {
      g.font = FONT;
      const w = g.measureText(text).width + 28;
      g.fillStyle = 'rgba(10,10,10,0.72)'; g.fillRect(x, y - 24, w, 48);
      g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, x + 14, y + 1);
    };
    const spot = (z, y, text) => {
      const px = X(z), py = Y(y), r = 24;
      for (const [lw, st] of [[7, 'rgba(10,10,10,0.75)'], [3, '#fff']]) {
        g.lineWidth = lw; g.strokeStyle = st;
        g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        g.moveTo(px - r - 14, py); g.lineTo(px - r + 8, py); g.moveTo(px + r - 8, py); g.lineTo(px + r + 14, py);
        g.moveTo(px, py - r - 14); g.lineTo(px, py - r + 8); g.moveTo(px, py + r - 8); g.lineTo(px, py + r + 14);
        g.stroke();
      }
      tag(px + r + 26, py, text);
    };
    spot(HOT.z, HOT.y, '132°F');
    spot(cz(0), ry(14), '86°F');

    const bx = X(PANEL.z + 0.95), by0 = Y(PANEL.y + 0.5), by1 = Y(PANEL.y - 0.5);   // scale bar, left of the panel
    const lg = g.createLinearGradient(0, by0, 0, by1);
    for (let i = 0; i <= 10; i++) lg.addColorStop(i / 10, col(T1 - (T1 - T0) * (i / 10)));
    g.fillStyle = lg; g.fillRect(bx, by0, 26, by1 - by0);
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeRect(bx, by0, 26, by1 - by0);
    g.font = FONT; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.fillText(T1 + '°F', bx - 4, by0 - 16);
    g.textBaseline = 'top'; g.fillText(T0 + '°F', bx - 4, by1 + 14);

    g.font = '600 22px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.textBaseline = 'alphabetic';
    const cap = 'ILLUSTRATION  ·  SURFACE READINGS, DEAD FRONT IN PLACE';
    g.fillText(cap, X(PANEL.z) - g.measureText(cap).width / 2, Y(PANEL.y - PANEL.h / 2 - 0.11));
    return cv;
  }
  const thermalTex = new THREE.CanvasTexture(drawThermal());
  thermalTex.colorSpace = THREE.SRGBColorSpace;
  thermalTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const thermal = new THREE.Mesh(new THREE.PlaneGeometry(THERMAL.w, THERMAL.h),
    new THREE.MeshBasicMaterial({ map: thermalTex, transparent: true, opacity: 0, fog: false }));
  thermal.rotation.y = Math.PI / 2;
  thermal.position.set(THERMAL.x, THERMAL.y, THERMAL.z);
  scene.add(thermal);

  /* ---------- camera path ----------
     t = scroll progress, pos = camera position, look = point it faces. Smooth curve through all of them. */
  const KF = [
    { t: 0.000, pos: [14, 10.5, 21.5],     look: [0, 2.2, 2.5], wide: 1 }, // aerial three-quarter
    { t: 0.080, pos: [12.5, 9.2, 20.5],    look: [0, 2.2, 2.5], wide: 1 },
    { t: 0.160, pos: [5, 5.5, 23],         look: [-1.5, 2.0, 9], wide: 0.5 },     // descend toward the entry
    { t: 0.215, pos: [-2.5, 1.8, 17],      look: [-2.5, 1.5, 8] },
    { t: 0.255, pos: [-2.5, 1.7, 11.6],    look: [-2.5, 1.5, 4] },     // at the door
    { t: 0.300, pos: [-2.5, 1.7, 8.6],     look: [-3.5, 1.6, 4] },     // inside
    { t: 0.345, pos: [-1.3, 1.7, 6.3],     look: [-5.7, 1.7, 5.6] },   // face the west wall
    { t: 0.400, pos: [-1.1, 1.7, 6.0],     look: [-5.7, 1.6, 5.4] },   // drywall comes off
    { t: 0.445, pos: [-1.4, 1.75, 5.8],    look: [-5.4, 0.3, 5.5] },   // down to the foundation connection
    { t: 0.490, pos: [-1.5, 1.9, 5.5],     look: [-5.6, 2.6, 5.0] },   // tilt up, ceiling drops
    { t: 0.545, pos: [-1.6, 2.6, 5.25],    look: [-5.7, 3.85, 4.6] },  // joist bearing at the wall
    { t: 0.600, pos: [-1.3, 3.4, 5.25],    look: [-4.5, 4.6, 3.5] },   // rise between two joists
    { t: 0.645, pos: [-0.6, 5.6, 5.25],    look: [-3, 4.6, 1] },       // above the joists, under the lifted deck
    { t: 0.685, pos: [4.5, 6.1, 6.5],      look: [-2, 4.8, 0] },       // out over the east parapet
    { t: 0.715, pos: [9.5, 7.6, 10],       look: [0, 6.6, 0], wide: 0.5 },
    { t: 0.755, pos: [17, 12.5, 14],       look: [0, 6.8, 0], wide: 1 },        // exploded roof from outside
    { t: 0.800, pos: [18, 12.8, 5],        look: [0, 6.8, -1], wide: 1 },
    { t: 0.835, pos: [9.5, 7.0, -1.5],     look: [-3, 4, -3.75] },     // back in over the parapet
    { t: 0.860, pos: [2.5, 5.9, -3.75],    look: [-5.7, 1.8, -3.75] },
    { t: 0.890, pos: [-2.6, 2.7, -3.75],   look: [-5.7, 1.5, -3.75] }, // down between joists to the panel
    { t: 0.925, pos: [-3.9, 1.55, -3.77],  look: [-5.7, 1.5, -3.77] }, // panel framed
    { t: 0.965, pos: [-4.5, 1.57, -3.8],   look: [HOT.x, HOT.y, HOT.z] },
    { t: 1.000, pos: [-5.3, HOT.y, HOT.z], look: [HOT.x - 0.5, HOT.y, HOT.z] }, // into the hot breaker
  ];
  // On narrow screens the exterior shots pull straight back from what they look at, so the building still fits.
  let posCurve, lookCurve, pullback = 0;
  function buildCurves(k) {
    if (k === pullback) return;
    pullback = k;
    posCurve = new THREE.CatmullRomCurve3(KF.map((f) => {
      const look = new V3(...f.look), pos = new V3(...f.pos);
      return look.add(pos.sub(look).multiplyScalar(1 + (k - 1) * (f.wide || 0)));
    }), false, 'centripetal');
    lookCurve = new THREE.CatmullRomCurve3(KF.map((f) => new V3(...f.look)), false, 'centripetal');
  }
  buildCurves(1);
  const _pos = new V3(), _look = new V3();
  function placeCamera(p) {
    let i = 0;
    while (i < KF.length - 2 && p > KF[i + 1].t) i++;
    const u = (i + clamp01((p - KF[i].t) / (KF[i + 1].t - KF[i].t))) / (KF.length - 1);
    posCurve.getPoint(u, _pos);
    lookCurve.getPoint(u, _look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
  }

  const STEPS = [
    { until: 0.215, at: 0, name: 'Approach', labels: 'Exterior walls · Roof equipment · Windows · Door openings' },
    { until: 0.320, at: 0.255, name: 'Entry', labels: 'Door openings' },
    { until: 0.460, at: 0.43, name: 'Interior wall', labels: 'Wall construction · Foundation connection' },
    { until: 0.560, at: 0.545, name: 'Above the ceiling', labels: 'Roof structure · Roof-to-wall connection' },
    { until: 0.820, at: 0.775, name: 'Roof assembly', labels: 'Roof deck · Insulation · Membrane · Parapet · Roof equipment' },
    { until: 0.925, at: 0.912, name: 'Electrical panel', labels: 'Panel location' },
    { until: 1.001, at: 0.962, name: 'Thermal scan', labels: 'Surface temperature of breakers' },
  ];

  /* ---------- everything as a function of progress ---------- */
  const lift = (obj, base, amount, p, a, b) => { obj.position.y = base + amount * ease(seg(p, a, b)); };
  let lastStep = -1;

  function update(p) {
    const d = ease(seg(p, 0.185, 0.245));
    doorL.rotation.y = d * Math.PI / 2;
    doorR.rotation.y = -d * Math.PI / 2;

    const q = seg(p, 0.345, 0.43);
    for (const pn of drywall) {
      const t = seg(q, pn.delay, pn.delay + 0.5), e = t * t;
      pn.mesh.position.set(-5.655 + 1.1 * e, 1.5 + 0.35 * e, pn.z);
      pn.mesh.rotation.z = -0.25 * e;
      setOpacity(pn.mesh, 1 - seg(t, 0.3, 1));
    }

    const f = ease(seg(p, 0.405, 0.455));
    cutCover.position.y = -0.075 - 0.3 * f;
    setOpacity(cutCover, 1 - f);
    for (const b of bolts) { b.material.opacity = f; b.visible = f > 0.01; }

    const cq = seg(p, 0.47, 0.535);
    for (const s of strips) {
      const t = seg(cq, s.delay, s.delay + 0.4);
      s.mesh.position.y = 2.9 - 0.7 * t * t;
      setOpacity(s.mesh, 1 - ease(t));
    }

    lift(rtus, 4.42, 6.6, p, 0.555, 0.62);
    lift(membrane, 4.40, 5.4, p, 0.56, 0.625);
    lift(insul, 4.28, 4.2, p, 0.565, 0.63);
    lift(deck, 4.14, 3.0, p, 0.57, 0.64);

    panelDoor.rotation.y = -ease(seg(p, 0.875, 0.905)) * (174 * Math.PI / 180);
    const th = ease(seg(p, 0.925, 0.958));
    thermal.material.opacity = th;
    thermal.visible = th > 0.01;

    placeCamera(p);

    if (blackout) blackout.style.opacity = ease(seg(p, 0.972, 0.998));
    if (intro) intro.style.opacity = 1 - seg(p, 0.012, 0.05);
    if (hudBar) hudBar.style.transform = 'scaleX(' + p + ')';
    if (btnPrev) btnPrev.disabled = p < 0.004;
    const si = STEPS.findIndex((s) => p < s.until);
    if (si !== lastStep && si >= 0) {
      lastStep = si;
      if (hudNum) hudNum.textContent = String(si + 1).padStart(2, '0') + ' / ' + String(STEPS.length).padStart(2, '0');
      if (hudName) hudName.textContent = STEPS[si].name;
      if (hudLabels) hudLabels.textContent = 'Labels planned here: ' + STEPS[si].labels;
    }
  }

  /* ---------- scroll, resize, render loop ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let target = 0, current = 0, needsRender = true, visible = true, last = performance.now(), raf = 0;

  function readScroll() {
    const r = root.getBoundingClientRect();
    const navH = stage.offsetTop >= 0 ? parseFloat(getComputedStyle(stage).top) || 0 : 0;
    const span = r.height - stage.clientHeight;
    target = span > 0 ? clamp01((navH - r.top) / span) : 0;
    kick();
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep at least ~48 degrees of horizontal view on narrow screens
    const need = 2 * Math.atan(Math.tan((48 * Math.PI / 180) / 2) / camera.aspect) * 180 / Math.PI;
    camera.fov = Math.min(75, Math.max(50, need));
    camera.updateProjectionMatrix();
    const tanHalfH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
    buildCurves(Math.min(2.4, Math.max(1, Math.tan(39 * Math.PI / 180) / tanHalfH)));
    needsRender = true;
    kick();
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const diff = target - current;
    if (Math.abs(diff) > 0.00005) {
      current += reduceMotion ? diff : diff * (1 - Math.exp(-dt * 7));
      needsRender = true;
    } else if (current !== target) {
      current = target;
      needsRender = true;
    }
    if (needsRender) {
      needsRender = false;
      update(current);
      renderer.render(scene, camera);
    }
    if (visible && Math.abs(target - current) > 0.00005) kick();
  }
  function kick() {
    if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  /* Step arrows: each press scrolls the page to that step's key frame, at a pace that lets the transition play. */
  let tween = 0;
  const navTop = () => parseFloat(getComputedStyle(stage).top) || 0;
  const docTop = () => root.getBoundingClientRect().top + window.scrollY;
  const scrollYFor = (p) => docTop() - navTop() + p * (root.offsetHeight - stage.clientHeight);
  const jump = (y) => window.scrollTo({ top: y, behavior: 'instant' });
  function stopTween() { if (tween) { cancelAnimationFrame(tween); tween = 0; } }
  function scrollToY(dest) {
    stopTween();
    const start = window.scrollY, dist = dest - start;
    if (Math.abs(dist) < 2) return;
    if (reduceMotion) { jump(dest); return; }
    const span = root.offsetHeight - stage.clientHeight;
    const dur = Math.min(2600, Math.max(1100, 900 + 9000 * Math.abs(dist) / span)), t0 = performance.now();
    const tick = (now) => {
      const t = clamp01((now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      jump(start + dist * e);
      tween = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    tween = requestAnimationFrame(tick);
  }
  function go(dir) {
    const here = target;
    let i = -1;
    if (dir > 0) i = STEPS.findIndex((s) => s.at > here + 0.004);
    else for (let k = STEPS.length - 1; k >= 0; k--) if (STEPS[k].at < here - 0.004) { i = k; break; }
    if (i < 0 && dir < 0) return;
    scrollToY(i >= 0 ? scrollYFor(STEPS[i].at) : docTop() + root.offsetHeight - navTop());   // past the last step: on to the next section
    if (live) live.textContent = i >= 0 ? 'Step ' + (i + 1) + ' of ' + STEPS.length + ': ' + STEPS[i].name : 'End of walkthrough';
  }
  if (btnPrev) btnPrev.addEventListener('click', () => go(-1));
  if (btnNext) btnNext.addEventListener('click', () => go(1));
  window.addEventListener('wheel', stopTween, { passive: true });
  window.addEventListener('touchstart', stopTween, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') { stopTween(); return; }
    if (!visible || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    const r = root.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.5 || r.bottom < window.innerHeight * 0.5) return;
    e.preventDefault();
    go(e.key === 'ArrowRight' ? 1 : -1);
  });

  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', () => { resize(); readScroll(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(root);
  }
  resize();
  readScroll();
  current = target;
  needsRender = true;
  kick();
  root.classList.add('walk-ready');

  /* ---------- debug hooks used for automated checks ---------- */
  window.__walk = {
    get progress() { return current; },
    get target() { return target; },
    set(p) { current = target = clamp01(p); update(current); renderer.render(scene, camera); return camera.position.toArray(); },
    collisions(samples = 800, margin = 0.12) {
      const hits = [], b = new THREE.Box3(), seen = new Set();
      for (let i = 0; i <= samples; i++) {
        const p = i / samples;
        update(p);
        scene.updateMatrixWorld(true);
        const c = camera.position;
        const test = (name, bx) => {
          if (bx.containsPoint(c)) {
            const key = name + '@' + p.toFixed(2);
            if (!seen.has(key)) { seen.add(key); hits.push({ p: +p.toFixed(4), name, cam: c.toArray().map((v) => +v.toFixed(2)) }); }
          }
        };
        for (const o of colliders) {
          if (!o.visible || (o.material && o.material.opacity < 0.05)) continue;
          b.setFromObject(o).expandByScalar(margin);
          test(o.name, b);
        }
        for (const s of staticBoxes) test(s.name, b.copy(s.box).expandByScalar(margin));
      }
      update(current);
      return hits;
    },
  };
}
