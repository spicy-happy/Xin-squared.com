/* MUNCHER — Number Munchers homage. Eat every multiple of the target, dodge the Troggle. */
(() => {
  const $ = MAIN.$;
  const COLS = 5, ROWS = 4;

  let cells, px, py, tx, ty;      // player + troggle positions
  let table, level, score, lives, remaining;
  let trogTimer = null, alive = false;
  let playerCv, trogCv;

  function hud() {
    MAIN.setHUD('MUNCHER L' + level, 'SCORE ' + score + '<br>' + '♥'.repeat(lives));
  }

  function idx(x, y) { return y * COLS + x; }

  function buildLevel() {
    table = MAIN.table === 'mix' ? 2 + MAIN.rand(11) : MAIN.table;
    $('#muncher-target').textContent = 'EAT MULTIPLES OF ' + table + '!';
    $('#muncher-msg').textContent = 'EAT THE ×' + table + ' NUMBERS';

    // 7 multiples + 13 decoys
    const values = [];
    const mults = MAIN.shuffle([1,2,3,4,5,6,7,8,9,10].map(m => m * table)).slice(0, 7);
    mults.forEach(v => values.push({ v, target: true }));
    while (values.length < COLS * ROWS) {
      const v = 2 + MAIN.rand(table * 10);
      if (v % table !== 0) values.push({ v, target: false });
    }
    MAIN.shuffle(values);
    cells = values.map(o => ({ ...o, eaten: false }));
    remaining = cells.filter(c => c.target).length;

    const grid = $('#muncher-grid');
    grid.innerHTML = '';
    cells.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'mcell';
      el.textContent = c.v;
      grid.appendChild(el);
      c.el = el;
    });

    px = 0; py = ROWS - 1;
    tx = COLS - 1; ty = 0;
    placeSprites();
    hud();

    clearInterval(trogTimer);
    trogTimer = setInterval(moveTroggle, Math.max(500, 1350 - level * 90));
  }

  function placeSprites() {
    cells[idx(px, py)].el.appendChild(playerCv);
    cells[idx(tx, ty)].el.appendChild(trogCv);
  }

  function move(dx, dy) {
    if (!alive) return;
    const nx = px + dx, ny = py + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    px = nx; py = ny;
    cells[idx(px, py)].el.appendChild(playerCv);
    SFX.move();
    checkCollision();
  }

  function eat() {
    if (!alive) return;
    const c = cells[idx(px, py)];
    if (c.eaten) return;
    c.eaten = true;
    c.el.textContent = '';
    c.el.classList.add('eaten');
    c.el.appendChild(playerCv);
    if (c.target) {
      SFX.eat();
      score += 10;
      remaining--;
      hud();
      if (remaining === 0) {
        score += 25;
        level++;
        SFX.fanfare();
        $('#muncher-msg').textContent = 'LEVEL CLEAR! +25';
        alive = false;
        clearInterval(trogTimer);
        setTimeout(() => { alive = true; buildLevel(); }, 1200);
      }
    } else {
      $('#muncher-msg').textContent = c.v + ' IS NOT ×' + table + '!';
      loseLife();
    }
  }

  function moveTroggle() {
    if (!alive) return;
    let dx = 0, dy = 0;
    if (Math.random() < 0.6) {
      // chase the muncher
      if (Math.abs(px - tx) > Math.abs(py - ty)) dx = Math.sign(px - tx);
      else dy = Math.sign(py - ty);
      if (dx === 0 && dy === 0) dx = Math.sign(px - tx) || 1;
    } else {
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      [dx, dy] = dirs[MAIN.rand(4)];
    }
    const nx = Math.min(COLS - 1, Math.max(0, tx + dx));
    const ny = Math.min(ROWS - 1, Math.max(0, ty + dy));
    tx = nx; ty = ny;
    cells[idx(tx, ty)].el.appendChild(trogCv);
    checkCollision();
  }

  function checkCollision() {
    if (px === tx && py === ty) {
      $('#muncher-msg').textContent = 'TROGG GOT YOU!';
      loseLife(true);
    }
  }

  function loseLife(moveAway) {
    SFX.hit();
    lives--;
    hud();
    document.getElementById('screen').classList.add('quake');
    setTimeout(() => document.getElementById('screen').classList.remove('quake'), 350);
    if (lives <= 0) return end();
    if (moveAway) {
      px = 0; py = ROWS - 1;
      tx = COLS - 1; ty = 0;
      placeSprites();
    }
  }

  function end() {
    alive = false;
    clearInterval(trogTimer);
    const newBest = MAIN.setBest('muncher', score);
    MAIN.showResult({
      title: 'GAME OVER',
      win: level > 1,
      newBest,
      lines: ['SCORE: ' + score, 'LEVEL: ' + level, 'TABLE: ' + MAIN.tableLabel()]
    });
  }

  function onKey(e) {
    const map = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0] };
    if (map[e.key]) { e.preventDefault(); move(...map[e.key]); }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); eat(); }
  }

  function start() {
    if (!playerCv) {
      playerCv = drawMap(document.createElement('canvas'), MAPS.muncher);
      trogCv = drawMap(document.createElement('canvas'), MAPS.troggle);
    }
    level = 1; score = 0; lives = 3; alive = true;
    buildLevel();
  }

  function stop() {
    alive = false;
    clearInterval(trogTimer);
    trogTimer = null;
  }

  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      const d = btn.dataset.dir;
      move(d === 'left' ? -1 : d === 'right' ? 1 : 0, d === 'up' ? -1 : d === 'down' ? 1 : 0);
    });
  });
  document.getElementById('btn-eat').addEventListener('pointerdown', e => { e.preventDefault(); eat(); });

  MAIN.register('muncher', { start, stop, onKey });
})();
