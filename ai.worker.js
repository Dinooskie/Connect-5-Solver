/* ── Connect 5 · AI Worker v3 — WASM + JS fallback ── */

const COLS = 9, ROWS = 7, WIN = 5;
const TIME_LIMIT_MS = 700;
const COL_ORDER = [4, 3, 5, 2, 6, 1, 7, 0, 8];

let wasmExports = null;
let wasmReady   = false;

async function loadWasm() {
  try {
    const res    = await fetch('connect5_ai.wasm');
    const bytes  = await res.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes, {
      env: {
        memory:     new WebAssembly.Memory({ initial: 8 }),
        abort:      () => {},
        'Date.now': () => Date.now()
      }
    });
    wasmExports = result.instance.exports;
    wasmExports.initZobrist();
    wasmReady   = true;
    self.postMessage({ type: 'ready', engine: 'wasm' });
  } catch(e) {
    wasmReady = false;
    self.postMessage({ type: 'ready', engine: 'js' });
  }
}

// ── JS Fallback — same logic, time-limited iterative deepening ──
function dropR(b, col) {
  for (let r=ROWS-1;r>=0;r--) if(b[r][col]===0) return r; return -1;
}
function full(b) { return b[0].every(c=>c!==0); }
function cwin(b,row,col,p) {
  const D=[[0,1],[1,0],[1,1],[1,-1]];
  for(const[dr,dc]of D){let n=1;
    for(let s=1;s<WIN;s++){const nr=row+dr*s,nc=col+dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==p)break;n++;}
    for(let s=1;s<WIN;s++){const nr=row-dr*s,nc=col-dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==p)break;n++;}
    if(n>=WIN)return true;
  }return false;
}
function getWinner(b) {
  const D=[[0,1],[1,0],[1,1],[1,-1]];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const p=b[r][c];if(!p)continue;
    for(const[dr,dc]of D){let n=1;
      for(let s=1;s<WIN;s++){const nr=r+dr*s,nc=c+dc*s;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==p)break;n++;}
      if(n>=WIN)return p;
    }
  }return 0;
}

function countThreats(b, p, len) {
  const D=[[0,1],[1,0],[1,1],[1,-1]]; const opp=p===1?2:1; let cnt=0;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)for(const[dr,dc]of D){
    if(r+dr*(WIN-1)<0||r+dr*(WIN-1)>=ROWS||c+dc*(WIN-1)<0||c+dc*(WIN-1)>=COLS)continue;
    let pc=0,ec=0,bl=false;
    for(let s=0;s<WIN;s++){const v=b[r+dr*s][c+dc*s];if(v===p)pc++;else if(v===0)ec++;else{bl=true;break;}}
    if(!bl&&pc===len&&ec===WIN-len)cnt++;
  }return cnt;
}

function evalJS(b, ai) {
  const opp=ai===1?2:1; let sc=0;
  const D=[[0,1],[1,0],[1,1],[1,-1]];
  for(const[dr,dc]of D)for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(r+dr*(WIN-1)<0||r+dr*(WIN-1)>=ROWS||c+dc*(WIN-1)<0||c+dc*(WIN-1)>=COLS)continue;
    let ac=0,oc=0,ec=0;
    for(let s=0;s<WIN;s++){const v=b[r+dr*s][c+dc*s];if(v===ai)ac++;else if(v===opp)oc++;else ec++;}
    if(ac&&oc)continue;
    if(ac===4&&ec===1)sc+=50000;else if(ac===3&&ec===2)sc+=1000;else if(ac===2&&ec===3)sc+=100;
    if(oc===4&&ec===1)sc-=80000;else if(oc===3&&ec===2)sc-=3000;else if(oc===2&&ec===3)sc-=200;
  }
  const o3=countThreats(b,opp,3),o4=countThreats(b,opp,4);
  const a3=countThreats(b,ai,3), a4=countThreats(b,ai,4);
  if(o4>=2)sc-=500000; if(o3>=2)sc-=200000; if(o4>=1&&o3>=1)sc-=300000;
  if(a4>=2)sc+=400000; if(a3>=2)sc+=150000;
  const center=4;
  for(let r=0;r<ROWS;r++){if(b[r][center]===ai)sc+=6;if(b[r][center-1]===ai)sc+=3;if(b[r][center+1]===ai)sc+=3;}
  return sc;
}

function mscore(b,col,ai){
  const opp=ai===1?2:1; const r=dropR(b,col); if(r<0)return-1e9;
  b[r][col]=ai; const w=cwin(b,r,col,ai); b[r][col]=0; if(w)return 1e9;
  b[r][col]=opp;const w2=cwin(b,r,col,opp);b[r][col]=0;if(w2)return 1e9-1;
  return 10-Math.abs(col-4);
}

let jsDeadline=0;
function negamaxJS(b,depth,alpha,beta,p){
  if(Date.now()>=jsDeadline)return 0;
  const w=getWinner(b);
  if(w===p)return 1e7+depth; if(w)return-(1e7+depth);
  if(full(b)||depth===0)return evalJS(b,p);
  const opp=p===1?2:1;
  const cols=COL_ORDER.filter(c=>dropR(b,c)>=0).sort((a,bb)=>mscore(b,bb,p)-mscore(b,a,p));
  let best=-Infinity;
  for(const col of cols){
    if(Date.now()>=jsDeadline)break;
    const r=dropR(b,col); b[r][col]=p;
    const sc=-negamaxJS(b,depth-1,-beta,-alpha,opp);
    b[r][col]=0;
    if(sc>best)best=sc; if(best>alpha)alpha=best; if(alpha>=beta)break;
  }
  return best;
}

function getBestJS(board, ai) {
  const opp=ai===1?2:1;
  for(const c of COL_ORDER){const r=dropR(board,c);if(r<0)continue;board[r][c]=ai;const w=cwin(board,r,c,ai);board[r][c]=0;if(w)return c;}
  for(const c of COL_ORDER){const r=dropR(board,c);if(r<0)continue;board[r][c]=opp;const w=cwin(board,r,c,opp);board[r][c]=0;if(w)return c;}
  jsDeadline=Date.now()+TIME_LIMIT_MS;
  let best=4;
  for(let depth=2;depth<=12&&Date.now()<jsDeadline;depth++){
    let ib=-Infinity,ic=best;
    const cols=COL_ORDER.filter(c=>dropR(board,c)>=0).sort((a,b)=>mscore(board,b,ai)-mscore(board,a,ai));
    for(const col of cols){
      if(Date.now()>=jsDeadline)break;
      const r=dropR(board,col); board[r][col]=ai;
      const sc=-negamaxJS(board,depth-1,-Infinity,-ib,opp);
      board[r][col]=0;
      if(sc>ib){ib=sc;ic=col;}
    }
    if(Date.now()<jsDeadline)best=ic;
  }
  return best;
}

// ── WASM interface ──
function getBestWasm(board, ai) {
  wasmExports.clearBoard();
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)
    wasmExports.setCell(r,c,board[r][c]);
  return wasmExports.getBestMove(ai, TIME_LIMIT_MS);
}

loadWasm();

self.onmessage = function(e) {
  if (e.data.type === 'ping') return; // ignore ping
  const { board, aiPlayer } = e.data;
  const t0 = performance.now();
  const col = wasmReady ? getBestWasm(board, aiPlayer) : getBestJS(board, aiPlayer);
  const ms  = Math.round(performance.now() - t0);
  self.postMessage({ col, ms, engine: wasmReady ? 'wasm' : 'js' });
};
