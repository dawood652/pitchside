// Fixed-step run of one ball; every frame, measure the realistic batter's body against the engine skeleton.
const { chromium } = require('playwright');
(async () => {
  const aim = JSON.parse(process.argv[2] || '{"x":22,"y":0,"z":40}');
  const n = Number(process.argv[3] || 72);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 180 } });
  await p.addInitScript(() => { localStorage.setItem('stumps.seenHow', 'true'); localStorage.setItem('stumps.played', 'true'); localStorage.setItem('stumps.settings', JSON.stringify({ music: false, sfx: false, quality: 'low', camera: 'broadcast' })); });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4184/'); await p.waitForTimeout(9000);
  await p.evaluate(() => window.__scene.start()); await p.waitForTimeout(300); await p.click('#i-go');
  await p.evaluate(() => {
    const s = window.__scene; s.r = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
    s.next(); s.t = 0.4; const up = s.update.bind(s);
    s.sys.sceneUpdate = (t, d) => { if (window.__hold) return; up(t, 1000 / 30); window.__hold = true; };
    const w = s.world; const fr = w.frame.bind(w);
    w.frame = (c, v, dt) => { fr(c, v, dt); window.__sk = v.batter; };
  });
  await p.waitForFunction(() => window.__hold === true && !!window.__sk, null, { timeout: 120000 });
  const rows = []; let tapped = false;
  for (let i = 0; i < n; i++) {
    const st = await p.evaluate(() => { const s = window.__scene; return { ph: s.phase, bt: s.ballTime(), ti: s.tIdeal }; });
    if (!tapped && st.ph === 'ball' && st.bt >= st.ti - 0.01) { await p.evaluate((a) => window.__scene.hit(a), aim); tapped = true; }
    rows.push(await p.evaluate((bt) => {
      const w = window.__scene.world, r = w.rBatter, sk = window.__sk, V = w.bat.position.constructor;
      const W = (q) => new V(-q.x, q.y, q.z);
      const bp = (nm) => r.bone(nm).getWorldPosition(new V());
      const ang = (a, b, c) => { const u = a.clone().sub(b).normalize(), v2 = c.clone().sub(b).normalize(); return Math.round(Math.acos(Math.max(-1, Math.min(1, u.dot(v2)))) * 180 / Math.PI); };
      const o = { bt: +bt.toFixed(3) };
      const pairs = { kneeL: ['L Calf', sk.knL], kneeR: ['R Calf', sk.knR], ankL: ['L Foot', sk.ftL], ankR: ['R Foot', sk.ftR], elbL: ['L Forearm', sk.elL], elbR: ['R Forearm', sk.elR], shL: ['L UpperArm', sk.shL], shR: ['R UpperArm', sk.shR], hipL: ['L Thigh', sk.hipL], hipR: ['R Thigh', sk.hipR], head: ['Head', sk.head] };
      for (const [k, [bn, q]] of Object.entries(pairs)) o['e_' + k] = +bp(bn).distanceTo(W(q)).toFixed(3);
      o.footYL = +Math.min(bp('L Foot').y, bp('L Toe0').y).toFixed(3); o.footYR = +Math.min(bp('R Foot').y, bp('R Toe0').y).toFixed(3);
      o.ankL = bp('L Foot').toArray().map(x => +x.toFixed(3)); o.ankR = bp('R Foot').toArray().map(x => +x.toFixed(3));
      o.kneeAngL = ang(bp('L Thigh'), bp('L Calf'), bp('L Foot')); o.kneeAngR = ang(bp('R Thigh'), bp('R Calf'), bp('R Foot'));
      o.elbAngL = ang(bp('L UpperArm'), bp('L Forearm'), bp('L Hand')); o.elbAngR = ang(bp('R UpperArm'), bp('R Forearm'), bp('R Hand'));
      // knee bends forward? (knee ahead of the hip-ankle line, toward where the toes point)
      const kf = (s) => { const h = bp(s + ' Thigh'), k = bp(s + ' Calf'), a = bp(s + ' Foot'), t = bp(s + ' Toe0'); const mid = h.clone().add(a).multiplyScalar(0.5); const fw = t.clone().sub(a); fw.y = 0; fw.normalize(); return +k.clone().sub(mid).dot(fw).toFixed(3); };
      o.kneeFwdL = kf('L'); o.kneeFwdR = kf('R');
      o.headY = +bp('Head').y.toFixed(2); o.pelvisY = +bp('Pelvis').y.toFixed(2);
      // bones: proportions (once)
      if (!window.__props) { const d = (a, c) => +bp(a).distanceTo(bp(c)).toFixed(3); window.__props = { thigh: d('L Thigh', 'L Calf'), shin: d('L Calf', 'L Foot'), upper: d('L UpperArm', 'L Forearm'), fore: d('L Forearm', 'L Hand'), shoulders: d('L UpperArm', 'R UpperArm'), hips: d('L Thigh', 'R Thigh'), spine: +bp('Pelvis').distanceTo(bp('Neck')).toFixed(3) }; o.props = window.__props; }
      return o;
    }, st.bt));
    await p.evaluate(() => { window.__hold = false; });
    await p.waitForFunction(() => window.__hold === true, null, { timeout: 120000 });
  }
  require('fs').writeFileSync(process.argv[4] || '/tmp/claude-0/-home-claude/34a92d61-ec3e-5a92-93cf-8c5592e686f4/scratchpad/audit.json', JSON.stringify(rows));
  console.log('errors', errs, 'frames', rows.length); await b.close();
})();
