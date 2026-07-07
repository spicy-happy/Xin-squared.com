/* KEY QUEST — missing-factor puzzles (3 × ? = 12) unlock 10 dungeon doors. */
(() => {
  const $ = MAIN.$;
  const DOORS = 10;

  let door, score, firstTry, fact;
  let ctx, timeouts = [];
  let doorResults; // 'gold' | 'silver' per door

  function later(fn, ms) { timeouts.push(setTimeout(fn, ms)); }

  function hud() {
    MAIN.setHUD('KEY QUEST ' + MAIN.tableLabel(), 'SCORE ' + score);
  }

  function drawScene(open, treasure) {
    const W = 128, H = 96;
    ctx.clearRect(0, 0, W, H);
    // floor + wall bricks
    ctx.fillStyle = PAL[1];
    ctx.fillRect(0, H - 12, W, 12);
    ctx.fillStyle = PAL[2];
    for (let y = 0; y < H - 12; y += 12) {
      for (let x = (y / 12) % 2 ? 0 : 8; x < W; x += 16) {
        ctx.fillRect(x, y, 14, 10);
      }
    }
    if (treasure) {
      // chest
      ctx.fillStyle = PAL[0];
      ctx.fillRect(34, 40, 60, 44);
      ctx.fillStyle = PAL[2];
      ctx.fillRect(38, 44, 52, 14);
      ctx.fillRect(38, 62, 52, 18);
      ctx.fillStyle = PAL[0];
      ctx.fillRect(58, 56, 12, 12);
      ctx.fillStyle = PAL[3];
      ctx.fillRect(61, 59, 6, 6);
      return;
    }
    // door frame (arched)
    ctx.fillStyle = PAL[0];
    ctx.fillRect(38, 24, 52, 60);
    ctx.fillRect(42, 16, 44, 12);
    if (open) {
      // open doorway — dark inside, key floating
      ctx.fillStyle = PAL[3];
      ctx.fillRect(44, 22, 40, 58);
      ctx.fillStyle = PAL[0];
      ctx.fillRect(48, 26, 32, 54);
      const key = drawMap(document.createElement('canvas'), MAPS.keyIcon);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(key, 46, 40, 36, 36);
    } else {
      // closed door with planks + handle
      ctx.fillStyle = PAL[1];
      ctx.fillRect(44, 22, 40, 58);
      ctx.fillStyle = PAL[0];
      for (let x = 52; x < 84; x += 10) ctx.fillRect(x, 24, 2, 54);
      ctx.fillStyle = PAL[3];
      ctx.fillRect(74, 52, 6, 6);
    }
  }

  function drawProgress() {
    const wrap = $('#kq-progress');
    wrap.innerHTML = '';
    for (let i = 0; i < DOORS; i++) {
      const d = document.createElement('div');
      d.className = 'kq-dot' + (doorResults[i] === 'gold' ? ' gold' : doorResults[i] === 'silver' ? ' silver' : i === door ? ' here' : '');
      wrap.appendChild(d);
    }
  }

  function nextDoor() {
    if (door >= DOORS) return end();
    firstTry = true;
    fact = MAIN.makeFact(10);
    // hide either a or b
    const hideA = Math.random() < 0.5;
    const missing = hideA ? fact.a : fact.b;
    const qText = hideA
      ? '? × ' + fact.b + ' = ' + fact.ans
      : fact.a + ' × ? = ' + fact.ans;
    $('#kq-q').textContent = qText;

    drawScene(false);
    drawProgress();

    // choices are small missing factors, not products
    const opts = [missing];
    let d = 1;
    while (opts.length < 4) {
      for (const v of [missing - d, missing + d]) {
        if (v >= 1 && v <= 12 && !opts.includes(v) && opts.length < 4) opts.push(v);
      }
      d++;
    }
    MAIN.renderChoices($('#kq-choices'), MAIN.shuffle(opts), missing, (ok) => {
      if (ok) {
        SFX.key();
        doorResults[door] = firstTry ? 'gold' : 'silver';
        score += firstTry ? 20 : 10;
        hud();
        drawScene(true);
        drawProgress();
        door++;
        later(nextDoor, 900);
      } else {
        SFX.wrong();
        firstTry = false;
        $('#kq-q').textContent = 'LOCKED! TRY AGAIN';
        later(() => { $('#kq-q').textContent = qText; }, 800);
      }
    });
  }

  function end() {
    drawScene(false, true);
    drawProgress();
    const golds = doorResults.filter(r => r === 'gold').length;
    const newBest = MAIN.setBest('keyquest', score);
    MAIN.showResult({
      title: 'TREASURE!',
      win: true,
      newBest,
      lines: [
        'ALL ' + DOORS + ' DOORS OPEN!',
        'GOLD KEYS: ' + golds + ' / ' + DOORS,
        'SCORE: ' + score + ' / 200'
      ]
    });
  }

  function start() {
    const cv = $('#kq-canvas');
    cv.width = 128; cv.height = 96;
    ctx = cv.getContext('2d');
    door = 0;
    score = 0;
    doorResults = Array(DOORS).fill(null);
    hud();
    nextDoor();
  }

  function stop() {
    timeouts.forEach(clearTimeout);
    timeouts = [];
  }

  MAIN.register('keyquest', { start, stop });
})();
