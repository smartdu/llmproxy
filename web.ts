import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getLogs, clearLogs, onLog, importLogs, type LogEntry } from './logger.js';
import { info } from './logger.js';
import type { ProxyConfig } from './config.js';

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LLM Proxy - 抓包日志</title>
<style>
  :root{--bg:#fff;--bg2:#f6f8fa;--bg3:#e1e4e8;--border:#d0d7de;--text:#24292f;--text2:#57606a;--text3:#8b949e;--blue:#0969da;--green:#1a7f37;--yellow:#9a6700;--red:#cf222e;--purple:#8250df;--msb:#ddf4ff;--mub:#dafbe1;--mab:#fbefff;--meb:#ffebe9}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column}
  .toolbar{background:var(--bg2);border-bottom:1px solid var(--border);padding:8px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap}
  .toolbar h1{font-size:15px;font-weight:600;color:var(--blue);white-space:nowrap}
  .toolbar button,.toolbar select{background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px}
  .toolbar button:hover,.toolbar select:hover{opacity:.85}
  .toolbar .spacer{flex:1}
  .label{font-size:12px;color:var(--text2);white-space:nowrap}
  .stat-chip{font-size:11px;color:var(--text2);background:var(--bg3);padding:3px 8px;border-radius:4px;white-space:nowrap}
  .stat-chip b{color:var(--green)}
  .main{display:flex;flex:1;overflow:hidden}
  .list-wrap{width:420px;border-right:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column}
  .list{flex:1;overflow-y:auto;position:relative}
  .list-spacer{width:100%}
  .list-content{position:absolute;top:0;left:0;right:0}
  .list-item{padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer}
  .list-item:hover{background:var(--bg2)}
  .list-item.active{background:color-mix(in srgb,var(--blue) 15%,var(--bg));border-left:3px solid var(--blue)}
  .list-item .meta{display:flex;align-items:center;gap:8px;margin-bottom:3px}
  .list-item .method{font-weight:700;font-size:11px;padding:1px 6px;border-radius:3px}
  .method-post{background:color-mix(in srgb,var(--blue) 20%,transparent);color:var(--blue)}
  .method-get{background:color-mix(in srgb,var(--green) 20%,transparent);color:var(--green)}
  .list-item .path{font-size:13px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .list-item .status-badge{font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600}
  .status-2xx{background:color-mix(in srgb,var(--green) 20%,transparent);color:var(--green)}
  .status-4xx{background:color-mix(in srgb,var(--yellow) 20%,transparent);color:var(--yellow)}
  .status-5xx{background:color-mix(in srgb,var(--red) 20%,transparent);color:var(--red)}
  .status-sse{background:color-mix(in srgb,var(--purple) 20%,transparent);color:var(--purple)}
  .list-item .seq{font-size:11px;color:var(--text3);min-width:24px}
  .list-item .time{font-size:11px;color:var(--text3)}
  .list-item .model-tag{font-size:10px;color:var(--text2);background:var(--bg3);padding:1px 5px;border-radius:3px}
  .list-item .token-row{display:flex;gap:8px;margin-top:2px}
  .list-item .token-tag{font-size:10px;padding:1px 5px;border-radius:3px}
  .token-prompt{background:color-mix(in srgb,var(--blue) 15%,transparent);color:var(--blue)}
  .token-compl{background:color-mix(in srgb,var(--purple) 15%,transparent);color:var(--purple)}
  .detail{flex:1;display:flex;flex-direction:column;overflow:hidden}
  .detail-toc{background:var(--bg2);border-bottom:1px solid var(--border);padding:6px 16px;display:flex;gap:4px;flex-shrink:0}
  .detail-toc a{font-size:12px;padding:3px 10px;border-radius:4px;color:var(--text2);text-decoration:none;cursor:pointer}
  .detail-toc a:hover{background:var(--bg3);color:var(--text)}
  .detail-toc a.toc-req{color:var(--blue)}
  .detail-toc a.toc-res{color:var(--purple)}
  .detail-scroll{flex:1;overflow-y:auto;padding:16px}
  .detail-empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:14px}
  .detail-section{margin-bottom:20px}
  .detail-section h3{font-size:13px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:8px}
  .detail-section h3.req-title{color:var(--blue)}
  .detail-section h3.res-title{color:var(--purple)}
  .copy-btn{font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap;text-transform:none;letter-spacing:0;font-weight:400}
  .copy-btn:hover{opacity:.8}
  .copy-btn.copied{color:var(--green);border-color:var(--green)}
  pre{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:12px;overflow-x:auto;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all}
  .empty-list{display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:13px;text-align:center;padding:20px}
  .count{font-size:12px;color:var(--text2);white-space:nowrap}
  .summary{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px}
  .summary-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 12px}
  .summary-card .card-label{font-size:11px;color:var(--text2);margin-bottom:3px}
  .summary-card .value{font-size:14px;font-weight:600}
  .summary-card .value.green{color:var(--green)}.summary-card .value.blue{color:var(--blue)}.summary-card .value.purple{color:var(--purple)}.summary-card .value.yellow{color:var(--yellow)}
  .conversation{margin-bottom:16px}
  .msg{padding:10px 14px;border-radius:8px;margin-bottom:8px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
  .msg-role{font-size:11px;font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
  .msg-system{background:var(--msb);border-left:3px solid var(--blue)}.msg-system .msg-role{color:var(--blue)}
  .msg-user{background:var(--mub);border-left:3px solid var(--green)}.msg-user .msg-role{color:var(--green)}
  .msg-assistant{background:var(--mab);border-left:3px solid var(--purple)}.msg-assistant .msg-role{color:var(--purple)}
  .msg-error{background:var(--meb);border-left:3px solid var(--red)}.msg-error .msg-role{color:var(--red)}
</style>
</head>
<body>
<div class="toolbar">
  <h1>LLM Proxy</h1>
  <div class="spacer"></div>
  <span class="stat-chip" id="totalTokens">Prompt: <b>0</b> | Completion: <b>0</b></span>
  <span class="count" id="count">0 条</span>
  <button onclick="clearAll()">清空</button>
  <button onclick="document.getElementById('historyFileInput').click()">加载历史</button>
  <input type="file" id="historyFileInput" accept=".jsonl,.json,.log" style="display:none" onchange="handleFileSelect(this)">
</div>
<div class="main">
  <div class="list-wrap">
    <div class="list" id="list">
      <div class="list-spacer" id="listSpacer"></div>
      <div class="list-content" id="listContent"></div>
    </div>
  </div>
  <div class="detail" id="detail">
    <div class="detail-empty">点击左侧请求查看详情</div>
  </div>
</div>
<script>
const requests = new Map();
let selectedId = null;
let lastDetailHash = '';

const $list = document.getElementById('list');
const $listSpacer = document.getElementById('listSpacer');
const $listContent = document.getElementById('listContent');
const $detail = document.getElementById('detail');
const $count = document.getElementById('count');
const $totalTokens = document.getElementById('totalTokens');

// ─── 工具函数 ───
function formatTime(ts){return new Date(ts).toLocaleTimeString('zh-CN',{hour12:false})}
function methodClass(m){return m==='POST'?'method-post':m==='GET'?'method-get':'method-post'}
function statusClass(c){return c>=200&&c<300?'status-2xx':c>=400&&c<500?'status-4xx':'status-5xx'}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function prettyJson(s){try{return JSON.stringify(JSON.parse(s),null,2)}catch{return s}}

// ─── Token 统计 ───
function updateTotalTokens(){
  let p=0,c=0;
  for(const{res}of requests.values()){
    const u=res?.chatResponse?.usage;
    if(u){p+=(u.prompt_tokens||0);c+=(u.completion_tokens||0)}
  }
  $totalTokens.innerHTML='Prompt: <b>'+p+'</b> | Completion: <b>'+c+'</b>';
}

// ─── 虚拟滚动列表 ───
const ITEM_HEIGHT = 72;
const BUFFER = 5;
let lastListHash = '';
let filteredItems = [];
const rowPool = new Map();
let renderedIds = [];

function computeFiltered(){
  filteredItems = [...requests.values()].reverse();
}

function createRowEl(id) {
  const div = document.createElement('div');
  div.className = 'list-item';
  div.dataset.id = id;
  div.style.height = ITEM_HEIGHT + 'px';
  div.style.position = 'absolute';
  div.style.left = '0';
  div.style.right = '0';
  div.style.display = 'flex';
  div.style.flexDirection = 'column';
  div.style.justifyContent = 'center';
  div.style.padding = '10px 14px';
  div.style.borderBottom = '1px solid var(--border)';
  div.style.cursor = 'pointer';
  const inner = '<div class="meta" style="display:flex;align-items:center;gap:8px;margin-bottom:3px">' +
    '<span class="seq" style="font-size:11px;color:var(--text3);min-width:24px"></span>' +
    '<span class="method" style="font-weight:700;font-size:11px;padding:1px 6px;border-radius:3px"></span>' +
    '<span class="path" style="font-size:13px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>' +
    '<span class="status-badge" style="font-size:11px;padding:1px 6px;border-radius:3px;font-weight:600;display:none"></span>' +
    '<span class="model-tag" style="font-size:10px;color:var(--text2);background:var(--bg3);padding:1px 5px;border-radius:3px;display:none"></span>' +
    '</div>' +
    '<div class="token-row" style="display:flex;gap:8px;margin-top:2px;height:16px"></div>' +
    '<div class="time" style="font-size:11px;color:var(--text3);margin-top:1px"></div>';
  div.innerHTML = inner;
  return div;
}

function updateRowEl(el, item, seq) {
  const {req, res} = item;
  const id = req.id;
  const isActive = id === selectedId;
  el.className = 'list-item' + (isActive ? ' active' : '');
  el.dataset.id = id;

  const meta = el.querySelector('.meta');
  const seqEl = meta.children[0];
  const methodEl = meta.children[1];
  const pathEl = meta.children[2];
  const statusEl = meta.children[3];
  const modelEl = meta.children[4];

  seqEl.textContent = '#' + seq;
  methodEl.textContent = req.method || '?';
  methodEl.className = 'method ' + methodClass(req.method);
  pathEl.textContent = req.url || '';

  if (res) {
    if (res.isStream) {
      statusEl.style.display = '';
      statusEl.className = 'status-badge status-sse';
      statusEl.textContent = 'SSE';
    } else {
      statusEl.style.display = '';
      statusEl.className = 'status-badge ' + statusClass(res.statusCode);
      statusEl.textContent = String(res.statusCode);
    }
  } else {
    statusEl.style.display = 'none';
  }

  const model = req.chatRequest?.model;
  if (model) {
    modelEl.style.display = '';
    modelEl.textContent = model;
  } else {
    modelEl.style.display = 'none';
  }

  const tokenRow = el.querySelector('.token-row');
  const usage = res?.chatResponse?.usage;
  if (usage) {
    tokenRow.style.display = 'flex';
    tokenRow.innerHTML = '<span class="token-tag token-prompt" style="font-size:10px;padding:1px 5px;border-radius:3px;background:color-mix(in srgb,var(--blue) 15%,transparent);color:var(--blue)">P:' + (usage.prompt_tokens||0) + '</span>' +
      '<span class="token-tag token-compl" style="font-size:10px;padding:1px 5px;border-radius:3px;background:color-mix(in srgb,var(--purple) 15%,transparent);color:var(--purple)">C:' + (usage.completion_tokens||0) + '</span>';
  } else {
    tokenRow.style.display = 'none';
    tokenRow.innerHTML = '';
  }

  const timeEl = el.querySelector('.time');
  const duration = res && req.timestamp ? getDuration(req.timestamp, res.timestamp) : '';
  timeEl.textContent = formatTime(req.timestamp) + (duration ? ' · ' + duration : '');
}

function getDuration(reqTs, resTs) {
  const t1 = new Date(reqTs).getTime();
  const t2 = new Date(resTs).getTime();
  if (isNaN(t1) || isNaN(t2) || t2 <= t1) return '';
  const ms = t2 - t1;
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function renderList(){
  computeFiltered();
  $count.textContent = filteredItems.length + ' 条';
  updateTotalTokens();
  if(filteredItems.length===0){
    $listSpacer.style.height='0';
    for(const el of rowPool.values()) el.remove();
    rowPool.clear();
    renderedIds = [];
    $listContent.innerHTML='<div class="empty-list" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:13px;text-align:center;padding:20px">等待请求...<br>将 LLM API 指向此代理即可抓包</div>';
    $listContent.style.transform='translateY(0)';
    lastListHash='';
    return;
  }
  $listSpacer.style.height = (filteredItems.length * ITEM_HEIGHT) + 'px';
  const emptyEl = $listContent.querySelector('.empty-list');
  if(emptyEl) emptyEl.remove();
  renderVisibleItems();
}

function renderVisibleItems(){
  const total = filteredItems.length;
  if(total===0) return;
  const scrollTop = $list.scrollTop;
  const viewH = $list.clientHeight;
  let startIdx = Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER;
  let endIdx = Math.ceil((scrollTop + viewH) / ITEM_HEIGHT) + BUFFER;
  startIdx = Math.max(0, startIdx);
  endIdx = Math.min(total, endIdx);

  const newIds = [];
  for(let i=startIdx;i<endIdx;i++) newIds.push(filteredItems[i].req.id);

  for(const id of renderedIds) {
    if(!newIds.includes(id)) {
      const el = rowPool.get(id);
      if(el) { el.style.display = 'none'; }
    }
  }

  for(let i=startIdx;i<endIdx;i++){
    const {req} = filteredItems[i];
    const id = req.id;
    const seq = filteredItems.length - i;
    let el = rowPool.get(id);
    if(!el) {
      el = createRowEl(id);
      $listContent.appendChild(el);
      rowPool.set(id, el);
    }
    el.style.display = 'flex';
    el.style.transform = 'translateY(' + (i * ITEM_HEIGHT) + 'px)';
    updateRowEl(el, filteredItems[i], seq);
  }
  renderedIds = newIds;
}

$list.addEventListener('scroll', () => { requestAnimationFrame(renderVisibleItems); });

function selectItem(id){
  if(id===selectedId) return;
  const oldId = selectedId;
  selectedId=id;
  if(oldId) {
    const oldEl = rowPool.get(oldId);
    if(oldEl) oldEl.classList.remove('active');
  }
  const newEl = rowPool.get(id);
  if(newEl) newEl.classList.add('active');
  lastDetailHash='';
  renderDetail();
}

$list.addEventListener('click',(e)=>{
  const item = e.target.closest('.list-item');
  if(item && item.dataset.id) selectItem(item.dataset.id);
});

// ─── 渲染详情 ───
function renderDetail(){
  if(!selectedId||!requests.has(selectedId)){
    $detail.innerHTML='<div class="detail-empty">点击左侧请求查看详情</div>';
    return;
  }
  const{req,res,chunks}=requests.get(selectedId);
  const cr=req.chatRequest, cRes=res?.chatResponse;
  const hash=JSON.stringify({b:req.body,rb:res?.body,sc:req.sseContent,cc:chunks?.length,u:cRes?.usage});
  if(hash===lastDetailHash) return;
  lastDetailHash=hash;

  var hasSummary=!!(cr||cRes);
  var hasConversation=!!(cr?.messages||cRes?.content||req.sseContent);
  var hasResponse=!!res;

  var toc='<div class="detail-toc">';
  if(hasSummary) toc+='<a onclick="scrollToSection(\'sec-summary\')">摘要</a>';
  if(hasConversation) toc+='<a onclick="scrollToSection(\'sec-conversation\')">对话</a>';
  toc+='<a class="toc-req" onclick="scrollToSection(\'sec-request\')">请求</a>';
  if(hasResponse) toc+='<a class="toc-res" onclick="scrollToSection(\'sec-response\')">响应</a>';
  toc+='</div>';

  var h='';
  if(hasSummary){
    h+='<div id="sec-summary" class="detail-section"><h3 class="req-title">摘要</h3>';
    h+='<div class="summary">';
    if(cr?.model) h+='<div class="summary-card"><div class="card-label">Model</div><div class="value blue">'+esc(cr.model)+'</div></div>';
    if(cr?.stream!==undefined) h+='<div class="summary-card"><div class="card-label">Stream</div><div class="value '+(cr.stream?'purple':'green')+'">'+(cr.stream?'Yes':'No')+'</div></div>';
    if(cr?.temperature!==undefined) h+='<div class="summary-card"><div class="card-label">Temperature</div><div class="value">'+cr.temperature+'</div></div>';
    if(cr?.max_tokens!==undefined) h+='<div class="summary-card"><div class="card-label">Max Tokens</div><div class="value">'+cr.max_tokens+'</div></div>';
    if(res?.statusCode) h+='<div class="summary-card"><div class="card-label">Status</div><div class="value '+(res.statusCode<400?'green':'yellow')+'">'+res.statusCode+'</div></div>';
    if(cRes?.finish_reason) h+='<div class="summary-card"><div class="card-label">Finish Reason</div><div class="value yellow">'+esc(cRes.finish_reason)+'</div></div>';
    if(cRes?.usage){
      h+='<div class="summary-card"><div class="card-label">Prompt Tokens</div><div class="value">'+(cRes.usage.prompt_tokens??'-')+'</div></div>';
      h+='<div class="summary-card"><div class="card-label">Completion Tokens</div><div class="value">'+(cRes.usage.completion_tokens??'-')+'</div></div>';
      h+='<div class="summary-card"><div class="card-label">Total Tokens</div><div class="value green">'+(cRes.usage.total_tokens??'-')+'</div></div>';
    }
    h+='</div></div>';
  }
  if(hasConversation){
    h+='<div id="sec-conversation" class="detail-section"><h3 class="req-title">对话</h3><div class="conversation">';
    if(cr?.messages){
      for(const msg of cr.messages){
        const role=(msg.role||'unknown').toLowerCase();
        const cls=role==='system'?'msg-system':role==='user'?'msg-user':role==='assistant'?'msg-assistant':'msg-error';
        h+='<div class="msg '+cls+'"><div class="msg-role">'+esc(role)+'</div>'+esc(msg.content)+'</div>';
      }
    }
    if(res?.isStream&&req.sseContent) h+='<div class="msg msg-assistant"><div class="msg-role">assistant</div>'+esc(req.sseContent)+'</div>';
    else if(cRes?.content) h+='<div class="msg msg-assistant"><div class="msg-role">assistant</div>'+esc(cRes.content)+'</div>';
    h+='</div></div>';
  }
  const dur = res && req.timestamp ? getDuration(req.timestamp, res.timestamp) : '';
  h+='<div id="sec-request" class="detail-section"><h3 class="req-title">Raw Request'+(dur?' <span style="font-size:11px;color:var(--text3);font-weight:normal">'+dur+'</span>':'')+'<span class="copy-btn" onclick="copySection(this)">复制</span></h3><pre>'+esc(req.method+' '+(req.url||''))+'\\n\\nHeaders:\\n'+prettyJson(JSON.stringify(req.headers||{}))+'\\n\\nBody:\\n'+(req.body?esc(prettyJson(req.body)):'(empty)')+'</pre></div>';
  if(hasResponse){
    h+='<div id="sec-response" class="detail-section"><h3 class="res-title">Raw Response'+(res.isStream?' [SSE]':'')+'<span class="copy-btn" onclick="copySection(this)">复制</span></h3><pre>Status: '+res.statusCode+'\\n\\nHeaders:\\n'+prettyJson(JSON.stringify(res.headers||{}))+'\\n\\n';
    if(res.isStream&&chunks&&chunks.length>0){h+='SSE Chunks:\\n';for(const c of chunks) h+=esc(c.body)+'\\n';}
    else h+='Body:\\n'+(res.body?esc(prettyJson(res.body)):'(empty)');
    h+='</pre></div>';
  }
  $detail.innerHTML=toc+'<div class="detail-scroll">'+h+'</div>';
}

// ─── 数据处理 ───
let renderScheduled=false;
function scheduleRender(){
  if(renderScheduled) return;
  renderScheduled=true;
  requestAnimationFrame(()=>{
    renderScheduled=false;
    lastListHash='';
    renderList();
    if(selectedId) renderDetail();
  });
}
function processEntry(entry){
  if(entry.type==='request'){
    if(!requests.has(entry.id)) requests.set(entry.id,{req:entry,res:null,chunks:[]});
  }else if(entry.type==='response'){
    const rid=entry.requestId;
    if(rid&&requests.has(rid)) requests.get(rid).res=entry;
    else requests.set(entry.id,{req:{id:entry.id,timestamp:entry.timestamp,method:'?',url:'?'},res:entry,chunks:[]});
  }else if(entry.type==='sse_chunk'){
    const rid=entry.requestId;
    if(rid&&requests.has(rid)) requests.get(rid).chunks.push(entry);
  }
  lastDetailHash='';
  scheduleRender();
}

// ─── WebSocket ───
var ws=null;
function connect(){
  var proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(proto+'//'+location.host+'/api/logs/stream');
  ws.onmessage=function(e){
    try{
      var msg=JSON.parse(e.data);
      if(msg.type==='history'){
        for(var i=0;i<msg.data.length;i++) processEntry(msg.data[i]);
      }else if(msg.type==='log_entry'){
        processEntry(msg.data);
      }else if(msg.type==='cleared'){
        doClearAll();
      }
    }catch{}
  };
  ws.onclose=function(){setTimeout(connect,2000)};
}
connect();

// ─── 清空 ───
function doClearAll(){
  requests.clear();selectedId=null;lastDetailHash='';lastListHash='';
  for(const el of rowPool.values()) el.remove();
  rowPool.clear();
  renderedIds=[];
  $listContent.innerHTML='';
  $listContent.style.transform='translateY(0)';
  $listSpacer.style.height='0';
  $count.textContent='0 条';
  updateTotalTokens();
  $detail.innerHTML='<div class="detail-empty">点击左侧请求查看详情</div>';
  $listContent.innerHTML='<div class="empty-list" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:13px;text-align:center;padding:20px">等待请求...<br>将 LLM API 指向此代理即可抓包</div>';
}
function clearAll(){
  if(ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'clear'}));
  doClearAll();
}

// ─── 导入历史 ───
async function handleFileSelect(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const text = await file.text();
  try {
    const lines = text.trim().split('\\n');
    const entries = [];
    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed || trimmed.startsWith('[') || trimmed.startsWith('\\xe2\\x80\\x80') || trimmed.startsWith('>>>') || trimmed.startsWith('<<<')) continue;
      try { entries.push(JSON.parse(trimmed)); } catch {}
    }
    if(entries.length === 0){
      alert('未能从文件中解析出日志条目，请确认文件为 JSONL 格式');
      return;
    }
    if(ws&&ws.readyState===WebSocket.OPEN){
      ws.send(JSON.stringify({type:'import',data:entries}));
      alert('已发送导入请求');
    }else{
      alert('WebSocket 未连接，无法导入');
    }
  } catch(e) {
    alert('加载失败: ' + e);
  }
  input.value = '';
}

