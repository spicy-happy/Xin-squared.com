/* FLASH BLITZ — 60 second timed flash cards with streaks and combo scoring */
(() => {
  const $ = MAIN.$;
  const DURATION = 60;

  let timer = null;
  let timeLeft, score, streak, bestStreak, answered, correct;

  function hud() {
    MAIN.setHUD('FLASH BLITZ ' + MAIN.tableLabel(), 'SCORE ' + score);
  }

  function streakRow() {
    const el = $('#flash-streak');
    if (streak >= 3) {
      el.textContent = '★ STREAK ' + streak + ' — +' + (10 + streak * 2) + ' PTS';
    } else if (streak > 0) {
      el.textContent = 'STREAK ' + streak;
    } else {
      el.textContent = '';
    }
  }

  function nextQuestion() {
    const f = MAIN.makeFact(10);
    $('#flash-q').textContent = f.a + ' × ' + f.b;
    const picker = MAIN.renderChoices($('#flash-choices'), MAIN.makeChoices(f.ans, f.a, f.b), f.ans, (ok) => {
      answered++;
      if (ok) {
        SFX.correct();
        correct++;
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        score += 10 + streak * 2;
        hud();
        streakRow();
        setTimeout(() => { if (timer) nextQuestion(); }, 250);
      } else {
        SFX.wrong();
        streak = 0;
        streakRow();
      }
    });
  }

  function tick() {
    timeLeft--;
    const fill = $('#flash-timefill');
    fill.style.width = (timeLeft / DURATION * 100) + '%';
    fill.classList.toggle('low', timeLeft <= 10);
    if (timeLeft <= 10 && timeLeft > 0) SFX.tick();
    if (timeLeft <= 0) end();
  }

  function end() {
    clearInterval(timer);
    timer = null;
    const acc = answered ? Math.round(correct / answered * 100) : 0;
    const newBest = MAIN.setBest('flash', score);
    MAIN.showResult({
      title: "TIME'S UP!",
      win: acc >= 60,
      newBest,
      lines: [
        'SCORE: ' + score,
        'BEST STREAK: ' + bestStreak,
        'SOLVED: ' + correct + '/' + answered,
        'ACCURACY: ' + acc + '%'
      ]
    });
  }

  function start() {
    timeLeft = DURATION;
    score = 0; streak = 0; bestStreak = 0; answered = 0; correct = 0;
    $('#flash-timefill').style.width = '100%';
    $('#flash-timefill').classList.remove('low');
    hud();
    streakRow();
    nextQuestion();
    timer = setInterval(tick, 1000);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  MAIN.register('flash', { start, stop });
})();
