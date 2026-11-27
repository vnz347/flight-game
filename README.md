# Skyline Courier

[![make.fun](https://make.fun/badge/entry.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun](https://make.fun/badge/open.svg)](https://make.fun)
[![make.fun](https://make.fun/badge/usdc.svg)](https://make.fun)

A little aeroplane, three sorties, one runway home. Fly the gold rings over the
valley, thread the mountain pass, then grease a sunset landing on runway 09 —
with fuel and an airframe that both keep score.

## How to fly

- **↑ / ↓** — pitch (climb / descend)
- **← / →** — bank (turn)
- **Shift / Ctrl** — throttle up / down
- **1, 2, 3** — pick a sortie from the title screen
- **P** — pause · **M** — mute · **Space / click** — start, restart

## The sorties

1. **Ring Run** — five gold rings over the valley, then land on runway 09.
2. **Mountain Pass** — four rings through the high pass. Mind the peaks.
3. **Sunset Landing** — one last ring over the river, then a sunset landing.

Green rings top the tanks up. A clean landing pays for a gentle descent, a slow
touchdown and a straight heading. Hit the terrain and the hull takes damage;
three hard knocks and the sortie is over.

## Play it

```sh
node serve.ts   # then open http://localhost:8080
```

Everything is drawn in code — terrain, sky, runway, rings, the aeroplane and the
instruments — and the sound is synthesised in the browser. No network, no assets.
