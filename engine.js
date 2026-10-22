export const COLS = 10;
export const ROWS = 20;

export const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
};

export const COLORS = {
  I: '#78ddd2', J: '#7b9cf5', L: '#f5af71', O: '#ead27c',
  S: '#b4d98b', T: '#b69be4', Z: '#ed8e9c',
};

const LOCK_DELAY = 450;
const MAX_LOCK_RESETS = 15;
const LINE_POINTS = [0, 100, 300, 500, 800];

// SRS offsets use Cartesian y (up); collision coordinates use screen y (down).
const KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

function copyMatrix(matrix) {
  return matrix.map(row => [...row]);
}

function rotatedMatrix(matrix, direction) {
  const size = matrix.length;
  return matrix.map((row, y) => row.map((_, x) => direction === 1
    ? matrix[size - x - 1][y]
    : matrix[x][size - y - 1]));
}

export class Game {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this._initialize('ready');
  }

  _initialize(status) {
    this.status = status;
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.active = null;
    this.queue = [];
    this.held = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this._bag = [];
    this._events = [];
    this._fallElapsed = 0;
    this._lockElapsed = 0;
    this._lockResets = 0;
    this._fillQueue();
  }

  reset() {
    this._initialize('playing');
    this._spawn();
    return this;
  }

  get gravityMs() {
    return Math.max(70, 800 * 0.82 ** (this.level - 1));
  }

  _fillQueue() {
    while (this.queue.length < 6) {
      if (!this._bag.length) {
        this._bag = Object.keys(SHAPES);
        for (let i = this._bag.length - 1; i > 0; i--) {
          const index = Math.floor(this.random() * (i + 1));
          [this._bag[i], this._bag[index]] = [this._bag[index], this._bag[i]];
        }
      }
      this.queue.push(this._bag.pop());
    }
  }

  _spawn(type = null) {
    const next = type ?? this.queue.shift();
    this._fillQueue();
    const matrix = copyMatrix(SHAPES[next]);
    this.active = {
      type: next, matrix, x: Math.floor((COLS - matrix.length) / 2), y: -1, rotation: 0,
    };
    this._fallElapsed = 0;
    this._lockElapsed = 0;
    this._lockResets = 0;
    if (this._collides(this.active)) this._gameOver();
  }

  _collides(piece, dx = 0, dy = 0, matrix = piece.matrix) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const boardX = piece.x + x + dx;
        const boardY = piece.y + y + dy;
        if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
        if (boardY >= 0 && this.board[boardY][boardX] !== null) return true;
      }
    }
    return false;
  }

  _canAct() {
    return this.status === 'playing' && this.active !== null;
  }

  _resetLock(wasGrounded) {
    if (wasGrounded && this._lockResets < MAX_LOCK_RESETS) {
      this._lockElapsed = 0;
      this._lockResets++;
    }
  }

  move(dx) {
    if (!this._canAct() || !Number.isFinite(dx) || dx === 0) return false;
    const step = Math.sign(dx);
    if (this._collides(this.active, step, 0)) return false;
    const grounded = this._collides(this.active, 0, 1);
    this.active.x += step;
    this._resetLock(grounded);
    this._events.push({ type: 'move' });
    return true;
  }

  softDrop() {
    if (!this._canAct() || this._collides(this.active, 0, 1)) return false;
    this.active.y++;
    this.score++;
    this._fallElapsed = 0;
    if (this._lockResets < MAX_LOCK_RESETS) this._lockElapsed = 0;
    this._events.push({ type: 'drop', hard: false, distance: 1 });
    return true;
  }

  rotate(direction = 1) {
    if (!this._canAct() || ![1, -1].includes(direction) || this.active.type === 'O') return false;
    const piece = this.active;
    const rotation = (piece.rotation + direction + 4) % 4;
    const matrix = rotatedMatrix(piece.matrix, direction);
    const kicks = (piece.type === 'I' ? I_KICKS : KICKS)[`${piece.rotation}>${rotation}`];
    const grounded = this._collides(piece, 0, 1);
    for (const [dx, dy] of kicks) {
      if (this._collides(piece, dx, -dy, matrix)) continue;
      piece.x += dx;
      piece.y -= dy;
      piece.matrix = matrix;
      piece.rotation = rotation;
      this._resetLock(grounded);
      this._events.push({ type: 'rotate' });
      return true;
    }
    return false;
  }

  ghostY() {
    if (!this.active) return null;
    let distance = 0;
    while (!this._collides(this.active, 0, distance + 1)) distance++;
    return this.active.y + distance;
  }

  hardDrop() {
    if (!this._canAct()) return false;
    const destination = this.ghostY();
    const distance = destination - this.active.y;
    this.active.y = destination;
    this.score += distance * 2;
    this._events.push({ type: 'drop', hard: true, distance });
    this._lock();
    return true;
  }

  hold() {
    if (!this._canAct() || !this.canHold) return false;
    const previous = this.held;
    this.held = this.active.type;
    this.canHold = false;
    this._events.push({ type: 'hold' });
    this._spawn(previous);
    return true;
  }

  togglePause() {
    if (this.status !== 'playing' && this.status !== 'paused') return false;
    this.status = this.status === 'playing' ? 'paused' : 'playing';
    this._events.push({ type: 'pause', paused: this.status === 'paused' });
    return true;
  }

  update(deltaMs) {
    if (!this._canAct() || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    let remaining = deltaMs;
    while (remaining > 0 && this._canAct()) {
      const grounded = this._collides(this.active, 0, 1);
      const untilFall = Math.max(0, this.gravityMs - this._fallElapsed);
      const untilLock = grounded ? Math.max(0, LOCK_DELAY - this._lockElapsed) : Infinity;
      const elapsed = Math.min(remaining, untilFall, untilLock);
      this._fallElapsed += elapsed;
      if (grounded) this._lockElapsed += elapsed;
      remaining -= elapsed;

      if (grounded && this._lockElapsed >= LOCK_DELAY) {
        this._lock();
      } else if (this._fallElapsed >= this.gravityMs) {
        this._fallElapsed -= this.gravityMs;
        if (!this._collides(this.active, 0, 1)) {
          this.active.y++;
          if (this._lockResets < MAX_LOCK_RESETS) this._lockElapsed = 0;
        }
      }
    }
  }

  _lock() {
    let aboveBoard = false;
    const piece = this.active;
    for (let y = 0; y < piece.matrix.length; y++) {
      for (let x = 0; x < piece.matrix[y].length; x++) {
        if (!piece.matrix[y][x]) continue;
        const boardY = piece.y + y;
        if (boardY < 0) aboveBoard = true;
        else this.board[boardY][piece.x + x] = piece.type;
      }
    }
    this._events.push({ type: 'lock' });
    if (aboveBoard) {
      this._gameOver();
      return;
    }

    const clearedRows = [];
    this.board.forEach((row, index) => {
      if (row.every(cell => cell !== null)) clearedRows.push(index);
    });
    if (clearedRows.length) {
      const points = LINE_POINTS[clearedRows.length] * this.level;
      this.board = this.board.filter((_, index) => !clearedRows.includes(index));
      while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
      this.score += points;
      this.lines += clearedRows.length;
      this._events.push({ type: 'clear', count: clearedRows.length, points, rows: clearedRows });
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel !== this.level) {
        this.level = newLevel;
        this._events.push({ type: 'level', level: newLevel });
      }
    }
    this.canHold = true;
    this._spawn();
  }

  _gameOver() {
    this.status = 'over';
    this.active = null;
    this._events.push({ type: 'over', score: this.score, lines: this.lines });
  }

  drainEvents() {
    const events = this._events;
    this._events = [];
    return events;
  }
}
