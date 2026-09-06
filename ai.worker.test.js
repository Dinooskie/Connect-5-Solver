const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getBestJS,
  cwin,
  getWinner,
  dropR,
  liveWinCols,
  COLS,
  ROWS,
} = require('./ai.worker.js');

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
const drop = (board, col, player) => {
  const row = dropR(board, col);
  assert.notEqual(row, -1);
  board[row][col] = player;
  return row;
};

test('pieces fall to the lowest available row', () => {
  const board = emptyBoard();
  assert.equal(drop(board, 3, 1), 6);
  assert.equal(drop(board, 3, 2), 5);
});

test('detects wins in every direction', () => {
  const positions = [
    [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4]],
    [[6, 0], [5, 0], [4, 0], [3, 0], [2, 0]],
    [[6, 0], [5, 1], [4, 2], [3, 3], [2, 4]],
    [[2, 0], [3, 1], [4, 2], [5, 3], [6, 4]],
  ];
  for (const cells of positions) {
    const board = emptyBoard();
    for (const [row, col] of cells) board[row][col] = 1;
    const [row, col] = cells[2];
    assert.equal(cwin(board, row, col, 1), true);
    assert.equal(getWinner(board), 1);
  }
});

test('takes an immediate win and preserves the board', () => {
  const board = emptyBoard();
  for (let col = 0; col < 4; col++) drop(board, col, 2);
  const before = structuredClone(board);
  assert.equal(getBestJS(board, 2, { timeLimitMs: 50 }), 4);
  assert.deepEqual(board, before);
});

test('blocks an immediate loss', () => {
  const board = emptyBoard();
  for (let i = 0; i < 4; i++) drop(board, 7, 1);
  assert.deepEqual(liveWinCols(board, 1), [7]);
  assert.equal(getBestJS(board, 2, { timeLimitMs: 50 }), 7);
});

test('opening move prefers the center', () => {
  assert.equal(getBestJS(emptyBoard(), 1, { timeLimitMs: 100 }), 4);
});
