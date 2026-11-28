// Scénarios ciblés du moteur + fuzz de commandes (node tests/scenarios.js)
const path = require('path');
for (const f of ['data.js', 'map.js', 'path.js', 'sim.js', 'ai.js', 'world.js']) {
  try { require(path.join(__dirname, '..', 'js', f)); } catch (e) { if (f !== 'world.js') throw e; }
}
const R = globalThis.R, U = R.UNITS, B = R.BLDS;
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('ÉCHEC :', msg); } }
const errs = [];
console.error = (...a) => errs.push(a.map(x => x && x.stack ? x.stack : String(x)).join(' '));

function newGame(extra) {
  return new R.Game(Object.assign({ seed: 42, players: [{ name: 'A', color: 0 }, { name: 'B', color: 1 }], size: 'normale', mapType: 'plaine', startRes: 'tres', popCap: 200, speed: 1.7 }, extra || {}));
}
function run(g, secs) { const n = Math.round(secs / (R.TICK * g.speed)); for (let i = 0; i < n; i++) { g.step(); g.ev.length = 0; } }
const tcOf = (g, o) => g.list.find(e => !e.dead && e.k === 'b' && e.t === 'tc' && e.o === o);
const units = (g, o, t) => g.list.filter(e => !e.dead && e.k === 'u' && e.o === o && (!t || e.t === t));
function freeSpot(g, o, type, near) {
  for (let r = 3; r < 20; r++) for (let k = 0; k < 40; k++) {
    const a = k / 40 * Math.PI * 2;
    const tx = Math.round(near.x + Math.cos(a) * r - B[type].size / 2), ty = Math.round(near.y + Math.sin(a) * r - B[type].size / 2);
    if (g.canPlace(o, type, tx, ty)) return { tx, ty };
  }
  return null;
}
function spawnAt(g, type, o, x, y, n) { const out = []; for (let i = 0; i < (n || 1); i++) out.push(g.addUnit(type, o, x + (i % 5) * 0.5, y + Math.floor(i / 5) * 0.5)); return out; }

