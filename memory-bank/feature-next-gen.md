# Feature plan — "Next-gen" pass (bodies, rendering, depth)

Assets: Quaternius Universal Animation Library 1 + 2 (CC0). One realistic-proportion skinned mannequin (65-bone UE-style skeleton) + 254 clips. Football-relevant clips are pruned into one compressed GLB.

## Phase A — Real 3D bodies + animation
A1. Asset pipeline: merge UAL1+UAL2, keep only needed clips, meshopt-compress → `public/assets/player.glb`. *Test:* file < 4 MB, loads in browser, clip list printed.
A2. Players use cloned SkinnedMesh (SkeletonUtils.clone). Kit painted by a shader from bind-pose position: shirt/shorts/socks/boots/skin regions, stripes/halves, number on back, hair attached to head bone. *Test:* 22 players render in the right kits; close-up check.
A3. Animation controller per player (AnimationMixer): idle/walk/jog/sprint blend by speed with timeScale matched to ground speed (no foot sliding); one-shots for kick, slide tackle, header jump, throw, knock-down + get-up, turns, 5 celebrations. *Test:* close-up screenshots of each state.
A4. Procedural layer on top of clips: head tracks the ball, keeper dive pose drives real bones, kick contact frame synced to the ball release. *Test:* dive sequence screenshots; ball leaves on the foot swing.

## Phase B — Modern rendering
B1. Post-processing: ambient occlusion, bloom, colour grade, SMAA; auto-disabled on weak devices. *Test:* before/after screenshot, fps check.
B2. Image-based lighting (environment reflections) + sky; night mode with floodlights. *Test:* day and night screenshots.
B3. Grass: procedural normal map + mown stripes with sheen; sharper shadows fitted to the pitch. *Test:* close-up of grass.
B4. Stadium: roof trusses, glowing floodlights, crowd animated on the GPU (cheap), tunnel/dugouts. *Test:* wide shot.
B5. Goal replays with cinematic cameras + scorer graphic. *Test:* replay plays after a goal and returns to kick-off.

## Phase C — Gameplay depth
C1. Fouls: mistimed/from-behind tackles → free kick; in the box → penalty. Yellow/red cards. *Test:* unit tests for foul decisions.
C2. Free kicks (wall of defenders, aim + curl) and penalties (aim, keeper guesses). *Test:* scripted free kick and penalty scenarios.
C3. Offside on passes (second-last defender rule, own half exempt) → indirect free kick. *Test:* unit tests.
C4. Finesse shot (curl) and chip shot; difficulty levels (Amateur / Pro / World Class). *Test:* curl test, AI reaction differs by level.
C5. Gamepad support (standard mapping). *Test:* mapping unit test.
