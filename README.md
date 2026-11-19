# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/mrjxmx/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/mrjxmx/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

## Solano Heat

An original top-down open-world crime game that runs entirely in the browser — no build step, no assets, no network. Every street, sprite and sound is drawn or synthesised by the code in `game/`.

**Port Solano** is a sun-soaked coastal city of six districts — the Marina and its boardwalk, Beachfront, Downtown, Midtown, the Suburbs and the Port — laid out on a named street grid (Palmera Avenue, Solano Boulevard, Meridian Street, Harbor View Drive, Dockside Avenue and Craneway across; Marina Row, Calle del Sol, Avenida Central, Palma Real and Calle Sur down). You are **Marina Vega**, once the best getaway driver in Las Brisas. The night her boat burned she ended up owing the fixer **Dario Klem** a fortune, and Port Solano is where she pays it back: one job, one car, one police chase at a time.

### What's in the game

- **A six-mission story chain** with dialog, on-screen objectives and cash rewards: meet Dario, steal a Cielo Coupe, run hot cargo from Warehouse 9 to the Marina Club, shake a three-star tail, race the five-checkpoint Harbor Run against the clock, and lift a cargo van out of the port for the Long Score. After the story, endless side jobs (pickups and deliveries) keep the money coming.
- **Driving and theft**: six vehicle types with their own pace and handling, arcade physics with drifting, handbrake turns, skid marks, crash damage and wrecks. Walk up to any car and take it — if anyone sees, the heat rises.
- **A wanted system**: crimes witnessed by pedestrians or officers (theft, hit-and-runs, collisions, gunfire) raise your stars. Solano PD patrol cars spawn, pursue, ram and box you in; stop moving next to one and the BUSTED meter fills. Break line of sight and the heat bleeds away. Get caught and you wake up outside Solano PD, fined; get flattened and Clínica Solano patches you up for a fee.
- **On foot**: walk and run through crowds that stroll, panic, dive out of the road and flee gunfire. A mouse-aimed pistol with tracers and muzzle flash handles the arguments.
- **An economy**: mission pay, a garage that repairs your ride, resprays it and clears your wanted level for $150, and a clinic that heals for $50.
- **Presentation**: a live minimap (roads, police blips, objective ring, the garage/clinic/PD), wanted stars, objective panel with distance and timers, dialog boxes, pause menu, and a save/continue system in localStorage. Sound is 100% WebAudio synthesis — engine hum, two-tone sirens, gunfire, crashes, cash-register mission stingers — with no audio files.

### Controls

- **WASD / arrows** — walk, or drive (with **Space** handbrake)
- **Shift** — run on foot · **Mouse** — aim · **Click** — shoot
- **E** — talk / enter & exit cars / use the garage and clinic · **R** — retry a failed job
- **P / Esc** — pause · **M** — mute

## Run it

```sh
node serve.ts
# then open http://localhost:8080

MAKEFUN_OUTPUT_DIR=out node main.ts
# copies game/ + screenshots/ into out/ and writes out/dossier.json
```

<sub>Entered on [make.fun](https://make.fun/?ref=fj3hte3r&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
