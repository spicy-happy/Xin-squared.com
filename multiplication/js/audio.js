/* 8-bit sound effects via Web Audio — no audio files needed */
const SFX = (() => {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // one square/triangle blip, Game Boy style
  function tone(freq, dur, opts = {}) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const { type = 'square', vol = 0.12, when = 0, slide = 0 } = opts;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, opts = {}) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const { vol = 0.15, when = 0 } = opts;
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(gain).connect(c.destination);
    src.start(t0);
  }

  return {
    setMuted(m) { muted = m; },
    unlock() { ensure(); },
    correct() { tone(660, 0.08); tone(880, 0.12, { when: 0.08 }); },
    wrong() { tone(160, 0.2, { type: 'sawtooth', vol: 0.1 }); tone(110, 0.25, { type: 'sawtooth', vol: 0.1, when: 0.08 }); },
    move() { tone(240, 0.03, { vol: 0.06 }); },
    eat() { tone(440, 0.09, { slide: 440 }); },
    pop() { tone(520, 0.05, { vol: 0.08 }); },
    hit() { tone(150, 0.15, { type: 'square', vol: 0.15 }); noise(0.12, { vol: 0.08 }); },
    explode() { noise(0.3, { vol: 0.18 }); tone(90, 0.3, { type: 'triangle', vol: 0.15 }); },
    laser() { tone(1200, 0.12, { slide: -900, vol: 0.09 }); },
    key() { tone(784, 0.07); tone(988, 0.07, { when: 0.07 }); tone(1319, 0.14, { when: 0.14 }); },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { when: i * 0.13 }));
      tone(1047, 0.4, { when: 0.55, type: 'triangle', vol: 0.1 });
    },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.18, { when: i * 0.16, type: 'triangle' })); },
    tick() { tone(1000, 0.02, { vol: 0.04 }); }
  };
})();
