// Fixed-step recording of one ball: every game frame (1/30 s) captured.
const { chromium } = require('playwright');
(async () => {
  const [cam, tag, n] = [process.argv[2], process.argv[3], Number(process.argv[4] || 70)];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 560, height: 315 } });
  await p.addInitScript(() => { localStorage.setItem('stumps.seenHow', 'true'); localStorage.setItem('stumps.played', 'true'); localStorage.setItem('stumps.settings', JSON.stringify({ music: false, sfx: false, quality: 'low', camera: 'broadcast' })); });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4184/'); await p.waitForTimeout(9000);
  await p.evaluate(() => window.__scene.start()); await p.waitForTimeout(300); await p.click('#i-go');
  await p.evaluate(([cam]) => {
    const s = window.__scene; s.r = (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
    s.next(); s.t = 0.4; window.__frame = 0;
    const up = s.update.bind(s);
    s.sys.sceneUpdate = (t, d) => { if (window.__hold) return; up(t, 1000 / 30); window.__frame++; window.__hold = true; };
    const view = s.view.bind(s);
    if (cam === 'side') s.view = (dt) => { view(dt); };
    s.__cam = cam;
    const fr = s.world.frame.bind(s.world);
    s.world.frame = (c, v, dt) => { if (cam === 'side') { c.pos = { x: 3.4, y: 1.4, z: 1.3 }; c.look = { x: -0.2, y: 1.0, z: 1.3 }; c.update(); } if (cam === 'bowl') { c.pos = { x: 5, y: 1.6, z: 19.5 }; c.look = { x: 0.1, y: 1.2, z: 19.5 }; c.update(); } fr(c, v, dt); };
    document.getElementById('hud').style.display = 'none';
  }, [cam]);
  const D = '/tmp/claude-0/-home-claude/34a92d61-ec3e-5a92-93cf-8c5592e686f4/scratchpad/rec/' + tag + '_';
  let tapped = false;
  for (let i = 0; i < n; i++) {
    const st = await p.evaluate(() => { const s = window.__scene; return { ph: s.phase, bt: s.ballTime(), ti: s.tIdeal }; });
    if (!tapped && st.ph === 'ball' && st.bt >= st.ti - 0.01) { await p.evaluate(() => window.__scene.hit({ x: 22, y: 0, z: 40 })); tapped = true; }
    if (process.env.METRICS) console.log(i, await p.evaluate(() => {
      const w = window.__scene.world; const V = w.bat.position.constructor;
      const wp = (b) => b.getWorldPosition(new V());
      const bat = w.bat; const axis = new V(0, -1, 0).applyQuaternion(bat.quaternion); const top = bat.position.clone();
      const distToHandle = (p) => { const d = p.clone().sub(top); const along = d.dot(axis); return d.sub(axis.clone().multiplyScalar(along)).length().toFixed(3) + '@' + along.toFixed(2); };
      const r = w.rBatter, u = w.batter.m.bones;
      const palm = (h, f) => wp(h).lerp(wp(f), 0.5);
      return ['RB L ' + distToHandle(palm(r.bone('L Hand'), r.bone('L Finger2'))), 'RB R ' + distToHandle(palm(r.bone('R Hand'), r.bone('R Finger2'))), 'UAL L ' + distToHandle(palm(u.get('hand_l'), u.get('middle_01_l'))), 'UAL R ' + distToHandle(palm(u.get('hand_r'), u.get('middle_01_r'))), 'wristGap L ' + wp(r.bone('L Hand')).distanceTo(wp(u.get('hand_l'))).toFixed(3)].join(' | ');
    }));
    if (!process.env.METRICS || i % 15 === 0) await p.screenshot({ path: D + String(i).padStart(3, '0') + '.png', timeout: 120000 });
    await p.evaluate(() => { window.__hold = false; });
    await p.waitForFunction(() => window.__hold === true, null, { timeout: 120000 });
  }
  console.log('errors', errs); await b.close();
})();
