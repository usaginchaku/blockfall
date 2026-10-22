import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SHAPES, COLS, ROWS } from '../engine.js';

function piece(type, x, y, rotation = 0) {
  let matrix = SHAPES[type].map(row => [...row]);
  for (let i = 0; i < rotation; i++) {
    matrix = matrix.map((row, my) => row.map((_, mx) => matrix[matrix.length - mx - 1][my]));
  }
  return { type, matrix, x, y, rotation };
}

function freshGame() {
  return new Game({ random: () => 0.5 }).reset();
}

test('starts ready and reset initializes a playable, independent board', () => {
  const game = new Game();
  assert.equal(game.status, 'ready');
  assert.equal(game.active, null);
  assert.equal(game.move(1), false);
  game.reset();
  assert.equal(game.status, 'playing');
  assert.equal(game.board.length, ROWS);
  assert.equal(game.board[0].length, COLS);
  game.board[0][0] = 'I';
  assert.equal(game.board[1][0], null);
  game.reset();
  assert.equal(game.board[0][0], null);
  assert.equal(game.score, 0);
});

test('every seven consecutive draws contain each of the seven pieces', () => {
  const game = freshGame();
  const draws = [];
  for (let i = 0; i < 28; i++) {
    draws.push(game.active.type);
    game.hardDrop();
    game.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    assert.ok(game.queue.length >= 5);
  }
  for (let i = 0; i < draws.length; i += 7) {
    assert.deepEqual([...new Set(draws.slice(i, i + 7))].sort(), Object.keys(SHAPES).sort());
  }
});

test('movement respects walls and occupied cells', () => {
  const game = freshGame();
  game.active = piece('O', 0, 5);
  assert.equal(game.move(-1), false);
  game.board[5][2] = 'T';
  assert.equal(game.move(1), false);
  game.board[5][2] = null;
  assert.equal(game.move(1), true);
  assert.equal(game.active.x, 1);
});

test('four rotations return a free piece to its original orientation', () => {
  const game = freshGame();
  game.active = piece('T', 3, 5);
  for (let i = 0; i < 4; i++) assert.equal(game.rotate(), true);
  assert.deepEqual(game.active.matrix, SHAPES.T);
  assert.equal(game.active.rotation, 0);
  assert.equal(game.rotate(-1), true);
  assert.equal(game.active.rotation, 3);
});

test('SRS wall kick moves a vertical I away from the left wall', () => {
  const game = freshGame();
  game.active = piece('I', -2, 5, 1);
  assert.equal(game.rotate(-1), true);
  assert.equal(game.active.x, 0);
  assert.equal(game.active.rotation, 0);
  assert.deepEqual(game.active.matrix, SHAPES.I);
});

test('SRS floor kick permits rotating a T on the bottom row', () => {
  const game = freshGame();
  game.active = piece('T', 3, 18);
  assert.equal(game.rotate(), true);
  assert.equal(game.active.rotation, 1);
  assert.equal(game.active.y, 17);
});

test('failed rotation does not change the piece', () => {
  const game = freshGame();
  game.active = piece('T', 3, 5);
  const original = structuredClone(game.active);
  game.board = Array.from({ length: ROWS }, () => Array(COLS).fill('J'));
  for (let y = 0; y < game.active.matrix.length; y++) {
    for (let x = 0; x < game.active.matrix[y].length; x++) {
      if (game.active.matrix[y][x]) game.board[y + 5][x + 3] = null;
    }
  }
  assert.equal(game.rotate(), false);
  assert.deepEqual(game.active, original);
});

test('ghost projection respects stacks and hard drop awards two points per cell', () => {
  const game = freshGame();
  game.active = piece('O', 4, 0);
  game.board[15][4] = 'Z';
  assert.equal(game.ghostY(), 13);
  game.hardDrop();
  assert.equal(game.score, 26);
  assert.equal(game.board[13][4], 'O');
  assert.equal(game.board[14][5], 'O');
  assert.equal(game.board[15][4], 'Z');
});

test('soft drop scores only successful downward movement', () => {
  const game = freshGame();
  game.active = piece('O', 4, 17);
  assert.equal(game.softDrop(), true);
  assert.equal(game.score, 1);
  assert.equal(game.softDrop(), false);
  assert.equal(game.score, 1);
  assert.equal(game.board[19][4], null);
});

test('hold is limited to once per piece and restores spawn orientation', () => {
  const game = freshGame();
  game.active = piece('T', 1, 5, 2);
  assert.equal(game.hold(), true);
  assert.equal(game.held, 'T');
  const next = game.active.type;
  assert.equal(game.hold(), false);
  game.hardDrop();
  const nextAfterLock = game.active.type;
  assert.equal(game.hold(), true);
  assert.equal(game.active.type, 'T');
  assert.equal(game.active.rotation, 0);
  assert.equal(game.active.x, 3);
  assert.equal(game.active.y, -1);
  assert.equal(game.held, nextAfterLock);
  assert.notEqual(next, undefined);
});

test('clears four rows together, scores them, and preserves board dimensions', () => {
  const game = freshGame();
  for (let y = 16; y < 20; y++) game.board[y] = Array.from({ length: COLS }, (_, x) => x === 4 ? null : 'J');
  game.active = piece('I', 2, 16, 1);
  game.hardDrop();
  assert.equal(game.lines, 4);
  assert.equal(game.score, 800);
  assert.equal(game.board.length, ROWS);
  assert.ok(game.board.every(row => row.every(cell => cell === null)));
  assert.deepEqual(game.drainEvents().find(event => event.type === 'clear'), {
    type: 'clear', count: 4, points: 800, rows: [16, 17, 18, 19],
  });
  assert.deepEqual(game.drainEvents(), []);
});

