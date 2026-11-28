# Sainte-Ombre

A puzzle-and-horror game in 3D that runs in the browser, played as a team of two or three. Each player uses their own screen and you talk over the mic. Works on phone and computer. About 15 minutes.

December 1348. The abbot of Sainte-Ombre walled up the abbey's great gate so the plague couldn't get in. You wake up in a cell, lantern in hand, with no memory. Pages from the archivist's journal tell the story piece by piece, right up to the last line of the register of the dead.

No monsters, no fighting: presences, knocking inside the walls, whispers, a hooded figure that vanishes when you look at it, and puzzles you can only solve together.

## The six chapters

1. **The cells**: one player sees three signs scratched into the wall of their cell, the other has the levers in the corridor. Describe the signs and pull the levers in the right order.
2. **The portcullis**: two winches, one at each end of the room. Turn them at the same time.
3. **The cloister**: snow, the well, a lullaby, pages to find. The chapel is locked.
4. **The ossuary**: a maze lined with skulls. One player reads the abbot's map in the scriptorium (it shows the other's light and the cold "breaths" to avoid) and guides the other out loud.
5. **The bell**: the register of the dead, then two ropes. Pull them in turn, without stopping.
6. **The great gate**: the lanterns only burn when you stay close together. Push the wall together.

## How to play

- **Create a game**, send the link (or the 5-letter code) to the others. Each one turns on their mic and says they're ready, then the host enters the abbey.
- **Try solo**: to explore. The two-person puzzles adapt themselves.
- Computer: WASD or arrow keys, mouse to look (click to lock the cursor), E or click to act (hold for winches and the wall), Shift to walk faster, J for the notebook, M for the mic.
- Phone: left thumb to walk, right thumb to look, round button to act. Best in landscape (Menu → Full screen).

## Under the hood

Static files, nothing to install. three.js (r128) and PeerJS are loaded from cdnjs. Textures (stone, flagstones, skulls, wood) and all sounds are generated in the browser. Players' browsers connect directly to each other (WebRTC via PeerJS); the player who creates the game holds the state of the mechanisms. Render resolution adjusts itself to stay smooth.

For testing on a single computer: adding `?local` to the address lets tabs in the same browser talk to each other (no voice).
