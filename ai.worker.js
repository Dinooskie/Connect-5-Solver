/* ── Connect 5 · AI Worker — WASM + Iterative Deepening + Time Limit ── */

const COLS = 9, ROWS = 7, WIN = 5;
const TIME_LIMIT_MS = 700; // hard cap: AI harus selesai dalam 700ms
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

// ── JS Fallback (same algorithm, time-limited) ──
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
function evalJS(b, player) {
  let sc=0; const opp=player===1?2:1;
  const dirs=[[0,1],[1,0],[1,1],[1,-1]];
  for(const[dr,dc]of dirs)for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const w=[];for(let i=0;i<WIN;i++){const nr=r+dr*i,nc=c+dc*i;if(nr<0||nr>=ROWS||nc<0||nc>=COLS)break;w.push(b[nr][nc]);}
    if(w.length!==WIN)continue;
    const cnt=w.filter(x=>x===player).length,emp=w.filter(x=>x===0).length,ocnt=w.filter(x=>x===opp).length;
    if(cnt&&ocnt)continue; // mixed window, skip
    if(cnt===5)sc+=1000000;
    else if(cnt===4&&emp===1)sc+=50000;  // raised: near-win is critical
    else if(cnt===3&&emp===2)sc+=1000;
    else if(cnt===2&&emp===3)sc+=100;
    if(ocnt===5)sc-=1000000;
    else if(ocnt===4&&emp===1)sc-=80000; // raised: must block opponent 4-in-a-row
    else if(ocnt===3&&emp===2)sc-=2000;  // raised: block opponent 3-in-a-row more urgently
    else if(ocnt===2&&emp===3)sc-=120;
  }
  const center=4;
  for(let r=0;r<ROWS;r++){
    if(b[r][center]===player)sc+=6;
    if(b[r][center-1]===player||b[r][center+1]===player)sc+=3;
    if(b[r][center-2]===player||b[r][center+2]===player)sc+=1;
  }
  return sc;
}

let jsDeadline = 0;
function minimaxJS(b, depth, alpha, beta, maximizing, aiPlayer) {
  if (Date.now() >= jsDeadline) return 0;
  const winner=getWinnerJS(b);
  if(winner===aiPlayer)return 1000000+depth;
  if(winner!==0)return-1000000-depth;
  if(isFullJS(b)||depth===0){const opp2=aiPlayer===1?2:1;return evalJS(b,aiPlayer)-evalJS(b,opp2);}
  const opp=aiPlayer===1?2:1;

  // Move ordering: prioritize winning/blocking moves for better alpha-beta pruning
  const curPlayer = maximizing ? aiPlayer : opp;
  const enemy     = maximizing ? opp : aiPlayer;
  const ordered   = [];
  for(const col of COL_ORDER){
    const r=getDropRowJS(b,col);if(r<0)continue;
    b[r][col]=curPlayer;const isWin=checkWinJS(b,r,col,curPlayer);b[r][col]=0;
    if(isWin){ordered.unshift(col);continue;}
    b[r][col]=enemy;const isBlock=checkWinJS(b,r,col,enemy);b[r][col]=0;
    if(isBlock){ordered.splice(1,0,col);continue;}
    ordered.push(col);
  }

  if(maximizing){
    let best=-Infinity;
    for(const col of ordered){
      if(Date.now()>=jsDeadline)break;
      const r=getDropRowJS(b,col);
      b[r][col]=aiPlayer;const sc=minimaxJS(b,depth-1,alpha,beta,false,aiPlayer);b[r][col]=0;
      if(sc>best)best=sc;if(best>alpha)alpha=best;if(beta<=alpha)break;
    }
    return best;
  }else{
    let best=Infinity;
    for(const col of ordered){
      if(Date.now()>=jsDeadline)break;
      const r=getDropRowJS(b,col);
      b[r][col]=opp;const sc=minimaxJS(b,depth-1,alpha,beta,true,aiPlayer);b[r][col]=0;
      if(sc<best)best=sc;if(best<beta)beta=best;if(beta<=alpha)break;
    }
    return best;
  }
}

function getBestColJS(board, aiPlayer) {
  const opp=aiPlayer===1?2:1;

  // Immediate win
  for(const col of COL_ORDER){const r=getDropRowJS(board,col);if(r<0)continue;board[r][col]=aiPlayer;const w=checkWinJS(board,r,col,aiPlayer);board[r][col]=0;if(w)return col;}
  // Immediate block
  for(const col of COL_ORDER){const r=getDropRowJS(board,col);if(r<0)continue;board[r][col]=opp;const w=checkWinJS(board,r,col,opp);board[r][col]=0;if(w)return col;}

  // Check for double-threat (opponent has 2+ ways to win next turn)
  let oppWinCount=0, oppWinCol=-1;
  for(const col of COL_ORDER){const r=getDropRowJS(board,col);if(r<0)continue;board[r][col]=opp;const w=checkWinJS(board,r,col,opp);board[r][col]=0;if(w){oppWinCount++;oppWinCol=col;}}
  // If opponent has multiple winning moves, we can only try to block one - pick best eval
  // (handled by minimax, just fall through)

  jsDeadline = Date.now() + TIME_LIMIT_MS;
  let bestCol = COL_ORDER[0]; // default center

  // Iterative deepening: always commit completed iteration result
  for (let depth = 2; depth <= 12; depth++) {
    if (Date.now() >= jsDeadline) break;
    let iterBest=-Infinity, iterCol=bestCol;
    let iterComplete = true;
    for(const col of COL_ORDER){
      if(Date.now()>=jsDeadline){iterComplete=false;break;}
      const r=getDropRowJS(board,col);if(r<0)continue;
      board[r][col]=aiPlayer;
      const sc=minimaxJS(board,depth,-Infinity,Infinity,false,aiPlayer);
      board[r][col]=0;
      if(sc>iterBest){iterBest=sc;iterCol=col;}
      // Winning move found at this depth, no need to continue
      if(iterBest>=1000000)break;
    }
    // Only update bestCol if the entire iteration completed (or a winning move found)
    if(iterComplete || iterBest>=1000000)bestCol=iterCol;
    // If we found a winning move, no need to search deeper
    if(iterBest>=1000000)break;
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
