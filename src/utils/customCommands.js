// ═══════════════════════════════════════════════════════════════════════
// CUSTOM COMMANDS – VISUAL NODE EDITOR
// ═══════════════════════════════════════════════════════════════════════

const CC = {
  gid: null, commands: [], cmd: null, selectedNodeId: null, view: 'list',
  pan: { x: 60, y: 60 }, zoom: 1,
  dragging: null, connecting: null, panning: null,
};

const BLOCK_DEFS = {
  actions: [
    { type:'reply_text',     icon:'💬', label:'Text Reply',         desc:'Antwortet mit Text',            color:'#1e6eb5' },
    { type:'reply_embed',    icon:'🎨', label:'Embed Reply',         desc:'Antwortet mit Embed',           color:'#1e6eb5' },
    { type:'random_response',icon:'🎲', label:'Random Reply',        desc:'Zufällige Antwort',             color:'#1e6eb5' },
    { type:'send_message',   icon:'📤', label:'Send to Channel',     desc:'Nachricht an Kanal',            color:'#1e6eb5' },
    { type:'dm',             icon:'📩', label:'Direct Message',      desc:'DM an User',                   color:'#1e6eb5' },
    { type:'add_role',       icon:'🟢', label:'Add Role',            desc:'Rolle hinzufügen',             color:'#1e6eb5' },
    { type:'remove_role',    icon:'🔴', label:'Remove Role',         desc:'Rolle entfernen',              color:'#1e6eb5' },
    { type:'kick',           icon:'👢', label:'Kick Member',         desc:'User kicken',                  color:'#c0392b' },
    { type:'ban',            icon:'🔨', label:'Ban Member',          desc:'User bannen',                  color:'#c0392b' },
    { type:'timeout',        icon:'🔇', label:'Timeout',             desc:'User timeoutet',               color:'#c0392b' },
    { type:'set_nick',       icon:'✏️',  label:'Set Nickname',        desc:'Nickname ändern',              color:'#1e6eb5' },
    { type:'delete_message', icon:'🗑️',  label:'Delete Message',      desc:'Nachricht löschen',            color:'#c0392b' },
    { type:'wait',           icon:'⏳', label:'Wait',                desc:'Warten',                       color:'#5a3e8e' },
    { type:'set_var',        icon:'📦', label:'Set Variable',        desc:'Variable setzen',              color:'#5a3e8e' },
    { type:'set_status',     icon:'🎮', label:'Set Status',          desc:'Bot-Status ändern',            color:'#5a3e8e' },
    { type:'react',          icon:'🔔', label:'React',               desc:'Reaktion hinzufügen',          color:'#1e6eb5' },
  ],
  conditions: [
    { type:'condition_role',       icon:'🛡️', label:'Role Condition',       desc:'User hat/hat nicht Rolle',     color:'#1e7e5a' },
    { type:'condition_channel',    icon:'#️⃣', label:'Channel Condition',    desc:'In bestimmtem Kanal',          color:'#1e7e5a' },
    { type:'condition_permission', icon:'🔑', label:'Permission',           desc:'User hat Berechtigung',        color:'#1e7e5a' },
    { type:'condition_chance',     icon:'🎰', label:'Chance',               desc:'Zufällige Wahrscheinlichkeit', color:'#1e7e5a' },
    { type:'condition_compare',    icon:'⚖️', label:'Compare',              desc:'Zwei Werte vergleichen',       color:'#1e7e5a' },
    { type:'condition_user',       icon:'👤', label:'User Check',           desc:'Bestimmter User',              color:'#1e7e5a' },
  ],
  options: [
    { type:'opt_text',    icon:'T',  label:'Text Option',    desc:'Text-Eingabe',    color:'#7b0ea8' },
    { type:'opt_number',  icon:'#',  label:'Number Option',  desc:'Zahlen-Eingabe',  color:'#7b0ea8' },
    { type:'opt_user',    icon:'👤', label:'User Option',    desc:'User-Auswahl',    color:'#7b0ea8' },
    { type:'opt_channel', icon:'#️⃣', label:'Channel Option', desc:'Channel-Auswahl', color:'#7b0ea8' },
    { type:'opt_role',    icon:'🛡️', label:'Role Option',    desc:'Rollen-Auswahl',  color:'#7b0ea8' },
    { type:'opt_boolean', icon:'✓',  label:'Boolean Option', desc:'Ja/Nein',          color:'#7b0ea8' },
  ],
};

function isCondition(t){ return t?.startsWith('condition_'); }
function getDef(t){ return [...BLOCK_DEFS.actions,...BLOCK_DEFS.conditions,...BLOCK_DEFS.options].find(d=>d.type===t); }
function uuid(){ return Math.random().toString(36).slice(2,10); }

async function loadCC(){
  CC.gid=firstGuild(); if(!CC.gid)return;
  await loadGuildData(CC.gid);
  CC.commands=await api(`/api/customcommands/${CC.gid}`).catch(()=>[]);
  renderCCList();
}

