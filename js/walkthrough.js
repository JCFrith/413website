/* 413 Solution: scroll-driven building walkthrough.
   A generic single-storey commercial building: brick veneer over unreinforced CMU, steel bar joists,
   metal deck, rigid insulation, single-ply membrane. Everything on screen, including the data labels,
   is a pure function of one number: scroll progress p in [0, 1]. */
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

  scene.add(new THREE.HemisphereLight(0xe6eef7, 0x5d6772, 1.0)); // ground colour lights ceilings and deck undersides
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(12, 20, 16);
  scene.add(sun);
  // the sun casts shadows; smaller map on phones
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 2, far: 70 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  // interior lighting, since the roof now shades the inside from the sun
  for (const [x, y, z, i] of [[-2.6, 2.6, 8.2, 4], [2.6, 2.6, 8.2, 4], [-2.6, 2.6, 4.0, 4], [2.6, 2.6, 4.0, 4], [0, 2.6, -3.5, 5], [0, 2.6, -8.0, 4]]) {
    const l = new THREE.PointLight(0xfff4e2, i, 11, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
  }
  // a simple sky for metal and glass to reflect: dark horizon, pale overhead, one bright patch for the sun
  const envMap = (() => {
    const es = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 32, 16), pos = geo.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) {
      const t = clamp01(pos.getY(i) / 50 * 0.5 + 0.5), v = 0.03 + 0.85 * t * t;
      col.push(v * 0.86, v * 0.93, v);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    es.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const patch = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    patch.position.set(12, 20, 16).setLength(40);
    es.add(patch);
    const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(es, 0.02).texture;
    pm.dispose();
    return tex;
  })();
  const fill = new THREE.DirectionalLight(0xcfe0f2, 0.45);
  fill.position.set(-10, 8, -12);
  scene.add(fill);

  const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
  const std = (color, roughness, metalness, extra) =>
    new THREE.MeshStandardMaterial(Object.assign({ color, roughness, metalness, envMap, envMapIntensity: 0.9 }, extra));

  // Small repeating textures drawn in code. Each covers a stated real-world size so coursing is to scale.
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function tile(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  }
  const rnd = (i) => ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
  const T = {
    // 0.4 m x 0.2 m: two bricks by three courses, running bond
    brick: tile(256, 128, (g, w, h) => {
      g.fillStyle = '#a39b8f'; g.fillRect(0, 0, w, h);       // mortar
      const ch = h / 3, bl = w / 2, j = 4;
      for (let r = 0; r < 3; r++) for (let c = -1; c < 3; c++) {
        const k = rnd(r * 7 + c + 3);                         // brick-to-brick variation
        g.fillStyle = 'rgb(' + Math.round(132 + k * 30) + ',' + Math.round(62 + k * 16) + ',' + Math.round(48 + k * 12) + ')';
        g.fillRect(c * bl + (r % 2) * bl / 2 + j / 2, r * ch + j / 2, bl - j, ch - j);
      }
    }),
    // 0.4 m x 0.4 m: one block by two courses, running bond
    cmu: tile(256, 256, (g, w, h) => {
      g.fillStyle = '#7b858e'; g.fillRect(0, 0, w, h);
      const j = 5;
      for (let r = 0; r < 2; r++) for (let c = -1; c < 2; c++) {
        const v = 164 + Math.round(rnd(r * 5 + c + 11) * 10);
        g.fillStyle = 'rgb(' + v + ',' + (v + 9) + ',' + (v + 17) + ')';
        g.fillRect(c * w + (r % 2) * w / 2 + j / 2, r * h / 2 + j / 2, w - j, h / 2 - j);
      }
    }),
    // 0.6 m ceiling tile in its grid
    ceiling: tile(128, 128, (g, w, h) => {
      g.fillStyle = '#dde3e8'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#aab4bd'; g.lineWidth = 5; g.strokeRect(0, 0, w, h);
    }),
    // 3 m membrane sheets with a lap seam
    membrane: tile(256, 256, (g, w, h) => {
      g.fillStyle = '#f5f7f9'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d3dae0'; g.fillRect(0, 0, w, 4);
    }),
    // 1.2 m x 2.4 m insulation boards, staggered
    insul: tile(256, 256, (g, w, h) => {
      g.fillStyle = '#dfe5ea'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b8c2cb';
      g.fillRect(0, 0, w, 3); g.fillRect(0, h / 2, w, 3); g.fillRect(0, 0, 3, h / 2); g.fillRect(w / 2, h / 2, 3, h / 2);
    }),
    // 3 m slab control joints
    slab: tile(128, 128, (g, w, h) => {
      g.fillStyle = '#2d353c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#20262c'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    }),
    // 0.6 m floor tile with grout lines
    floor: tile(128, 128, (g, w, h) => {
      g.fillStyle = '#8f9aa4'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#5c6670'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
    }),
    // 1.5 m sidewalk panels
    walk: tile(128, 128, (g, w, h) => {
      g.fillStyle = '#3f4952'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2c343b'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
    }),
  };
  const M = {
    veneer: lam(0xffffff, { map: T.brick }), cmu: lam(0xffffff, { map: T.cmu }), drywall: lam(0xeef1f4),
    slab: lam(0xffffff, { map: T.slab }), walk: lam(0xffffff, { map: T.walk }), floor: lam(0xffffff, { map: T.floor }),
    pit: lam(0x14181c), footing: lam(0x8b949c), steel: std(0x8fa1b5, 0.5, 0.75), deck: std(0xa3b1bf, 0.42, 0.8),
    insul: lam(0xffffff, { map: T.insul }), membrane: lam(0xffffff, { map: T.membrane }), rtu: std(0xc3ccd4, 0.5, 0.6),
    ceiling: lam(0xffffff, { map: T.ceiling }), counter: lam(0x3d464d), panel: std(0x76818c, 0.55, 0.6), breaker: lam(0x1b2026),
    coping: std(0xcfd7de, 0.4, 0.7), door: lam(0x39424a), ground: lam(0x0f1317), frame: std(0x232a31, 0.35, 0.8),
    metal: std(0xbac4cd, 0.3, 0.85), accent: std(0x7fb2e0, 0.45, 0.5), table: lam(0x59636d),
    glass: std(0x4a86bf, 0.04, 0.2, { transparent: true, opacity: 0.36, envMapIntensity: 1.6 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff6e6 }),
  };
  const TILE = new Map([[M.veneer, [0.4, 0.2]], [M.cmu, [0.4, 0.4]], [M.slab, [3, 3]], [M.walk, [1.5, 1.5]], [M.floor, [0.6, 0.6]],
    [M.insul, [2.4, 2.4]], [M.membrane, [3, 3]], [M.ceiling, [0.6, 0.6]]]);

  // Map a box's texture by where it sits in the world, so coursing runs unbroken from one piece to the next.
  function worldUV(mesh, tu, tv) {
    const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, o = mesh.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + o.x, y = pos.getY(i) + o.y, z = pos.getZ(i) + o.z;
      if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, z / tu, y / tv);
      else if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x / tu, z / tv);
      else uv.setXY(i, x / tu, y / tv);
    }
    uv.needsUpdate = true;
  }

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
    if (TILE.has(material)) worldUV(mesh, ...TILE.get(material));
    mesh.name = o.name || '';
    mesh.userData.base = mat.opacity;
    if (o.edges !== false) addEdges(mesh, 0x9fb4c9, material.map ? 0.16 : 0.28);
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

  const PANEL_Z = -3.77;

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
      if (o.fill === 'glass') {
        layer(o.a, o.b, o.y0, o.y1, 0.15, 0.03, M.glass, { name: name + ' glazing' });
        const bar = { edges: false, collide: false }, n = Math.max(1, Math.ceil((o.b - o.a) / 1.5));
        layer(o.a, o.b, o.y0, o.y0 + 0.06, 0.15, 0.09, M.frame, bar);
        layer(o.a, o.b, o.y1 - 0.06, o.y1, 0.15, 0.09, M.frame, bar);
        for (let i = 0; i <= n; i++) {
          const x = o.a + (o.b - o.a) * i / n, x0 = Math.max(o.a, x - 0.03);
          layer(x0, Math.min(o.b, x0 + 0.06), o.y0, o.y1, 0.15, 0.09, M.frame, bar);
        }
      }
      if (o.fill === 'entry') {
        const bar = { edges: false, collide: false };
        layer(o.a - 0.06, o.a, 0, o.y1 + 0.06, 0.15, 0.1, M.frame, bar);
        layer(o.b, o.b + 0.06, 0, o.y1 + 0.06, 0.15, 0.1, M.frame, bar);
        layer(o.a, o.b, o.y1, o.y1 + 0.06, 0.15, 0.1, M.frame, bar);
      }
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
    openings: [{ a: -3.4, b: -1.6, y0: 0, y1: 2.3, fill: 'entry' }, { a: -0.9, b: 5.0, y0: 0.7, y1: 2.6, fill: 'glass' }] });
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

  // site: sidewalk, entry canopy, bollards, parking stalls, drive-through lane
  box(15.6, 0.13, 2.6, 0.6, GRADE + 0.065, 12.3, M.walk, { name: 'sidewalk', edges: false });
  box(1.8, 0.13, 22, 6.9, GRADE + 0.065, 0, M.walk, { name: 'sidewalk', edges: false });
  box(3.4, 0.12, 1.5, -2.5, 2.85, 11.75, M.coping, { name: 'entry canopy' });
  for (const x of [-4.4, -0.6]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 12), M.accent);
    b.position.set(x, GRADE + 0.63, 13.3);
    scene.add(b);
  }
  {
    const lines = [];
    for (let x = -13.5; x <= 13.6; x += 2.7) lines.push([x, 17.6, 0.1, 5.0]);          // stalls facing the building
    lines.push([8.4, 0, 0.1, 21], [11.6, 0, 0.1, 21]);                                  // drive-through lane
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.01, 1), new THREE.MeshBasicMaterial({ color: 0x4d5a67 }), lines.length);
    const m4 = new THREE.Matrix4();
    lines.forEach(([x, z, w, d], i) => { m4.makeScale(w, 1, d); m4.setPosition(x, GRADE + 0.012, z); im.setMatrixAt(i, m4); });
    scene.add(im);
  }

  // slab, with a cutaway at the west wall to show the foundation connection
  const CUT = { x0: -5.7, x1: -4.7, z0: 4.2, z1: 7.0 };
  box(10.4, 0.15, 21.4, 0.5, -0.075, 0, M.slab, { name: 'slab' });
  box(1.0, 0.15, CUT.z0 + 10.7, -5.2, -0.075, (CUT.z0 - 10.7) / 2, M.slab, { name: 'slab' });
  box(1.0, 0.15, 10.7 - CUT.z1, -5.2, -0.075, (CUT.z1 + 10.7) / 2, M.slab, { name: 'slab' });
  const cutCover = box(1.0, 0.15, CUT.z1 - CUT.z0, -5.2, -0.075, (CUT.z0 + CUT.z1) / 2, M.slab, { fade: true, name: 'slab cutaway cover', collide: false });
  // floor tile, front of house only
  const FT = { edges: false, collide: false, name: 'floor tile' };
  box(10.4, 0.012, 9.14, 0.5, 0.006, 6.13, M.floor, FT);
  box(1.0, 0.012, CUT.z0 - 1.56, -5.2, 0.006, (CUT.z0 + 1.56) / 2, M.floor, FT);
  box(1.0, 0.012, 10.7 - CUT.z1, -5.2, 0.006, (CUT.z1 + 10.7) / 2, M.floor, FT);
  const tileCover = box(1.0, 0.012, CUT.z1 - CUT.z0, -5.2, 0.006, (CUT.z0 + CUT.z1) / 2, M.floor, Object.assign({ fade: true }, FT));
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
  for (const [x, z] of [[1.6, 5.2], [3.9, 5.2], [1.6, 7.4], [3.9, 7.4], [1.6, 9.5], [3.9, 9.5]]) {
    box(0.75, 0.04, 0.75, x, 0.74, z, M.table, { name: 'table' });
    box(0.08, 0.72, 0.08, x, 0.36, z, M.frame, { name: 'table', edges: false });
  }
  box(0.8, 0.9, 8.5, 5.25, 0.45, -5.2, M.metal, { name: 'kitchen line' });       // back of house
  box(2.2, 0.9, 1.1, 0.8, 0.45, -7.4, M.metal, { name: 'prep island' });
  box(0.6, 0.4, 18.5, 3.3, 3.26, 0, M.metal, { name: 'supply duct' });           // above the ceiling
  for (const z of [PANEL_Z - 0.09, PANEL_Z + 0.07]) {                            // conduit rising from the panel
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 10), M.metal);
    c.position.set(-5.665, 2.8, z);
    scene.add(c);
  }

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
    // recessed light fixtures, carried by the ceiling strip they sit in
    for (const [x, z] of [[-2.6, 8.2], [2.6, 8.2], [-2.6, 4.0], [2.6, 4.0], [-2.4, -3.5], [2.4, -3.5], [0, -8.0]]) {
      const host = strips[Math.min(n - 1, Math.floor((z - z0) / d))];
      const f = box(1.2, 0.012, 0.6, x, -0.012, z - host.mesh.position.z, M.light, { fade: true, edges: false, collide: false, parent: host.mesh, name: 'light fixture' });
      (host.lights = host.lights || []).push(f);
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
    // each joist end sits on a steel bearing plate in the masonry
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.035, 0.24), M.accent, JOIST_Z.length * 2);
    const s4 = new THREE.Matrix4();
    JOIST_Z.forEach((z, i) => {
      s4.makeTranslation(-5.62, 4.03, z); seats.setMatrixAt(i * 2, s4);
      s4.makeTranslation(5.62, 4.03, z); seats.setMatrixAt(i * 2 + 1, s4);
    });
    scene.add(seats);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.steel, parts.length);
    const m4 = new THREE.Matrix4();
    parts.forEach((pt, i) => {
      q.setFromAxisAngle(zAxis, pt.r);
      m4.compose(new V3(...pt.p), q, new V3(...pt.s));
      im.setMatrixAt(i, m4);
    });
    scene.add(im);
  }

  // roof assembly, bottom to top: fluted metal deck, rigid insulation, single-ply membrane, rooftop equipment
  const DECK_Y = 4.112;
  const deck = (() => {
    const width = 11.4, depth = 21.4, pitch = 0.3, rise = 0.06, t = 0.012, n = Math.round(width / pitch), x0 = -width / 2;
    const top = [];
    for (let i = 0; i < n; i++) { const x = x0 + i * pitch; top.push([x, 0], [x + 0.1, 0], [x + 0.15, rise], [x + 0.25, rise]); }
    top.push([x0 + n * pitch, 0]);
    const sh = new THREE.Shape();
    top.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    for (let i = top.length - 1; i >= 0; i--) sh.lineTo(top[i][0], top[i][1] - t);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, steps: 1 });
    geo.translate(0, 0, -depth / 2);
    const mesh = new THREE.Mesh(geo, M.deck);
    mesh.position.y = DECK_Y;
    mesh.name = 'metal deck';
    scene.add(mesh);
    colliders.push(mesh);
    return mesh;
  })();
  const insul = box(11.4, 0.2, 21.4, 0, 4.28, 0, M.insul, { name: 'insulation' });
  const membrane = new THREE.Group();
  membrane.position.y = 4.40;
  membrane.name = 'membrane';
  scene.add(membrane);
  colliders.push(membrane);
  box(11.4, 0.04, 21.4, 0, 0, 0, M.membrane, { parent: membrane, collide: false });
  for (const [w, d, x, z] of [[0.02, 21.4, 5.69, 0], [0.02, 21.4, -5.69, 0], [11.4, 0.02, 0, 10.69], [11.4, 0.02, 0, -10.69]]) {
    box(w, 0.5, d, x, 0.27, z, M.membrane, { parent: membrane, collide: false, edges: false });   // flashing up the parapet
  }
  const rtus = new THREE.Group();
  rtus.position.y = 4.42;
  rtus.name = 'rooftop equipment';
  scene.add(rtus);
  colliders.push(rtus);
  const RTU = [[-2.4, -6.2, 2.4, 1.4], [2.3, -1.6, 2.4, 1.4], [1.6, 6.6, 2.0, 1.3]];
  for (const [x, z, w, d] of RTU) {
    box(w + 0.16, 0.3, d + 0.16, x, 0.15, z, M.coping, { parent: rtus, name: 'RTU curb', collide: false });
    box(w, 1.25, d, x, 0.925, z, M.rtu, { parent: rtus, name: 'RTU', collide: false });
    box(w * 0.34, 0.9, 0.02, x - w * 0.28, 0.95, z + d / 2 + 0.011, M.frame, { parent: rtus, collide: false, edges: false });  // coil face
    for (const fx of [-0.5, 0.5]) {
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 24), M.frame);
      fan.position.set(x + fx * w * 0.5, 1.575, z);
      rtus.add(fan);
    }
  }
  for (const [x, z] of [[-3.2, -1.2], [-2.2, -1.2], [-3.2, 0.2]]) {      // kitchen exhaust fans
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.32, 20), M.rtu);
    base.position.set(x, 0.16, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.22, 20), M.coping);
    cap.position.set(x, 0.43, z);
    rtus.add(base, cap);
  }

  // electrical panel on the west wall, back of house
  const PANEL = { y: 1.5, z: PANEL_Z, w: 0.42, h: 1.125, rows: 20, row0: 1.95, pitch: 0.0474, colZ: 0.062, bw: 0.1, bh: 0.036 };
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

  // everything solid casts and receives the sun's shadow; glass and glowing surfaces do not
  scene.traverse((o) => {
    if (!o.isMesh || o.material.isMeshBasicMaterial) return;
    o.receiveShadow = true;
    o.castShadow = o.material !== M.glass;
  });

  /* ---------- data labels, pinned to the component they describe ----------
     at: point in the world (functions follow moving parts). on: progress window. off: where the tag sits from its dot, px. */
  let labelP = 0;
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const LABELS = [
    { tag: 'COPE',   field: 'Exterior walls',   value: 'Brick veneer, CMU',        at: () => [2.6, 3.8, 11.02],                on: [0.045, 0.165], off: [-40, -78] },
    { tag: 'NatCat', field: 'Roof equipment',   value: 'Roof mounted unit',        at: () => [1.6, rtus.position.y + 1.6, 6.6], on: [0.055, 0.130], off: [60, -64] },
    { tag: 'NatCat', field: 'Windows',          value: 'Storefront glazing',       at: () => [2.9, 1.7, 11.0],                 on: [0.065, 0.200], off: [70, 60] },
    { tag: 'NatCat', field: 'Door openings',    value: 'Glass entry',              at: () => [-2.5, 2.25, 11.0],               on: [0.075, 0.236], off: [-60, 54] },
    { tag: 'COPE',   field: 'Interior wall',    value: 'Drywall',                  at: () => [-5.64, 1.9, 2.6 + 3.4 * ease(seg(labelP, 0.29, 0.335))], on: [0.250, 0.352], off: [80, -60] },
    { tag: 'COPE',   field: 'Floor surface',    value: 'Tile',                     at: () => [-3.2, 0.02, 3.6],                on: [0.256, 0.326], off: [80, 40] },
    { tag: 'COPE',   field: 'Wall construction', value: 'CMU, ISO 4',              at: () => [-5.7, 2.05, 5.2],                on: [0.398, 0.476], off: [80, -70] },
    { tag: 'NatCat', field: 'Foundation',       value: 'Anchor bolts',             at: () => [-5.64, 0.22, 5.4],               on: [0.440, 0.488], off: [90, 30] },
    { tag: 'COPE',   field: 'Roof framing',     value: 'Steel bar joists',         at: () => [-3.6, 3.63, 4.5],                on: [0.515, 0.600], off: [90, 50] },
    { tag: 'NatCat', field: 'Roof-to-wall',     value: 'Joist seat, bearing plate', at: () => [-5.62, 4.02, 4.5],              on: [0.530, 0.600], off: [70, -60] },
    { tag: 'NatCat', field: 'Roof equipment',   value: 'Roof mounted unit',        at: () => [2.3, rtus.position.y + 1.6, -1.6], on: [0.738, 0.815], off: [70, -50] },
    { tag: 'NatCat', field: 'Roof cover',       value: 'Single-ply membrane',      at: () => [5.7, membrane.position.y, 4.5],  on: [0.744, 0.815], off: [-70, -56] },
    { tag: 'NatCat', field: 'Roof deck',        value: 'Metal deck',               at: () => mix3([-4.0, deck.position.y, -5.0], [5.7, deck.position.y + 0.03, 5.5], ease(seg(labelP, 0.715, 0.75))), on: [0.618, 0.815], off: [-80, 20] },
    { tag: 'COPE',   field: 'Roof framing',     value: 'Steel bar joists',         at: () => mix3([-2.6, 4.1, 1.5], [3.4, 4.1, -7.5], ease(seg(labelP, 0.715, 0.75))), on: [0.612, 0.815], off: [90, 26] },
    { tag: 'COPE',   field: 'Electrical',       value: 'Main panel',               at: () => [-5.6, 2.02, PANEL_Z - 0.21],     on: [0.897, 0.930], off: [70, -50] },
    { tag: 'Thermal', field: 'Panel scan',      value: 'Breaker running hot',      at: () => [HOT.x, HOT.y, HOT.z],            on: [0.944, 0.979], off: [-90, -70] },
  ];
  const layer = document.createElement('div');
  layer.className = 'walk-label-layer';
  layer.setAttribute('aria-hidden', 'true');
  stage.insertBefore(layer, blackout);
  for (const L of LABELS) {
    const el = document.createElement('div');
    el.className = 'walk-label';
    el.innerHTML = '<i class="wl-line"></i><i class="wl-dot"></i><div class="wl-chip"><div class="wl-top"><span class="wl-tag wl-' +
      L.tag.toLowerCase() + '">' + L.tag + '</span><span class="wl-field">' + L.field + '</span></div><div class="wl-value">' + L.value + '</div></div>';
    layer.appendChild(el);
    L.el = el; L.line = el.children[0]; L.dot = el.children[1]; L.chip = el.children[2]; L.shown = false;
  }
  let stageW = 1, stageH = 1;
  function measureLabels() {
    stageW = stage.clientWidth; stageH = stage.clientHeight;
    for (const L of LABELS) { L.w = L.chip.offsetWidth; L.h = L.chip.offsetHeight; }
  }
  const _a = new V3(), _c = new V3();
  function placeLabels(p) {
    const k = stageW < 600 ? 0.6 : 1, reserve = stageW < 600 ? 128 : 118, bottom = stageH - reserve, live = [];
    camera.updateMatrixWorld(true);
    labelP = p;
    for (const L of LABELS) {
      let o = Math.min(seg(p, L.on[0], L.on[0] + 0.012), 1 - seg(p, L.on[1] - 0.012, L.on[1])), sx = 0, sy = 0;
      if (o > 0) {
        _a.fromArray(L.at());
        if (_c.copy(_a).applyMatrix4(camera.matrixWorldInverse).z > -0.1) o = 0;
        else {
          _a.project(camera);
          sx = (_a.x * 0.5 + 0.5) * stageW; sy = (-_a.y * 0.5 + 0.5) * stageH;
          if (sx < -10 || sx > stageW + 10 || sy < -10 || sy > stageH + 10) o = 0;
        }
      }
      if (o <= 0.001) {
        if (L.shown) { L.shown = false; L.el.style.opacity = 0; L.el.style.visibility = 'hidden'; }
        continue;
      }
      L.o = o; L.sx = sx; L.sy = sy;
      L.cx = Math.min(Math.max(sx + L.off[0] * k - (L.off[0] < 0 ? L.w : 0), 8), stageW - L.w - 8);
      L.cy = Math.min(Math.max(sy + L.off[1] * k - L.h / 2, 8), bottom - L.h);
      live.push(L);
    }
    // keep tags from sitting on each other: work down the screen, pushing each one clear of those above it
    live.sort((m, n) => m.cy - n.cy);
    for (let i = 1; i < live.length; i++) {
      const L = live[i];
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const U = live[j];
          if (L.cx < U.cx + U.w + 6 && U.cx < L.cx + L.w + 6 && L.cy < U.cy + U.h + 6 && U.cy < L.cy + L.h + 6) {
            L.cy = U.cy + U.h + 6; moved = true;
          }
        }
        if (!moved) break;
      }
      if (L.cy > bottom - L.h) L.cy = bottom - L.h;
    }
    for (const L of live) {
      const ax = Math.min(Math.max(L.sx, L.cx), L.cx + L.w), ay = Math.min(Math.max(L.sy, L.cy), L.cy + L.h);
      L.line.style.width = Math.hypot(ax - L.sx, ay - L.sy) + 'px';
      L.line.style.transform = 'translate(' + L.sx + 'px,' + L.sy + 'px) rotate(' + Math.atan2(ay - L.sy, ax - L.sx) + 'rad)';
      L.dot.style.transform = 'translate(' + (L.sx - 5) + 'px,' + (L.sy - 5) + 'px)';
      L.chip.style.transform = 'translate(' + Math.round(L.cx) + 'px,' + Math.round(L.cy) + 'px)';
      L.el.style.opacity = L.o;
      if (!L.shown) { L.shown = true; L.el.style.visibility = 'visible'; }
    }
  }

  const STEPS = [
    { until: 0.215, at: 0, name: 'Approach' },
    { until: 0.320, at: 0.280, name: 'Entry' },
    { until: 0.470, at: 0.46, name: 'Interior wall' },
    { until: 0.560, at: 0.545, name: 'Above the ceiling' },
    { until: 0.820, at: 0.782, name: 'Roof assembly' },
    { until: 0.925, at: 0.912, name: 'Electrical panel' },
    { until: 1.001, at: 0.962, name: 'Thermal scan' },
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
    tileCover.position.y = 0.006 - 0.3 * f;
    setOpacity(tileCover, 1 - f);
    for (const b of bolts) { b.material.opacity = f; b.visible = f > 0.01; }

    const cq = seg(p, 0.47, 0.535);
    for (const s of strips) {
      const t = seg(cq, s.delay, s.delay + 0.4);
      s.mesh.position.y = 2.9 - 0.7 * t * t;
      setOpacity(s.mesh, 1 - ease(t));
      if (s.lights) for (const f of s.lights) setOpacity(f, 1 - ease(t));
    }

    lift(rtus, 4.42, 6.6, p, 0.555, 0.62);
    lift(membrane, 4.40, 5.4, p, 0.56, 0.625);
    lift(insul, 4.28, 4.2, p, 0.565, 0.63);
    lift(deck, DECK_Y, 3.0, p, 0.57, 0.64);

    panelDoor.rotation.y = -ease(seg(p, 0.875, 0.905)) * (174 * Math.PI / 180);
    const th = ease(seg(p, 0.925, 0.958));
    thermal.material.opacity = th;
    thermal.visible = th > 0.01;

    placeCamera(p);
    placeLabels(p);

    if (blackout) blackout.style.opacity = ease(seg(p, 0.972, 0.998));
    if (intro) intro.style.opacity = 1 - seg(p, 0.012, 0.05);
    if (hudBar) hudBar.style.transform = 'scaleX(' + p + ')';
    if (btnPrev) btnPrev.disabled = p < 0.004;
    const si = STEPS.findIndex((s) => p < s.until);
    if (si !== lastStep && si >= 0) {
      lastStep = si;
      if (hudNum) hudNum.textContent = String(si + 1).padStart(2, '0') + ' / ' + String(STEPS.length).padStart(2, '0');
      if (hudName) hudName.textContent = STEPS[si].name;
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
    measureLabels();
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
