/* ── Connect 5 Solver · AI Worker v2 — UNBEATABLE ENGINE ── */
/* Player = MERAH (1), AI = KUNING (2) — ALWAYS */

const COLS = 9, ROWS = 7, WIN = 5;
const TIME_LIMIT_MS = 900; // Max 900ms — safely under 1 second
const COL_ORDER = [4, 3, 5, 2, 6, 1, 7, 0, 8];

let wasmExports = null;
let wasmReady   = false;

// ── Load WASM ──
async function loadWasm() {
  try {
    const res    = await fetch('connect5_ai.wasm');
    const bytes  = await res.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, {
      env: {
        memory: new WebAssembly.Memory({ initial: 4 }),
        abort:  () => {},
        'Date.now': () => Date.now()
      }
    });
    wasmExports = result.instance.exports;
    wasmExports.initZobrist();
    wasmReady = true;
  } catch(e) {
    wasmReady = false;
  }
}

// ── Board Helpers ──
function getDropRow(b, col) {
  for (let r = ROWS-1; r >= 0; r--) if (b[r][col] === 0) return r;
  return -1;
}
function isFull(b) { return b[0].every(c => c !== 0); }

function checkWin(b, row, col, player) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr,dc] of dirs) {
    let cnt = 1;
    for (let s=1;s<WIN;s++){const nr=row+dr*s,nc=col+dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==player)break;cnt++;}
    for (let s=1;s<WIN;s++){const nr=row-dr*s,nc=col-dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==player)break;cnt++;}
    if(cnt>=WIN)return true;
  }
  return false;
}

function getWinner(b) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    const p=b[r][c]; if(!p) continue;
    for (const [dr,dc] of dirs) {
      let cnt=1;
      for(let s=1;s<WIN;s++){const nr=r+dr*s,nc=c+dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==p)break;cnt++;}
      if(cnt>=WIN)return p;
    }
  }
  return 0;
}

// ── Opening Book: first move for AI (player 2) going second ──
// When AI is player 2 and board is empty after 1 human move,
// always play center or adjacent to center
const CENTER_COL = 4;

function getOpeningMove(board, aiPlayer) {
  const moveCount = board.flat().filter(x => x !== 0).length;
  
  // AI goes first (board is empty)
  if (moveCount === 0) {
    return CENTER_COL; // Center is strongest opening
  }
  
  // AI goes second (1 piece on board)
  if (moveCount === 1) {
    // Find opponent's piece
    for (let c = 0; c < COLS; c++) {
      const r = getDropRow(board, c);
      const row = (r === -1) ? 0 : r + 1;
      if (row < ROWS && board[row] && board[row][c] !== 0) {
        // Play adjacent to opponent or center
        if (c === CENTER_COL) return CENTER_COL; // already center, play center
        return CENTER_COL;
      }
    }
    return CENTER_COL;
  }
  
  return -1; // No opening book move
}

// ── THREAT ANALYSIS: detect immediate win/block ──
function findImmediateWin(board, player) {
  for (const col of COL_ORDER) {
    const r = getDropRow(board, col);
    if (r < 0) continue;
    board[r][col] = player;
    const win = checkWin(board, r, col, player);
    board[r][col] = 0;
    if (win) return col;
  }
  return -1;
}

// ── DOUBLE THREAT DETECTION ──
// Count how many columns player can win by playing next turn
function countWinningMoves(board, player) {
  let count = 0;
  for (const col of COL_ORDER) {
    const r = getDropRow(board, col);
    if (r < 0) continue;
    board[r][col] = player;
    if (checkWin(board, r, col, player)) count++;
    board[r][col] = 0;
  }
  return count;
}

// ── UNSAFE MOVE FILTER ──
// Returns true if playing col would let opponent win immediately after
function moveGivesOpponentWin(board, col, aiPlayer, opp) {
  const r = getDropRow(board, col);
  if (r < 0) return true;
  board[r][col] = aiPlayer;
  // Check if opponent can win anywhere after this move
  let oppWins = false;
  for (const c2 of COL_ORDER) {
    const r2 = getDropRow(board, c2);
    if (r2 < 0) continue;
    board[r2][c2] = opp;
    if (checkWin(board, r2, c2, opp)) { oppWins = true; board[r2][c2] = 0; break; }
    board[r2][c2] = 0;
  }
  board[r][col] = 0;
  return oppWins;
}

