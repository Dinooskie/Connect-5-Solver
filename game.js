/* ── Connect 5 Solver · game.js ── */

const COLS = 9, ROWS = 7, WIN = 5;

let board, history, currentPlayer, gameOver, mode, scores, aiThinking, humanSide;
scores = { human: 0, ai: 0, draw: 0 };
mode = 'pvai';
humanSide = 1; // 1 = human is red (goes first), 2 = human is yellow (AI goes first as red)

/* ── Side Selection ── */
function setSide(side) {
  humanSide = side;
  ['p1','p2'].forEach(id => {
    document.getElementById('btn-' + id).classList.toggle('active', id === (side === 1 ? 'p1' : 'p2'));
  });
  // When human=1: human=Merah, AI=Kuning
  // When human=2: human=Kuning, AI=Merah (AI goes first)
  if (side === 1) {
    document.getElementById('label-p1').textContent = 'Kamu (Merah)';
    document.getElementById('label-p2').textContent = 'AI (Kuning)';
  } else {
    document.getElementById('label-p1').textContent = 'AI (Merah)';
    document.getElementById('label-p2').textContent = 'Kamu (Kuning)';
  }
  resetGame();
}

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
  const sideBar = document.getElementById('side-bar');
  if (sideBar) sideBar.classList.toggle('hidden', m !== 'pvai');
  resetGame();
}

