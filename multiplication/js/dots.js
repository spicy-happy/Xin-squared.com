/* DOT GRID — multiplication as arrays of dots. Relaxed pace, concept builder.
   On a wrong answer the rows light up one by one with skip counting. */
(() => {
  const $ = MAIN.$;
  const ROUNDS = 10;

  let round, score, fact, firstTry;
  let timeouts = [];

  function later(fn, ms) { timeouts.push(setTimeout(fn, ms)); }
  function clearTimeouts() { timeouts.forEach(clearTimeout); timeouts = []; }

  function hud() {
    MAIN.setHUD('DOT GRID ' + MAIN.tableLabel(), 'SCORE ' + score);
  }

  function buildGrid(a, b) {
    // a rows of b dots
    const grid = $('#dots-grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = 'repeat(' + b + ', auto)';
    const size = Math.max(10, Math.min(24, Math.floor(240 / Math.max(a, b))));
    grid.style.setProperty('--dotsize', size + 'px');
    for (let r = 0; r < a; r++) {
      for (let c = 0; c < b; c++) {
        const d = document.createElement('div');
        d.className = 'dot';
        d.dataset.row = r;
        d.style.animationDelay = (r * b + c) * 12 + 'ms';
        grid.appendChild(d);
      }
    }
  }

  /* light up rows one at a time with the running total: 4... 8... 12! */
  function skipCount(a, b, done) {
    const dots = $('#dots-grid').children;
    const skipEl = $('#dots-skip');
    let parts = [];
    for (let r = 0; r < a; r++) {
      later(() => {
        SFX.pop();
        for (const d of dots) {
          if (+d.dataset.row === r) d.classList.add('lit');
          else if (+d.dataset.row === r - 1) d.classList.remove('lit');
        }
        parts.push((r + 1) * b);
        skipEl.textContent = parts.join('  ');
      }, r * 550);
    }
    later(() => {
      for (const d of dots) d.classList.remove('lit');
      done();
    }, a * 550 + 700);
  }

  function nextRound() {
    if (round >= ROUNDS) return end();
    round++;
    firstTry = true;
    fact = MAIN.makeFact(9);
    $('#dots-round').textContent = 'ROUND ' + round + ' / ' + ROUNDS;
    $('#dots-q').textContent = fact.a + ' × ' + fact.b + ' = ?';
    $('#dots-skip').textContent = fact.a + ' ROWS OF ' + fact.b;
    buildGrid(fact.a, fact.b);
    MAIN.renderChoices($('#dots-choices'), MAIN.makeChoices(fact.ans, fact.a, fact.b), fact.ans, (ok) => {
      if (ok) {
        SFX.correct();
        score += firstTry ? 10 : 5;
        hud();
        later(nextRound, 500);
      } else {
        SFX.wrong();
        firstTry = false;
        $('#dots-skip').textContent = 'COUNT THE ROWS!';
        skipCount(fact.a, fact.b, () => {
          $('#dots-skip').textContent = fact.a + ' ROWS OF ' + fact.b + ' = ' + fact.ans;
        });
      }
    });
  }

  function end() {
    const newBest = MAIN.setBest('dots', score);
    MAIN.showResult({
      title: 'ALL DONE!',
      win: true,
      newBest,
      lines: ['SCORE: ' + score + ' / 100', score === 100 ? 'PERFECT ROUND!' : 'FIRST TRY = 10 PTS']
    });
  }

  function start() {
    round = 0;
    score = 0;
    hud();
    nextRound();
  }

  function stop() { clearTimeouts(); }

  MAIN.register('dots', { start, stop });
})();
