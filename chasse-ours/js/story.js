/* Chassé d'Ours — l'histoire : « Les ruines de Val-Perdu », cinq chapitres où la furtivité décide de tout. */
const Story = (() => {
  'use strict';
  let G, CH = [], beacon, busy = false;
  const st = { ch: 0, step: 0, n: 0, mask: 0, ghost: true, intro: false };
  const items = [];
  const bits = m => { let n = 0; for (; m; m >>= 1) n += m & 1; return n; };
  const LT_NAMES = ['La Griffe', 'Gros-Louis', 'Tante Ursule'];

  function chapters() {
    const t = World.town, guard = i => G.spawnBear('sentinelle', t.patrols[i][0][0], t.patrols[i][0][1], undefined, { story: true, patrol: t.patrols[i], pi: 0 });
    return [
      {
        title: 'Les chaussures d\'Anselme', cp: [0, 6], xp: 120,
        intro: [
          'Val-Perdu, c\'était ta ville. Il y a trente ans, les ours sont descendus de la montagne derrière un géant balafré : le Baron. Tout le monde a fui.',
          'Tout le monde sauf ton grand-père Anselme, champion de savate, qui a juré de tenir la place à coups de chassés. On ne l\'a jamais revu.',
          'Hier, un colis sans timbre : ses vieilles chaussures de marche, encore tièdes, et un mot. « Reviens. Ils dorment mal quand on frappe fort. »',
        ],
        steps: [
          { type: 'launch', n: 1, text: 'Surprends un ours et envoie-le en chassé furtif', test: d => d.flags.unaware, near: true },
          { type: 'reach', at: t.gate, r: 5.5, text: 'Suis la vieille route vers le nord jusqu\'à la porte de Val-Perdu' },
        ],
        outro: [
          'Cloué sur la porte de la ville, un papier jauni, d\'une écriture que tu connais.',
          '« Si tu lis ça, mes chaussures te vont. Trois pages de mon carnet traînent encore dans les maisons. Méfie-toi des Sentinelles du Baron : de face, elles parent tout. Elles ne s\'envoient que par surprise. Les murs sont tes amis, les murets aussi si tu te baisses. Signé : A. »',
        ],
      },
      {
        title: 'La ville endormie', cp: [t.gate.x, t.gate.z + 6], xp: 200, ghost: true,
        intro: [
          'Derrière la porte, Val-Perdu dort sous le lierre. Des Sentinelles casquées font leur ronde entre les maisons éventrées.',
          'Elles ne voient pas à travers les murs. Accroupi, même un muret te cache. Et un ours qui ne t\'a pas vu, casque ou pas, ça s\'envoie.',
        ],
        enter() { guard(0); guard(1); guard(2); },
        steps: [{ type: 'collect', kind: 'page', at: t.pages, text: 'Récupère les pages du carnet dans les maisons sans te faire voir' }],
        outro: [
          'Page 12. « Le Baron n\'est pas né méchant. Je l\'ai trouvé ourson sous la halle, je l\'ai nourri au miel de la coopérative. »',
          'Page 13. « C\'est le miel qui l\'a rendu fou. Il en voulait toujours plus. Il a pris la ville pour garder la halle, et trois brutes pour garder le reste. »',
          'Page 14. « La cloche. Il déteste la cloche. Quand elle sonne, ses lieutenants accourent pour la faire taire. Sonne-la, et envoie-les. »',
        ],
      },
      {
        title: 'Le clocher', cp: [t.gate.x, t.gate.z + 6], xp: 260,
        intro: [
          'La cloche est tombée du clocher depuis longtemps. Elle gît devant l\'église, intacte, vert-de-grisée.',
          'Un chassé bien armé devrait la faire chanter. Après ça, tu ne seras plus seul sur la place : repère d\'abord les hautes herbes et les murs.',
        ],
        steps: [
          { type: 'ring', at: t.bell, text: 'Sonne la cloche devant l\'église d\'un chassé bien armé' },
          {
            type: 'launch', n: 3, text: 'Envoie les lieutenants du Baron', test: d => d.bear.tag === 'lt', tag: 'lt',
            setup() { for (let i = st.n; i < 3; i++) { const b = G.spawnBear('lieutenant', t.lts[i][0], t.lts[i][1], undefined, { story: true, tag: 'lt', name: LT_NAMES[i] }); G.alertBear(b, true); } },
          },
        ],
        outro: [
          'Trois étoiles de plus au-dessus des montagnes. Sous la halle, quelque chose d\'énorme se retourne en grognant, puis se rendort.',
          'Au dos de la page 14, griffonné : « Sans ses lieutenants il ne sortira pas. Sauf pour son miel. Vole-le pendant qu\'il dort et pose-le sur la fontaine. Dehors, il fonce droit devant lui comme un âne. Sers-toi des murs. »',
        ],
      },
      {
        title: 'Le miel du Baron', cp: [t.gate.x, t.gate.z + 6], xp: 300, ghost: true, dusk: 1,
        intro: [
          'Le soir tombe sur Val-Perdu. Sous la halle, la garde rapprochée du Baron ronfle autour des pots.',
          'Ici, un chassé réveillerait tout le monde. Accroupi, tu ne fais aucun bruit. Debout, chaque pas compte. En courant, tu es cuit.',
        ],
        enter() { for (const [x, z, f] of t.sleepers) G.spawnBear('grizzly', x, z, f, { story: true, state: 'sleep' }); guard(3); guard(1); },
        steps: [
          { type: 'collect', kind: 'pot', at: t.honey, text: 'Vole les pots de miel sous la halle sans réveiller personne' },
          { type: 'reach', at: t.fountain, r: 6.5, text: 'Pose le miel sur la fontaine' },
        ],
        outro: [
          'Tu poses le dernier pot sur la margelle. Le miel coule dans le bassin sec.',
          'Le sol tremble. Derrière toi, la halle se vide d\'un coup : une masse noire, une couronne de travers, une balafre. Le Baron a senti son trésor.',
        ],
      },
      {
        title: 'Le Baron', cp: [t.x - 8, t.z + 20], xp: 600, dusk: 1,
        intro: [
          'Il est trop lourd pour toi. De face, il pare tout.',
          'Mais Anselme l\'a écrit : il fonce droit devant lui. Mets un mur ou la fontaine dans ton dos, écarte-toi au dernier moment, et frappe pendant qu\'il voit des étoiles. Trois fois.',
        ],
        steps: [{ type: 'boss', text: 'Fais-le s\'assommer contre un mur, puis arme ton chassé', setup() { const b = G.spawnBear('baron', t.halle.x - 9.5, t.halle.z, -1.57, { story: true, tag: 'boss', hp: 3, cd: 2 }); G.alertBear(b, true); } }],
        outro: [
          'Le Baron n\'est plus qu\'un point brillant au-dessus des montagnes. Le silence retombe sur la place.',
          'Puis la cloche se remet à sonner. Toute seule. En haut du clocher, une silhouette en bob te fait signe, une tasse fumante à la main.',
          '« Pas mal, petit. Ton pied d\'appui traîne encore un peu. Monte, il reste du miel. »',
          'Mode Légende débloqué : les ours reviennent, plus coriaces, et rapportent davantage d\'XP.',
        ],
      },
    ];
  }

  function init(api, saved) {
    G = api; CH = chapters();
    if (saved) for (const k of ['ch', 'step', 'n', 'mask', 'intro']) if (saved[k] !== undefined) st[k] = saved[k];
    st.ch = Math.min(st.ch | 0, CH.length);
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 70, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc83a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beacon.visible = false; beacon.renderOrder = 3; G.scene.add(beacon);
  }
  const geo = {};
  function mkItem(kind, p, idx) {
    if (!geo.page) {
      geo.page = U.merge([U.part(new THREE.BoxGeometry(0.6, 0.8, 0.05), 0xfff3d4, null, 0.02), U.part(new THREE.BoxGeometry(0.4, 0.05, 0.06), 0x6b4a2f, U.mat(0, 0.2, 0), 0), U.part(new THREE.BoxGeometry(0.4, 0.05, 0.06), 0x6b4a2f, U.mat(0, 0, 0), 0), U.part(new THREE.BoxGeometry(0.28, 0.05, 0.06), 0x6b4a2f, U.mat(-0.06, -0.2, 0), 0)]);
      geo.pot = U.merge([U.part(new THREE.CylinderGeometry(0.42, 0.34, 0.7, 9), 0xf2b62c, null, 0.05), U.part(new THREE.CylinderGeometry(0.46, 0.46, 0.14, 9), 0x8a5a2a, U.mat(0, 0.42, 0), 0.05)]);
      geo.mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x4a3a10 });
    }
    const mesh = new THREE.Mesh(geo[kind], geo.mat); mesh.position.set(p.x, kind === 'page' ? 1.3 : 0.5, p.z); mesh.castShadow = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: Actors.glowTex, color: 0xffc83a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7, fog: false })); glow.scale.setScalar(2.6); mesh.add(glow);
    G.scene.add(mesh); items.push({ x: p.x, z: p.z, kind, idx, mesh });
  }
  function clear() {
    for (const b of G.bears.slice()) if (b.story && b.state !== 'launched') G.removeBear(b);
    items.forEach(i => G.scene.remove(i.mesh)); items.length = 0;
  }
  const cur = () => { const c = CH[st.ch]; return c ? c.steps[st.step] : null; };

  // (re)met en place l'étape en cours : gardes, objets, lumière
  function setupStep() {
    clear(); busy = false;
    const c = CH[st.ch]; World.setDusk(c && c.dusk ? 1 : 0);
    if (!c) return;
    if (c.enter) c.enter();
    const s = c.steps[st.step];
    if (s.setup) s.setup();
    if (s.type === 'collect') s.at.forEach((p, i) => { if (!(st.mask >> i & 1)) mkItem(s.kind, p, i); });
  }
  function begin() {
    const c = CH[st.ch];
    if (!c) { G.S.legend = true; setupStep(); G.save(); return; }
    if (!st.intro) {
      st.intro = true;
      G.card({ eyebrow: 'Chapitre ' + (st.ch + 1), title: c.title, paras: c.intro, button: st.ch === 0 ? 'Enfiler les chaussures' : 'En route' }, () => { setupStep(); G.save(); });
    } else setupStep();
  }
  function advance() {
    if (busy) return;
    const c = CH[st.ch];
    if (st.step + 1 < c.steps.length) {
      st.step++; st.n = 0; st.mask = 0; setupStep(); G.save();
      G.banner(`Nouvel objectif<small>${c.steps[st.step].text}</small>`, '', 3600); Snd.pickup();
      return;
    }
    busy = true;
    G.whenCalm(() => {
      const ghost = c.ghost && st.ghost, xp = c.xp + (ghost ? 150 : 0), done = st.ch + 1;
      st.ch++; st.step = 0; st.n = 0; st.mask = 0; st.ghost = true; st.intro = false; clear(); G.save(); Snd.levelUp();
      G.card({ eyebrow: `Chapitre ${done} terminé`, title: c.title, paras: c.outro.concat(ghost ? ['Fantôme : aucun ours ne t\'a repéré dans la ville. Bonus de 150 XP.'] : []), reward: `+${xp} XP`, button: 'Continuer' }, () => { G.addXP(xp); begin(); });
    });
  }

  function on(ev, d) {
    const s = cur(); if (!s || busy) return;
    if (ev === 'alert' && d.bear.story) st.ghost = false;
    else if (ev === 'launch' && s.type === 'launch' && s.test(d)) { st.n++; G.save(); if (st.n >= s.n) advance(); }
    else if (ev === 'bell' && s.type === 'ring') { if (d.c >= 0.55) advance(); else G.banner('Trop mou<small>Arme ton chassé avant de frapper la cloche</small>', '', 2400); }
    else if (ev === 'bossDown' && s.type === 'boss') advance();
  }

  function update(dt, t) {
    const s = cur(), P = G.P;
    for (const it of items) { it.mesh.rotation.y = t * 1.6 + it.idx; it.mesh.position.y = (it.kind === 'page' ? 1.3 : 0.55) + Math.sin(t * 2.2 + it.idx) * 0.12; }
    if (s && !busy) {
      if (s.type === 'reach' && Math.hypot(P.x - s.at.x, P.z - s.at.z) < s.r) advance();
      else if (s.type === 'collect') {
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i]; if (Math.hypot(P.x - it.x, P.z - it.z) > 1.7) continue;
          st.mask |= 1 << it.idx; G.scene.remove(it.mesh); items.splice(i, 1); Snd.pickup();
          const p = G.project(it.x, 2, it.z); G.floatText(it.kind === 'page' ? 'Page du carnet' : 'Pot de miel', p.x, p.y, 'amber');
          for (let k = 0; k < 14; k++) FX.sparkle(it.x, 1.2, it.z, 1.2);
          G.save(); if (bits(st.mask) >= s.at.length) advance();
        }
      }
    }
    const m = marker(); beacon.visible = !!m && !m.bear;
    if (beacon.visible) { beacon.position.set(m.x, 35, m.z); beacon.material.opacity = 0.16 + Math.sin(t * 3) * 0.05; }
  }

  // où regarder : le point (ou l'ours) que vise l'objectif en cours
  function marker() {
    const s = cur(), P = G.P; if (!s || busy) return null;
    if (s.type === 'reach' || s.type === 'ring') return { x: s.at.x, z: s.at.z, y: 3 };
    if (s.type === 'collect') { let best = null, bd = 1e9; for (const it of items) { const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < bd) { bd = d; best = it; } } return best ? { x: best.x, z: best.z, y: 2.6 } : null; }
    let best = null, bd = 1e9;
    for (const b of G.bears) {
      if (b.state === 'launched') continue;
      if (s.type === 'boss' ? b.tag !== 'boss' : s.tag ? b.tag !== s.tag : !(s.near && (b.state === 'idle' || b.state === 'wander') && !b.story)) continue;
      const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < bd) { bd = d; best = b; }
    }
    return best ? { x: best.x, z: best.z, y: 4.6 * best.size, bear: true } : null;
  }
  function hud() {
    const c = CH[st.ch];
    if (!c) return { eyebrow: 'Mode Légende', text: 'Val-Perdu est libre. Les ours reviennent, plus coriaces.', k: 1 };
    const s = c.steps[st.step], N = s.type === 'collect' ? s.at.length : (s.n || 1), n = s.type === 'collect' ? bits(st.mask) : st.n;
    return { eyebrow: `Chapitre ${st.ch + 1} · ${c.title}`, text: s.text + (N > 1 ? ` (${n}/${N})` : ''), k: n / N };
  }
  const checkpoint = () => { const c = CH[st.ch]; return c ? c.cp : [World.town.gate.x, World.town.gate.z + 6]; };
  const serialize = () => ({ ch: st.ch, step: st.step, n: st.n, mask: st.mask, intro: st.intro });
  function reset() { st.ch = 0; st.step = 0; st.n = 0; st.mask = 0; st.ghost = true; st.intro = false; busy = false; }

  return { init, begin, setupStep, on, update, marker, hud, checkpoint, serialize, reset, get chapter() { return st.ch; } };
})();
