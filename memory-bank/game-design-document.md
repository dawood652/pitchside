# Game Design Document — "Pitchside" (working title)

## 1. Concept
A 3D, broadcast-style 11v11 football game that runs in the browser. One human player controls a team against a CPU team. The feel target is "arcade-sim": closer to FIFA/EA FC in camera and presentation, but simpler controls and stylised (not photoreal) players.

All teams, players and leagues are fictional. Kits use colour schemes that echo famous clubs and national sides, but no real names, crests, logos, sponsors or player likenesses.

## 2. Core Pillars
1. **Looks like football on TV.** 3D stadium, broadcast camera, grass pitch with stripes and correct markings, crowd, scoreboard overlay.
2. **Players move like footballers.** Skeletal animations for idle, jog, sprint, pass, shoot, tackle, header, celebrate, goalkeeper dive/catch. Smooth blending between them.
3. **The ball feels real.** Physics-based ball: bounce, roll, spin/curve, friction, power-based shots and passes.
4. **Readable and fun first.** If realism and fun conflict, fun wins.

## 3. Match Rules (base game)
- 11v11, standard formation 4-3-3 for both teams (more formations later).
- Two halves, default 3 minutes each (configurable 2/4/6/10).
- Goals, kick-off after a goal, half-time switch of sides.
- Throw-ins, goal kicks and corners when the ball leaves the pitch.
- No offside, fouls or cards in the base game (added later as features).
- Winner = most goals. Draw allowed in friendly mode.

## 4. Controls (keyboard first, gamepad later)
| Action | Key |
|---|---|
| Move | WASD / Arrow keys |
| Sprint | Shift (hold) |
| Pass (ground) | J (tap) |
| Through ball | I |
| Shoot | K (hold to charge power, release to shoot) |
| Lob / cross | L |
| Tackle / pressure (defending) | J |
| Switch player (defending) | Q |
| Pause | Esc |

- The controlled player has a ring marker under their feet.
- Shot/pass power shown as a small bar above the player.
- Aim is the direction the player is moving/facing (assisted toward goal/teammates).

## 5. Camera
- Default: broadcast side camera, high in the stands, follows the ball horizontally with smoothing.
- Replays and other angles come later.

## 6. AI (CPU behaviour, base game)
- Every player has a "home position" from the formation, shifted by ball position (team block moves up/down/sideways).
- Ball carrier AI: dribble toward goal, pass to an open teammate if pressured, shoot when within range and angle.
- Defending AI: nearest player presses the ball, others hold shape and mark lanes.
- Goalkeeper: positions on the line between ball and goal centre, dives at shots it can reach.
- Teammates of the human player use the same AI.

## 7. Teams (fictional, colour-inspired)
Kits are home colours only in the base game.
| Team | Primary | Secondary | Inspired by (colours only) |
|---|---|---|---|
| Royal Blanca CF | White | Gold | Madrid white |
| Catalonia Grana | Claret | Navy (stripes) | Barcelona stripes |
| Merseyside Reds | Red | White | Liverpool red |
| Manchester Sky | Sky blue | White | City sky blue |
| Bavaria Rot | Red | White | Munich red |
| Torino Zebras | Black | White (stripes) | Turin stripes |
| Parisian Navy | Navy | Red | Paris navy/red |
| Milano Nerazzurri | Blue | Black (stripes) | Milan blue/black |

Player names are generated from fictional name lists. Each team has an overall rating (60–90) that scales player speed, shot power and AI decision quality.

## 8. Presentation
- Stadium: four stands with crowd (instanced low-poly figures or billboards), floodlights, ad boards with fictional brands.
- HUD: score bug top-left (team short names, score, clock), power bar, controlled-player name.
- Simple menus: Main menu → Pick teams → Match → Full-time result.
- Audio: crowd ambience, kick sounds, whistle, goal roar (royalty-free).

## 9. Art Direction
- Stylised semi-realistic players (consistent proportions, clean kits). Not photoreal.
- Players: rigged humanoid models (Meshy or similar) with Mixamo-compatible skeleton so Mixamo animations can be applied.
- Kits coloured at runtime via materials so one model serves all teams.

## 10. Out of Scope (base game)
Online multiplayer, career mode, transfers, licensed anything, commentary, weather, replays, offside/fouls/cards, set-piece routines, gamepad. These are candidates for later `feature-implementation.md` files.

## 11. Success Criteria for the Base Game
- A full 11v11 match plays from kick-off to full-time without crashes.
- 60 FPS on a mid-range laptop in Chrome.
- A human can score a goal by passing and shooting; the CPU can score too.
- Players visibly run, pass, shoot and celebrate with animations, not sliding T-poses.
