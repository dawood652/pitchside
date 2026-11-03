# Third-party content

- **Player model and base animations**: Quaternius Universal Animation Library (CC0).
- **Football animations (gf_*)**: from Google Research Football / Gameplay Football,
  Copyright 2019 Google LLC & Bastiaan Konings, Apache License 2.0
  (https://github.com/google-research/football). Retargeted to the Pitchside skeleton by
  tools/add-mocap.mjs + tools/gf-anim.mjs; metadata in src/assets/gf-anims.json. Includes the
  header, chest/knee trap, deflect (keeper save), interfere, trip, stand-up and turn clips (modified:
  retargeted, resampled to 30 fps, quantized, mirrored).
- **Gameplay ideas ported from Google Research Football** (Apache License 2.0, same copyright):
  movement limits (acceleration falloff, max cornering) after src/onthepitch/player/humanoid/
  humanoidbase.cpp, anticipated animation choice for headers after humanoid.cpp, and timing-based
  pass evaluation after AIsupport/AIfunctions.cpp. Re-implemented in TypeScript, no code copied
  verbatim (src/entities/player.ts, src/match/aerial.ts, src/ai/lanes.ts).
- **Football mocap (mc_*)**: Anderson Rohr, Mocap Pack 05 (Soccer), free for use in games.
