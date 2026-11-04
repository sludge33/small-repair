# Small Repairs

ASMR mobile game: restore one broken object per 5–10 minute session; sound and haptics are the reward.

**Design doc (source of truth):** https://claude.ai/artifact/NV6C4xRxuXoFB1x2nwcZRu

## Current milestone: kintsugi bowl prototype (~6 weeks)

Goal: one object at final audio/haptic quality, placeholder art. Go/no-go = players replay the bowl for the feel alone.

- [ ] Week 1 – gesture model, debug overlay, blade-on-ceramic wired to audio + haptics
- [ ] Week 2 – record/edit foley, Web Audio layers, tune modulation on device
- [x] Week 3 – placeholder 3D bowl generated in code, masks (clean, lacquer, gold, polish), shard alignment + snapping (played in a desktop browser, not yet on a phone)
- [x] Week 4 – unbox, wrap and letter flow, tutorial ghost hand (played in a desktop browser, not yet on a phone)
- [ ] Week 5 – Android haptics, performance pass, free-mode replay (all three in code and played in a desktop browser; haptics and frame rates still need checking on Android phones)
- [ ] Week 6 – playtests, tuning, go/no-go

In the slice's scope but in no week yet: the inspect step (tap three cracks) and the one shelf slot. Until the shelf exists, free mode starts from "Again" on the finished bowl: the repair alone, with no parcel, note or letter.

Platform: **mobile web (TypeScript, Vite, Web Audio, PWA)** — see [docs/decisions/0002-web.md](docs/decisions/0002-web.md). iPhone browsers have no haptics; that decision record explains the trade-off.

## Setup

1. Install Git LFS once per machine: `git lfs install` (audio, textures, models and native plugins are stored in LFS; see `.gitattributes`).
2. Install Node 22 or newer, then run these from `web/`:

```sh
npm install
npm run dev        # also on your LAN for testing on a phone
npm test
npm run build      # typechecks, then writes the static site to web/dist
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions).

Toggle the debug overlay with a three-finger tap, or F1 on a keyboard. For a phone check it shows script time per frame, draws per second, the resolution the bowl has settled on, and how many vibrations the device refused. On a desktop, the mouse is the finger and the scroll wheel is pressure; while holding a shard the wheel twists it, and ctrl+wheel zooms. On a phone, two fingers turn and pinch the bowl, or twist a held shard.

## Folders

| Folder | Holds |
| --- | --- |
| docs/ | Design doc shortcut, notes, decisions |
| web/ | The game: `src/core/` holds the tested rules with no browser dependencies |
| prototype/ | Retired Unity 6 project, kept until the web build is checked on a phone |
| audio/foley/raw, audio/foley/edited | Recordings (3 speeds x 2 pressures per loop; 8–12 variations per one-shot) |
| audio/haptics/ | AHAP patterns (iOS) and Android composition specs |
| art/reference/ | Kintsugi, ceramic and shop reference images |
| playtests/ | Session notes against the success criteria |
