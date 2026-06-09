/* ════════════════════════════════════════════════════════════════════
   Connect 5 — UNBEATABLE AI Worker  (Pure JS, no WASM dependency)
   Board: 9 cols × 7 rows   Win: 5 in a row
   Player = 1 (Merah/Human)  |  AI = 2 (Kuning)
   ════════════════════════════════════════════════════════════════════ */

const COLS     = 9;
const ROWS     = 7;
const WIN      = 5;
const EMPTY    = 0;
const HUMAN    = 1;
const AI       = 2;

/* ── Column search order: center-first for better pruning ── */
const COL_ORDER = [4, 3, 5, 2, 6, 1, 7, 0, 8];

/* ════════════════════════════════════════════════════════════════════
   FLAT BOARD REPRESENTATION
   board[r][c] → flat[r*COLS + c]   (faster than 2-D array access)
   ════════════════════════════════════════════════════════════════════ */
function toFlat(board2d) {
  const f = new Int8Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      f[r * COLS + c] = board2d[r][c];
  return f;
}

/* ── Drop row in column (−1 = full) ── */
function dropRow(flat, col) {
  for (let r = ROWS - 1; r >= 0; r--)
    if (flat[r * COLS + col] === EMPTY) return r;
  return -1;
}

/* ── Board full? ── */
function isBoardFull(flat) {
  for (let c = 0; c < COLS; c++)
    if (flat[c] === EMPTY) return false;
  return true;
}

/* ════════════════════════════════════════════════════════════════════
   WIN DETECTION — fast scan of all 4 directions from a placed piece
   ════════════════════════════════════════════════════════════════════ */
function checkWin(flat, row, col, player) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let d = 0; d < 4; d++) {
    const [dr, dc] = dirs[d];
    let cnt = 1;
    for (let s = 1; s < WIN; s++) {
      const nr = row + dr*s, nc = col + dc*s;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || flat[nr*COLS+nc] !== player) break;
      cnt++;
    }
    for (let s = 1; s < WIN; s++) {
      const nr = row - dr*s, nc = col - dc*s;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || flat[nr*COLS+nc] !== player) break;
      cnt++;
    }
    if (cnt >= WIN) return true;
  }
  return false;
}

/* ════════════════════════════════════════════════════════════════════
   STATIC EVALUATION
   Scans all windows of size WIN in 4 directions.
   Returns score from AI perspective.
   ════════════════════════════════════════════════════════════════════ */

// Pre-compute window patterns for the board
const WINDOWS = []; // { cells: [idx,...], dr, dc }

(function buildWindows() {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const cells = [];
        let ok = true;
        for (let i = 0; i < WIN; i++) {
          const nr = r + dr*i, nc = c + dc*i;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) { ok = false; break; }
          cells.push(nr * COLS + nc);
        }
        if (ok) WINDOWS.push(cells);
      }
    }
  }
})();

function staticEval(flat, aiPlayer) {
  const opp = aiPlayer === AI ? HUMAN : AI;
  let score = 0;

  for (const win of WINDOWS) {
    let aiCnt = 0, oppCnt = 0, emptyCnt = 0;
    for (const idx of win) {
      const v = flat[idx];
      if (v === aiPlayer)  aiCnt++;
      else if (v === opp)  oppCnt++;
      else                 emptyCnt++;
    }

    // Window shared by both → useless
    if (aiCnt > 0 && oppCnt > 0) continue;

    if (aiCnt > 0) {
      // AI patterns
      if (aiCnt === 5)                     score += 1_000_000_000;
      else if (aiCnt === 4 && emptyCnt===1) score += 10_000_000;
      else if (aiCnt === 3 && emptyCnt===2) score += 50_000;
      else if (aiCnt === 2 && emptyCnt===3) score += 500;
      else if (aiCnt === 1 && emptyCnt===4) score += 10;
    } else if (oppCnt > 0) {
      // Opponent patterns (penalty)
      if (oppCnt === 5)                     score -= 1_000_000_000;
      else if (oppCnt === 4 && emptyCnt===1) score -= 8_000_000;   // block 4 urgently
      else if (oppCnt === 3 && emptyCnt===2) score -= 100_000;     // block open-3 hard
      else if (oppCnt === 2 && emptyCnt===3) score -= 1_000;
      else if (oppCnt === 1 && emptyCnt===4) score -= 20;
    }
  }

  // ── Center column bonuses ──
  const centerCols = [4, 3, 5, 2, 6];
  const centerWt   = [20, 12, 12, 5, 5];
  for (let i = 0; i < centerCols.length; i++) {
    const c = centerCols[i];
    for (let r = 0; r < ROWS; r++) {
      const v = flat[r*COLS+c];
      if (v === aiPlayer)  score += centerWt[i];
      else if (v === opp)  score -= centerWt[i];
    }
  }

  // ── Lower rows are more reachable ──
  for (let r = 0; r < ROWS; r++) {
    const rowBonus = (ROWS - r) * 2;
    for (let c = 0; c < COLS; c++) {
      const v = flat[r*COLS+c];
      if (v === aiPlayer)  score += rowBonus;
    }
  }

  return score;
}

