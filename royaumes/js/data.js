/* Royaumes — définitions du jeu (unités, bâtiments, technologies, âges).
   Toutes les durées sont en secondes de jeu ; la vitesse de partie les accélère. */
(function (R) {
  'use strict';

  R.RES = ['f', 'w', 'g', 's'];
  R.RES_NAME = { f: 'Nourriture', w: 'Bois', g: 'Or', s: 'Pierre' };
  R.RES_ICON = { f: '🍖', w: '🪵', g: '🪙', s: '🪨' };

  R.AGES = [
    { name: 'Âge des Clans', short: 'I' },
    { name: 'Âge des Seigneurs', short: 'II' },
    { name: 'Âge des Forteresses', short: 'III' },
    { name: 'Âge des Couronnes', short: 'IV' }
  ];

  R.COLORS = [
    { name: 'Bleu', main: '#2f6fe0', dark: '#1b3f86', light: '#7fa9f5' },
    { name: 'Rouge', main: '#d8342c', dark: '#82190f', light: '#f08a83' },
    { name: 'Vert', main: '#2fa84a', dark: '#17602a', light: '#86dc98' },
    { name: 'Jaune', main: '#e3c21d', dark: '#8a730a', light: '#f5e27c' },
    { name: 'Cyan', main: '#1fb8c4', dark: '#0d6870', light: '#82e3ea' },
    { name: 'Violet', main: '#8a4fd6', dark: '#4b2585', light: '#c4a2f0' }
  ];

  R.START_RES = {
    standard: { f: 200, w: 200, g: 100, s: 200 },
    eleve: { f: 1000, w: 1000, g: 800, s: 500 },
    tres: { f: 20000, w: 20000, g: 20000, s: 20000 }
  };

  // ---------- Unités ----------
  // atk: {d: dégâts, t: 'm' mêlée | 'p' perçant, r: portée, rate: cadence (s), b: bonus par classe, min: portée minimale, splash: rayon}
  // arm: [mêlée, perçant]
  R.UNITS = {
    villager: {
      name: 'Villageois', icon: '🧑‍🌾', hp: 25, arm: [0, 0], speed: 0.8, los: 4, rad: 0.22,
      atk: { d: 3, t: 'm', r: 0.4, rate: 2 }, cost: { f: 50 }, time: 25, from: 'tc', age: 0,
      cls: ['vill'], desc: 'Récolte, construit et répare.'
    },
    scout: {
      name: 'Éclaireur', icon: '🐎', hp: 45, arm: [0, 2], speed: 1.55, los: 6, rad: 0.3,
      atk: { d: 3, t: 'm', r: 0.4, rate: 2, b: { monk: 6 } }, cost: { f: 80 }, time: 30, from: 'stable', age: 1,
      cls: ['cav'], up: [{ age: 2, tech: 'lightcav', name: 'Chevau-léger', hp: 60, atkD: 7, arm: [0, 2], los: 8 }, { age: 3, tech: 'estradiot', name: 'Estradiot', hp: 75, atkD: 9, los: 10 }],
      desc: 'Rapide, idéal pour explorer et harceler.'
    },
    militia: {
      name: 'Milicien', icon: '🗡️', hp: 40, arm: [0, 1], speed: 0.9, los: 4, rad: 0.24,
      atk: { d: 4, t: 'm', r: 0.4, rate: 2, b: { bld: 2 } }, cost: { f: 60, g: 20 }, time: 21, from: 'barracks', age: 0,
      cls: ['inf'],
      up: [
        { age: 1, tech: 'manatarms', name: 'Soudard', hp: 45, atkD: 6, arm: [0, 1] },
        { age: 2, tech: 'longsword', name: 'Bretteur', hp: 60, atkD: 9, arm: [1, 1] },
        { age: 3, tech: 'brise', name: 'Brise-ligne', hp: 70, atkD: 13, arm: [2, 1] }
      ],
      desc: "Infanterie polyvalente, efficace contre l'infanterie légère."
    },
    spear: {
      name: 'Lancier', icon: '🔱', hp: 45, arm: [0, 0], speed: 1.0, los: 4, rad: 0.24,
      atk: { d: 3, t: 'm', r: 0.5, rate: 3, b: { cav: 15 } }, cost: { f: 35, w: 25 }, time: 22, from: 'barracks', age: 1,
      cls: ['inf', 'spear'],
      up: [{ age: 2, tech: 'pikeman', name: 'Pertuisanier', hp: 55, atkD: 4, bonus: { cav: 22 } }, { age: 3, tech: 'guisarm', name: 'Guisarmier', hp: 60, atkD: 6, bonus: { cav: 32 } }],
      desc: 'Contre la cavalerie.'
    },
    archer: {
      name: 'Archer', icon: '🏹', hp: 30, arm: [0, 0], speed: 0.96, los: 6, rad: 0.22,
      atk: { d: 4, t: 'p', r: 4, rate: 2, b: { spear: 3 }, proj: 'arrow', acc: 0.8 }, cost: { w: 25, g: 45 }, time: 35, from: 'archery', age: 1,
      cls: ['arch'],
      up: [{ age: 2, tech: 'crossbow', name: 'Arbalétrier', hp: 35, atkD: 5, range: 5, los: 7, acc: 0.85 }, { age: 3, tech: 'arbal', name: 'Arbalétrier à cranequin', hp: 40, atkD: 6, range: 6, los: 8, acc: 0.9 }],
      desc: "Tir à distance, efficace contre l'infanterie."
    },
    skirm: {
      name: 'Tirailleur', icon: '🎯', hp: 30, arm: [0, 3], speed: 0.96, los: 6, rad: 0.22,
      atk: { d: 2, t: 'p', r: 4, rate: 3, b: { arch: 3, spear: 3 }, proj: 'arrow', acc: 0.9 }, cost: { f: 25, w: 35 }, time: 22, from: 'archery', age: 1,
      cls: ['arch', 'skirm'],
      up: [{ age: 2, tech: 'eliteskirm', name: 'Tirailleur aguerri', hp: 35, atkD: 3, range: 5, arm: [0, 4], bonus: { arch: 4, spear: 3 } }],
      desc: 'Bon marché, contre les archers.'
    },
    knight: {
      name: 'Chevalier', icon: '🛡️', hp: 100, arm: [2, 2], speed: 1.35, los: 4, rad: 0.32,
      atk: { d: 10, t: 'm', r: 0.4, rate: 1.8 }, cost: { f: 60, g: 75 }, time: 30, from: 'stable', age: 2,
      cls: ['cav'], up: [{ age: 3, tech: 'banneret', name: 'Banneret', hp: 120, atkD: 12, arm: [2, 3] }], desc: 'Cavalerie lourde, puissante et résistante.'
    },
    monk: {
      name: 'Moine', icon: '🧙', hp: 30, arm: [0, 0], speed: 0.7, los: 11, rad: 0.22,
      atk: null, cost: { g: 100 }, time: 51, from: 'monastery', age: 2,
      cls: ['monk'], desc: 'Soigne vos unités et convertit celles de l’ennemi.'
    },
    ram: {
      name: 'Bélier', icon: '🪵', hp: 175, arm: [-3, 180], speed: 0.5, los: 3, rad: 0.42,
      atk: { d: 2, t: 'm', r: 0.4, rate: 5, b: { bld: 125 } }, cost: { w: 160, g: 75 }, time: 36, from: 'siege', age: 2,
      cls: ['siege', 'ram'], onlyBld: true, up: [{ age: 3, tech: 'ferre', name: 'Bélier ferré', hp: 200, atkD: 3, bonus: { bld: 150 } }], desc: 'Détruit les bâtiments, résiste aux flèches.'
    },
    mangonel: {
      name: 'Mangonneau', icon: '🪨', hp: 50, arm: [0, 6], speed: 0.6, los: 9, rad: 0.42,
      atk: { d: 40, t: 'm', r: 7, min: 3, rate: 6, splash: 1, b: { bld: 35 }, proj: 'stone' }, cost: { w: 160, g: 135 }, time: 46, from: 'siege', age: 2,
      cls: ['siege'], up: [{ age: 3, tech: 'grandmang', name: 'Grand mangonneau', atkD: 50, range: 8, los: 10, splash: 1.5 }], desc: 'Dégâts de zone contre les groupes (attention à vos propres troupes).'
    },
    treb: {
      name: 'Trébuchet', icon: '🏰', hp: 150, arm: [2, 150], speed: 0.6, los: 16, rad: 0.5,
      atk: { d: 20, t: 'm', r: 16, min: 4, rate: 10, b: { bld: 230 }, proj: 'boulder' }, cost: { w: 200, g: 200 }, time: 50, from: 'castle', age: 3,
      cls: ['siege'], onlyBld: true, pack: 3, desc: 'Arme de siège à très longue portée. Doit se déployer pour tirer.'
    },
    guard: {
      name: 'Garde royale', icon: '⚔️', hp: 70, arm: [1, 2], speed: 1.0, los: 5, rad: 0.26,
      atk: { d: 12, t: 'm', r: 0.4, rate: 2, b: { bld: 4 } }, cost: { f: 65, g: 50 }, time: 25, from: 'castle', age: 2,
      cls: ['inf'], desc: 'Infanterie d’élite formée au château.'
    },
    // Animaux (gaïa)
    sheep: { name: 'Mouton', icon: '🐑', hp: 7, arm: [0, 0], speed: 0.6, los: 2, rad: 0.25, animal: true, food: 100, cls: ['animal'] },
    deer: { name: 'Cerf', icon: '🦌', hp: 5, arm: [0, 0], speed: 1.2, los: 3, rad: 0.28, animal: true, food: 140, flee: true, cls: ['animal'] },
    boar: { name: 'Sanglier', icon: '🐗', hp: 75, arm: [0, 1], speed: 1.0, los: 4, rad: 0.32, animal: true, aggr: true, food: 340, atk: { d: 5, t: 'm', r: 0.4, rate: 2 }, cls: ['animal'] }
  };

  // ---------- Bâtiments ----------
  R.BLDS = {
    tc: {
      name: 'Hôtel de ville', icon: '🏛️', size: 4, hp: 2400, arm: [3, 5], cost: { w: 275, s: 100 }, time: 150, age: 2, los: 8,
      pop: 5, drop: ['f', 'w', 'g', 's'], garrison: 15, atk: { d: 5, t: 'p', r: 6, rate: 2, proj: 'arrow', base: 1 },
      trains: ['villager'], techs: ['loom', 'wheel', 'cart', 'age1', 'age2', 'age3'], desc: 'Forme des villageois, dépôt de toutes les ressources.'
    },
    house: { name: 'Maison', icon: '🏠', size: 2, hp: 550, arm: [0, 7], cost: { w: 25 }, time: 25, age: 0, los: 2, pop: 5, desc: '+5 population.' },
    lumber: { name: 'Camp de bûcherons', icon: '🪓', size: 2, hp: 600, arm: [0, 7], cost: { w: 100 }, time: 35, age: 0, los: 2, drop: ['w'], techs: ['axe', 'saw', 'scierie'], desc: 'Dépôt de bois.' },
    mine: { name: 'Camp minier', icon: '⛏️', size: 2, hp: 600, arm: [0, 7], cost: { w: 100 }, time: 35, age: 0, los: 2, drop: ['g', 's'], techs: ['goldmin', 'stonemin', 'goldshaft', 'galeries'], desc: "Dépôt d'or et de pierre." },
    mill: { name: 'Moulin', icon: '🌾', size: 2, hp: 600, arm: [0, 7], cost: { w: 100 }, time: 35, age: 0, los: 2, drop: ['f'], techs: ['collar', 'plow', 'assolement'], desc: 'Dépôt de nourriture, permet les fermes.' },
    farm: { name: 'Ferme', icon: '🟫', size: 3, hp: 480, arm: [0, 0], cost: { w: 60 }, time: 15, age: 0, los: 1, farm: 175, walk: true, req: ['mill'], desc: 'Source de nourriture renouvelable.' },
    barracks: { name: 'Caserne', icon: '⚔️', size: 3, hp: 1200, arm: [0, 7], cost: { w: 175 }, time: 50, age: 0, los: 3, trains: ['militia', 'spear'], techs: ['manatarms', 'longsword', 'pikeman', 'brise', 'guisarm'], desc: "Forme l'infanterie." },
    palisade: { name: 'Palissade', icon: '🪵', size: 1, hp: 250, arm: [2, 5], cost: { w: 2 }, time: 5, age: 0, los: 1, wall: true, desc: 'Mur de bois bon marché.' },
    archery: { name: "Camp de tir à l'arc", icon: '🏹', size: 3, hp: 1200, arm: [0, 7], cost: { w: 175 }, time: 50, age: 1, los: 3, req: ['barracks'], trains: ['archer', 'skirm'], techs: ['crossbow', 'eliteskirm', 'arbal'], desc: 'Forme les archers.' },
    stable: { name: 'Écurie', icon: '🐴', size: 3, hp: 1200, arm: [0, 7], cost: { w: 175 }, time: 50, age: 1, los: 3, req: ['barracks'], trains: ['scout', 'knight'], techs: ['lightcav', 'haras', 'ferrage', 'estradiot', 'banneret'], desc: 'Forme la cavalerie.' },
    smith: { name: 'Forge', icon: '🔨', size: 3, hp: 1500, arm: [1, 7], cost: { w: 150 }, time: 40, age: 1, los: 3, techs: ['forging', 'fletch', 'scale', 'padded', 'ironcast', 'bodkin', 'chain'], desc: 'Améliore attaque et armure.' },
    market: { name: 'Marché', icon: '⚖️', size: 3, hp: 1800, arm: [0, 7], cost: { w: 175 }, time: 50, age: 1, los: 3, market: true, techs: ['mortier'], desc: 'Achat et vente de ressources, tributs aux alliés.' },
    tower: { name: 'Tour de guet', icon: '🗼', size: 1, hp: 700, arm: [1, 7], cost: { w: 25, s: 125 }, time: 50, age: 1, los: 9, garrison: 5, atk: { d: 5, t: 'p', r: 8, rate: 2, proj: 'arrow', base: 1, b: { spear: 3 } }, techs: ['tourrenf'], desc: 'Tire sur les ennemis proches.' },
    pgate: { name: 'Porte de palissade', icon: '🚪', size: 1, hp: 400, arm: [2, 5], cost: { w: 30 }, time: 12, age: 0, los: 2, wall: true, gate: true, desc: 'Porte en bois : laisse passer vos troupes et vos alliés.' },
    wall: { name: 'Mur de pierre', icon: '🧱', size: 1, hp: 1800, arm: [8, 10], cost: { s: 5 }, time: 8, age: 1, los: 1, wall: true, desc: 'Mur solide.' },
    gate: { name: 'Porte', icon: '🚪', size: 1, hp: 1500, arm: [6, 6], cost: { s: 30 }, time: 20, age: 1, los: 2, wall: true, gate: true, desc: 'Laisse passer vos troupes et vos alliés.' },
    monastery: { name: 'Monastère', icon: '⛪', size: 3, hp: 2100, arm: [3, 5], cost: { w: 175 }, time: 40, age: 2, los: 4, trains: ['monk'], garrison: 0, desc: 'Forme les moines.' },
    siege: { name: 'Atelier de siège', icon: '🛠️', size: 3, hp: 1500, arm: [0, 7], cost: { w: 200 }, time: 40, age: 2, los: 3, req: ['smith'], trains: ['ram', 'mangonel'], techs: ['ferre', 'grandmang'], desc: 'Construit les engins de siège.' },
    castle: { name: 'Château', icon: '🏰', size: 4, hp: 4800, arm: [8, 11], cost: { s: 650 }, time: 200, age: 2, los: 11, pop: 20, garrison: 20, atk: { d: 11, t: 'p', r: 8, rate: 2, proj: 'arrow', base: 4 }, trains: ['guard', 'treb'], desc: 'Forteresse : tire des flèches, forme la garde royale et les trébuchets.' },
    wonder: { name: 'Merveille', icon: '🗽', size: 5, hp: 4800, arm: [8, 10], cost: { w: 1000, g: 1000, s: 1000 }, time: 600, age: 3, los: 8, wonder: true, desc: 'Gardez-la debout assez longtemps pour gagner.' }
  };

  R.BUILD_MENU = {
    eco: ['house', 'mill', 'farm', 'lumber', 'mine', 'tc', 'market', 'wonder'],
    mil: ['barracks', 'archery', 'stable', 'smith', 'siege', 'monastery', 'tower', 'castle', 'palisade', 'pgate', 'wall', 'gate']
  };

  // ---------- Technologies ----------
  // fx: effets appliqués par le moteur (voir sim.js / stat())
  R.TECHS = {
    age1: { name: R.AGES[1].name, icon: '⏫', cost: { f: 500 }, time: 130, age: 0, ageUp: 1, reqBld: 2, desc: 'Nécessite 2 bâtiments de l’Âge des Clans (caserne, moulin, camps).' },
    age2: { name: R.AGES[2].name, icon: '⏫', cost: { f: 800, g: 200 }, time: 160, age: 1, ageUp: 2, reqBld: 2, desc: 'Nécessite 2 bâtiments de l’Âge des Seigneurs.' },
    age3: { name: R.AGES[3].name, icon: '⏫', cost: { f: 1000, g: 800 }, time: 190, age: 2, ageUp: 3, reqBld: 2, desc: 'Nécessite 2 bâtiments de l’Âge des Forteresses (ou un château).' },
    loom: { name: 'Vêtements doublés', short: 'Doublure', icon: '🧶', cost: { g: 50 }, time: 25, age: 0, desc: 'Villageois : +15 PV, +1/+2 armure.' },
    wheel: { name: 'Hottes', short: 'Hottes', icon: '🛒', cost: { f: 175, w: 50 }, time: 75, age: 1, desc: 'Villageois : +10 % vitesse, +25 % capacité.' },
    cart: { name: 'Chariot de récolte', short: 'Chariot', icon: '🛞', cost: { f: 300, w: 200 }, time: 55, age: 2, req: 'wheel', desc: 'Villageois : +10 % vitesse, +50 % capacité.' },
    axe: { name: 'Haches affûtées', short: 'Haches', icon: '🪓', cost: { f: 100, w: 50 }, time: 25, age: 1, desc: 'Bûcherons +20 %.' },
    saw: { name: 'Scies dentées', short: 'Scies', icon: '🪚', cost: { f: 150, w: 100 }, time: 50, age: 2, req: 'axe', desc: 'Bûcherons +20 %.' },
    goldmin: { name: 'Filons d’or', short: 'Filons', icon: '🪙', cost: { f: 100, w: 75 }, time: 30, age: 1, desc: 'Mineurs d’or +15 %.' },
    goldshaft: { name: 'Galeries profondes', short: 'Puits', icon: '🕳️', cost: { f: 200, w: 100 }, time: 75, age: 2, req: 'goldmin', desc: 'Mineurs d’or +15 %.' },
    stonemin: { name: 'Coins de carrier', short: 'Coins', icon: '🪨', cost: { f: 100, w: 75 }, time: 30, age: 1, desc: 'Mineurs de pierre +15 %.' },
    collar: { name: 'Attelage', short: 'Attelage', icon: '🐴', cost: { f: 75, w: 75 }, time: 20, age: 1, desc: 'Fermes +75 nourriture.' },
    plow: { name: 'Charrue à versoir', short: 'Charrue', icon: '🌱', cost: { f: 125, w: 125 }, time: 40, age: 2, req: 'collar', desc: 'Fermes +125 nourriture, fermiers +1 capacité.' },
    manatarms: { name: 'Soudard', short: 'Soudard', icon: '🗡️', cost: { f: 100, g: 40 }, time: 40, age: 1, desc: 'Améliore les miliciens.' },
    longsword: { name: 'Bretteur', short: 'Bretteur', icon: '⚔️', cost: { f: 200, g: 65 }, time: 45, age: 2, req: 'manatarms', desc: 'Améliore les soudards.' },
    pikeman: { name: 'Pertuisanier', short: 'Pertuis.', icon: '🔱', cost: { f: 215, g: 90 }, time: 45, age: 2, desc: 'Améliore les lanciers.' },
    crossbow: { name: 'Arbalétrier', short: 'Arbal.', icon: '🏹', cost: { f: 125, g: 75 }, time: 35, age: 2, desc: 'Améliore les archers.' },
    eliteskirm: { name: 'Tirailleur aguerri', short: 'Tirail.+', icon: '🎯', cost: { w: 230, g: 130 }, time: 50, age: 2, desc: 'Améliore les tirailleurs.' },
    lightcav: { name: 'Chevau-léger', short: 'Ch.-lég.', icon: '🏇', cost: { f: 150, g: 50 }, time: 45, age: 2, desc: 'Améliore les éclaireurs.' },
    forging: { name: 'Lames trempées', short: 'Lames', icon: '🔥', cost: { f: 150 }, time: 50, age: 1, desc: 'Infanterie et cavalerie : +1 attaque.' },
    ironcast: { name: 'Acier martelé', short: 'Acier', icon: '⚒️', cost: { f: 220, g: 120 }, time: 75, age: 2, req: 'forging', desc: 'Infanterie et cavalerie : +1 attaque.' },
    fletch: { name: 'Flèches équilibrées', short: 'Flèches', icon: '🪶', cost: { f: 100, g: 50 }, time: 30, age: 1, desc: 'Archers, tours et hôtels de ville : +1 attaque, +1 portée.' },
    bodkin: { name: 'Pointes d’acier', short: 'Pointes', icon: '📍', cost: { f: 200, g: 100 }, time: 35, age: 2, req: 'fletch', desc: 'Archers, tours et hôtels de ville : +1 attaque, +1 portée.' },
    scale: { name: 'Broigne', short: 'Broigne', icon: '🛡️', cost: { f: 100 }, time: 40, age: 1, desc: 'Infanterie et cavalerie : +1/+1 armure.' },
    chain: { name: 'Haubert', short: 'Haubert', icon: '⛓️', cost: { f: 200, g: 100 }, time: 55, age: 2, req: 'scale', desc: 'Infanterie et cavalerie : +1/+1 armure.' },
    padded: { name: 'Gambison', short: 'Gambison', icon: '🧥', cost: { f: 100 }, time: 40, age: 1, desc: 'Archers : +1/+1 armure.' },
    // Âge des Seigneurs / Forteresses : technologies supplémentaires
    haras: { name: 'Haras', short: 'Haras', icon: '🐎', cost: { f: 150, g: 100 }, time: 50, age: 1, desc: 'Cavalerie : +20 PV.' },
    ferrage: { name: 'Ferrage', short: 'Ferrage', icon: '🧲', cost: { f: 150 }, time: 40, age: 1, desc: 'Cavalerie : +10 % vitesse.' },
    tourrenf: { name: 'Tour renforcée', short: 'Renfort', icon: '🗼', cost: { f: 100, w: 250 }, time: 30, age: 2, desc: 'Tours : +1 attaque, +1 portée, +300 PV.' },
    galeries: { name: 'Galeries de pierre', short: 'Galeries', icon: '⛰️', cost: { f: 200, w: 150 }, time: 45, age: 2, req: 'stonemin', desc: 'Mineurs de pierre +15 %.' },
    mortier: { name: 'Mortier de chaux', short: 'Mortier', icon: '🧱', cost: { w: 175, s: 150 }, time: 50, age: 2, desc: 'Bâtiments : +10 % PV, +1/+1 armure.' },
    // Âge des Couronnes
    scierie: { name: 'Scierie hydraulique', short: 'Scierie', icon: '🪵', cost: { f: 300, w: 200 }, time: 70, age: 3, req: 'saw', desc: 'Bûcherons +10 %.' },
    assolement: { name: 'Assolement', short: 'Assol.', icon: '🌾', cost: { f: 250, w: 250 }, time: 70, age: 3, req: 'plow', desc: 'Fermes +175 nourriture.' },
    brise: { name: 'Brise-ligne', short: 'Brise-l.', icon: '💥', cost: { f: 750, g: 350 }, time: 60, age: 3, req: 'longsword', desc: 'Améliore les bretteurs.' },
    guisarm: { name: 'Guisarmier', short: 'Guisarm.', icon: '⚜️', cost: { f: 300, g: 600 }, time: 50, age: 3, req: 'pikeman', desc: 'Améliore les pertuisaniers.' },
    arbal: { name: 'Arbalétrier à cranequin', short: 'Craneq.', icon: '⚙️', cost: { f: 350, g: 300 }, time: 50, age: 3, req: 'crossbow', desc: 'Améliore les arbalétriers (+1 portée, meilleure précision).' },
    estradiot: { name: 'Estradiot', short: 'Estrad.', icon: '🎖️', cost: { f: 500, g: 600 }, time: 50, age: 3, req: 'lightcav', desc: 'Améliore les chevau-légers.' },
    banneret: { name: 'Banneret', short: 'Banneret', icon: '🚩', cost: { f: 900, g: 750 }, time: 70, age: 3, desc: 'Améliore les chevaliers.' },
    ferre: { name: 'Bélier ferré', short: 'Ferré', icon: '🐏', cost: { f: 300, g: 100 }, time: 50, age: 3, desc: 'Améliore les béliers.' },
    grandmang: { name: 'Grand mangonneau', short: 'Gd mang.', icon: '☄️', cost: { f: 800, g: 500 }, time: 75, age: 3, desc: 'Améliore les mangonneaux (+portée, zone élargie).' }
  };

  // Bâtiments qui comptent pour passer à l'âge suivant (par âge courant)
  R.AGE_REQ_BLDS = [
    ['barracks', 'mill', 'lumber', 'mine'],
    ['archery', 'stable', 'smith', 'market'],
    ['monastery', 'siege', 'castle']
  ];

  R.MAX_QUEUE = 10;
  R.TRIBUTE_TAX = 0.3; // frais sur les tributs entre alliés
  // Options de contenu (sangliers sur la carte)
  R.FEATURES = R.FEATURES || { boar: true };
  R.WONDER_TIME = 400; // secondes de jeu
  R.TICK = 0.1; // secondes réelles par tick

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
