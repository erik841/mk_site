const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const element = () => ({textContent:'', value:'normal', addEventListener(){}, setAttribute(){}});
const elements = new Map();
const sandbox = {
  document: {getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelectorAll(){return [];}, addEventListener(){}},
  window: {addEventListener(){}}, matchMedia: () => ({matches:true}),
  performance:{now:()=>0}, requestAnimationFrame(){}, assert,
};
elements.set('mkCanvas', {getContext:()=>({})});
let source = fs.readFileSync('js/game.js', 'utf8');
source = source.replace(/\}\)\(\);\s*$/, `
  function fight() { newMatch(); phase = 'fight'; }
  fight(); p1.x = 200; p2.x = 260; p2.y = 180;
  attack(p1, 'punch'); updateFighter(p1, .1);
  assert.equal(p2.hp, 100, 'Jump clears a punch');
  fight(); p1.x = 200; p2.x = 260;
  attack(p1, 'punch'); updateFighter(p1, .1);
  assert.equal(p2.hp, 94, 'Ground punch connects');
  fight(); p1.x = 200; p2.x = 260; p2.blocking = true;
  damage(p1, p2, 13, 'kick');
  assert.equal(p2.hp, 98, 'Block reduces damage');
  fight(); damage(p1, p2, 8, 'ice');
  assert.equal(p2.frozen, 1.35, 'Ice freezes');
  fight(); p2.blocking = true; damage(p1, p2, 8, 'ice');
  assert.equal(p2.frozen, 0, 'Block prevents freezing');
  fight(); special(p1, 'ice'); special(p1, 'ice');
  assert.equal(shots.length, 1, 'Special cooldown prevents spam');
  fight(); damage(p1, p2, 100, 'kick');
  assert.equal(wins[0], 1); assert.equal(phase, 'round');
  startRound(); phase = 'fight'; damage(p1, p2, 100, 'kick');
  assert.equal(wins[0], 2); assert.equal(phase, 'match');
  fight(); p1.hp = 70; p2.hp = 40; remaining = .001; step(.02);
  assert.equal(wins[0], 1, 'Timer awards healthier fighter');
  fight(); paused = true; const time = remaining; step(1);
  assert.equal(remaining, time, 'Pause freezes time');
  fight(); for (let n = 0; n < 20000 && phase !== 'match'; n++) step(.02);
  assert.equal(phase, 'match', 'Bot can finish a full match');
  assert.ok([p1,p2].every(f => Number.isFinite(f.x) && f.hp >= 0));
})();`);
vm.runInNewContext(source, sandbox);
console.log('Passed: jump, hits, block, freeze, specials, rounds, timer, pause, full bot match.');
