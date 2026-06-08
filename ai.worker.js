/* ── Connect 5 · AI Worker — WASM + Iterative Deepening + Time Limit ── */

const COLS = 9, ROWS = 7, WIN = 5;
const TIME_LIMIT_MS = 1500; // increased from 700ms → 1500ms for deeper search
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

// ── JS Fallback ──
function getDropRowJS(b, col) {
  for (let r = ROWS-1; r>=0; r--) if (b[r][col]===0) return r;
  return -1;
}
function isFullJS(b) { return b[0].every(c=>c!==0); }
function checkWinJS(b, row, col, player) {
  const dirs=[[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr,dc] of dirs) {
    let cnt=1;
    for(let s=1;s<WIN;s++){const nr=row+dr*s,nc=col+dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==player)break;cnt++;}
    for(let s=1;s<WIN;s++){const nr=row-dr*s,nc=col-dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==player)break;cnt++;}
    if(cnt>=WIN)return true;
  }
  return false;
}
function getWinnerJS(b) {
  const dirs=[[0,1],[1,0],[1,1],[1,-1]];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const p=b[r][c];if(!p)continue;
    for(const[dr,dc]of dirs){let cnt=1;for(let s=1;s<WIN;s++){const nr=r+dr*s,nc=c+dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==p)break;cnt++;}if(cnt>=WIN)return p;}
  }return 0;
}

// ── IMPROVED EVAL: stronger threat detection ──
function evalJS(b, player) {
  let sc=0; const opp=player===1?2:1;
  const dirs=[[0,1],[1,0],[1,1],[1,-1]];

  for(const[dr,dc]of dirs)for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const w=[];for(let i=0;i<WIN;i++){const nr=r+dr*i,nc=c+dc*i;if(nr<0||nr>=ROWS||nc<0||nc>=COLS)break;w.push(b[nr][nc]);}
    if(w.length!==WIN)continue;
    const cnt=w.filter(x=>x===player).length;
    const emp=w.filter(x=>x===0).length;
    const ocnt=w.filter(x=>x===opp).length;
    if(cnt&&ocnt)continue;
    // AI offense
    if(cnt===5) sc+=10000000;
    else if(cnt===4&&emp===1) sc+=200000;   // was 50000 — near-win is CRITICAL
    else if(cnt===3&&emp===2) sc+=5000;     // was 1000
    else if(cnt===2&&emp===3) sc+=200;      // was 100
    // AI defense — block opponent aggressively
    if(ocnt===5) sc-=10000000;
    else if(ocnt===4&&emp===1) sc-=500000;  // was 80000 — MUST block 4-in-a-row
    else if(ocnt===3&&emp===2) sc-=15000;   // was 2000 — block 3-in-a-row harder
    else if(ocnt===2&&emp===3) sc-=300;     // was 120
  }

  // Center column bonus (positional value)
  const center=4;
  for(let r=0;r<ROWS;r++){
    if(b[r][center]===player)   sc+=10;
    if(b[r][center-1]===player||b[r][center+1]===player) sc+=5;
    if(b[r][center-2]===player||b[r][center+2]===player) sc+=2;
  }

  return sc;
}

// ── THREAT COUNTING: detects double-threat forks ──
function countOpenThreats(b, player, minLen) {
  // Count sequences of `minLen` with enough empty space to complete to WIN
  let threats = 0;
  const opp = player===1?2:1;
  const dirs=[[0,1],[1,0],[1,1],[1,-1]];
  for(const[dr,dc]of dirs)for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const w=[];for(let i=0;i<WIN;i++){const nr=r+dr*i,nc=c+dc*i;if(nr<0||nr>=ROWS||nc<0||nc>=COLS)break;w.push(b[nr][nc]);}
    if(w.length!==WIN)continue;
    const cnt=w.filter(x=>x===player).length;
    const emp=w.filter(x=>x===0).length;
    const ocnt=w.filter(x=>x===opp).length;
    if(ocnt===0&&cnt>=minLen)threats++;
  }
  return threats;
}

let jsDeadline = 0;

