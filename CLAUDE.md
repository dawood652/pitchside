# Project rules

# IMPORTANT (always):
# Always read memory-bank/architecture.md before writing any code.
# Always read memory-bank/game-design-document.md before writing any code.
# Always read memory-bank/progress.md to know what is already done.
# After adding a major feature or completing a milestone, update memory-bank/architecture.md.
# Do only the step you are asked to do. Never start the next step before the human validates the test.

## Code rules
- Modular: many small files, no file over ~300 lines. No monolith.
- Follow the folder layout in memory-bank/tech-stack.md.
- Gameplay logic is independent of rendering so it can be unit-tested.
- Fixed 60 Hz simulation step; rendering interpolates.
- All tuning numbers live in src/data/tuning.ts, never hard-coded in logic.
- TypeScript strict mode. No `any` unless unavoidable and commented.
- Every step ends with its test passing (vitest for logic, described manual check for visuals).

## Content rules
- All teams, players, brands and leagues are fictional. No real club names, crests, sponsors or player likenesses.
