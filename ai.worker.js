/* ── Connect 5 · AI Worker v4 — Pure JS, Negamax + Alpha-Beta + TT ──
   Rewritten from scratch to fix reported tactical blind spots:
   - missed vertical / diagonal blocks
   - AI playing "safe" filler moves while ignoring live threats
   - relying on an opaque pre-compiled WASM engine that couldn't be
     inspected or debugged
   Everything now runs in plain, auditable JavaScript.
*/

const COLS = 9, ROWS = 7, WIN = 5;
const TIME_LIMIT_MS = 900;           // thinking budget per move
const MAX_DEPTH = 20;                 // hard ceiling for iterative deepening
const COL_ORDER = [4, 3, 5, 2, 6, 1, 7, 0, 8]; // center-out move order

const WIN_SCORE = 10_000_000;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/* ── Basic board helpers ── */
function dropR(b, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (b[r][col] === 0) return r;
  return -1;
}
function isFull(b) { return b[0].every(c => c !== 0); }

// Did `player` win with a stone just placed at (row,col)?
function cwin(b, row, col, player) {
  for (const [dr, dc] of DIRS) {
    let n = 1;
    for (let s = 1; s < WIN; s++) {
      const nr = row + dr * s, nc = col + dc * s;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || b[nr][nc] !== player) break;
      n++;
    }
    for (let s = 1; s < WIN; s++) {
      const nr = row - dr * s, nc = col - dc * s;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || b[nr][nc] !== player) break;
      n++;
    }
    if (n >= WIN) return true;
  }
  return false;
}

// Full-board winner scan (only used for external calls, never inside the hot search loop)
function getWinner(b) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c];
    if (p && cwin(b, r, c, p)) return p;
  }
  return 0;
}

// Columns where dropping `p` right now wins immediately.
function liveWinCols(b, p) {
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    const r = dropR(b, c);
    if (r < 0) continue;
    b[r][c] = p;
    if (cwin(b, r, c, p)) cols.push(c);
    b[r][c] = 0;
  }
  return cols;
}

/* ── Evaluation ──
   Scores every 5-cell window on the board from the point of view of
   `me` (the player about to move at this node). Empty cells that are
   "live" (i.e. sit exactly on top of the current stack, so they can be
   played on the very next turn in that column) are weighted far more
   heavily than "sleeping" cells that are still buried under empty
   space — this is the piece that was missing before and is exactly
   why the old engine ignored real, playable threats.
*/
function evalBoard(b, me) {
  const opp = me === 1 ? 2 : 1;
  let score = 0;

  const dropRow = new Array(COLS);
  for (let c = 0; c < COLS; c++) dropRow[c] = dropR(b, c);

  for (const [dr, dc] of DIRS) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const er = r + dr * (WIN - 1), ec = c + dc * (WIN - 1);
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;

        let meCnt = 0, oppCnt = 0, live = 0;
        for (let s = 0; s < WIN; s++) {
          const rr = r + dr * s, cc = c + dc * s;
          const v = b[rr][cc];
          if (v === me) meCnt++;
          else if (v === opp) oppCnt++;
          else if (dropRow[cc] === rr) live++;
        }
        if (meCnt && oppCnt) continue; // blocked window, ignore

        if (meCnt === 4) score += 120000 + live * 30000;
        else if (meCnt === 3) score += 1200 + live * 500;
        else if (meCnt === 2) score += 120 + live * 60;
        else if (meCnt === 1) score += live * 4;
        else if (oppCnt === 4) score -= 170000 + live * 40000;
        else if (oppCnt === 3) score -= 1800 + live * 750;
        else if (oppCnt === 2) score -= 150 + live * 80;
        else if (oppCnt === 1) score -= live * 4;
      }
    }
  }

  // Double / triple threat safety net: if the opponent already has two or
  // more columns that win for them right now, this position is lost
  // (we can only block one column per turn).
  const myLive = liveWinCols(b, me).length;
  const oppLive = liveWinCols(b, opp).length;
  if (oppLive >= 2) score -= 900000;
  if (myLive >= 2) score += 700000;

  // Mild center-control preference (center columns give more winning lines).
  const weights = [1, 2, 3, 4, 5, 4, 3, 2, 1];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (b[r][c] === me) score += weights[c];
    else if (b[r][c] === opp) score -= weights[c];
  }

  return score;
}

/* ── Move ordering heuristic (cheap, used at every node) ── */
function orderMoves(b, cols, p) {
  const opp = p === 1 ? 2 : 1;
  const scored = cols.map(col => {
    const r = dropR(b, col);
    let s = 5 - Math.abs(col - 4); // center bias baseline
    b[r][col] = p;
    if (cwin(b, r, col, p)) s += 100000;               // I win here
    b[r][col] = 0;
    b[r][col] = opp;
    if (cwin(b, r, col, opp)) s += 50000;               // must block here
    b[r][col] = 0;
    return { col, s };
  });
  scored.sort((a, b2) => b2.s - a.s);
  return scored.map(x => x.col);
}

/* ── Negamax with alpha-beta + transposition table ──
   lastR/lastC/lastP describe the move that was just made (by the player
   who is NOT `p`), so we only need a cheap localized win-check instead
   of rescanning the whole board every single node.
*/
let deadline = 0;
let timedOut = false;
let nodeCount = 0;

