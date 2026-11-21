/* Chassé d'Ours — duel à deux (ou plus) dans les ruines : chacun voit l'autre, sauf s'il se cache. */
const Duel = (() => {
  'use strict';
  let G, sendAcc = 0, score = 0, over = false, sightHold = 0, scoreKey = '', role = 'host', failed = false;
  const GOAL = 7, others = new Map(), $ = id => document.getElementById(id);
  const ARENA = { x: 10, z: -95, r: 54 };
  const SPAWNS = [[10, -66], [21, -119], [-4, -96], [20.5, -82]];
  const COLORS = [[0x2f6fb5, 0x265d99], [0x8a3fb0, 0x733494], [0x1f9a8a, 0x1a8071]];
  const r2 = v => Math.round(v * 100) / 100, num = v => typeof v === 'number' && isFinite(v);
  const dummy = (x, z) => ({ x, z, rad: 0.6, size: 0.75, flash: 0, squash: 0 });

  function init(api) {
    G = api;
    Net.on('data', onData);
    Net.on('leave', id => { drop(id === undefined ? null : id); if (!others.size) G.banner('Adversaire parti<small>Le lien reste valable tant que tu gardes la page ouverte</small>', '', 4000); });
    $('invite-close').addEventListener('click', () => { $('invite').hidden = true; });
    $('invite-copy').addEventListener('click', () => {
      const inp = $('invite-link'), ok = () => { $('invite-copy').textContent = 'Lien copié'; };
      const sel = () => { inp.focus(); inp.select(); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(ok).catch(sel); else sel();
    });
    $('invite-share').addEventListener('click', () => { navigator.share({ title: 'Chassé d\'Ours', text: 'Duel de chassés dans les ruines de Val-Perdu', url: $('invite-link').value }).catch(() => { }); });
  }
  function place(i) { const s = SPAWNS[i % SPAWNS.length], P = G.P; P.x = s[0]; P.z = s[1]; P.y = 0; P.vy = 0; P.ground = true; P.climb = false; P.vx = P.vz = 0; P.fly = null; P.hurtT = 0; G.pm.pose.rotation.x = 0; G.cam.init = false; }
  function fail(title, msg) { failed = true; G.card({ eyebrow: 'Duel', title, paras: [msg], button: 'Retour à la balade' }, () => { try { location.hash = ''; } catch (_) { /* rien */ } location.reload(); }); }

  function start(r, code) {
    role = r; score = 0; over = false; place(r === 'host' ? 0 : 1); $('duel-score').hidden = false; refresh();
    if (r === 'host') {
      G.banner('Création du duel<small>Mise en relation en cours</small>', '', 2500);
      Net.host((err, c) => {
        if (err) { fail('Mise en relation impossible', 'Le service qui relie les deux navigateurs ne répond pas. Vérifie ta connexion, puis réessaie.'); return; }
        const link = location.href.split('#')[0] + '#duel-' + c;
        $('invite-link').value = link; $('invite-share').hidden = !navigator.share; $('invite').hidden = false;
      });
    } else {
      G.banner('Connexion au duel<small>Mise en relation en cours</small>', '', 2500);
      Net.join(code, err => {
        if (err) { fail('Duel introuvable', 'Le lien a expiré, ou la personne qui t\'invite a fermé la page. Demande-lui un nouveau lien.'); return; }
        G.banner('Connecté<small>Trouve ton adversaire avant qu\'il te trouve</small>', '', 3600);
      });
    }
  }

  function add(id, d) {
    const col = COLORS[others.size % COLORS.length], model = Actors.makePlayer({ remote: true, shirt: col[0], sleeve: col[1] });
    G.scene.add(model.root);
    const o = { id, model, x: d.x, y: d.y, z: d.z, f: d.f, tx: d.x, ty: d.y, tz: d.z, tf: d.f, v: 0, c: 0, ch: 0, k: 0, sp: 0, h: 0, inv: 0, fl: 0, sc: 0, cp: 0, kp: 0, spk: 0, vis: true, seen: performance.now() };
    others.set(id, o); $('invite').hidden = true;
    if (failed) { failed = false; G.dismissCard(); }   // la liaison a fini par s'établir : on retire le message d'échec
    G.banner(`Un adversaire entre dans les ruines<small>Premier à ${GOAL} points. Par surprise, ça compte double.</small>`, 'red', 4200); Snd.alert();
    return o;
  }
  function drop(id) { for (const o of [...others.values()]) if (id === null || o.id === id || (!Net.isHost && id !== undefined)) { G.scene.remove(o.model.root); others.delete(o.id); } scoreKey = ''; }

  function onData(d) {
    if (d.t === 's') {
      if (!num(d.x) || !num(d.z) || !num(d.f) || typeof d.id !== 'string' || d.id === Net.id()) return;
      d.y = num(d.y) ? d.y : 0;
      const o = others.get(d.id) || add(d.id, d), now = performance.now(), gap = Math.max(0.03, (now - o.seen) / 1000);
      o.v = Math.hypot(d.x - o.tx, d.z - o.tz) / gap; o.seen = now; o.tx = d.x; o.ty = d.y; o.tz = d.z; o.tf = d.f;
      o.c = d.c ? 1 : 0; o.ch = num(d.ch) ? U.clamp(d.ch, 0, 1) : 0; o.k = d.k ? 1 : 0; o.sp = d.sp ? 1 : 0; o.h = d.h ? 1 : 0; o.inv = d.inv ? 1 : 0; o.fl = d.fl ? 1 : 0; o.sc = num(d.sc) ? d.sc | 0 : 0;
    } else if (d.t === 'hit' && d.to === Net.id()) takeHit(d);
    else if (d.t === 'win' && !over) { over = true; G.whenCalm(() => endCard(false)); }
    else if (d.t === 'again') { reset(); G.dismissCard(); }
  }

  /* ---------- chaque image : j'envoie mon état, je replace les autres ---------- */
  function update(dt, rdt) {
    const P = G.P, S = G.S;
    sendAcc += rdt;
    if (sendAcc > 0.066) {
      sendAcc = 0;
      Net.send({ t: 's', id: Net.id(), x: r2(P.x), y: r2(P.y || 0), z: r2(P.z), f: r2(P.face), c: P.crouch ? 1 : 0, ch: r2(P.chargePose), k: P.kick ? 1 : 0, sp: P.sprinting ? 1 : 0, h: P.hidden ? 1 : 0, inv: P.invuln > 0 ? 1 : 0, fl: P.fly ? 1 : 0, sc: score });
    }
    const now = performance.now(), k = 1 - Math.exp(-14 * rdt); let seen = false;
    for (const o of [...others.values()]) {
      if (now - o.seen > 6000) { drop(o.id); continue; }
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.z += (o.tz - o.z) * k; o.f += U.angDiff(o.f, o.tf) * k;
      o.cp = U.damp(o.cp, o.c, 12, rdt); o.kp = U.damp(o.kp, o.k, o.k ? 45 : 9, rdt); o.spk = U.damp(o.spk, o.sp, 7, rdt);
      const m = o.model; m.root.position.set(o.x, o.y, o.z); m.root.rotation.y = o.f;
      if (o.fl) m.pose.rotation.x += 12 * rdt; else m.pose.rotation.x = 0;
      Actors.animPlayer(m, { speed: o.fl ? 0 : Math.min(12, o.v), crouch: o.cp, charge: o.ch, kick: o.kp, sprint: o.spk, mega: false }, rdt, S.rt);
      // la règle du jeu : accroupi dans les herbes ou derrière un mur, l'autre disparaît de mon écran
      const d = Math.hypot(o.x - P.x, o.z - P.z);
      o.vis = !!o.fl || d < 2.6 || !(o.h || World.blocked(P.x, P.z, o.x, o.z, o.c > 0, Math.max(P.y, o.y)));
      m.root.visible = o.vis && !(o.inv && Math.floor(S.rt * 18) % 2 === 0);
      if (o.vis && d < 46) seen = true;
    }
    if (seen) sightHold = 2.5; else sightHold -= rdt;
    const mood = sightHold > 0 ? (seen ? 'alert' : 'sighted') : 'calm';
    if (mood !== S.mood) { S.mood = mood; Snd.setMood(mood); G.wrap.dataset.mood = mood; World.setMood(mood === 'calm' ? 0 : 1); }
    refresh();
  }
  function best() { let b = null; for (const o of others.values()) if (!b || o.sc > b.sc) b = o; return b; }
  function line() { const b = best(); return b ? `Toi ${score} · ${b.sc} Adversaire` : 'En attente d\'un adversaire'; }
  function refresh() { const t = line(); if (t !== scoreKey) { scoreKey = t; $('duel-score').textContent = t; } }
  const hud = () => ({ eyebrow: `Duel · premier à ${GOAL}`, text: line(), k: score / GOAL });

  /* ---------- donner et recevoir ---------- */
  function kickTest(fx, fz, k) {
    if (over) return false;
    for (const o of others.values()) {
      if (o.fl || o.inv || Math.hypot(o.x - fx, o.z - fz) > 1.5 || Math.abs(o.y - G.P.y) > 2.8) continue;
      const S = G.S, back = Math.sin(o.f) * k.dx + Math.cos(o.f) * k.dz > 0.45, launch = k.c >= 0.5 || k.mega, sneaky = k.ambush || back, pts = launch ? (sneaky ? 2 : 1) : 0;
      const tags = []; if (k.ambush) tags.push('Embuscade'); if (back) tags.push('Dans le dos'); if (k.perfect) tags.push('Armé parfait'); if (k.mega) tags.push('Furie');
      G.impactFX(dummy(o.x, o.z), k, U.clamp(0.4 + 0.5 * k.c + (launch ? 0.25 : 0) + (k.mega ? 0.5 : 0), 0.3, 1.6), !!k.mega, launch);
      Net.send({ t: 'hit', id: Net.id(), to: o.id, dx: r2(k.dx), dz: r2(k.dz), c: r2(k.c), launch, mega: !!k.mega });
      if (k.mega) S.fury = 0;
      if (!launch) { G.showHit('Trop mou', 'soft', []).verdict.textContent = 'Arme au moins à moitié pour l\'envoyer'; return true; }
      score += pts; o.fl = 1; if (!k.mega) S.fury = Math.min(100, S.fury + 26);
      G.showHit(k.mega ? 'Méga chassé' : sneaky ? 'Chassé surprise' : 'Chassé', k.mega ? 'mega' : '', tags.concat(pts > 1 ? '+2 points' : '+1 point')).verdict.textContent = `${score} à ${o.sc}`;
      if (score >= GOAL) { over = true; Net.send({ t: 'win', id: Net.id() }); G.whenCalm(() => endCard(true)); }
      return true;
    }
    return false;
  }
  function takeHit(d) {
    const P = G.P; if (P.fly || !num(d.dx) || !num(d.dz)) return;
    const l = Math.hypot(d.dx, d.dz) || 1, dx = d.dx / l, dz = d.dz / l;
    G.stopCharge(); P.kick = null;
    G.impactFX(dummy(P.x, P.z), { dx, dz }, d.launch ? 1.1 : 0.5, !!d.mega, false);
    const el = $('hurt'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    if (d.launch) { P.fly = { t: 0, vx: dx * 19, vz: dz * 19, vy: 15, by: d.id }; P.crouch = false; $('t-crouch').classList.remove('on'); G.showHit('Envoyé', 'soft', []).verdict.textContent = 'Tu réapparais dans un instant'; }
    else { P.vx = dx * 13; P.vz = dz * 13; P.hurtT = 0.4; }
  }
  // le vol plané de celui qui vient d'en prendre un
  function flyStep(dt) {
    const P = G.P, f = P.fly; f.t += dt; P.x += f.vx * dt; P.z += f.vz * dt; P.y = Math.max(0, (P.y || 0) + f.vy * dt); f.vy -= 22 * dt; clamp(P);
    if (dt > 0) FX.trail(P.x, P.y + 1, P.z, false);
    if (f.t > 1.6) {
      const a = others.get(f.by); let bi = 0, bd = -1;
      SPAWNS.forEach((s, i) => { const dd = a ? Math.hypot(s[0] - a.x, s[1] - a.z) : Math.random(); if (dd > bd) { bd = dd; bi = i; } });
      place(bi); P.invuln = 2.5; G.S.stamina = G.S.maxStamina;
    }
  }
  function clamp(o) { const dx = o.x - ARENA.x, dz = o.z - ARENA.z, d = Math.hypot(dx, dz); if (d > ARENA.r) { o.x = ARENA.x + dx / d * ARENA.r; o.z = ARENA.z + dz / d * ARENA.r; } }
  function endCard(won) {
    const b = best();
    G.card({ eyebrow: 'Duel terminé', title: won ? 'Victoire' : 'Défaite', paras: [`${score} à ${b ? b.sc : 0}. ${won ? 'Ton adversaire est parti voir les montagnes de près.' : 'Tu as vu les montagnes de près. Cache-toi mieux, frappe dans le dos.'}`], button: 'Revanche' }, () => { Net.send({ t: 'again' }); reset(); });
  }
  function reset() { score = 0; over = false; for (const o of others.values()) o.sc = 0; place(role === 'host' ? 0 : 1); G.P.invuln = 2; G.S.fury = 0; scoreKey = ''; }

  // par-dessus la 3D : étiquette de l'adversaire visible, flèche s'il est hors champ ou s'il fait du bruit
  function draw(g, w, h) {
    const P = G.P;
    for (const o of others.values()) {
      const dx = o.x - P.x, dz = o.z - P.z, d = Math.hypot(dx, dz), loud = o.sp && d < 40;
      if (!o.vis && !loud) continue;
      const p = G.project(o.x, o.y + 2.9, o.z);
      if (p.on && o.vis) {
        g.font = '700 14px "Barlow Condensed", "Arial Narrow", sans-serif'; g.lineWidth = 3; g.strokeStyle = '#1b140c'; g.strokeText('ADVERSAIRE', p.x, p.y); g.fillStyle = '#ff8a6a'; g.fillText('ADVERSAIRE', p.x, p.y);
      } else if (d > 5) {
        const e = G.edgePos(dx, dz, w, h, 38);
        g.save(); g.translate(e.x, e.y); g.rotate(e.a); g.globalAlpha = o.vis ? 0.95 : 0.55 + 0.3 * Math.sin(G.S.rt * 10);
        g.fillStyle = o.vis ? '#e8291c' : '#ffb53a'; g.strokeStyle = '#1b140c'; g.lineWidth = 2; g.beginPath(); g.moveTo(15, 0); g.lineTo(-8, -10); g.lineTo(-3, 0); g.lineTo(-8, 10); g.closePath(); g.fill(); g.stroke(); g.restore();
      }
    }
  }

  return { init, start, update, hud, kickTest, flyStep, clamp, draw, get others() { return others; }, get score() { return score; } };
})();