/* ════════════════════════════════════════════════════════════════════
   THREAT SCANNER
   Returns the column where player can win immediately (−1 = none)
   ════════════════════════════════════════════════════════════════════ */
function findWinningMove(flat, player) {
  for (const col of COL_ORDER) {
    const r = dropRow(flat, col);
    if (r < 0) continue;
    flat[r*COLS+col] = player;
    const win = checkWin(flat, r, col, player);
    flat[r*COLS+col] = EMPTY;
    if (win) return col;
  }
  return -1;
}

/* Count number of columns where player would win */
function countWins(flat, player) {
  let n = 0;
  for (const col of COL_ORDER) {
    const r = dropRow(flat, col);
    if (r < 0) continue;
    flat[r*COLS+col] = player;
    if (checkWin(flat, r, col, player)) n++;
    flat[r*COLS+col] = EMPTY;
  }
  return n;
}

/* ════════════════════════════════════════════════════════════════════
   TRANSPOSITION TABLE
   Zobrist hash → { depth, score, flag (EXACT/LOWER/UPPER), bestCol }
   ════════════════════════════════════════════════════════════════════ */
const TT_SIZE = 1 << 20; // 1M entries
const TT = new Array(TT_SIZE);

const EXACT = 0, LOWER = 1, UPPER = 2;

// 64-bit Zobrist using two 32-bit halves (JS float safe)
const ZH = new Uint32Array(ROWS * COLS * 3 * 2); // [cell][player 0-2][hi/lo]
(function initZobrist() {
  for (let i = 0; i < ZH.length; i++)
    ZH[i] = (Math.random() * 0x100000000) >>> 0;
})();

let hashHi = 0, hashLo = 0;

function xorHash(r, c, player) {
  const base = (r*COLS + c) * 6 + player * 2;
  hashHi ^= ZH[base];
  hashLo ^= ZH[base + 1];
}

function ttIndex() {
  return (hashHi ^ hashLo) & (TT_SIZE - 1);
}

function ttStore(depth, score, flag, bestCol) {
  const idx = ttIndex();
  TT[idx] = { hi: hashHi, lo: hashLo, depth, score, flag, bestCol };
}

function ttLookup(depth, alpha, beta) {
  const idx = ttIndex();
  const e = TT[idx];
  if (!e || e.hi !== hashHi || e.lo !== hashLo) return null;
  if (e.depth < depth) return { bestCol: e.bestCol, score: null }; // useful for move ordering only
  if (e.flag === EXACT) return { score: e.score, bestCol: e.bestCol };
  if (e.flag === LOWER && e.score >= beta)  return { score: e.score, bestCol: e.bestCol };
  if (e.flag === UPPER && e.score <= alpha) return { score: e.score, bestCol: e.bestCol };
  return { bestCol: e.bestCol, score: null };
}

/* ════════════════════════════════════════════════════════════════════
   KILLER MOVES & HISTORY HEURISTIC
   ════════════════════════════════════════════════════════════════════ */
const killers = Array.from({length: 30}, () => [-1, -1]); // per depth, 2 slots
const historyTable = new Int32Array(COLS);

function recordKiller(depth, col) {
  if (killers[depth][0] !== col) {
    killers[depth][1] = killers[depth][0];
    killers[depth][0] = col;
  }
}

/* ════════════════════════════════════════════════════════════════════
   MOVE ORDERING
   Priority: immediate win > immediate block > TT best > fork >
             killers > center > history
   ════════════════════════════════════════════════════════════════════ */
function orderedMoves(flat, aiPlayer, depth, ttBestCol) {
  const opp = aiPlayer === AI ? HUMAN : AI;
  const moves = [];

  for (const col of COL_ORDER) {
    const r = dropRow(flat, col);
    if (r < 0) continue;

    let priority = 0;

    // Win immediately
    flat[r*COLS+col] = aiPlayer;
    if (checkWin(flat, r, col, aiPlayer)) priority = 1_000_000_000;
    flat[r*COLS+col] = EMPTY;
    if (priority === 0) {
      // Block opponent win
      flat[r*COLS+col] = opp;
      if (checkWin(flat, r, col, opp)) priority = 900_000_000;
      flat[r*COLS+col] = EMPTY;
    }
    if (priority === 0 && col === ttBestCol) priority = 800_000_000;
    if (priority === 0) {
      // Fork: creates 2+ winning threats
      flat[r*COLS+col] = aiPlayer;
      const forks = countWins(flat, aiPlayer);
      flat[r*COLS+col] = EMPTY;
      if (forks >= 2) priority = 700_000_000 + forks * 1_000;
    }
    if (priority === 0) {
      if (col === killers[depth][0]) priority = 600_000_000;
      else if (col === killers[depth][1]) priority = 590_000_000;
    }
    if (priority === 0) priority = historyTable[col] + (4 - Math.abs(col - 4)) * 100;

    moves.push({ col, priority });
  }

  moves.sort((a, b) => b.priority - a.priority);
  return moves.map(m => m.col);
}