function minimaxJS(b, depth, alpha, beta, maximizing, aiPlayer) {
  if (Date.now() >= jsDeadline) return 0;
  const winner=getWinnerJS(b);
  if(winner===aiPlayer)return 10000000+depth;
  if(winner!==0)return-10000000-depth;
  if(isFullJS(b)||depth===0){
    const opp2=aiPlayer===1?2:1;
    return evalJS(b,aiPlayer)-evalJS(b,opp2);
  }
  const opp=aiPlayer===1?2:1;

  // Move ordering: prioritize winning/blocking/fork moves
  const curPlayer = maximizing ? aiPlayer : opp;
  const enemy     = maximizing ? opp : aiPlayer;
  const ordered   = [];
  const winMoves=[], blockMoves=[], rest=[];

  for(const col of COL_ORDER){
    const r=getDropRowJS(b,col);if(r<0)continue;
    b[r][col]=curPlayer;
    if(checkWinJS(b,r,col,curPlayer)){b[r][col]=0;winMoves.push(col);continue;}
    b[r][col]=0;
    b[r][col]=enemy;
    if(checkWinJS(b,r,col,enemy)){b[r][col]=0;blockMoves.push(col);continue;}
    b[r][col]=0;
    rest.push(col);
  }
  ordered.push(...winMoves,...blockMoves,...rest);

  if(maximizing){
    let best=-Infinity;
    for(const col of ordered){
      if(Date.now()>=jsDeadline)break;
      const r=getDropRowJS(b,col);
      b[r][col]=aiPlayer;
      const sc=minimaxJS(b,depth-1,alpha,beta,false,aiPlayer);
      b[r][col]=0;
      if(sc>best)best=sc;if(best>alpha)alpha=best;if(beta<=alpha)break;
    }
    return best;
  }else{
    let best=Infinity;
    for(const col of ordered){
      if(Date.now()>=jsDeadline)break;
      const r=getDropRowJS(b,col);
      b[r][col]=opp;
      const sc=minimaxJS(b,depth-1,alpha,beta,true,aiPlayer);
      b[r][col]=0;
      if(sc<best)best=sc;if(best<beta)beta=best;if(beta<=alpha)break;
    }
    return best;
  }
}

function getBestColJS(board, aiPlayer) {
  const opp=aiPlayer===1?2:1;

  // 1. Immediate win
  for(const col of COL_ORDER){const r=getDropRowJS(board,col);if(r<0)continue;board[r][col]=aiPlayer;const w=checkWinJS(board,r,col,aiPlayer);board[r][col]=0;if(w)return col;}
  // 2. Immediate block
  for(const col of COL_ORDER){const r=getDropRowJS(board,col);if(r<0)continue;board[r][col]=opp;const w=checkWinJS(board,r,col,opp);board[r][col]=0;if(w)return col;}

  // 3. Don't give opponent a free win: filter moves that let opponent win immediately
  const safeCols = [];
  for(const col of COL_ORDER){
    const r=getDropRowJS(board,col);if(r<0)continue;
    board[r][col]=aiPlayer;
    // After AI plays col, check if opponent can win anywhere
    let oppCanWin=false;
    for(const col2 of COL_ORDER){
      const r2=getDropRowJS(board,col2);if(r2<0)continue;
      board[r2][col2]=opp;
      if(checkWinJS(board,r2,col2,opp)){oppCanWin=true;board[r2][col2]=0;break;}
      board[r2][col2]=0;
    }
    board[r][col]=0;
    if(!oppCanWin)safeCols.push(col);
  }
  // If all moves let opponent win, fall through to minimax (pick least bad)
  const searchCols = safeCols.length > 0 ? safeCols : [...COL_ORDER].filter(c=>getDropRowJS(board,c)>=0);

  jsDeadline = Date.now() + TIME_LIMIT_MS;
  let bestCol = searchCols[0];

  // Iterative deepening up to depth 14
  for (let depth = 2; depth <= 14; depth++) {
    if (Date.now() >= jsDeadline) break;
    let iterBest=-Infinity, iterCol=bestCol;
    let iterComplete = true;
    for(const col of searchCols){
      if(Date.now()>=jsDeadline){iterComplete=false;break;}
      const r=getDropRowJS(board,col);if(r<0)continue;
      board[r][col]=aiPlayer;
      const sc=minimaxJS(board,depth,-Infinity,Infinity,false,aiPlayer);
      board[r][col]=0;
      if(sc>iterBest){iterBest=sc;iterCol=col;}
      if(iterBest>=10000000)break;
    }
    if(iterComplete||iterBest>=10000000)bestCol=iterCol;
    if(iterBest>=10000000)break;
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
  const t0  = performance.now();

  let col, engine;
  if (wasmReady) {
    col    = getBestColWasm(board, aiPlayer);
    engine = 'wasm';
  } else {
    col    = getBestColJS(board, aiPlayer);
    engine = 'js';
  }

  const ms = Math.round(performance.now() - t0);
  self.postMessage({ col, ms, engine });
};
