/* Shell: view switching, menu, table picker, storage, question helpers */
const MAIN = (() => {

  const GAMES = [
    { id: 'flash',    name: 'FLASH BLITZ', desc: '60 SEC. BUILD A STREAK!',      icon: 'bolt',       bestLabel: 'BEST' },
    { id: 'dots',     name: 'DOT GRID',    desc: 'COUNT THE DOT ARMY',           icon: 'dotsIcon',   bestLabel: 'BEST' },
    { id: 'muncher',  name: 'MUNCHER',     desc: 'EAT MULTIPLES. DODGE TROGG!',  icon: 'muncher',    bestLabel: 'BEST' },
    { id: 'boss',     name: 'BOSS BATTLE', desc: 'ANSWER = ATTACK!',             icon: 'sword',      bestLabel: 'WINS' },
    { id: 'meteor',   name: 'METEOR MATH', desc: 'BLAST FALLING EQUATIONS',      icon: 'meteorIcon', bestLabel: 'BEST' },
    { id: 'keyquest', name: 'KEY QUEST',   desc: 'FIND THE MISSING NUMBER',      icon: 'keyIcon',    bestLabel: 'BEST' }
  ];

  // ---------- storage ----------
  const KEY = 'xin-multiplication';
  let store;
  try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { store = {}; }
  store.best = store.best || {};
  if (store.sound === undefined) store.sound = true;
  if (store.table === undefined) store.table = 'mix';

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  function getBest(id) { return store.best[id] || 0; }

  function setBest(id, score) {
    if (score > getBest(id)) {
      store.best[id] = score;
      save();
      return true;
    }
    return false;
  }

  // ---------- view switching ----------
  const $ = s => document.querySelector(s);
  let currentGame = null;   // module of the running game
  let currentGameId = null; // id string
  let pendingGameId = null; // chosen in menu, waiting for table pick

  function show(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + viewId).classList.add('active');
    $('#hud').classList.toggle('hidden', viewId === 'boot' || viewId === 'menu');
  }

  function setHUD(title, rightHTML) {
    $('#hud-title').textContent = title;
    $('#hud-right').innerHTML = rightHTML || '';
  }

  function stopGame() {
    if (currentGame && currentGame.stop) currentGame.stop();
    currentGame = null;
  }

  function goMenu() {
    stopGame();
    buildMenu();
    show('menu');
  }

  // ---------- questions ----------
  function rand(n) { return Math.floor(Math.random() * n); }

  function pickTable() {
    return store.table === 'mix' ? 2 + rand(11) : store.table;
  }

  let lastFactKey = '';
  function makeFact(maxB) {
    let a, b, key, tries = 0;
    do {
      a = pickTable();
      b = 1 + rand(maxB || 10);
      key = a + 'x' + b;
      tries++;
    } while (key === lastFactKey && tries < 8);
    lastFactKey = key;
    return { a, b, ans: a * b };
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* correct answer + 3 plausible distractors (common kid errors) */
  function makeChoices(ans, a, b) {
    const pool = shuffle([
      ans + a, ans - a, ans + b, ans - b,
      a * (b + 1), a * (b - 1), (a + 1) * b,
      ans + 1, ans - 1, ans + 10, ans - 10
    ].filter(v => v > 0 && v !== ans));
    const picks = [];
    for (const v of pool) {
      if (!picks.includes(v)) picks.push(v);
      if (picks.length === 3) break;
    }
    while (picks.length < 3) {
      const v = ans + 2 + rand(10);
      if (v !== ans && !picks.includes(v)) picks.push(v);
    }
    return shuffle([ans, ...picks]);
  }

  /* fill a .choices container; onPick(correct:boolean, btn) */
  function renderChoices(container, choices, ans, onPick) {
    container.innerHTML = '';
    let done = false;
    choices.forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = v;
      btn.addEventListener('pointerdown', () => {
        if (done) return;
        if (v === ans) {
          done = true;
          btn.classList.add('right');
          onPick(true, btn);
        } else {
          btn.classList.add('wrong');
          btn.disabled = true;
          onPick(false, btn);
        }
      });
      container.appendChild(btn);
    });
    return { lock() { done = true; } };
  }

  // ---------- result screen ----------
  let resultCfg = {};
  function showResult(cfg) {
    stopGame();
    resultCfg = cfg;
    $('#result-title').textContent = cfg.title;
    $('#result-lines').innerHTML = cfg.lines.map(l => '<div>' + l + '</div>').join('');
    $('#result-newbest').classList.toggle('hidden', !cfg.newBest);
    show('result');
    if (cfg.win) SFX.fanfare(); else SFX.lose();
  }

  // ---------- menu ----------
  function tableLabel() {
    return store.table === 'mix' ? 'MIX' : '×' + store.table;
  }

  function buildMenu() {
    const wrap = $('#menu-cards');
    wrap.innerHTML = '';
    GAMES.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'game-card';
      btn.appendChild(makeIcon(MAPS[g.icon]));
      const txt = document.createElement('div');
      txt.innerHTML = '<div class="card-name">' + g.name + '</div><div class="card-desc">' + g.desc + '</div>';
      btn.appendChild(txt);
      const best = document.createElement('div');
      best.className = 'card-best';
      best.innerHTML = getBest(g.id) ? g.bestLabel + '<br>' + getBest(g.id) : '';
      btn.appendChild(best);
      btn.addEventListener('click', () => {
        SFX.pop();
        pendingGameId = g.id;
        buildTablePicker(g);
        show('table');
      });
      wrap.appendChild(btn);
    });
    $('#btn-sound').textContent = 'SOUND: ' + (store.sound ? 'ON' : 'OFF');
  }

  // ---------- table picker ----------
  function buildTablePicker(g) {
    $('#table-gamename').textContent = g.name;
    const grid = $('#table-grid');
    grid.innerHTML = '';
    const opts = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 'mix'];
    opts.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'table-btn' + (String(store.table) === String(t) ? ' last' : '');
      btn.textContent = t === 'mix' ? 'MIX' : '×' + t;
      btn.addEventListener('click', () => {
        SFX.pop();
        store.table = t;
        save();
        startGame(pendingGameId);
      });
      grid.appendChild(btn);
    });
  }

  const registry = {};
  function register(id, module) { registry[id] = module; }

  function startGame(id) {
    stopGame();
    currentGameId = id;
    currentGame = registry[id];
    show(id);
    currentGame.start();
  }

  // ---------- boot ----------
  function boot() {
    SFX.setMuted(!store.sound);

    $('#hud-back').addEventListener('click', () => { SFX.pop(); goMenu(); });

    $('#btn-sound').addEventListener('click', () => {
      store.sound = !store.sound;
      save();
      SFX.setMuted(!store.sound);
      $('#btn-sound').textContent = 'SOUND: ' + (store.sound ? 'ON' : 'OFF');
      SFX.pop();
    });

    $('#result-again').addEventListener('click', () => { SFX.pop(); startGame(currentGameId); });
    $('#result-table').addEventListener('click', () => {
      SFX.pop();
      pendingGameId = currentGameId;
      buildTablePicker(GAMES.find(g => g.id === currentGameId));
      show('table');
    });
    $('#result-menu').addEventListener('click', () => { SFX.pop(); goMenu(); });

    // audio needs a user gesture to unlock
    document.addEventListener('pointerdown', () => SFX.unlock(), { once: true });

    // keyboard: 1-4 pick choices in the visible .choices container
    document.addEventListener('keydown', e => {
      if (e.key >= '1' && e.key <= '4') {
        const view = document.querySelector('.view.active .choices');
        if (view) {
          const btns = view.querySelectorAll('.choice-btn');
          const btn = btns[+e.key - 1];
          if (btn && !btn.disabled) btn.dispatchEvent(new PointerEvent('pointerdown'));
        }
      }
      if (currentGame && currentGame.onKey) currentGame.onKey(e);
    });

    buildMenu();
    setTimeout(() => {
      if ($('#view-boot').classList.contains('active')) show('menu');
    }, 2200);
    $('#view-boot').addEventListener('pointerdown', () => show('menu'));
  }

  return {
    boot, register, show, setHUD, goMenu, showResult,
    makeFact, makeChoices, renderChoices, shuffle, rand,
    getBest, setBest, tableLabel, pickTable,
    get table() { return store.table; },
    $
  };
})();