/* ════════════════════════════════════════════════════════════════════
   NEGAMAX with Alpha-Beta, Transposition Table, Killer Moves
   Returns score from the perspective of the CURRENT player (maximizing).
   ════════════════════════════════════════════════════════════════════ */
let deadline = 0;
const WIN_SCORE = 1_000_000_000;

function negamax(flat, depth, alpha, beta, player, plyFromRoot) {
  if (Date.now() >= deadline) return 0;

  const opp = player === AI ? HUMAN : AI;
  const origAlpha = alpha;

  // TT lookup
  const ttRes = ttLookup(depth, alpha, beta);
  const ttBestCol = ttRes ? ttRes.bestCol : -1;
  if (ttRes && ttRes.score !== null) return ttRes.score;

  // Terminal: draw
  if (isBoardFull(flat)) return 0;

  // Terminal: depth 0 → static eval from aiPlayer perspective (player 2 = AI)
  if (depth === 0) {
    // Convert to absolute score (from current player's perspective)
    const absScore = staticEval(flat, player);
    return absScore;
  }

  const moves = orderedMoves(flat, player, Math.min(plyFromRoot, 29), ttBestCol);
  if (moves.length === 0) return 0;

  let bestScore = -Infinity;
  let bestCol   = moves[0];

  for (const col of moves) {
    if (Date.now() >= deadline) break;
    const r = dropRow(flat, col);

    flat[r*COLS+col] = player;
    xorHash(r, col, player);

    // Check win BEFORE recursing (saves a full level of search)
    if (checkWin(flat, r, col, player)) {
      flat[r*COLS+col] = EMPTY;
      xorHash(r, col, player);
      // Reward faster wins
      const sc = WIN_SCORE - plyFromRoot;
      if (sc > bestScore) { bestScore = sc; bestCol = col; }
      // This is a winning move: prune everything
      alpha = Math.max(alpha, bestScore);
      break; // Can't do better than a win
    }

    const sc = -negamax(flat, depth - 1, -beta, -alpha, opp, plyFromRoot + 1);

    flat[r*COLS+col] = EMPTY;
    xorHash(r, col, player);

    if (sc > bestScore) { bestScore = sc; bestCol = col; }
    if (bestScore > alpha) alpha = bestScore;
    if (alpha >= beta) {
      recordKiller(Math.min(plyFromRoot, 29), col);
      historyTable[col] += depth * depth;
      break;
    }
  }

  // Store in TT
  const flag = bestScore <= origAlpha ? UPPER : bestScore >= beta ? LOWER : EXACT;
  ttStore(depth, bestScore, flag, bestCol);

  return bestScore;
}

/* ════════════════════════════════════════════════════════════════════
   IMMEDIATE THREAT PRIORITY LAYER
   Handles one-move and two-move lookahead before minimax.
   This ensures the engine NEVER misses a win or a forced block.
   ════════════════════════════════════════════════════════════════════ */
function immediateLogic(flat, aiPlayer) {
  const opp = aiPlayer === AI ? HUMAN : AI;

  // 1. Win immediately
  const winCol = findWinningMove(flat, aiPlayer);
  if (winCol >= 0) return winCol;

  // 2. Block opponent immediate win
  const blockCol = findWinningMove(flat, opp);
  if (blockCol >= 0) return blockCol;

  // 3. Create a fork (two winning threats) — guarantees win next move
  for (const col of COL_ORDER) {
    const r = dropRow(flat, col);
    if (r < 0) continue;
    flat[r*COLS+col] = aiPlayer;
    const forks = countWins(flat, aiPlayer);
    flat[r*COLS+col] = EMPTY;
    if (forks >= 2) return col;
  }

  // 4. Block opponent fork
  // Find cols where opponent would create a fork
  const oppForkCols = [];
  for (const col of COL_ORDER) {
    const r = dropRow(flat, col);
    if (r < 0) continue;
    flat[r*COLS+col] = opp;
    const forks = countWins(flat, opp);
    flat[r*COLS+col] = EMPTY;
    if (forks >= 2) oppForkCols.push(col);
  }

  if (oppForkCols.length === 1) {
    // Single fork threat: block it directly (unless we can create our own fork)
    return oppForkCols[0];
  }

  if (oppForkCols.length >= 2) {
    // Multiple fork threats: we must create a direct threat that forces
    // opponent to respond, otherwise they'll fork us.
    // Find a move that creates our own 4-in-a-row (immediate threat)
    for (const col of COL_ORDER) {
      const r = dropRow(flat, col);
      if (r < 0) continue;
      flat[r*COLS+col] = aiPlayer;
      const ourWins = countWins(flat, aiPlayer);
      flat[r*COLS+col] = EMPTY;
      if (ourWins >= 1) return col; // Force opponent to block instead of forking
    }
    // If no such move, block any fork col
    return oppForkCols[0];
  }

  return -1; // No immediate logic needed, proceed to minimax
}

