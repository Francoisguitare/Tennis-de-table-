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
  const cmds = ['move', 'target', 'stop', 'garrison', 'ungarrison', 'bell', 'build', 'wall', 'train', 'research', 'cancel', 'rally', 'delete', 'market', 'xx'];
  const ids = () => { const all = [...g.ents.keys()]; return rnd() < 0.3 ? pick(junk) : [pick(all), pick(all), pick(junk)]; };
  for (let i = 0; i < 4000; i++) {
    const c = { c: pick(cmds), ids: ids(), id: rnd() < 0.5 ? pick([...g.ents.keys()]) : pick(junk), x: rnd() < 0.7 ? rnd() * 120 - 10 : pick(junk), y: rnd() < 0.7 ? rnd() * 120 - 10 : pick(junk),
      t: pick(Object.keys(U).concat(Object.keys(B), Object.keys(R.TECHS), junk)), tx: rnd() * 90, ty: rnd() * 90, ax: rnd() * 90, ay: rnd() * 90, bx: rnd() * 90, by: rnd() * 90, n: pick([1, 5, 100, -3, junk[5]]), qi: pick([0, 1, 9, -1]), op: pick(['buy', 'sell', 'x']), r: pick(['f', 'w', 'g', 's', 'x']), on: rnd() < 0.5, am: rnd() < 0.5 };
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
for (const n of [4, 6]) {
  const players = []; for (let i = 0; i < n; i++) players.push({ name: 'IA' + i, color: i, ai: ['facile', 'normal', 'difficile'][i % 3], team: n === 4 ? (i % 2) + 1 : 0 });
  const g = new R.Game({ seed: 100 + n, players, size: 'normale', mapType: n === 4 ? 'lacs' : 'foret', startRes: 'standard', popCap: 125, speed: 1.7 });
  const t0 = Date.now();
  run(g, 1500);
  let bad = 0; for (const e of g.list) if (!isFinite(e.x) || !isFinite(e.y)) bad++;
  ok(bad === 0, n + ' joueurs : positions valides');
  console.log('  ' + n + ' IA : ' + Math.round(g.time) + ' s de jeu en ' + (Date.now() - t0) + ' ms, âges ' + g.players.map(p => p.age).join(','), 'pop', g.players.map(p => p.pop).join(','));
}

ok(errs.length === 0, 'aucune exception (' + errs.length + ')');
if (errs.length) console.log([...new Set(errs)].slice(0, 5).join('\n'));
console.log(passes + ' réussis, ' + fails + ' échecs');
process.exit(fails ? 1 : 0);