// ── EVALUATION FUNCTION — heavily biased toward AI winning ──
function evalBoard(b, aiPlayer) {
  const opp = aiPlayer === 1 ? 2 : 1;
  let sc = 0;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];

  for (const [dr,dc] of dirs) {
    for (let r=0;r<ROWS;r++) {
      for (let c=0;c<COLS;c++) {
        const w=[];
        for(let i=0;i<WIN;i++){const nr=r+dr*i,nc=c+dc*i;if(nr<0||nr>=ROWS||nc<0||nc>=COLS)break;w.push(b[nr][nc]);}
        if(w.length!==WIN) continue;
        const cnt  = w.filter(x=>x===aiPlayer).length;
        const emp  = w.filter(x=>x===0).length;
        const ocnt = w.filter(x=>x===opp).length;
        if(cnt&&ocnt) continue;
        // AI offense — extremely aggressive
        if(cnt===5)              sc+=100000000;
        else if(cnt===4&&emp===1) sc+=1000000;  // near-win: critical
        else if(cnt===3&&emp===2) sc+=20000;
        else if(cnt===2&&emp===3) sc+=400;
        // Defense: block opponent
        if(ocnt===5)              sc-=100000000;
        else if(ocnt===4&&emp===1) sc-=800000;  // MUST block
        else if(ocnt===3&&emp===2) sc-=30000;
        else if(ocnt===2&&emp===3) sc-=500;
      }
    }
  }

  // Positional bonuses: center control
  for(let r=0;r<ROWS;r++){
    if(b[r][4]===aiPlayer)  sc+=15;
    if(b[r][3]===aiPlayer||b[r][5]===aiPlayer) sc+=8;
    if(b[r][2]===aiPlayer||b[r][6]===aiPlayer) sc+=3;
    // Penalize opponent center
    if(b[r][4]===opp)  sc-=15;
    if(b[r][3]===opp||b[r][5]===opp) sc-=8;
  }

  // Row bonus: lower rows are more stable
  for(let r=ROWS-1;r>=0;r--) {
    const bonus = (ROWS - r);
    for(let c=0;c<COLS;c++){
      if(b[r][c]===aiPlayer) sc += bonus;
    }
  }

  // Double-threat bonus: if AI has multiple winning moves, huge bonus
  const aiWins = countWinningMoves(b, aiPlayer);
  const oppWins = countWinningMoves(b, opp);
  sc += aiWins * 500000;
  sc -= oppWins * 400000;

  return sc;
}

// ── MINIMAX with Alpha-Beta ──
let deadline = 0;