function resetGame() {
  initBoard();
  if (mode === 'aiva') {
    setTimeout(() => aiMove(), 500);
  } else if (mode === 'pvai' && humanSide === 2) {
    // Human is yellow (player 2), AI is red (player 1) → AI moves first
    setTimeout(() => aiMove(), 400);
  }
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

/* ── AI Scoring (used only for hint in game.js; main AI is in worker) ── */
function scoreWindow(window, player) {
  const opp  = player === 1 ? 2 : 1;
  const cnt  = window.filter(x => x === player).length;
  const emp  = window.filter(x => x === 0).length;
  const ocnt = window.filter(x => x === opp).length;
  if (cnt > 0 && ocnt > 0) return 0;
  let s = 0;
  if      (cnt === 5)               s += 10_000_000;
  else if (cnt === 4 && emp === 1)  s += 200_000;
  else if (cnt === 3 && emp === 2)  s += 5_000;
  else if (cnt === 2 && emp === 3)  s += 200;
  if      (ocnt === 5)              s -= 10_000_000;
  else if (ocnt === 4 && emp === 1) s -= 500_000;
  else if (ocnt === 3 && emp === 2) s -= 15_000;
  else if (ocnt === 2 && emp === 3) s -= 300;
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
  const center = Math.floor(COLS / 2);
  for (let r = 0; r < ROWS; r++) {
    if (b[r][center] === player)     sc += 10;
    if (b[r][center - 1] === player || b[r][center + 1] === player) sc += 5;
    if (b[r][center - 2] === player || b[r][center + 2] === player) sc += 2;
  }
  return sc;
}

/* ── Web Worker + WASM ── */
let aiWorker = null;

function getWorker() {
  if (!aiWorker) {
    aiWorker = new Worker('ai.worker.js');
  }
  return aiWorker;
}

function updateEngineBadge(engine, ms) {
  const badge  = document.getElementById('engine-badge');
  const timing = document.getElementById('engine-timing');
  if (!badge) return;
  if (engine === 'wasm') {
    badge.className = 'engine-badge wasm';
    badge.textContent = '⚡ WebAssembly';
  } else {
    badge.className = 'engine-badge js';
    badge.textContent = '🟨 JavaScript';
  }
  if (timing && ms !== undefined) {
    const color = ms < 500 ? '#065F46' : ms < 1000 ? '#92400E' : '#991B1B';
    timing.innerHTML = `AI berpikir: <strong style="color:${color}">${ms} ms</strong>`;
  }
}

function askWorker(aiPlayer, onResult) {
  const worker    = getWorker();
  const boardCopy = board.map(r => [...r]);
  worker.onmessage = (e) => {
    const { col, ms, engine } = e.data;
    updateEngineBadge(engine, ms);
    onResult(col);
  };
  worker.postMessage({ board: boardCopy, aiPlayer });
}

/* ── Best Move Hint ── */
function findBestMove() {
  if (gameOver || aiThinking) return;
  clearHint();
  aiThinking = true;
  setStatus('thinking');
  askWorker(currentPlayer, (best) => {
    aiThinking = false;
    if (best >= 0) {
      const btn = document.querySelectorAll('.col-btn')[best];
      if (btn) btn.classList.add('col-best');
      document.getElementById('hint-text').innerHTML =
        `Kolom terbaik: <strong>Kolom ${best + 1}</strong> (dihitung dari kiri)`;
    }
    updateStatus();
    render();
  });
}

function clearHint() {
  document.querySelectorAll('.col-btn').forEach(b => b.classList.remove('col-best'));
  document.getElementById('hint-text').innerHTML =
    'Klik <strong>Best Move</strong> untuk melihat kolom terbaik yang disarankan AI.';
}

/* ── Undo ── */
function undoMove() {
  if (gameOver || history.length === 0 || aiThinking) return;
  // Undo AI move + human move together
  const last = history.pop();
  board[last.r][last.col] = 0;
  if (mode === 'pvai' && history.length > 0) {
    const prev = history.pop();
    board[prev.r][prev.col] = 0;
  }
  currentPlayer = humanSide; // restore to human's turn
  gameOver = false;
  clearHint();
  render();
  updateStatus();
}

/* ── Human Play ── */
function humanPlay(col) {
  if (gameOver || aiThinking) return;
  if (mode === 'aiva') return;
  if (mode === 'pvai' && currentPlayer !== humanSide) return;
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
  if (mode === 'pvai' && currentPlayer !== humanSide) setTimeout(() => aiMove(), 280);
}

/* ── AI Move ── */
function aiMove() {
  if (gameOver) return;
  aiThinking = true;
  setStatus('thinking');
  askWorker(currentPlayer, (col) => {
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
    if (mode === 'aiva') setTimeout(() => aiMove(), 300);
    if (mode === 'pvai' && currentPlayer !== humanSide) setTimeout(() => aiMove(), 200);
  });
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
  if (winner === 0) {
    scores.draw++;
    setStatus('draw');
  } else if (winner === humanSide) {
    scores.human++;
    setStatus('win-human');
  } else {
    scores.ai++;
    setStatus('win-ai');
  }
  document.getElementById('sc-human').textContent = scores.human;
  document.getElementById('sc-ai').textContent    = scores.ai;
  document.getElementById('sc-draw').textContent  = scores.draw;
}

/* ── Status ── */
function setStatus(state) {
  const dot = document.getElementById('status-dot');
  const msg = document.getElementById('status-msg');
  dot.className = 'status-dot';

  // humanColor: warna bola manusia
  const humanColor = humanSide === 1 ? 'Merah' : 'Kuning';
  // aiColor: warna bola AI
  const aiColor    = humanSide === 1 ? 'Kuning' : 'Merah';
  const aiDotColor = humanSide === 1 ? 'yellow' : 'red';

  const map = {
    'thinking':    ['thinking',   'AI sedang berpikir...'],
    'win-human':   ['green',      `🎉 Kamu menang! Selamat!`],
    'win-ai':      [aiDotColor,   `🤖 AI menang! Coba lagi?`],
    'draw':        ['',           '🤝 Seri! Papan penuh.'],
    'ai-turn':     [aiDotColor,   `Giliran AI (${aiColor})...`],
    'p2-turn':     ['yellow',     'Giliran Pemain 2 (Kuning). Klik kolom!'],
    'player-turn': [humanSide === 1 ? 'red' : 'yellow', `Giliranmu (${humanColor})! Klik kolom untuk bermain.`],
  };
  const [cls, text] = map[state] || ['red', 'Giliranmu!'];
  if (cls) dot.classList.add(cls);
  msg.textContent = text;
}

function updateStatus() {
  if (gameOver || aiThinking) return;
  if (mode === 'pvai') {
    setStatus(currentPlayer === humanSide ? 'player-turn' : 'ai-turn');
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
setSide(1); // default: human is red, goes first
setMode('pvai');
