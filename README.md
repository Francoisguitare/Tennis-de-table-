# Face au picot

Entraînement sur téléphone pour apprendre à lire le jeu d'un adversaire qui joue **picot court, picot long (avec ou sans mousse) ou anti-top**, quand on est un joueur de top.

## Le jeu 3D : `index.html`

Tu es au bout de la table, en vue joueur. En face, un adversaire picot ou anti-top. Pour chaque balle :

1. tu regardes **la face qui touche la balle** (sa couleur), **son geste** (bloc, défense coupée, poussette, attaque) et **la trajectoire** ;
2. tu choisis ton coup avant que la balle arrive : top très ouvert, top d'ouverture, top tendu, bloc fermé, poussette ou balle morte.

L'effet qui revient dépend de ce que tu as joué juste avant : ton top dans le picot long revient coupé, ta poussette revient liftée, ta balle sans effet revient sans effet. Une mauvaise lecture donne une balle au filet, dehors ou trop haute, et un bilan explique ce qui arrivait et ce qu'il fallait jouer.

- 4 adversaires : **Le mur** (picot long, bloqueur), **Le défenseur** (picot long sans mousse, défend loin), **Le frappeur** (picot court), **L'endormeur** (anti-top).
- 3 niveaux : Découverte (ralenti, la balle t'attend), Entraînement (ralenti), Match (presque la vraie vitesse).
- Aide visuelle : nom de la face au contact et trace de la balle.
- Avant chaque match, tu vois sa raquette : la couleur du picot change d'un match à l'autre.
- Bilan de fin de match : pourcentage de lecture juste et erreurs à corriger.

## Le quiz : `quiz.html`

Quiz en deux temps (effet reçu, puis ta réponse), labo de combinaisons et fiches par revêtement.

## Utilisation

Aucune installation : ouvre `index.html` dans le navigateur du téléphone (connexion nécessaire pour charger la 3D), ou active GitHub Pages (Settings → Pages) et ajoute la page à l'écran d'accueil.