// 1. Construction d'une maison et population
{
  const g = newGame(); g.rehash();
  const tc = tcOf(g, 0); const v = units(g, 0, 'villager');
  const sp = freeSpot(g, 0, 'house', tc);
  g.command(0, { c: 'build', t: 'house', tx: sp.tx, ty: sp.ty, ids: v.map(x => x.id) });
  run(g, 40);
  const h = g.list.find(e => e.t === 'house' && e.o === 0);
  ok(h && h.built, 'maison construite');
  ok(g.players[0].popCap === 10, 'population +5 (' + g.players[0].popCap + ')');
}
// 2. Récolte de bois et dépôt
{
  const g = newGame({ startRes: 'standard' }); g.rehash();
  const tc = tcOf(g, 0); const v = units(g, 0, 'villager')[0];
  const tree = g.findRes(0, tc.x, tc.y, 'w', 25, 0, 'tree');
  const w0 = g.players[0].res.w;
  g.command(0, { c: 'target', id: tree.id, ids: [v.id] });
  run(g, 90);
  ok(g.players[0].res.w > w0 + 15, 'bois récolté (' + Math.floor(g.players[0].res.w - w0) + ')');
}
// 3. Moutons, chasse au cerf, baies
{
  const g = newGame({ startRes: 'standard' }); g.rehash();
  const v = units(g, 0, 'villager');
  const sheep = units(g, 0, 'sheep')[0];
  const f0 = g.players[0].res.f;
  g.command(0, { c: 'target', id: sheep.id, ids: [v[0].id] });
  const berry = g.findRes(0, v[1].x, v[1].y, 'f', 30, 0, 'berry');
  g.command(0, { c: 'target', id: berry.id, ids: [v[1].id] });
  const deer = g.list.find(e => !e.dead && e.t === 'deer');
  g.command(0, { c: 'target', id: deer.id, ids: [v[2].id] });
  run(g, 120);
  ok(g.players[0].res.f > f0 + 40, 'nourriture récoltée (' + Math.floor(g.players[0].res.f - f0) + ')');
  ok(!g.ents.get(sheep.id) || g.ents.get(sheep.id).dead, 'mouton abattu');
}
// 4. Ferme : nécessite un moulin, ressème automatiquement
{
  const g = newGame(); g.rehash();
  const tc = tcOf(g, 0); const v = units(g, 0, 'villager')[0];
  let sp = freeSpot(g, 0, 'farm', tc);
  g.command(0, { c: 'build', t: 'farm', tx: sp.tx, ty: sp.ty, ids: [v.id] });
  g.step();
  ok(!g.list.some(e => e.t === 'farm'), 'ferme refusée sans moulin');
  const mill = g.addBld('mill', 0, sp.tx, sp.ty, true);
  sp = freeSpot(g, 0, 'farm', tc);
  g.command(0, { c: 'build', t: 'farm', tx: sp.tx, ty: sp.ty, ids: [v.id] });
  run(g, 30);
  const farm = g.list.find(e => !e.dead && e.t === 'farm');
  ok(farm && farm.built, 'ferme construite');
  farm.food = 3;
  run(g, 30);
  const farm2 = g.list.find(e => !e.dead && e.t === 'farm');
  ok(farm2 && farm2.id !== farm.id, 'ferme ressemée automatiquement');
  void mill;
}
// 5. Passage d'âge
{
  const g = newGame(); g.rehash();
  const tc = tcOf(g, 0);
  g.command(0, { c: 'research', id: tc.id, t: 'age1' }); g.step();
  ok(!tc.q.length, 'âge refusé sans bâtiments requis');
  g.addBld('barracks', 0, ...Object.values(freeSpot(g, 0, 'barracks', tc)), true);
  g.addBld('mill', 0, ...Object.values(freeSpot(g, 0, 'mill', tc)), true);
  g.command(0, { c: 'research', id: tc.id, t: 'age1' });
  run(g, 140);
  ok(g.players[0].age === 1, 'Âge des Seigneurs atteint');
}
// 6. Combat : contre-attaques (lanciers vs cavalerie)
{
  const g = newGame({ startAge: 2 });
  const sp = spawnAt(g, 'spear', 0, 38, 38, 8);
  const kn = spawnAt(g, 'knight', 1, 41, 38, 4);
  g.rehash();
  g.command(0, { c: 'target', ids: sp.map(u => u.id), id: kn[0].id });
  run(g, 40);
  const ks = kn.filter(k => !k.dead).length, ss = sp.filter(s => !s.dead).length;
  ok(ks === 0 && ss > 0, 'lanciers battent les chevaliers (cav restants ' + ks + ', lanciers ' + ss + ')');
}
// 7. Archers contre infanterie, projectiles
{
  const g = newGame();
  const ar = spawnAt(g, 'archer', 0, 38, 38, 6);
  const mi = spawnAt(g, 'militia', 1, 44, 38, 3);
  g.rehash();
  g.command(1, { c: 'target', ids: mi.map(u => u.id), id: ar[0].id });
  run(g, 40);
  ok(mi.every(m => m.dead), 'archers tuent les miliciens');
}
// 8. Garnison, cloche, tirs de l'hôtel de ville
{
  const g = newGame(); g.rehash();
  const tc = tcOf(g, 0);
  g.command(0, { c: 'bell', on: true });
  run(g, 15);
  ok(tc.gar.length === 3, 'villageois abrités (' + tc.gar.length + ')');
  const en = spawnAt(g, 'militia', 1, tc.x + 4, tc.y + 4, 2);
  g.rehash();
  run(g, 30);
  ok(en.every(e => e.dead), 'l\'hôtel de ville abat les ennemis');
  g.command(0, { c: 'bell', on: false }); g.step();
  ok(tc.gar.length === 0 && units(g, 0, 'villager').every(v => !v.inside), 'fin d\'alerte');
}
// 9. Murs, portes et chemin
{
  const g = newGame({ startAge: 1 }); g.rehash();
  const tc = tcOf(g, 0); const v = units(g, 0, 'villager');
  const y = Math.floor(tc.y) + 6;
  const x0 = Math.floor(tc.x) - 4, x1 = Math.floor(tc.x) + 4;
  g.command(0, { c: 'wall', t: 'wall', ax: x0, ay: y, bx: x1, by: y, ids: v.map(x => x.id) });
  g.step();
  const walls = g.list.filter(e => e.t === 'wall');
  ok(walls.length >= 7, 'mur posé (' + walls.length + ' segments)');
  run(g, 80);
  ok(walls.every(w => w.built || w.dead), 'mur construit');
  const line = R.wallLine(0, 0, 5, 3, 40);
  let cont = true; for (let i = 1; i < line.length; i++) if (Math.abs(line[i][0] - line[i - 1][0]) + Math.abs(line[i][1] - line[i - 1][1]) !== 1) cont = false;
  ok(cont && line[line.length - 1][0] === 5 && line[line.length - 1][1] === 3, 'ligne de mur continue');
  // porte : passage allié seulement
  const wall = walls[3];
  const gx = wall.tx, gy = wall.ty;
  g.remove(wall);
  const gate = g.addBld('gate', 0, gx, gy, true);
  ok(g.pf.passable(gx, gy, g.mask(0)) && !g.pf.passable(gx, gy, g.mask(1)), 'porte : alliés oui, ennemis non');
  void gate;
}
// 10. Moine : soin et conversion
{
  const g = newGame({ startAge: 2 });
  const m = spawnAt(g, 'monk', 0, 40, 40, 1)[0];
  const k = spawnAt(g, 'knight', 1, 46, 40, 1)[0];
  g.rehash();
  g.command(0, { c: 'target', ids: [m.id], id: k.id });
  run(g, 25);
  ok(k.o === 0 || k.dead, 'conversion réussie');
  const hurt = spawnAt(g, 'militia', 0, 41, 41, 1)[0]; hurt.hp = 10;
  g.rehash(); g.setCmd(m, null); m.faith = 100;
  run(g, 30);
  ok(hurt.hp > 20, 'soin du moine (' + Math.round(hurt.hp) + ')');
}
// 11. Siège : bélier et trébuchet
{
  const g = newGame({ startAge: 3 });
  const tc1 = tcOf(g, 1);
  const rams = spawnAt(g, 'ram', 0, tc1.x - 8, tc1.y, 4);
  g.rehash();
  g.command(0, { c: 'target', ids: rams.map(r => r.id), id: tc1.id });
  run(g, 120);
  ok(tc1.dead || tc1.hp < tc1.mhp * 0.5, 'béliers endommagent l\'hôtel de ville (' + Math.round(tc1.hp) + ')');
  const g2 = newGame({ startAge: 3 });
  const t2 = tcOf(g2, 1);
  const tr = spawnAt(g2, 'treb', 0, t2.x - 14, t2.y, 1)[0];
  g2.rehash();
  g2.command(0, { c: 'target', ids: [tr.id], id: t2.id });
  run(g2, 60);
  ok(t2.hp < t2.mhp, 'trébuchet tire (' + Math.round(t2.hp) + ')');
  ok(!tr.packed, 'trébuchet déployé');
}
// 12. Marché
{
  const g = newGame({ startAge: 1 }); g.rehash();
  const tc = tcOf(g, 0);
  const sp = freeSpot(g, 0, 'market', tc);
  g.addBld('market', 0, sp.tx, sp.ty, true);
  const g0 = g.players[0].res.g;
  g.command(0, { c: 'market', op: 'sell', r: 'w' }); g.step();
  ok(g.players[0].res.g > g0, 'vente au marché');
  const w0 = g.players[0].res.w;
  g.command(0, { c: 'market', op: 'buy', r: 'w' }); g.step();
  ok(g.players[0].res.w === w0 + 100, 'achat au marché');
}
// 13. Merveille : victoire
{
  const g = newGame({ startAge: 3 }); g.rehash();
  const tc = tcOf(g, 0);
  const sp = freeSpot(g, 0, 'wonder', tc);
  const w = g.addBld('wonder', 0, sp.tx, sp.ty, false);
  w.prog = 0.999; w.hp = w.mhp - 1;
  const v = units(g, 0, 'villager')[0];
  g.command(0, { c: 'target', id: w.id, ids: [v.id] });
  run(g, R.WONDER_TIME + 30);
  ok(g.winner && g.winner.team.includes(0) && g.winner.why === 'merveille', 'victoire par merveille');
}
// 14. Conquête et abandon
{
  const g = newGame(); g.rehash();
  g.command(1, { c: 'resign' }); run(g, 2);
  ok(g.winner && g.winner.team.includes(0), 'victoire par abandon');
}
// 15. Production, file, annulation et remboursement, logement
{
  const g = newGame({ startRes: 'standard' }); g.rehash();
  const tc = tcOf(g, 0);
  const f0 = g.players[0].res.f;
  g.command(0, { c: 'train', id: tc.id, t: 'villager', n: 3 }); g.step();
  ok(tc.q.length === 3 && Math.round(g.players[0].res.f) === f0 - 150, 'file de 3 villageois');
  g.command(0, { c: 'cancel', id: tc.id, qi: 2 }); g.step();
  ok(tc.q.length === 2 && Math.round(g.players[0].res.f) === f0 - 100, 'annulation remboursée');
  run(g, 60);
  ok(g.players[0].pop === 5 && tc.q.length === 1 && tc.q[0].housed, 'production bloquée par la population');
}
// 16. Fuzz : commandes invalides ou malveillantes
{
  const g = newGame(); g.rehash();
  const rnd = R.rng(7);
  const junk = [null, undefined, 0, -1, 1e12, NaN, Infinity, 'x', {}, [], [1, 2], { toString: 1 }, '__proto__'];
  const pick = a => a[Math.floor(rnd() * a.length)];
  const cmds = ['move', 'target', 'stop', 'garrison', 'ungarrison', 'bell', 'build', 'wall', 'train', 'research', 'cancel', 'rally', 'delete', 'market', 'stance', 'tribute', 'xx'];
  const ids = () => { const all = [...g.ents.keys()]; return rnd() < 0.3 ? pick(junk) : [pick(all), pick(all), pick(junk)]; };
  for (let i = 0; i < 4000; i++) {
    const c = { c: pick(cmds), ids: ids(), id: rnd() < 0.5 ? pick([...g.ents.keys()]) : pick(junk), x: rnd() < 0.7 ? rnd() * 120 - 10 : pick(junk), y: rnd() < 0.7 ? rnd() * 120 - 10 : pick(junk),
      t: pick(Object.keys(U).concat(Object.keys(B), Object.keys(R.TECHS), junk)), tx: rnd() * 90, ty: rnd() * 90, ax: rnd() * 90, ay: rnd() * 90, bx: rnd() * 90, by: rnd() * 90, n: pick([1, 5, 100, -3, junk[5]]), qi: pick([0, 1, 9, -1]), op: pick(['buy', 'sell', 'x']), r: pick(['f', 'w', 'g', 's', 'x']), on: rnd() < 0.5, am: rnd() < 0.5, to: pick([0, 1, 2, -1, junk[5], 'x']), f: pick([0, 1, undefined]) };
    g.command(rnd() < 0.5 ? 0 : 1, rnd() < 0.05 ? pick(junk) : c);
    if (i % 10 === 0) { g.step(); g.ev.length = 0; }
  }
  run(g, 20);
  let bad = 0;
  for (const e of g.list) if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp)) bad++;
  for (const p of g.players) for (const k of R.RES) if (!isFinite(p.res[k]) || p.res[k] < -0.01) { bad++; console.log('  res', p.name, k, p.res[k]); }
  for (const e of g.list) if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp)) console.log('  ent', e.t, e.x, e.y, e.hp);
  ok(bad === 0, 'fuzz : état cohérent (' + bad + ' anomalies)');
}
// 17. Instantanés réseau : aller-retour
{
  const g = newGame({ players: [{ name: 'A', color: 0, ai: 'normal' }, { name: 'B', color: 1, ai: 'normal' }] });
  run(g, 120);
  if (R.Mirror) {
    let T = ''; for (let i = 0; i < g.T.length; i++) T += String.fromCharCode(48 + g.T[i]);
    const m = new R.Mirror({ N: g.N, T, me: 0 });
    m.apply({ u: g.list.filter(e => !e.dead).map(R.snapEnt), p: g.players.map(R.snapPlayer) });
    let diff = 0;
    for (const e of g.list) {
      if (e.dead) continue;
      const c = m.ents.get(e.id);
      if (!c || Math.abs(c.x - e.x) > 0.01 || c.o !== e.o || c.t !== e.t) diff++;
    }
    ok(diff === 0 && m.ents.size === g.list.filter(e => !e.dead).length, 'miroir identique (' + diff + ' écarts)');
    ok(m.players[0].res.f === Math.floor(g.players[0].res.f), 'ressources miroir');
    ok(m.canPlace(0, 'house', 1, 1) === false, 'miroir : placement sur la bordure refusé');
  }
}
// 18. Longues parties IA à 4 et 6 joueurs (stabilité)
for (const n of (process.env.QUICK ? [] : [4, 6])) {
  const players = []; for (let i = 0; i < n; i++) players.push({ name: 'IA' + i, color: i, ai: ['facile', 'normal', 'difficile'][i % 3], team: n === 4 ? (i % 2) + 1 : 0 });
  const g = new R.Game({ seed: 100 + n, players, size: 'normale', mapType: n === 4 ? 'lacs' : 'foret', startRes: 'standard', popCap: 125, speed: 1.7 });
  const t0 = Date.now();
  run(g, 1500);
  let bad = 0; for (const e of g.list) if (!isFinite(e.x) || !isFinite(e.y)) bad++;
  ok(bad === 0, n + ' joueurs : positions valides');
  console.log('  ' + n + ' IA : ' + Math.round(g.time) + ' s de jeu en ' + (Date.now() - t0) + ' ms, âges ' + g.players.map(p => p.age).join(','), 'pop', g.players.map(p => p.pop).join(','));
}


