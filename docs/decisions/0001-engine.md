# 0001 – Engine: Unity 6

**Status:** Superseded by [0002](0002-web.md), 2026-11-04. Accepted 2026-11-02.

## Decision

Build the kintsugi bowl prototype in **Unity 6 (URP)** with **FMOD Studio** for audio and native plugins for haptics.

## Why

- **Audio is the riskiest part of the game, and FMOD has an official Unity integration.** Godot 4 would depend on a community FMOD extension for the layered crossfades and per-frame parameters the gesture model drives.
- **Native haptics need a plugin in either engine.** Unity's iOS (Objective-C/Swift) and Android (AAR/Java) plugin paths are better documented for wrapping Core Haptics and `VibrationEffect.Composition`.
- **GPU paint masks and PBR close-ups are standard in URP.** Render-texture masks with GPU coverage readback (`AsyncGPUReadback`) fit the clean, lacquer, gold and polish steps.

## Trade-offs accepted

- Unity's licence terms and editor weight versus Godot's MIT licence and small footprint.
- Larger repository and slower first import; mitigated with Git LFS and the `.gitignore` for `Library/` and builds.

## Follow-ups

- Week 1: confirm the haptics bridge on one iPhone and one Android device before the gesture model is built on top of it.
- Week 1: check which touch-pressure signal Unity exposes per device (`Touch.pressure` versus `Touch.radius`); iPhones without 3D Touch report radius only.
