# Architecture

What each file does and how the pieces connect. Updated after every major feature or milestone.

## Data flow
```
Input (keys / touch) ─┐
                      ▼
Game.update(dt) @ 60 Hz fixed step
  ├─ updateHuman      (controlled player)
  ├─ updateTeamAI ×2  (outfield players)
  ├─ updateKeeper ×2
  ├─ restartAI        (kick-offs, throw-ins, corners, goal kicks)
  ├─ Player.integrate (movement, turning, action timers)
  ├─ updatePendingKick (ball leaves the foot on the contact frame)
  ├─ carryBall | ball.step + looseBall + resolveTackles
  ├─ separate         (no overlapping players)
  └─ checkOut         (goal / restart via rules.ts)
        │ events[] (kick, whistle, goal, save…)
        ▼
Render every frame: PlayerView (pose blend) · BallView · BroadcastCamera · Stadium crowd · HUD · Sound
```
Gameplay code never imports three.js (except views), so all logic runs headless in vitest.

## Files
- `src/main.ts` — boots world, demo match behind the menu, starts matches, routes events to HUD and audio, adaptive quality.
- `src/core/loop.ts` — fixed-step stepper + rAF loop. `input.ts` — keyboard/touch actions with pressed/released edges. `vec.ts` — small maths helpers.
- `src/data/tuning.ts` — every tuning number. `teams.ts` — fictional teams + colour distance (kit clash). `formations.ts` — 4-3-3 slots, kick-off positions. `names.ts` — seeded fictional squads.
- `src/physics/ball.ts` — BallSim (drag, spin, bounce, roll, posts, net), boundary checks, rolling prediction.
- `src/entities/player.ts` — Player state, ratings, movement integration, action timers.
- `src/match/state.ts` — MatchState shape + helpers. `game.ts` — phases, clock, score, restarts, celebrations. `control.ts` — dribbling, first touch, headers, tackles, keeper catches/parries, spacing. `actions.ts` — pass/shoot/throw/tackle + pending kick release. `kicks.ts` — velocity solvers. `rules.ts` — restart decisions. `human.ts` — human control, receiver picking, switching.
- `src/ai/teamAI.ts` — shape, pressing, chasing, support runs, carrier decisions. `keeper.ts` — keeper AI. `predict.ts` — ball prediction + interception.
- `src/assets/player.glb` — CC0 mannequin + 43 clips (built by `tools/build-assets.mjs`).
- `src/animation/pose.ts` — Pose type, blending, keyframe tracks. `clips.ts` — procedural football poses (kick, dive, catch, throw…). `animator.ts` — mixer blending + clip one-shots + procedural bone layer + head tracking.
- `src/render/playerModel.ts` — GLB loader, kit shader (bind-pose regions). `post.ts` — post-processing chain. `src/match/replay.ts` — 8 s ring buffer + slow-motion goal replay.
- `src/render/scene.ts` — renderer, lights, sky. `pitch.ts` — grass + markings texture. `goals.ts` — posts, bar, nets. `stadium.ts` — stands, crowd, floodlights, ad boards. `camera.ts` — broadcast/celebration camera. `playerView.ts` — rig + animation state machine, controlled-player marker. `ballView.ts` — ball mesh, roll, contact shadow.
- `src/ui/hud.ts` — score bug, banners, power bar. `menu.ts` — team select, pause, full-time. `touch.ts` — mobile controls.
- `src/audio/sound.ts` — WebAudio synthesised crowd, kicks, whistles.
- `tests/` — ball, rules/kick solvers, human controls, keeper, full CPU-vs-CPU match.

## Key decisions
- Custom ball physics instead of Rapier — one ball, players kinematic; simpler and fully testable.
- Skinned CC0 mannequin + mocap clips, with procedural layers for football-specific moves the library lacks (kicks, dives).
- Kits painted in a shader from bind-pose position: one model serves every team, no texture authoring.
- Fouls/offside/penalties are pure functions in `rules.ts` (unit tested); `control.ts` applies them.
- Kick contact delayed to the animation's contact frame — the foot visibly hits the ball.
- Away kit auto-switches when shirt colours are too close (`colourDistance` < 140).
- Single-file build (vite-plugin-singlefile) so the game can be shared as one HTML page.

## Revamp additions
- `src/render/quality.ts` — FPS guard and DPR control; decides whether `render/post.ts` is used.
- `src/ui/settings.ts` — Settings type, load/save, settings panel.
- `src/render/camera.ts` — `BroadcastCamera.update(dt, CamInput)` with six camera types; `shot()` for replays.
- `src/match/control.ts` — `carryBall` (touch dribble), `firstTouch`, `stealLooseTouch`.
- `src/match/human.ts` — assisted collection, contain, `nextSwitch`/`autoSwitch` modes; consumes `s.tapPass`.
- State additions: `humanMove`, `assist`, `lastSwitchT`, `nextSwitch`, `time`, `tapPass`; Player `touchTimer`.
