/* ── Connect 5 Solver v2 · game.js ── */
/* PLAYER = MERAH (1) selalu | AI = KUNING (2) selalu */

const COLS = 9, ROWS = 7, WIN = 5;

let board, history, currentPlayer, gameOver, mode, scores, aiThinking, humanSide;
scores = { human: 0, ai: 0, draw: 0 };
mode = 'pvai';
humanSide = 1; // 1 = human jalan duluan, 2 = AI jalan duluan

// AI selalu player 2 (kuning), Human selalu player 1 (merah)
// Tapi ketika AI jalan duluan, AI bertindak sebagai currentPlayer=1 tapi tetap warna kuning
// Solusi: gunakan mapping warna terpisah dari player number

// playerColor(p): return css class untuk board cell
function cellClass(v) {
  // v=1 → yang jalan duluan dalam game logic (bisa human atau AI)
  // v=2 → yang jalan kedua
  // Kita map berdasarkan humanSide
  if (v === 0) return '';
  if (humanSide === 1) {
    return v === 1 ? 'red' : 'yellow'; // human=1=merah, ai=2=kuning
  } else {
    return v === 1 ? 'yellow' : 'red'; // ai=1=kuning (jalan duluan), human=2=merah
  }
}

/* ── Side Selection ── */
function setSide(side) {
  humanSide = side;
  ['p1','p2'].forEach(id => {
    document.getElementById('btn-' + id).classList.toggle('active', id === (side === 1 ? 'p1' : 'p2'));
  });
  // Label scoreboard: Kamu selalu merah, AI selalu kuning
  document.getElementById('label-p1').textContent = 'Kamu (Merah)';
  document.getElementById('label-p2').textContent = 'AI (Kuning)';
  resetGame();
}

/* ── Init ── */
function initBoard() {
  board         = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  history       = [];
  currentPlayer = 1;
  gameOver      = false;
  aiThinking    = false;
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
    setTimeout(() => aiMove(), 400);
  } else if (mode === 'pvai' && humanSide === 2) {
    // Human merah tapi jalan kedua → AI jalan duluan (sebagai player 1)
    setTimeout(() => aiMove(), 300);
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
    for (let s=1;s<WIN;s++){const nr=row+dr*s,nc=col+dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==player)break;cnt++;}
    for (let s=1;s<WIN;s++){const nr=row-dr*s,nc=col-dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==player)break;cnt++;}
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
          const nr = r+dr*s, nc = c+dc*s;
          if (nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==p) break;
          cells.push([nr, nc]);
        }
        if (cells.length >= WIN) return { player: p, cells };
      }
    }
  }
  return null;
}

/* ── AI Player Number ── */
// Dalam game logic, player 1 selalu jalan duluan
// humanSide=1: human=1(merah), AI=2(kuning)
// humanSide=2: AI=1(kuning jalan duluan), human=2(merah)
function getAiPlayerNum() {
  return humanSide === 1 ? 2 : 1;
}

/* ── Web Worker ── */
let aiWorker = null;

function getWorker() {
  if (!aiWorker) {
    aiWorker = new Worker('ai.worker.js');
    aiWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'ready') {
        const badge = document.getElementById('engine-badge');
        if (!badge) return;
        if (e.data.engine === 'wasm') {
          badge.className = 'engine-badge wasm';
          badge.textContent = '⚡ WebAssembly';
        } else {
          badge.className = 'engine-badge js';
          badge.textContent = '🟨 JavaScript';
        }
      }
    });
  }
  return aiWorker;
}

function updateEngineBadge(engine, ms) {
  const badge  = document.getElementById('engine-badge');
  const timing = document.getElementById('engine-timing');
  if (badge) {
    if (engine === 'wasm') {
      badge.className = 'engine-badge wasm';
      badge.textContent = '⚡ WebAssembly';
    } else {
      badge.className = 'engine-badge js';
      badge.textContent = '🟨 JavaScript';
    }
  }
  if (timing && ms !== undefined) {
    const color = ms < 300 ? '#065F46' : ms < 500 ? '#92400E' : '#991B1B';
    timing.innerHTML = `AI berpikir: <strong style="color:${color}">${ms} ms</strong>`;
  }
}

function askWorker(aiPlayer, onResult) {
  const worker    = getWorker();
  const boardCopy = board.map(r => [...r]);
  worker.onmessage = (e) => {
    if (e.data && e.data.type === 'ready') return;
    const { col, ms, engine } = e.data;
    updateEngineBadge(engine, ms);
    onResult(col);
  };
  worker.postMessage({ board: boardCopy, aiPlayer });
}

/* ── Hint: Best Move ── */
function findBestMove() {
  if (gameOver || aiThinking) return;
  clearHint();
  aiThinking = true;
  setStatus('thinking');
  const forPlayer = mode === 'pvai' ? getAiPlayerNum() : currentPlayer;
  askWorker(forPlayer, (best) => {
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
  // Undo last move
  const last = history.pop();
  board[last.r][last.col] = 0;
  // In pvai mode, also undo the AI's move
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
  if (mode === 'pvai' && currentPlayer !== humanSide) {
    setTimeout(() => aiMove(), 50); // Fast response
  }
}

/* ── AI Move ── */
function aiMove() {
  if (gameOver) return;
  aiThinking = true;
  setStatus('thinking');
  const aiPlayer = mode === 'pvai' ? getAiPlayerNum() : currentPlayer;
  askWorker(aiPlayer, (col) => {
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
    if (mode === 'aiva')  setTimeout(() => aiMove(), 200);
    if (mode === 'pvai' && currentPlayer !== humanSide) setTimeout(() => aiMove(), 50);
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
  const aiPlayer = getAiPlayerNum();
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

  const map = {
    'thinking':    ['thinking', 'AI sedang berpikir...'],
    'win-human':   ['green',    '😱 Kamu menang! (Tidak mungkin...)'],
    'win-ai':      ['yellow',   '🤖 AI (Kuning) menang!'],
    'draw':        ['',         '🤝 Seri! Papan penuh.'],
    'ai-turn':     ['yellow',   'Giliran AI (Kuning)...'],
    'p2-turn':     ['yellow',   'Giliran Pemain 2 (Kuning). Klik kolom!'],
    'player-turn': ['red',      'Giliranmu (Merah)! Klik kolom untuk bermain.'],
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
      cell.className = 'cell ' + cellClass(v);
      cell.addEventListener('click', () => humanPlay(c));
      boardEl.appendChild(cell);
    }
  }

  document.getElementById('btn-hint').disabled = gameOver || aiThinking;
  document.getElementById('btn-undo').disabled = history.length === 0 || gameOver || aiThinking;
}

/* ── Start ── */
setSide(1);
setMode('pvai');
