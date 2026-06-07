/* ── Connect 5 Solver · game.js ── */

const COLS = 9, ROWS = 7, WIN = 5;

let board, history, currentPlayer, gameOver, mode, scores, aiThinking;
scores = { human: 0, ai: 0, draw: 0 };
mode = 'pvai';

/* ── Init ── */
function initBoard() {
  board        = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  history      = [];
  currentPlayer = 1;
  gameOver     = false;
  aiThinking   = false;
  clearHint();
  render();
  updateStatus();
}

function setMode(m) {
  mode = m;
  ['pvai', 'pvp', 'aiva'].forEach(id => {
    document.getElementById('btn-' + id).classList.toggle('active', id === m);
  });
  resetGame();
}

function resetGame() {
  initBoard();
  if (mode === 'aiva') setTimeout(() => aiMove(), 500);
}

/* ── Board Helpers ── */
function getDropRow(col, b) {
  b = b || board;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r][col] === 0) return r;
  }
  return -1;
}

function cloneBoard() {
  return board.map(r => [...r]);
}

function isFull(b) {
  return b[0].every(c => c !== 0);
}

/* ── Win Detection ── */
function checkWin(b, row, col, player) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let cnt = 1;
    for (let s = 1; s < WIN; s++) {
      const nr = row + dr * s, nc = col + dc * s;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || b[nr][nc] !== player) break;
      cnt++;
    }
    for (let s = 1; s < WIN; s++) {
      const nr = row - dr * s, nc = col - dc * s;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || b[nr][nc] !== player) break;
      cnt++;
    }
    if (cnt >= WIN) return true;
  }
  return false;
}

function getWinCells(b) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (!p) continue;
      for (const [dr, dc] of dirs) {
        let cells = [[r, c]];
        for (let s = 1; s < WIN; s++) {
          const nr = r + dr * s, nc = c + dc * s;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || b[nr][nc] !== p) break;
          cells.push([nr, nc]);
        }
        if (cells.length >= WIN) return { player: p, cells };
      }
    }
  }
  return null;
}

/* ── AI Scoring ── */
function scoreWindow(window, player) {
  const opp  = player === 1 ? 2 : 1;
  const cnt  = window.filter(x => x === player).length;
  const emp  = window.filter(x => x === 0).length;
  const ocnt = window.filter(x => x === opp).length;
  let s = 0;
  if      (cnt === 5)           s += 1_000_000;
  else if (cnt === 4 && emp === 1) s += 8_000;
  else if (cnt === 3 && emp === 2) s += 500;
  else if (cnt === 2 && emp === 3) s += 50;
  if      (ocnt === 4 && emp === 1) s -= 12_000;
  else if (ocnt === 3 && emp === 2) s -= 800;
  else if (ocnt === 2 && emp === 3) s -= 60;
  return s;
}

function scoreBoard(b, player) {
  let sc = 0;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const win = [];
        for (let i = 0; i < WIN; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          win.push(b[nr][nc]);
        }
        if (win.length === WIN) sc += scoreWindow(win, player);
      }
    }
  }
  // center column bonus
  const center = Math.floor(COLS / 2);
  for (let r = 0; r < ROWS; r++) {
    if (b[r][center] === player)     sc += 4;
    if (b[r][center - 1] === player) sc += 2;
    if (b[r][center + 1] === player) sc += 2;
  }
  return sc;
}