function renderCCList(){
  CC.view='list';
  document.getElementById('cc-list-view').style.display='block';
  document.getElementById('cc-editor-view').style.display='none';
  const el=document.getElementById('cc-list-content');
  document.getElementById('cc-count').textContent=`${CC.commands.length} Commands`;
  if(!CC.commands.length){el.innerHTML='<div class="empty">Noch keine Commands. Erstell deinen ersten!</div>';return;}
  const rows=CC.commands.map(cmd=>{
    const icon=cmd.type==='slash'?'/':'💬';
    const n=(cmd.nodes||[]).filter(n=>n.kind!=='trigger').length;
    return `<tr>
      <td><strong>${icon} ${cmd.name}</strong>${cmd.description?`<div style="font-size:.78rem;color:var(--muted)">${cmd.description}</div>`:''}</td>
      <td style="color:var(--muted)">${n} Block${n!==1?'s':''}</td>
      <td><label class="toggle"><input type="checkbox" ${cmd.enabled!==false?'checked':''} data-id="${cmd.id}" onchange="ccToggle(this)"><span class="slider"></span></label></td>
      <td><div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" data-id="${cmd.id}" onclick="ccEdit(this.dataset.id)">✏️ Bearbeiten</button>
        <button class="btn btn-danger btn-sm" data-id="${cmd.id}" onclick="ccDelete(this.dataset.id)">✕</button>
      </div></td></tr>`;
  }).join('');
  el.innerHTML=`<div class="section" style="padding:0;overflow:hidden"><table>
    <tr><th>Command</th><th>Blöcke</th><th>Aktiv</th><th></th></tr>${rows}</table></div>`;
}

async function ccToggle(el){await api(`/api/customcommands/${CC.gid}/${el.dataset.id}/toggle`,{method:'PATCH'});const c=CC.commands.find(c=>c.id===el.dataset.id);if(c)c.enabled=el.checked;}
async function ccDelete(id){if(!confirm('Command löschen?'))return;await api(`/api/customcommands/${CC.gid}/${id}`,{method:'DELETE'});CC.commands=CC.commands.filter(c=>c.id!==id);renderCCList();}

function ccNew(){
  CC.cmd={id:null,name:'',description:'',type:'slash',textTriggerMode:'contains',options:[],cooldown:0,enabled:true,
    nodes:[{id:uuid(),kind:'trigger',type:'slash',x:300,y:60,config:{},buttons:[],selects:[]}],edges:[]};
  CC.selectedNodeId=null; CC.pan={x:60,y:60}; CC.zoom=1;
  openEditor();
}
function ccEdit(id){
  const cmd=CC.commands.find(c=>c.id===id); if(!cmd)return;
  CC.cmd=JSON.parse(JSON.stringify(cmd));
  if(!CC.cmd.nodes?.length){CC.cmd.nodes=[{id:uuid(),kind:'trigger',type:'slash',x:300,y:60,config:{},buttons:[],selects:[]}];CC.cmd.edges=[];}
  CC.selectedNodeId=null; CC.pan={x:60,y:60}; CC.zoom=1;
  openEditor();
}

function openEditor(){
  CC.view='editor';
  document.getElementById('cc-list-view').style.display='none';
  const ev=document.getElementById('cc-editor-view');
  ev.style.display='block';
  ev.innerHTML=`
  <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-wrap:wrap;gap:8px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="ccCancelEdit()">← Zurück</button>
      <button class="btn ${CC.cmd.type==='slash'?'btn-primary':'btn-ghost'} btn-sm" onclick="ccSetType('slash')">/ Slash</button>
      <button class="btn ${CC.cmd.type==='text'?'btn-primary':'btn-ghost'} btn-sm" onclick="ccSetType('text')">💬 Text</button>
      <input type="text" id="cc-cmd-name" placeholder="${CC.cmd.type==='slash'?'commandname':'trigger'}" value="${CC.cmd.name}" style="width:140px" oninput="CC.cmd.name=this.value">
      ${CC.cmd.type==='slash'?`<input type="text" placeholder="Beschreibung..." value="${CC.cmd.description||''}" style="width:200px" oninput="CC.cmd.description=this.value">`:''}
      ${CC.cmd.type==='text'?`<select onchange="CC.cmd.textTriggerMode=this.value"><option value="contains">contains</option><option value="startswith">starts with</option><option value="exact">exact</option></select>`:''}
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <span style="color:var(--muted);font-size:.75rem">Scroll=Zoom • Alt+Drag=Pan • Klick=Config</span>
      <button class="btn btn-primary" onclick="ccSave()">💾 Speichern</button>
    </div>
  </div>
  <div style="display:flex;height:calc(100vh - 200px)">
    <div id="cc-palette" style="width:230px;background:var(--surface);border-right:1px solid var(--border);overflow-y:auto;flex-shrink:0">
      <div style="display:flex;border-bottom:1px solid var(--border)">
        <button class="cc-ptab active" onclick="ccTab('actions',this)">Aktionen</button>
        <button class="cc-ptab" onclick="ccTab('conditions',this)">Konditionen</button>
        ${CC.cmd.type==='slash'?'<button class="cc-ptab" onclick="ccTab(\'options\',this)">Optionen</button>':''}
      </div>
      <div id="cc-palette-items"></div>
    </div>
    <div id="cc-canvas-wrap" style="flex:1;overflow:hidden;position:relative;background:#0d0e11"
      onmousedown="ccMD(event)" onmousemove="ccMM(event)" onmouseup="ccMU(event)"
      onwheel="ccWheel(event)" oncontextmenu="return false">
      <svg id="cc-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible">
        <g id="cc-edges"></g><g id="cc-temp-line"></g>
      </svg>
      <div id="cc-nodes" style="position:absolute;top:0;left:0;transform-origin:0 0"></div>
    </div>
    <div id="cc-cfg" style="width:290px;background:var(--surface);border-left:1px solid var(--border);overflow-y:auto;flex-shrink:0;display:none;padding:16px"></div>
  </div>`;

  if(!document.getElementById('cc-sty')){
    const s=document.createElement('style');s.id='cc-sty';
    s.textContent=`.cc-ptab{flex:1;padding:9px 4px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;border-bottom:2px solid transparent}.cc-ptab.active{color:var(--text);border-bottom-color:var(--accent)}.cc-ptab:hover{color:var(--text)}.cc-bi{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border)}.cc-bi:hover{background:var(--surface2)}.cc-bic{width:30px;height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:.95rem;flex-shrink:0}.ccn{position:absolute;min-width:190px;max-width:250px;border-radius:9px;background:#1a1c22;border:1px solid #2a2d38;box-shadow:0 4px 18px rgba(0,0,0,.4);cursor:grab;user-select:none}.ccn:hover{box-shadow:0 4px 24px rgba(0,0,0,.6)}.ccn.sel{border-color:var(--accent);box-shadow:0 0 0 2px rgba(88,101,242,.25)}.ccnh{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:8px 8px 0 0}.ccnb{padding:6px 10px 8px;font-size:.75rem;color:var(--muted);min-height:18px}.ccport{position:absolute;width:12px;height:12px;border-radius:50%;border:2px solid #fff;cursor:crosshair;z-index:10}.ccport:hover{transform:scale(1.5)}.port-in{top:-6px;left:50%;transform:translateX(-50%);background:#555}.port-out{bottom:-6px;background:#5865f2}.port-then{bottom:-6px;background:#3ba55c}.port-else{bottom:-6px;background:#ed4245}.port-btn{bottom:-6px;background:#f1c40f}.port-sel{bottom:-6px;background:#e67e22}.cc-x{background:none;border:none;color:#666;cursor:pointer;padding:2px 5px;border-radius:3px;margin-left:auto}.cc-x:hover{color:#ed4245}`;
    document.head.appendChild(s);
  }
  ccTab('actions',document.querySelector('.cc-ptab'));
  renderCanvas();
}