function boardKey(b, p) {
  // Small, fast, collision-free enough key for this board size.
  let s = '';
  for (let r = 0; r < ROWS; r++) s += b[r].join('');
  return s + '|' + p;
}

function negamax(b, depth, alpha, beta, p, lastR, lastC, tt) {
  nodeCount++;
  if ((nodeCount & 511) === 0 && Date.now() >= deadline) { timedOut = true; return 0; }

  const justMoved = p === 1 ? 2 : 1;
  if (lastR >= 0 && cwin(b, lastR, lastC, justMoved)) return -(WIN_SCORE + depth);
  if (isFull(b)) return 0;
  if (depth === 0) return evalBoard(b, p);

  const key = boardKey(b, p);
  const entry = tt.get(key);
  let ttMove = -1;
  if (entry && entry.depth >= depth) {
    if (entry.flag === 0) return entry.score;                 // exact
    if (entry.flag === 1) alpha = Math.max(alpha, entry.score); // lower bound
    else beta = Math.min(beta, entry.score);                    // upper bound
    if (alpha >= beta) return entry.score;
    ttMove = entry.move;
  } else if (entry) {
    ttMove = entry.move;
  }

  let cols = [];
  for (const c of COL_ORDER) if (dropR(b, c) >= 0) cols.push(c);
  if (cols.length === 0) return 0;
  cols = orderMoves(b, cols, p);
  if (ttMove >= 0) {
    const idx = cols.indexOf(ttMove);
    if (idx > 0) { cols.splice(idx, 1); cols.unshift(ttMove); }
  }

  const alphaOrig = alpha;
  let best = -Infinity, bestMove = cols[0];
  const opp = p === 1 ? 2 : 1;

  for (const col of cols) {
    const r = dropR(b, col);
    b[r][col] = p;
    const sc = -negamax(b, depth - 1, -beta, -alpha, opp, r, col, tt);
    b[r][col] = 0;
    if (timedOut) return 0;
    if (sc > best) { best = sc; bestMove = col; }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }

  let flag = 0;
  if (best <= alphaOrig) flag = 2;      // upper bound
  else if (best >= beta) flag = 1;      // lower bound
  tt.set(key, { depth, score: best, flag, move: bestMove });

  return best;
}

function getBestJS(board, ai) {
  const opp = ai === 1 ? 2 : 1;

  // 1) Take an immediate win if it exists.
  const myWins = liveWinCols(board, ai);
  if (myWins.length) return myWins[Math.round((myWins.length - 1) / 2)];

  // 2) Block an immediate opponent win.
  const oppWins = liveWinCols(board, opp);
  if (oppWins.length) {
    // If the opponent has more than one winning column we're already lost;
    // still block the most central one to give ourselves the best remaining
    // practical chances (opponent mistakes, etc).
    let bestBlock = oppWins[0], bestDist = Math.abs(oppWins[0] - 4);
    for (const c of oppWins) {
      const d = Math.abs(c - 4);
      if (d < bestDist) { bestDist = d; bestBlock = c; }
    }
    return bestBlock;
  }

  const availCols = COL_ORDER.filter(c => dropR(board, c) >= 0);
  if (availCols.length === 0) return -1;
  if (availCols.length === 1) return availCols[0];

  deadline = Date.now() + TIME_LIMIT_MS;
  timedOut = false;
  nodeCount = 0;
  const tt = new Map();

  let best = availCols[0];
  let rootOrder = orderMoves(board, availCols, ai);

  for (let depth = 2; depth <= MAX_DEPTH; depth++) {
    if (Date.now() >= deadline) break;
    let iterBest = -Infinity, iterMove = rootOrder[0];
    let alpha = -Infinity;
    const beta = Infinity;
    let failed = false;

    for (const col of rootOrder) {
      if (Date.now() >= deadline) { failed = true; break; }
      const r = dropR(board, col);
      board[r][col] = ai;
      const sc = -negamax(board, depth - 1, -beta, -alpha, opp, r, col, tt);
      board[r][col] = 0;
      if (timedOut) { failed = true; break; }
      if (sc > iterBest) { iterBest = sc; iterMove = col; }
      if (iterBest > alpha) alpha = iterBest;
    }

    if (!failed && !timedOut) {
      best = iterMove;
      // Re-order next iteration so the current best move is searched first
      // (much better alpha-beta cutoffs on the next, deeper pass).
      rootOrder = [iterMove, ...rootOrder.filter(c => c !== iterMove)];
      if (iterBest >= WIN_SCORE - MAX_DEPTH) break; // forced win found, no need to go deeper
    } else {
      break;
    }
  }

  return best;
}

/* ── Worker glue ── */
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.postMessage({ type: 'ready', engine: 'js' });

  self.onmessage = function (e) {
    if (e.data.type === 'ping') return;
    const { board, aiPlayer } = e.data;
    const t0 = performance.now();
    const col = getBestJS(board, aiPlayer);
    const ms = Math.round(performance.now() - t0);
    self.postMessage({ col, ms, engine: 'js' });
  };
}

/* ── Exports for Node-based testing ── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getBestJS, cwin, getWinner, dropR, isFull, liveWinCols, evalBoard, COLS, ROWS, WIN };
}