/* ── Minimax ── */
function minimax(b, depth, alpha, beta, maximizing, aiPlayer) {
  const win = getWinCells(b);
  if (win) return win.player === aiPlayer ? 1_000_000 + depth : -1_000_000 - depth;
  if (isFull(b) || depth === 0) return scoreBoard(b, aiPlayer) - scoreBoard(b, aiPlayer === 1 ? 2 : 1);

  const center = Math.floor(COLS / 2);
  const valid  = [];
  for (let c = 0; c < COLS; c++) if (getDropRow(c, b) >= 0) valid.push(c);
  valid.sort((a, b2) => Math.abs(a - center) - Math.abs(b2 - center));

  if (maximizing) {
    let best = -Infinity;
    for (const col of valid) {
      const r = getDropRow(col, b);
      b[r][col] = aiPlayer;
      const sc = minimax(b, depth - 1, alpha, beta, false, aiPlayer);
      b[r][col] = 0;
      best = Math.max(best, sc);
      alpha = Math.max(alpha, sc);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    const opp = aiPlayer === 1 ? 2 : 1;
    let best = Infinity;
    for (const col of valid) {
      const r = getDropRow(col, b);
      b[r][col] = opp;
      const sc = minimax(b, depth - 1, alpha, beta, true, aiPlayer);
      b[r][col] = 0;
      best = Math.min(best, sc);
      beta = Math.min(beta, sc);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestCol(aiPlayer) {
  const depth = 6;
  const opp   = aiPlayer === 1 ? 2 : 1;
  const center = Math.floor(COLS / 2);
  const valid  = [];
  for (let c = 0; c < COLS; c++) if (getDropRow(c) >= 0) valid.push(c);
  valid.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));

  // Immediate win
  for (const col of valid) {
    const r = getDropRow(col);
    board[r][col] = aiPlayer;
    const wins = checkWin(board, r, col, aiPlayer);
    board[r][col] = 0;
    if (wins) return col;
  }
  // Block opponent
  for (const col of valid) {
    const r = getDropRow(col);
    board[r][col] = opp;
    const blocks = checkWin(board, r, col, opp);
    board[r][col] = 0;
    if (blocks) return col;
  }

  // Minimax
  let bestScore = -Infinity, bestCol = valid[0];
  for (const col of valid) {
    const b2 = cloneBoard();
    const r  = getDropRow(col, b2);
    b2[r][col] = aiPlayer;
    const sc = minimax(b2, depth, -Infinity, Infinity, false, aiPlayer);
    if (sc > bestScore) { bestScore = sc; bestCol = col; }
  }
  return bestCol;
}

/* ── Best Move Hint ── */
function findBestMove() {
  if (gameOver || aiThinking) return;
  clearHint();
  aiThinking = true;
  setStatus('thinking');
  setTimeout(() => {
    const best = getBestCol(currentPlayer);
    aiThinking = false;
    if (best >= 0) {
      const btn = document.querySelectorAll('.col-btn')[best];
      if (btn) btn.classList.add('col-best');
      document.getElementById('hint-text').innerHTML =
        `Kolom terbaik: <strong>Kolom ${best + 1}</strong> (dihitung dari kiri)`;
    }
    updateStatus();
    render();
  }, 30);
}

function clearHint() {
  document.querySelectorAll('.col-btn').forEach(b => b.classList.remove('col-best'));
  document.getElementById('hint-text').innerHTML =
    'Klik <strong>Best Move</strong> untuk melihat kolom terbaik yang disarankan AI.';
}

/* ── Undo ── */
function undoMove() {
  if (gameOver || history.length === 0 || aiThinking) return;
  const last = history.pop();
  board[last.r][last.col] = 0;
  if (mode === 'pvai' && history.length > 0) {
    const prev = history.pop();
    board[prev.r][prev.col] = 0;
  }
  currentPlayer = 1;
  gameOver = false;
  clearHint();
  render();
  updateStatus();
}

/* ── Human Play ── */
function humanPlay(col) {
  if (gameOver || aiThinking) return;
  if (mode === 'aiva') return;
  if (mode === 'pvai' && currentPlayer !== 1) return;
  const r = getDropRow(col);
  if (r < 0) return;
  clearHint();
  board[r][col] = currentPlayer;
  history.push({ r, col, player: currentPlayer });
  render();
  if (checkWin(board, r, col, currentPlayer)) { endGame(currentPlayer); return; }
  if (isFull(board)) { endGame(0); return; }
  currentPlayer = currentPlayer === 1 ? 2 : 1;
  updateStatus();
  if (mode === 'pvai' && currentPlayer === 2) setTimeout(() => aiMove(), 280);
}

/* ── AI Move ── */
function aiMove() {
  if (gameOver) return;
  aiThinking = true;
  setStatus('thinking');
  setTimeout(() => {
    const col = getBestCol(currentPlayer);
    aiThinking = false;
    if (col < 0) { endGame(0); return; }
    const r = getDropRow(col);
    if (r < 0) { endGame(0); return; }
    board[r][col] = currentPlayer;
    history.push({ r, col, player: currentPlayer });
    render();
    if (checkWin(board, r, col, currentPlayer)) { endGame(currentPlayer); return; }
    if (isFull(board)) { endGame(0); return; }
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    updateStatus();
    if (mode === 'aiva') setTimeout(() => aiMove(), 500);
  }, 30);
}

/* ── End Game ── */
function endGame(winner) {
  gameOver = true;
  const win = getWinCells(board);
  if (win) {
    const cells = document.getElementById('board').children;
    win.cells.forEach(([r, c]) => {
      const el = cells[r * COLS + c];
      if (el) el.classList.add('win-cell');
    });
  }
  if      (winner === 0) { scores.draw++; setStatus('draw'); }
  else if (winner === 1) { scores.human++; setStatus('win-human'); }
  else                   { scores.ai++;   setStatus('win-ai'); }
  document.getElementById('sc-human').textContent = scores.human;
  document.getElementById('sc-ai').textContent    = scores.ai;
  document.getElementById('sc-draw').textContent  = scores.draw;
}

/* ── Status ── */
function setStatus(state) {
  const dot = document.getElementById('status-dot');
  const msg = document.getElementById('status-msg');
  dot.className = 'status-dot';
  const map = {
    'thinking':  ['thinking', 'AI sedang berpikir...'],
    'win-human': ['green',    '🎉 Kamu menang! Selamat!'],
    'win-ai':    ['yellow',   '🤖 AI menang! Coba lagi?'],
    'draw':      ['',         '🤝 Seri! Papan penuh.'],
    'ai-turn':   ['yellow',   'Giliran AI (Kuning)...'],
    'p2-turn':   ['yellow',   'Giliran Pemain 2 (Kuning). Klik kolom!'],
    'player-turn':['red',     'Giliranmu! Klik kolom untuk bermain.'],
  };
  const [cls, text] = map[state] || ['red', 'Giliranmu!'];
  if (cls) dot.classList.add(cls);
  msg.textContent = text;
}

function updateStatus() {
  if (gameOver || aiThinking) return;
  if (mode === 'pvai') {
    setStatus(currentPlayer === 1 ? 'player-turn' : 'ai-turn');
  } else if (mode === 'pvp') {
    setStatus(currentPlayer === 1 ? 'player-turn' : 'p2-turn');
  } else {
    setStatus('ai-turn');
  }
}

/* ── Render ── */
function render() {
  const boardEl = document.getElementById('board');
  const colBtns = document.getElementById('col-btns');
  boardEl.innerHTML = '';
  colBtns.innerHTML = '';

  for (let c = 0; c < COLS; c++) {
    const btn = document.createElement('div');
    const full = getDropRow(c) < 0;
    btn.className = 'col-btn' + (full || gameOver ? ' col-disabled' : '');
    btn.textContent = '▼';
    btn.title = `Kolom ${c + 1}`;
    btn.addEventListener('click', () => humanPlay(c));
    colBtns.appendChild(btn);
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      const v = board[r][c];
      cell.className = 'cell ' + (v === 1 ? 'red' : v === 2 ? 'yellow' : '');
      cell.addEventListener('click', () => humanPlay(c));
      boardEl.appendChild(cell);
    }
  }

  document.getElementById('btn-hint').disabled = gameOver || aiThinking;
  document.getElementById('btn-undo').disabled = history.length === 0 || gameOver || aiThinking;
}

/* ── Start ── */
initBoard();
