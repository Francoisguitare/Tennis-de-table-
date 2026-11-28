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
- 4 âges, 19 bâtiments, 12 unités (plus leurs améliorations), 23 technologies, marché, murs et portes, garnison et cloche d'alarme.
- Combat à contres (lanciers > cavalerie > archers > infanterie, tirailleurs > archers), siège (bélier, mangonneau, trébuchet à déployer), moines (soin, conversion).
- Victoire par conquête ou par merveille ; équipes et alliances ; IA facile / normale / difficile ; jusqu'à 6 joueurs.
- Brouillard de guerre, minicarte, sélection tactile (appui long, double touche, pincer pour zoomer), souris et clavier sur ordinateur.

## Technique

- HTML / JavaScript sans dépendance ni compilation ; graphismes et sons générés par le code.
- Multijoueur pair-à-pair WebRTC (bibliothèque PeerJS incluse dans `vendor/`, serveur public de mise en relation PeerJS). L'hôte fait tourner la simulation et envoie les changements ; les invités envoient leurs ordres.
- `js/sim.js` moteur, `js/ai.js` IA, `js/render.js` rendu isométrique, `js/ui.js` interface, `js/net.js` réseau et voix, `js/main.js` menus.

## Tests

```
node tests/scenarios.js        # 38 scénarios du moteur + fuzz de commandes réseau
node tests/sim-test.js 1,2,3 30 2   # parties IA contre IA (graines, minutes, joueurs)
```
