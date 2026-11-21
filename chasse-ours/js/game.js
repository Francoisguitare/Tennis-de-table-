/* Chassé d'Ours — le jeu : contrôles, furtivité, chassé, ours, progression, HUD. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { TAU, lerp, clamp, damp, angDiff } = U;
  const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
  const wrap = $('game'), canvas = $('c3d');
  let coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touch');

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' }); }
  catch (e) { $('nogl').hidden = false; $('title-screen').hidden = true; return; }
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xf7cf9e, 70, 420);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000);
  World.init(scene, { coarse });
  FX.init(scene, camera, $('fx'), renderer);

  /* ---------- données ---------- */
  const CFG = { walk: 6.4, sprint: 10.6, crouch: 3.3, chargeMove: 2.3, chargeTime: 1.0, perfectWin: 0.24, lungeDur: 0.17, lungeDist: 3.6, R: World.R };
  const BEARS = {
    noir: { id: 'noir', name: 'Ours noir', color: 0x2e2824, snout: 0x9a7650, size: 0.85, weight: 70, xp: 30, speed: 2.6, chase: 8.6, vision: 19 },
    brun: { id: 'brun', name: 'Ours brun', color: 0x80502a, snout: 0xcda06a, size: 1.0, weight: 120, xp: 50, speed: 2.4, chase: 8.9, vision: 21 },
    grizzly: { id: 'grizzly', name: 'Grizzly', color: 0x5e3d24, hump: 0x8d7558, snout: 0xb89468, size: 1.25, weight: 230, xp: 110, speed: 2.2, chase: 9.2, vision: 23 },
    polaire: { id: 'polaire', name: 'Ours polaire égaré', color: 0xf1eee4, snout: 0xdcd5c4, paw: 0xd8d2c2, size: 1.42, weight: 400, xp: 220, speed: 2.2, chase: 9.4, vision: 25 },
    dore: { id: 'dore', name: 'Ours doré', color: 0xf2b62c, snout: 0xffe08a, glow: 0x4a2e00, size: 1.1, weight: 300, xp: 420, speed: 3, chase: 9.6, vision: 24 },
  };
  const PERKS = [
    { id: 'power', name: 'Mollets d\'acier', desc: '+15 % de puissance de chassé' },
    { id: 'stealth', name: 'Pas de loup', desc: 'Les ours te repèrent de 15 % moins loin' },
    { id: 'stamina', name: 'Souffle long', desc: '+25 % d\'endurance au sprint' },
    { id: 'charge', name: 'Armé éclair', desc: 'Le chassé s\'arme 18 % plus vite' },
    { id: 'heart', name: 'Cœur vaillant', desc: '+1 cœur de vie' },
    { id: 'fury', name: 'Sang chaud', desc: 'La Furie monte 30 % plus vite' },
    { id: 'reach', name: 'Grande allonge', desc: '+20 % d\'élan sur le chassé' },
  ];
  const TITLES = [[1, 'Promeneur'], [2, 'Randonneur taquin'], [3, 'Botteur du dimanche'], [4, 'Tatane des bois'], [5, 'Savateur confirmé'], [7, 'Terreur des plantigrades'], [9, 'Maître du chassé'], [12, 'Légende de la plaine']];
  const MISSIONS = [
    { ev: 'stealth', n: 2, xp: 70, txt: n => `Envoie ${n} ours en chassé furtif` },
    { ev: 'dist', n: 80, xp: 80, thr: true, unit: ' m', txt: n => `Fais voler un ours à plus de ${n} m` },
    { ev: 'ambush', n: 1, xp: 90, txt: n => n > 1 ? `Réussis ${n} embuscades depuis les hautes herbes` : 'Réussis une embuscade depuis les hautes herbes' },
    { ev: 'perfect', n: 2, xp: 90, txt: n => `Touche ${n} fois avec un armé parfait` },
    { ev: 'combo', n: 3, xp: 120, thr: true, txt: n => `Enchaîne une série de ${n} ours` },
    { ev: 'counter', n: 1, xp: 130, txt: n => n > 1 ? `Contre ${n} ours pendant qu'ils arment leur patte` : 'Contre un ours pendant qu\'il arme sa patte' },
    { ev: 'mega', n: 1, xp: 110, txt: n => n > 1 ? `Déclenche ${n} méga chassés` : 'Remplis la Furie et déclenche un méga chassé' },
    { ev: 'launch', n: 5, xp: 120, txt: n => `Envoie ${n} ours dans le décor` },
    { ev: 'back', n: 3, xp: 110, txt: n => `Envoie ${n} ours frappés dans le dos` },
  ];
  const need = L => Math.round(9 * Math.pow(L, 1.45)) * 10;
  const titleOf = L => { let t = TITLES[0][1]; for (const [l, n] of TITLES) if (L >= l) t = n; return t; };

  const S = {
    running: false, paused: false, modal: false, t: 0, rt: 0, hitstop: 0, slowT: 1, slowDur: 0, slowMin: 1, slowLaunch: false, ts: 1,
    level: 1, xp: 0, perks: {}, kicked: 0, best: 0, missionIdx: 0, missionProg: 0,
    hearts: 4, maxHearts: 4, stamina: 100, maxStamina: 100, winded: false, fury: 0, combo: 0, comboT: 0,
    power: 100, detectMul: 1, chargeRate: 1, furyMul: 1, reachMul: 1, mood: 'calm', pendingLevel: 0, timers: [], counter: null, spawnT: 0, hintStep: 0, hintT: 0, moteAcc: 0,
  };
  const P = { x: 0, z: 6, vx: 0, vz: 0, face: Math.PI, crouch: false, crouchK: 0, charging: false, chargeT: 0, chargePose: 0, kickPose: 0, kick: null, recover: 0, hurtT: 0, invuln: 0, inGrass: false, hidden: false, sprinting: false, speed: 0, stepAcc: 0, regenDelay: 0, fullPing: false, auraAcc: 0 };
  const I = { sx: 0, sz: 0, kick: false, stick: false };
  const keys = {};
  const bears = [];
  const cam = { x: 0, y: 2, z: 0, zoom: 1, punch: 0, track: null, trackT: 0, init: false, baseFov: 50 };
  const shk = { x: 0, y: 0, r: 0 }, v3 = new THREE.Vector3();
  let VW = 1, VH = 1, pauseMode = 'pause';

  /* ---------- sauvegarde ---------- */
  const KEY = 'chasse-ours-v1';
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ level: S.level, xp: S.xp, perks: S.perks, kicked: S.kicked, best: S.best, missionIdx: S.missionIdx, missionProg: S.missionProg, muted: Snd.muted })); } catch (e) { /* stockage indisponible : on joue sans */ } }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!d) return false;
      S.level = Math.max(1, d.level | 0); S.xp = Math.max(0, +d.xp || 0); S.perks = d.perks || {}; S.kicked = d.kicked | 0; S.best = d.best | 0; S.missionIdx = d.missionIdx | 0; S.missionProg = +d.missionProg || 0;
      if (d.muted) Snd.setMuted(true);
      return S.level > 1 || S.kicked > 0;
    } catch (e) { return false; }
  }
  function recalc() {
    const p = id => S.perks[id] || 0;
    S.power = 100 * (1 + 0.07 * (S.level - 1)) * (1 + 0.15 * p('power'));
    S.maxHearts = 4 + p('heart'); S.maxStamina = 100 * (1 + 0.25 * p('stamina'));
    S.detectMul = Math.pow(0.85, p('stealth')); S.chargeRate = 1 + 0.18 * p('charge'); S.furyMul = 1 + 0.3 * p('fury'); S.reachMul = 1 + 0.2 * p('reach');
  }

  /* ---------- le promeneur et quelques repères au sol ---------- */
  const pm = Actors.makePlayer(); scene.add(pm.root);
  const flat = (geo, color) => { geo.rotateX(-Math.PI / 2); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); m.renderOrder = 3; m.visible = false; scene.add(m); return m; };
  const chargeRing = flat(new THREE.RingGeometry(0.9, 1, 48), 0xffb53a);
  const aimRing = flat(new THREE.RingGeometry(0.86, 1, 40), 0xff5a1f);

  /* ---------- entrées ---------- */
  function kickDown() { if (S.running && !S.paused && !S.modal) I.kick = true; }
  function kickUp() { I.kick = false; }
  function toggleCrouch() { if (!S.running || S.paused || S.modal || P.kick || P.hurtT > 0) return; P.crouch = !P.crouch; $('t-crouch').classList.toggle('on', P.crouch); }
  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (S.modal && !$('levelup').hidden && /^(Digit|Numpad)[1-3]$/.test(e.code)) { const b = $('lu-perks').children[+e.code.slice(-1) - 1]; if (b) b.click(); return; }
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space') kickDown();
    else if (e.code === 'KeyC' || e.code === 'ControlLeft') toggleCrouch();
    else if (e.code === 'Escape' || e.code === 'KeyP') { if (S.running && (!S.modal || S.paused)) setPause(!S.paused); }
    else if (e.code === 'KeyM') toggleSound();
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') kickUp(); });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; kickUp(); });
  wrap.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0 && e.target === canvas) kickDown(); });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse') kickUp(); });
  wrap.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('touchstart', () => { if (!coarse) { coarse = true; document.body.classList.add('touch'); if (S.running) $('touch').hidden = false; } }, { passive: true });

  const zone = $('stick-zone'), sBase = $('stick-base'), sKnob = $('stick-knob'); let stickId = null, sx0 = 0, sy0 = 0;
  zone.addEventListener('pointerdown', e => {
    if (stickId !== null) return; stickId = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
    const r = zone.getBoundingClientRect(); sx0 = e.clientX; sy0 = e.clientY; sBase.hidden = false; sBase.style.left = (e.clientX - r.left) + 'px'; sBase.style.top = (e.clientY - r.top) + 'px'; sKnob.style.transform = ''; I.sx = I.sz = 0; I.stick = true;
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return; let dx = e.clientX - sx0, dy = e.clientY - sy0; const l = Math.hypot(dx, dy), m = 52; if (l > m) { dx *= m / l; dy *= m / l; }
    sKnob.style.transform = `translate(${dx}px,${dy}px)`; I.sx = dx / m; I.sz = dy / m;
  });
  const stickEnd = e => { if (e.pointerId !== stickId) return; stickId = null; sBase.hidden = true; I.sx = I.sz = 0; I.stick = false; };
  zone.addEventListener('pointerup', stickEnd); zone.addEventListener('pointercancel', stickEnd);
  const tk = $('t-kick');
  tk.addEventListener('pointerdown', e => { e.preventDefault(); try { tk.setPointerCapture(e.pointerId); } catch (_) { /* rien */ } tk.classList.add('down'); kickDown(); });
  const tkUp = () => { tk.classList.remove('down'); kickUp(); };
  tk.addEventListener('pointerup', tkUp); tk.addEventListener('pointercancel', tkUp);
  $('t-crouch').addEventListener('pointerdown', e => { e.preventDefault(); toggleCrouch(); });

  /* ---------- petits utilitaires ---------- */
  const after = (sec, fn) => S.timers.push({ t: S.t + sec, fn });
  function project(x, y, z) { v3.set(x, y, z).project(camera); return { x: (v3.x * 0.5 + 0.5) * VW, y: (-v3.y * 0.5 + 0.5) * VH, on: v3.z < 1 && Math.abs(v3.x) < 1 && Math.abs(v3.y) < 1 }; }
  function collide(o, r) {
    for (const c of World.colliders) { const dx = o.x - c.x, dz = o.z - c.z, m = r + c.r; if (Math.abs(dx) > m || Math.abs(dz) > m) continue; const d = Math.hypot(dx, dz); if (d < m && d > 0.0001) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; } }
    const d = Math.hypot(o.x, o.z); if (d > CFG.R) { o.x *= CFG.R / d; o.z *= CFG.R / d; }
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /* ---------- HUD ---------- */
  const H = {};
  function setTxt(id, v) { if (H[id] !== v) { H[id] = v; $(id).textContent = v; } }
  function setW(id, k) { const v = Math.round(clamp(k, 0, 1) * 200) / 2; if (H[id] !== v) { H[id] = v; $(id).style.width = v + '%'; } }
  function setCls(id, cls, on) { const k = id + '.' + cls; if (H[k] !== on) { H[k] = on; $(id).classList.toggle(cls, on); } }
  function curMission() {
    const cyc = Math.floor(S.missionIdx / MISSIONS.length), m = MISSIONS[S.missionIdx % MISSIONS.length];
    const n = m.ev === 'dist' ? m.n + 50 * cyc : m.n + cyc; return { m, n, xp: Math.round(m.xp * (1 + 0.5 * cyc)) };
  }
  function hud() {
    if (!S.running) return;
    setTxt('lvl-num', String(S.level)); setTxt('lvl-title', titleOf(S.level));
    const nd = need(S.level); setW('xp-fill', S.xp / nd); setTxt('xp-text', `${Math.floor(S.xp)} / ${nd} XP`);
    const hk = S.hearts + '/' + S.maxHearts;
    if (H.hearts !== hk) { const prev = H.heartsN; H.hearts = hk; H.heartsN = S.hearts; let h = ''; for (let i = 0; i < S.maxHearts; i++) h += `<span class="${i < S.hearts ? (prev !== undefined && i >= prev ? 'pop' : '') : 'off'}">♥</span>`; $('hearts').innerHTML = h; }
    setW('stamina-fill', S.stamina / S.maxStamina); setW('fury-fill', S.fury / 100);
    setCls('fury-gauge', 'full', S.fury >= 100);
    setTxt('st-kicked', String(S.kicked)); setTxt('st-best', S.best + ' m');
    const { m, n } = curMission(); setTxt('mission-text', m.txt(n)); setW('mission-fill', Math.min(1, S.missionProg / n));
    // furtivité
    const chased = bears.some(b => b.state === 'chase' || b.state === 'attack' || b.state === 'alert');
    const st = chased ? ['Repéré', 'spotted'] : P.hidden ? ['Caché', 'hidden-ok'] : P.crouch ? ['Discret', 'quiet'] : P.sprinting ? ['Bruyant', 'loud'] : ['À découvert', ''];
    if (H.stealth !== st[0]) { H.stealth = st[0]; const el = $('stealth'); el.textContent = st[0]; el.className = 'chip ' + st[1]; }
    // armé
    if (H.charging !== P.charging) { H.charging = P.charging; $('charge').hidden = !P.charging; }
    if (P.charging) {
      const c = Math.min(1, P.chargeT / CFG.chargeTime), perfect = P.chargeT >= CFG.chargeTime && P.chargeT <= CFG.chargeTime + CFG.perfectWin, mega = S.fury >= 100;
      $('charge-fill').style.width = (c * 100).toFixed(1) + '%';
      setCls('charge', 'perfect', perfect); setCls('charge', 'mega', mega && !perfect);
      setTxt('charge-label', perfect ? 'Parfait, lâche !' : mega ? 'Méga chassé' : c >= 1 ? 'À fond' : 'Armé');
    }
    const cb = S.combo >= 2;
    if (H.comboOn !== cb) { H.comboOn = cb; $('combo').hidden = !cb; }
    if (cb && H.comboN !== S.combo) { H.comboN = S.combo; const el = $('combo'); el.innerHTML = `Série ×${S.combo}<small>XP ×${Math.min(3, 1 + 0.25 * (S.combo - 1)).toFixed(2)}</small>`; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    setCls('game', 'slowmo', S.slowLaunch && (S.hitstop > 0 || S.slowT < S.slowDur * 0.8));
  }
  let bannerTo = 0;
  function banner(html, cls, ms = 2600) { const el = $('banner'); el.innerHTML = html; el.className = 'on ' + (cls || ''); clearTimeout(bannerTo); bannerTo = setTimeout(() => el.classList.remove('on'), ms); }
  let hintTo = 0;
  function hint(html, ms = 6500) { const el = $('hint'); el.innerHTML = html; el.hidden = false; clearTimeout(hintTo); hintTo = setTimeout(() => { el.hidden = true; }, ms); }
  function floatText(txt, x, y, cls) { const el = document.createElement('div'); el.className = 'float ' + (cls || ''); el.textContent = txt; el.style.left = clamp(x, 60, VW - 60) + 'px'; el.style.top = clamp(y, 60, VH - 60) + 'px'; $('callouts').appendChild(el); setTimeout(() => el.remove(), 1600); }
  function showHit(title, cls, tags) {
    $('callouts').querySelectorAll('.hit').forEach(e => e.remove());
    const el = document.createElement('div'); el.className = 'hit ' + (cls || '');
    el.innerHTML = `<div class="hit-title">${esc(title)}</div><div class="hit-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div><div class="hit-dist" hidden><b>0</b><small> m</small></div><div class="hit-verdict"></div>`;
    $('callouts').appendChild(el); setTimeout(() => el.remove(), 3500);
    return { el, dist: el.querySelector('.hit-dist'), num: el.querySelector('.hit-dist b'), verdict: el.querySelector('.hit-verdict') };
  }

  /* ---------- progression ---------- */
  function addXP(n, sx, sy) {
    n = Math.round(n); if (n <= 0) return;
    S.xp += n; if (sx !== undefined) floatText('+' + n + ' XP', sx, sy);
    while (S.xp >= need(S.level)) { S.xp -= need(S.level); S.level++; S.pendingLevel++; }
    save();
  }
  function missionEvent(ev, val = 1) {
    const { m, n, xp } = curMission(); if (m.ev !== ev) return;
    if (m.thr) S.missionProg = Math.max(S.missionProg, Math.min(val, n)); else S.missionProg += val;
    if (S.missionProg >= n) {
      S.missionIdx++; S.missionProg = 0; Snd.pickup();
      const el = document.querySelector('.mission'); el.classList.remove('done'); void el.offsetWidth; el.classList.add('done');
      floatText('Mission accomplie', VW / 2, VH * 0.42, 'amber'); addXP(xp, VW / 2, VH * 0.48);
    }
  }
  function openLevelUp() {
    S.modal = true; S.pendingLevel--; recalc(); S.hearts = S.maxHearts; Snd.levelUp(); I.kick = false;
    const lvl = S.level - S.pendingLevel;
    $('lu-title').textContent = 'Niveau ' + lvl;
    const newBear = lvl === 3 ? ' Les grizzlys descendent dans la plaine.' : lvl === 5 ? ' Un ours polaire s\'est perdu par ici.' : lvl === 2 ? ' On murmure qu\'un ours doré rôde.' : '';
    $('lu-sub').textContent = `${titleOf(lvl)}. Puissance +7 %, vie restaurée.${newBear} Choisis un atout :`;
    const pool = PERKS.slice().sort(() => Math.random() - 0.5).slice(0, 3), box = $('lu-perks'); box.innerHTML = '';
    pool.forEach((p, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'perk';
      b.innerHTML = `<em>${coarse ? 'Atout' : 'Touche ' + (i + 1)}${S.perks[p.id] ? ' · déjà ×' + S.perks[p.id] : ''}</em><b>${esc(p.name)}</b><span>${esc(p.desc)}</span>`;
      b.addEventListener('click', () => { S.perks[p.id] = (S.perks[p.id] || 0) + 1; recalc(); if (p.id === 'heart') S.hearts = S.maxHearts; S.stamina = S.maxStamina; Snd.ui(); save(); $('levelup').hidden = true; S.modal = false; });
      box.appendChild(b);
    });
    $('levelup').hidden = false;
  }

  /* ---------- ours ---------- */
  function spawnBear(id, x, z, face) {
    const T = BEARS[id], model = Actors.makeBear(T), lv = 1 + 0.04 * (S.level - 1);
    const b = { T, model, x, z, y: 0, face: face === undefined ? rnd(TAU) : face, size: T.size, rad: 1.25 * T.size, res: T.weight * lv, res0: T.weight * lv, state: 'idle', st: rnd(1, 4), aware: 0, sp: 0, homeX: x, homeZ: z, tx: x, tz: z, wt: 0, lost: 0, lastX: x, lastZ: z, at: 0, struck: false, windup: 0.62, reach: 2.3 * T.size + 0.9, rear: 0, phase: rnd(6), spotted: false, flash: 0, squash: 0, kvx: 0, kvz: 0, sparkAcc: 0, lt: 0, vx: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0, reward: null };
    scene.add(model.root); bears.push(b); Actors.animBear(b, 0, 0); return b;
  }
  function removeBear(b) { scene.remove(b.model.root); b.model.mat.dispose(); b.model.cone.material.dispose(); const i = bears.indexOf(b); if (i >= 0) bears.splice(i, 1); }
  function randomType() {
    const L = S.level, w = [['noir', L < 4 ? 5 : 2.5], ['brun', 4], ['grizzly', L >= 3 ? 3 : 0], ['polaire', L >= 5 ? 1.8 : 0], ['dore', L >= 2 ? 0.45 : 0]];
    let tot = 0; w.forEach(x => tot += x[1]); let r = rnd(tot); for (const [id, k] of w) { if ((r -= k) <= 0) return id; } return 'brun';
  }
  function spawnFar() {
    for (let i = 0; i < 30; i++) {
      const a = rnd(TAU), d = rnd(48, 120), x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
      if (Math.hypot(x, z) > CFG.R - 10) continue;
      if (bears.some(b => Math.hypot(b.x - x, b.z - z) < 16)) continue;
      return spawnBear(randomType(), x, z);
    }
    return null;
  }
  const bearTarget = () => 5 + Math.min(6, S.level);
  function resetBears() {
    while (bears.length) removeBear(bears[0]);
    spawnBear('noir', P.x + 7, P.z - 42, Math.PI); spawnBear('brun', P.x - 34, P.z - 58, 2);
    while (bears.length < bearTarget()) { if (!spawnFar()) break; }
  }
  function moveBear(b, tx, tz, sp, turn, dt) {
    const da = angDiff(b.face, Math.atan2(tx - b.x, tz - b.z));
    b.face += clamp(da, -turn * dt, turn * dt);
    b.sp = damp(b.sp, sp * Math.max(0, Math.cos(da)), 5, dt);
    b.x += Math.sin(b.face) * b.sp * dt; b.z += Math.cos(b.face) * b.sp * dt;
  }
  function alertBear(b, quiet) {
    if (b.state === 'launched' || b.state === 'alert' || b.state === 'chase' || b.state === 'attack') return;
    b.state = 'alert'; b.st = 0.85; b.aware = 1; b.lost = 0;
    Snd.roar(b.size); if (!quiet) { Snd.alert(); banner(`Repéré !<small>${esc(b.T.name)} en colère</small>`, 'red', 1800); }
  }

  function updateBear(b, dt, rdt) {
    const T = b.T;
    if (b.state === 'launched') {
      b.lt += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vy -= 15 * dt;
      if (dt > 0) { FX.trail(b.x, b.y + 1.3, b.z, b.reward && b.reward.mega); if (b.lt > 0.25) FX.trail(b.x - b.vx * 0.03, b.y + 1.3, b.z - b.vz * 0.03); }
      if (b.lt > 1.25) b.model.root.scale.setScalar(Math.max(0.01, b.size * (1 - (b.lt - 1.25) / 0.2)));
      if (b.lt > 1.45) finishLaunch(b);
      return;
    }
    const dx = P.x - b.x, dz = P.z - b.z, d = Math.hypot(dx, dz), ang = Math.atan2(dx, dz), off = Math.abs(angDiff(b.face, ang));
    const vis = T.vision * S.detectMul * (P.hidden ? 0.1 : P.crouch ? 0.5 : P.sprinting ? 1.2 : 1);
    b.vis = vis;
    const close = d < b.rad + (P.hidden ? 0.5 : P.crouch ? 1.3 : 2.6);
    const seen = (off < 0.95 && d < vis) || close;
    const heard = d < (P.sprinting ? 12 : (P.crouch || P.speed < 1) ? 0 : 5) * S.detectMul;
    switch (b.state) {
      case 'idle': case 'wander': {
        if (seen) b.aware += dt * lerp(2.4, 0.55, clamp(d / Math.max(1, vis), 0, 1)); else if (heard) b.aware += dt * 0.45; else b.aware -= dt * 0.22;
        b.aware = clamp(b.aware, 0, 1);
        if (b.aware >= 1) { alertBear(b); break; }
        if (b.aware > 0.3 && (seen || heard)) { b.face += clamp(angDiff(b.face, ang), -2.4 * dt, 2.4 * dt); b.sp = damp(b.sp, 0, 6, dt); }
        else if (b.state === 'idle') { b.sp = damp(b.sp, 0, 5, dt); b.st -= dt; if (b.st <= 0) { const a = rnd(TAU), r = rnd(6, 22); b.tx = b.homeX + Math.cos(a) * r; b.tz = b.homeZ + Math.sin(a) * r; b.wt = 14; b.state = 'wander'; } }
        else { moveBear(b, b.tx, b.tz, T.speed, 1.6, dt); b.wt -= dt; if (Math.hypot(b.tx - b.x, b.tz - b.z) < 2 || b.wt < 0) { b.state = 'idle'; b.st = rnd(1.5, 5); } }
        break;
      }
      case 'alert':
        b.face += clamp(angDiff(b.face, ang), -6 * dt, 6 * dt); b.sp = damp(b.sp, 0, 8, dt); b.st -= dt;
        if (b.st <= 0) { b.state = 'chase'; b.lost = 0; b.lastX = P.x; b.lastZ = P.z; }
        break;
      case 'chase': {
        const lost = (P.hidden && d > 4.5) || d > 48;
        if (lost) b.lost += dt; else { b.lost = 0; b.lastX = P.x; b.lastZ = P.z; }
        if (b.lost > 3.2) { b.state = 'idle'; b.st = rnd(2, 4); b.aware = 0.4; b.homeX = b.x; b.homeZ = b.z; banner('Il a perdu ta trace<small>Reste planqué</small>', '', 1800); break; }
        moveBear(b, b.lastX, b.lastZ, lost && Math.hypot(b.lastX - b.x, b.lastZ - b.z) < 3 ? 0 : T.chase, 4.2, dt);
        if (!lost && d < b.reach && off < 0.9) { b.state = 'attack'; b.at = 0; b.struck = false; Snd.growl(1.6 / b.size, 0.4, 0.5); }
        break;
      }
      case 'attack':
        b.at += dt; b.sp = damp(b.sp, 0, 10, dt);
        if (b.at < b.windup) b.face += clamp(angDiff(b.face, ang), -2.6 * dt, 2.6 * dt);
        else if (!b.struck) {
          b.struck = true; Snd.swipe(); b.x += Math.sin(b.face) * 0.8; b.z += Math.cos(b.face) * 0.8;
          const dodge = P.kick && P.kick.t < CFG.lungeDur;
          if (d < b.reach + 1.1 && off < 1.15 && P.invuln <= 0 && !dodge) hurtPlayer(b);
        }
        if (b.at > b.windup + 0.8) b.state = 'chase';
        break;
      case 'stunned': {
        b.x += b.kvx * dt; b.z += b.kvz * dt; const dr = Math.exp(-4.5 * dt); b.kvx *= dr; b.kvz *= dr; b.sp = 0; b.st -= dt;
        if (b.st <= 0) { b.state = 'idle'; alertBear(b, true); }
        break;
      }
    }
    collide(b, b.rad * 0.7);
    for (const o of bears) { if (o === b || o.state === 'launched') continue; const ex = b.x - o.x, ez = b.z - o.z, m = (b.rad + o.rad) * 0.85, e = Math.hypot(ex, ez); if (e < m && e > 0.001) { const k = (m - e) * 0.5 / e; b.x += ex * k; b.z += ez * k; } }
    // pétillement : un ours en vue qui ne se doute de rien scintille
    if (b.spotted && (b.state === 'idle' || b.state === 'wander') && d < 46) { b.sparkAcc += rdt * 9; while (b.sparkAcc > 1) { b.sparkAcc--; FX.sparkle(b.x, 1.2 * b.size, b.z, 1.5 * b.size); } }
    // cône de vision
    const cn = b.model.cone, hot = b.state === 'alert' || b.state === 'chase' || b.state === 'attack';
    cn.visible = d < 60 && b.state !== 'stunned'; cn.scale.setScalar(Math.max(0.5, vis) / b.size);
    cn.material.color.setHex(hot ? 0xff3a22 : b.aware > 0.3 ? 0xffb53a : 0xfff3d4); cn.material.opacity = hot ? 0.22 : 0.15 + 0.12 * b.aware;
  }

  /* ---------- le chassé ---------- */
  const kickReach = c => CFG.lungeDist * (0.55 + 0.45 * c) * S.reachMul;
  function pickTarget(reach) {
    let best = null, bs = 1e9;
    for (const b of bears) {
      if (b.state === 'launched') continue;
      const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz) - b.rad; if (d > reach + 1.9) continue;
      const a = Math.abs(angDiff(P.face, Math.atan2(dx, dz))); if (a > 1.3 && d > 2.2) continue;
      const sc = d + a * 2.2; if (sc < bs) { bs = sc; best = b; }
    }
    return best;
  }
  function startKick() {
    const c = Math.min(1, P.chargeT / CFG.chargeTime), perfect = P.chargeT >= CFG.chargeTime && P.chargeT <= CFG.chargeTime + CFG.perfectWin;
    P.charging = false; P.fullPing = false; Snd.chargeStop();
    const reach = kickReach(c), tg = pickTarget(reach);
    if (tg) P.face = Math.atan2(tg.x - P.x, tg.z - P.z);
    const ambush = P.inGrass && P.crouch;
    P.crouch = false; $('t-crouch').classList.remove('on');
    P.kick = { t: 0, c, perfect, dx: Math.sin(P.face), dz: Math.cos(P.face), reach, hit: false, ambush, mega: S.fury >= 100 };
    Snd.whoosh(0.5 + 0.5 * c);
  }
  function updateKick(dt) {
    const k = P.kick; k.t += dt;
    if (k.t < CFG.lungeDur && !k.hit) {
      const v = k.reach / CFG.lungeDur; P.vx = k.dx * v; P.vz = k.dz * v;
      const fx = P.x + k.dx * 1.25, fz = P.z + k.dz * 1.25;
      for (const b of bears) { if (b.state === 'launched') continue; if (Math.hypot(b.x - fx, b.z - fz) < b.rad + 0.8) { k.hit = true; onKickHit(b, k); break; } }
      if (dt > 0) FX.puff(P.x, 0.3, P.z, 1, 0.8);
    } else { const dr = Math.exp(-16 * dt); P.vx *= dr; P.vz *= dr; }
    if (k.t > CFG.lungeDur + (k.hit ? 0.24 : 0.12)) { P.kick = null; P.recover = k.hit ? 0.16 : 0.42; if (!k.hit) Snd.miss(); }
  }
  function onKickHit(b, k) {
    P.vx = P.vz = 0;
    const tags = []; let mult = 1;
    const unaware = b.state === 'idle' || b.state === 'wander';
    const back = Math.sin(b.face) * k.dx + Math.cos(b.face) * k.dz > 0.45;
    const counter = b.state === 'attack' && b.at < b.windup;
    if (unaware) { mult *= 2; tags.push('Furtif ×2'); }
    if (k.ambush && unaware) { mult *= 1.5; tags.push('Embuscade ×1,5'); }
    if (back) { mult *= 1.25; tags.push('Dans le dos ×1,25'); }
    if (counter) { mult *= 1.8; tags.push('Contre ×1,8'); }
    if (k.perfect) { mult *= 1.3; tags.push('Armé parfait ×1,3'); }
    if (k.mega) { mult *= 2.5; tags.push('Furie ×2,5'); S.fury = 0; }
    const impulse = S.power * (0.3 + 0.7 * k.c) * mult, r = impulse / b.res, launch = r >= 1;
    const heavy = clamp(0.3 + 0.5 * k.c + (launch ? 0.25 : 0) + (k.mega ? 0.5 : 0) + tags.length * 0.04, 0.3, 1.6);

    // --- tout ce qui donne le poids du coup ---
    S.hitstop = 0.07 + 0.075 * heavy; S.slowLaunch = launch;
    S.slowDur = launch ? 0.95 + 0.75 * heavy : 0.3 + 0.3 * heavy; S.slowT = 0; S.slowMin = launch ? 0.05 : 0.22;
    const ix = b.x - k.dx * b.rad * 0.6, iy = 1.3 * b.size, iz = b.z - k.dz * b.rad * 0.6, sp = project(ix, iy, iz);
    FX.impact({ x: ix, y: iy, z: iz, dx: k.dx, dz: k.dz, heavy, mega: k.mega, sx: sp.x, sy: sp.y });
    Snd.impact(heavy, k.mega); Snd.slowmo(S.slowDur + S.hitstop); Snd.yelp(b.size);
    cam.punch = Math.min(1.4, 0.5 + 0.6 * heavy);
    if (k.mega) World.darken(1);
    b.flash = 1.2; b.squash = 1;
    for (const { tree, d } of World.shock(ix, iz, heavy * (k.mega ? 1.8 : 1), S.t)) {
      after(d / 34, () => { FX.leaves(tree.x, tree.top * 0.8, tree.z, Math.round(7 * heavy / (1 + d * 0.08)) + 1, tree.kind === 'fall'); if (d < 26 && Math.random() < 0.45) FX.birds(tree.x, tree.top, tree.z, 2 + Math.floor(rnd(4))); });
    }
    // le fracas réveille les voisins
    for (const o of bears) { if (o === b || o.state === 'launched') continue; const d = Math.hypot(o.x - ix, o.z - iz); if (d < 20) { o.aware = Math.max(o.aware, 0.55); if (o.state === 'idle' || o.state === 'wander') o.face += angDiff(o.face, Math.atan2(P.x - o.x, P.z - o.z)) * 0.6; } }

    if (k.perfect) missionEvent('perfect');
    if (launch) launchBear(b, k.dx, k.dz, r, tags, { unaware, ambush: k.ambush && unaware, back, counter, mega: k.mega });
    else {
      b.res = Math.max(12, b.res - impulse * 0.75); b.state = 'stunned'; b.st = 1.0 + 0.5 * heavy; b.kvx = k.dx * (8 + 9 * r); b.kvz = k.dz * (8 + 9 * r); b.aware = 1;
      S.fury = Math.min(100, S.fury + 8 * S.furyMul); addXP(4);
      const h = showHit('Encaissé', 'soft', tags);
      h.verdict.innerHTML = `${esc(b.T.name)} : il lui reste <b>${Math.round(b.res / b.res0 * 100)} %</b> de résistance`;
    }
    if (k.mega) megaWave(ix, iz, b);
  }
  function launchBear(b, dx, dz, r, tags, f) {
    const rr = Math.min(r, 6);
    b.state = 'launched'; b.lt = 0; b.vx = dx * (22 + 7 * rr); b.vz = dz * (22 + 7 * rr); b.vy = 15 + 3.5 * rr; b.spinX = rnd(9, 15); b.spinZ = rnd(-5, 5); b.model.cone.visible = false;
    const dist = Math.round(18 + 30 * Math.pow(r, 1.15));
    S.combo++; S.comboT = 14;
    const cm = Math.min(3, 1 + 0.25 * (S.combo - 1));
    const xp = Math.round(b.T.xp * (1 + 0.3 * tags.length) * cm * (1 + dist / 400));
    b.reward = { dist, xp, mega: f.mega };
    S.kicked++; const record = dist > S.best; if (record) S.best = dist;
    if (!f.mega) S.fury = Math.min(100, S.fury + (20 + 7 * tags.length) * S.furyMul);
    missionEvent('launch');
    if (f.wave) return; // soufflé par l'onde d'un méga chassé : pas de second titre à l'écran
    if (S.combo >= 2) tags = tags.concat('Série ×' + S.combo);
    const title = f.mega ? 'Méga chassé' : f.counter ? 'Contre-chassé' : f.unaware ? 'Chassé furtif' : 'Chassé';
    const h = showHit(title, f.mega ? 'mega' : '', tags);
    S.counter = { h, to: dist, t: 0, dur: 1.2, xp, record, name: b.T.name };
    cam.track = b; cam.trackT = 1.9; Snd.fly(S.hitstop + 0.45);
    if (f.unaware) missionEvent('stealth'); if (f.ambush) missionEvent('ambush'); if (f.back) missionEvent('back'); if (f.counter) missionEvent('counter'); if (f.mega) missionEvent('mega');
    missionEvent('dist', dist); missionEvent('combo', S.combo);
    if (S.fury >= 100 && !f.mega) after(0.6, () => banner('Furie pleine<small>Ton prochain chassé sera un méga chassé</small>', '', 2600));
  }
  function finishLaunch(b) {
    const p = project(b.x, b.y, b.z), sx = clamp(p.x, VW * 0.24, VW * 0.76), sy = clamp(p.y, VH * 0.15, VH * 0.45);
    FX.star(sx, sy, b.reward.mega ? 1.5 : 1); Snd.twinkle();
    addXP(b.reward.xp, sx, sy + 34);
    removeBear(b);
  }
  // le méga chassé souffle tout ce qui traîne autour
  function megaWave(x, z, src) {
    for (const o of bears) {
      if (o === src || o.state === 'launched') continue;
      const dx = o.x - x, dz = o.z - z, d = Math.hypot(dx, dz); if (d > 15) continue;
      after(d / 34, () => {
        if (o.state === 'launched' || !bears.includes(o)) return;
        o.flash = 1; o.squash = 1; FX.dust(o.x, o.z, 14, 9);
        if (S.power * 1.3 >= o.res) launchBear(o, dx / (d + 0.01), dz / (d + 0.01), S.power * 1.3 / o.res, ['Onde de choc'], { mega: true, wave: true });
        else { o.res *= 0.6; o.state = 'stunned'; o.st = 2.4; o.kvx = dx / (d + 0.01) * 12; o.kvz = dz / (d + 0.01) * 12; }
      });
    }
  }
  function hurtPlayer(b) {
    S.hearts--; P.hurtT = 0.45; P.invuln = 1.5; S.combo = 0; S.comboT = 0;
    const a = Math.atan2(P.x - b.x, P.z - b.z); P.vx = Math.sin(a) * 17; P.vz = Math.cos(a) * 17;
    if (P.charging) { P.charging = false; P.fullPing = false; Snd.chargeStop(); } P.kick = null;
    FX.shake(0.85); FX.dust(P.x, P.z, 10, 6); Snd.hurt();
    const el = $('hurt'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    const p = project(P.x, 2.6, P.z); floatText('−1 ♥', p.x, p.y, 'red');
    if (S.hearts <= 0) after(0.5, ko);
  }
  function ko() {
    if (S.modal) return;
    S.modal = true; pauseMode = 'ko'; I.kick = false;
    $('pause-title').textContent = 'K.-O.'; $('pause-sub').textContent = 'Un ours t\'a rendu la politesse. Ton niveau et tes atouts sont conservés, la série et la Furie repartent de zéro.';
    $('btn-resume').textContent = 'Se relever'; $('btn-reset').hidden = true; $('pause').hidden = false;
  }
  function respawn() {
    P.x = 0; P.z = 6; P.vx = P.vz = 0; P.face = Math.PI; P.crouch = false; P.charging = false; P.kick = null; P.hurtT = 0; P.invuln = 2; P.recover = 0;
    S.hearts = S.maxHearts; S.stamina = S.maxStamina; S.fury = 0; S.combo = 0; S.winded = false; S.timers.length = 0; cam.init = false; cam.track = null;
    $('t-crouch').classList.remove('on'); resetBears();
  }

  /* ---------- le promeneur ---------- */
  function updatePlayer(dt) {
    P.invuln = Math.max(0, P.invuln - dt); P.recover = Math.max(0, P.recover - dt); P.hurtT = Math.max(0, P.hurtT - dt);
    let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + I.sx;
    let mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + I.sz;
    let ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
    const canAct = !P.kick && P.recover <= 0 && P.hurtT <= 0;
    if (I.kick && !P.charging && canAct) { P.charging = true; P.chargeT = 0; P.fullPing = false; Snd.chargeStart(); }
    if (P.charging) {
      P.chargeT += dt * S.chargeRate;
      const c = Math.min(1, P.chargeT / CFG.chargeTime); Snd.chargeSet(c);
      if (c >= 1 && !P.fullPing) { P.fullPing = true; Snd.perfect(); FX.ring(P.x, P.z, 0xffffff, 4.5, 0.3, 0.2, 0.8); }
      P.auraAcc += dt * (20 + 50 * c); while (P.auraAcc > 1) { P.auraAcc--; FX.aura(P.x + Math.sin(P.face) * 0.5, 0.7, P.z + Math.cos(P.face) * 0.5, c, S.fury >= 100); }
      if (!I.kick) startKick();
    }
    P.sprinting = false;
    if (P.kick) updateKick(dt);
    else if (P.hurtT > 0) { const dr = Math.exp(-5 * dt); P.vx *= dr; P.vz *= dr; }
    else {
      let max = P.crouch ? CFG.crouch : CFG.walk;
      const wantSprint = keys.ShiftLeft || keys.ShiftRight || (I.stick && ml > 0.94);
      if (wantSprint && !P.crouch && !P.charging && ml > 0.2 && !S.winded) { max = CFG.sprint; P.sprinting = true; }
      if (P.charging) max = CFG.chargeMove; if (P.recover > 0) max *= 0.35;
      P.vx = damp(P.vx, mx * max, 12, dt); P.vz = damp(P.vz, mz * max, 12, dt);
      if (ml > 0.1) P.face += angDiff(P.face, Math.atan2(mx, mz)) * Math.min(1, dt * (P.charging ? 7 : 14));
    }
    if (P.sprinting) { S.stamina -= 24 * dt; P.regenDelay = 0.7; if (S.stamina <= 0) { S.stamina = 0; S.winded = true; } }
    else { P.regenDelay -= dt; if (P.regenDelay <= 0) S.stamina = Math.min(S.maxStamina, S.stamina + 21 * dt); if (S.winded && S.stamina > S.maxStamina * 0.3) S.winded = false; }
    P.x += P.vx * dt; P.z += P.vz * dt;
    for (const b of bears) { if (b.state === 'launched') continue; const dx = P.x - b.x, dz = P.z - b.z, m = b.rad * 0.8 + 0.4, d = Math.hypot(dx, dz); if (d < m && d > 0.001) { P.x = b.x + dx / d * m; P.z = b.z + dz / d * m; } }
    collide(P, 0.45);
    P.speed = Math.hypot(P.vx, P.vz);
    P.inGrass = World.inGrass(P.x, P.z); P.hidden = P.inGrass && P.crouch && !P.kick;
    P.stepAcc += P.speed * dt;
    if (P.stepAcc > (P.sprinting ? 2.6 : P.crouch ? 1.6 : 2.1) && !P.kick) { P.stepAcc = 0; Snd.step(P.inGrass, P.crouch ? 0.35 : P.sprinting ? 1 : 0.65); if (P.sprinting) FX.puff(P.x, 0.2, P.z, 2); }
    P.crouchK = damp(P.crouchK, P.crouch ? 1 : 0, 12, dt);
    P.chargePose = damp(P.chargePose, P.charging ? 0.35 + 0.65 * Math.min(1, P.chargeT / CFG.chargeTime) : 0, 14, dt);
    P.kickPose = damp(P.kickPose, P.kick ? 1 : 0, P.kick ? 45 : 9, dt);
    pm.root.position.set(P.x, 0, P.z); pm.root.rotation.y = P.face;
    pm.root.visible = !(P.invuln > 0 && P.hurtT <= 0 && Math.floor(S.rt * 18) % 2 === 0 && S.hearts > 0);
    Actors.animPlayer(pm, { speed: P.speed, crouch: P.crouchK, charge: P.chargePose, kick: P.kickPose, mega: S.fury >= 100 }, dt, S.rt);
    // repères au sol : cercle d'armé, cible visée
    const c = P.charging ? Math.min(1, P.chargeT / CFG.chargeTime) : 0;
    chargeRing.visible = P.charging; aimRing.visible = false;
    if (P.charging) {
      const perfect = P.chargeT >= CFG.chargeTime && P.chargeT <= CFG.chargeTime + CFG.perfectWin;
      chargeRing.position.set(P.x, 0.12, P.z); chargeRing.scale.setScalar(1.1 + 1.9 * c); chargeRing.material.opacity = 0.25 + 0.6 * c; chargeRing.material.color.setHex(perfect ? 0xffffff : S.fury >= 100 ? 0x7fe9ff : 0xffb53a);
      const tg = pickTarget(kickReach(c));
      if (tg) { aimRing.visible = true; aimRing.position.set(tg.x, 0.16, tg.z); aimRing.scale.setScalar(tg.rad * 1.5 + Math.sin(S.rt * 12) * 0.12); aimRing.material.opacity = 0.85; }
    }
  }

  /* ---------- ambiance ---------- */
  let sightHold = 0;
  function onSpot(b) {
    Snd.spot(); banner(`Ours en vue<small>${esc(b.T.name)} · ${Math.round(b.res)} kg de résistance</small>`, '', 2800);
    for (let i = 0; i < 26; i++) FX.sparkle(b.x, 1.4 * b.size, b.z, 2.4 * b.size);
    FX.ring(b.x, b.z, 0xffc46a, 6 * b.size, 0.8, 0.2, 0.55);
  }
  function updateMood(rdt) {
    let any = false, hot = false;
    for (const b of bears) {
      if (b.state === 'launched') continue;
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      if (d < 42 && project(b.x, 1.5 * b.size, b.z).on) { any = true; if (!b.spotted) { b.spotted = true; onSpot(b); } } else if (d > 75) b.spotted = false;
      if ((b.state === 'alert' || b.state === 'chase' || b.state === 'attack') && d < 55) hot = true;
    }
    if (any) sightHold = 3.5; else sightHold -= rdt;
    const m = hot ? 'alert' : sightHold > 0 ? 'sighted' : 'calm';
    if (m !== S.mood) { S.mood = m; Snd.setMood(m); wrap.dataset.mood = m; World.setMood(m === 'calm' ? 0 : 1); }
  }
  const HINTS = [
    () => coarse ? 'Glisse le pouce gauche pour marcher. Pousse à fond pour sprinter.' : 'Marche avec <kbd>ZQSD</kbd> ou les flèches. <kbd>Maj</kbd> pour sprinter.',
    () => coarse ? 'Maintiens <b>Chassé</b> pour armer, relâche pour frapper.' : 'Maintiens <kbd>Espace</kbd> pour armer ton chassé, relâche pour frapper.',
    () => coarse ? 'Bouton <b>Accroupi</b> dans les hautes herbes : les ours ne te voient plus.' : 'Accroupis-toi avec <kbd>C</kbd> dans les hautes herbes : les ours ne te voient plus.',
    () => 'Le cône au sol montre ce que l\'ours voit. Arrive par derrière : un ours surpris encaisse le double.',
    () => 'Relâche pile quand la jauge flashe en blanc : armé parfait, +30 % de puissance.',
  ];
  function updateHints(rdt) {
    if (S.hintStep >= HINTS.length) return;
    S.hintT -= rdt; if (S.hintT > 0) return;
    hint(HINTS[S.hintStep++](), 7000); S.hintT = 9.5;
  }

  /* ---------- boucle ---------- */
  function update(dt, rdt) {
    for (let i = S.timers.length - 1; i >= 0; i--) { if (S.timers[i].t <= S.t) { const f = S.timers[i].fn; S.timers.splice(i, 1); f(); } }
    updatePlayer(dt);
    for (let i = bears.length - 1; i >= 0; i--) { const b = bears[i]; updateBear(b, dt, rdt); b.flash = Math.max(0, b.flash - rdt * 4); if (bears[i] === b) Actors.animBear(b, dt, S.t); }
    updateMood(rdt); updateHints(rdt);
    for (const b of World.berries) {
      if (!b.ready || Math.hypot(b.x - P.x, b.z - P.z) > 1.8) continue;
      b.ready = false; b.fruit.visible = false; b.t = S.t + 45; Snd.pickup(); const p = project(b.x, 1.6, b.z);
      if (S.hearts < S.maxHearts) { S.hearts++; floatText('+1 ♥ myrtilles', p.x, p.y, 'red'); } else addXP(8, p.x, p.y);
    }
    S.moteAcc += rdt * 5; while (S.moteAcc > 1) { S.moteAcc--; FX.mote(P.x, P.z); }
    if (S.combo > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
    S.spawnT -= dt; if (S.spawnT <= 0) { S.spawnT = 2.5; if (bears.length < bearTarget()) spawnFar(); }
    if (S.counter) {
      const c = S.counter; c.t += rdt; const k = Math.min(1, c.t / c.dur);
      if (c.t > 0.25) { c.h.dist.hidden = false; c.h.num.textContent = String(Math.round(c.to * (1 - Math.pow(1 - k, 3)))); }
      if (k >= 1) {
        const d = c.to, v = d < 60 ? 'Joli vol plané' : d < 110 ? 'Belle tatane' : d < 180 ? 'Chassé monumental' : d < 300 ? 'Parti voir les montagnes' : 'Mis en orbite';
        c.h.verdict.innerHTML = `${esc(c.name)} · ${v}${c.record ? ' · <b>nouveau record</b>' : ''}`; S.counter = null;
      }
    }
    if (S.pendingLevel > 0 && S.hitstop <= 0 && S.slowT >= S.slowDur && !P.kick && !S.counter && !bears.some(b => b.state === 'launched')) openLevelUp();
  }

  function updateCamera(rdt) {
    if (!S.running) { const a = S.rt * 0.07 + 0.6; camera.position.set(P.x + Math.sin(a) * 21, 6.5, P.z + Math.cos(a) * 21); camera.lookAt(P.x, 2.6, P.z); cam.init = false; return; }
    const slow = S.hitstop > 0 || S.slowT < S.slowDur;
    let zt = 1 - 0.17 * P.chargePose + (P.sprinting ? 0.07 : 0) - (P.crouch ? 0.05 : 0);
    if (slow) zt = S.slowLaunch ? 0.68 : 0.84;
    cam.zoom = damp(cam.zoom, zt, zt < cam.zoom ? 9 : 2.2, rdt);
    let tx = P.x + P.vx * 0.12, ty = 2.0, tz = P.z - 2.6;
    if (cam.track) {
      cam.trackT -= rdt; const b = cam.track; let ox = b.x - P.x, oz = b.z - P.z; const ol = Math.hypot(ox, oz), mx = 22;
      if (ol > mx) { ox *= mx / ol; oz *= mx / ol; }
      tx = P.x + ox * 0.6; tz = P.z - 2.6 + oz * 0.6; ty = Math.min(16, 2 + b.y * 0.72);
      if (cam.trackT <= 0) cam.track = null;
    }
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.z = tz; cam.init = true; }
    cam.x = damp(cam.x, tx, 6, rdt); cam.y = damp(cam.y, ty, 5, rdt); cam.z = damp(cam.z, tz, 6, rdt);
    cam.punch = Math.max(0, cam.punch - rdt * 2.2);
    const fov = cam.baseFov + cam.punch * 12; if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    FX.shakeOffset(shk, S.rt);
    camera.position.set(cam.x + shk.x, 1.2 + 7.6 * cam.zoom + shk.y, cam.z + 2.6 + 15.5 * cam.zoom);
    camera.lookAt(cam.x + shk.x * 0.5, cam.y, cam.z); camera.rotation.z += shk.r;
  }

  // marqueurs dessinés par-dessus la 3D : attention des ours, résistance, flèches hors champ
  FX.onDraw = (g, w, h) => {
    if (!S.running) return;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const b of bears) {
      if (b.state === 'launched') continue;
      const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz), hot = b.state === 'alert' || b.state === 'chase' || b.state === 'attack';
      const p = project(b.x, 3.3 * b.size + (b.rear || 0) * 1.6, b.z);
      if (p.on) {
        if (hot) {
          const wind = b.state === 'attack' && b.at < b.windup, s = wind ? 19 + Math.sin(S.rt * 40) * 4 : 15;
          g.fillStyle = wind && Math.floor(S.rt * 16) % 2 ? '#fff' : '#e8291c'; g.beginPath(); g.arc(p.x, p.y, s, 0, TAU); g.fill();
          g.fillStyle = wind && Math.floor(S.rt * 16) % 2 ? '#e8291c' : '#fff'; g.font = `700 ${Math.round(s * 1.5)}px "Bowlby One", Impact, sans-serif`; g.fillText('!', p.x, p.y + 1);
        } else if (b.state === 'stunned') {
          g.fillStyle = '#ffd56a'; g.font = '700 22px "Bowlby One", Impact, sans-serif'; g.fillText('✶ ✶', p.x + Math.sin(S.rt * 9) * 5, p.y);
        } else if (b.aware > 0.04) {
          g.fillStyle = 'rgba(16,35,26,.85)'; g.beginPath(); g.arc(p.x, p.y, 14, 0, TAU); g.fill();
          g.strokeStyle = b.aware > 0.6 ? '#ff5a1f' : '#ffb53a'; g.lineWidth = 4; g.beginPath(); g.arc(p.x, p.y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * b.aware); g.stroke();
          g.fillStyle = '#fff3d4'; g.font = '700 18px "Bowlby One", Impact, sans-serif'; g.fillText('?', p.x, p.y + 1);
        }
        if (b.res < b.res0 - 0.5) {
          const bw = 54, k = b.res / b.res0; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(p.x - bw / 2 - 1, p.y + 21, bw + 2, 8); g.fillStyle = '#ff5a1f'; g.fillRect(p.x - bw / 2, p.y + 22, bw * k, 6);
        }
      } else if (d < 80 && d > 6) {
        // z positif = vers la caméra = bas de l'écran
        const a = Math.atan2(dz, dx), cx = w / 2, cy = h / 2, m = 34, k = Math.min((cx - m) / Math.abs(Math.cos(a) || 1e-6), (cy - m) / Math.abs(Math.sin(a) || 1e-6));
        const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
        g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha = clamp(1.25 - d / 80, 0.25, 0.9);
        g.fillStyle = hot ? '#e8291c' : '#fff3d4'; g.strokeStyle = '#1b140c'; g.lineWidth = 2; g.beginPath(); g.moveTo(13, 0); g.lineTo(-7, -9); g.lineTo(-2, 0); g.lineTo(-7, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
      }
    }
  };

  function resize() {
    VW = wrap.clientWidth || innerWidth; VH = wrap.clientHeight || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
    renderer.setPixelRatio(dpr); renderer.setSize(VW, VH, false);
    const asp = VW / VH; camera.aspect = asp;
    cam.baseFov = asp >= 1.3 ? 50 : clamp(50 * Math.pow(1.3 / asp, 0.6), 50, 74); camera.fov = cam.baseFov; camera.updateProjectionMatrix();
    FX.resize(VW, VH, dpr);
  }
  addEventListener('resize', resize); if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; S.rt += rdt;
    const live = S.running && !S.paused && !S.modal;
    let dt = 0;
    if (live) {
      let ts = 1;
      if (S.hitstop > 0) { S.hitstop -= rdt; ts = 0; }
      else if (S.slowT < S.slowDur) { S.slowT += rdt; const k = clamp(S.slowT / S.slowDur, 0, 1); ts = lerp(S.slowMin, 1, k * k * k); }
      S.ts = ts; dt = rdt * ts; S.t += dt; update(dt, rdt);
    } else if (!S.running) { dt = rdt; S.t += dt; Actors.animPlayer(pm, { speed: 0, crouch: 0, charge: 0, kick: 0, mega: false }, dt, S.rt); }
    updateCamera(live || !S.running ? rdt : 0);
    World.update(dt, S.t, P.x, P.z, camera, S.running ? cam.x : 1e6, S.running ? cam.z : 1e6);
    FX.update(dt, live || !S.running ? rdt : 0);
    renderer.render(scene, camera);
    FX.draw(live || !S.running ? rdt : 0);
    hud();
  }

  /* ---------- écrans ---------- */
  function toggleSound() { Snd.setMuted(!Snd.muted); $('btn-sound').classList.toggle('off', Snd.muted); save(); }
  function setPause(v) {
    if (!S.running || (v && S.modal)) return;
    S.paused = v; I.kick = false;
    if (v) { pauseMode = 'pause'; $('pause-title').textContent = 'Pause'; $('pause-sub').textContent = `Niveau ${S.level} · ${S.kicked} ours envoyés · record ${S.best} m. Les ours attendent.`; $('btn-resume').textContent = 'Reprendre'; const r = $('btn-reset'); r.hidden = false; r.classList.remove('sure'); r.textContent = 'Recommencer à zéro'; }
    $('pause').hidden = !v; Snd.suspend(v);
    if (P.charging && v) { P.charging = false; Snd.chargeStop(); }
  }
  $('btn-pause').addEventListener('click', () => setPause(true));
  $('btn-sound').addEventListener('click', toggleSound);
  $('btn-resume').addEventListener('click', () => {
    Snd.ui();
    if (pauseMode === 'ko') { $('pause').hidden = true; S.modal = false; pauseMode = 'pause'; respawn(); }
    else setPause(false);
  });
  $('btn-reset').addEventListener('click', e => {
    const b = e.currentTarget;
    if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Sûr ? Niveau et atouts effacés'; return; }
    try { localStorage.removeItem(KEY); } catch (_) { /* rien */ }
    S.level = 1; S.xp = 0; S.perks = {}; S.kicked = 0; S.best = 0; S.missionIdx = 0; S.missionProg = 0; S.pendingLevel = 0; S.hintStep = 0; S.hintT = 1;
    recalc(); respawn(); setPause(false);
  });
  $('btn-play').addEventListener('click', () => {
    Snd.init(); Snd.setMood('calm'); Snd.ui();
    $('title-screen').hidden = true; $('hud').hidden = false; $('touch').hidden = !coarse;
    S.running = true; S.timers.length = 0; S.hintT = 1.2; if (S.kicked >= 3) S.hintStep = HINTS.length;
    last = performance.now();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.running && !S.paused && !S.modal) setPause(true); });

  /* ---------- démarrage ---------- */
  const had = load(); recalc(); S.hearts = S.maxHearts; S.stamina = S.maxStamina;
  $('btn-sound').classList.toggle('off', Snd.muted);
  if (had) { const el = $('save-line'); el.hidden = false; el.textContent = `Partie retrouvée : niveau ${S.level} (${titleOf(S.level)}), ${S.kicked} ours envoyés, record ${S.best} m.`; $('btn-play').textContent = 'Reprendre la balade'; }
  resize(); resetBears();
  window.__chasse = { S, P, bears, I, spawnBear, CFG };
  requestAnimationFrame(frame);
})();