function minimax(b, depth, alpha, beta, maximizing, aiPlayer) {
  if (Date.now() >= deadline) return 0;
  
  const winner = getWinner(b);
  if (winner === aiPlayer) return 100000000 + depth*1000;
  if (winner !== 0)        return -100000000 - depth*1000;
  if (isFull(b) || depth === 0) return evalBoard(b, aiPlayer);

  const opp       = aiPlayer === 1 ? 2 : 1;
  const curPlayer = maximizing ? aiPlayer : opp;
  const enemy     = maximizing ? opp : aiPlayer;

  // Move ordering: win first, block second, safe moves, rest
  const winMoves=[], blockMoves=[], safeMoves=[], rest=[];
  for (const col of COL_ORDER) {
    const r = getDropRow(b, col);
    if (r < 0) continue;
    b[r][col] = curPlayer;
    if (checkWin(b, r, col, curPlayer)) { b[r][col]=0; winMoves.push(col); continue; }
    b[r][col] = 0;
    b[r][col] = enemy;
    if (checkWin(b, r, col, enemy)) { b[r][col]=0; blockMoves.push(col); continue; }
    b[r][col] = 0;
    rest.push(col);
  }
  const ordered = [...winMoves, ...blockMoves, ...rest];

  if (maximizing) {
    let best = -Infinity;
    for (const col of ordered) {
      if (Date.now() >= deadline) break;
      const r = getDropRow(b, col);
      b[r][col] = aiPlayer;
      const sc = minimax(b, depth-1, alpha, beta, false, aiPlayer);
      b[r][col] = 0;
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const col of ordered) {
      if (Date.now() >= deadline) break;
      const r = getDropRow(b, col);
      b[r][col] = opp;
      const sc = minimax(b, depth-1, alpha, beta, true, aiPlayer);
      b[r][col] = 0;
      if (sc < best) best = sc;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ── MAIN AI DECISION ──
function getBestColJS(board, aiPlayer) {
  const opp = aiPlayer === 1 ? 2 : 1;
  const moveCount = board.flat().filter(x => x !== 0).length;

  // Opening book: first 2 plies
  if (moveCount <= 1) {
    const r = getDropRow(board, CENTER_COL);
    if (r >= 0) return CENTER_COL;
  }

  // 1. Immediate win
  const winMove = findImmediateWin(board, aiPlayer);
  if (winMove >= 0) return winMove;

  // 2. Immediate block
  const blockMove = findImmediateWin(board, opp);
  if (blockMove >= 0) return blockMove;

  // 3. Filter safe columns (don't give opponent free win)
  const allCols = COL_ORDER.filter(c => getDropRow(board, c) >= 0);
  let searchCols = allCols.filter(c => !moveGivesOpponentWin(board, c, aiPlayer, opp));
  if (searchCols.length === 0) searchCols = allCols; // fallback: no safe moves

  // 4. Check if any safe move creates a double threat (instant fork win)
  for (const col of searchCols) {
    const r = getDropRow(board, col);
    board[r][col] = aiPlayer;
    const wins = countWinningMoves(board, aiPlayer);
    board[r][col] = 0;
    if (wins >= 2) return col; // Fork: AI will win regardless
  }

  // 5. Iterative deepening minimax
  deadline = Date.now() + TIME_LIMIT_MS;
  let bestCol = searchCols[0];
  let bestScore = -Infinity;

  for (let depth = 2; depth <= 20; depth++) {
    if (Date.now() >= deadline) break;
    let iterBestCol = bestCol;
    let iterBestScore = -Infinity;
    let complete = true;

    for (const col of searchCols) {
      if (Date.now() >= deadline) { complete = false; break; }
      const r = getDropRow(board, col);
      board[r][col] = aiPlayer;
      const sc = minimax(board, depth, -Infinity, Infinity, false, aiPlayer);
      board[r][col] = 0;
      if (sc > iterBestScore) {
        iterBestScore = sc;
        iterBestCol = col;
      }
      if (iterBestScore >= 100000000) break; // Found winning move
    }

    if (complete || iterBestScore >= 100000000) {
      bestCol = iterBestCol;
      bestScore = iterBestScore;
    }
    if (bestScore >= 100000000) break; // Confirmed win
  }

  return bestCol;
}

// ── WASM interface ──
function getBestColWasm(board, aiPlayer) {
  wasmExports.clearBoard();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      wasmExports.setCell(r, c, board[r][c]);
  return wasmExports.getBestMove(aiPlayer, TIME_LIMIT_MS);
}

// ── Init ──
loadWasm();

self.onmessage = function(e) {
  const { board, aiPlayer } = e.data;
  const t0 = performance.now();

  let col, engine;
  if (wasmReady) {
    // Try WASM first, validate result
    col = getBestColWasm(board, aiPlayer);
    engine = 'wasm';
    // Validate WASM result with JS safety checks
    if (col < 0 || col >= COLS || getDropRow(board, col) < 0) {
      col = getBestColJS(board, aiPlayer);
      engine = 'js';
    }
  } else {
    col = getBestColJS(board, aiPlayer);
    engine = 'js';
  }

  // Final safety: if WASM missed immediate win/block, fix it
  const opp = aiPlayer === 1 ? 2 : 1;
  const winMove   = findImmediateWin(board, aiPlayer);
  const blockMove = findImmediateWin(board, opp);
  if (winMove >= 0)   { col = winMove;   engine += '+win'; }
  else if (blockMove >= 0) { col = blockMove; engine += '+blk'; }

  const ms = Math.round(performance.now() - t0);
  self.postMessage({ col, ms, engine });
};
