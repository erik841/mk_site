(() => {
  'use strict';
  const canvas = document.getElementById('mkCanvas');
  const ctx = canvas.getContext('2d');
  const status = document.getElementById('gameStatus');
  const pauseBtn = document.getElementById('pauseBtn');
  const soundBtn = document.getElementById('soundBtn');
  const difficulty = document.getElementById('difficulty');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const FLOOR = 340;
  const attacks = {
    punch: { damage: 6, range: 72, duration: .24, windup: .07, recovery: .3 },
    kick: { damage: 13, range: 103, duration: .46, windup: .2, recovery: .66 }
  };
  const settings = {
    easy: { speed: 95, reaction: .85, block: .12, aggression: .55 },
    normal: { speed: 140, reaction: .5, block: .36, aggression: .75 },
    hard: { speed: 178, reaction: .3, block: .6, aggression: .9 }
  };
  let p1, p2, wins, round, remaining, phase, phaseTime, paused = false;
  let particles = [], shots = [], keys = new Set(), pressed = new Set();
  let touchKeys = new Set(), pointers = new Map();
  let hitStop = 0, shake = 0, audioContext, sound = false, aiPlan;
  function tone(freq, duration = .08, type = 'triangle') {
    if (!sound || !audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, freq / 3), audioContext.currentTime + duration);
    gain.gain.setValueAtTime(.07, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  }
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  function fighter(x, name, color, facing) {
    return { x, y: FLOOR, vy: 0, hp: 100, name, color, facing, cooldown: 0,
      special: 0, attack: null, stun: 0, frozen: 0, flash: 0, blocking: false, ai: .5, walk: 0 };
  }
  function clearInput() {
    keys.clear(); pressed.clear(); touchKeys.clear(); pointers.clear();
    document.querySelectorAll('[data-key]').forEach(button => button.classList.remove('is-held'));
  }
  function startRound() {
    p1 = fighter(180, 'SUB-ZERO', '#58c5ff', 1);
    p2 = fighter(620, 'SCORPION', '#ffce50', -1);
    remaining = 60; shots = []; particles = []; hitStop = 0; shake = 0;
    phase = 'intro'; phaseTime = 1.3; aiPlan = 'approach';
    clearInput(); status.textContent = `Раунд ${round}. Приготовьтесь!`;
  }
  function newMatch() {
    wins = [0, 0]; round = 1; paused = false;
    pauseBtn.textContent = 'Пауза'; startRound();
  }
  function togglePause() {
    if (phase === 'match') return;
    paused = !paused; clearInput();
    pauseBtn.textContent = paused ? 'Продолжить' : 'Пауза';
    status.textContent = paused ? 'Пауза' : phase === 'fight' ? 'Бой!' : `Раунд ${round}`;
  }
  function endRound() {
    if (phase !== 'fight') return;
    const winner = p1.hp === p2.hp ? -1 : p1.hp > p2.hp ? 0 : 1;
    if (winner >= 0) wins[winner]++;
    phase = wins.some(n => n >= 2) ? 'match' : 'round'; phaseTime = 2.8;
    status.textContent = (winner < 0 ? 'Ничья' : `${winner === 0 ? 'Sub-Zero' : 'Scorpion'} побеждает`) +
      ` — ${wins[0]}:${wins[1]}` + (phase === 'match' ? '. Матч завершён!' : '. Следующий раунд…');
    clearInput(); tone(winner === 0 ? 660 : 160, .35);
  }
  const free = f => f.hp > 0 && f.stun <= 0 && f.frozen <= 0;
  const ready = f => free(f) && !f.attack && f.cooldown <= 0 && !f.blocking;
  function attack(f, kind) {
    if (!ready(f)) return;
    f.attack = { kind, elapsed: 0, hit: false };
    f.cooldown = attacks[kind].recovery;
    tone(kind === 'kick' ? 110 : 180, .06);
  }
  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) particles.push({ x, y, vx: (Math.random() - .5) * 240,
      vy: -40 - Math.random() * 150, life: .45, color });
  }
  function damage(attacker, defender, amount, kind) {
    const blocked = defender.blocking && defender.facing === Math.sign(attacker.x - defender.x) && defender.frozen <= 0;
    defender.hp = Math.max(0, defender.hp - (blocked ? Math.ceil(amount * .15) : amount));
    defender.flash = .12;
    defender.stun = blocked ? .08 : .22;
    if (!blocked) {
      defender.attack = null;
      defender.x = clamp(defender.x + attacker.facing * (kind === 'kick' ? 24 : 12), 30, 770);
      if (kind === 'ice') defender.frozen = 1.35;
      if (kind === 'spear') defender.x = clamp(attacker.x + attacker.facing * 65, 30, 770);
    }
    burst(defender.x, defender.y - 57, blocked ? '#a5bbce' : kind === 'ice' ? '#a8edff' : '#ffcb72');
    hitStop = blocked ? .025 : .055;
    if (!reducedMotion.matches) shake = blocked ? 1 : 5;
    tone(blocked ? 300 : 80, .12, 'square');
    if (defender.hp <= 0) endRound();
  }
  function special(f, kind) {
    if (!ready(f) || f.special > 0) return;
    f.special = 4; f.cooldown = .65;
    if (kind === 'teleport') {
      burst(f.x, f.y - 45, '#ffb43d', 22);
      f.x = clamp(p1.x - p1.facing * 82, 30, 770);
      f.y = FLOOR; f.vy = 0;
      f.facing = Math.sign(p1.x - f.x) || -1;
      burst(f.x, f.y - 45, '#ffb43d', 22);
    } else {
      shots.push({ x: f.x + f.facing * 30, y: f.y - 57, vx: f.facing * 390,
        owner: f, kind, life: 2.1 });
    }
    tone(kind === 'ice' ? 720 : 240, .22, 'sawtooth');
  }
  function updateFighter(f, dt) {
    for (const key of ['cooldown', 'special', 'stun', 'frozen', 'flash']) f[key] = Math.max(0, f[key] - dt);
    f.vy += 920 * dt; f.y = Math.min(FLOOR, f.y + f.vy * dt);
    if (f.y === FLOOR) f.vy = 0;
    f.x = clamp(f.x, 30, 770);
    if (!free(f)) f.blocking = false;
    if (f.attack) {
      const a = f.attack, spec = attacks[a.kind]; a.elapsed += dt;
      if (!a.hit && a.elapsed >= spec.windup) {
        a.hit = true;
        const target = f === p1 ? p2 : p1;
        const dx = target.x - f.x;
        // Рука/нога пересекает корпус; прыжок позволяет уйти выше удара.
        const strikeY = f.y - (a.kind === 'kick' ? 42 : 62);
        if (Math.abs(dx) <= spec.range && Math.sign(dx) === f.facing &&
          strikeY >= target.y - 94 && strikeY <= target.y - 8) damage(f, target, spec.damage, a.kind);
      }
      if (a.elapsed >= spec.duration) f.attack = null;
    }
  }
  function bot(dt) {
    const cfg = settings[difficulty.value];
    const dx = p1.x - p2.x, dist = Math.abs(dx);
    p2.ai -= dt;
    if (p2.ai <= 0) {
      p2.ai = cfg.reaction * (.8 + Math.random() * .5);
      const threat = p1.attack || shots.some(s => s.owner === p1 && Math.abs(s.x - p2.x) < 230);
      aiPlan = threat && Math.random() < cfg.block ? 'block' : 'approach';
      if (aiPlan !== 'block' && ready(p2)) {
        if (dist < 100 && Math.random() < cfg.aggression) attack(p2, Math.random() < .6 ? 'punch' : 'kick');
        else if (dist > 175 && Math.random() < .6) special(p2, Math.random() < .3 ? 'teleport' : 'spear');
        else if (dist < 160 && Math.random() < .18 && p2.y === FLOOR) p2.vy = -420;
      }
    }
    p2.blocking = aiPlan === 'block' && free(p2) && !p2.attack && p2.y === FLOOR;
    if (free(p2) && !p2.blocking && !p2.attack && dist > 66) {
      p2.x += Math.sign(dx) * cfg.speed * dt; p2.walk += dt * 12;
    }
  }
  function step(dt) {
    if (paused) return;
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.life -= dt; });
    particles = particles.filter(p => p.life > 0); shake = Math.max(0, shake - dt * 30);
    if (phase === 'intro' || phase === 'round') {
      phaseTime -= dt;
      if (phaseTime <= 0) {
        if (phase === 'round') { round++; startRound(); }
        else { phase = 'fight'; status.textContent = 'Бой!'; tone(440, .18); }
      }
      pressed.clear(); return;
    }
    if (phase !== 'fight') return;
    if (hitStop > 0) { hitStop -= dt; return; }
    remaining = Math.max(0, remaining - dt);
    p1.facing = p2.x >= p1.x ? 1 : -1; p2.facing = -p1.facing;
    const held = code => keys.has(code) || touchKeys.has(code);
    p1.blocking = held('KeyS') && free(p1) && !p1.attack && p1.y === FLOOR;
    if (free(p1) && !p1.blocking && !p1.attack) {
      const dir = Number(held('KeyD')) - Number(held('KeyA'));
      p1.x += dir * 205 * dt;
      if (dir) p1.walk += dt * 12;
      if (pressed.has('KeyW') && p1.y === FLOOR) p1.vy = -440;
    }
    if (pressed.has('KeyF')) attack(p1, 'punch');
    if (pressed.has('KeyG')) attack(p1, 'kick');
    if (pressed.has('KeyE')) special(p1, 'ice');
    pressed.clear();
    bot(dt);
    updateFighter(p1, dt);
    if (phase !== 'fight') return;
    updateFighter(p2, dt);
    if (phase !== 'fight') return;
    if (Math.abs(p1.x - p2.x) < 42 && Math.abs(p1.y - p2.y) < 85) {
      const direction = p1.x <= p2.x ? -1 : 1;
      const push = (42 - Math.abs(p1.x - p2.x)) / 2;
      p1.x = clamp(p1.x + direction * push, 30, 770);
      p2.x = clamp(p2.x - direction * push, 30, 770);
    }
    for (const s of shots) {
      if (phase !== 'fight') break;
      const oldX = s.x; s.x += s.vx * dt; s.life -= dt;
      const target = s.owner === p1 ? p2 : p1;
      if (s.life > 0 && Math.min(oldX, s.x) <= target.x + 23 && Math.max(oldX, s.x) >= target.x - 23 &&
        s.y >= target.y - 94 && s.y <= target.y) {
        damage(s.owner, target, s.kind === 'ice' ? 8 : 10, s.kind); s.life = 0;
      }
    }
    shots = shots.filter(s => s.life > 0 && s.x > -30 && s.x < 830);
    if (remaining <= 0) endRound();
  }
  function text(value, x, y, size = 18, color = '#fff', align = 'center') {
    ctx.fillStyle = color; ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.fillText(value, x, y);
  }
  function drawFighter(f) {
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.facing, 1);
    const bob = f.y === FLOOR && !f.attack && !f.blocking ? Math.sin(f.walk) * 3 : 0;
    ctx.translate(0, bob);
    ctx.shadowColor = f.color; ctx.shadowBlur = reducedMotion.matches ? 0 : 8;
    ctx.fillStyle = f.flash > 0 ? '#fff' : f.frozen > 0 ? '#c1f5ff' : f.color;
    const crouch = f.blocking ? 8 : 0;
    ctx.fillRect(-16, -72 + crouch, 32, 43);
    ctx.beginPath(); ctx.arc(0, -85 + crouch, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#142137'; ctx.fillRect(-12, -89 + crouch, 24, 6);
    ctx.fillStyle = '#f4f8ff'; ctx.fillRect(3, -88 + crouch, 7, 2);
    ctx.fillStyle = f.color; ctx.fillRect(-26, -66 + crouch, 10, 25);
    const attackPhase = f.attack ? Math.sin(Math.PI * clamp(f.attack.elapsed / attacks[f.attack.kind].duration, 0, 1)) : 0;
    if (f.blocking) {
      ctx.fillRect(17, -83, 10, 38);
      ctx.strokeStyle = '#b9e6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(14, -55, 39, -1.2, 1.2); ctx.stroke();
    } else ctx.fillRect(14, -66, 12 + (f.attack?.kind === 'punch' ? attackPhase * 45 : 0), 11);
    ctx.fillStyle = '#172739'; ctx.fillRect(-16, -34, 32, 8);
    ctx.fillStyle = f.color;
    ctx.fillRect(-14, -28, 11, 28);
    if (f.attack?.kind === 'kick') {
      ctx.save(); ctx.translate(6, -28); ctx.rotate(-attackPhase * 1.45); ctx.fillRect(-3, 0, 12, 48); ctx.restore();
    } else ctx.fillRect(5, -28, 11, 28);
    if (f.frozen > 0) {
      ctx.fillStyle = '#80e0ff55'; ctx.strokeStyle = '#d9faff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-27, 3); ctx.lineTo(-30, -74); ctx.lineTo(-12, -108);
      ctx.lineTo(22, -101); ctx.lineTo(31, -25); ctx.lineTo(23, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  function draw() {
    ctx.clearRect(0, 0, 800, 400); ctx.save();
    if (!reducedMotion.matches && shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, '#080e20'); gradient.addColorStop(1, '#34405a');
    ctx.fillStyle = gradient; ctx.fillRect(-8, -8, 816, 416);
    ctx.fillStyle = '#bddeeb'; ctx.beginPath(); ctx.arc(400, 133, 47, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#151e30';
    for (let x = -40; x < 840; x += 100) {
      ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(x + 85, 175); ctx.lineTo(x + 180, FLOOR); ctx.fill();
    }
    ctx.fillStyle = '#222a35'; ctx.fillRect(0, FLOOR, 800, 60);
    ctx.strokeStyle = '#637180'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, FLOOR); ctx.lineTo(800, FLOOR); ctx.stroke();
    for (const f of [p1, p2]) {
      ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 5, 31, 7, 0, 0, Math.PI * 2); ctx.fill();
      drawFighter(f);
    }
    for (const s of shots) {
      ctx.fillStyle = s.kind === 'ice' ? '#b8f4ff' : '#ffcb67';
      ctx.strokeStyle = ctx.fillStyle;
      if (s.kind === 'spear') { ctx.beginPath(); ctx.moveTo(s.owner.x, s.owner.y - 57); ctx.lineTo(s.x, s.y); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / .45); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4);
    }
    ctx.globalAlpha = 1; ctx.restore();
    [p1, p2].forEach((f, i) => {
      const x = i ? 454 : 26;
      ctx.fillStyle = '#090e1c'; ctx.fillRect(x, 30, 320, 20);
      ctx.fillStyle = f.hp < 25 ? '#fa5f65' : f.color;
      const width = 316 * f.hp / 100; ctx.fillRect(i ? x + 318 - width : x + 2, 32, width, 16);
      text(f.name, i ? 774 : 26, 23, 14, '#fff', i ? 'right' : 'left');
      text(`${Math.ceil(f.hp)} HP · ${'●'.repeat(wins[i])}${'○'.repeat(2 - wins[i])}`, i ? 774 : 26, 69, 13, f.color, i ? 'right' : 'left');
      text(f.special > 0 ? `${i ? 'Гарпун' : 'Лёд'}: ${f.special.toFixed(1)} c` : 'Спецприём готов', i ? 774 : 26, 88, 12, '#bfcede', i ? 'right' : 'left');
    });
    text(String(Math.ceil(remaining)).padStart(2, '0'), 400, 51, 30, '#ffda81');
    text(`РАУНД ${round}`, 400, 73, 11, '#bfcede');
    if (phase !== 'fight' || paused) {
      ctx.fillStyle = '#050a16bd'; ctx.fillRect(0, 139, 800, 105);
      const message = paused ? 'ПАУЗА' : phase === 'intro' ? `РАУНД ${round}` : phase === 'match' ? (wins[0] >= 2 ? 'ВЫ ПОБЕДИЛИ!' : 'SCORPION ПОБЕЖДАЕТ') : 'РАУНД ЗАВЕРШЁН';
      text(message, 400, 182, 28, '#ffda81');
      text(paused ? 'Esc или «Продолжить»' : phase === 'match' ? 'Нажмите «Новый матч»' : phase === 'intro' ? 'ПРИГОТОВЬТЕСЬ' : `${wins[0]} : ${wins[1]}`, 400, 218, 16);
    }
  }
  const gameKeys = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG', 'KeyE']);
  document.addEventListener('keydown', e => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); togglePause(); return; }
    if (!gameKeys.has(e.code)) return;
    e.preventDefault();
    if (!keys.has(e.code) && !e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  function pauseOnLeave() { clearInput(); if (!paused && phase !== 'match') togglePause(); }
  window.addEventListener('blur', pauseOnLeave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnLeave(); });
  document.querySelectorAll('[data-key]').forEach(button => {
    button.addEventListener('pointerdown', e => {
      e.preventDefault(); button.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, button.dataset.key); touchKeys.add(button.dataset.key);
      pressed.add(button.dataset.key); button.classList.add('is-held');
    });
    function release(e) {
      const code = pointers.get(e.pointerId); pointers.delete(e.pointerId);
      if (![...pointers.values()].includes(code)) touchKeys.delete(code);
      button.classList.remove('is-held');
    }
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('click', e => {
      if (e.detail === 0) pressed.add(button.dataset.key);
    });
  });
  document.getElementById('restartBtn').addEventListener('click', newMatch);
  pauseBtn.addEventListener('click', togglePause);
  difficulty.addEventListener('change', newMatch);
  soundBtn.addEventListener('click', () => {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { soundBtn.textContent = 'Звук недоступен'; return; }
    audioContext ||= new Audio(); audioContext.resume(); sound = !sound;
    soundBtn.textContent = sound ? 'Звук: вкл.' : 'Звук: выкл.';
    soundBtn.setAttribute('aria-pressed', String(sound)); tone(520);
  });
  newMatch();
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, .035); last = now;
    step(dt); draw(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
