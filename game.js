const boardEl = document.getElementById('board');
const overlay = document.getElementById('overlay');
const roomData = [
  { title: 'La primera apuesta', type: 'LA APERTURA', subtitle: 'Limpia el tablero. Cada movimiento despierta a una pieza rival.', enemies: [['rook',0,0],['bishop',0,5],['knight',1,2],['pawn',1,4]] },
  { title: 'La mesa se calienta', type: 'DOBLE O NADA', subtitle: 'El crupier sube la apuesta. Piensa dos jugadas por delante.', enemies: [['queen',0,2],['rook',0,5],['knight',1,0],['bishop',1,4],['pawn',2,2],['pawn',2,5]] },
  { title: 'El gran crupier', type: 'LA MANO FINAL', subtitle: 'La casa revela su mano. Una última jugada lo decide todo.', enemies: [['king',0,2],['queen',0,4],['rook',1,0],['bishop',1,5],['knight',2,1],['knight',2,4],['pawn',2,2]] }
];
const symbols = { player:{king:'♔',queen:'♕',rook:'♖',bishop:'♗',knight:'♘',pawn:'♙'}, enemy:{king:'♚',queen:'♛',rook:'♜',bishop:'♝',knight:'♞',pawn:'♟'} };
const names = { king:'Rey',queen:'Dama',rook:'Torre',bishop:'Alfil',knight:'Caballo',pawn:'Peón' };
const value = { pawn:1,knight:3,bishop:3,rook:4,queen:5,king:7 };
const rewardPool = [
  { id:'free', icon:'⚡', title:'Jugada gratis', text:'Tu primer movimiento de cada sala no provoca respuesta del crupier.' },
  { id:'bounty', icon:'✦', title:'Impuesto al crupier', text:'Cada captura te da una ficha extra. La casa paga.' },
  { id:'reinforce', icon:'♙', title:'Refuerzo', text:'Un peón aliado adicional entra en tu escuadrón en cada nueva sala.' },
  { id:'purse', icon:'♣', title:'Bote asegurado', text:'Ganas 3 fichas extra al limpiar cada sala.' }
];
let room = 0, board = [], selected = null, legalMoves = [], turnBusy = false;
let chips = 0, captures = 0, roomCaptures = 0, roomEnemyStart = 0, streak = 0;
let mods = new Set(), freeUsed = false, logLines = [];
let lastMove = null, gameFinished = false;
const makePiece = (side,type,r,c) => ({ side,type,r,c,id:`${side}-${type}-${Math.random().toString(36).slice(2,8)}` });
function startRoom(index) {
  room = index; board = []; selected = null; legalMoves = []; turnBusy = false; lastMove = null; freeUsed = false; roomCaptures = 0; gameFinished = false;
  const allies = [['king',5,2],['queen',5,3],['rook',5,0],['knight',4,1],['bishop',4,4],['pawn',5,5]];
  if (mods.has('reinforce') && index > 0) allies.push(['pawn',5,4]);
  allies.forEach(([type,r,c])=>board.push(makePiece('player',type,r,c)));
  roomData[index].enemies.forEach(([type,r,c])=>board.push(makePiece('enemy',type,r,c)));
  roomEnemyStart = roomData[index].enemies.length;
  logLines = [];
  addLog(index===0 ? 'Las puertas se abren. Haz tu primera jugada.' : 'Nueva sala. La casa mueve después de ti.');
  render();
}
function at(r,c) { return board.find(p=>p.r===r&&p.c===c); }
function inBounds(r,c) { return r>=0&&r<6&&c>=0&&c<6; }
function movesFor(piece) {
  const moves=[]; const own=(r,c)=>inBounds(r,c)&&at(r,c)?.side===piece.side;
  const add=(r,c,ray=false)=>{
    while(inBounds(r,c)) { const occupant=at(r,c); if(!occupant) moves.push({r,c}); else { if(occupant.side!==piece.side)moves.push({r,c,capture:true}); break; }
      if(!ray)break; r+=ray.dr;c+=ray.dc;
    }
  };
  if(piece.type==='pawn') {
    const d=piece.side==='player'?-1:1, nr=piece.r+d;
    if(inBounds(nr,piece.c)&&!at(nr,piece.c)) moves.push({r:nr,c:piece.c});
    for(const dc of [-1,1]) { const target=at(nr,piece.c+dc); if(target&&target.side!==piece.side)moves.push({r:nr,c:piece.c+dc,capture:true}); }
  } else if(piece.type==='knight') {
    for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if(inBounds(piece.r+dr,piece.c+dc)&&!own(piece.r+dr,piece.c+dc)) add(piece.r+dr,piece.c+dc);
  } else if(piece.type==='king') {
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&inBounds(piece.r+dr,piece.c+dc)&&!own(piece.r+dr,piece.c+dc))add(piece.r+dr,piece.c+dc);
  } else {
    const dirs=[];
    if(piece.type==='rook'||piece.type==='queen')dirs.push([1,0],[-1,0],[0,1],[0,-1]);
    if(piece.type==='bishop'||piece.type==='queen')dirs.push([1,1],[1,-1],[-1,1],[-1,-1]);
    dirs.forEach(([dr,dc])=>{let r=piece.r+dr,c=piece.c+dc;while(inBounds(r,c)){const o=at(r,c);if(!o)moves.push({r,c});else{if(o.side!==piece.side)moves.push({r,c,capture:true});break;}r+=dr;c+=dc;}});
  }
  return moves;
}
function render() {
  boardEl.innerHTML='';
  const moveMap=new Map(legalMoves.map(m=>[`${m.r},${m.c}`,m]));
  for(let r=0;r<6;r++)for(let c=0;c<6;c++){
    const cell=document.createElement('button');cell.type='button';cell.className=`cell ${(r+c)%2?'dark':'light'}`;cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',`${String.fromCharCode(97+c)}${6-r}`);
    if(selected?.r===r&&selected?.c===c)cell.classList.add('selected');
    if(lastMove?.some(pos=>pos.r===r&&pos.c===c))cell.classList.add('last-move');
    const possible=moveMap.get(`${r},${c}`);if(possible)cell.classList.add(possible.capture?'capture-legal':'legal');
    const p=at(r,c);if(p){const glyph=document.createElement('span');glyph.className=`piece ${p.side} ${p.type}`;glyph.textContent=symbols[p.side][p.type];cell.appendChild(glyph);cell.setAttribute('aria-label',`${names[p.type]} ${p.side==='player'?'aliado':'enemigo'} en ${String.fromCharCode(97+c)}${6-r}`);}
    cell.addEventListener('click',()=>onCell(r,c));boardEl.appendChild(cell);
  }
  updateHUD();
}
function onCell(r,c) {
  if(turnBusy||gameFinished||overlay.classList.contains('hidden')===false)return;
  const p=at(r,c), move=legalMoves.find(m=>m.r===r&&m.c===c);
  if(selected&&move){performPlayerMove(selected,move);return;}
  if(p?.side==='player'){
    selected={r,c};legalMoves=movesFor(p);document.getElementById('boardHint').textContent=legalMoves.length?'Elige una casilla iluminada':'Esta pieza no tiene jugadas';render();return;
  }
  selected=null;legalMoves=[];document.getElementById('boardHint').textContent='Elige una pieza para ver sus jugadas';render();
}
function performPlayerMove(from,to) {
  const piece=at(from.r,from.c);if(!piece)return;
  const target=at(to.r,to.c);let capturedName='';
  if(target){capturedName=`${names[target.type]} rival`;board=board.filter(p=>p!==target);roomCaptures++;captures++;chips+=1+(mods.has('bounty')?1:0);}
  piece.r=to.r;piece.c=to.c;lastMove=[{r:from.r,c:from.c},{r:to.r,c:to.c}];
  const notation=`${names[piece.type]} ${String.fromCharCode(97+from.c)}${6-from.r} → ${String.fromCharCode(97+to.c)}${6-to.r}`;
  addLog(capturedName?`${notation}. <em>Captura ${capturedName}</em> · +${1+(mods.has('bounty')?1:0)} ficha${mods.has('bounty')?'s':''}.`:notation);
  selected=null;legalMoves=[];turnBusy=true;document.getElementById('boardHint').textContent='El crupier piensa...';render();
  if(!board.some(p=>p.side==='enemy')){turnBusy=false;winRoom();return;}
  const skip=mods.has('free')&&!freeUsed;
  if(skip){freeUsed=true;addLog('Jugada gratis: el crupier pierde su respuesta.');turnBusy=false;document.getElementById('boardHint').textContent='Elige tu siguiente pieza';render();return;}
  window.setTimeout(enemyTurn,350);
}
function enemyTurn() {
  if(gameFinished)return;
  const enemies=board.filter(p=>p.side==='enemy'), options=[];
  enemies.forEach(p=>movesFor(p).forEach(m=>options.push({piece:p,move:m})));
  if(!options.length){addLog('El crupier no encuentra una jugada.');turnBusy=false;render();return;}
  const allies=board.filter(p=>p.side==='player');
  options.forEach(o=>{
    const target=at(o.move.r,o.move.c);
    if(target){o.score=100+value[target.type]*5+(target.type==='king'?100:0);}
    else {const nearest=Math.min(...allies.map(a=>Math.abs(a.r-o.move.r)+Math.abs(a.c-o.move.c)));o.score=4-nearest*.35+Math.random()*1.5+(o.piece.type==='pawn'?Math.random()*.4:0);}
  });
  options.sort((a,b)=>b.score-a.score);
  const bestScore=options[0].score, pool=options.filter(o=>o.score>=bestScore-1.6);
  const choice=pool[Math.floor(Math.random()*pool.length)], {piece,move}=choice;
  const target=at(move.r,move.c);
  if(target){
    board=board.filter(p=>p!==target);addLog(`El crupier captura tu ${names[target.type].toLowerCase()} en ${String.fromCharCode(97+move.c)}${6-move.r}.`);
    if(target.type==='king'){piece.r=move.r;piece.c=move.c;turnBusy=false;render();loseRun();return;}
  } else addLog(`El crupier mueve ${names[piece.type].toLowerCase()} a ${String.fromCharCode(97+move.c)}${6-move.r}.`);
  const from={r:piece.r,c:piece.c};piece.r=move.r;piece.c=move.c;lastMove=[from,{r:move.r,c:move.c}];turnBusy=false;selected=null;legalMoves=[];document.getElementById('boardHint').textContent='Elige una pieza para ver sus jugadas';render();
}
function updateHUD() {
  const enemies=board.filter(p=>p.side==='enemy'), allies=board.filter(p=>p.side==='player');
  document.getElementById('roomLabel').innerHTML=`${String(room+1).padStart(2,'0')} <small>/ 03</small>`;
  document.getElementById('chipCount').textContent=String(chips).padStart(2,'0');
  document.getElementById('streakLabel').innerHTML=`${streak} <small>victorias</small>`;
  document.getElementById('roomTitle').textContent=roomData[room].title;
  document.getElementById('roomType').textContent=roomData[room].type;
  document.getElementById('roomSubtitle').textContent=roomData[room].subtitle;
  document.getElementById('roundNumber').textContent=String(room+1).padStart(2,'0');
  document.getElementById('enemyCount').textContent=enemies.length;
  document.getElementById('allyCount').innerHTML=`${allies.length} <small>piezas</small>`;
  document.getElementById('progressText').textContent=`${roomEnemyStart-enemies.length} / ${roomEnemyStart}`;
  document.getElementById('progressFill').style.width=`${((roomEnemyStart-enemies.length)/roomEnemyStart)*100}%`;
  document.getElementById('turnIndicator').innerHTML=turnBusy?'<i></i> TURNO DEL CRUPIER':'<i></i> TU TURNO';
  document.getElementById('turnIndicator').classList.toggle('enemy-turn',turnBusy);
  const order=['king','queen','rook','bishop','knight','pawn'];
  document.getElementById('squadList').innerHTML=order.map(type=>{
    const units=board.filter(p=>p.side==='player'&&p.type===type);const total=(type==='pawn'&&mods.has('reinforce')&&room>0)?2:1;
    return Array.from({length:Math.max(total,units.length)},(_,i)=>{const unit=units[i];return `<div class="squad-unit ${unit?'':'dead'} ${unit&&selected?.r===unit.r&&selected?.c===unit.c?'active':''}"><span class="mini-piece">${symbols.player[type]}</span><span>${names[type]}</span><span class="unit-state">${unit?'EN MESA':'FUERA'}</span></div>`;}).join('');
  }).join('');
  document.getElementById('battleLog').innerHTML=logLines.slice(-6).map(item=>`<div class="log-entry"><span class="log-time">${item.n}</span><span>${item.text}</span></div>`).join('');
}
function addLog(text) {logLines.push({n:String(logLines.length+1).padStart(2,'0'),text});if(logLines.length>12)logLines.shift();}
function winRoom() {
  gameFinished=true;turnBusy=true;streak++;chips+=2+(mods.has('purse')?3:0);render();
  if(room===2){
    showModal('♛','LA CASA HA CAÍDO','¡Jaque mate al casino!',`<p>Has conquistado las tres mesas y te llevas <strong>${chips} fichas</strong>.</p><p>Capturaste <strong>${captures} piezas</strong> y sobreviviste a la mano final. El rey eres tú.</p>`,[{label:'Volver a jugar',run:()=>resetGame()}]);
  } else {
    const available=rewardPool.filter(r=>!mods.has(r.id));const shuffled=available.sort(()=>Math.random()-.5).slice(0,3);
    const cards=shuffled.map(r=>`<button class="reward-card" data-reward="${r.id}"><span class="reward-icon">${r.icon}</span><h3>${r.title}</h3><p>${r.text}</p><span class="select-label">ELEGIR VENTAJA ↗</span></button>`).join('');
    showModal('✦','SALA LIMPIA',`+${2+(mods.has('purse')?3:0)} FICHAS · ELIGE UNA VENTAJA`,`<p>La mesa es tuya. Tu botín sube a <strong>${chips} fichas</strong>.</p><p>Escoge una carta para la siguiente sala:</p><div class="reward-grid">${cards}</div>`,[]);
    overlay.querySelectorAll('[data-reward]').forEach(button=>button.addEventListener('click',()=>chooseReward(button.dataset.reward)));
  }
}
function chooseReward(id) {
  mods.add(id);const reward=rewardPool.find(r=>r.id===id);streak=room+1;
  if(room+1<3){startRoom(room+1);hideModal();addLog(`Ventaja adquirida: ${reward.title}.`);render();}
}
function loseRun() {
  gameFinished=true;selected=null;legalMoves=[];
  showModal('♚','FIN DE LA PARTIDA','La casa cobra su deuda',`<p>Tu rey ha caído en la sala <strong>${String(room+1).padStart(2,'0')}</strong>.</p><p>Te llevas <strong>${chips} fichas</strong> y una lección para la próxima mano.</p>`,[{label:'Volver a intentarlo',run:()=>resetGame()}]);
}
function showModal(icon,kicker,title,body,actions) {
  document.getElementById('modalIcon').textContent=icon;document.getElementById('modalKicker').textContent=kicker;document.getElementById('overlayTitle').textContent=title;document.getElementById('modalBody').innerHTML=body;
  const actionsEl=document.getElementById('modalActions');actionsEl.innerHTML='';actions.forEach((action,i)=>{const button=document.createElement('button');button.className=`action-button ${i?'secondary':''}`;button.textContent=action.label;button.onclick=action.run;actionsEl.appendChild(button);});
  document.getElementById('closeModal').style.display=actions.length?'block':'none';overlay.classList.remove('hidden');
}
function hideModal(){overlay.classList.add('hidden');}
function resetGame(){chips=0;captures=0;roomCaptures=0;streak=0;mods=new Set();logLines=[];hideModal();startRoom(0);}
document.getElementById('rulesButton').addEventListener('click',()=>showModal('♘','REGLAS DE LA CASA','Ajedrez. Apuesta. Sobrevive.','<p><strong>1.</strong> Selecciona una pieza blanca y luego una casilla iluminada para mover.</p><p><strong>2.</strong> Cada movimiento permite una respuesta del crupier. Captura sus piezas y protege a tu rey.</p><p><strong>3.</strong> Limpia las tres salas. Tras cada victoria, elige una ventaja permanente.</p><p><strong>Movimientos:</strong> las piezas se mueven como en ajedrez; los peones avanzan hacia arriba y capturan en diagonal. No hay jaque ni enroque.</p>',[{label:'A jugar',run:hideModal}]));
document.getElementById('closeModal').addEventListener('click',hideModal);
document.getElementById('restartButton').addEventListener('click',()=>showModal('↻','NUEVA MANO','¿Reiniciar la partida?','<p>Tu progreso, ventajas y fichas se perderán. ¿Quieres barajar de nuevo?</p>',[{label:'Seguir jugando',run:hideModal},{label:'Reiniciar',run:resetGame}]));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!gameFinished)hideModal();});
startRoom(0);