test('line scores use the current level and level advances every ten lines', () => {
  const game = freshGame();
  game.lines = 9;
  game.board[19] = Array.from({ length: COLS }, (_, x) => x >= 4 && x <= 5 ? null : 'L');
  game.active = piece('O', 4, 18);
  game.hardDrop();
  assert.equal(game.lines, 10);
  assert.equal(game.level, 2);
  assert.equal(game.score, 100);
  assert.ok(game.gravityMs < 800);
  game.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  game.board[19] = Array.from({ length: COLS }, (_, x) => x >= 4 && x <= 5 ? null : 'L');
  game.active = piece('O', 4, 18);
  game.hardDrop();
  assert.equal(game.score, 300);
});

test('gravity and lock delay keep a grounded piece adjustable for 450 ms', () => {
  const game = freshGame();
  game.active = piece('O', 4, 17);
  game.update(799);
  assert.equal(game.active.y, 17);
  game.update(1);
  assert.equal(game.active.y, 18);
  game.update(449);
  assert.equal(game.board[19][4], null);
  game.update(1);
  assert.equal(game.board[19][4], 'O');
});

test('grounded movement resets lock delay at most fifteen times', () => {
  const game = freshGame();
  game.active = piece('O', 4, 18);
  for (let i = 0; i < 15; i++) {
    game.update(400);
    assert.equal(game.move(i % 2 === 0 ? -1 : 1), true);
    assert.equal(game.board[19][4], null);
  }
  game.update(400);
  assert.equal(game.move(1), true);
  game.update(50);
  assert.equal(game.board[19][4], 'O');
});

test('pause freezes time and prevents game input until resumed', () => {
  const game = freshGame();
  const original = structuredClone(game.active);
  assert.equal(game.togglePause(), true);
  game.update(20000);
  for (const operation of [() => game.move(1), () => game.rotate(), () => game.softDrop(), () => game.hardDrop(), () => game.hold()]) {
    assert.equal(operation(), false);
  }
  assert.deepEqual(game.active, original);
  assert.equal(game.score, 0);
  assert.equal(game.togglePause(), true);
  game.update(800);
  assert.equal(game.active.y, original.y + 1);
});

test('a blocked spawn ends the game and further input cannot change the board', () => {
  const game = freshGame();
  game.queue[0] = 'O';
  game.active = piece('O', 0, 18);
  game.board[0][4] = 'Z';
  game.hardDrop();
  assert.equal(game.status, 'over');
  assert.equal(game.active, null);
  assert.equal(game.ghostY(), null);
  const board = structuredClone(game.board);
  game.update(10000);
  assert.equal(game.hardDrop(), false);
  assert.equal(game.togglePause(), false);
  assert.deepEqual(game.board, board);
  assert.ok(game.drainEvents().some(event => event.type === 'over'));
});

test('locking any cell above the board ends the game without invalid indices', () => {
  const game = freshGame();
  game.active = piece('O', 4, -1);
  game.board[1][4] = 'T';
  game.update(450);
  assert.equal(game.status, 'over');
  assert.equal(game.board.length, ROWS);
  assert.equal(game.board[0][4], 'O');
});

test('a single long update matches smaller simulation steps', () => {
  const once = freshGame();
  const many = freshGame();
  once.update(18000);
  for (let i = 0; i < 180; i++) many.update(100);
  assert.deepEqual(once.board, many.board);
  assert.deepEqual(once.active, many.active);
  assert.equal(once.score, many.score);
});

test('double and triple clears score correctly and move surviving cells down', () => {
  for (const [count, expected] of [[2, 300], [3, 500]]) {
    const game = freshGame();
    for (let y = ROWS - count; y < ROWS; y++) {
      game.board[y] = Array.from({ length: COLS }, (_, x) => x === 4 ? null : 'J');
    }
    game.board[10][0] = 'Z';
    game.active = piece('I', 2, 16, 1);
    game.hardDrop();
    assert.equal(game.lines, count);
    assert.equal(game.score, expected);
    assert.equal(game.board[10 + count][0], 'Z');
    assert.equal(game.board[10][0], null);
  }
});

test('holding into an occupied spawn area also tops out', () => {
  const game = freshGame();
  game.active = piece('T', 0, 12);
  game.held = 'O';
  game.board[0][4] = 'L';
  assert.equal(game.hold(), true);
  assert.equal(game.status, 'over');
  assert.equal(game.active, null);
});

test('many deterministic input sequences preserve valid board and active positions', () => {
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const game = new Game({ random }).reset();
  const actions = [() => game.move(-1), () => game.move(1), () => game.rotate(),
    () => game.rotate(-1), () => game.softDrop(), () => game.hold(), () => game.hardDrop()];
  for (let i = 0; i < 2000; i++) {
    actions[Math.floor(random() * actions.length)]();
    game.update(random() * 200);
    assert.equal(game.board.length, ROWS);
    assert.ok(game.board.every(row => row.length === COLS));
    if (game.status === 'over') game.reset();
    for (let y = 0; y < game.active.matrix.length; y++) {
      for (let x = 0; x < game.active.matrix[y].length; x++) {
        if (!game.active.matrix[y][x]) continue;
        const boardX = game.active.x + x;
        const boardY = game.active.y + y;
        assert.ok(boardX >= 0 && boardX < COLS);
        assert.ok(boardY < ROWS);
        if (boardY >= 0) assert.equal(game.board[boardY][boardX], null);
      }
    }
    assert.ok(Number.isFinite(game.score));
  }
});
