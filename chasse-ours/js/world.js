/* Chassé d'Ours — outils communs (U) et décor (World) : plaine, bosquets, hautes herbes, ciel d'heure dorée. */
const U = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
  function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
  function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
  }
  const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.1;
  function mat(x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  }
  // une pièce : géométrie facettée + couleur par sommet, légèrement variée d'une face à l'autre
  function part(geo, color, m, jit = 0.07) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color);
    for (let i = 0; i < n; i += 3) {
      const k = 1 + (Math.random() * 2 - 1) * jit;
      for (let j = 0; j < 3 && i + j < n; j++) { col[(i + j) * 3] = c.r * k; col[(i + j) * 3 + 1] = c.g * k; col[(i + j) * 3 + 2] = c.b * k; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  function merge(parts) {
    let total = 0; parts.forEach(p => total += p.attributes.position.count);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    parts.forEach(p => { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  function canvasTex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return new THREE.CanvasTexture(c); }
  function radialTex(stops, size = 128) {
    return canvasTex(size, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  }
  return { TAU, lerp, clamp, damp, angDiff, rng, hash, vnoise, fbm, mat, part, merge, canvasTex, radialTex };
})();

const World = (() => {
  'use strict';
  const W = { R: 200, sites: [], trees: [], colliders: [], patches: [], berries: [], walls: [], kickables: [], sunDir: new THREE.Vector3(-0.62, 0.5, -0.6).normalize() };
  W.camp = { x: -1.8, z: 10 };
  W.town = { x: 10, z: -95, r: 36, gate: { x: 10, z: -59 }, fountain: { x: 10, z: -95 }, bell: { x: 17, z: -108 }, halle: { x: 30, z: -95 },
    pages: [{ x: -10, z: -78 }, { x: -9, z: -112 }, { x: 26, z: -76 }], honey: [{ x: 28, z: -99 }, { x: 32, z: -95 }, { x: 28, z: -91 }, { x: 33, z: -100 }],
    sleepers: [[30, -97.5, 1], [30.5, -92, 4], [33, -89, 2.5]], lts: [[-20, -95], [38, -80], [26, -122]],
    patrols: [[[10, -70], [-2, -84], [10, -86], [22, -84]], [[-4, -104], [-4, -88], [-21, -86], [-22, -104]], [[22, -104], [10, -106], [22, -110], [36, -106]], [[22, -84], [39, -86], [39, -104], [22, -104]]] };
  const rng = U.rng(20261121);
  let scene, sky, sunLight, hemi, flame, treeMat, treeFade, grassU, clouds = [], shockR = 0, shockAmp = 0, moodK = 0, moodT = 0, darkK = 0, duskK = 0, duskT = 0;
  const SUN_DAY = new THREE.Color(0xffd3a0), SUN_DUSK = new THREE.Color(0xff9a6a), FOG_DUSK = new THREE.Color(0xc98a80);
  const FOG_CALM = new THREE.Color(0xf7cf9e), FOG_HOT = new THREE.Color(0xffc089), fogC = new THREE.Color();

  function pineGeo() {
    const P = [U.part(new THREE.CylinderGeometry(0.28, 0.44, 2.6, 6), 0x6b4a2f, U.mat(0, 1.3, 0))];
    [[2.7, 3.4, 2.0, 0x2c6537], [2.15, 3.0, 3.9, 0x34763e], [1.5, 2.9, 5.7, 0x3f8a46]].forEach(([r, h, y, c]) =>
      P.push(U.part(new THREE.ConeGeometry(r, h, 7), c, U.mat(0, y + h / 2, 0, 1, 1, 1, 0, Math.random() * 3, 0))));
    return U.merge(P);
  }
  function leafGeo(c1, c2) {
    const P = [U.part(new THREE.CylinderGeometry(0.3, 0.5, 3.6, 6), 0x7a5536, U.mat(0, 1.8, 0))];
    [[0, 5.3, 0, 2.6, c1], [1.6, 4.5, 0.6, 1.8, c2], [-1.5, 4.7, -0.5, 1.9, c2], [0.3, 6.7, -0.3, 1.7, c1], [-0.2, 4.4, 1.5, 1.5, c1]].forEach(([x, y, z, r, c]) =>
      P.push(U.part(new THREE.IcosahedronGeometry(r, 1), c, U.mat(x, y, z, 1, 0.86, 1, 0, Math.random() * 3, 0), 0.1)));
    return U.merge(P);
  }
  function bladeGeo() {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.PlaneGeometry(0.44, 1.5, 1, 3); g.translate(0, 0.75, 0);
      const p = g.attributes.position;
      for (let j = 0; j < p.count; j++) { const k = p.getY(j) / 1.5; p.setX(j, p.getX(j) * (1 - 0.88 * k) + 0.14 * k * k * (i - 1)); }
      g.rotateY(i * Math.PI / 3 + 0.3); g.translate((i - 1) * 0.17, 0, (i % 2) * 0.15);
      const ng = g.toNonIndexed(), n = ng.attributes.position.count, col = new Float32Array(n * 3), nor = ng.attributes.normal;
      for (let j = 0; j < n; j++) {
        const k = ng.attributes.position.getY(j) / 1.5;
        col[j * 3] = 0.5 + 0.75 * k; col[j * 3 + 1] = 0.55 + 0.55 * k; col[j * 3 + 2] = 0.45 + 0.25 * k;
        nor.setXYZ(j, 0, 1, 0); // éclairage comme le sol : la touffe reste lumineuse des deux côtés
      }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(ng);
    }
    return U.merge(parts);
  }

  function init(sc, opts) {
    scene = sc;
    const coarse = opts && opts.coarse;
    planRuins();

    /* --- lumière --- */
    hemi = new THREE.HemisphereLight(0xffeccc, 0x4a6a35, 0.66); scene.add(hemi);
    sunLight = new THREE.DirectionalLight(0xffd3a0, 0.88);
    sunLight.castShadow = true;
    const sh = sunLight.shadow; sh.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sh.camera.left = -48; sh.camera.right = 48; sh.camera.top = 48; sh.camera.bottom = -48; sh.camera.near = 1; sh.camera.far = 240;
    sh.bias = -0.0006; sh.normalBias = 0.35;
    scene.add(sunLight); scene.add(sunLight.target);

    /* --- ciel --- */
    sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 14), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: W.sunDir }, uMood: { value: 0 }, uDark: { value: 0 }, uDusk: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 uSun; uniform float uMood; uniform float uDark; uniform float uDusk;
        void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, -0.2, 1.0);
          vec3 hor = mix(vec3(0.97,0.81,0.62), vec3(1.0,0.75,0.54), uMood);
          vec3 mid = mix(vec3(0.66,0.84,0.90), vec3(0.72,0.76,0.95), uMood);
          vec3 top = mix(vec3(0.27,0.55,0.82), vec3(0.32,0.42,0.84), uMood);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h)); c = mix(c, top, smoothstep(0.16, 0.7, h));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0,0.74,0.4) * (pow(s, 10.0) * 0.38 + pow(s, 500.0) * 1.6);
          c = mix(c, c * vec3(0.78,0.5,0.72) + vec3(0.3,0.1,0.02) * (1.0 - smoothstep(0.0, 0.35, h)), uDusk);
          c = mix(c, vec3(0.05,0.07,0.16), uDark * 0.8);
          gl_FragColor = vec4(c, 1.0); }`
    }));
    sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

    /* --- sol --- */
    const gg = new THREE.PlaneGeometry(1200, 1200, 120, 120); gg.rotateX(-Math.PI / 2);
    const gp = gg.attributes.position, gc = new Float32Array(gp.count * 3);
    const cA = new THREE.Color(0x5a9140), cB = new THREE.Color(0x82ab4c), cD = new THREE.Color(0xbfb060), cc = new THREE.Color();
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      cc.copy(cA).lerp(cB, U.fbm(x * 0.02, z * 0.02));
      const dry = U.fbm(x * 0.009 + 50, z * 0.009 + 9); if (dry > 0.55) cc.lerp(cD, Math.min(1, (dry - 0.55) * 5) * 0.75);
      gc[i * 3] = cc.r; gc[i * 3 + 1] = cc.g; gc[i * 3 + 2] = cc.b;
    }
    gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
    const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.receiveShadow = true; scene.add(ground);

    /* --- montagnes et nuages au loin --- */
    const mP = [];
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * U.TAU + rng() * 0.2, r = 560 + rng() * 120, h = 90 + rng() * 150;
      mP.push(U.part(new THREE.ConeGeometry(120 + rng() * 110, h, 5), i % 2 ? 0x8f93bb : 0xa7a2c6, U.mat(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r, 1, 1, 1, 0, rng() * 3, 0), 0.05));
    }
    scene.add(new THREE.Mesh(U.merge(mP), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfff0dc, fog: false, transparent: true, opacity: 0.92 });
    const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group(), a = rng() * U.TAU, r = 260 + rng() * 380;
      for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(cloudGeo, cloudMat); m.position.set((j - 1.5) * 26 + rng() * 10, rng() * 8, rng() * 14); m.scale.set(26 + rng() * 22, 10 + rng() * 6, 18 + rng() * 10); g.add(m); }
      g.position.set(Math.cos(a) * r, 130 + rng() * 90, Math.sin(a) * r); scene.add(g); clouds.push(g);
    }

    /* --- arbres --- */
    treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    treeFade = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.14, depthWrite: false });
    const geos = { pine: [pineGeo(), pineGeo()], leaf: [leafGeo(0x5c9c3c, 0x4b8a36), leafGeo(0x6aa843, 0x58963a)], fall: [leafGeo(0xe0952e, 0xc9742a), leafGeo(0xd9b53a, 0xc98f2c)] };
    let tries = 0;
    while (W.trees.length < 330 && tries++ < 22000) {
      const a = rng() * U.TAU, r = Math.sqrt(rng()) * (W.R + 2), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r < 13 || inTown(x, z, 5) || nearRoad(x, z, 5) || Math.hypot(x + 4, z - 10) < 7 || nearSite(x, z, 2)) continue;
      if (U.fbm(x * 0.014 + 7, z * 0.014 + 3) < 0.5) continue;
      if (W.trees.some(t => Math.hypot(t.x - x, t.z - z) < 5.2)) continue;
      const kindN = U.vnoise(x * 0.011, z * 0.011 + 20);
      const kind = kindN > 0.52 ? 'pine' : (rng() < 0.3 ? 'fall' : 'leaf');
      const s = 0.85 + rng() * 0.7, mesh = new THREE.Mesh(geos[kind][rng() < 0.5 ? 0 : 1], treeMat);
      mesh.position.set(x, 0, z); mesh.scale.setScalar(s); mesh.rotation.y = rng() * U.TAU; mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      const t = { mesh, x, z, s, kind, r: 0.5 * s, top: (kind === 'pine' ? 6 : 5.2) * s, ry: mesh.rotation.y, ph: rng() * 6, shakeA: 0, shakeT0: 0, sdx: 0, sdz: 0, faded: false };
      W.trees.push(t); W.colliders.push({ x, z, r: t.r });
    }
    // lisière : un anneau de sapins qui ferme la plaine
    const border = new THREE.InstancedMesh(geos.pine[0], treeMat, 300), dm = new THREE.Object3D();
    for (let i = 0; i < 300; i++) {
      const a = i / 300 * U.TAU + rng() * 0.05, r = W.R + 6 + rng() * rng() * 75;
      dm.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); dm.rotation.y = rng() * 6; dm.scale.setScalar(1.1 + rng() * 1.1); dm.updateMatrix(); border.setMatrixAt(i, dm.matrix);
    }
    border.frustumCulled = false; scene.add(border);
    buildTown();

    /* --- rochers --- */
    const rockGeo = U.part(new THREE.IcosahedronGeometry(1, 0), 0x8d908a, null, 0.12);
    const rocks = new THREE.InstancedMesh(rockGeo, treeMat, 60);
    for (let i = 0; i < 60; i++) {
      let x, z; do { const a = rng() * U.TAU, r = 16 + Math.sqrt(rng()) * (W.R - 20); x = Math.cos(a) * r; z = Math.sin(a) * r; } while (inTown(x, z, 3) || nearRoad(x, z, 4) || nearSite(x, z, 0));
      const s = 0.8 + rng() * 1.6;
      dm.position.set(x, s * 0.25, z); dm.rotation.set(rng() * 3, rng() * 3, rng() * 3); dm.scale.set(s, s * (0.55 + rng() * 0.4), s * (0.8 + rng() * 0.4)); dm.updateMatrix(); rocks.setMatrixAt(i, dm.matrix);
      W.colliders.push({ x, z, r: s * 0.95, h: s * 0.75 });   // h : on peut grimper dessus
    }
    rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

    /* --- hautes herbes (cachettes) --- */
    W.patches.push({ x: 11, z: -9, r: 5.5 }, { x: -14, z: -22, r: 6.5 }, { x: 18, z: -40, r: 5 }, { x: -3, z: -86, r: 4 }, { x: 22, z: -108, r: 3.6 }, { x: 4, z: -104, r: 3.4 }, { x: 19, z: -86, r: 3.2 });
    tries = 0;
    while (W.patches.length < 46 && tries++ < 6000) {
      const a = rng() * U.TAU, r = 24 + Math.sqrt(rng()) * (W.R - 34), x = Math.cos(a) * r, z = Math.sin(a) * r, pr = 4.2 + rng() * 4;
      if (inTown(x, z, pr + 4) || nearSite(x, z, pr - 4) || W.patches.some(p => Math.hypot(p.x - x, p.z - z) < p.r + pr + 9)) continue;
      W.patches.push({ x, z, r: pr });
    }
    let nb = 0; const dens = coarse ? 1.0 : 1.5;
    W.patches.forEach(p => { p.n = Math.floor(Math.PI * p.r * p.r * dens); nb += p.n; });
    grassU = { uTime: { value: 0 }, uShock: { value: new THREE.Vector3() }, uShockAmp: { value: 0 }, uPlayer: { value: new THREE.Vector3(0, 0, 9999) } };
    const gMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    gMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, grassU);
      sh.vertexShader = 'uniform float uTime; uniform vec3 uShock; uniform float uShockAmp; uniform vec3 uPlayer;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          float hk = clamp(position.y / 1.5, 0.0, 1.0); hk *= hk;
          float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.y * 0.27) * 0.2 + sin(uTime * 3.1 + ip.x * 0.9) * 0.07;
          vec2 bend = vec2(w, w * 0.5);
          vec2 ds = ip - uShock.xy; float dl = length(ds) + 0.001;
          bend += ds / dl * exp(-pow((dl - uShock.z) / 3.0, 2.0)) * uShockAmp;
          vec2 dp = ip - uPlayer.xz; float pl = length(dp) + 0.001;
          bend += dp / pl * smoothstep(1.7, 0.0, pl) * 0.9;
          mvPosition.xz += bend * hk;
          mvPosition.y -= dot(bend, bend) * hk * 0.25;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader.split('( gl_FrontFacing )').join('( true )');
    };
    const grass = new THREE.InstancedMesh(bladeGeo(), gMat, nb), ic = new THREE.Color();
    let gi = 0;
    W.patches.forEach(p => {
      for (let i = 0; i < p.n; i++) {
        const a = rng() * U.TAU, r = Math.sqrt(rng()) * p.r, edge = 1 - Math.pow(r / p.r, 3) * 0.45;
        dm.position.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r); dm.rotation.set(0, rng() * 6, 0);
        const s = (1.05 + rng() * 0.45) * edge; dm.scale.set(1 + rng() * 0.5, s, 1 + rng() * 0.5); dm.updateMatrix(); grass.setMatrixAt(gi, dm.matrix);
        const k = rng(); ic.setRGB(U.lerp(0.5, 0.86, k), U.lerp(0.72, 0.78, k), U.lerp(0.26, 0.34, k)); grass.setColorAt(gi, ic); gi++;
      }
    });
    grass.receiveShadow = true; grass.frustumCulled = false; scene.add(grass);

    /* --- touffes et fleurs partout --- */
    const nT = coarse ? 2000 : 3800, tufts = new THREE.InstancedMesh(U.part(new THREE.ConeGeometry(0.13, 0.4, 4), 0xffffff, U.mat(0, 0.2, 0), 0), new THREE.MeshLambertMaterial({ vertexColors: true }), nT);
    for (let i = 0; i < nT; i++) {
      const a = rng() * U.TAU, r = Math.sqrt(rng()) * (W.R + 20);
      dm.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); dm.rotation.set(rng() * 0.3, rng() * 6, rng() * 0.3); const s = 0.6 + rng() * 0.8; dm.scale.set(s, s * (0.8 + rng() * 0.7), s); dm.updateMatrix(); tufts.setMatrixAt(i, dm.matrix);
      ic.setRGB(0.36 + rng() * 0.16, 0.6 + rng() * 0.14, 0.24 + rng() * 0.08); tufts.setColorAt(i, ic);
    }
    tufts.frustumCulled = false; scene.add(tufts);
    const nF = coarse ? 750 : 1500, flowers = new THREE.InstancedMesh(U.part(new THREE.OctahedronGeometry(0.16, 0), 0xffffff, U.mat(0, 0.42, 0), 0), new THREE.MeshLambertMaterial({ vertexColors: true }), nF);
    const fcol = [[1, 1, 0.92], [1, 0.84, 0.25], [0.93, 0.36, 0.3], [0.72, 0.56, 0.95], [1, 0.62, 0.78]];
    for (let i = 0; i < nF; i++) {
      // les fleurs poussent par taches
      const a = rng() * U.TAU, r = Math.sqrt(rng()) * (W.R + 10), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const k = Math.floor(U.vnoise(x * 0.03, z * 0.03) * 4.99);
      dm.position.set(x, 0, z); dm.rotation.set(0, rng() * 6, 0); const s = 0.7 + rng() * 0.8; dm.scale.set(s, s, s); dm.updateMatrix(); flowers.setMatrixAt(i, dm.matrix);
      const c = fcol[k]; ic.setRGB(c[0], c[1], c[2]); flowers.setColorAt(i, ic);
    }
    flowers.frustumCulled = false; scene.add(flowers);

    /* --- buissons à myrtilles (soin) --- */
    const bushGeo = U.merge([U.part(new THREE.IcosahedronGeometry(0.9, 0), 0x3f7a35, U.mat(0, 0.6, 0, 1, 0.8, 1)), U.part(new THREE.IcosahedronGeometry(0.65, 0), 0x4b8a3c, U.mat(0.6, 0.45, 0.3))]);
    const bP = [];
    for (let i = 0; i < 9; i++) { const a = i * 2.4, y = 0.5 + (i % 3) * 0.3; bP.push(U.part(new THREE.IcosahedronGeometry(0.15, 0), 0x5b4bd6, U.mat(Math.cos(a) * 0.75, y, Math.sin(a) * 0.75), 0.04)); }
    const berryGeo = U.merge(bP), berryMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x241a66 });
    tries = 0;
    while (W.berries.length < 26 && tries++ < 900) {
      const a = rng() * U.TAU, r = 18 + Math.sqrt(rng()) * (W.R - 28), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inTown(x, z, 3) || nearSite(x, z, 0) || W.colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2)) continue;
      const bush = new THREE.Mesh(bushGeo, treeMat), fruit = new THREE.Mesh(berryGeo, berryMat);
      bush.position.set(x, 0, z); fruit.position.set(x, 0, z); bush.castShadow = true; scene.add(bush); scene.add(fruit);
      W.berries.push({ x, z, fruit, ready: true, t: 0 });
    }
  }


  /* ---------- Val-Perdu : la ville en ruine ---------- */
  const inTown = (x, z, m = 0) => Math.hypot(x - W.town.x, z - W.town.z) < W.town.r + m;
  function nearRoad(x, z, m) {
    const ax = 0, az = 4, bx = W.town.gate.x, bz = W.town.gate.z, dx = bx - ax, dz = bz - az, k = U.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - ax - dx * k, z - az - dz * k) < m;
  }
  function buildTown() {
    const t = W.town, P = [], cols = [0xd9d2c2, 0xc9c2b2, 0xe2dac8, 0xbdb8ac];
    // un pan de mur = une boîte orientée : elle arrête les corps et, si elle est assez haute, les regards
    const wall = (x, z, len, thick, h, rot, c) => {
      P.push(U.part(new THREE.BoxGeometry(len, h, thick), c || cols[Math.floor(rng() * 4)], U.mat(x, h / 2, z, 1, 1, 1, 0, rot, 0), 0.09));
      if (rng() < 0.45) P.push(U.part(new THREE.BoxGeometry(len * 0.92, 0.22, thick * 1.2), 0x5f8f3e, U.mat(x, h + 0.08, z, 1, 1, 1, 0, rot, 0), 0.12));
      W.walls.push({ x, z, hl: len / 2, ht: thick / 2, c: Math.cos(rot), s: Math.sin(rot), h, rad: Math.hypot(len / 2, thick / 2) });
    };
    const ruin = (x1, z1, x2, z2, hb, gap = 0.12, thick = 0.9) => {
      const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / 2.8)), rot = Math.atan2(-dz, dx);
      for (let i = 0; i < n; i++) { if (rng() < gap) continue; const k = (i + 0.5) / n; wall(x1 + dx * k, z1 + dz * k, L / n + 0.03, thick, hb * (0.4 + 0.6 * rng()), rot); }
    };
    const house = (cx, cz, w, d, rot, hb = 4.8) => {
      const c = Math.cos(rot), s = Math.sin(rot), pt = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      const A = pt(-w / 2, -d / 2), B = pt(w / 2, -d / 2), C = pt(w / 2, d / 2), D = pt(-w / 2, d / 2), E = pt(-1.4, d / 2), F = pt(1.4, d / 2);
      ruin(A[0], A[1], B[0], B[1], hb); ruin(B[0], B[1], C[0], C[1], hb); ruin(D[0], D[1], A[0], A[1], hb);
      ruin(D[0], D[1], E[0], E[1], hb, 0); ruin(F[0], F[1], C[0], C[1], hb, 0);   // façade percée d'une porte
    };
    // enceinte, ouverte au sud par la porte
    for (let i = 0; i < 26; i++) {
      const a0 = i / 26 * U.TAU, a1 = (i + 1) / 26 * U.TAU;
      if (Math.abs(U.angDiff((a0 + a1) / 2, Math.PI / 2)) < 0.15 || rng() < 0.28) continue;
      ruin(t.x + Math.cos(a0) * t.r, t.z + Math.sin(a0) * t.r, t.x + Math.cos(a1) * t.r, t.z + Math.sin(a1) * t.r, 4.4, 0.08);
    }
    wall(t.gate.x - 3.8, t.gate.z, 2.2, 2.2, 7.6, 0, 0xa9a394); wall(t.gate.x + 3.8, t.gate.z, 2.2, 2.2, 6.2, 0, 0xa9a394);
    P.push(U.part(new THREE.BoxGeometry(4.6, 0.9, 1.7), 0x9d9a90, U.mat(t.gate.x - 1.9, 7.7, t.gate.z, 1, 1, 1, 0, 0, -0.12)));
    // maisons
    house(-10, -78, 9, 8, 1.75); house(-14, -96, 8, 10, 1.45); house(-9, -112, 9, 8, 1.1); house(26, -76, 9, 8, -1.3); house(30, -114, 8, 8, -0.6); house(-2, -68, 7, 6, 0.1, 3.8);
    // église : nef, clocher, cloche tombée devant le parvis
    ruin(4, -129, 16, -129, 7.5, 0); ruin(4, -129, 4, -113, 7.5); ruin(16, -129, 16, -113, 7.5); ruin(4, -113, 8.4, -113, 7, 0); ruin(11.6, -113, 16, -113, 7, 0);
    wall(1.2, -111.5, 5, 5, 17, 0, 0xa9a394);
    for (const [ox, oz] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) P.push(U.part(new THREE.BoxGeometry(1, 0.9, 1), 0x9d9a90, U.mat(1.2 + ox, 17.45, -111.5 + oz)));   // créneaux : le sommet du clocher est un perchoir
    P.push(U.part(new THREE.BoxGeometry(2.6, 0.6, 2.6), 0x9d9a90, U.mat(t.bell.x, 0.3, t.bell.z)));
    // halle : deux rangées de piliers et quelques poutres
    for (const px of [25, 35]) for (const pz of [-101, -97, -93, -89]) {
      const h = 4.2 + rng() * 1.4; P.push(U.part(new THREE.CylinderGeometry(0.55, 0.65, h, 7), 0xb9b2a3, U.mat(px, h / 2, pz))); W.colliders.push({ x: px, z: pz, r: 0.75, h });
    }
    P.push(U.part(new THREE.BoxGeometry(10.6, 0.4, 0.5), 0x6b4a2f, U.mat(30, 5.4, -101)), U.part(new THREE.BoxGeometry(10.6, 0.4, 0.5), 0x6b4a2f, U.mat(30, 5.2, -93, 1, 1, 1, 0, 0, 0.05)), U.part(new THREE.BoxGeometry(0.5, 0.4, 12.6), 0x6b4a2f, U.mat(25, 5.6, -95)));
    // fontaine
    const f = t.fountain;
    P.push(U.part(new THREE.CylinderGeometry(3, 3.3, 0.9, 12), 0xa9a394, U.mat(f.x, 0.45, f.z)), U.part(new THREE.CylinderGeometry(2.5, 2.5, 0.96, 12), 0x6f8f4e, U.mat(f.x, 0.48, f.z)), U.part(new THREE.CylinderGeometry(0.45, 0.7, 3, 8), 0xb9b2a3, U.mat(f.x, 1.5, f.z)), U.part(new THREE.CylinderGeometry(1.4, 0.4, 0.5, 10), 0xa9a394, U.mat(f.x, 3.1, f.z)));
    W.colliders.push({ x: f.x, z: f.z, r: 3.3, h: 0.95 });
    // gravats
    for (let i = 0; i < 70; i++) { const a = rng() * U.TAU, r = Math.sqrt(rng()) * (t.r - 2), s = 0.25 + rng() * 0.5; P.push(U.part(new THREE.IcosahedronGeometry(s, 0), cols[i % 4], U.mat(t.x + Math.cos(a) * r, s * 0.3, t.z + Math.sin(a) * r, 1, 0.7, 1.2, rng() * 3, rng() * 3, 0), 0.1)); }
    // campement de départ : tente, feu
    P.push(U.part(new THREE.ConeGeometry(2.4, 2.7, 4), 0xd9c48a, U.mat(-5.5, 1.35, 11, 1, 1, 1.25, 0, Math.PI / 4, 0)), U.part(new THREE.ConeGeometry(0.9, 2.0, 3), 0x3a2a1c, U.mat(-4.1, 1.0, 9.9, 0.6, 1, 0.2, 0, 0.8, 0)));
    for (let i = 0; i < 3; i++) P.push(U.part(new THREE.CylinderGeometry(0.13, 0.13, 1.3, 5), 0x5a3a22, U.mat(W.camp.x, 0.16, W.camp.z, 1, 1, 1, Math.PI / 2, i * 2.1, 0)));
    W.colliders.push({ x: -5.5, z: 11, r: 2.0 }, { x: W.camp.x, z: W.camp.z, r: 0.7, h: 0.3 });
    // des ruines partout dans la plaine : maisons, tours, aqueducs, colonnes — autant de choses à grimper
    for (const st of W.sites) {
      const c = Math.cos(st.rot), s = Math.sin(st.rot);
      if (st.kind === 0) house(st.x, st.z, 7 + rng() * 3, 6 + rng() * 3, st.rot, 3.6 + rng() * 2.4);
      else if (st.kind === 1) {
        const h = 8 + rng() * 5; wall(st.x, st.z, 4.4, 4.4, h, st.rot);
        wall(st.x + c * 3.6, st.z - s * 3.6, 2.8, 2.8, h * 0.34, st.rot); wall(st.x + s * 3.6, st.z + c * 3.6, 2.8, 2.8, h * 0.67, st.rot);
        for (const [ox, oz] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) P.push(U.part(new THREE.BoxGeometry(0.9, 0.7, 0.9), cols[1], U.mat(st.x + ox * c + oz * s, h + 0.35, st.z - ox * s + oz * c, 1, 1, 1, 0, st.rot, 0)));
      } else if (st.kind === 2) ruin(st.x - c * 13, st.z + s * 13, st.x + c * 13, st.z - s * 13, 6.6, 0.2, 1.7);
      else for (let i = 0; i < 7; i++) { const a = st.rot + i * 0.9; wall(st.x + Math.cos(a) * 6, st.z + Math.sin(a) * 6, 2, 2, 1.8 + i * 0.95, a); }
    }
    // la pierre garde un peu de clarté dans l'ombre, sinon les murs virent au kaki
    const m = new THREE.Mesh(U.merge(P), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2e2a24 })); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    // pavés et vieille route
    const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const pg = new THREE.CircleGeometry(t.r + 1.5, 56); pg.rotateX(-Math.PI / 2);
    const pp = pg.attributes.position, pc = new Float32Array(pp.count * 3), c1 = new THREE.Color(0xc2b9a6), c2 = new THREE.Color(0x93a274), cc = new THREE.Color();
    for (let i = 0; i < pp.count; i++) { cc.copy(c1).lerp(c2, U.fbm(pp.getX(i) * 0.3 + 3, pp.getZ(i) * 0.3) * (i === 0 ? 0.5 : 1)); pc[i * 3] = cc.r; pc[i * 3 + 1] = cc.g; pc[i * 3 + 2] = cc.b; }
    pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
    const pave = new THREE.Mesh(pg, flatMat); pave.position.set(t.x, 0.04, t.z); pave.receiveShadow = true; scene.add(pave);
    const rx = t.gate.x, rz = t.gate.z - 4, L = Math.hypot(rx, rz), road = new THREE.Mesh(U.part(new THREE.PlaneGeometry(4.4, L, 1, 14), 0xb89f72, new THREE.Matrix4().makeRotationX(-Math.PI / 2), 0.07), flatMat);
    road.position.set(rx / 2, 0.03, 4 + rz / 2); road.rotation.y = Math.atan2(rx, rz); road.receiveShadow = true; scene.add(road);
    // la cloche (elle tremble quand on la frappe) et la flamme du feu de camp
    const bell = new THREE.Mesh(U.merge([U.part(new THREE.CylinderGeometry(0.45, 1.15, 1.5, 10), 0xb8862e, U.mat(0, 0.75, 0), 0.06), U.part(new THREE.SphereGeometry(0.46, 8, 5), 0xa87a26, U.mat(0, 1.5, 0), 0.06), U.part(new THREE.CylinderGeometry(1.2, 1.25, 0.14, 10), 0x8a6a22, U.mat(0, 0.07, 0), 0.06)]), treeMat);
    bell.position.set(t.bell.x, 0.6, t.bell.z); bell.castShadow = true; scene.add(bell);
    W.colliders.push({ x: t.bell.x, z: t.bell.z, r: 1.3, h: 2.1 }); W.kickables.push({ id: 'bell', x: t.bell.x, z: t.bell.z, r: 2.0, y: 1.4, wob: 0, mesh: bell });
    flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 5), new THREE.MeshBasicMaterial({ color: 0xff9a3a, fog: false })); flame.position.set(W.camp.x, 0.7, W.camp.z); scene.add(flame);
  }
  // un mur coupe-t-il la ligne de vue ? (accroupi, même un muret suffit)
  // hy : hauteur du plus haut des deux (perché sur un toit, on voit par-dessus les murs)
  function blocked(ax, az, bx, bz, low, hy) {
    const minH = (low ? 1.25 : 2.3) + (hy || 0), x0 = Math.min(ax, bx), x1m = Math.max(ax, bx), z0 = Math.min(az, bz), z1m = Math.max(az, bz);
    for (const w of W.walls) {
      if (w.h < minH || w.x + w.rad < x0 || w.x - w.rad > x1m || w.z + w.rad < z0 || w.z - w.rad > z1m) continue;
      const dax = ax - w.x, daz = az - w.z, dbx = bx - w.x, dbz = bz - w.z;
      const x1 = dax * w.c - daz * w.s, z1 = dax * w.s + daz * w.c, dx = dbx * w.c - dbz * w.s - x1, dz = dbx * w.s + dbz * w.c - z1;
      let t0 = 0, t1 = 1, a, b;
      if (Math.abs(dx) < 1e-9) { if (x1 < -w.hl || x1 > w.hl) continue; } else { a = (-w.hl - x1) / dx; b = (w.hl - x1) / dx; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
      if (Math.abs(dz) < 1e-9) { if (z1 < -w.ht || z1 > w.ht) continue; } else { a = (-w.ht - z1) / dz; b = (w.ht - z1) / dz; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) continue; }
      return true;
    }
    return false;
  }
  // repousse hors des murs plus hauts que les pieds ; renvoie le sommet du plus haut mur touché (pour l'escalade)
  function collideWalls(o, r, y) {
    let top = -1; const feet = (y || 0) + 0.6;
    for (const w of W.walls) {
      if (w.h <= feet) continue;
      const dx = o.x - w.x, dz = o.z - w.z, m = w.rad + r; if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
      const lx = dx * w.c - dz * w.s, lz = dx * w.s + dz * w.c, ex = lx - U.clamp(lx, -w.hl, w.hl), ez = lz - U.clamp(lz, -w.ht, w.ht), d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      let nx, nz, pen;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; }
      else { const px = w.hl - Math.abs(lx), pz = w.ht - Math.abs(lz); if (px < pz) { nx = lx < 0 ? -1 : 1; nz = 0; pen = px + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; pen = pz + r; } }
      const mx = lx + nx * pen, mz = lz + nz * pen; o.x = w.x + mx * w.c + mz * w.s; o.z = w.z - mx * w.s + mz * w.c;
      if (w.h > top) top = w.h;
    }
    return top;
  }
  // sur quoi a-t-on les pieds : le plus haut sommet (mur, rocher, pilier) sous soi, à portée de marche
  function groundAt(x, z, y) {
    let g = 0; const feet = y + 0.6;
    for (const w of W.walls) {
      if (w.h > feet || w.h <= g) continue; const dx = x - w.x, dz = z - w.z; if (Math.abs(dx) > w.rad + 0.4 || Math.abs(dz) > w.rad + 0.4) continue;
      if (Math.abs(dx * w.c - dz * w.s) < w.hl + 0.38 && Math.abs(dx * w.s + dz * w.c) < w.ht + 0.38) g = w.h;
    }
    for (const c of W.colliders) { if (!c.h || c.h > feet || c.h <= g) continue; const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < (c.r + 0.2) * (c.r + 0.2)) g = c.h; }
    return g;
  }
  function nearSite(x, z, m) { for (const s of W.sites) if (Math.hypot(x - s.x, z - s.z) < 15 + m) return true; return false; }
  function planRuins() {
    W.sites.push({ x: -16, z: -12, kind: 3, rot: 0.4 }, { x: 24, z: -24, kind: 1, rot: 0.3 }, { x: -24, z: -44, kind: 2, rot: Math.PI / 2 }, { x: 30, z: 14, kind: 0, rot: 0.6 });
    let tries = 0;
    while (W.sites.length < 34 && tries++ < 4000) {
      const a = rng() * U.TAU, r = 34 + Math.sqrt(rng()) * (W.R - 54), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inTown(x, z, 22) || nearRoad(x, z, 16) || W.sites.some(s => Math.hypot(s.x - x, s.z - z) < 34)) continue;
      W.sites.push({ x, z, kind: W.sites.length % 4, rot: rng() * U.TAU });
    }
  }
  function setDusk(k) { duskT = k; }

  function inGrass(x, z) { for (const p of W.patches) { const dx = x - p.x, dz = z - p.z; if (dx * dx + dz * dz < (p.r - 0.4) * (p.r - 0.4)) return true; } return false; }

  // l'onde de choc traverse les herbes et secoue les arbres ; renvoie les arbres touchés
  function shock(x, z, amp, t) {
    grassU.uShock.value.set(x, z, 0); shockR = 0; shockAmp = Math.min(2.6, amp * 1.5);
    const out = [];
    for (const tr of W.trees) {
      const dx = tr.x - x, dz = tr.z - z, d = Math.hypot(dx, dz);
      if (d > 38) continue;
      tr.shakeT0 = t + d / 34; tr.shakeA = amp * 0.2 / (1 + d * 0.1); tr.sdx = dx / (d + 0.01); tr.sdz = dz / (d + 0.01);
      out.push({ tree: tr, d });
    }
    return out;
  }
  function darken(v) { darkK = Math.max(darkK, v); }
  function setMood(k) { moodT = k; }

  function update(dt, t, px, pz, cam, fx, fz) {
    // lumière qui suit le promeneur
    sunLight.target.position.set(px, 0, pz); sunLight.position.set(px + W.sunDir.x * 110, W.sunDir.y * 110, pz + W.sunDir.z * 110);
    sky.position.copy(cam.position);
    moodK = U.damp(moodK, moodT, 2.2, dt + 0.004); darkK = Math.max(0, darkK - dt * 0.9 - 0.002); duskK = U.damp(duskK, duskT, 0.5, dt + 0.002);
    sunLight.color.copy(SUN_DAY).lerp(SUN_DUSK, duskK); sunLight.intensity = 0.88 - 0.3 * duskK; hemi.intensity = 0.66 - 0.14 * duskK; sky.material.uniforms.uDusk.value = duskK;
    sky.material.uniforms.uMood.value = moodK; sky.material.uniforms.uDark.value = darkK;
    fogC.copy(FOG_CALM).lerp(FOG_HOT, moodK).lerp(FOG_DUSK, duskK * 0.8); if (darkK > 0) fogC.multiplyScalar(1 - darkK * 0.6); scene.fog.color.copy(fogC);
    grassU.uTime.value = t; grassU.uPlayer.value.set(px, 0, pz);
    shockR += 34 * dt; shockAmp *= Math.exp(-1.5 * dt); grassU.uShock.value.z = shockR; grassU.uShockAmp.value = shockAmp;
    const cxm = cam.position.x, czm = cam.position.z, sxm = fx - cxm, szm = fz - czm, sl2 = sxm * sxm + szm * szm + 1e-6, sl = Math.sqrt(sl2);
    for (const tr of W.trees) {
      let rx = Math.sin(t * 1.1 + tr.ph) * 0.012, rz = Math.cos(t * 0.9 + tr.ph) * 0.012;
      if (tr.shakeA > 0.002) {
        const k = t - tr.shakeT0;
        if (k > 0) { const w = Math.sin(k * 9) * Math.exp(-k * 2.1) * tr.shakeA + tr.shakeA * 0.5 * Math.exp(-k * 3); rx += tr.sdz * w; rz -= tr.sdx * w; if (k > 4) tr.shakeA = 0; }
      }
      tr.mesh.rotation.set(rx, tr.ry, rz);
      // un arbre entre la caméra et le promeneur devient translucide
      // (couloir entre l'objectif et le point visé, plus large tout près de l'objectif)
      const ux = tr.x - cxm, uz = tr.z - czm, u = (ux * sxm + uz * szm) / sl2, fade = u > 0.03 && u < 0.97 && Math.abs(ux * szm - uz * sxm) / sl < (u < 0.4 ? 5.2 : 3.1) * tr.s;
      if (fade !== tr.faded) { tr.faded = fade; tr.mesh.material = fade ? treeFade : treeMat; tr.mesh.castShadow = !fade; }
    }
    for (let i = 0; i < clouds.length; i++) clouds[i].position.x += dt * (1.2 + i * 0.15);
    for (const b of W.berries) { if (!b.ready && t > b.t) { b.ready = true; b.fruit.visible = true; } }
    for (const k of W.kickables) { k.wob = Math.max(0, k.wob - dt * 0.7); k.mesh.rotation.z = Math.sin(t * 13) * 0.22 * k.wob; k.mesh.rotation.x = Math.cos(t * 11) * 0.12 * k.wob; }
    flame.scale.set(1 + Math.sin(t * 17) * 0.15, 1 + Math.sin(t * 23) * 0.25, 1 + Math.cos(t * 19) * 0.15);
  }

  W.init = init; W.inGrass = inGrass; W.shock = shock; W.update = update; W.darken = darken; W.setMood = setMood; W.blocked = blocked; W.collideWalls = collideWalls; W.groundAt = groundAt; W.setDusk = setDusk; W.inTown = inTown;
  return W;
})();
