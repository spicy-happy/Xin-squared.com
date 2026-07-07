/* BOSS BATTLE — answer to swing your sword. Wrong or slow = the boss hits back. */
(() => {
  const $ = MAIN.$;
  const BOSSES = [
    { name: 'SLIMO',   map: 'slime',  hp: 5,  time: 12 },
    { name: 'BOO-NIK', map: 'ghost',  hp: 7,  time: 10 },
    { name: 'DRAGMUL', map: 'dragon', hp: 9,  time: 8 }
  ];

  let bossIdx, bossHP, hearts, score, qTimer, timeLeft, timeMax, answering;

  function hud() {
    MAIN.setHUD('BOSS ' + (bossIdx + 1) + '/3 ' + MAIN.tableLabel(), 'SCORE ' + score);
  }

  function drawBoss() {
    const b = BOSSES[bossIdx];
    $('#boss-name').textContent = b.name;
    drawMap($('#boss-canvas'), MAPS[b.map]);
    $('#boss-hp').style.width = (bossHP / b.hp * 100) + '%';
  }

  function drawHearts() {
    $('#hero-hearts').textContent = '♥'.repeat(hearts) + '♡'.repeat(3 - hearts);
  }

  function stopTimer() { clearInterval(qTimer); qTimer = null; }

  function nextQuestion() {
    answering = true;
    const b = BOSSES[bossIdx];
    const f = MAIN.makeFact(10);
    $('#boss-q').textContent = f.a + ' × ' + f.b + ' = ?';
    timeMax = b.time;
    timeLeft = timeMax;
    renderTime();
    stopTimer();
    qTimer = setInterval(() => {
      timeLeft -= 0.1;
      renderTime();
      if (timeLeft <= 0) { stopTimer(); bossAttacks('TOO SLOW!'); }
    }, 100);

    MAIN.renderChoices($('#boss-choices'), MAIN.makeChoices(f.ans, f.a, f.b), f.ans, (ok) => {
      if (!answering) return;
      if (ok) {
        answering = false;
        stopTimer();
        heroAttacks();
      } else {
        bossAttacks('WRONG!');
      }
    });
  }

  function renderTime() {
    const fill = $('#boss-timefill');
    fill.style.width = Math.max(0, timeLeft / timeMax * 100) + '%';
    fill.classList.toggle('low', timeLeft <= 3);
  }

  function heroAttacks() {
    SFX.correct();
    const hero = $('#hero-canvas');
    hero.classList.add('attack');
    setTimeout(() => {
      SFX.hit();
      const cv = $('#boss-canvas');
      cv.classList.add('hurt');
      bossHP--;
      score += 10 + Math.round(timeLeft) * 2;
      hud();
      $('#boss-hp').style.width = (Math.max(0, bossHP) / BOSSES[bossIdx].hp * 100) + '%';
      setTimeout(() => {
        hero.classList.remove('attack');
        cv.classList.remove('hurt');
        if (bossHP <= 0) bossDown();
        else nextQuestion();
      }, 350);
    }, 180);
  }

  function bossAttacks(msg) {
    answering = false;
    stopTimer();
    SFX.hit();
    hearts--;
    drawHearts();
    const screen = document.getElementById('screen');
    screen.classList.add('quake');
    $('#boss-q').textContent = msg;
    setTimeout(() => {
      screen.classList.remove('quake');
      if (hearts <= 0) return end(false);
      nextQuestion();
    }, 700);
  }

  function bossDown() {
    SFX.explode();
    score += 50;
    hud();
    $('#boss-q').textContent = BOSSES[bossIdx].name + ' DEFEATED!';
    $('#boss-choices').innerHTML = '';
    setTimeout(() => {
      bossIdx++;
      if (bossIdx >= BOSSES.length) return end(true);
      bossHP = BOSSES[bossIdx].hp;
      drawBoss();
      nextQuestion();
    }, 1300);
  }

  function end(win) {
    stopTimer();
    const wins = win ? (MAIN.getBest('boss') || 0) + 1 : MAIN.getBest('boss');
    if (win) MAIN.setBest('boss', wins);
    MAIN.showResult({
      title: win ? 'YOU WIN!' : 'DEFEATED...',
      win,
      newBest: false,
      lines: win
        ? ['ALL 3 BOSSES DOWN!', 'SCORE: ' + score, 'TOTAL WINS: ' + wins]
        : ['YOU REACHED BOSS ' + (bossIdx + 1), 'SCORE: ' + score, 'TRY AGAIN, HERO!']
    });
  }

  function start() {
    bossIdx = 0;
    hearts = 3;
    score = 0;
    bossHP = BOSSES[0].hp;
    drawMap($('#hero-canvas'), MAPS.hero);
    drawBoss();
    drawHearts();
    hud();
    nextQuestion();
  }

  function stop() { stopTimer(); }

  MAIN.register('boss', { start, stop });
})();
