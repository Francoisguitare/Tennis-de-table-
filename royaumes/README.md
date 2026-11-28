# Royaumes

Jeu de stratégie médiévale en temps réel, pensé d'abord pour le smartphone : solo contre l'ordinateur, ou entre amis par simple lien, avec chat vocal.

## Jouer

- **Solo** : ouvrir `index.html` (même en local) → « Jouer contre l'ordinateur ».
- **En ligne** : la page doit être servie en HTTPS (GitHub Pages par exemple). L'hôte clique « Créer une partie en ligne » et partage le lien ; les amis l'ouvrent sur leur téléphone et arrivent directement dans le salon. L'hôte doit garder la page ouverte pendant la partie.
- **Micro** : bouton 🎙️ (activer / couper), 🔊 coupe le son des autres joueurs. Fonctionne dans le salon et en jeu.

### Mise en ligne avec GitHub Pages

Dans le dépôt : Settings → Pages → « Deploy from a branch », choisir la branche qui contient ce dossier et le répertoire `/ (root)`. Le jeu sera alors à l'adresse `https://<compte>.github.io/<dépôt>/royaumes/`.

## Contenu

- 4 ressources (nourriture, bois, or, pierre), villageois, dépôts, maisons, fermes qui se ressèment.
- 4 âges, 20 bâtiments, 12 unités (plus leurs améliorations jusqu'au dernier âge), 37 technologies, marché et tributs entre alliés, palissades, murs et portes, garnison et cloche d'alarme (les villageois sans place attendent à l'abri puis reprennent leur travail).
- Gibier : moutons, cerfs et sangliers (qui chargent : à chasser à plusieurs).
- Combat à contres (lanciers > cavalerie > archers > infanterie, tirailleurs > archers), précision des tirs (on peut esquiver une flèche en bougeant), dégâts de zone du mangonneau (y compris sur ses propres troupes), siège (bélier, mangonneau, trébuchet à déployer), moines (soin, conversion).
- Déplacements de groupe en formation (bouton « Rangs / Libre »), postures (agressif, défensif, position, passif), riposte automatique.
- Victoire par conquête ou par merveille ; équipes et alliances ; IA facile / normale / difficile ; jusqu'à 6 joueurs.
- Sons : musique d'ambiance générée (nappes douces qui ne bouclent jamais, petites phrases de luth ou de flûte), bruits de nature selon ce qu'on regarde (vent, feuillages, eau, plusieurs oiseaux, grillons), un son propre à chaque bâtiment, chantiers et récolte audibles, cloche d'alarme, cor d'attaque. Volumes musique / nature / effets dans le menu ☰.
- Toucher au pixel près : seuls les dessins réels comptent (pas l'ombre ni le sol autour d'un bâtiment) ; avec une sélection en cours, toucher à côté de ses unités les déplace.
- Brouillard de guerre, minicarte, sélection tactile (appui long, double touche, pincer pour zoomer), souris et clavier sur ordinateur (raccourcis selon la position des boutons, groupes Alt+1…9).

## Graphismes et fluidité

- Terrain détaillé (rivages, écume, profondeur de l'eau, transitions naturelles), trois familles d'arbres, bâtiments texturés avec ombres portées, murs qui se raccordent, feu et fumée sur les bâtiments abîmés, unités animées (marche, attaque, travail).
- Le rendu est découpé en tuiles mises en cache et les sprites sont générés à l'échelle de l'écran : 3 à 5 fois moins de temps par image qu'avant.
- Menu ☰ → « Qualité graphique » : **Auto** (la résolution baisse si le jeu ralentit), **Élevée** (pleine résolution), **Économie** (résolution réduite, sans particules ni détails du sol : pour les téléphones modestes ou pour économiser la batterie).

## Technique

- HTML / JavaScript sans dépendance ni compilation ; graphismes et sons générés par le code.
- Multijoueur pair-à-pair WebRTC (bibliothèque PeerJS incluse dans `vendor/`, serveur public de mise en relation PeerJS). L'hôte fait tourner la simulation et envoie les changements ; les invités envoient leurs ordres.
- `js/sim.js` moteur, `js/ai.js` IA, `js/render.js` rendu isométrique, `js/ui.js` interface, `js/net.js` réseau et voix, `js/main.js` menus.

## Tests

```
node tests/scenarios.js        # 92 vérifications du moteur + fuzz de commandes réseau (QUICK=1 : sans les longues parties IA)
node tests/sim-test.js 1,2,3 30 2   # parties IA contre IA (graines, minutes, joueurs)
```
