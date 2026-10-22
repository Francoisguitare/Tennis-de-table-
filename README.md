# Face au picot

Entraînement sur téléphone pour apprendre à lire le jeu d'un adversaire qui joue **picot court, picot long (avec ou sans mousse) ou anti-top**, quand on est un joueur de top.

## Le jeu 3D : `index.html`

Tu es au bout de la table, en vue joueur. En face, un adversaire picot ou anti-top. Pour chaque balle :

1. tu regardes **la face qui touche la balle** (sa couleur), **son geste** (le vrai mouvement de sa raquette) et **la trajectoire** ;
2. tu choisis ton coup avant que la balle arrive : top très ouvert, top d'ouverture, top tendu, poussette, balle morte ou bloc fermé.

Une mauvaise lecture donne une balle au filet, dehors ou trop haute. Le bilan du point explique, chiffres à l'appui, ce qui est arrivé : la rotation de ta balle quand elle est arrivée chez lui, ce que son revêtement en a fait, ce que le rebond sur ta table a changé, et les coups qui passaient.

- 4 adversaires : **Le mur** (picot long, bloqueur), **Le défenseur** (picot long sans mousse, défend loin), **Le frappeur** (picot court), **L'endormeur** (anti-top).
- 3 niveaux : Découverte (ralenti, la balle t'attend), Entraînement (ralenti), Match (presque la vraie vitesse).
- Aide visuelle : balle bicolore pour voir la rotation, nom de la face au contact, trace de la balle.
- Son : chaque revêtement a son bruit (le picot long claque sec, l'anti fait un « toc » sourd).

### La physique

Le jeu ne tire pas les effets d'un tableau : il simule la balle.

- Balle de 40 mm et 2,7 g (sphère creuse), freinée par l'air et déviée par l'effet Magnus (le lift plonge, le coupé plane).
- Rebond sur la table avec frottement (coefficient 0,25, valeur mesurée dans les études sur le tennis de table) : le rebond freine une balle coupée et lui retire une partie de sa rotation, et il donne un peu de lift à une balle sans effet.
- Contact raquette selon l'adhérence du revêtement : le backside accroche et c'est son geste qui crée l'effet ; le picot long et l'anti glissent et gardent la rotation de ta balle, qui revient donc inversée pour toi ; le picot court accroche un peu et casse l'effet.
- Ton coup règle la raquette pour la rotation que tu as lue. Si la balle tourne plus ou moins que ce que tu as lu, c'est la physique qui l'envoie au filet ou dehors.

C'est un modèle simplifié (pas d'effet latéral, revêtements décrits par trois valeurs) : il donne les bons sens et les bons ordres de grandeur, pas la balle exacte de ton adversaire.

## Le quiz : `quiz.html`

Quiz en deux temps (effet reçu, puis ton coup), labo de combinaisons et fiches par revêtement. Ses scénarios sont calculés avec le même moteur physique que le jeu.

## Utilisation

Aucune installation : ouvre `index.html` dans le navigateur du téléphone (connexion nécessaire pour charger la 3D), ou active GitHub Pages (Settings → Pages) et ajoute la page à l'écran d'accueil.

Par François Daoud.
