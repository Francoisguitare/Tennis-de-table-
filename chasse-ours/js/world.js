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
  const W = { R: 148, trees: [], colliders: [], patches: [], berries: [], sunDir: new THREE.Vector3(-0.62, 0.5, -0.6).normalize() };
  const rng = U.rng(20261121);
  let scene, sky, sunLight, treeMat, treeFade, grassU, clouds = [], shockR = 0, shockAmp = 0, moodK = 0, moodT = 0, darkK = 0;
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

    /* --- lumière --- */
    scene.add(new THREE.HemisphereLight(0xffeccc, 0x4a6a35, 0.66));
    sunLight = new THREE.DirectionalLight(0xffd3a0, 0.88);
    sunLight.castShadow = true;
    const sh = sunLight.shadow; sh.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sh.camera.left = -48; sh.camera.right = 48; sh.camera.top = 48; sh.camera.bottom = -48; sh.camera.near = 1; sh.camera.far = 240;
    sh.bias = -0.0006; sh.normalBias = 0.35;
    scene.add(sunLight); scene.add(sunLight.target);

    /* --- ciel --- */
    sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 14), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: W.sunDir }, uMood: { value: 0 }, uDark: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 uSun; uniform float uMood; uniform float uDark;
        void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, -0.2, 1.0);
          vec3 hor = mix(vec3(0.97,0.81,0.62), vec3(1.0,0.75,0.54), uMood);
          vec3 mid = mix(vec3(0.66,0.84,0.90), vec3(0.72,0.76,0.95), uMood);
          vec3 top = mix(vec3(0.27,0.55,0.82), vec3(0.32,0.42,0.84), uMood);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h)); c = mix(c, top, smoothstep(0.16, 0.7, h));
          float s = max(dot(d, uSun), 0.0);
          c += vec3(1.0,0.74,0.4) * (pow(s, 10.0) * 0.38 + pow(s, 500.0) * 1.6);
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
    while (W.trees.length < 185 && tries++ < 9000) {
      const a = rng() * U.TAU, r = Math.sqrt(rng()) * (W.R + 2), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r < 13) continue;
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

    /* --- rochers --- */
    const rockGeo = U.part(new THREE.IcosahedronGeometry(1, 0), 0x8d908a, null, 0.12);
    const rocks = new THREE.InstancedMesh(rockGeo, treeMat, 36);
    for (let i = 0; i < 36; i++) {
      const a = rng() * U.TAU, r = 16 + Math.sqrt(rng()) * (W.R - 20), x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.8 + rng() * 1.6;
      dm.position.set(x, s * 0.25, z); dm.rotation.set(rng() * 3, rng() * 3, rng() * 3); dm.scale.set(s, s * (0.55 + rng() * 0.4), s * (0.8 + rng() * 0.4)); dm.updateMatrix(); rocks.setMatrixAt(i, dm.matrix);
      W.colliders.push({ x, z, r: s * 0.95 });
    }
    rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

    /* --- hautes herbes (cachettes) --- */
    W.patches.push({ x: 11, z: -9, r: 5.5 }, { x: -14, z: -22, r: 6.5 });
    tries = 0;
    while (W.patches.length < 27 && tries++ < 2000) {
      const a = rng() * U.TAU, r = 24 + Math.sqrt(rng()) * (W.R - 34), x = Math.cos(a) * r, z = Math.sin(a) * r, pr = 4.2 + rng() * 4;
      if (W.patches.some(p => Math.hypot(p.x - x, p.z - z) < p.r + pr + 9)) continue;
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
    const nT = coarse ? 1400 : 2600, tufts = new THREE.InstancedMesh(U.part(new THREE.ConeGeometry(0.13, 0.4, 4), 0xffffff, U.mat(0, 0.2, 0), 0), new THREE.MeshLambertMaterial({ vertexColors: true }), nT);
    for (let i = 0; i < nT; i++) {
      const a = rng() * U.TAU, r = Math.sqrt(rng()) * (W.R + 20);
      dm.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); dm.rotation.set(rng() * 0.3, rng() * 6, rng() * 0.3); const s = 0.6 + rng() * 0.8; dm.scale.set(s, s * (0.8 + rng() * 0.7), s); dm.updateMatrix(); tufts.setMatrixAt(i, dm.matrix);
      ic.setRGB(0.36 + rng() * 0.16, 0.6 + rng() * 0.14, 0.24 + rng() * 0.08); tufts.setColorAt(i, ic);
    }
    tufts.frustumCulled = false; scene.add(tufts);
    const nF = coarse ? 500 : 950, flowers = new THREE.InstancedMesh(U.part(new THREE.OctahedronGeometry(0.16, 0), 0xffffff, U.mat(0, 0.42, 0), 0), new THREE.MeshLambertMaterial({ vertexColors: true }), nF);
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
    while (W.berries.length < 16 && tries++ < 500) {
      const a = rng() * U.TAU, r = 18 + Math.sqrt(rng()) * (W.R - 28), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (W.colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 2)) continue;
      const bush = new THREE.Mesh(bushGeo, treeMat), fruit = new THREE.Mesh(berryGeo, berryMat);
      bush.position.set(x, 0, z); fruit.position.set(x, 0, z); bush.castShadow = true; scene.add(bush); scene.add(fruit);
      W.berries.push({ x, z, fruit, ready: true, t: 0 });
    }
  }

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
    moodK = U.damp(moodK, moodT, 2.2, dt + 0.004); darkK = Math.max(0, darkK - dt * 0.9 - 0.002);
    sky.material.uniforms.uMood.value = moodK; sky.material.uniforms.uDark.value = darkK;
    fogC.copy(FOG_CALM).lerp(FOG_HOT, moodK); if (darkK > 0) fogC.multiplyScalar(1 - darkK * 0.6); scene.fog.color.copy(fogC);
    grassU.uTime.value = t; grassU.uPlayer.value.set(px, 0, pz);
    shockR += 34 * dt; shockAmp *= Math.exp(-1.5 * dt); grassU.uShock.value.z = shockR; grassU.uShockAmp.value = shockAmp;
    for (const tr of W.trees) {
      let rx = Math.sin(t * 1.1 + tr.ph) * 0.012, rz = Math.cos(t * 0.9 + tr.ph) * 0.012;
      if (tr.shakeA > 0.002) {
        const k = t - tr.shakeT0;
        if (k > 0) { const w = Math.sin(k * 9) * Math.exp(-k * 2.1) * tr.shakeA + tr.shakeA * 0.5 * Math.exp(-k * 3); rx += tr.sdz * w; rz -= tr.sdx * w; if (k > 4) tr.shakeA = 0; }
      }
      tr.mesh.rotation.set(rx, tr.ry, rz);
      // un arbre entre la caméra et le promeneur devient translucide
      // (couloir entre l'objectif et le point visé, plus large tout près de l'objectif)
      const dz = tr.z - fz, fade = dz > 0.8 && dz < 21 && Math.abs(tr.x - fx) < (dz > 11 ? 5.2 : 3.1) * tr.s;
      if (fade !== tr.faded) { tr.faded = fade; tr.mesh.material = fade ? treeFade : treeMat; tr.mesh.castShadow = !fade; }
    }
    for (let i = 0; i < clouds.length; i++) clouds[i].position.x += dt * (1.2 + i * 0.15);
    for (const b of W.berries) { if (!b.ready && t > b.t) { b.ready = true; b.fruit.visible = true; } }
  }

  W.init = init; W.inGrass = inGrass; W.shock = shock; W.update = update; W.darken = darken; W.setMood = setMood;
  return W;
})();
