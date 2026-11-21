/* Chassé d'Ours — le promeneur et les ours : modèles facettés et animations procédurales. */
const Actors = (() => {
  'use strict';
  const lerp = U.lerp;
  const glowTex = U.radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.75)'], [0.6, 'rgba(255,255,255,.15)'], [1, 'rgba(255,255,255,0)']]);
  const box = (w, h, d, c, x, y, z) => U.part(new THREE.BoxGeometry(w, h, d), c, U.mat(x, y, z));
  function mesh(geo, mat, parent) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; }

  /* ---------- le promeneur ---------- */
  function makePlayer(o) {
    o = o || {};
    const root = new THREE.Group(), pose = new THREE.Group(); root.add(pose);
    const M = new THREE.MeshLambertMaterial({ vertexColors: true });
    const body = new THREE.Group(); body.position.y = 0.98; pose.add(body);
    mesh(U.merge([
      box(0.72, 0.82, 0.44, o.shirt || 0xc9412b, 0, 0.45, 0),           // chemise de bûcheron
      box(0.74, 0.14, 0.46, 0x3a2a1c, 0, 0.06, 0),           // ceinture
      box(0.5, 0.62, 0.28, 0xd9a441, 0, 0.5, -0.35),         // sac à dos
      box(0.52, 0.12, 0.3, 0x8a5a2a, 0, 0.84, -0.35),
      box(0.42, 0.42, 0.42, 0xf0c39a, 0, 1.1, 0.02),         // tête
      box(0.08, 0.09, 0.04, 0x1b140c, 0.11, 1.15, 0.24), box(0.08, 0.09, 0.04, 0x1b140c, -0.11, 1.15, 0.24),
      U.part(new THREE.CylinderGeometry(0.4, 0.44, 0.07, 8), 0x2f5d3a, U.mat(0, 1.32, 0.02)),   // bob
      U.part(new THREE.CylinderGeometry(0.24, 0.3, 0.2, 8), 0x356b42, U.mat(0, 1.44, 0.02)),
    ]), M, body);
    const armGeo = U.merge([box(0.2, 0.5, 0.22, o.sleeve || 0xb5381f, 0, -0.22, 0), box(0.17, 0.24, 0.18, 0xf0c39a, 0, -0.58, 0)]);
    const armA = new THREE.Group(), armB = new THREE.Group();
    armA.position.set(0.47, 0.8, 0); armB.position.set(-0.47, 0.8, 0); body.add(armA); body.add(armB);
    mesh(armGeo, M, armA); mesh(armGeo, M, armB);
    // de grosses chaussures de marche : c'est l'outil de travail
    const legGeo = U.merge([box(0.27, 0.72, 0.3, 0x34507a, 0, -0.36, 0), box(0.34, 0.3, 0.6, 0x5a3a22, 0, -0.82, 0.11), box(0.36, 0.08, 0.64, 0x1b140c, 0, -0.95, 0.11)]);
    const legA = new THREE.Group(), legB = new THREE.Group();
    legA.position.set(0.2, 0.98, 0); legB.position.set(-0.2, 0.98, 0); pose.add(legA); pose.add(legB);
    mesh(legGeo, M, legA); mesh(legGeo, M, legB);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    glow.position.set(0, -0.85, 0.1); glow.scale.setScalar(0.01); legA.add(glow);
    // silhouette : quand un mur, un arbre ou les herbes cachent le promeneur, on le devine quand même
    if (!o.remote) {   // pas de silhouette pour un adversaire : derrière un mur, il doit vraiment disparaître
    const sil = new THREE.MeshBasicMaterial({ color: 0xfff3d4, transparent: true, opacity: 0.36, depthFunc: THREE.GreaterDepth, depthWrite: false, fog: false });
    M.transparent = true; const solid = []; root.traverse(q => { if (q.isMesh) solid.push(q); });
    solid.forEach(q => { q.renderOrder = 2; const s = new THREE.Mesh(q.geometry, sil); s.renderOrder = 1; q.add(s); });
    }
    return { root, pose, body, armA, armB, legA, legB, glow, phase: 0 };
  }

  // s : { speed, crouch 0..1, charge 0..1, kick 0..1, mega }
  function animPlayer(m, s, dt, t) {
    m.phase += Math.min(s.speed, 10.5) * dt * 1.9;
    const mv = Math.min(1, s.speed / 5), sw = Math.sin(m.phase) * mv * (s.crouch > 0.5 ? 0.5 : 0.78);
    const c = s.crouch, ch = s.charge, k = s.kick, side = Math.max(ch, k), front = 1 - side;
    m.pose.rotation.y = -Math.PI / 2 * side;   // profil : le chassé part de côté, talon en avant
    const hipY = 0.98 - 0.34 * c;
    m.body.position.y = hipY + Math.abs(Math.sin(m.phase)) * 0.05 * mv - 0.06 * ch * (1 - k);
    m.body.rotation.x = (0.45 * c + 0.1 * mv + 0.32 * (s.sprint || 0)) * front;
    m.body.rotation.z = 0.3 * ch * (1 - k) + 0.62 * k;
    const ls = 1 - 0.34 * c;
    m.legA.position.y = m.legB.position.y = hipY;
    m.legB.scale.y = ls; m.legB.rotation.x = -sw * front; m.legB.rotation.z = -0.14 * side;
    m.legA.rotation.x = sw * front;
    m.legA.rotation.z = lerp(0.85 * ch, Math.PI / 2 * 1.02, k);
    m.legA.scale.y = lerp(lerp(ls, 0.7, ch), 1.2, k);
    const as = 0.9 + 0.7 * (s.sprint || 0); m.armA.rotation.x = lerp(-sw * as, -1.3, side); m.armB.rotation.x = lerp(sw * as, -1.7, side);
    m.armA.rotation.z = 0.5 * side; m.armB.rotation.z = -0.4 * side;
    if (s.climb) { const q = Math.sin(t * 16); m.body.rotation.x = -0.35; m.armA.rotation.x = -2.7 + q * 0.4; m.armB.rotation.x = -2.7 - q * 0.4; m.legA.rotation.x = q * 0.7; m.legB.rotation.x = -q * 0.7; }
    else if (s.air && side < 0.3) { m.legA.rotation.x = 0.75; m.legB.rotation.x = -0.6; m.armA.rotation.x = m.armB.rotation.x = -2.2; m.armA.rotation.z = 0.7; m.armB.rotation.z = -0.7; }
    const g = Math.max(ch * ch, k) * (s.mega ? 2.6 : 1.7) * (1 + 0.15 * Math.sin(t * 40));
    m.glow.scale.setScalar(Math.max(0.01, g));
    m.glow.material.color.setHex(s.mega ? 0x7fe9ff : (ch >= 0.99 || k > 0.5 ? 0xfff0c0 : 0xff9a3a));
  }

  /* ---------- les ours ---------- */
  const cache = {};
  function bearGeos(T) {
    if (cache[T.id]) return cache[T.id];
    const P = [], S = (r, c, x, y, z, sx = 1, sy = sx, sz = sx, ws = 7, hs = 5) => P.push(U.part(new THREE.SphereGeometry(r, ws, hs), c, U.mat(x, y, z, sx, sy, sz), 0.08));
    const c1 = T.color, c2 = T.hump || T.color;
    S(1, c1, 0, 1.38, -0.15, 1.0, 0.95, 1.55, 8, 6);       // corps
    S(0.82, c2, 0, 1.78, 0.5, 0.95, 0.85, 0.9);            // garrot
    S(0.88, c1, 0, 1.32, -1.1, 1.0, 0.95, 0.9);            // croupe
    S(0.6, c1, 0, 1.6, 1.55, 1, 0.95, 1);                  // tête
    S(0.32, T.snout, 0, 1.46, 2.05, 1, 0.8, 1.15);         // museau
    S(0.11, 0x15100c, 0, 1.54, 2.38);                      // truffe
    S(0.18, c1, 0.43, 2.1, 1.45); S(0.18, c1, -0.43, 2.1, 1.45);
    S(0.07, 0x15100c, 0.25, 1.78, 2.04); S(0.07, 0x15100c, -0.25, 1.78, 2.04);
    S(0.2, c1, 0, 1.55, -1.92);                            // queue
    if (T.helmet) { P.push(U.part(new THREE.CylinderGeometry(0.5, 0.64, 0.42, 8), 0x8a9299, U.mat(0, 2.1, 1.5), 0.05)); S(0.2, 0x8a9299, 0, 2.38, 1.5); S(0.5, 0x737b82, 0.78, 1.9, 0.5, 1, 0.5, 1.2); S(0.5, 0x737b82, -0.78, 1.9, 0.5, 1, 0.5, 1.2); }
    if (T.crown) {
      P.push(U.part(new THREE.CylinderGeometry(0.44, 0.44, 0.18, 10), 0xffc83a, U.mat(0.08, 2.14, 1.5, 1, 1, 1, 0, 0, -0.18), 0.04));
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; P.push(U.part(new THREE.ConeGeometry(0.13, 0.5, 4), 0xffc83a, U.mat(0.14 + Math.sin(a) * 0.38, 2.4, 1.5 + Math.cos(a) * 0.38), 0.04)); }
      S(0.1, 0xd8322a, 0.3, 1.72, 2.02, 0.6, 2.4, 0.6);   // la balafre
    }
    const leg = U.merge([U.part(new THREE.CylinderGeometry(0.31, 0.27, 1.0, 6), c1, U.mat(0, -0.45, 0), 0.08), U.part(new THREE.SphereGeometry(0.32, 6, 4), T.paw || c1, U.mat(0, -0.9, 0.1, 1, 0.55, 1.3), 0.08)]);
    return cache[T.id] = { body: U.merge(P), leg };
  }
  function makeBear(T) {
    const G = bearGeos(T), root = new THREE.Group(), tilt = new THREE.Group(), spin = new THREE.Group(), inner = new THREE.Group();
    root.add(tilt); tilt.add(spin); spin.position.y = 1.3; spin.add(inner); inner.position.y = -1.3;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    if (T.glow) mat.emissive.setHex(T.glow);
    mesh(G.body, mat, inner);
    const legs = [[0.55, 0.85], [-0.55, 0.85], [0.55, -1.0], [-0.55, -1.0]].map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, 1.02, z); inner.add(g); mesh(G.leg, mat, g); return g; });
    // cône de vision posé au sol : ce que l'ours peut voir, là, maintenant
    const cone = new THREE.Mesh(new THREE.CircleGeometry(1, 24, -Math.PI / 2 - 0.95, 1.9), new THREE.MeshBasicMaterial({ color: 0xfff3d4, transparent: true, opacity: 0.16, depthWrite: false, fog: false }));
    cone.rotation.x = -Math.PI / 2; cone.position.y = 0.14 / T.size; cone.renderOrder = 2; root.add(cone);
    root.scale.setScalar(T.size);
    return { root, tilt, spin, legs, mat, cone, base: new THREE.Color(T.glow || 0) };
  }

  function animBear(b, dt, t) {
    const m = b.model;
    m.root.position.set(b.x, b.y, b.z); m.root.rotation.y = b.face;
    if (b.state === 'launched') {
      m.spin.rotation.x += b.spinX * dt; m.spin.rotation.z += b.spinZ * dt;
      const sq = Math.max(0, 1 - b.lt * 5); m.spin.scale.set(1 + 0.3 * sq, 1 + 0.3 * sq, 1 - 0.4 * sq);
      m.cone.visible = false;
    } else if (b.state === 'sleep') {
      const br = Math.sin(t * 1.6 + b.phase) * 0.03;
      m.tilt.rotation.set(0, 0, 0); m.tilt.position.y = -0.52; m.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -1.35 : 1.35; });
      m.spin.scale.set(1.05, 0.9 + br, 1); m.cone.visible = false;
    } else {
      b.phase += b.sp * dt * 1.5 / b.size;
      const sw = Math.sin(b.phase) * Math.min(1, b.sp / 3) * 0.6;
      const rearT = b.state === 'alert' || b.state === 'bwind' ? 1 : (b.state === 'attack' && b.at < b.windup ? 0.6 : 0);
      b.rear = U.damp(b.rear, rearT, 9, dt);
      const strike = b.state === 'attack' && b.at >= b.windup ? Math.max(0, 1 - (b.at - b.windup) / 0.25) : 0;
      m.tilt.rotation.x = -0.85 * b.rear + 0.4 * strike;
      m.tilt.position.y = 0.8 * b.rear + Math.abs(Math.sin(b.phase)) * 0.07 * Math.min(1, b.sp / 3);
      m.tilt.rotation.z = b.state === 'stunned' || b.state === 'tired' ? Math.sin(t * 16) * 0.14 : 0;
      m.legs[0].rotation.x = lerp(sw, -1.0 + Math.sin(t * 9) * 0.25, b.rear); m.legs[1].rotation.x = lerp(-sw, -1.0 - Math.sin(t * 9) * 0.25, b.rear);
      m.legs[2].rotation.x = -sw; m.legs[3].rotation.x = sw;
      // écrasement à l'impact
      const sq = b.squash; m.spin.scale.set(1 + 0.25 * sq, 1 + 0.25 * sq, 1 - 0.35 * sq);
    }
    b.squash = Math.max(0, b.squash - dt * 6);
    m.mat.emissive.setRGB(m.base.r + b.flash, m.base.g + b.flash, m.base.b + b.flash);
  }

  return { makePlayer, animPlayer, makeBear, animBear, glowTex };
})();