// ─── 复制 Raw 内容 ───
function copySection(btn){
  var pre=btn.parentElement.nextElementSibling;
  if(!pre) return;
  var text=pre.textContent||'';
  navigator.clipboard.writeText(text).then(function(){
    btn.textContent='已复制';
    btn.classList.add('copied');
    setTimeout(function(){btn.textContent='复制';btn.classList.remove('copied');},1500);
  });
}

// ─── 目录跳转 ───
function scrollToSection(id){
  var el=document.getElementById(id);
  var scroller=document.querySelector('.detail-scroll');
  if(el&&scroller) scroller.scrollTo({top:el.offsetTop-scroller.offsetTop,behavior:'smooth'});
}
</script>
</body>
</html>`;
}

// ─── Web 服务器 + WebSocket ───
export function createWebServer(config: ProxyConfig): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHtml());
    } else if (url.pathname === '/api/logs' && req.method === 'DELETE') {
      clearLogs();
      // 广播清除消息给所有 WebSocket 客户端
      broadcast({ type: 'cleared' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else if (url.pathname === '/api/logs/import' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const entries = JSON.parse(body) as LogEntry[];
          const result = importLogs(entries);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  // WebSocket 服务器
  const wss = new WebSocketServer({ noServer: true });

  // 处理 HTTP Upgrade 请求
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname === '/api/logs/stream') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // 广播消息到所有客户端
  function broadcast(data: object) {
    const msg = JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  // 新客户端连接
  wss.on('connection', (ws) => {
    // 发送全量历史
    const history = getLogs();
    ws.send(JSON.stringify({ type: 'history', data: history }));

    // 处理客户端消息
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'clear') {
          clearLogs();
          broadcast({ type: 'cleared' });
        } else if (msg.type === 'import') {
          const result = importLogs(msg.data as LogEntry[]);
          ws.send(JSON.stringify({ type: 'import_result', imported: result.imported }));
        }
      } catch {}
    });
  });

  // 订阅日志事件，实时广播
  onLog((entry: LogEntry) => {
    broadcast({ type: 'log_entry', data: entry });
  });

  return server;
}