function ccSetType(t){CC.cmd.type=t;const tr=CC.cmd.nodes.find(n=>n.kind==='trigger');if(tr)tr.type=t;openEditor();}
function ccCancelEdit(){CC.view='list';document.getElementById('cc-list-view').style.display='block';document.getElementById('cc-editor-view').style.display='none';}

function ccTab(tab,el){
  document.querySelectorAll('.cc-ptab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  document.getElementById('cc-palette-items').innerHTML=(BLOCK_DEFS[tab]||[]).map(d=>`
    <div class="cc-bi" onclick="ccAddNode('${d.type}')">
      <div class="cc-bic" style="background:${d.color}22;color:${d.color}">${d.icon}</div>
      <div><div style="font-size:.82rem;font-weight:500">${d.label}</div><div style="font-size:.72rem;color:var(--muted)">${d.desc}</div></div>
    </div>`).join('');
}

function ccAddNode(type){
  if(type.startsWith('opt_')){
    const tr=CC.cmd.nodes.find(n=>n.kind==='trigger');
    if(tr){CC.cmd.options=CC.cmd.options||[];CC.cmd.options.push({id:uuid(),name:`opt${CC.cmd.options.length+1}`,type:type.replace('opt_',''),description:'',required:false});selectCCNode(tr.id);renderCanvas();}
    return;
  }
  const wrap=document.getElementById('cc-canvas-wrap');
  const cx=wrap?(wrap.offsetWidth/2-CC.pan.x)/CC.zoom:300;
  const cy=wrap?(wrap.offsetHeight/2-CC.pan.y)/CC.zoom:200;
  const node={id:uuid(),kind:isCondition(type)?'condition':'action',type,x:cx-100,y:cy-40,config:{},buttons:[],selects:[]};
  CC.cmd.nodes.push(node);
  renderCanvas();selectCCNode(node.id);
}

function deleteCCNode(id){
  CC.cmd.nodes=CC.cmd.nodes.filter(n=>n.id!==id);
  CC.cmd.edges=CC.cmd.edges.filter(e=>e.fromNodeId!==id&&e.toNodeId!==id);
  if(CC.selectedNodeId===id){CC.selectedNodeId=null;document.getElementById('cc-cfg').style.display='none';}
  renderCanvas();
}

function selectCCNode(id){
  CC.selectedNodeId=id;renderCanvas();renderCCCfg(id);
}

function getPortPos(node,port){
  const W=210;
  if(port==='in')   return{x:node.x+W/2,y:node.y};
  if(port==='out')  return{x:node.x+W/2,y:node.y+88};
  if(port==='then') return{x:node.x+W*0.3,y:node.y+88};
  if(port==='else') return{x:node.x+W*0.7,y:node.y+88};
  if(port?.startsWith('btn_')){const i=parseInt(port.split('_')[1]),t=node.buttons?.length||1,p=t>1?(0.2+i*(0.6/(t-1))):0.5;return{x:node.x+W*p,y:node.y+88};}
  if(port?.startsWith('sel_')){const i=parseInt(port.split('_')[1]),t=node.selects?.length||1,p=t>1?(0.15+i*(0.7/(t-1))):0.5;return{x:node.x+W*p,y:node.y+88};}
  return{x:node.x+W/2,y:node.y+44};
}

function bz(x1,y1,x2,y2){const d=Math.max(Math.abs(y2-y1)*0.5,50);return`M${x1} ${y1} C${x1} ${y1+d} ${x2} ${y2-d} ${x2} ${y2}`;}

function renderCanvas(){
  const nodesEl=document.getElementById('cc-nodes');
  const edgesEl=document.getElementById('cc-edges');
  if(!nodesEl||!edgesEl)return;
  const tr=`translate(${CC.pan.x}px,${CC.pan.y}px) scale(${CC.zoom})`;
  nodesEl.style.transform=tr;
  document.getElementById('cc-edges').parentElement.setAttribute('transform',`translate(${CC.pan.x},${CC.pan.y}) scale(${CC.zoom})`);
  document.getElementById('cc-temp-line').parentElement.setAttribute('transform',`translate(${CC.pan.x},${CC.pan.y}) scale(${CC.zoom})`);

  nodesEl.innerHTML=CC.cmd.nodes.map(n=>renderCCNode(n)).join('');
  edgesEl.innerHTML=CC.cmd.edges.map(e=>{
    const fn=CC.cmd.nodes.find(n=>n.id===e.fromNodeId);
    const tn=CC.cmd.nodes.find(n=>n.id===e.toNodeId);
    if(!fn||!tn)return'';
    const fp=getPortPos(fn,e.fromPort),tp=getPortPos(tn,'in');
    const col={out:'#5865f2',then:'#3ba55c',else:'#ed4245'}[e.fromPort]||(e.fromPort?.startsWith('btn_')?'#f1c40f':e.fromPort?.startsWith('sel_')?'#e67e22':'#5865f2');
    return`<path d="${bz(fp.x,fp.y,tp.x,tp.y)}" fill="none" stroke="${col}" stroke-width="2" style="cursor:pointer" onclick="if(confirm('Verbindung löschen?')){CC.cmd.edges=CC.cmd.edges.filter(x=>x.id!=='${e.id}');renderCanvas()}"/>`;
  }).join('');
}

function renderCCNode(node){
  const def=getDef(node.type)||{icon:'?',label:node.type,color:'#5865f2'};
  const sel=CC.selectedNodeId===node.id;
  const isTr=node.kind==='trigger',isCo=node.kind==='condition';
  const W=210;

  const inP=!isTr?`<div class="ccport port-in" data-nid="${node.id}" data-port="in" onmousedown="ccPMD(event,'${node.id}','in')"></div>`:'';
  let outP='';
  if(isCo){
    outP=`<div class="ccport port-then" style="left:30%;transform:translateX(-50%)" data-nid="${node.id}" data-port="then" onmousedown="ccPMD(event,'${node.id}','then')"></div>
          <div class="ccport port-else" style="left:70%;transform:translateX(-50%)" data-nid="${node.id}" data-port="else" onmousedown="ccPMD(event,'${node.id}','else')"></div>`;
  } else {
    outP=`<div class="ccport port-out" style="left:50%;transform:translateX(-50%)" data-nid="${node.id}" data-port="out" onmousedown="ccPMD(event,'${node.id}','out')"></div>`;
    (node.buttons||[]).forEach((b,i)=>{const p=node.buttons.length>1?20+i*(60/(node.buttons.length-1)):50;outP+=`<div class="ccport port-btn" style="left:${p}%;transform:translateX(-50%)" title="Btn: ${b.label||i}" data-nid="${node.id}" data-port="btn_${i}" onmousedown="ccPMD(event,'${node.id}','btn_${i}')"></div>`;});
    (node.selects||[]).forEach((s,i)=>{const p=node.selects.length>1?15+i*(70/(node.selects.length-1)):50;outP+=`<div class="ccport port-sel" style="left:${p}%;transform:translateX(-50%)" title="Sel: ${s.label||i}" data-nid="${node.id}" data-port="sel_${i}" onmousedown="ccPMD(event,'${node.id}','sel_${i}')"></div>`;});
  }

  const label=isTr?(node.type==='slash'?`/${CC.cmd.name||'cmd'}`:node.type==='text'?`💬 "${CC.cmd.name||'trigger'}"`:def.label):def.label;
  const summary=getCCNodeSummary(node);

  return`<div class="ccn${sel?' sel':''}" id="ccn_${node.id}" style="left:${node.x}px;top:${node.y}px;${isTr?'border-color:#d4a017':''};"
    onmousedown="ccNMD(event,'${node.id}')" onclick="selectCCNode('${node.id}')">
    ${inP}
    <div class="ccnh" style="background:${def.color}33">
      <span>${def.icon}</span>
      <span style="font-size:.83rem;font-weight:600;color:#e3e5e8;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
      ${!isTr?`<button class="cc-x" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();deleteCCNode('${node.id}')">✕</button>`:''}
    </div>
    <div class="ccnb">${summary}</div>
    ${isCo?`<div style="display:flex;justify-content:space-around;padding:0 10px 6px;font-size:.7rem"><span style="color:#3ba55c">✅ Then</span><span style="color:#ed4245">❌ Else</span></div>`:''}
    <div style="position:relative;height:10px">${outP}</div>
  </div>`;
}

function getCCNodeSummary(node){
  const c=node.config||{};
  if(node.kind==='trigger'){const opts=CC.cmd.options||[];return opts.length?opts.map(o=>`<span style="background:#7b0ea822;color:#c77dff;border-radius:3px;padding:1px 4px;font-size:.72rem;margin-right:2px">${o.name}:${o.type}</span>`).join(''):'Keine Optionen';}
  if(node.kind==='condition'){const t=node.type.replace('condition_','');if(t==='role'){const r=(roleCache[CC.gid]||[]).find(r=>r.id===c.roleId);return r?`@${r.name}`:'Rolle wählen';}if(t==='chance')return`${c.percent||50}%`;if(t==='compare')return`${(c.valueA||'?').slice(0,15)} ${c.operator||'=='} ${(c.valueB||'?').slice(0,15)}`;return t;}
  if(c.content)return`<span style="color:#999">${c.content.slice(0,45)}</span>`;
  if(c.embed?.title)return`<span style="color:#999">${c.embed.title.slice(0,45)}</span>`;
  if(node.type==='add_role'||node.type==='remove_role'){const r=(roleCache[CC.gid]||[]).find(r=>r.id===c.roleId);return r?`@${r.name}`:'Rolle wählen';}
  if(node.type==='wait')return`${c.seconds||1}s`;
  if(node.type==='set_var')return`${c.scope==='global'?'🌐':'📍'} ${c.name||'?'}`;
  if(node.type==='random_response')return`${(c.responses||[]).length} Antworten`;
  return`<span style="color:#555">Klicken zum Konfigurieren</span>`;
}

// ── Mouse ───────────────────────────────────────────────────────────────
function ccMD(e){if(e.button===1||(e.button===0&&e.altKey)){CC.panning={sx:e.clientX,sy:e.clientY,px:CC.pan.x,py:CC.pan.y};e.preventDefault();}}
function ccMM(e){
  if(CC.panning){CC.pan.x=CC.panning.px+(e.clientX-CC.panning.sx);CC.pan.y=CC.panning.py+(e.clientY-CC.panning.sy);renderCanvas();return;}
  if(CC.dragging){const n=CC.cmd.nodes.find(n=>n.id===CC.dragging.id);if(n){n.x=CC.dragging.nx+(e.clientX-CC.dragging.sx)/CC.zoom;n.y=CC.dragging.ny+(e.clientY-CC.dragging.sy)/CC.zoom;renderCanvas();}return;}
  if(CC.connecting){
    const wrap=document.getElementById('cc-canvas-wrap');const rect=wrap.getBoundingClientRect();
    const mx=(e.clientX-rect.left-CC.pan.x)/CC.zoom,my=(e.clientY-rect.top-CC.pan.y)/CC.zoom;
    document.getElementById('cc-temp-line').innerHTML=`<path d="${bz(CC.connecting.x,CC.connecting.y,mx,my)}" fill="none" stroke="#5865f2" stroke-width="1.5" stroke-dasharray="5,3"/>`;
  }
}
function ccMU(e){
  CC.panning=null;CC.dragging=null;
  if(CC.connecting){
    const t=document.elementFromPoint(e.clientX,e.clientY);
    if(t?.classList.contains('ccport')&&t.dataset.port==='in'&&t.dataset.nid!==CC.connecting.fromNodeId){
      CC.cmd.edges.push({id:uuid(),fromNodeId:CC.connecting.fromNodeId,fromPort:CC.connecting.fromPort,toNodeId:t.dataset.nid});
    }
    CC.connecting=null;document.getElementById('cc-temp-line').innerHTML='';renderCanvas();
  }
}
function ccNMD(e,id){
  if(e.target.classList.contains('ccport')||e.target.classList.contains('cc-x'))return;
  if(e.button!==0)return;e.stopPropagation();
  const n=CC.cmd.nodes.find(n=>n.id===id);if(!n)return;
  CC.dragging={id,sx:e.clientX,sy:e.clientY,nx:n.x,ny:n.y};
}
function ccPMD(e,nodeId,port){
  e.stopPropagation();if(port==='in')return;
  const n=CC.cmd.nodes.find(n=>n.id===nodeId);if(!n)return;
  const p=getPortPos(n,port);CC.connecting={fromNodeId:nodeId,fromPort:port,x:p.x,y:p.y};
}
function ccWheel(e){
  e.preventDefault();const wrap=document.getElementById('cc-canvas-wrap');const rect=wrap.getBoundingClientRect();
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  const d=e.deltaY>0?0.9:1.1,nz=Math.max(0.3,Math.min(2.5,CC.zoom*d));
  CC.pan.x=mx-(mx-CC.pan.x)*(nz/CC.zoom);CC.pan.y=my-(my-CC.pan.y)*(nz/CC.zoom);CC.zoom=nz;renderCanvas();
}

// ── Config Panel ─────────────────────────────────────────────────────────
function renderCCCfg(nodeId){
  const panel=document.getElementById('cc-cfg');
  const node=CC.cmd.nodes.find(n=>n.id===nodeId);
  if(!node){panel.style.display='none';return;}
  panel.style.display='block';
  const def=getDef(node.type)||{label:node.type,icon:'?',color:'#5865f2'};
  const c=node.config||{};const g=CC.gid;
  const hints=`<div style="font-size:.72rem;color:var(--muted);margin-top:3px">{user} {username} {server} {channel} {date} ${(CC.cmd.options||[]).map(o=>`{input:${o.name}}`).join(' ')}</div>`;
  const uopts=(CC.cmd.options||[]).filter(o=>o.type==='user').map(o=>`<option value="${o.name}">${o.name}</option>`).join('');
  const S=(tag,attrs,inner='')=>`<${tag} ${attrs}>${inner}</${tag}>`;

  const inp=(key,lbl,ph='',type='text')=>
    `<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">${lbl}</label>
     <input type="${type}" value="${String(c[key]||'').replace(/"/g,'&quot;')}" placeholder="${ph}" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);margin-bottom:9px" oninput="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.${key}=this.value;renderCanvas()">`;
  const ta=(key,lbl,ph='')=>
    `<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">${lbl}</label>
     <textarea style="width:100%;min-height:65px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);resize:vertical;font-family:inherit;font-size:.85rem;margin-bottom:4px" placeholder="${ph}" oninput="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.${key}=this.value;renderCanvas()">${c[key]||''}</textarea>${hints}`;
  const tog=(key,lbl)=>
    `<label style="display:flex;align-items:center;gap:7px;margin-bottom:9px;font-size:.83rem;cursor:pointer"><label class="toggle"><input type="checkbox" ${c[key]?'checked':''} onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.${key}=this.checked"><span class="slider"></span></label>${lbl}</label>`;
  const rsel=()=>
    `<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Ziel-User</label>
     <select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.targetInput=this.value||undefined" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);margin-bottom:9px">
       <option value="">Ausführender User</option>${uopts}
     </select>`;
  const emb=(prefix='embed')=>{
    const em=c[prefix]||{};const ep=`(CC.cmd.nodes.find(n=>n.id==='${node.id}').config.${prefix}=Object.assign(CC.cmd.nodes.find(n=>n.id==='${node.id}').config.${prefix}||{},`;
    return`<div style="background:var(--surface2);border-radius:7px;padding:10px;margin-bottom:9px">
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:7px;font-weight:600">Embed</div>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input type="text" value="${(em.title||'').replace(/"/g,'&quot;')}" placeholder="Titel..." style="flex:1;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:.81rem" oninput="${ep}{title:this.value}))&&renderCanvas()">
        <input type="color" value="${em.color||'#5865f2'}" style="width:34px;height:30px;border:1px solid var(--border);border-radius:5px;cursor:pointer;background:none;padding:2px" oninput="${ep}{color:this.value}))">
      </div>
      <textarea style="width:100%;min-height:55px;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);resize:vertical;font-family:inherit;font-size:.81rem;margin-bottom:5px" placeholder="Beschreibung..." oninput="${ep}{description:this.value}))">${em.description||''}</textarea>
      <input type="text" value="${(em.footer||'').replace(/"/g,'&quot;')}" placeholder="Footer..." style="width:100%;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:.78rem;margin-bottom:5px" oninput="${ep}{footer:this.value}))">
      <label style="display:flex;align-items:center;gap:5px;font-size:.77rem;color:var(--muted)"><input type="checkbox" ${em.timestamp?'checked':''} onchange="${ep}{timestamp:this.checked}))"> Timestamp</label>
    </div>${hints}`;
  };
  const btnBuilder=()=>`
    <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">
      <div style="font-size:.79rem;color:var(--muted);margin-bottom:5px">🔘 Buttons → verbinde Port für Branch</div>
      ${(node.buttons||[]).map((b,i)=>`<div style="background:var(--bg);border-radius:6px;padding:7px;margin-bottom:5px">
        <div style="display:flex;gap:4px;margin-bottom:4px">
          <input type="text" value="${(b.label||'').replace(/"/g,'&quot;')}" placeholder="Label" style="flex:1;padding:4px 6px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.79rem" oninput="CC.cmd.nodes.find(n=>n.id==='${node.id}').buttons[${i}].label=this.value;renderCanvas()">
          <select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').buttons[${i}].style=this.value" style="padding:4px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.79rem">
            ${['primary','secondary','success','danger'].map(s=>`<option value="${s}" ${b.style===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <input type="text" value="${b.emoji||''}" placeholder="😀" style="width:36px;padding:4px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);text-align:center" oninput="CC.cmd.nodes.find(n=>n.id==='${node.id}').buttons[${i}].emoji=this.value;renderCanvas()">
          <button onclick="CC.cmd.nodes.find(n=>n.id==='${node.id}').buttons.splice(${i},1);CC.cmd.edges=CC.cmd.edges.filter(e=>!(e.fromNodeId==='${node.id}'&&e.fromPort==='btn_${i}'));selectCCNode('${node.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.9rem">✕</button>
        </div>
      </div>`).join('')}
      ${(node.buttons||[]).length<5?`<button class="btn btn-ghost btn-sm" style="width:100%" onclick="(CC.cmd.nodes.find(n=>n.id==='${node.id}').buttons=CC.cmd.nodes.find(n=>n.id==='${node.id}').buttons||[]).push({id:'${uuid()}',label:'Button',style:'primary',emoji:''});selectCCNode('${node.id}')">+ Button</button>`:''}
    </div>
    <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px">
      <div style="font-size:.79rem;color:var(--muted);margin-bottom:5px">🔽 Select Menu → verbinde Sel-Port für Branch</div>
      ${(node.selects||[]).map((s,i)=>`<div style="background:var(--bg);border-radius:6px;padding:7px;margin-bottom:5px;display:flex;gap:4px">
        <input type="text" value="${(s.label||'').replace(/"/g,'&quot;')}" placeholder="Label" style="flex:1;padding:4px 6px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.79rem" oninput="CC.cmd.nodes.find(n=>n.id==='${node.id}').selects[${i}].label=this.value;renderCanvas()">
        <input type="text" value="${s.emoji||''}" placeholder="😀" style="width:34px;padding:4px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);text-align:center" oninput="CC.cmd.nodes.find(n=>n.id==='${node.id}').selects[${i}].emoji=this.value;renderCanvas()">
        <button onclick="CC.cmd.nodes.find(n=>n.id==='${node.id}').selects.splice(${i},1);selectCCNode('${node.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.9rem">✕</button>
      </div>`).join('')}
      ${(node.selects||[]).length<10?`<button class="btn btn-ghost btn-sm" style="width:100%" onclick="(CC.cmd.nodes.find(n=>n.id==='${node.id}').selects=CC.cmd.nodes.find(n=>n.id==='${node.id}').selects||[]).push({id:'${uuid()}',label:'Option',emoji:''});selectCCNode('${node.id}')">+ Option</button>`:''}
    </div>`;

  let html=`<div style="display:flex;align-items:center;gap:7px;margin-bottom:14px;padding-bottom:11px;border-bottom:1px solid var(--border)"><span style="font-size:1.2rem">${def.icon}</span><strong style="font-size:.95rem">${def.label}</strong></div>`;

  if(node.kind==='trigger'){
    const opts=CC.cmd.options||[];
    html+=`<div style="font-size:.8rem;color:var(--muted);margin-bottom:7px">Slash-Optionen</div>
      ${opts.map((o,i)=>`<div style="background:var(--surface2);border-radius:6px;padding:8px;margin-bottom:6px">
        <div style="display:flex;gap:5px;margin-bottom:5px">
          <input type="text" value="${o.name}" placeholder="name" style="flex:1;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem" oninput="CC.cmd.options[${i}].name=this.value;renderCanvas()">
          <select onchange="CC.cmd.options[${i}].type=this.value" style="padding:4px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem">
            ${['text','number','user','channel','role','boolean'].map(t=>`<option value="${t}" ${o.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
          <button onclick="CC.cmd.options.splice(${i},1);selectCCNode('${node.id}')" style="background:none;border:none;color:var(--red);cursor:pointer">✕</button>
        </div>
        <input type="text" value="${o.description||''}" placeholder="Beschreibung" style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.78rem;margin-bottom:4px" oninput="CC.cmd.options[${i}].description=this.value">
        <label style="font-size:.77rem;color:var(--muted);display:flex;align-items:center;gap:5px"><input type="checkbox" ${o.required?'checked':''} onchange="CC.cmd.options[${i}].required=this.checked"> Pflichtfeld</label>
      </div>`).join('')}
      <button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:12px" onclick="CC.cmd.options.push({id:'${uuid()}',name:'opt'+(CC.cmd.options.length+1),type:'text',description:'',required:false});selectCCNode('${node.id}')">+ Option hinzufügen</button>
      <div style="border-top:1px solid var(--border);padding-top:10px;font-size:.8rem;color:var(--muted)">Cooldown: <input type="number" value="${CC.cmd.cooldown||0}" min="0" style="width:55px;padding:3px 5px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text)" oninput="CC.cmd.cooldown=parseInt(this.value)||0"> Sek.</div>`;
  } else if(node.kind==='condition'){
    const t=node.type.replace('condition_','');
    if(t==='role')html+=`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Rolle</label><select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.roleId=this.value;renderCanvas()" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);margin-bottom:9px"><option value="">Wählen...</option>${roleOptions(g,c.roleId)}</select><label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Bedingung</label><select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.mode=this.value" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)"><option value="has" ${c.mode!=='hasnt'?'selected':''}>Hat die Rolle</option><option value="hasnt" ${c.mode==='hasnt'?'selected':''}>Hat die Rolle NICHT</option></select>`;
    else if(t==='channel')html+=`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Channels (Strg=Multi)</label><select multiple style="width:100%;height:110px;padding:4px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)" onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.channelIds=[...this.selectedOptions].map(o=>o.value);renderCanvas()">${(chCache[g]||[]).map(ch=>`<option value="${ch.id}" ${(c.channelIds||[]).includes(ch.id)?'selected':''}>#${ch.name}</option>`).join('')}</select>`;
    else if(t==='permission')html+=`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Berechtigung</label><select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.permission=this.value" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)">${['Administrator','ManageGuild','ManageChannels','ManageRoles','KickMembers','BanMembers','ModerateMembers','ManageMessages'].map(p=>`<option value="${p}" ${c.permission===p?'selected':''}>${p}</option>`).join('')}</select>`;
    else if(t==='chance')html+=`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:4px">Wahrscheinlichkeit</label><input type="range" min="0" max="100" value="${c.percent||50}" oninput="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.percent=parseInt(this.value);this.nextElementSibling.textContent=this.value+'%';renderCanvas()" style="width:100%"><span style="font-size:.9rem;font-weight:600">${c.percent||50}%</span>`;
    else if(t==='compare')html+=inp('valueA','Wert A','{input:name} oder Text')+`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Operator</label><select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.operator=this.value" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);margin-bottom:9px">${['==','!=','>','<','>=','<=','contains'].map(op=>`<option value="${op}" ${c.operator===op?'selected':''}>${op}</option>`).join('')}</select>`+inp('valueB','Wert B','Vergleichswert')+hints;
    else if(t==='user')html+=inp('userId','User-ID','Discord User-ID');
  } else {
    switch(node.type){
      case 'reply_text':    html+=ta('content','Nachricht','Text... {user} etc.')+tog('ephemeral','Nur für User sichtbar')+btnBuilder();break;
      case 'reply_embed':   html+=inp('content','Text über Embed (optional)','Optional...')+emb()+tog('ephemeral','Nur für User sichtbar')+btnBuilder();break;
      case 'random_response':
        const rs=c.responses?.length?c.responses:[''];
        html+=`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:5px">Antworten</label>
          <div id="cp-rr">${rs.map((r,i)=>`<div style="display:flex;gap:4px;margin-bottom:4px"><input type="text" value="${r.replace(/"/g,'&quot;')}" class="cp-rr-i" style="flex:1;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:.82rem"><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--red);cursor:pointer">✕</button></div>`).join('')}</div>
          <button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:8px" onclick="document.getElementById('cp-rr').insertAdjacentHTML('beforeend','<div style=\\'display:flex;gap:4px;margin-bottom:4px\\'><input type=\\'text\\' class=\\'cp-rr-i\\' style=\\'flex:1;padding:5px 7px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:.82rem\\'><button onclick=\\'this.parentElement.remove()\\' style=\\'background:none;border:none;color:var(--red);cursor:pointer\\'>✕</button></div>')">+ Antwort</button>
          <button class="btn btn-primary btn-sm" style="width:100%;margin-bottom:9px" onclick="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.responses=[...document.querySelectorAll('.cp-rr-i')].map(i=>i.value).filter(Boolean);renderCanvas()">Speichern</button>
          ${tog('ephemeral','Nur für User sichtbar')}`;break;
      case 'send_message':
        html+=`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Ziel-Channel</label>
          <select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.channelId=this.value;renderCanvas()" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);margin-bottom:9px">
            <option value="">Gleicher Channel</option>${chOptions(g,c.channelId)}
          </select>
          ${ta('content','Nachricht (optional)','Text...')}${emb()}${btnBuilder()}`;break;
      case 'dm':          html+=rsel()+ta('content','Nachricht','DM-Text...');break;
      case 'add_role':
      case 'remove_role': html+=`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Rolle</label><select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.roleId=this.value;renderCanvas()" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)"><option value="">Wählen...</option>${roleOptions(g,c.roleId)}</select>`;break;
      case 'kick':
      case 'ban':         html+=rsel()+inp('reason','Grund (optional)','Grund...');break;
      case 'timeout':     html+=rsel()+inp('durationMinutes','Dauer (Min)','10','number')+inp('reason','Grund (optional)','Grund...');break;
      case 'set_nick':    html+=rsel()+inp('nick','Neuer Nickname','Leer = zurücksetzen');break;
      case 'delete_message':html+=`<p style="color:var(--muted);font-size:.83rem">Löscht die Nachricht die den Command ausgelöst hat.</p>`;break;
      case 'wait':        html+=inp('seconds','Wartezeit (Max 10s)','5','number');break;
      case 'set_var':     html+=inp('name','Variable Name','meinVar')+inp('value','Wert','{input:...}')+hints+`<label style="font-size:.8rem;color:var(--muted);display:block;margin:7px 0 3px">Scope</label><select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.scope=this.value" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)"><option value="local" ${c.scope!=='global'?'selected':''}>📍 Lokal</option><option value="global" ${c.scope==='global'?'selected':''}>🌐 Global</option></select>`;break;
      case 'set_status':  html+=`<label style="font-size:.8rem;color:var(--muted);display:block;margin-bottom:3px">Typ</label><select onchange="CC.cmd.nodes.find(n=>n.id==='${node.id}').config.statusType=this.value" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);margin-bottom:9px">${['watching','playing','listening','competing'].map(t=>`<option value="${t}" ${c.statusType===t?'selected':''}>${t}</option>`).join('')}</select>${inp('text','Status Text','z.B. mit dem Server!')}`;break;
      case 'react':       html+=inp('emoji','Emoji','✅');break;
    }
  }
  panel.innerHTML=html;
}

async function ccSave(){
  const cmd=CC.cmd;
  if(!cmd.name.trim()){alert('Name darf nicht leer sein.');return;}
  let r;
  if(cmd.id){
    r=await api(`/api/customcommands/${CC.gid}/${cmd.id}`,{method:'PUT',body:JSON.stringify(cmd)});
    if(r.ok){const i=CC.commands.findIndex(c=>c.id===cmd.id);if(i!==-1)CC.commands[i]=r.cmd||cmd;}
  } else {
    r=await api(`/api/customcommands/${CC.gid}`,{method:'POST',body:JSON.stringify(cmd)});
    if(r.ok){CC.cmd=r.cmd||cmd;CC.commands.push(CC.cmd);}
  }
  if(r?.ok){
    const t=document.createElement('div');
    t.style.cssText='position:fixed;top:20px;right:20px;background:#3ba55c;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:.9rem;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    t.textContent='✅ Gespeichert!';document.body.appendChild(t);setTimeout(()=>t.remove(),2500);
    if(!cmd.id&&CC.cmd.id)openEditor();
  } else alert('Fehler: '+(r?.error||'Unbekannter Fehler'));
}
