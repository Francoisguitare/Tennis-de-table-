# Face au picot

Entraînement sur téléphone pour apprendre à lire le jeu d'un adversaire qui joue **picot court, picot long (avec ou sans mousse) ou anti-top**, quand on est un joueur de top.

## Le jeu 3D : `index.html`

Tu es au bout de la table, en vue joueur. En face, un adversaire picot ou anti-top. Pour chaque balle :

1. tu regardes **la face qui touche la balle** (sa couleur), **son geste** (le vrai mouvement de sa raquette) et **la trajectoire** ;
2. tu choisis ton coup avant que la balle arrive : top très ouvert, top d'ouverture, top tendu, poussette, balle morte ou bloc fermé.

Une mauvaise lecture donne une balle au filet, dehors ou trop haute. Le bilan du point explique, chiffres à l'appui, ce qui est arrivé : la rotation de ta balle quand elle est arrivée chez lui, ce que son revêtement en a fait, ce que le rebond sur ta table a changé, et les coups qui passaient.

- 5 adversaires : **Le mur** (picot long, bloqueur), **Le défenseur** (picot long sans mousse, défend loin), **Le frappeur** (picot court), **L'endormeur** (anti-top), **Le classique** (backside des deux côtés : il tope, bloque, bloque activement, pousse).
- Ses coups sont nommés au contact : Top, Bloc, Bloc actif, Poussette, Défense coupée, Attaque, Service, avec « latéral » quand il frotte la balle sur le côté.
- **Il joue sur** : partout, ton revers ou ton coup droit. Une balle sur ta gauche se joue en revers : ta raquette passe à gauche et frappe avec la face noire.
- **Effets latéraux (difficile)** : Aucun, Parfois, ou Que du latéral (chaque balle en a, plus fort ; à combiner avec « Il joue sur : ton revers »). Il ajoute de l’effet sur le côté. Avant de frapper, tu indiques où la balle va partir sur ta raquette (◀ à gauche, droit, à droite ▶) : bien lu, ton coup compense ; mal lu, la balle sort sur le côté. En Découverte, la carte indique le côté (◀ ▶) et le latéral en tours/s.
- **Analyse au ralenti** (bouton « Analyse » de la carte, et « Analyser cette balle au ralenti » après un point perdu, à tous les niveaux) : une étape, une phrase, une grande animation tracée avec les vraies données de la balle. Son geste, son frottement sur le côté vu d'en haut, comment la balle tourne (de profil et vu d'en haut), son trajet vu d'en haut (courbe amplifiée pour la voir), ce qu'elle fait sur ta raquette droite, puis ta réponse avec la raquette orientée. Vitesse ×⅒ à ×1, pause, étape par étape.
- **Atelier « Règle l'angle »** (menu, bouton « Angle » de la carte Découverte, et « Régler l'angle » après un point perdu) : choisis la balle (coupé 25, coupé 10, sans effet, lift 20, lift 40, ou la balle que tu viens de recevoir) et ton coup (top, bloc, poussette ; revers ou coup droit), puis règle l'angle de ta raquette. Le moteur calcule pour chaque angle où part la balle (filet, passe, dehors) et affiche la bonne zone en vert sur un rapporteur. Exemple : top contre un lift de 20 tr/s, fermée 13° à 17°.
- Tous les adversaires sont droitiers.
- **Un seul affichage, pour répéter** : tu regardes son geste (ralenti et zoom sur sa raquette), puis la balle s'arrête et apparaît en 3D avec un anneau fléché qui tourne dans le sens de sa rotation et ses tours/s. Tu réponds avec tes coups : Top ouvert (la cloche), Top frappé, Bloc, Coupe, Latéral gauche, Latéral droite (touches 1 à 6). Le moteur dit si ça passe ; sinon la bonne réponse s'allume (« il fallait : … »). Pas d'écran de bilan : l'échange continue, le point suivant repart tout seul, ton service part tout seul. Latéral : frotte du côté opposé à celui où elle part sur ta raquette.
- **Historique de la rotation** : dans la carte de la balle, ◀ ▶ remontent l'échange moment par moment (chaque frappe, la tienne et la sienne, et chaque rebond). La balle reste au centre avec son anneau ; la raquette (ou la table) arrive, la frotte dans le vrai sens, et l'anneau passe de la rotation d'avant à celle d'après, avec les chiffres « avant → après » calculés par le moteur.
- **Tester mes réponses** (bouton de la carte de la balle) : pour la balle exacte que tu reçois, 5 coups (Top puissant, Top ouvert, Top frappé, Bloc, Coupe) × 3 façons de frotter (vers ta gauche, droit, vers ta droite). Chaque case : le résultat (Passe, Filet, Dehors, À côté, Balle haute) et la rotation de ta balle. Une case touchée : ta raquette frotte la balle en 3D, et deux lignes disent ce que tu fais à son effet (« coupé 40 → lift 64 · tu inverses », « latéral 30 ◀ → 0 · tu l'annules »). Son latéral se compense en visant : la carte dit de combien et de quel côté.
- **Animation du contact** (historique et Labo) : une vraie raquette en 3D (plateau, deux faces, manche) à l'angle exact du coup, qui arrive sur sa vraie trajectoire (positions successives en pointillés) ; balle et raquette aux vitesses du moteur, en ralenti extrême autour du choc. Au contact, la vitesse de la raquette est décomposée en « frotte » (ce qui crée la rotation) et « pousse », et une phrase chiffrée décrit le geste (« raquette fermée 20°, face 7° vers ta gauche · frotte 10,5 m/s vers le haut · pousse 3,2 m/s »). Vue auto, profil (top, coupé), dessus (latéral) ou ¾.
- **Caméra libre** (Labo et historique) : fais glisser sur l'animation (souris, clic molette ou doigt) pour tourner autour de la balle, molette ou pincer pour zoomer (boutons − et + aussi), double-clic pour revenir. Dans le Labo, pause et curseur de temps pour avancer image par image ; le trait jaune du curseur marque le contact.
- **Mode tapeur** : pour chaque réponse qui passe, le moteur mesure à quel point elle met l'adversaire en difficulté : le temps qu'il a pour réagir (de ton contact jusqu'à 30 cm derrière sa ligne), la vitesse en km/h, la rotation qu'il reçoit, la profondeur du rebond et la marge au-dessus du filet. La plus dure pour lui est marquée ★ dans le Labo (« ★ Pour le mettre en difficulté : top puissant · 69 km/h, il a 0,22 s »). Le **Top puissant** est le coup du tapeur : à fond vers l'avant et vers le haut ; il passe sur les balles liftées, sans effet ou peu coupées, et part au filet sur un gros coupé (il faut d'abord ouvrir). En Réflexe, quand ta réponse passe mais qu'il y avait plus offensif, la ligne le dit (« Bien lu · plus offensif : Top frappé (45 km/h) ») et le bouton s'allume.
- Vitesse : Lent, Moyen ou Rapide.
- **Découverte** : la caméra se rapproche et ralentit sur son geste, puis marque une pause au contact. Quand la balle t'attend, une carte animée s'ouvre en haut : un petit film de profil (lui à gauche, toi à droite) montre son coup, la balle qui vient vers toi avec sa rotation, puis comment sa rotation la dévie sur une raquette droite qui ne fait qu'accompagner (Monte, Descend ou Tout droit). La flèche autour de la balle montre la partie qui avance vers toi : en bas = coupé, en haut = lift. En dessous, chacun des 6 coups est animé (ta raquette monte sur un top, ne bouge pas sur un bloc) avec son résultat calculé par le moteur (Passe, Filet, Dehors, Balle haute) et le conseil. Le tableau « Chiffres » donne la rotation (tours/s, lift ou coupé dans le sens où va la balle) et la vitesse à chaque étape : départ de ta raquette, rebond chez lui, sa raquette (avant → après), rebond chez toi, à ton contact ; la ligne en cours s'allume avec le film, et l'étiquette sur la balle affiche les tours/s du moment. La vitesse des animations se règle (Très lent, Lent, Normal, pause) et reste mémorisée. Tu peux revoir son coup au ralenti. Pendant l'échange, les boutons restent compacts pour que tu voies ta raquette et la balle ; ils ne s'agrandissent qu'au moment du choix.
- Aide visuelle : balle bicolore pour voir la rotation, nom de la face et direction du geste au contact, positions successives de sa raquette (stroboscope), trace de la balle, repère au point de rebond, trait vertical entre la balle et son ombre.
- Son : chaque revêtement a son bruit (le picot long claque sec, l'anti fait un « toc » sourd).

### La physique

Le jeu ne tire pas les effets d'un tableau : il simule la balle.

- Balle de 40 mm et 2,7 g (sphère creuse), freinée par l'air et déviée par l'effet Magnus (le lift plonge, le coupé plane).
- Rebond sur la table avec frottement (coefficient 0,25, valeur mesurée dans les études sur le tennis de table) : le rebond freine une balle coupée et lui retire une partie de sa rotation, et il donne un peu de lift à une balle sans effet.
- Contact raquette selon l'adhérence du revêtement : le backside accroche et c'est son geste qui crée l'effet ; le picot long et l'anti glissent et gardent la rotation de ta balle, qui revient donc inversée pour toi ; le picot court accroche un peu et casse l'effet.
- Ton coup règle la raquette pour la rotation que tu as lue. Si la balle tourne plus ou moins que ce que tu as lu, c'est la physique qui l'envoie au filet ou dehors.
- Tu prends les balles normales à ta ligne de fond (au sommet du rebond si elle est courte, en reculant si elle est longue et rapide), comme à la table.

C'est un modèle simplifié (pas d'effet latéral, revêtements décrits par trois valeurs) : il donne les bons sens et les bons ordres de grandeur, pas la balle exacte de ton adversaire.

## Le quiz : `quiz.html`

Quiz en deux temps (effet reçu, puis ton coup), labo de combinaisons et fiches par revêtement. Ses scénarios sont calculés avec le même moteur physique que le jeu.

## Utilisation

Aucune installation : ouvre `index.html` dans le navigateur du téléphone (connexion nécessaire pour charger la 3D), ou active GitHub Pages (Settings → Pages) et ajoute la page à l'écran d'accueil.

Par François Daoud.
