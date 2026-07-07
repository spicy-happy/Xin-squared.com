/* METEOR MATH — equations fall on meteors; type the answer and FIRE to blast them. */
(() => {
  const $ = MAIN.$;
  const W = 320, H = 330, GROUND = H - 52;

  let meteors, lasers, booms, buildings;
  let score, wave, destroyed, typed;
  let running = false, loop = null, lastT = 0, spawnIn = 0;
  let ctx, meteorSprite;

  function hud() {
    MAIN.setHUD('METEOR ' + MAIN.tableLabel(), 'SCORE ' + score + '<br>WAVE ' + wave);
  }

  function spawn() {
    const f = MAIN.makeFact(10);
    meteors.push({
      ...f,
      x: 30 + MAIN.rand(W - 90),
      y: -20,
      speed: 13 + wave * 3.5 + MAIN.rand(6)
    });
  }

  function fire() {
    if (!running || !typed) return;
    const val = +typed;
    // hit the lowest matching meteor
    let target = null;
    for (const m of meteors) {
      if (m.ans === val && (!target || m.y > target.y)) target = m;
    }
    if (target) {
      SFX.laser();
      lasers.push({ x: target.x + 20, y: target.y + 20, t: 0.12 });
      booms.push({ x: target.x + 20, y: target.y + 20, t: 0.35 });
      meteors = meteors.filter(m => m !== target);
      destroyed++;
      score += 10 + wave * 2;
      if (destroyed % 8 === 0) { wave++; SFX.fanfare(); }
      hud();
      setTimeout(() => SFX.explode(), 80);
    } else {
      SFX.wrong();
    }
    typed = '';
    renderTyped();
  }

  function renderTyped() {
    $('#meteor-typed').textContent = typed || '_';
  }

  function meteorLands(m) {
    booms.push({ x: m.x + 20, y: GROUND - 10, t: 0.5 });
    SFX.explode();
    // damage the nearest standing building
    let best = -1, bd = 1e9;
    buildings.forEach((b, i) => {
      if (b.alive && Math.abs(b.x + 30 - m.x) < bd) { bd = Math.abs(b.x + 30 - m.x); best = i; }
    });
    if (best >= 0) buildings[best].alive = false;
    document.getElementById('screen').classList.add('quake');
    setTimeout(() => document.getElementById('screen').classList.remove('quake'), 350);
    if (!buildings.some(b => b.alive)) end();
  }

  function step() {
    if (!running) return;
    const t = performance.now();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    spawnIn -= dt;
    const maxOnScreen = Math.min(3, 1 + Math.floor(wave / 2));
    if (spawnIn <= 0 && meteors.length < maxOnScreen) {
      spawn();
      spawnIn = Math.max(1.6, 4 - wave * 0.35);
    }

    for (const m of meteors) m.y += m.speed * dt;
    const landed = meteors.filter(m => m.y + 30 >= GROUND);
    if (landed.length) {
      meteors = meteors.filter(m => m.y + 30 < GROUND);
      landed.forEach(meteorLands);
    }
    lasers.forEach(l => l.t -= dt);
    booms.forEach(b => b.t -= dt);
    lasers = lasers.filter(l => l.t > 0);
    booms = booms.filter(b => b.t > 0);

    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ground
    ctx.fillStyle = PAL[1];
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = PAL[0];
    ctx.fillRect(0, GROUND, W, 4);

    // buildings
    buildings.forEach(b => {
      if (b.alive) {
        ctx.fillStyle = PAL[0];
        ctx.fillRect(b.x, GROUND - b.h, 60, b.h);
        ctx.fillStyle = PAL[3];
        for (let wy = 0; wy < Math.floor(b.h / 14); wy++) {
          for (let wx = 0; wx < 3; wx++) {
            ctx.fillRect(b.x + 8 + wx * 18, GROUND - b.h + 7 + wy * 14, 8, 7);
          }
        }
      } else {
        ctx.fillStyle = PAL[0];
        ctx.fillRect(b.x + 4, GROUND - 10, 12, 10);
        ctx.fillRect(b.x + 34, GROUND - 14, 16, 14);
      }
    });

    // lasers
    ctx.strokeStyle = PAL[0];
    ctx.lineWidth = 3;
    lasers.forEach(l => {
      ctx.beginPath();
      ctx.moveTo(W / 2, GROUND);
      ctx.lineTo(l.x, l.y);
      ctx.stroke();
    });

    // meteors + equations
    meteors.forEach(m => {
      ctx.drawImage(meteorSprite, m.x, m.y, 40, 40);
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = PAL[0];
      ctx.textAlign = 'center';
      ctx.fillText(m.a + '×' + m.b, m.x + 20, m.y + 54);
    });

    // explosions — expanding pixel squares
    booms.forEach(b => {
      const r = (0.5 - b.t) * 60 + 8;
      ctx.fillStyle = PAL[0];
      for (let i = 0; i < 6; i++) {
        const ang = i * Math.PI / 3;
        ctx.fillRect(b.x + Math.cos(ang) * r - 4, b.y + Math.sin(ang) * r - 4, 8, 8);
      }
    });
  }

  function end() {
    running = false;
    clearInterval(loop);
    const newBest = MAIN.setBest('meteor', score);
    MAIN.showResult({
      title: 'CITY DOWN!',
      win: wave >= 3,
      newBest,
      lines: ['SCORE: ' + score, 'WAVE: ' + wave, 'METEORS BLASTED: ' + destroyed]
    });
  }

  function onKey(e) {
    if (!running) return;
    if (e.key >= '0' && e.key <= '9') { if (typed.length < 3) { typed += e.key; renderTyped(); SFX.pop(); } }
    if (e.key === 'Backspace') { typed = typed.slice(0, -1); renderTyped(); }
    if (e.key === 'Enter') fire();
  }

  function buildPad() {
    const pad = $('#meteor-pad');
    if (pad.children.length) return;
    ['1','2','3','4','5','6','7','8','9','0','DEL','FIRE'].forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'pad-btn' + (k === 'FIRE' ? ' fire' : k === 'DEL' ? ' del' : '');
      btn.textContent = k;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!running) return;
        if (k === 'FIRE') return fire();
        if (k === 'DEL') { typed = typed.slice(0, -1); }
        else if (typed.length < 3) { typed += k; SFX.pop(); }
        renderTyped();
      });
      pad.appendChild(btn);
    });
  }

  function start() {
    const cv = $('#meteor-canvas');
    cv.width = W; cv.height = H;
    ctx = cv.getContext('2d');
    meteorSprite = drawMap(document.createElement('canvas'), MAPS.meteorIcon);
    buildPad();

    meteors = []; lasers = []; booms = [];
    buildings = [{ x: 22, h: 44, alive: true }, { x: 130, h: 56, alive: true }, { x: 238, h: 38, alive: true }];
    score = 0; wave = 1; destroyed = 0; typed = '';
    renderTyped();
    hud();
    running = true;
    lastT = performance.now();
    spawnIn = 0.5;
    clearInterval(loop);
    loop = setInterval(step, 33);
  }

  function stop() {
    running = false;
    clearInterval(loop);
    loop = null;
  }

  MAIN.register('meteor', { start, stop, onKey });
})();
