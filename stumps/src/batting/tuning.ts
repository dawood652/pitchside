// Batting tuning: every number that decides how forgiving timing is lives here.
export const BAT = {
  LEAD: 0.17, // s from tap to bat on the ball (the downswing)
  PERFECT: 0.02, // |timing error| for green: six in the air, four along the ground
  GOOD: 0.06, // yellow: still a boundary
  WINDOW: 0.09, // beyond this the bat is too early / too late to reach the ball
  DRIFT: 5.5, // rad of direction change per second of error (early = squarer leg side, late = finer off side)
  ALONG_GOOD: 0.07, // ball met this far toward the toe/splice in the yellow band
  ALONG_OFF: 0.17, // ...and this far at the edge of the window (toe / splice: 1-2 runs)
  EDGE_GOOD: 0.04, // chance of an edge in the yellow band
  EDGE_OFF: 0.25, // ...and at the edge of the window
  REACH_OFF: 0.62, // x (m) beyond which the batter is reaching for a wide ball outside off
  REACH_MAX: 1.15, // x beyond which the ball is out of reach
  LEG_MAX: -0.75, // x down the leg side beyond which off-side shots miss
  OFF_POWER: 0.7, // fraction of bat speed / bounce lost at the edge of the window
  YORKER_DIG: 0.08, // a yorker is dug out off the bottom of the bat
  FRONT_Z: 1.95, // where the ball is met on the front foot / back foot (also the meter's centre)
  BACK_Z: 1.05,
};
