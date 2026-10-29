# Implementation Plan — Base Game

Rules for the AI developer:
- Do ONE step at a time. Stop after each step and wait for the human to validate the test.
- No step may skip its test.
- Keep files small and modular (see tech-stack.md).
- After validation: update `progress.md` and `architecture.md`.

---

## Phase 1 — Foundation

**Step 1. Project setup**
Create a Vite + TypeScript project, install three and vitest, create the folder layout from tech-stack.md, init git.
*Test:* `npm run dev` opens a page with a blank canvas filling the window; `npm test` runs one dummy passing test.

**Step 2. Game loop**
Add a fixed-timestep loop (60 Hz update, render every frame) and an FPS counter in the corner.
*Test:* FPS counter shows ~60; a unit test confirms the loop calls update the right number of times for a given elapsed time.

**Step 3. Pitch**
Build a 105×68 m pitch with mown stripes, white line markings (halfway line, centre circle, boxes, penalty spots, arcs, corner arcs) and goals with nets at both ends.
*Test:* Visually compare against a real pitch diagram; all markings in correct proportions; goals are 7.32 m wide, 2.44 m high.

**Step 4. Stadium and lighting**
Add four stands around the pitch, floodlights, sky, ad boards with fictional brand names, and a crowd made of instanced low-poly figures in mixed colours.
*Test:* Orbit camera (temporary) around the stadium; no gaps, no z-fighting, steady 60 FPS.

**Step 5. Broadcast camera**
Replace the orbit camera with the broadcast side camera from the GDD, following a target point with smoothing.
*Test:* Move a debug target with the keyboard; camera follows smoothly and never shows outside the stadium.

## Phase 2 — Ball

**Step 6. Ball physics**
Create the ball (0.22 m diameter) with gravity, air drag, bounce, rolling friction and spin (Magnus curve). Tuning values in `tuning.ts`.
*Test:* Unit tests: a dropped ball bounces lower each time and stops; a ball rolled at 10 m/s stops within a realistic distance; a ball with sidespin curves. Visual: debug key fires the ball in random directions.

**Step 7. Ball vs. goal and pitch boundaries**
Ball collides with posts, crossbar and net; detect when the ball fully crosses the goal line (goal) or touchline/byline (out).
*Test:* Unit tests for goal/out detection at edge positions (ball half over the line = not out). Visual: fire the ball at the post and it rebounds.

## Phase 3 — Players and animation

**Step 8. Player placeholder**
Create a Player entity using a capsule mesh, with position, velocity, facing direction, max speed and acceleration. One player controlled by WASD + Shift sprint.
*Test:* Player accelerates/decelerates smoothly, turns to face movement direction, sprint is ~30% faster.

**Step 9. Import rigged model and animations**
Load the rigged player GLB and the animation clips (idle, jog, sprint, pass, shot, tackle, header, celebrate, GK idle, GK dive left/right, GK catch). Kit colours applied per team via material.
*Test:* A debug panel lists all clips; clicking each plays it on the model; two models with different kit colours render side by side.

**Step 10. Locomotion animation state machine**
Blend idle → jog → sprint based on speed, with crossfades. Match animation playback speed to movement speed so feet don't slide.
*Test:* Walk, run, stop and turn the controlled player; no foot sliding, no snapping between animations.

**Step 11. Dribbling**
When the controlled player is close to the ball, they take control: the ball is nudged ahead with each touch, faster at sprint (heavier touches).
*Test:* Dribble around the pitch; ball stays near the feet at jog and moves further ahead at sprint; can lose it by turning too sharply at sprint.

**Step 12. Passing and shooting**
Pass (J): ground pass to the best teammate in the facing direction with power based on distance. Shoot (K hold/release): power bar, shot toward goal with aim assist. Play pass/shot animations timed so the foot hits the ball on the contact frame.
*Test:* Pass between two dummy teammates; shoot from 18 m and score into an empty goal; weak and strong shots behave differently.

## Phase 4 — Teams and match

**Step 13. Teams and formation**
Load teams from `teams.ts` (fictional names, colours from GDD). Spawn 22 players in 4-3-3 for both sides with correct kits; goalkeeper in a different colour.
*Test:* Kick-off view shows 22 correctly placed players, two distinct kits, two keepers.

**Step 14. Team shape AI**
Every non-controlled player moves to their home position shifted by ball position and possession.
*Test:* Move the ball around with a debug key; both teams shift as blocks without overlapping.

**Step 15. Attacking and defending AI**
Ball carrier AI (dribble/pass/shoot decisions), pressing by nearest defender, tackling to win the ball, and player switching (Q) for the human.
*Test:* Watch CPU vs CPU for 3 minutes: teams pass, tackle and take shots; at least one shot on target.

**Step 16. Goalkeeper AI**
Positioning on the ball-goal line, diving saves with dive animations, catching, goal kicks/throws to restart.
*Test:* Fire 20 shots of varying difficulty; keeper saves the easy ones, misses some hard ones, animation matches direction.

**Step 17. Match rules and restarts**
Kick-off, goals and score, throw-ins, corners, goal kicks, clock, half-time side swap, full-time.
*Test:* Unit tests for restart decisions (who last touched the ball, which restart, where). Play a full match without the game getting stuck.

## Phase 5 — Presentation

**Step 18. HUD**
Score bug, match clock, power bar, controlled-player marker and name, "GOAL!" banner.
*Test:* All HUD elements update correctly during a match and stay readable at 1366×768 and 1920×1080.

**Step 19. Menus and team select**
Main menu, team select for both sides (shows kit colours and rating), match length option, full-time screen with score and "play again".
*Test:* Complete the full loop: menu → pick teams → play → full-time → menu, twice in a row without reloading.

**Step 20. Audio and celebrations**
Crowd ambience, kick sounds, whistles, goal roar; scorer runs to celebrate with an animation, camera holds on them.
*Test:* Sounds trigger at the right moments; celebration plays after each goal, then kick-off resumes.

**Step 21. Performance pass**
Profile and optimise: instancing, shadow settings, LODs, texture sizes.
*Test:* Stable 60 FPS for a full match in Chrome on a mid-range laptop.

---

Base game done → create separate `feature-implementation.md` files for: fouls & cards, offside, gamepad, replays, more formations, tournament mode, online multiplayer.
