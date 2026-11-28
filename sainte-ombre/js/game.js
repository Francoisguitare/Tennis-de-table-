/* Sainte-Ombre — le jeu : déplacements, lanternes, énigmes à plusieurs, apparitions, voix. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const COARSE = matchMedia('(pointer: coarse)').matches;
  const MOBILE = COARSE && Math.min(screen.width, screen.height) < 900;
  let touchMode = COARSE;

  if (typeof THREE === 'undefined') { $('loading').innerHTML = '<p>Le jeu n\'a pas pu se charger (connexion ?). Recharge la page.</p>'; return; }

  /* ---------- réglages gardés sur l'appareil ---------- */
  const SET = { sens: 1, bright: 1.0, vol: 0.9 };
  try { Object.assign(SET, JSON.parse(localStorage.getItem('ombre-set') || '{}')); } catch (_) { /* rien */ }
  const saveSet = () => { try { localStorage.setItem('ombre-set', JSON.stringify(SET)); } catch (_) { /* rien */ } };

  /* ---------- rendu ---------- */
  const canvas = $('c3d');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = SET.bright;
  renderer.autoClear = false;
  Tex.setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const DPR = window.devicePixelRatio || 1, PR_MAX = Math.min(DPR, MOBILE ? 1.6 : 2), PR_MIN = 0.5;
  let pr = Math.min(DPR, MOBILE ? 1.15 : 1.5);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x010102);
  scene.fog = new THREE.FogExp2(0x020203, 0.085);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 160); camera.rotation.order = 'YXZ';
  function resize() { renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 1 ? 82 : 72; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  scene.add(new THREE.HemisphereLight(0x2a3346, 0x120d08, 0.32));

  const myLamp = new THREE.PointLight(0xff9f55, 1.7, 11, 2); scene.add(myLamp);
  const partLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffa35c, 2.0, 11, 2); l.visible = false; scene.add(l); return l; });
  const ENV_N = MOBILE ? 3 : 5;
  const pool = []; for (let k = 0; k < ENV_N; k++) { const l = new THREE.PointLight(0xff9446, 0, 8, 2); scene.add(l); pool.push(l); }
  const gateLight = new THREE.PointLight(0xdfe8ff, 0, 9, 2); gateLight.position.set(97.2, 1.4, 57); scene.add(gateLight);

  $('grain').style.backgroundImage = `url(${Tex.grainImage()})`;

  /* ---------- état du joueur ---------- */
  const P = { x: 3, z: 3, y: 1.62, yaw: 0, pitch: 0, vx: 0, vz: 0, dist: 0, phase: 0, frozen: true, wake: 1, lamp: 1, lampT: 1, flick: 0, shake: 0, roll: 0 };
  const yawTo = (fx, fz) => Math.atan2(-fx, -fz);
  let playing = false, ending = false, startAt = 0, gameT = 0, now = 0;
  let isHost = true, solo = false, myRole = 0, roster = [{ id: 'h', role: 0, ready: true }];
  const myId = () => (Net.isHost || solo ? 'h' : Net.id());
  const need = () => Math.min(2, roster.length);
  const names = () => roster.map(r => r.role).sort().map(r => Story.NAMES[r]);

  /* ---------- l'abbaye ---------- */
  let E, abbot, vmLantern, vmRoot, vmScene, vmLight, sky, moonSpr, snow, dust, keyGrp;
  function buildWorld() {
    World.build(scene, { low: MOBILE && DPR < 2.5 && (navigator.hardwareConcurrency || 4) <= 4 });
    E = World.ents; keyGrp = E.key.grp;
    // ciel, lune
    const sk = new THREE.Mesh(new THREE.SphereGeometry(95, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: Tex.sky(), side: THREE.BackSide, fog: false }));
    sk.position.set(29, -2, 41); scene.add(sk); sky = sk;
    moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.moon(), fog: false, depthWrite: false, transparent: true })); moonSpr.position.set(52, 70, 10); moonSpr.scale.set(14, 14, 1); scene.add(moonSpr);
    // neige du préau
    const NS = MOBILE ? 380 : 700, sp = new Float32Array(NS * 3), cs = E.cloisterSky;
    for (let k = 0; k < NS; k++) { sp[k * 3] = lerp(cs.x0, cs.x1, Math.random()); sp[k * 3 + 1] = Math.random() * 11; sp[k * 3 + 2] = lerp(cs.z0, cs.z1, Math.random()); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xb8c6dc, size: 0.06, map: Tex.glow(), transparent: true, depthWrite: false, opacity: 0.85 })); snow.frustumCulled = false; scene.add(snow);
    // poussière dans la lumière de la lanterne
    const ND = 160, dp = new Float32Array(ND * 3), dc = new Float32Array(ND * 3);
    for (let k = 0; k < ND; k++) { dp[k * 3] = (Math.random() - 0.5) * 6; dp[k * 3 + 1] = Math.random() * 3; dp[k * 3 + 2] = (Math.random() - 0.5) * 6; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.022, map: Tex.glow(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); dust.frustumCulled = false; scene.add(dust);
    // l'abbé (apparitions)
    const am = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 1, transparent: true }), af = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });
    const fig = World.monk(am, af); fig.scale.setScalar(1.08); fig.visible = false; scene.add(fig);
    abbot = { fig, mats: [am, af], on: false, o: null, t: 0, seen: 0, fade: 0 };
    // la lanterne tenue en main
    vmScene = new THREE.Scene(); vmRoot = new THREE.Group(); vmScene.add(vmRoot);
    vmScene.add(new THREE.AmbientLight(0x3a2a1a, 0.35));
    vmLantern = World.lanternMesh(false); vmLantern.position.set(0.27, -0.36, -0.55); vmRoot.add(vmLantern);
    vmLight = new THREE.PointLight(0xffa35c, 1.0, 0.6, 2); vmLantern.add(vmLight);
    const front = new THREE.PointLight(0xffb070, 0.9, 1.2, 2); front.position.set(0.12, -0.2, -0.22); vmRoot.add(front);
    // la main gantée et la manche, qui sortent du bas de l'écran
    const hand = new THREE.Group(); hand.position.set(0.27, -0.15, -0.55); vmRoot.add(hand);
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.3, 4), World.M.iron); hang.position.set(0, 0.11, 0); hand.add(hang);
    vmRoot.userData.hand = hand;
    buildInteractions();
  }

  /* ---------- état partagé (tenu par celui qui a créé la partie) ---------- */
  const fresh = () => ({ v: 0, started: false, order: [0, 1, 2], syms: [0, 1, 2, 3, 4], lev: [], door1: false, door2: false, w: 0, door3: false, key: false, door4: false, door5: false, reg: false, bell: 0, bellDone: false, door6: false, gate: 0, end: false, found: [], n: 1 });
  let ST = fresh(), prev = null;
  const holds = { wA: new Set(), wB: new Set(), gate: new Set() };
  let hostT = 0, lastPush = 0, dirty = false, urgent = false, bellLast = { i: -1, id: '', t: -9 }, bellDoneT = 0, door2Pending = 0;
  function push() { ST.v++; dirty = false; lastPush = hostT; if (!solo) Net.send({ t: 'st', s: ST }); applyState(ST); }
  function hostEv(e) { e.t = 'ev'; if (!solo) Net.send(e); onEv(e); }
  function act(a, i, on) { if (isHost) hostAct(myId(), a, i, on); else Net.send({ t: 'act', id: myId(), a, i, on }); }
  function hostAct(id, a, i, on) {
    if (!ST.started || ST.end) return;
    switch (a) {
      case 'lever': {
        if (ST.door1 || ST.lev.includes(i) || !ST.door2) return;
        if (ST.syms[i] === ST.order[ST.lev.length]) { ST.lev.push(i); hostEv({ e: 'lever', i, ok: 1, n: ST.lev.length }); if (ST.lev.length === 3) ST.door1 = true; }
        else { ST.lev = []; hostEv({ e: 'lever', i, ok: 0 }); }
        break;
      }
      case 'read': if (!ST.found.includes(i)) ST.found.push(i); if (i === 'j2' && !ST.door2 && !door2Pending) door2Pending = hostT + 2.5; break;
      case 'hold': { const s = holds[i]; if (!s) return; if (on) s.add(id); else s.delete(id); return; }
      case 'key': if (!ST.key) { ST.key = true; ST.door4 = true; if (!ST.found.includes('j5')) ST.found.push('j5'); } break;
      case 'door5': if (ST.key) ST.door5 = true; break;
      case 'reg': if (!ST.reg) { ST.reg = true; if (!ST.found.includes('reg')) ST.found.push('reg'); hostEv({ e: 'reg' }); } break;
      case 'rope': {
        if (!ST.door5 || ST.bellDone) return;
        const valid = ST.bell > 0 && i !== bellLast.i && (need() < 2 || id !== bellLast.id) && hostT - bellLast.t < 2.8;
        ST.bell = valid ? ST.bell + 1 : 1; bellLast = { i, id, t: hostT };
        hostEv({ e: 'pull', i, s: ST.bell });
        if (ST.bell >= 6) { ST.bellDone = true; bellDoneT = hostT; }
        break;
      }
      default: return;
    }
    push();
  }
  // l'état partagé avance même si l'onglet de l'hôte passe en arrière-plan (images suspendues)
  let hostWall = performance.now(), frameWall = performance.now();
  function hostStep() { const t = performance.now(), dt = Math.min(1, (t - hostWall) / 1000); hostWall = t; hostTick(dt); }
  setInterval(() => { if (playing && isHost && !ending && performance.now() - frameWall > 300) hostStep(); }, 250);
  function hostTick(dt) {
    hostT += dt; if (!ST.started || ST.end) return;
    const n = need();
    if (!ST.door2 && ((door2Pending && hostT > door2Pending) || hostT > (solo ? 6 : 17))) { ST.door2 = true; dirty = urgent = true; }
    if (ST.door1 && !ST.door3) {
      const a = holds.wA.size, b = holds.wB.size;
      const on = n >= 2 ? (a > 0 && b > 0 && !(a === 1 && b === 1 && [...holds.wA][0] === [...holds.wB][0])) : a + b > 0;
      const w = clamp(ST.w + (on ? dt / 5.5 : -dt / 6), 0, 1);
      if (w !== ST.w) { ST.w = w; dirty = true; }
      if (ST.w >= 1) { ST.door3 = true; dirty = urgent = true; }
    }
    if (ST.bell > 0 && !ST.bellDone && hostT - bellLast.t > 2.8) { ST.bell = 0; dirty = true; hostEv({ e: 'bellfail' }); }
    if (ST.bellDone && !ST.door6 && hostT - bellDoneT > 5.5) { ST.door6 = true; dirty = urgent = true; }
    if (ST.door6) {
      const on = holds.gate.size >= n, gt = clamp(ST.gate + (on ? dt / 3.4 : -dt / 5), 0, 1);
      if (gt !== ST.gate) { ST.gate = gt; dirty = true; }
      if (ST.gate >= 1) { ST.end = true; dirty = urgent = true; }
    }
    if (dirty && (hostT - lastPush > 0.12 || urgent)) { urgent = false; push(); }
  }

  /* ---------- appliquer l'état : portes, leviers, sons ---------- */
  function applyState(s, quiet) {
    const p = prev || fresh(), D = World.doors;
    if (!prev || p.syms.join() !== s.syms.join() || p.order.join() !== s.order.join()) {
      E.levers.forEach((L, k) => { L.plaque.material.map = Tex.plaque(s.syms[k]); L.plaque.material.needsUpdate = true; });
      E.scratch.mesh.material.map = Tex.scratches(s.order); E.scratch.mesh.material.needsUpdate = true;
    }
    E.levers.forEach((L, k) => { L.target = s.lev.includes(k) ? 1 : 0; });
    const open = (d, on, fx) => { if (on && !p[d]) { const dd = D['d' + d.slice(4)]; dd.target = 1; if (quiet) { dd.open = 1; dd.apply(); } else fx && fx(dd); } };
    open('door1', s.door1, d => { d.speed = 0.5; Snd.creak(pos3(d.x, 1.2, d.z), 2.4, 1.3); Snd.lock(pos3(d.x, 1.2, d.z)); setTimeout(() => Snd.choir(false), 600); toast('Une serrure cède.'); });
    open('door2', s.door2, d => { d.speed = 0.22; Snd.creak(pos3(d.x, 1.2, d.z), 4.2, 1.1); if (myRole !== 0) toast('Ta porte s\'ouvre. Personne derrière.'); });
    if (!s.door3) { D.d3.speed = 1.4; D.d3.target = s.w; }
    open('door3', s.door3, d => { d.target = 1; Snd.clank(pos3(d.x, 2, d.z), true); Snd.winch(false); setTimeout(() => Snd.choir(false), 300); toast('La herse est levée.'); });
    if (s.door3 && quiet) { D.d3.open = 1; D.d3.apply(); }
    open('door4', s.door4, d => { d.speed = 0.35; Snd.grind(pos3(d.x, 1, d.z), 3.5); });
    open('door5', s.door5, d => { d.speed = 0.45; Snd.creak(pos3(d.x, 1.2, d.z), 2.6, 0.8); Snd.choir(true); });
    open('door6', s.door6, d => { d.speed = 0.4; Snd.creak(pos3(d.x, 1.2, d.z), 3, 0.7); toast('Une porte s\'est ouverte, au sud de la chapelle.'); });
    if (s.key && !p.key) { keyGrp.visible = false; if (!quiet && myRole !== keyTaker) { toast('Quelque part, un mur a bougé.'); } }
    if (s.bellDone && !p.bellDone && !quiet) bellRing();
    if (s.end && !p.end) runEnding();
    // pages trouvées par les autres
    for (const j of s.found) if (!readLocal.has(j) && !p.found.includes(j)) { $('carnet-dot').hidden = false; if (!quiet) toast('Une nouvelle page dans le carnet.'); }
    prev = JSON.parse(JSON.stringify(s));
    renderCarnet();
  }
  const pos3 = (x, y, z) => ({ x, y, z });
  let keyTaker = -1;
  function onEv(e) {
    if (e.e === 'lever') {
      const L = E.levers[e.i], p = pos3(L.pos.x, 1.3, L.pos.z);
      if (e.ok) { L.target = 1; Snd.clank(p, false); Snd.chain(p, 0.6); vib(30); }
      else { L.target = 1; setTimeout(() => { E.levers.forEach(l => { l.target = 0; }); }, 380); Snd.clank(p, true); Snd.chain(p, 1.1, 30); setTimeout(() => Snd.knock(pos3(4, 1.4, 1.2), 3), 900); vib([60, 40, 60]); toast('Tous les leviers retombent.'); }
    } else if (e.e === 'pull') {
      const R = E.ropes[e.i]; R.pull = 1; Snd.creak(pos3(R.pos.x, 3, R.pos.z), 0.8, 1.6);
      bellAmpT = e.s / 6; setTimeout(() => Snd.bell(0.15 + e.s / 6 * 0.6, pos3(54, 12, 30)), 500); vib(25);
      if (e.s >= 2 && e.s < 6) toast(['', '', 'La cloche commence à se balancer.', 'Encore.', 'Encore, sans vous arrêter.', 'Encore une fois !'][e.s]);
    } else if (e.e === 'bellfail') { bellAmpT = 0; toast('La cloche retombe. Tirez à tour de rôle, sans attendre.'); Snd.clank(pos3(54, 12, 30), false); }
    else if (e.e === 'reg') { if (zone === 'chapel') chapelScare(); }
  }

  /* ---------- interactions ---------- */
  const IA = [];
  const ia = o => { o.range = o.range || 2.0; IA.push(o); return o; };
  let readLocal = new Set(), chapelTried = false, mapOpen = false;
  function buildInteractions() {
    E.levers.forEach((L, k) => ia({ pos: L.pos, label: () => 'Tirer le levier', can: () => ST.door2 && !ST.door1 && !ST.lev.includes(k), use: () => act('lever', k) }));
    ia({ pos: E.scratch.pos, range: 2.3, label: () => 'Examiner les griffures', use: showScratches });
    ia({ pos: new THREE.Vector3(3, 1.3, 6.6), range: 2.6, cone: 0.6, label: () => 'Regarder les griffures, à travers les barreaux', can: () => solo && !ST.door1, use: showScratches });
    ia({ pos: E.winchA.pos, hold: 'wA', label: () => 'Tourner le treuil', can: () => ST.door1 && !ST.door3 });
    ia({ pos: E.winchB.pos, hold: 'wB', label: () => 'Tourner le treuil', can: () => ST.door1 && !ST.door3 });
    for (const id in E.journals) ia({ pos: E.journals[id].pos, range: 2.15, cone: 0.6, label: () => 'Lire le feuillet', use: () => readJournal(id) });
    ia({ pos: E.lecternPos, range: 2.0, label: () => 'Regarder le plan de l\'ossuaire', use: openMap });
    ia({ pos: E.key.pos, range: 1.8, cone: 0.6, label: () => 'Prendre la clé au cou de l\'abbé', can: () => !ST.key, use: takeKey });
    const d5 = World.doors.d5; ia({ pos: new THREE.Vector3(d5.x - 0.6, 1.3, d5.z), range: 2.2, label: () => 'Ouvrir la porte', can: () => !ST.door5, use: () => { if (ST.key) act('door5'); else { Snd.lock(pos3(d5.x, 1.2, d5.z)); chapelTried = true; toast('Fermée à clé.'); } } });
    ia({ pos: E.regPos, range: 2.0, label: () => 'Lire le registre', use: readRegister });
    E.ropes.forEach((R, k) => ia({ pos: R.pos, range: 1.9, cone: 0.55, label: () => 'Tirer la corde', can: () => ST.door5 && !ST.bellDone, use: () => act('rope', k) }));
    ia({ pos: E.gatePos, range: 2.6, cone: 0.5, hold: 'gate', label: () => 'Pousser le mur', can: () => ST.door6 && !ST.end });
  }
  let target = null, holding = null;
  const fwd = new THREE.Vector3();
  function findTarget() {
    if (!playing || P.frozen || overlayOpen()) return null;
    camera.getWorldDirection(fwd); let best = null, bs = -9;
    for (const o of IA) {
      if (o.can && !o.can()) continue;
      const dx = o.pos.x - camera.position.x, dy = o.pos.y - camera.position.y, dz = o.pos.z - camera.position.z, d = Math.hypot(dx, dy, dz);
      if (d > o.range) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d; if (dot < (o.cone || 0.72) - (touchMode ? 0.12 : 0)) continue;
      if (!World.los(P.x, P.z, o.pos.x, o.pos.z)) continue;
      const sc = dot - d * 0.1; if (sc > bs) { bs = sc; best = o; }
    }
    return best;
  }
  function actPress() {
    Snd.resume(); if (!playing || P.frozen) return;
    if (overlayOpen()) { closeOverlays(); return; }
    const t = target; if (!t) return;
    if (t.hold) { holding = t; holding.progT = now; act('hold', t.hold, true); $('b-act').classList.add('held'); }
    else t.use();
  }
  function actRelease() {
    if (holding) { act('hold', holding.hold, false); holding = null; }
    $('b-act').classList.remove('held');
  }

  /* ---------- feuillets, griffures, registre, carnet ---------- */
  let readerAt = 0;
  function openReader(j, extra) {
    releaseLock(); Snd.page();
    $('r-date').textContent = j.date || ''; $('r-title').textContent = j.title || '';
    const b = $('r-body'); b.innerHTML = '';
    (j.body || []).forEach(t => { const p = document.createElement('p'); p.textContent = t; b.appendChild(p); });
    if (extra) extra(b);
    $('r-sign').textContent = j.sign || ''; $('r-canvas').hidden = !j.canvas;
    $('reader').hidden = false; readerAt = performance.now();
  }
  function readJournal(id) {
    const j = Story.journal(id, names()); if (!j) return;
    openReader(j); markRead(id); act('read', id);
  }
  function markRead(id) { if (!readLocal.has(id)) { readLocal.add(id); renderCarnet(); } }
  function takeKey() { keyTaker = myRole; act('key'); Snd.breath(pos3(39, 1.2, 75.6), true); setTimeout(() => Snd.whisper(pos3(39, 1.4, 76), 2.4, 0.6), 600); P.flick = 1.2; markRead('j5'); setTimeout(() => openReader(Story.journal('j5', names())), 700); }
  function showScratches() {
    openReader({ date: 'Gravé dans la pierre', title: 'Des griffures', body: ['Des jours comptés, par paquets de cinq. Et plus bas, trois signes, tracés avec acharnement, reliés par des flèches.'], canvas: true });
    const c = $('r-canvas'), W = 600, H = 220; c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#1a1612'; x.fillRect(0, 0, W, H); x.strokeStyle = '#e8dcc4'; x.lineCap = 'round';
    ST.order.forEach((id, k) => { Tex.drawSymbol(x, id, 110 + k * 190, 110, 58, 8); });
    x.lineWidth = 4; for (const ax of [205, 395]) { x.beginPath(); x.moveTo(ax - 18, 110); x.lineTo(ax + 18, 110); x.lineTo(ax + 8, 100); x.moveTo(ax + 18, 110); x.lineTo(ax + 8, 120); x.stroke(); }
  }
  function readRegister() {
    const R = Story.register(names(), Story.NAMES[myRole]);
    openReader({ date: R.date, title: R.title }, b => {
      R.lines.forEach(l => { const p = document.createElement('p'); p.className = 'reg'; p.textContent = l; b.appendChild(p); });
      R.late.forEach(l => { const p = document.createElement('p'); p.className = 'late'; p.textContent = l; b.appendChild(p); });
      const m = document.createElement('p'); m.className = 'mine'; m.textContent = R.mine + ' ' + R.after; b.appendChild(m);
    });
    markRead('reg'); act('reg');
    setTimeout(() => Snd.whisper(pos3(P.x - 1, 1.6, P.z + 1), 1.6, 0.4), 1500);
  }
  function renderCarnet() {
    const ol = $('carnet-list'); ol.innerHTML = '';
    const ids = [...new Set([...ST.found, ...readLocal])].filter(id => Story.JTITLE[id]);
    $('carnet-empty').hidden = ids.length > 0;
    for (const id of ids) {
      const li = document.createElement('li'); li.textContent = Story.JTITLE[id];
      li.addEventListener('click', () => { $('carnet').hidden = true; if (id === 'reg') readRegister(); else readJournal(id); });
      ol.appendChild(li);
    }
  }
  const overlayOpen = () => !$('reader').hidden || !$('carnet').hidden || !$('mapov').hidden || !$('menu').hidden;
  function closeOverlays() { $('reader').hidden = true; $('carnet').hidden = true; $('menu').hidden = true; if (mapOpen) closeMap(); Snd.ui(); }

  /* ---------- le plan de l'ossuaire ---------- */
  function openMap() { releaseLock(); mapOpen = true; $('mapov').hidden = false; Snd.page(); chapter(4); markRead('map'); }
  function closeMap() { mapOpen = false; $('mapov').hidden = true; }
  function drawMap() {
    const c = $('map'), mz = World.MZ, cw = 15, chh = 14, avail = Math.min(innerWidth - 28, (innerHeight - 120) * cw / chh, 640), sc = Math.floor(avail / cw);
    if (c.width !== sc * cw) { c.width = sc * cw; c.height = sc * chh; }
    const x = c.getContext('2d'), i0 = mz.i0, j0 = mz.j0 - 2;
    const gr = x.createRadialGradient(c.width / 2, c.height / 2, 10, c.width / 2, c.height / 2, c.width * 0.7); gr.addColorStop(0, '#d8c393'); gr.addColorStop(1, '#9c7f4c');
    x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height);
    for (let j = mz.j0; j < mz.j0 + 11; j++) for (let i = i0; i < i0 + cw; i++) {
      const ch = World.ch(i, j), X = (i - i0) * sc, Y = (j - j0) * sc;
      if (ch === '#') { x.fillStyle = 'rgba(45,28,12,0.85)'; x.fillRect(X, Y, sc + 0.5, sc + 0.5); }
      else if (ch === 'x') { const g2 = x.createRadialGradient(X + sc / 2, Y + sc / 2, 1, X + sc / 2, Y + sc / 2, sc * 0.6); g2.addColorStop(0, 'rgba(10,6,4,0.95)'); g2.addColorStop(1, 'rgba(10,6,4,0)'); x.fillStyle = g2; x.fillRect(X - sc * 0.2, Y - sc * 0.2, sc * 1.4, sc * 1.4); }
    }
    x.strokeStyle = 'rgba(45,28,12,0.85)'; x.lineWidth = 2; x.beginPath(); x.moveTo((11 - i0 + 0.5) * sc, sc * 1.1); x.lineTo((11 - i0 + 0.5) * sc, sc * 1.9); x.lineTo((11 - i0 + 0.3) * sc, sc * 1.7); x.moveTo((11 - i0 + 0.5) * sc, sc * 1.9); x.lineTo((11 - i0 + 0.7) * sc, sc * 1.7); x.stroke();
    x.fillStyle = '#3a210d'; x.font = `italic ${Math.max(12, sc * 0.45)}px "IM Fell English", serif`; x.textAlign = 'center';
    x.fillText('Entrée', (11 - i0 + 0.5) * sc, sc * 0.9);
    const kx = (19 - i0 + 0.5) * sc, ky = (37 - j0 + 0.5) * sc;
    if (!ST.key) { x.strokeStyle = '#6a120a'; x.lineWidth = 3; x.beginPath(); x.moveTo(kx - sc * 0.25, ky - sc * 0.25); x.lineTo(kx + sc * 0.25, ky + sc * 0.25); x.moveTo(kx + sc * 0.25, ky - sc * 0.25); x.lineTo(kx - sc * 0.25, ky + sc * 0.25); x.stroke(); x.fillText('A.', kx, ky - sc * 0.45); }
    x.fillText('Ossuaire de Sainte-Ombre', c.width / 2, c.height - sc * 0.35);
    // les lumières qui bougent
    const pts = []; for (const o of others.values()) pts.push(o); pts.push({ x: P.x, z: P.z, yaw: P.yaw, me: true });
    for (const o of pts) {
      const ch = World.cellOf(o.x, o.z); if (!(ch === 'o' || ch === 'x')) continue;
      const X = (o.x / 2 - i0) * sc, Y = (o.z / 2 - j0) * sc, fl = 0.8 + 0.2 * Math.sin(now * 9 + X);
      const g3 = x.createRadialGradient(X, Y, 1, X, Y, sc * 0.7); g3.addColorStop(0, `rgba(255,220,140,${fl})`); g3.addColorStop(0.35, 'rgba(255,150,40,0.55)'); g3.addColorStop(1, 'rgba(255,120,20,0)');
      x.fillStyle = g3; x.beginPath(); x.arc(X, Y, sc * 0.7, 0, 7); x.fill();
      x.strokeStyle = 'rgba(80,30,5,0.9)'; x.lineWidth = 2; x.beginPath(); x.moveTo(X, Y); x.lineTo(X - Math.sin(o.yaw) * sc * 0.55, Y - Math.cos(o.yaw) * sc * 0.55); x.stroke();
    }
    const vg = x.createRadialGradient(c.width / 2, c.height / 2, c.width * 0.3, c.width / 2, c.height / 2, c.width * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,20,5,0.55)'); x.fillStyle = vg; x.fillRect(0, 0, c.width, c.height);
  }

  /* ---------- les autres lanternes ---------- */
  const others = new Map();
  function remote(id, role) {
    let o = others.get(id);
    if (!o) {
      const fig = World.monk(World.M.robe); const lan = World.lanternMesh(true); lan.position.set(0.3, 0.9, 0.36); fig.add(lan); scene.add(fig);
      o = { id, role: role == null ? 1 : role, x: 0, z: 0, y: 1.62, yaw: 0, tx: 0, tz: 0, tyaw: 0, fig, lan, lamp: 1, dist: 0, phase: 0, init: false };
      others.set(id, o); partLights.forEach((l, k) => { l.visible = k < others.size; });
    }
    if (role != null) o.role = role;
    return o;
  }
  function dropRemote(id) { const o = others.get(id); if (!o) return; scene.remove(o.fig); others.delete(id); partLights.forEach((l, k) => { l.visible = k < others.size; }); for (const k in holds) holds[k].delete(id); }
  function updateOthers(dt) {
    let k = 0;
    for (const o of others.values()) {
      const a = Math.min(1, dt * 10), ox = o.x, oz = o.z;
      o.x = lerp(o.x, o.tx, a); o.z = lerp(o.z, o.tz, a);
      let dy = o.tyaw - o.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; o.yaw += dy * a;
      const mv = Math.hypot(o.x - ox, o.z - oz); o.dist += mv; o.phase += mv * 4;
      if (o.dist > 0.8) { o.dist = 0; Snd.step(stepKind(World.cellOf(o.x, o.z)), pos3(o.x, 0.1, o.z), true); }
      o.fig.position.set(o.x, Math.abs(Math.sin(o.phase)) * 0.03, o.z); o.fig.rotation.y = o.yaw + Math.PI;
      const arms = o.fig.userData.arms; arms[0].rotation.x = Math.sin(o.phase) * 0.25; arms[1].rotation.x = -0.6;
      o.lan.rotation.z = Math.sin(now * 2 + k) * 0.08 + Math.sin(o.phase) * 0.1;
      const l = partLights[k];
      if (l) { o.lan.getWorldPosition(l.position); l.intensity = 2.0 * o.lamp * (0.9 + 0.1 * Math.sin(now * 17 + k * 3)); o.lan.userData.core.material = o.lamp > 0.3 ? World.M.lampCore : World.M.black; if (o.lan.userData.glow) o.lan.userData.glow.material.opacity = 0.55 * o.lamp; }
      k++;
    }
  }

  /* ---------- réseau ---------- */
  let sendAcc = 0;
  function sendPos(dt) {
    if (solo || !playing) return; sendAcc += dt; if (sendAcc < 1 / 12) return; sendAcc = 0;
    Net.send({ t: 'p', id: myId(), r: myRole, x: +P.x.toFixed(2), z: +P.z.toFixed(2), yw: +P.yaw.toFixed(3), l: +P.lamp.toFixed(2) });
  }
  function onData(d) {
    if (!d || !d.t) return;
    switch (d.t) {
      case 'p': { if (d.id === myId()) return; const o = remote(d.id, d.r); o.tx = d.x; o.tz = d.z; o.tyaw = d.yw; o.lamp = d.l; if (!o.init) { o.init = true; o.x = d.x; o.z = d.z; o.yaw = d.yw; } return; }
      case 'st': if (!isHost) { const first = !prev; ST = d.s; applyState(ST, first); } return;
      case 'ev': if (!isHost) onEv(d); return;
      case 'act': if (isHost) hostAct(d.id, d.a, d.i, d.on); return;
      case 'hi': if (isHost) { const r = roster.find(q => q.id === d.id); if (r) { r.ready = !!d.ready; sendLobby(); } } return;
      case 'lobby': if (!isHost) { roster = d.list; const me = roster.find(q => q.id === myId()); if (me) myRole = me.role; renderLobby(); callAll(); } return;
      case 'start': if (!isHost && !playing) { roster = d.roster; const me = roster.find(q => q.id === myId()); if (me) myRole = me.role; ST = d.s; startGame(d.sp); } return;
    }
  }
  function sendLobby() { Net.send({ t: 'lobby', list: roster }); renderLobby(); callAll(); }
  Net.on('data', onData);
  Net.on('join', id => {
    if (!Net.isHost) return; const gid = Net.gameId(id);
    if (roster.find(r => r.id === gid)) return;
    const used = roster.map(r => r.role); const role = [1, 2].find(r => !used.includes(r)); if (role == null) return;
    roster.push({ id: gid, role, ready: false }); sendLobby();
    if (playing) { setTimeout(() => { Net.send({ t: 'start', roster, s: ST, sp: [P.x, P.z] }); Net.send({ t: 'st', s: ST }); }, 400); toast('Une lanterne de plus.'); }
  });
  Net.on('leave', id => {
    const gid = Net.gameId(id);
    if (!Net.isHost) { if (gid === 'h') hostGone(); else dropRemote(gid); return; }
    roster = roster.filter(r => r.id !== gid); dropRemote(gid); sendLobby();
    const a = audios.get(gid); if (a) { a.remove(); audios.delete(gid); } outCalls.delete(gid);
    if (playing) toast('Une lanterne s\'est éteinte : quelqu\'un a quitté la partie.');
  });
  function hostGone() {
    if (ending) return;
    if (playing) { toast('La partie s\'est arrêtée : celui qui l\'avait créée est parti.'); setTimeout(() => location.reload(), 6000); }
    else lobbyStatus('La personne qui t\'invitait a fermé la page. Demande-lui un nouveau lien.');
  }

  /* ---------- voix ---------- */
  let micStream = null, micAsk = null, muted = false, meter = null;
  const outCalls = new Map(), audios = new Map();
  const UA = navigator.userAgent, isIOS = /iP(hone|od|ad)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), isAndroid = /Android/i.test(UA);
  const inApp = /; wv\)|FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|MicroMessenger|GSA\//i.test(UA);
  function micState(st, txt) { const el = $('mic-status'); el.textContent = txt; el.dataset.state = st; $('mic-enable').hidden = st === 'on'; $('b-mic').dataset.state = st === 'on' ? (muted ? 'muted' : 'on') : 'off'; }
  function micHelp(kind) {
    const H = {
      inapp: ['Le lien est ouvert dans le navigateur d\'une appli (WhatsApp, Messenger…), qui ne donne pas accès au micro.', isIOS ? 'Touche les trois points ou l\'icône boussole, puis « Ouvrir dans Safari ».' : 'Touche le menu ⋮ en haut à droite, puis « Ouvrir dans Chrome ».'],
      denied: isIOS ? ['Le micro est bloqué pour ce site.', 'Dans Safari, touche « aA » à gauche de l\'adresse, puis « Réglages du site web » → Micro → Autoriser. Puis touche Recharger.'] : ['Le micro est bloqué pour ce site.', 'Touche le cadenas à gauche de l\'adresse → Autorisations → Micro → Autoriser. Puis touche Recharger.'],
      nomic: ['Aucun micro n\'a été trouvé sur cet appareil.', 'Branche un casque avec micro, puis réessaie.'],
      busy: ['Le micro est déjà utilisé par une autre appli (appel, dictée…).', 'Ferme-la, puis touche « Activer le micro ».'],
      insecure: ['Ce navigateur ne donne pas accès au micro.', isAndroid ? 'Ouvre le lien dans Chrome.' : 'Ouvre le lien dans Safari ou Chrome.'],
    }[kind];
    const box = $('mic-help'); box.hidden = !H; if (!H) return;
    $('mic-help-what').textContent = H[0]; $('mic-help-how').textContent = H[1]; $('mic-reload').hidden = kind !== 'denied';
  }
  async function enableMic() {
    if (micStream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) { micState('off', 'Micro indisponible'); micHelp(inApp ? 'inapp' : 'insecure'); return false; }
    micState('wait', 'Autorise le micro dans la fenêtre du navigateur…');
    try { micAsk = micAsk || navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); micStream = await micAsk; }
    catch (e) {
      micAsk = null; const n = e && e.name;
      if (n === 'NotFoundError' || n === 'OverconstrainedError') { micState('off', 'Pas de micro'); micHelp('nomic'); }
      else if (n === 'NotReadableError' || n === 'AbortError') { micState('off', 'Micro occupé'); micHelp('busy'); }
      else { micState('off', 'Micro refusé'); micHelp(inApp ? 'inapp' : 'denied'); }
      return false;
    }
    micState('on', 'Micro prêt : parle, tu dois voir la barre bouger'); micHelp(null); startMeter(); setMute(false); callAll();
    return true;
  }
  function callAll() { if (!micStream || solo) return; for (const r of roster) { if (r.id === myId() || outCalls.has(r.id)) continue; const c = Net.call(r.id, micStream); if (c) { outCalls.set(r.id, c); const rm = () => outCalls.delete(r.id); c.on('close', rm); c.on('error', rm); } } }
  Net.on('call', c => {
    try { c.answer(); } catch (_) { return; }
    c.on('stream', st => { const id = Net.gameId(c.peer); let a = audios.get(id); if (!a) { a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); document.body.appendChild(a); audios.set(id, a); } a.srcObject = st; const p = a.play(); if (p && p.catch) p.catch(() => { }); });
  });
  addEventListener('pointerdown', () => { for (const a of audios.values()) if (a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => { }); } Snd.resume(); }, true);
  function startMeter() {
    try {
      const ctx = Snd.ctx || new (window.AudioContext || window.webkitAudioContext)(), an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(micStream).connect(an); const buf = new Uint8Array(an.fftSize);
      meter = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); return m / 128; };
    } catch (_) { meter = null; }
  }
  let meterK = 0;
  function tickMeter(dt) {
    if (!meter) return; const lv = muted ? 0 : meter(); meterK = Math.max(lv, meterK - dt * 1.5);
    const w = Math.min(1, meterK * 2.2); $('mic-level-fill').style.width = Math.round(w * 100) + '%'; $('b-mic').style.setProperty('--lv', w.toFixed(2));
  }
  function setMute(m) { muted = m; if (micStream) micStream.getAudioTracks().forEach(t => { t.enabled = !m; }); $('b-mic').dataset.state = micStream ? (m ? 'muted' : 'on') : 'off'; }
  $('mic-enable').addEventListener('click', () => { Snd.resume(); enableMic(); });
  $('mic-reload').addEventListener('click', () => location.reload());
  $('b-mic').addEventListener('click', async () => { if (solo) { toast('Seul, personne ne t\'entend.'); return; } if (!micStream) { if (await enableMic()) toast('Micro ouvert.'); else toast($('mic-status').textContent); return; } setMute(!muted); toast(muted ? 'Micro coupé.' : 'Micro ouvert.'); });

  /* ---------- salon ---------- */
  let lobbyRole = 'host', guestReady = false;
  function showLobby(role) { lobbyRole = role; $('title').hidden = true; $('lobby').hidden = false; $('invite').hidden = true; renderLobby(); }
  function lobbyStatus(t) { $('lobby-status').textContent = t; }
  function renderLobby() {
    const ul = $('lobby-list'); ul.innerHTML = '';
    for (const r of [...roster].sort((a, b) => (a.id === 'h' ? -1 : b.id === 'h' ? 1 : a.role - b.role))) {
      const li = document.createElement('li'), me = r.id === myId();
      li.innerHTML = `<span>Lanterne ${roster.indexOf(r) + 1}${me ? ' <b>· toi</b>' : ''}${r.id === 'h' ? ' (a créé la partie)' : ''}</span><span class="${r.ready || r.id === 'h' ? 'ready' : ''}">${r.id === 'h' || r.ready ? 'prêt' : 'pas encore prêt'}</span>`;
      ul.appendChild(li);
    }
    const go = $('lobby-go');
    if (lobbyRole === 'host') { const n = roster.length, allReady = roster.every(r => r.id === 'h' || r.ready); go.textContent = 'Entrer dans l\'abbaye'; go.disabled = !(n >= 2 && allReady); if (n < 2) lobbyStatus('En attente d\'une autre lanterne…'); else if (!allReady) lobbyStatus('Attends que tout le monde soit prêt.'); else lobbyStatus('Tout le monde est prêt.'); }
    else { go.textContent = guestReady ? 'Prêt ✓ (en attente)' : 'Je suis prêt'; go.disabled = !Net.count; }
  }
  $('lobby-go').addEventListener('click', () => {
    Snd.resume();
    if (lobbyRole === 'host') { hostStart(); return; }
    guestReady = !guestReady; Net.send({ t: 'hi', id: myId(), ready: guestReady }); renderLobby();
  });
  $('lobby-back').addEventListener('click', () => location.replace(location.pathname + location.search));
  function hostGame() {
    Snd.resume(); isHost = true; solo = false; myRole = 0; roster = [{ id: 'h', role: 0, ready: true }]; showLobby('host'); lobbyStatus('Ouverture du salon…');
    if (!Net.available()) { lobbyStatus('Ce navigateur ne permet pas de jouer à plusieurs. Essaie avec Chrome ou Safari à jour.'); return; }
    Net.host((err, code) => {
      if (err) { lobbyStatus('Impossible d\'ouvrir le salon : le service qui relie les navigateurs ne répond pas. Vérifie ta connexion, puis réessaie.'); return; }
      const link = location.origin + location.pathname + location.search + '#j-' + code;
      $('invite-link').value = link; $('invite-code').textContent = code; $('invite').hidden = false; $('invite-share').hidden = !navigator.share; renderLobby();
    });
  }
  const shareText = () => `Viens avec moi dans Sainte-Ombre (énigmes et épouvante, à deux, au micro). Mets un casque : ${$('invite-link').value}`;
  $('invite-copy').addEventListener('click', () => {
    const inp = $('invite-link'), ok = () => { $('invite-copy').textContent = 'Copié'; };
    const sel = () => { inp.focus(); inp.select(); inp.setSelectionRange(0, 9999); let done = false; try { done = document.execCommand('copy'); } catch (_) { /* rien */ } if (done) ok(); else $('invite-copy').textContent = 'Sélectionné'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(shareText()).then(ok).catch(sel); else sel();
  });
  $('invite-share').addEventListener('click', () => { navigator.share({ title: 'Sainte-Ombre', text: shareText() }).catch(() => { }); });
  function joinGame(code) {
    Snd.resume(); isHost = false; solo = false; showLobby('guest'); lobbyStatus('Connexion à la partie…'); $('lobby-title').textContent = 'On t\'attend';
    if (!Net.available()) { lobbyStatus('Ce navigateur ne permet pas de jouer à plusieurs. Essaie avec Chrome ou Safari à jour.'); return; }
    Net.join(code, err => {
      if (err) { lobbyStatus('Partie introuvable : le lien a expiré, ou la personne qui t\'invite a fermé la page. Demande-lui un nouveau lien.'); return; }
      lobbyStatus('Connecté. Active ton micro, puis dis que tu es prêt.'); Net.send({ t: 'hi', id: myId(), ready: guestReady }); renderLobby();
    });
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function newPuzzle() { const s = fresh(); s.syms = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 5); s.order = shuffle(s.syms.slice()).slice(0, 3); s.started = true; s.n = roster.length; return s; }
  function hostStart() { ST = newPuzzle(); hostT = 0; Net.send({ t: 'start', roster, s: ST }); startGame(); }
  function soloStart() { Snd.resume(); isHost = true; solo = true; myRole = 1; roster = [{ id: 'h', role: 1, ready: true }]; ST = newPuzzle(); hostT = 0; $('title').hidden = true; startGame(); }

  /* ---------- début de partie ---------- */
  function startGame(sp) {
    $('lobby').hidden = true; $('title').hidden = true; abbot.fig.visible = false; abbot.on = false;
    const s = myRole === 0 ? E.spawnA : myRole === 1 ? E.spawnB : E.spawnC;
    P.x = s.x; P.z = s.z; P.yaw = myRole === 0 ? yawTo(1, 0.35) : yawTo(-1, -0.4); P.pitch = 0;
    if (sp && ST.door2) { P.x = sp[0] + 0.8; P.z = sp[1] + 0.4; P.yaw = yawTo(-0.8, -0.4); }
    prev = null; applyState(ST, true); renderCarnet();
    playing = true; P.frozen = true; P.wake = 0; startAt = performance.now();
    const lines = Story.INTRO(!solo); const el = $('intro'); el.innerHTML = ''; el.hidden = false; Snd.silence(true);
    let k = 0, skip = false; const sm = document.createElement('small'); sm.textContent = 'Toucher pour passer'; el.appendChild(sm);
    const p = document.createElement('p'); el.appendChild(p);
    const next = () => {
      if (skip) return;
      if (k >= lines.length) { finishIntro(); return; }
      p.classList.remove('on'); setTimeout(() => { if (skip) return; p.textContent = lines[k++]; p.classList.add('on'); setTimeout(next, k === lines.length ? 4200 : 2900); }, 700);
    };
    const finishIntro = () => { skip = true; el.hidden = true; el.onclick = null; $('hud').hidden = false; Snd.silence(false); Snd.toll(true); P.wake = 0.001; chapter(1); setHudMode(); if (!touchMode) $('relock').hidden = false; };
    el.onclick = finishIntro;
    setTimeout(next, 600);
  }

  /* ---------- chapitres, objectifs, indices ---------- */
  const chapters = new Set();
  function chapter(n) {
    if (chapters.has(n) || !playing) return; chapters.add(n);
    const el = $('chapter'); el.hidden = true; void el.offsetWidth; el.querySelector('small').textContent = Story.ROMAN[n]; el.querySelector('h2').textContent = Story.CHAPTERS[n]; el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 5600);
  }
  let objKey = '', objT = 0, objShown = '';
  function objective() {
    const so = need() < 2, inMaze = zone === 'maze';
    if (!ST.door1 && myRole === 0) return ['cellA', 'Sortir de la cellule.', [[45, 'Des griffures, sur le mur près de la grille. Quelqu\'un les a laissées avant toi.'], [100, 'L\'autre ne peut pas voir les signes. Décris-les-lui, dans l\'ordre.']]];
    if (!ST.door2) return ['cellB', 'Où es-tu ?', [[8, 'Une lumière, de l\'autre côté de la grille.']]];
    if (!ST.door1) return ['lev', so ? 'Ouvrir la cellule voisine.' : 'Ouvrir la cellule de l\'autre.', so ? [[25, 'Des griffures, dans la cellule voisine : regarde à travers ses barreaux.']] : [[35, 'Les leviers du couloir portent des signes.'], [80, 'Demande à l\'autre ce qu\'il voit dans sa cellule. L\'ordre compte.']]];
    if (!ST.door3) return ['herse', 'Lever la herse, au bout du couloir.', so ? [[25, 'Tiens le treuil jusqu\'à ce que la herse soit en haut.']] : [[30, 'Un treuil seul ne suffit pas.'], [60, 'Un treuil chacun, en même temps. Ne lâchez pas.']]];
    if (!ST.key) {
      if (mapOpen) return ['nav', 'Guider l\'autre dans l\'ossuaire.', [[35, 'Le plan est vu d\'en haut. Dis-lui à gauche, à droite, tout droit, en suivant sa lumière.']]];
      if (inMaze) return ['maze', so ? 'Trouver l\'abbé, au fond de l\'ossuaire.' : 'Écoute l\'autre : il voit le plan.', so ? [[50, 'Le plan est au scriptorium : regarde-le avant de descendre.']] : [[50, 'Évite les souffles froids : l\'autre les voit sur le plan.']]];
      return ['cloitre', chapelTried ? 'Trouver la clé de la chapelle.' : 'Explorer le cloître.', [[90, 'Les pages du journal parlent de l\'abbé, de sa clé, de l\'ossuaire.'], [160, so ? 'Le plan de l\'ossuaire est au scriptorium, à l\'ouest du cloître. L\'ossuaire est au sud.' : 'Le plan est au scriptorium, à l\'ouest. L\'un regarde le plan, l\'autre descend à l\'ossuaire, au sud.']]];
    }
    if (!ST.door5) return ['chap', 'Ouvrir la chapelle, à l\'est du cloître.', [[50, 'La porte de bois, au milieu de la galerie est.']]];
    if (!ST.bellDone) return ['bell', 'Sonner la cloche.', so ? [[30, 'Une corde, puis l\'autre, sans attendre.']] : [[40, 'Les cordes pendent dans le clocher, au nord de la chapelle. Une chacun.'], [80, 'Tirez à tour de rôle, sans attendre : toi, l\'autre, toi, l\'autre… six fois.']]];
    if (!ST.door6) return ['wait', 'La cloche a sonné.', []];
    return ['gate', so ? 'Atteindre la grande porte.' : 'Atteindre la grande porte. Restez ensemble.', so ? [[50, 'Pousse le mur.']] : [[50, 'Vos lanternes ne brûlent qu\'ensemble.'], [90, 'Poussez le mur à deux, en même temps.']]];
  }
  function tickObjective(dt) {
    const [k, txt, hints] = objective();
    if (k !== objKey) { objKey = k; objT = 0; $('obj-text').textContent = txt; $('obj-hint').classList.remove('on'); $('obj').style.opacity = 1; objShown = ''; }
    else $('obj-text').textContent = txt;
    objT += dt; let h = '';
    for (const [t, s] of hints) if (objT > t) h = s;
    if (h !== objShown) { objShown = h; const el = $('obj-hint'); el.classList.remove('on'); if (h) setTimeout(() => { el.textContent = h; el.classList.add('on'); }, 400); }
  }
  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); toastT = 3.6; }
  const vib = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* rien */ } };

  /* ---------- apparitions et frissons ---------- */
  function showAbbot(x, z, o) {
    const f = abbot.fig; f.position.set(x, 0, z); f.visible = true; abbot.on = true; abbot.o = o || {}; abbot.t = 0; abbot.seen = 0; abbot.fade = 1; abbot.gone = false;
    const dx = P.x - x, dz = P.z - z; f.rotation.y = Math.atan2(dx, dz);
    abbot.mats.forEach(m => { m.opacity = 1; });
  }
  function vanishAbbot() { if (!abbot.on || abbot.gone) return; abbot.gone = true; Snd.vanish(pos3(abbot.fig.position.x, 1.5, abbot.fig.position.z)); P.flick = 0.5; if (abbot.o.onGone) abbot.o.onGone(); }
  function updateAbbot(dt) {
    if (!abbot.on) return; const f = abbot.fig, o = abbot.o; abbot.t += dt;
    if (o.walk && !abbot.gone) { const [tx, tz, sp] = o.walk, dx = tx - f.position.x, dz = tz - f.position.z, d = Math.hypot(dx, dz); if (d > 0.05) { f.position.x += dx / d * sp * dt; f.position.z += dz / d * sp * dt; f.rotation.y = Math.atan2(dx, dz); f.position.y = Math.abs(Math.sin(abbot.t * 5)) * 0.02; } else vanishAbbot(); }
    const dx = f.position.x - camera.position.x, dz = f.position.z - camera.position.z, d = Math.hypot(dx, dz);
    camera.getWorldDirection(fwd); const dot = (dx * fwd.x + dz * fwd.z) / (d * Math.hypot(fwd.x, fwd.z) + 1e-6);
    if (dot > 0.9 && World.los(P.x, P.z, f.position.x, f.position.z)) abbot.seen += dt;
    if (!abbot.gone && ((o.look && abbot.seen > o.look) || (o.near && d < o.near) || (o.max && abbot.t > o.max))) vanishAbbot();
    if (abbot.gone) { abbot.fade -= dt * 3; abbot.mats.forEach(m => { m.opacity = Math.max(0, abbot.fade); }); f.position.y += dt * 0.3; if (abbot.fade <= 0) { abbot.on = false; f.visible = false; } }
  }
  const lightOff = (tags, dur) => { for (const L of World.lights) if (tags.some(t => L.tag.startsWith(t))) L.offUntil = now + dur; };
  function chapelScare() {
    lightOff(['altar', 'chap'], 2.6); P.dim = now + 2.6; Snd.stinger(true); vib([80, 60, 120]);
    Snd.whisper(pos3(63, 1.6, 41), 2.2, 0.55);
    setTimeout(() => { const a = E.abbot.altar; showAbbot(a.x, a.z, { max: 0.9 }); }, 2500);
  }
  function bellRing() {
    bellAmpT = 1; Snd.bell(1, pos3(54, 12, 30)); setTimeout(() => Snd.bell(1, pos3(54, 12, 30)), 2600); setTimeout(() => Snd.bell(0.8, pos3(54, 12, 30)), 5200);
    P.shake = 1.4; vib([200, 100, 300]); toast('La cloche sonne. Toute l\'abbaye tremble.');
    setTimeout(() => { Snd.collapse(pos3(98, 1, 57)); toast('Très loin, un mur se fend.'); }, 3500);
  }
  let trapT = 0;
  function trap() {
    if (trapT > now) return; trapT = now + 4; P.frozen = true; P.lampT = 0; Snd.breath(pos3(P.x, 1.6, P.z - 0.5), false); Snd.stinger(false); vib([100, 50, 100]);
    $('black').classList.add('on');
    setTimeout(() => { const m = E.mazeStart; P.x = m.x; P.z = m.z; P.yaw = m.yaw; P.pitch = 0; P.vx = P.vz = 0; }, 1300);
    setTimeout(() => { $('black').classList.remove('on'); P.frozen = false; P.lampT = 1; toast(need() < 2 ? 'Un souffle froid. Te revoilà à l\'entrée.' : 'Un souffle froid. Te revoilà à l\'entrée. Écoute l\'autre.'); }, 2300);
  }
  const done = new Set();
  const inRect = (x0, z0, x1, z1) => P.x > x0 && P.x < x1 && P.z > z0 && P.z < z1;
  const TRIG = [
    { id: 'knockA', when: () => myRole === 0 && gameT > 10, fire: () => Snd.knock(pos3(1.9, 1.5, 4.2), 3) },
    { id: 'whB', when: () => myRole !== 0 && gameT > 6, fire: () => Snd.whisper(pos3(12.2, 1.5, 2.5), 2, 0.3) },
    { id: 'corr', when: () => P.z > 8.1 && P.x < 14 && ST.door2, fire: () => { showAbbot(31, 9, { walk: [31, 15, 1.2], max: 7 }); for (let k = 0; k < 4; k++) setTimeout(() => Snd.step('stone', pos3(31, 0.1, 9 + k * 1.2)), 400 + k * 600); } },
    { id: 'winch', when: () => inRect(24, 18, 36, 24), fire: () => { chapter(2); Snd.puff(pos3(27, 2.4, 18.4)); lightOff(['winch'], 1.2); } },
    { id: 'clo', when: () => zone === 'cloister', fire: () => { chapter(3); Snd.musicBox(pos3(29, 0.8, 41), true); const a = E.abbot.cloister; setTimeout(() => showAbbot(a.x, a.z, { look: 1.1, near: 7, max: 30, onGone: () => Snd.musicBox(null, false) }), 1500); } },
    { id: 'j3', when: () => Math.hypot(P.x - 23, P.z - 30.5) < 2.6, fire: () => Snd.knock(pos3(23, 1.5, 29.6), 3) },
    { id: 'scr', when: () => inRect(6, 34, 16, 48), fire: () => Snd.falls(pos3(6.4, 1.6, 44)) },
    { id: 'well', when: () => done.has('clo') && gameT > 0 && Math.hypot(P.x - 29, P.z - 41) < 3.2 && !abbot.on, fire: () => { Snd.musicBox(pos3(29, 0.3, 41), true); setTimeout(() => Snd.musicBox(null, false), 9000); } },
    { id: 'maze', when: () => zone === 'maze', fire: () => { chapter(4); Snd.stinger(false); } },
    { id: 'chap', when: () => zone === 'chapel', fire: () => { chapter(5); } },
    { id: 'nave', when: () => zone === 'nave', fire: () => { chapter(6); Snd.stinger(false); } },
    { id: 'gateA', when: () => zone === 'nave' && P.x > 80, fire: () => { const a = E.abbot.gate; showAbbot(a.x, a.z, { near: 7, look: 2.2, max: 40 }); Snd.whisper(pos3(a.x, 1.6, a.z), 2.5, 0.6); } },
  ];
  let ambT = 25, mazeT = 8;
  function tickScares(dt) {
    for (const t of TRIG) if (!done.has(t.id) && t.when()) { done.add(t.id); t.fire(); }
    ambT -= dt;
    if (ambT < 0) {
      ambT = 30 + Math.random() * 35; const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 5, p = pos3(P.x + Math.cos(a) * r, 1.5, P.z + Math.sin(a) * r), k = Math.random();
      if (k < 0.3) Snd.knock(p, 3); else if (k < 0.55) Snd.whisper(p, 1.8, 0.25); else if (k < 0.75) Snd.creak(p, 1.4, 0.9); else for (let q = 0; q < 3; q++) setTimeout(() => Snd.step('stone', pos3(P.x - Math.sin(P.yaw) * -3, 0.1, P.z - Math.cos(P.yaw) * -3), true), q * 650);
    }
    if (zone === 'maze') { mazeT -= dt; if (mazeT < 0) { mazeT = 11 + Math.random() * 12; const a = Math.random() * Math.PI * 2; Snd.knock(pos3(P.x + Math.cos(a) * 3.5, 1.4, P.z + Math.sin(a) * 3.5), 3); } if (World.cellOf(P.x, P.z) === 'x') trap(); }
  }

  /* ---------- fin ---------- */
  const debris = [];
  function runEnding() {
    if (ending) return; ending = true; actRelease(); P.frozen = true; $('b-act').hidden = true; $('prompt').hidden = true; $('holdbar').hidden = true;
    const d = World.doors.d7; d.target = 1; d.open = 1; d.apply(); Snd.collapse(pos3(98, 1.2, 57)); Snd.choir(false); P.shake = 2; vib([300, 100, 400]);
    for (let k = 0; k < 36; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.12), World.M.bricks); m.position.set(98 + Math.random() * 0.3, 0.2 + Math.random() * 2.1, 56.4 + Math.random() * 1.2); scene.add(m); debris.push({ m, vx: 1 + Math.random() * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 2, r: Math.random() * 6 }); }
    gateLight.intensity = 6; gateLight.distance = 30;
    const fl = $('flash'); setTimeout(() => { fl.style.opacity = 1; }, 1600);
    endWalk = now + 1.2;
    setTimeout(showEndText, 4600);
  }
  let endWalk = 0;
  function showEndText() {
    $('hud').hidden = true; const el = $('ending'), box = $('end-in'); box.innerHTML = ''; el.hidden = false; $('flash').style.transition = 'opacity 3s'; $('flash').style.opacity = 0;
    const lines = Story.ENDING(roster.length, names()); let k = 0;
    const p = document.createElement('p'); box.appendChild(p);
    const next = () => {
      if (k < lines.length) { p.classList.remove('on'); setTimeout(() => { p.textContent = lines[k++]; p.classList.add('on'); setTimeout(next, 4600); }, 900); return; }
      const min = Math.floor((performance.now() - startAt) / 60000), sec = Math.floor((performance.now() - startAt) / 1000) % 60;
      box.innerHTML = `<h1>Sainte-Ombre</h1><p class="on">Fin.</p><p class="on stats">${roster.length > 1 ? 'Frères ' + Story.list(names()) : 'Frère ' + names()[0]} · ${min} min ${String(sec).padStart(2, '0')} s · ${[...readLocal].filter(id => Story.JTITLE[id]).length} pages lues</p>`;
      const row = document.createElement('div'); row.className = 'row'; const b = document.createElement('button'); b.className = 'btn big'; b.textContent = 'Revenir au début'; b.onclick = () => location.replace(location.pathname + location.search); row.appendChild(b); box.appendChild(row);
    };
    next();
  }

  /* ---------- commandes ---------- */
  const keys = new Set();
  const typing = e => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  addEventListener('keydown', e => {
    if (typing(e)) return; keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat || !playing) return;
    if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Space' || e.code === 'Enter') { if (overlayOpen()) { closeOverlays(); return; } actPress(); }
    if (e.code === 'KeyJ' || e.code === 'Tab') toggleCarnet();
    if (e.code === 'KeyM') $('b-mic').click();
    if (e.code === 'Escape' && overlayOpen()) closeOverlays();
  });
  addEventListener('keyup', e => { keys.delete(e.code); if (['KeyE', 'KeyF', 'Space', 'Enter'].includes(e.code)) actRelease(); });
  addEventListener('blur', () => { keys.clear(); actRelease(); });
  const touch = $('touch');
  let joyId = null, lookId = null, joy0 = { x: 0, y: 0 }, joyV = { x: 0, y: 0 }, lookLast = { x: 0, y: 0 }, lockedByUs = false;
  const locked = () => document.pointerLockElement === touch;
  function lock() { if (touchMode || !touch.requestPointerLock) return; try { const r = touch.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (_) { /* rien */ } }
  function releaseLock() { if (document.pointerLockElement) { lockedByUs = true; document.exitPointerLock(); } }
  document.addEventListener('pointerlockchange', () => {
    const on = locked(); $('relock').hidden = on || touchMode || !playing || ending;
    if (!on) { actRelease(); if (!lockedByUs && playing && !overlayOpen() && !ending) { $('menu').hidden = false; } lockedByUs = false; }
  });
  function setHudMode() { $('prompt').querySelector('kbd').hidden = touchMode; $('menu-keys').hidden = touchMode; if (touchMode) $('relock').hidden = true; }
  touch.addEventListener('pointerdown', e => {
    Snd.resume();
    if (e.pointerType === 'mouse') { if (touchMode) { touchMode = false; setHudMode(); } if (!locked()) lock(); else if (e.button === 0) actPress(); return; }
    if (!touchMode) { touchMode = true; setHudMode(); }
    e.preventDefault();
    if (e.clientX < innerWidth * 0.42 && joyId === null) { joyId = e.pointerId; joy0 = { x: e.clientX, y: e.clientY }; joyV = { x: 0, y: 0 }; const j = $('joy'); j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; j.hidden = false; j.firstElementChild.style.transform = ''; }
    else if (lookId === null) { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; }
    try { touch.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
  });
  touch.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { if (locked() && playing && !P.frozen) { P.yaw -= e.movementX * 0.0022 * SET.sens; P.pitch = clamp(P.pitch - e.movementY * 0.0022 * SET.sens, -1.4, 1.4); } return; }
    if (e.pointerId === joyId) { let dx = e.clientX - joy0.x, dy = e.clientY - joy0.y; const m = Math.hypot(dx, dy), R = 52; if (m > R) { dx *= R / m; dy *= R / m; } joyV = { x: dx / R, y: dy / R }; $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; }
    else if (e.pointerId === lookId && playing && !P.frozen) { const dx = e.clientX - lookLast.x, dy = e.clientY - lookLast.y; lookLast = { x: e.clientX, y: e.clientY }; P.yaw -= dx * 0.0052 * SET.sens; P.pitch = clamp(P.pitch - dy * 0.0042 * SET.sens, -1.3, 1.3); }
  });
  const tEnd = e => { if (e.pointerType === 'mouse') { if (e.button === 0) actRelease(); return; } if (e.pointerId === joyId) { joyId = null; joyV = { x: 0, y: 0 }; $('joy').hidden = true; } if (e.pointerId === lookId) lookId = null; };
  touch.addEventListener('pointerup', tEnd); touch.addEventListener('pointercancel', tEnd);
  touch.addEventListener('contextmenu', e => e.preventDefault());
  const ba = $('b-act');
  ba.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { ba.setPointerCapture(e.pointerId); } catch (_) { /* rien */ } actPress(); });
  ba.addEventListener('pointerup', e => { e.preventDefault(); actRelease(); }); ba.addEventListener('pointercancel', () => actRelease()); ba.addEventListener('contextmenu', e => e.preventDefault());
  function toggleCarnet() { if (!$('carnet').hidden) { $('carnet').hidden = true; return; } releaseLock(); renderCarnet(); $('carnet').hidden = false; $('carnet-dot').hidden = true; Snd.page(); }
  $('b-carnet').addEventListener('click', toggleCarnet);
  $('carnet-close').addEventListener('click', () => { $('carnet').hidden = true; });
  $('r-close').addEventListener('click', () => { $('reader').hidden = true; Snd.ui(); });
  $('reader').addEventListener('click', e => { if (e.target === $('reader') && performance.now() - readerAt > 600) $('reader').hidden = true; });
  $('map-close').addEventListener('click', closeMap);
  $('b-menu').addEventListener('click', () => { releaseLock(); $('menu').hidden = false; });
  $('menu-resume').addEventListener('click', () => { $('menu').hidden = true; lock(); });
  $('menu-quit').addEventListener('click', () => location.replace(location.pathname + location.search));
  $('menu-full').addEventListener('click', () => { const d = document.documentElement; const f = d.requestFullscreen || d.webkitRequestFullscreen; if (document.fullscreenElement) document.exitFullscreen(); else if (f) { const r = f.call(d); if (r && r.then) r.then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (_) { /* rien */ } }).catch(() => { }); } });
  $('relock').addEventListener('click', lock);
  const bindRange = (id, k, fn) => { const el = $(id); el.value = SET[k]; el.addEventListener('input', () => { SET[k] = +el.value; fn && fn(SET[k]); saveSet(); }); };
  bindRange('set-bright', 'bright', v => { renderer.toneMappingExposure = v; });
  bindRange('set-sens', 'sens'); bindRange('set-vol', 'vol', v => Snd.setVolume(v));
  Snd.setVolume(SET.vol);

  $('t-host').addEventListener('click', hostGame);
  $('t-solo').addEventListener('click', soloStart);
  $('t-join').addEventListener('click', () => { $('t-joinform').hidden = false; $('t-code').focus(); });
  $('t-joinform').addEventListener('submit', e => { e.preventDefault(); const c = $('t-code').value.trim().toLowerCase(); if (c.length === 5) joinGame(c); });

  /* ---------- la boucle ---------- */
  let zone = 'in', fogD = 0.085, bellAmp = 0, bellAmpT = 0, last = performance.now(), frameAcc = 0, frameN = 0, adjT = 0, zoneSnd = -1;
  const fogCol = new THREE.Color(0x020203), tmpC = new THREE.Color();
  const ZONES = { in: [0x020203, 0.085, 0], cloister: [0x0b111b, 0.04, 1], maze: [0x010101, 0.17, 2], chapel: [0x05060a, 0.045, 3], nave: [0x030304, 0.06, 4], out: [0xdfe6ee, 0.05, 1] };
  function zoneOf(x, z) { const c = World.cellOf(x, z); return c === 'o' || c === 'x' ? 'maze' : c === ',' || c === 'g' ? 'cloister' : c === 'c' || c === 't' ? 'chapel' : c === 'n' ? 'nave' : c === 's' ? 'out' : 'in'; }
  const stepKind = c => (c === ',' || c === 's') ? 'snow' : c === 'w' ? 'wood' : (c === 'o' || c === 'x') ? 'bone' : 'stone';

  function movePlayer(dt) {
    let f = 0, s = 0;
    if (!overlayOpen()) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyA')) s -= 1; if (keys.has('KeyD')) s += 1;
      if (!P.frozen) { if (keys.has('ArrowLeft')) P.yaw += 2.0 * dt; if (keys.has('ArrowRight')) P.yaw -= 2.0 * dt; }
      if (joyId !== null) { f -= joyV.y; s += joyV.x; }
    }
    const m = Math.hypot(f, s); if (m > 1) { f /= m; s /= m; }
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || (joyId !== null && Math.hypot(joyV.x, joyV.y) > 0.97);
    const sp = P.frozen ? 0 : (run ? 3.3 : 2.1), sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    const tvx = (-sy * f + cy * s) * sp, tvz = (-cy * f - sy * s) * sp, k = Math.min(1, dt * 9);
    P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k;
    const p = { x: P.x + P.vx * dt, z: P.z + P.vz * dt }; World.collide(p, 0.3);
    const mv = Math.hypot(p.x - P.x, p.z - P.z); P.x = p.x; P.z = p.z;
    P.dist += mv; P.phase += mv * Math.PI / 0.8;
    if (P.dist > 0.8) { P.dist = 0; Snd.step(stepKind(World.cellOf(P.x, P.z)), pos3(P.x, 0.05, P.z + 0.01)); }
    P.roll = lerp(P.roll, -s * 0.012, Math.min(1, dt * 4));
    return mv / Math.max(dt, 1e-4);
  }

  function assignLights() {
    const cx = camera.position.x, cz = camera.position.z, list = [];
    for (const L of World.lights) {
      const tgt = (L.offUntil && L.offUntil > now) || L.dead ? 0 : 1; L.lvl += (tgt - L.lvl) * Math.min(1, (tgt ? 2.5 : 9) * dt0);
      if (L.lvl < 0.02) continue; const d = Math.hypot(L.x - cx, L.z - cz); if (d < 22) list.push([d, L]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < pool.length; k++) {
      const l = pool[k], e = list[k];
      if (!e) { l.intensity = 0; continue; }
      const L = e[1], fl = 0.85 + 0.15 * Math.sin(now * 11 + L.seed) * Math.sin(now * 6.7 + L.seed * 3);
      l.position.set(L.x, L.y, L.z); l.color.setHex(L.col); l.distance = L.r; l.intensity = L.i * L.lvl * fl * (e[0] > 16 ? clamp((22 - e[0]) / 6, 0, 1) : 1);
    }
  }
  let dt0 = 0.016, titleT = 0;
  function frame() {
    requestAnimationFrame(frame);
    const t = performance.now(), rdt = Math.min(0.1, (t - last) / 1000); last = t; const dt = Math.min(rdt, 0.05); dt0 = dt; now = t / 1000;
    frameAcc += rdt; frameN++; adjT += rdt;
    if (adjT > 2 && frameN > 20) { const avg = frameAcc / frameN; let np = pr; if (avg > 1 / 40) np = Math.max(PR_MIN, pr * 0.82); else if (avg < 1 / 56 && pr < PR_MAX) np = Math.min(PR_MAX, pr * 1.08); if (Math.abs(np - pr) > 0.01) { pr = np; resize(); } frameAcc = 0; frameN = 0; adjT = 0; }
    if (!E) return;
    frameWall = t;

    if (playing) {
      gameT += dt;
      if (P.wake < 1 && P.wake > 0) { P.wake = Math.min(1, P.wake + dt / 4.2); if (P.wake > 0.65) P.frozen = false; }
      if (!ending) { movePlayer(dt); if (isHost) hostStep(); }
      zone = zoneOf(P.x, P.z);
      // la caméra
      const w = P.wake, wk = w >= 1 ? 1 : 1 - Math.pow(1 - w, 3);
      const bob = Math.sin(P.phase * 2) * 0.028 * Math.min(1, Math.hypot(P.vx, P.vz) / 2), sway = Math.sin(P.phase) * 0.018;
      if (ending && endWalk && now > endWalk) { P.x += dt * 1.6; }
      let shx = 0, shy = 0; if (P.shake > 0) { P.shake -= dt; const a = Math.min(1, P.shake) * 0.03; shx = (Math.random() - 0.5) * a; shy = (Math.random() - 0.5) * a; }
      camera.position.set(P.x + Math.cos(P.yaw) * sway + shx, lerp(0.55, 1.62, wk) + bob + shy, P.z - Math.sin(P.yaw) * sway);
      camera.rotation.set(lerp(1.15, P.pitch, wk), P.yaw + (1 - wk) * 0.4, P.roll + (1 - wk) * 0.25);
      // ma lanterne
      let lt = P.lampT;
      if (P.dim && P.dim > now) lt = 0.08;
      if (zone === 'nave' && need() >= 2 && !ending) {
        let near = 99; for (const o of others.values()) near = Math.min(near, Math.hypot(o.x - P.x, o.z - P.z));
        const apart = clamp((near - 5) / 4, 0, 1); lt = Math.min(lt, 1 - apart * 0.9);
        if (apart > 0.5 && Math.random() < dt * 0.6) Snd.heart(apart); if (apart > 0.8 && Math.random() < dt * 0.12) Snd.whisper(pos3(P.x + (Math.random() - 0.5) * 4, 1.6, P.z + (Math.random() - 0.5) * 4), 1.6, 0.35);
      }
      P.lamp += (lt - P.lamp) * Math.min(1, dt * (lt < P.lamp ? 6 : 2));
      if (P.flick > 0) P.flick -= dt;
      const fk = P.flick > 0 ? (Math.random() < 0.35 ? 0.1 : 1) : 1, fl = (0.93 + 0.07 * Math.sin(now * 17.3) * Math.sin(now * 9.1 + 1)) * fk;
      camera.updateMatrixWorld();
      const off = new THREE.Vector3(0.28, -0.3, -0.5).applyQuaternion(camera.quaternion);
      myLamp.position.copy(camera.position).add(off); myLamp.intensity = 1.7 * P.lamp * fl; myLamp.distance = zone === 'maze' ? 8 : 11;
      vmLight.intensity = 1.0 * P.lamp * fl; vmLantern.userData.core.material = P.lamp > 0.25 ? World.M.lampCore : World.M.black; vmLantern.userData.glass.material.opacity = 0.22 * P.lamp; vmLantern.userData.flame.visible = P.lamp > 0.2; vmLantern.userData.flame.scale.set(0.035 * fl, 0.075 * fl * Math.max(0.3, P.lamp), 1);
      vmRoot.position.copy(camera.position); vmRoot.quaternion.copy(camera.quaternion);
      const spd = Math.hypot(P.vx, P.vz); vmLantern.rotation.z = Math.sin(P.phase) * 0.06 * Math.min(1, spd / 2) + Math.sin(now * 1.3) * 0.02; vmLantern.position.y = -0.36 + bob * 0.5 - (1 - wk) * 0.5;
      vmRoot.userData.hand.position.y = -0.15 + bob * 0.5 - (1 - wk) * 0.5;
      Snd.setListener(camera.position.x, camera.position.y, camera.position.z, -Math.sin(P.yaw), -Math.cos(P.yaw));
      if (!ending && P.wake >= 1) { tickScares(dt); tickObjective(dt); }
      updateAbbot(dt); updateOthers(dt); sendPos(dt);
      // ce que je vise
      if (!ending) {
        target = findTarget();
        if (holding && (target !== holding || (holding.can && !holding.can()))) actRelease();
        const lbl = target ? target.label() : '';
        $('cross').classList.toggle('on', !!target);
        $('prompt').hidden = !target || touchMode; $('b-act').hidden = !target || !touchMode;
        if (target) { $('prompt').querySelector('span').textContent = lbl + (target.hold ? ' (maintenir)' : ''); $('b-act').querySelector('.lbl').textContent = lbl.split(',')[0] + (target.hold ? ' · maintenir' : ''); }
        const hb = $('holdbar');
        if (holding) {
          const prog = holding.hold === 'gate' ? ST.gate : ST.w; hb.hidden = false; hb.querySelector('i').style.setProperty('--p', Math.round(prog * 100) + '%');
          if (prog > (holding.lastP || 0) + 1e-4) holding.progT = now; holding.lastP = prog; const moving = now - holding.progT < 0.45 && prog > 0;
          hb.querySelector('span').textContent = moving ? (holding.hold === 'gate' ? 'Le mur cède…' : 'La herse monte…') : (holding.hold === 'gate' ? 'Il faut pousser ensemble.' : 'Trop lourd. Il faut tourner l\'autre treuil en même temps.');
          if (holding.hold !== 'gate') { const wd = holding.hold === 'wA' ? E.winchA : E.winchB; wd.drum.rotation.x += dt * (moving ? 3 : 0.3); }
          if (holding.hold === 'gate' && moving) P.shake = Math.max(P.shake, 0.15);
        } else hb.hidden = true;
      }
      if (mapOpen) { drawMap(); if (Math.hypot(P.x - E.lecternPos.x, P.z - E.lecternPos.z) > 2.8) closeMap(); }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
      // les bougies de la nef s'éteignent sur ton passage
      if (zone === 'nave') for (const L of World.lights) if (L.tag.startsWith('nave') && !L.dead && P.x > L.x - 3 && L.tag !== 'nave') { L.dead = true; Snd.puff(pos3(L.x, 0.5, L.z)); }
      // la cloche, la porte murée
      bellAmp += (bellAmpT - bellAmp) * Math.min(1, dt * 1.5); if (ST.bellDone) bellAmpT = Math.max(0.15, bellAmpT - dt * 0.05);
      E.bell.rotation.x = Math.sin(now * 2.1) * bellAmp * 0.55;
      const d7 = World.doors.d7; if (ST.bellDone && !ending) { d7.crack.visible = true; d7.crack.material.opacity = 0.25 + 0.75 * ST.gate + Math.sin(now * 3) * 0.08; gateLight.intensity = 0.6 + ST.gate * 3; }
      if (ST.w > prevW + 1e-5) winchUpT = now; prevW = ST.w; { const active = !ST.door3 && now - winchUpT < 0.45; if (active !== winchOn) { winchOn = active; Snd.winch(active, pos3(29, 2.5, 22)); } if (active) for (const wd of [E.winchA, E.winchB]) wd.drum.rotation.x += dt * 2; }
      for (const b of debris) { b.vy -= 9.8 * dt; b.m.position.x += b.vx * dt; b.m.position.y = Math.max(0.05, b.m.position.y + b.vy * dt); b.m.position.z += b.vz * dt; b.m.rotation.x += b.r * dt; if (b.m.position.y <= 0.05) { b.vx *= 0.9; b.vz *= 0.9; b.vy = Math.abs(b.vy) * 0.2; } }
      if (ending) { tmpC.setHex(0xf2f4f8); scene.fog.color.lerp(tmpC, dt * 0.6); scene.background.lerp(tmpC, dt * 0.6); scene.fog.density = lerp(scene.fog.density, 0.12, dt * 0.4); }
    } else {
      // écran-titre : la caméra glisse lentement le long de la galerie du cloître
      titleT += dt; const u = (Math.sin(titleT * 0.05) + 1) / 2;
      camera.position.set(lerp(20.2, 24.5, u), 1.55 + Math.sin(titleT * 0.4) * 0.03, lerp(46, 33.5, u)); camera.rotation.set(0.12 + Math.sin(titleT * 0.13) * 0.05, -2.3 + Math.sin(titleT * 0.07) * 0.25, 0);
      myLamp.intensity = 0; zone = 'cloister'; camera.updateMatrixWorld();
      if (!abbot.on) { abbot.fig.visible = true; abbot.fig.position.set(33.5, 0, 46.5); abbot.fig.rotation.y = Math.atan2(camera.position.x - 33.5, camera.position.z - 46.5); }
      Snd.setListener(camera.position.x, camera.position.y, camera.position.z, 1, 0);
    }
    // brouillard, ambiance sonore
    const Z = ZONES[zone]; if (!ending) { tmpC.setHex(Z[0]); fogCol.lerp(tmpC, Math.min(1, dt * 1.2)); scene.fog.color.copy(fogCol); scene.background.copy(fogCol); fogD = lerp(fogD, Z[1], Math.min(1, dt * 1.2)); scene.fog.density = fogD; }
    const tension = zone === 'nave' ? 1 : 0; if (Z[2] !== zoneSnd && playing) { zoneSnd = Z[2]; Snd.setZone(Z[2], tension); }
    // neige et poussière
    const nearClo = Math.hypot(camera.position.x - 29, camera.position.z - 41) < 26; snow.visible = nearClo;
    if (nearClo) { const a = snow.geometry.attributes.position, arr = a.array; for (let k = 0; k < arr.length; k += 3) { arr[k + 1] -= dt * (0.5 + (k % 7) * 0.05); arr[k] += Math.sin(now * 0.7 + k) * dt * 0.12; if (arr[k + 1] < 0) arr[k + 1] = 10.5; } a.needsUpdate = true; }
    { const a = dust.geometry.attributes.position, c = dust.geometry.attributes.color, arr = a.array, col = c.array, lx = myLamp.position.x, ly = myLamp.position.y, lz = myLamp.position.z, cx = camera.position.x, cz = camera.position.z, br = playing ? P.lamp : 0.2;
      for (let k = 0; k < arr.length; k += 3) {
        arr[k] += Math.sin(now * 0.3 + k) * dt * 0.05; arr[k + 1] += Math.sin(now * 0.21 + k * 1.3) * dt * 0.04; arr[k + 2] += Math.cos(now * 0.27 + k) * dt * 0.05;
        if (arr[k] - cx > 3) arr[k] -= 6; else if (arr[k] - cx < -3) arr[k] += 6; if (arr[k + 2] - cz > 3) arr[k + 2] -= 6; else if (arr[k + 2] - cz < -3) arr[k + 2] += 6; if (arr[k + 1] > 3) arr[k + 1] = 0.1; else if (arr[k + 1] < 0) arr[k + 1] = 2.9;
        const d = Math.hypot(arr[k] - lx, arr[k + 1] - ly, arr[k + 2] - lz), v = Math.max(0, 1 - d / 2.6) * 0.55 * br; col[k] = v; col[k + 1] = v * 0.8; col[k + 2] = v * 0.55;
      }
      a.needsUpdate = true; c.needsUpdate = true; }
    assignLights();
    World.update(dt, now);
    tickMeter(dt);
    renderer.clear(); renderer.render(scene, camera);
    if (playing && !ending) { renderer.clearDepth(); renderer.render(vmScene, camera); }
  }
  let winchOn = false, prevW = 0, winchUpT = -9;

  /* ---------- démarrage ---------- */
  function boot() {
    try { buildWorld(); } catch (e) { $('loading').innerHTML = '<p>Ton appareil n\'a pas réussi à construire l\'abbaye. Recharge la page.</p>'; console.error(e); return; }
    $('loading').hidden = true;
    resize(); requestAnimationFrame(frame);
    const m = location.hash.match(/^#j-([a-z0-9]{5})$/i); if (m) joinGame(m[1].toLowerCase());
    window.__ombre = { P, get ST() { return ST; }, act, World, get target() { return target; }, get zone() { return zone; }, actPress, actRelease, readJournal, others, get pr() { return pr; }, renderer };
  }
  setTimeout(boot, 30);
})();
