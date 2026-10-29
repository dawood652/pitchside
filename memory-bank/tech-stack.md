# Tech Stack — simplest robust option

## Core
| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Type safety keeps a growing AI-written codebase sane |
| Build / dev server | Vite | Instant reload, zero config |
| 3D rendering | Three.js | Most documented web 3D library; the AI knows it best |
| Animation | Three.js `AnimationMixer` + GLB clips | Built-in skeletal animation and crossfade blending |
| Physics | Custom lightweight ball physics (gravity, drag, bounce, friction, spin/Magnus) | A football game needs one physical ball, not a full physics engine. Players move kinematically. Swap to Rapier only if collisions get complex |
| UI / HUD / menus | Plain HTML + CSS overlay on top of the canvas | Simpler than in-canvas UI |
| Audio | Howler.js | Simple, reliable web audio |
| Tests | Vitest for logic (rules, AI decisions, physics maths) + manual in-browser checks | Each implementation step has a test |
| Version control | Git, commit after every validated step | Rollback when the AI breaks something |

## Assets pipeline
| Asset | Tool | Format |
|---|---|---|
| Player model (one base male footballer) | Meshy (text/image → 3D, auto-rig) or Hunyuan3D + Mixamo auto-rig | GLB |
| Animations (idle, jog, sprint, pass, shot, tackle, header, celebrate, GK dive/catch) | Mixamo (free) — "Without skin", 30 fps, then merged into one GLB in Blender | GLB |
| Stadium & props | Built procedurally in Three.js code first; optionally Blender + Blender MCP later | Code / GLB |
| Ball | Procedural sphere with a texture | Code |
| Grass | Procedural striped texture in code | Code |
| Sound | Freesound.org / ElevenLabs SFX | OGG / MP3 |

## Folder layout (target)
```
/src
  main.ts            entry, boots the game
  /core              loop, time, input, events
  /render            scene, camera, lighting, stadium, pitch
  /entities          Player, Ball, Team, Goalkeeper
  /animation         animation loader + state machine
  /physics           ball physics
  /ai                team shape, decision making, goalkeeper AI
  /match             rules, clock, score, restarts (throw-in, corner, goal kick)
  /ui                HUD, menus
  /data              teams.ts, formations.ts, names.ts
  /audio             sound manager
/public/assets       models, animations, textures, sounds
/tests               vitest tests
/memory-bank         design + progress docs (Obsidian vault friendly)
```

## Rules of thumb
- No file over ~300 lines; split by responsibility.
- Gameplay logic must not depend on rendering (so it can be tested headless).
- Fixed timestep for simulation (60 Hz), render interpolated.
- All tuning numbers (speeds, powers, friction) live in `/src/data/tuning.ts`.