/* ════════════════════════════════════════════════════════════════════
   MAIN DECISION — Iterative Deepening
   ════════════════════════════════════════════════════════════════════ */
function getBestMove(board2d, aiPlayer, timeLimitMs) {
  const flat = toFlat(board2d);

  // Init hash from scratch for this position
  hashHi = 0; hashLo = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (flat[r*COLS+c] !== EMPTY)
        xorHash(r, c, flat[r*COLS+c]);

  // Clear killer heuristic for new search
  for (let i = 0; i < killers.length; i++) killers[i][0] = killers[i][1] = -1;
  historyTable.fill(0);

  // Quick-win / quick-block / fork checks first (these are instant)
  const quick = immediateLogic(flat, aiPlayer);
  if (quick >= 0) return quick;

  // No available moves (shouldn't happen in normal play)
  const validCols = COL_ORDER.filter(c => dropRow(flat, c) >= 0);
  if (validCols.length === 0) return -1;
  if (validCols.length === 1) return validCols[0];

  // Opening: strongly prefer center early
  const moveCount = flat.filter(v => v !== EMPTY).length;
  if (moveCount <= 1) {
    const r = dropRow(flat, 4);
    if (r >= 0) return 4;
  }

  // ── Iterative deepening with time limit ──
  deadline = Date.now() + timeLimitMs;
  let bestCol   = validCols[0];
  let bestScore = -Infinity;

  // Start from depth 2, push as deep as time allows
  for (let depth = 2; depth <= 30; depth++) {
    if (Date.now() >= deadline) break;

    let iterBest  = bestCol;
    let iterScore = -Infinity;
    let allDone   = true;

    // Aspiration window (narrows search around best known score)
    let aspirAlpha = depth >= 4 ? bestScore - 50_000 : -Infinity;
    let aspirBeta  = depth >= 4 ? bestScore + 50_000 :  Infinity;

    aspirSearch: for (let attempt = 0; attempt < 3; attempt++) {
      // Reset search for this aspiration window
      let depthBest  = bestCol;
      let depthScore = -Infinity;
      allDone        = true;

      for (const col of COL_ORDER) {
        if (dropRow(flat, col) < 0) continue;
        if (Date.now() >= deadline) { allDone = false; break; }

        const r = dropRow(flat, col);
        flat[r*COLS+col] = aiPlayer;
        xorHash(r, col, aiPlayer);

        let sc;
        if (checkWin(flat, r, col, aiPlayer)) {
          sc = WIN_SCORE; // Winning move found during top-level loop
        } else {
          sc = -negamax(flat, depth - 1, -aspirBeta, -aspirAlpha, aiPlayer === AI ? HUMAN : AI, 1);
        }

        flat[r*COLS+col] = EMPTY;
        xorHash(r, col, aiPlayer);

        if (sc > depthScore) {
          depthScore = sc;
          depthBest  = col;
        }

        // Aspiration: if score outside window, re-search with wider window
        if (sc <= aspirAlpha) { aspirAlpha = -Infinity; continue aspirSearch; }
        if (sc >= aspirBeta)  { aspirBeta  =  Infinity; continue aspirSearch; }
      }

      // Search complete within window
      iterBest  = depthBest;
      iterScore = depthScore;
      break;
    }

    if (allDone) {
      bestCol   = iterBest;
      bestScore = iterScore;
    }

    // If we found a guaranteed win, stop
    if (bestScore >= WIN_SCORE - 200) break;
  }

  return bestCol;
}

/* ════════════════════════════════════════════════════════════════════
   WORKER MESSAGE HANDLER
   ════════════════════════════════════════════════════════════════════ */
self.onmessage = function(e) {
  const { board, aiPlayer } = e.data;
  const t0 = performance.now();

  // Time budget: 480ms gives UI update headroom under 500ms target
  const col = getBestMove(board, aiPlayer, 480);

  const ms = Math.round(performance.now() - t0);
  self.postMessage({ col, ms, engine: 'js-negamax' });
};