// ---------- Mécaniques proches du genre ----------
function freeArea(g, cx, cy) { // case dégagée proche de (cx,cy)
  for (let r = 0; r < 20; r++) for (let k = 0; k < 24; k++) {
    const x = Math.floor(cx + Math.cos(k / 24 * 6.283) * r), y = Math.floor(cy + Math.sin(k / 24 * 6.283) * r);
    let okk = true;
    for (let j = -3; j <= 3 && okk; j++) for (let i = -3; i <= 3; i++) if (!g.pf.passable(x + i, y + j, 0) || g.blk[(y + j) * g.N + x + i]) { okk = false; break; }
    if (okk) return { x: x + 0.5, y: y + 0.5 };
  }
  return { x: cx, y: cy };
}
// 19. Cloche : les villageois sans place ne retournent pas travailler, et reprennent ensuite
{
  const g = newGame(); g.rehash();
  const tc = tcOf(g, 0);
  for (let i = 0; i < 22; i++) g.addUnit('villager', 0, tc.x + 3 + (i % 5) * 0.5, tc.y + 5 + Math.floor(i / 5) * 0.5);
  const tree = g.findRes(0, tc.x, tc.y, 'w', 30, 0, 'tree');
  g.command(0, { c: 'target', id: tree.id, ids: units(g, 0, 'villager').map(v => v.id) }); run(g, 10);
  g.command(0, { c: 'bell', on: true }); run(g, 25);
  const vs = units(g, 0, 'villager');
  ok(tc.gar.length === 15, 'cloche : TC plein (' + tc.gar.length + ')');
  ok(vs.filter(v => !v.inside && v.cmd && v.cmd.k === 'gather').length === 0, 'cloche : aucun villageois ne retourne au travail (' + vs.filter(v => !v.inside && v.cmd && v.cmd.k === 'gather').length + ')');
  g.command(0, { c: 'bell', on: false }); g.step();
  ok(units(g, 0, 'villager').filter(v => v.cmd && v.cmd.k === 'gather').length === 25, 'fin d\'alerte : tous reprennent la récolte');
  // un deuxième abri (tour) est utilisé quand le TC est plein
  const g2 = newGame({ startAge: 1 }); g2.rehash();
  const tc2 = tcOf(g2, 0);
  for (let i = 0; i < 17; i++) g2.addUnit('villager', 0, tc2.x + 3 + (i % 5) * 0.5, tc2.y + 5 + Math.floor(i / 5) * 0.5);
  const sp = freeSpot(g2, 0, 'tower', tc2); const tw = g2.addBld('tower', 0, sp.tx, sp.ty, true);
  g2.rehash(); g2.command(0, { c: 'bell', on: true }); run(g2, 30);
  ok(tc2.gar.length + tw.gar.length === 20, 'cloche : TC + tour (' + tc2.gar.length + '+' + tw.gar.length + ')');
}
// 20. Vitesse de construction : 3t/(n+2)
{
  const times = {};
  for (const n of [1, 4, 8]) {
    const g = newGame({ startAge: 2 }); g.rehash();
    const tc = tcOf(g, 0);
    const vs = spawnAt(g, 'villager', 0, tc.x + 4, tc.y + 4, n);
    const sp = freeSpot(g, 0, 'castle', tc);
    g.command(0, { c: 'build', t: 'castle', tx: sp.tx, ty: sp.ty, ids: vs.map(v => v.id) });
    let t = 0, b = null;
    for (let i = 0; i < 4000; i++) { g.step(); g.ev.length = 0; t += R.TICK * g.speed; b = g.list.find(e => e.t === 'castle'); if (b && b.built) break; }
    times[n] = t;
  }
  ok(Math.abs(times[1] - 200) < 8 && Math.abs(times[4] - 100) < 6 && Math.abs(times[8] - 60) < 6, 'construction 1/4/8 bâtisseurs : ' + Object.values(times).map(Math.round).join('/') + ' s (200/100/60)');
}
// 21. Riposte d'une unité en attaque automatique sur un bâtiment
{
  const g = newGame(); g.rehash();
  const c = freeArea(g, g.N / 2, g.N / 2);
  const sp = freeSpot(g, 1, 'house', c); const h = g.addBld('house', 1, sp.tx, sp.ty, true);
  const m = g.addUnit('militia', 0, h.x - 3, h.y);
  g.rehash(); g.command(0, { c: 'move', ids: [m.id], x: h.x - 1.5, y: h.y, am: true }); run(g, 4);
  ok(m.cmd && m.cmd.k === 'attack' && g.ents.get(m.cmd.t) === h, 'attaque-déplacement sur la maison');
  const a = g.addUnit('archer', 1, h.x - 5, h.y + 2); g.rehash();
  g.command(1, { c: 'target', id: m.id, ids: [a.id] }); run(g, 3);
  ok(m.dead || (m.cmd && m.cmd.t === a.id), 'le milicien se retourne contre l\'archer');
  run(g, 25);
  ok(a.dead && !m.dead && m.cmd && m.cmd.k === 'attack' && m.cmd.t === h.id, 'archer tué puis reprise de l\'attaque de la maison');
}
// 22. Déplacement groupé : vitesse du plus lent, mêlée devant
{
  const g = newGame({ startAge: 2 }); g.rehash();
  const c = freeArea(g, 30, 30);
  const kn = spawnAt(g, 'knight', 0, c.x, c.y, 3), ar = spawnAt(g, 'archer', 0, c.x + 1, c.y + 1.5, 3), ram = spawnAt(g, 'ram', 0, c.x - 1, c.y + 1, 1);
  const all = kn.concat(ar, ram); g.rehash();
  const d = freeArea(g, c.x + 18, c.y + 4);
  const gx = all.reduce((t, u) => t + u.x, 0) / all.length, gy = all.reduce((t, u) => t + u.y, 0) / all.length;
  g.command(0, { c: 'move', ids: all.map(u => u.id), x: d.x, y: d.y });
  g.step();
  ok(all.every(u => u.cmd && u.cmd.gs === U.ram.speed), 'vitesse commune = bélier');
  const dir = [(d.x - gx), (d.y - gy)], L = Math.hypot(...dir);
  const proj = u => ((u.cmd.x - d.x) * dir[0] + (u.cmd.y - d.y) * dir[1]) / L;
  ok(Math.min(...kn.map(proj)) >= Math.max(...ar.map(proj)) - 0.01 && Math.min(...ar.map(proj)) >= proj(ram[0]) - 0.01, 'formation : cavaliers devant, archers puis bélier derrière');
  run(g, 20);
  const spread = Math.max(...all.map(u => Math.hypot(u.x - d.x, u.y - d.y))) - Math.min(...all.map(u => Math.hypot(u.x - d.x, u.y - d.y)));
  ok(spread < 4, 'le groupe avance ensemble (écart ' + spread.toFixed(1) + ')');
  g.command(0, { c: 'move', ids: all.map(u => u.id), x: c.x, y: c.y, f: 0 }); g.step();
  ok(all.every(u => !u.cmd.gs), 'formation désactivée (f:0)');
}
// 23. Postures
{
  const g = newGame({ startAge: 1 }); g.rehash();
  const c = freeArea(g, 36, 36);
  const a = spawnAt(g, 'archer', 0, c.x, c.y, 1)[0];
  const e = spawnAt(g, 'militia', 1, c.x + 5.5, c.y, 1)[0];
  g.command(0, { c: 'stance', ids: [a.id], n: 2 }); g.rehash(); run(g, 4);
  ok(a.stance === 2 && Math.hypot(a.x - c.x, a.y - c.y) < 0.3 && e.hp === e.mhp, 'tenir la position : pas de poursuite hors de portée');
  e.x = c.x + 3; e.y = c.y; g.setCmd(e, null); e.stance = 3; g.rehash(); run(g, 3);
  ok(e.hp < e.mhp && Math.hypot(a.x - c.x, a.y - c.y) < 0.3, 'tenir la position : tire sur ce qui est à portée');
  ok(!e.cmd, 'passif : ne riposte pas');
  const snap = R.snapEnt(a); const back = R.unsnapEnt(snap, {});
  ok(snap.length === 16 && back.stance === 2, 'posture transmise dans l\'instantané');
  // agressif : poursuit plus loin que défensif
  const g2 = newGame({ startAge: 1 }); g2.rehash();
  const c2 = freeArea(g2, 36, 36);
  const s0 = spawnAt(g2, 'scout', 0, c2.x, c2.y, 1)[0], s1 = spawnAt(g2, 'scout', 0, c2.x, c2.y + 1, 1)[0];
  g2.command(0, { c: 'stance', ids: [s1.id], n: 1 }); g2.step();
  const prey = spawnAt(g2, 'villager', 1, c2.x + 5, c2.y, 1)[0];
  g2.rehash(); run(g2, 1.5);
  ok(s0.cmd && s0.cmd.auto && s1.cmd && s1.cmd.auto, 'les éclaireurs attaquent le villageois');
  void prey;
}
// 24. Projectiles : précision, esquive, tirs perdus, tir ami du mangonneau
{
  const g = newGame({ startAge: 1 }); g.rehash();
  const c = freeArea(g, 40, 40);
  const ar = spawnAt(g, 'archer', 0, c.x, c.y, 1)[0];
  const tg = spawnAt(g, 'ram', 1, c.x + 3, c.y, 1)[0]; // cible immobile, sans riposte
  tg.hp = tg.mhp = 1e6;
  const st = R.unitStat(g.players[0], 'archer');
  let shots = 0, hits = 0;
  for (let i = 0; i < 300; i++) { const h0 = tg.hp; g.fire(ar, tg, st.atk, 1); for (let k = 0; k < 8; k++) g.updProj(0.17); shots++; if (tg.hp < h0) hits++; }
  ok(hits / shots > 0.7 && hits / shots < 0.9, 'précision des archers ≈ 80 % (' + Math.round(hits / shots * 100) + ' %)');
  // une cible qui s'est déplacée esquive
  const h1 = tg.hp; g.fire(ar, tg, Object.assign({}, st.atk, { acc: 1 }), 1); tg.x += 1.5; for (let k = 0; k < 8; k++) g.updProj(0.17);
  ok(tg.hp === h1, 'esquive d\'une flèche');
  tg.x -= 1.5;
  // flèche perdue sur un voisin
  const nb = spawnAt(g, 'militia', 1, c.x + 3, c.y + 0.3, 1)[0]; g.rehash();
  const hn = nb.hp; g.fire(ar, tg, Object.assign({}, st.atk, { acc: 1 }), 1); tg.x += 2; for (let k = 0; k < 8; k++) g.updProj(0.17);
  ok(nb.hp < hn && nb.hp > hn - st.atk.d, 'flèche perdue : demi-dégâts au voisin');
  // mangonneau : blesse aussi ses propres unités, et évite de tirer sur un groupe ami
  const g3 = newGame({ startAge: 2 }); g3.rehash();
  const c3 = freeArea(g3, 44, 44);
  const own = g3.addUnit('militia', 0, c3.x + 6, c3.y), en = g3.addUnit('militia', 1, c3.x + 6.3, c3.y), mg = g3.addUnit('mangonel', 0, c3.x, c3.y);
  g3.rehash(); g3.command(0, { c: 'target', id: en.id, ids: [mg.id] }); g3.command(0, { c: 'stop', ids: [own.id] }); run(g3, 4);
  ok(own.hp < own.mhp, 'tir ami du mangonneau');
  const g4 = newGame({ startAge: 2 }); g4.rehash();
  const c4 = freeArea(g4, 44, 44);
  const mg4 = g4.addUnit('mangonel', 0, c4.x, c4.y);
  spawnAt(g4, 'militia', 0, c4.x + 5.6, c4.y - 0.4, 3); g4.addUnit('militia', 1, c4.x + 6, c4.y);
  g4.rehash();
  ok(g4.findTarget(mg4, 9) === null, 'mangonneau : pas de tir automatique sur une mêlée où ses troupes dominent');
}
// 25. Âge des Couronnes : améliorations d'unités
{
  const g = newGame({ startAge: 3 }); g.rehash();
  const p = g.players[0];
  const sp = freeSpot(g, 0, 'barracks', tcOf(g, 0)); const br = g.addBld('barracks', 0, sp.tx, sp.ty, true);
  g.command(0, { c: 'research', id: br.id, t: 'brise' }); g.step();
  ok(!br.q.length, 'Brise-ligne nécessite le Bretteur');
  p.techs.manatarms = p.techs.longsword = true; p._sc = {};
  const m = g.addUnit('militia', 0, br.x + 3, br.y + 3);
  g.command(0, { c: 'research', id: br.id, t: 'brise' });
  run(g, 70);
  const s = R.unitStat(p, 'militia');
  ok(p.techs.brise && s.name === 'Brise-ligne' && s.hp === 70 && m.mhp === 70, 'Brise-ligne recherché (' + s.name + ', ' + m.mhp + ' PV)');
  p.techs.grandmang = true; p._sc = {};
  const mg = R.unitStat(p, 'mangonel');
  ok(mg.atk.splash === 1.5 && mg.atk.r === 8 && mg.atk.d === 50, 'Grand mangonneau : zone 1,5');
  for (const [u, t] of [['spear', 'guisarm'], ['archer', 'arbal'], ['scout', 'estradiot'], ['knight', 'banneret'], ['ram', 'ferre']]) {
    ok(R.TECHS[t].age === 3 && (R.UNITS[u].up || []).some(x => x.tech === t) && Object.values(R.BLDS).some(b => (b.techs || []).includes(t)), 'amélioration ' + t + ' définie');
  }
  ok(R.unitStat({ techs: { crossbow: 1 } }, 'archer').atk.acc === 0.85 && R.unitStat({ techs: { crossbow: 1, arbal: 1 } }, 'archer').atk.acc === 0.9, 'précision des arbalétriers');
}
// 26. Nouvelles technologies : cavalerie, tours, mortier, économie tardive
{
  const g = newGame({ startAge: 3 }); g.rehash();
  const p = g.players[0];
  const base = R.unitStat(p, 'knight'); const hp0 = base.hp, sp0 = base.speed;
  p.techs.haras = p.techs.ferrage = true; p._sc = {};
  const k = R.unitStat(p, 'knight');
  ok(k.hp === hp0 + 20 && Math.abs(k.speed - sp0 * 1.1) < 1e-9, 'Haras +20 PV, Ferrage +10 % vitesse');
  const tc = tcOf(g, 0);
  const sp = freeSpot(g, 0, 'tower', tc); const tw = g.addBld('tower', 0, sp.tx, sp.ty, true);
  const r0 = R.bldStat(p, 'tower').atk.r;
  g.command(0, { c: 'research', id: tw.id, t: 'tourrenf' }); run(g, 35);
  ok(p.techs.tourrenf && tw.mhp === 1000 && R.bldStat(p, 'tower').atk.r === r0 + 1, 'Tour renforcée (' + tw.mhp + ' PV)');
  const ms = freeSpot(g, 0, 'market', tc); const mk = g.addBld('market', 0, ms.tx, ms.ty, true);
  const tcHp = tc.mhp;
  g.command(0, { c: 'research', id: mk.id, t: 'mortier' }); run(g, 55);
  ok(p.techs.mortier && tc.mhp === Math.round(tcHp * 1.1) && R.bldStat(p, 'house').arm[1] === B.house.arm[1] + 1, 'Mortier de chaux : +10 % PV, +1 armure (' + tc.mhp + ')');
  const w0 = R.gatherRate(p, 'w'), s0 = R.gatherRate(p, 's');
  p.techs.saw = p.techs.scierie = p.techs.stonemin = p.techs.galeries = true;
  ok(Math.abs(R.gatherRate(p, 'w') / w0 - 1.32) < 0.01 && Math.abs(R.gatherRate(p, 's') / s0 - 1.3225) < 0.01, 'Scierie hydraulique et Galeries de pierre');
  const mill = g.addBld('mill', 0, ...Object.values(freeSpot(g, 0, 'mill', tc)), true);
  const farm = g.addBld('farm', 0, ...Object.values(freeSpot(g, 0, 'farm', tc)), true);
  const f0 = farm.food; p.techs.plow = true;
  g.command(0, { c: 'research', id: mill.id, t: 'assolement' }); run(g, 75);
  ok(p.techs.assolement && farm.food === f0 + 175 && R.farmFood(p) === 175 + 125 + 175, 'Assolement : fermes +175');
}
// 27. Capacité des villageois et file de production
{
  ok(R.unitStat({ techs: { wheel: 1 } }, 'villager').cap === 12 && R.unitStat({ techs: { wheel: 1, cart: 1 } }, 'villager').cap === 17, 'capacité 10 → 12 → 17');
  const g = newGame(); g.rehash();
  const tc = tcOf(g, 0);
  for (let i = 0; i < 3; i++) g.command(0, { c: 'train', id: tc.id, t: 'villager', n: 5 });
  g.step();
  ok(tc.q.length === 10 && R.MAX_QUEUE === 10, 'file de production : 10 (' + tc.q.length + ')');
}
// 28. Sanglier
{
  const boarDef = R.FEATURES.boar; R.FEATURES.boar = true;
  const gB = newGame({ startRes: 'standard' });
  const boars = gB.list.filter(e => e.t === 'boar');
  ok(boars.length === 4 && boars.every(b => b.o === -1), 'deux sangliers par joueur (' + boars.length + ')');
  R.FEATURES.boar = false;
  const g = newGame({ startRes: 'standard' }); g.rehash();
  const c = freeArea(g, g.N / 2, g.N / 2);
  const boar = g.addUnit('boar', -1, c.x, c.y);
  const v = g.addUnit('villager', 0, c.x + 2, c.y);
  g.rehash(); g.command(0, { c: 'target', id: boar.id, ids: [v.id] }); run(g, 6);
  ok(boar.cmd && boar.cmd.k === 'attack' && boar.cmd.t === v.id && v.hp < v.mhp, 'le sanglier charge le chasseur');
  const vs = spawnAt(g, 'villager', 0, c.x - 2, c.y, 3); g.rehash();
  g.command(0, { c: 'target', id: boar.id, ids: vs.map(x => x.id) });
  const f0 = g.players[0].res.f;
  run(g, 90);
  const carc = g.list.find(e => !e.dead && e.t === 'carcass' && e.from === 'boar');
  ok(boar.dead && (carc ? carc.amt < 340 : true) && g.players[0].res.f > f0, 'sanglier abattu à plusieurs puis dépecé (+' + Math.floor(g.players[0].res.f - f0) + ')');
  ok(R.gatherRate(g.players[0], 'hunt') === 0.40, 'récolte de sanglier = chasse');
  // abandon de la poursuite loin du terrier
  const g2 = newGame(); g2.rehash();
  const c2 = freeArea(g2, g2.N / 2, g2.N / 2);
  const b2 = g2.addUnit('boar', -1, c2.x, c2.y);
  const sc = g2.addUnit('scout', 0, c2.x + 1, c2.y); g2.rehash();
  g2.damage(b2, { d: 1, t: 'm' }, 0, sc);
  g2.command(0, { c: 'move', ids: [sc.id], x: c2.x + 30, y: c2.y }); run(g2, 25);
  ok(Math.hypot(b2.x - c2.x, b2.y - c2.y) < 3, 'le sanglier retourne à son terrier');
  // les villageois ne vont pas seuls vers un sanglier vivant
  ok(g.findRes(0, c.x, c.y, 'f', 30, 0, 'animal') === null || g.findRes(0, c.x, c.y, 'f', 30, 0, 'animal').t !== 'boar', 'pas de sanglier en récolte automatique');
  R.FEATURES.boar = boarDef;
}
// 29. Bâtisseurs : seulement ses propres fondations ; ralliement sur ressource épuisée
{
  const g = newGame({ players: [{ name: 'A', color: 0, team: 1 }, { name: 'B', color: 1, team: 1 }] }); g.rehash();
  const tc = tcOf(g, 0); const v = units(g, 0, 'villager')[0];
  const sp = freeSpot(g, 1, 'house', v); const fnd = g.addBld('house', 1, sp.tx, sp.ty, false);
  ok(g.nearFoundation(v, 30) !== fnd, 'pas de construction des fondations d\'un allié');
  const tree = g.findRes(0, tc.x, tc.y, 'w', 30, 0, 'tree');
  g.command(0, { c: 'rally', id: tc.id, x: tree.x, y: tree.y, tid: tree.id }); g.step();
  ok(tc.rally.kind === 'tree' && tc.rally.rt === 'w', 'ralliement : type de ressource mémorisé');
  g.remove(tree);
  g.produce(tc, 'villager');
  const nv = g.list[g.list.length - 1];
  ok(nv.t === 'villager' && nv.cmd && nv.cmd.k === 'gather' && nv.cmd.rt === 'w', 'ralliement sur arbre abattu : récolte l\'arbre voisin');
}
// 30. Données : château +20 pop, hôtel de ville à l'âge III, merveille sans nourriture
{
  ok(B.castle.pop === 20 && B.tc.age === 2 && !B.wonder.cost.f, 'château +20 population, hôtel de ville à l\'Âge des Forteresses, merveille bois/or/pierre');
  const g = newGame({ startAge: 2 }); g.rehash();
  g.addBld('castle', 0, ...Object.values(freeSpot(g, 0, 'castle', tcOf(g, 0))), true); g.recount();
  ok(g.players[0].popCap === 25, 'population du château (' + g.players[0].popCap + ')');
}
// 31. Tributs
{
  const g = newGame({ players: [{ name: 'A', color: 0, team: 1 }, { name: 'B', color: 1, team: 1 }, { name: 'C', color: 2, team: 2 }], startRes: 'standard', startAge: 1 }); g.rehash();
  const P = g.players;
  g.command(0, { c: 'tribute', to: 1, r: 'w', n: 100 }); g.step();
  ok(P[0].res.w === 200, 'tribut refusé sans marché');
  g.addBld('market', 0, ...Object.values(freeSpot(g, 0, 'market', tcOf(g, 0))), true);
  g.command(0, { c: 'tribute', to: 1, r: 'w', n: 100 }); g.step();
  ok(P[0].res.w === 100 && P[1].res.w === 270, 'tribut de 100 bois à un allié (30 % de frais)');
  g.command(0, { c: 'tribute', to: 2, r: 'f', n: 100 }); g.command(0, { c: 'tribute', to: 1, r: 'g', n: 500 }); g.command(0, { c: 'tribute', to: 1, r: 'f', n: 37 }); g.command(0, { c: 'tribute', to: 0, r: 'f', n: 100 }); g.step();
  ok(P[0].res.f === 200 && P[0].res.g === 100, 'tributs invalides refusés (ennemi, montant, soi-même)');
}
// 32. IA : brèche dans un mur, réparations
{
  const g = new R.Game({ seed: 5, players: [{ name: 'IA', color: 0, ai: 'difficile' }, { name: 'H', color: 1 }], size: 'normale', mapType: 'plaine', startRes: 'tres', popCap: 200, speed: 1.7, startAge: 2 });
  g.rehash();
  const ai = g.players[0].brain;
  const tc1 = tcOf(g, 1);
  const wy = Math.floor(tc1.y) - 6; const ws = [];
  for (let x = Math.floor(tc1.x) - 6; x <= Math.floor(tc1.x) + 6; x++) if (g.canPlace(1, 'wall', x, wy)) ws.push(g.addBld('wall', 1, x, wy, true));
  const army = spawnAt(g, 'militia', 0, tc1.x, wy - 4, 6);
  for (const u of army) u.pathOk = false;
  ok(ws.length > 5 && ws.includes(ai.wallToBreach(army, tc1)), 'IA : choisit un segment de mur à abattre');
  const tc0 = tcOf(g, 0); tc0.hp = tc0.mhp * 0.5;
  const s = ai.scan(); ai.threat = null; ai.n = 5; ai.repair(s);
  ok(units(g, 0, 'villager').some(v => v.cmd && v.cmd.k === 'build' && v.cmd.t === tc0.id), 'IA : répare son hôtel de ville');
}

ok(errs.length === 0, 'aucune exception (' + errs.length + ')');
if (errs.length) console.log([...new Set(errs)].slice(0, 5).join('\n'));
console.log(passes + ' réussis, ' + fails + ' échecs');
process.exit(fails ? 1 : 0);
