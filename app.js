import { Game, SHAPES, COLORS, COLS, ROWS } from './engine.js';

const $ = id => document.getElementById(id);
const game = new Game();
const storage = {
  get(key, fallback) { try { return localStorage.getItem(`blockfall.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`blockfall.${key}`, String(value)); } catch { /* Private browsing can disable storage. */ } },
};
const savedBest = Number(storage.get('best', '0'));
let best = Number.isSafeInteger(savedBest) && savedBest >= 0 ? savedBest : 0;
let soundEnabled = storage.get('sound', 'false') === 'true';
let audioContext;
let lastTime = 0;
let hudSignature = '';
let renderedStatus = '';
let bestAtStart = best;
const heldInputs = new Map();
const keyActions = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
  ArrowUp: 'rotate', KeyX: 'rotate', KeyZ: 'rotate-back',
  Space: 'drop', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
};

function makeCanvas(id, width, height) {
  const element = $(id);
  const scale = Math.min(window.devicePixelRatio || 1, 3);
  element.width = Math.round(width * scale);
  element.height = Math.round(height * scale);
  const context = element.getContext('2d');
  context.setTransform(scale, 0, 0, scale, 0, 0);
  return context;
}
const boardContext = makeCanvas('board', 300, 600);
const holdContext = makeCanvas('hold', 144, 80);
const nextContext = makeCanvas('next', 144, 300);

function block(context, x, y, size, color, ghost = false) {
  const inset = 1.5;
  context.beginPath();
  context.roundRect(x + inset, y + inset, size - inset * 2, size - inset * 2, 3);
  if (ghost) {
    context.fillStyle = `${color}0d`;
    context.fill();
    context.strokeStyle = `${color}85`;
    context.lineWidth = 1.3;
    context.stroke();
    return;
  }
  context.fillStyle = color;
  context.fill();
  context.fillStyle = '#ffffff30';
  context.fillRect(x + 4, y + 3, size - 8, 2);
  context.fillStyle = '#00000010';
  context.fillRect(x + 4, y + size - 5, size - 8, 2);
}

function drawPiece(context, matrix, type, originX, originY, size, ghost = false, clipTop = false) {
  matrix.forEach((row, y) => row.forEach((cell, x) => {
    if (!cell || (clipTop && originY + y * size < 0)) return;
    block(context, originX + x * size, originY + y * size, size, COLORS[type], ghost);
  }));
}

function preview(context, type, centerX, centerY, size = 21) {
  if (!type) return;
  const matrix = SHAPES[type];
  const cells = [];
  matrix.forEach((row, y) => row.forEach((cell, x) => { if (cell) cells.push([x, y]); }));
  const minX = Math.min(...cells.map(cell => cell[0]));
  const maxX = Math.max(...cells.map(cell => cell[0]));
  const minY = Math.min(...cells.map(cell => cell[1]));
  const maxY = Math.max(...cells.map(cell => cell[1]));
  const originX = centerX - (maxX - minX + 1) * size / 2 - minX * size;
  const originY = centerY - (maxY - minY + 1) * size / 2 - minY * size;
  drawPiece(context, matrix, type, originX, originY, size);
}

function drawBoard() {
  const context = boardContext;
  context.clearRect(0, 0, 300, 600);
  context.fillStyle = '#17191c';
  context.fillRect(0, 0, 300, 600);
  context.strokeStyle = '#ffffff08';
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= COLS; x++) { context.moveTo(x * 30 + .5, 0); context.lineTo(x * 30 + .5, 600); }
  for (let y = 0; y <= ROWS; y++) { context.moveTo(0, y * 30 + .5); context.lineTo(300, y * 30 + .5); }
  context.stroke();
  if (game.status === 'ready') return;
  game.board.forEach((row, y) => row.forEach((type, x) => {
    if (type) block(context, x * 30, y * 30, 30, COLORS[type]);
  }));
  if (game.active && game.status !== 'over') {
    const { matrix, type, x, y } = game.active;
    drawPiece(context, matrix, type, x * 30, game.ghostY() * 30, 30, true, true);
    drawPiece(context, matrix, type, x * 30, y * 30, 30, false, true);
  }
}

function updateHud() {
  if (game.score > best) {
    best = game.score;
    storage.set('best', best);
  }
  const signature = [game.score, best, game.level, game.lines, game.held, game.canHold, ...game.queue].join(':');
  if (signature !== hudSignature) {
    hudSignature = signature;
    $('score').textContent = String(game.score);
    $('best-score').textContent = String(best);
    $('level').textContent = String(game.level);
    $('lines').textContent = String(game.lines);
    holdContext.clearRect(0, 0, 144, 80);
    if (game.held) preview(holdContext, game.held, 72, 40);
    else {
      holdContext.fillStyle = '#63686f';
      holdContext.fillRect(64, 39, 16, 2);
    }
    $('hold').closest('section').classList.toggle('used', !game.canHold);
    $('hold').setAttribute('aria-label', game.held ? `ホールド中：${game.held}型` : 'ホールドは空です');
    nextContext.clearRect(0, 0, 144, 300);
    game.queue.slice(0, 5).forEach((type, index) => {
      nextContext.globalAlpha = index === 0 ? 1 : .72;
      preview(nextContext, type, 72, index * 58 + 34, index === 0 ? 23 : 20);
    });
    nextContext.globalAlpha = 1;
    $('next').setAttribute('aria-label', `次のブロック：${game.queue.slice(0, 5).join('、')}`);
  }
  if (game.status === renderedStatus) return;
  renderedStatus = game.status;
  const isPlaying = game.status === 'playing';
  $('game-overlay').hidden = isPlaying;
  $('pause-button').disabled = !['playing', 'paused'].includes(game.status);
  $('pause-button').querySelector('span').textContent = game.status === 'paused' ? '再開' : '一時停止';
  $('start-button').querySelector('span').textContent = ({ ready: '開始', paused: '再開', over: 'もう一度', playing: '' })[game.status];
  $('overlay-title').hidden = game.status === 'ready' || isPlaying;
  $('overlay-description').hidden = game.status !== 'over';
  document.querySelectorAll('[data-action]').forEach(button => { button.disabled = !isPlaying; });
  if (game.status === 'paused') {
    $('overlay-title').textContent = '一時停止';
    $('announcer').textContent = '一時停止しました。';
  } else if (game.status === 'over') {
    const newBest = game.score > bestAtStart;
    $('overlay-title').textContent = 'ゲームオーバー';
    $('overlay-description').textContent = `${game.score.toLocaleString()} 点${newBest ? ' · 自己ベスト' : ''}`;
    $('announcer').textContent = `ゲームオーバー。${game.score}点、${game.lines}ライン。${newBest ? '自己ベスト更新！' : ''}`;
    stopInputs();
  } else if (isPlaying) {
    $('announcer').textContent = 'ゲームを開始・再開しました。';
  }
}

function unlockAudio() {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ??= new Audio();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch { /* Audio is optional. */ }
}

function tone(frequency, duration = .05, delay = 0, volume = .035) {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const start = audioContext.currentTime + delay;
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(.001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function toast(text) {
  $('board-toast').textContent = text;
  $('board-toast').classList.remove('show');
  void $('board-toast').offsetWidth;
  $('board-toast').classList.add('show');
}

function processEvents() {
  for (const event of game.drainEvents()) {
    if (event.type === 'move') tone(180, .025, 0, .012);
    if (event.type === 'rotate') tone(340, .045);
    if (event.type === 'hold') { tone(260); tone(390, .06, .05); }
    if (event.type === 'drop' && event.hard) tone(120, .12, 0, .065);
    if (event.type === 'clear') {
      toast(`+${event.points}`);
      $('announcer').textContent = `${event.count}ライン消去。${event.points}点獲得。`;
      [440, 554, 659, 880].slice(0, Math.max(2, event.count)).forEach((frequency, index) => tone(frequency, .17, index * .06));
      $('board-shell').classList.remove('flash');
      void $('board-shell').offsetWidth;
      $('board-shell').classList.add('flash');
    }
    if (event.type === 'level') { toast(`レベル ${game.level}`); tone(880, .2, .2); }
    if (event.type === 'over') { tone(240, .2); tone(170, .3, .15); }
  }
}

function refresh() { processEvents(); updateHud(); drawBoard(); }

function stopInputs() {
  heldInputs.clear();
  document.querySelectorAll('.pressed').forEach(button => button.classList.remove('pressed'));
}

function startOrResume() {
  if ($('help-dialog').open) return;
  unlockAudio();
  stopInputs();
  if (game.status === 'paused') game.togglePause();
  else if (game.status === 'ready' || game.status === 'over') {
    bestAtStart = best;
    game.reset();
    $('board-toast').classList.remove('show');
    tone(440); tone(660, .1, .07);
  }
  lastTime = performance.now();
  refresh();
  $('board').focus({ preventScroll: true });
}

function pause() {
  stopInputs();
  if (game.togglePause()) {
    lastTime = performance.now();
    refresh();
  }
}

function act(action) {
  if (game.status !== 'playing' || $('help-dialog').open) return;
  switch (action) {
    case 'left': game.move(-1); break;
    case 'right': game.move(1); break;
    case 'down': game.softDrop(); break;
    case 'rotate': game.rotate(1); break;
    case 'rotate-back': game.rotate(-1); break;
    case 'drop': game.hardDrop(); break;
    case 'hold': game.hold(); break;
  }
  refresh();
}

function beginInput(id, action) {
  unlockAudio();
  act(action);
  if (game.status === 'playing' && ['left', 'right', 'down'].includes(action)) {
    heldInputs.set(id, { action, nextAt: performance.now() + (action === 'down' ? 70 : 160) });
  }
}

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || $('help-dialog').open) return;
  // Native buttons retain Enter/Space activation and keyboard focus behavior.
  if (event.target.closest('button') && ['Enter', 'Space'].includes(event.code)) return;
  if (event.code === 'Enter' && ['ready', 'paused', 'over'].includes(game.status)) {
    event.preventDefault();
    if (!event.repeat) startOrResume();
    return;
  }
  if (event.code === 'KeyP' || event.code === 'Escape') {
    if (['playing', 'paused'].includes(game.status)) {
      event.preventDefault();
      if (!event.repeat) pause();
    }
    return;
  }
  const action = keyActions[event.code];
  if (!action || game.status !== 'playing') return;
  event.preventDefault();
  if (!event.repeat) beginInput(event.code, action);
});
document.addEventListener('keyup', event => heldInputs.delete(event.code));

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || game.status !== 'playing') return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add('pressed');
    beginInput(`pointer-${event.pointerId}`, button.dataset.action);
  });
  const end = event => { heldInputs.delete(`pointer-${event.pointerId}`); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('lostpointercapture', end);
  button.addEventListener('contextmenu', event => event.preventDefault());
  // Assistive technology and keyboard clicks do not produce pointerdown.
  button.addEventListener('click', event => { if (event.detail === 0) { unlockAudio(); act(button.dataset.action); } });
});

$('start-button').addEventListener('click', startOrResume);
$('pause-button').addEventListener('click', () => {
  pause();
  if (game.status === 'playing') $('board').focus({ preventScroll: true });
});

function updateSoundButton() {
  $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  $('sound-button').setAttribute('aria-label', `サウンドを${soundEnabled ? 'オフ' : 'オン'}にする`);
}
$('sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  storage.set('sound', soundEnabled);
  updateSoundButton();
  unlockAudio();
  tone(523, .09);
});

$('help-button').addEventListener('click', () => {
  if (game.status === 'playing') pause();
  stopInputs();
  $('help-dialog').showModal();
});
const closeHelp = () => $('help-dialog').close();
$('close-help').addEventListener('click', closeHelp);
$('help-done').addEventListener('click', closeHelp);
$('help-dialog').addEventListener('click', event => {
  const bounds = $('help-dialog').getBoundingClientRect();
  if (event.target === $('help-dialog') && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeHelp();
});
$('help-dialog').addEventListener('close', () => {
  if (game.status === 'paused') $('start-button').focus({ preventScroll: true });
});
function autoPause() {
  stopInputs();
  if (game.status === 'playing') pause();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

function frame(time) {
  const delta = lastTime ? Math.min(time - lastTime, 100) : 0;
  lastTime = time;
  if (game.status === 'playing') {
    for (const input of heldInputs.values()) {
      if (time >= input.nextAt) {
        act(input.action);
        input.nextAt = time + (input.action === 'down' ? 35 : 45);
      }
    }
    game.update(delta);
    refresh();
  }
  requestAnimationFrame(frame);
}

updateSoundButton();
refresh();
requestAnimationFrame(frame);
