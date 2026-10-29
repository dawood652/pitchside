# Progress

Log of completed and validated steps. Newest at the bottom.

## Steps 1–5 — Foundation (2026-10-29)
- Vite + TypeScript + three.js 0.169 project, vitest, git. Fixed 60 Hz loop (`src/core/loop.ts`) with a stepper test.
- Pitch drawn to one 4096 px canvas texture with all markings to FIFA dimensions; verified with a top-down render.
- Stadium: 4 stepped stands, roofs, floodlight towers, LED ad boards (fictional brands), ~12k instanced low-poly crowd coloured by team.
- Broadcast camera (`src/render/camera.ts`) high on the near side, follows the ball; near-stand roof/wall hidden so they never block the view.

## Steps 6–7 — Ball (2026-10-29)
- `src/physics/ball.ts`: gravity, quadratic drag, Magnus sidespin, bounce with restitution, rolling friction, post/crossbar collisions, net trapping.
- `checkBoundary` decides goal / byline / touchline (whole ball must cross). 11 unit tests.

## Steps 8–12 — Players, animation, dribble/pass/shoot (2026-10-29)
- DEVIATION from plan: no Meshy/Mixamo assets (the build environment had no access). Players are procedurally built jointed rigs (`src/animation/rig.ts`) with code-driven clips (`src/animation/clips.ts`): idle, jog/sprint cycle, keeper ready stance, kick (pass/shot/lob with contact frame), slide tackle, header, 3 celebrations, keeper dive, catch, hold ball, throw, stumble. Poses blend every frame so nothing snaps.
- Kits: per-player canvas shirt texture (plain / stripes / halves, number on back), shorts, socks, boots, skin and hair variety.
- Kick solvers (`src/match/kicks.ts`): ground pass speed by binary search on the rolling model, lob by simulating flight, shot with aim, power and error. Ball leaves the foot at the animation contact frame (`PendingKick`).

## Steps 13–17 — Teams, AI, keepers, rules (2026-10-29)
- 8 fictional teams, 4-3-3, seeded fictional squads, per-player ratings derived from team rating and role.
- Team AI (`src/ai/teamAI.ts`): shape that shifts with ball and possession, one chaser/presser per team, forward runs, carrier decisions (shoot / cross / pass scoring / dribble with avoidance).
- Keeper AI (`src/ai/keeper.ts`): angle positioning, reaction delay, catch vs dive with skill-based save chance, parries, claiming loose balls, throws and long kicks.
- Rules: kick-off, goals (own goals included), throw-ins, corners, goal kicks, half-time side swap, full-time. 6 rule tests + full-match simulation test (3 seeds, no stalls, shots happen).

## Steps 18–21 — Presentation (2026-10-29)
- HUD: score bug, clock, half, controlled player + context hints, shot power bar, banners (Goal / Save / Half-time), restart label.
- Menu with live CPU-vs-CPU demo behind it, team select with kit previews, half length; pause; full-time screen with shots and possession.
- Synthesised audio (crowd bed reacting to danger and goals, kicks, whistles, roar).
- Touch controls (stick + 6 buttons) on phones. Adaptive quality drops resolution/shadows below ~42 fps.
- 28 tests passing. Built to a single 595 KB HTML file.

## Known gaps / next features
- Pass completion for AI is ~65% (real football ~80%): tune `bestOption` in teamAI.
- No fouls, cards, offside, replays, gamepad, difficulty setting.
- Player models are stylised; swapping in Meshy + Mixamo GLBs would need a loader + AnimationMixer layer behind `PlayerView`.

## Next-gen pass — Phases A, B, C (2026-10-29)
- **A. Real bodies:** Quaternius Universal Animation Library 1+2 (CC0) mannequin, 43 clips pruned + meshopt-compressed to 822 KB (`tools/build-assets.mjs`). Kits painted by a bind-pose shader (shirt patterns, shorts, socks, boots, skin, hair, simple face, name + number on the back). `PlayerAnimator`: speed/direction blend of idle/walk/jog/sprint/strafes with stride-matched timing; clip one-shots (slide tackle, header jump, falls + kip-up, keeper throw, flips/celebrations, full-time reactions); procedural layer on real bones in character space (football kick synced to ball contact, side dives, catches, throw-ins, keeper stance, head tracks the ball).
- **B. Rendering:** postprocessing + N8AO (AO, bloom, ACES, grade, vignette, SMAA); physical sky + image-based lighting; Day / Evening / Night (floodlit) kick-off; grass normal map + sheen; 4096 shadows; GPU-animated crowd; roof trusses; corner flags; slow-motion goal replays from two camera angles (skippable). Adaptive quality drops AO/resolution on weak devices.
- **C. Depth:** fouls judged per tackle (from behind / contact), yellow and red cards (second yellow = red, player sent off), free kicks with a 9.15 m wall, penalties (box cleared, keeper guesses; the human picks the dive side with W/S), offside on passes (indirect free kick), finesse (O) and chip (L near goal) shots, difficulty (Amateur / Pro / World Class), gamepad (standard mapping).
- 43 tests passing. Build is a single 2.1 MB HTML file.
