# Run the game
```
npm install
npm run dev      # play at http://localhost:5173
npm test         # 43 tests
npm run build    # single-file dist/index.html
```
Steps 1–21 of the base game and the next-gen pass (memory-bank/feature-next-gen.md) are done (see memory-bank/progress.md). Use the method below for new features (fouls, offside, gamepad, real Meshy/Mixamo models…): write a `feature-implementation.md` with small steps + tests, then go step by step.

# Start here — prompts in order (Nicolas Zullo method)

1. Open this folder in VS Code, open the terminal, run `claude`.
2. **Clarify the plan** (do this once):
   > Read all the documents in /memory-bank. Is implementation-plan.md clear? What are your questions to make it 100% clear for you?
   Answer its questions, then:
   > Update implementation-plan.md with my answers.
3. **Step 1** (use Plan Mode first: shift+tab):
   > Read all the documents in /memory-bank, and proceed with Step 1 of the implementation plan. I will run the tests. Do not start Step 2 until I validate the tests. Once I validate them, open progress.md and document what you did for future developers. Then add any architectural insights to architecture.md to explain what each file does.
4. Run the test yourself. If it passes, tell Claude "validated", then commit:
   `git add . && git commit -m "Step 1"`
5. `/clear` to start fresh, then:
   > Now go through all files in the memory-bank, read progress.md to understand prior work, and proceed with Step 2. Do not start Step 3 until I validate the test.
6. Repeat until Step 21.

## If something breaks
- `/rewind` in Claude Code, or `git reset --hard` to the last commit, then retry with a sharper prompt.
- Copy console errors (F12) or screenshots into Claude.
- For big things (e.g. the player model) write a separate `player-implementation.md` with small steps; expect ~30 prompts, not one.

## Assets you need to get yourself (before Step 9)
- Rigged footballer model: meshy.ai (text → 3D, auto-rig) → export GLB/FBX.
- Animations: mixamo.com (free) → idle, jog, sprint, soccer pass, soccer kick, tackle, header, celebration, goalkeeper idle/dive/catch.
- Put them in public/assets/.
