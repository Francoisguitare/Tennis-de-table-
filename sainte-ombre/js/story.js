/* Sainte-Ombre — l'histoire : le journal de frère Ambroise, le registre des morts, les chapitres, la fin. */
const Story = (() => {
  'use strict';
  const NAMES = ['Gautier', 'Odon', 'Élias'];
  const list = names => names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1];
  const count = n => ['aucun', 'un', 'deux', 'trois'][n] || String(n);

  const INTRO = coop => [
    'Décembre 1348.',
    'La peste a pris la vallée.',
    'Tu ne te souviens pas de ton nom.',
    'Ni d\'être venu ici.',
    coop ? 'Seulement du froid. De la lanterne, dans ta main. Et de quelqu\'un qui respire, de l\'autre côté du mur.' : 'Seulement du froid. Et de la lanterne, dans ta main.',
  ];

  const CHAPTERS = { 1: 'Les cellules', 2: 'La herse', 3: 'Le cloître', 4: 'L\'ossuaire', 5: 'La cloche', 6: 'La grande porte' };
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

  // les pages du journal de frère Ambroise
  function journal(id, names) {
    const J = {
      j1: { date: 'Troisième jour de l\'Avent, an de grâce 1348', title: 'Premier feuillet', body: [
        'L\'abbé Aldric a fait murer la grande porte ce matin. Les maçons ont travaillé sans dire un mot.',
        '« La peste ne franchira pas Sainte-Ombre. Ce qui est dehors reste dehors. »',
        'Nous sommes quarante et un. Nous avons du grain pour l\'hiver. Dieu nous garde.'], sign: 'Frère Ambroise, archiviste' },
      j2: { date: 'Neuvième jour', title: 'La femme à la porte', body: [
        'Une femme a frappé toute la nuit contre le mur de la porte. Elle portait un enfant ; on l\'entendait tousser.',
        'L\'abbé a interdit qu\'on réponde. Aux matines, il nous a fait chanter plus fort, pour ne plus l\'entendre.',
        'À l\'aube, elle s\'était tue. Personne n\'en a reparlé.'], sign: 'Fr. A.' },
      j3: { date: 'Quatorzième jour', title: 'Les coups', body: [
        'Les coups ont cessé dehors.',
        'Depuis trois nuits, ils viennent de l\'intérieur. Des murs. Toujours trois coups, puis plus rien.',
        'Frère Odon dit que les murs respirent. Frère Gautier ne dort plus.',
        'L\'abbé a fait descendre les premiers malades à l\'ossuaire, « pour les protéger ». La chapelle est fermée ; il garde la clé sur lui.'], sign: 'Fr. A.' },
      j4: { date: 'Vingt-deuxième jour', title: 'Le plan', body: [
        'L\'abbé a dessiné le plan de l\'ossuaire. Il l\'a posé ici, sur le pupitre, « pour que personne ne s\'y perde ».',
        'Il y descend chaque nuit avec les malades, et une truelle. Il remonte seul.',
        'Ceux qui regardent le plan disent qu\'une petite lumière y bouge quand quelqu\'un marche en bas. Et qu\'il y a, dans les galeries, des endroits où l\'on sent un souffle froid. Ceux qui y passent ne retrouvent plus leur chemin.'], sign: 'Fr. A.' },
      j5: { date: 'Trentième jour', title: 'Le dernier à tenir la plume', body: [
        'L\'abbé ne remontera plus. Je l\'ai trouvé ici, assis parmi eux, la clé de la chapelle au cou.',
        names.length > 1 ? `Il ne reste que ${count(names.length)} frères qui marchent encore : ${list(names)}.` : `Il ne reste qu'un frère qui marche encore : ${names[0]}.`,
        'Si quelqu\'un lit ceci : sonnez la cloche. Elle seule peut rouvrir la porte.',
        'Et ne restez jamais seuls dans le noir.'], sign: 'Fr. A.' },
    };
    return J[id];
  }
  const JTITLE = { j1: 'Premier feuillet', j2: 'La femme à la porte', j3: 'Les coups', j4: 'Le plan', j5: 'Le dernier à tenir la plume', reg: 'Le registre des morts' };

  function register(names, mine) {
    const dead = [['Frère Bertin', 12], ['Frère Mathieu', 15], ['Frère Clément', 15], ['Frère Hugues', 17], ['Frère Raoul', 18], ['Frère Josse', 18], ['Frère Thibaut', 21], ['Frère Guérin', 22], ['… et vingt-sept autres noms', null], ['Aldric, abbé', 29], ['Frère Ambroise, archiviste', 30]];
    return {
      date: 'Liber mortuorum', title: 'Le registre des morts',
      lines: dead.map(([n, d]) => d ? `${n} — ${d}e jour` : n),
      late: names.map(n => `Frère ${n} — 31e jour`),
      mine: `Tu connais ce nom. Frère ${mine}. C'est le tien.`,
      after: 'L\'encre de la dernière ligne n\'est pas encore sèche.',
    };
  }

  const ENDING = (n, names) => [
    'Le treizième jour de décembre 1348, à l\'aube, la cloche de Sainte-Ombre sonna pour la première fois depuis un mois.',
    'Les gens de la vallée montèrent jusqu\'à l\'abbaye. Le mur de la grande porte s\'était effondré, de l\'intérieur.',
    'Ils ne trouvèrent aucun vivant. Quarante et un frères reposaient dans l\'ossuaire, dans la chapelle et dans les murs.',
    n > 1 ? `Sur le seuil, dans la neige, il y avait ${count(n)} lanternes, encore chaudes.` : 'Sur le seuil, dans la neige, il y avait une lanterne, encore chaude.',
    'Et des pas, qui descendaient vers la vallée.',
  ];

  return { NAMES, INTRO, CHAPTERS, ROMAN, journal, JTITLE, register, ENDING, list };
})();
