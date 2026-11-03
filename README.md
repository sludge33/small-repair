# Small Repairs

ASMR mobile game: restore one broken object per 5–10 minute session; sound and haptics are the reward.

**Design doc (source of truth):** https://claude.ai/artifact/NV6C4xRxuXoFB1x2nwcZRu

## Current milestone: kintsugi bowl prototype (~6 weeks)

Goal: one object at final audio/haptic quality, placeholder art. Go/no-go = players replay the bowl for the feel alone.

- [ ] Week 1 – gesture model, debug overlay, blade-on-ceramic wired to audio + haptics
- [ ] Week 2 – record/edit foley, FMOD events, tune modulation on device
- [ ] Week 3 – masks (clean, lacquer, gold, polish), shard alignment + snapping
- [ ] Week 4 – unbox, wrap and letter flow, tutorial ghost hand
- [ ] Week 5 – Android haptics, performance pass, free-mode replay
- [ ] Week 6 – playtests, tuning, go/no-go

Engine: **Unity 6 (URP) + FMOD Studio** — see [docs/decisions/0001-engine.md](docs/decisions/0001-engine.md).

## Setup

1. Install Git LFS once per machine: `git lfs install` (audio, textures, models and native plugins are stored in LFS; see `.gitattributes`).
2. Install Unity Hub and the latest Unity 6 LTS with the Android Build Support and iOS Build Support modules.
3. Open `prototype/` in Unity Hub.
4. For clean scene/prefab merges, register UnityYAMLMerge in your git config (path depends on the editor version):
   `git config merge.unityyamlmerge.driver '"<Unity editor>/Data/Tools/UnityYAMLMerge.exe" merge -p %O %B %A %A'`

## Folders

| Folder | Holds |
| --- | --- |
| docs/ | Design doc shortcut, notes, decisions |
| prototype/ | Engine project for the bowl slice |
| audio/foley/raw, audio/foley/edited | Recordings (3 speeds x 2 pressures per loop; 8–12 variations per one-shot) |
| audio/haptics/ | AHAP patterns (iOS) and Android composition specs |
| art/reference/ | Kintsugi, ceramic and shop reference images |
| playtests/ | Session notes against the success criteria |
