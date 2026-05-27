/* 優先順位決定くん app.js
   - データ構造: { rows:[{date, image, name, rival, supply}] }
   - 新規作成モーダルで登録 → 表形式で一覧表示
   - GitHub Contents API でデータ(data/products.json)と画像(images/)を直接保存 */

const VERSION = "1.1.0";
const DATA_PATH = "data/products.json";
const IMG_DIR = "images";
const LS_CFG = "yusen_cfg_v1";
const LS_DATA = "yusen_data_v1";

const COLUMNS = [
  { key:"date",   label:"日付" },
  { key:"image",  label:"画像" },
  { key:"name",   label:"項目名" },
  { key:"rival",  label:"ライバルURL" },
  { key:"supply", label:"仕入URL" },
];

let state = { rows: [] };
let cfg = { pat:"", owner:"", repo:"", branch:"main" };
let dataSha = null;

// 登録モーダルの作業用
let entry = { editIndex:-1, image:"", imageIsDataUrl:false };

/* ---------- 初期化 ---------- */
function init(){
  document.getElementById("version").textContent = "v"+VERSION;
  loadCfg();
  loadData();
  bindUI();
  render();
  loadFromGitHub();
}

function loadCfg(){
  try{ const c = JSON.parse(localStorage.getItem(LS_CFG)); if(c) cfg = {...cfg, ...c}; }catch(e){}
}
function saveCfg(){ localStorage.setItem(LS_CFG, JSON.stringify(cfg)); }

function loadData(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(LS_DATA)); }catch(e){}
  if(saved && Array.isArray(saved.rows)){ state = saved; return; }
  state = { rows: [] };
}
function persistLocal(){ localStorage.setItem(LS_DATA, JSON.stringify(state)); }

function today(){ const d=new Date(); return d.toISOString().slice(0,10); }

/* ---------- レンダリング ---------- */
function render(){
  const head = document.getElementById("gridHead");
  const body = document.getElementById("gridBody");

  const tr = document.createElement("tr");
  COLUMNS.forEach(c=>{
    const th = document.createElement("th");
    if(c.key==="date") th.className="col-date";
    if(c.key==="image") th.className="col-image";
    th.textContent = c.label;
    tr.appendChild(th);
  });
  const thAct = document.createElement("th");
  thAct.className="col-actions"; thAct.textContent="操作";
  tr.appendChild(thAct);
  head.innerHTML=""; head.appendChild(tr);

  body.innerHTML="";
  if(state.rows.length===0){
    const trEmpty = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = COLUMNS.length+1;
    td.className = "empty-row";
    td.textContent = "まだ登録がありません。「＋ 新規作成」から追加してください。";
    trEmpty.appendChild(td); body.appendChild(trEmpty);
    return;
  }

  state.rows.forEach((row, ri)=>{
    const trb = document.createElement("tr");

    // 日付
    const tdDate = document.createElement("td");
    tdDate.className="col-date"; tdDate.textContent = row.date || "";
    trb.appendChild(tdDate);

    // 画像
    const tdImg = document.createElement("td");
    tdImg.className="col-image";
    const wrap = document.createElement("div"); wrap.className="img-cell";
    if(row.image){
      const img = document.createElement("img");
      img.src = imgUrl(row.image);
      wrap.appendChild(img);
    }else{
      const span = document.createElement("span");
      span.className="muted"; span.textContent="—";
      wrap.appendChild(span);
    }
    tdImg.appendChild(wrap);
    trb.appendChild(tdImg);

    // 項目名
    const tdName = document.createElement("td");
    tdName.textContent = row.name || "";
    trb.appendChild(tdName);

    // ライバルURL
    trb.appendChild(urlCell(row.rival));
    // 仕入URL
    trb.appendChild(urlCell(row.supply));

    // 操作（編集・削除）
    const tdAct = document.createElement("td");
    tdAct.className="col-actions";
    const edit = document.createElement("button");
    edit.className="row-btn"; edit.textContent="✏️"; edit.title="編集";
    edit.onclick = ()=>openEntry(ri);
    const del = document.createElement("button");
    del.className="row-btn"; del.textContent="🗑"; del.title="削除";
    del.onclick = ()=>{ if(confirm("この行を削除しますか？")){ state.rows.splice(ri,1); persistLocal(); render(); } };
    tdAct.appendChild(edit); tdAct.appendChild(del);
    trb.appendChild(tdAct);

    body.appendChild(trb);
  });
}

function urlCell(url){
  const td = document.createElement("td");
  if(url){
    const a = document.createElement("a");
    a.href = url; a.target="_blank"; a.rel="noopener";
    a.className="url-link"; a.textContent = shorten(url);
    a.title = url;
    td.appendChild(a);
  }else{
    const span = document.createElement("span");
    span.className="muted"; span.textContent="—";
    td.appendChild(span);
  }
  return td;
}
function shorten(url){
  try{ const u=new URL(url); return u.hostname.replace(/^www\./,"") + (u.pathname.length>1?"…":""); }
  catch(e){ return url.length>30 ? url.slice(0,30)+"…" : url; }
}

function imgUrl(filename){
  if(/^https?:|^data:/.test(filename)) return filename;
  if(cfg.owner && cfg.repo){
    return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${IMG_DIR}/${filename}`;
  }
  return filename;
}

/* ---------- 登録モーダル ---------- */
function openEntry(editIndex){
  entry = { editIndex: (typeof editIndex==="number"?editIndex:-1), image:"", imageIsDataUrl:false };
  const isEdit = entry.editIndex>=0;
  document.getElementById("entryTitle").textContent = isEdit ? "編集" : "新規作成";

  let row = isEdit ? state.rows[entry.editIndex] : null;
  document.getElementById("fDate").value   = row ? (row.date||today()) : today();
  document.getElementById("fName").value   = row ? (row.name||"") : "";
  document.getElementById("fRival").value  = row ? (row.rival||"") : "";
  document.getElementById("fSupply").value = row ? (row.supply||"") : "";
  entry.image = row ? (row.image||"") : "";

  renderEntryImage();
  document.getElementById("entryModal").hidden = false;
}
function closeEntry(){ document.getElementById("entryModal").hidden = true; }

function renderEntryImage(){
  const box = document.getElementById("entryImageBox");
  box.innerHTML = "";
  if(entry.image){
    const img = document.createElement("img");
    img.src = entry.imageIsDataUrl ? entry.image : imgUrl(entry.image);
    img.className = "entry-preview";
    img.title = "クリックで差し替え";
    img.onclick = pickEntryImage;
    box.appendChild(img);
  }else{
    const drop = document.createElement("div");
    drop.className="img-drop"; drop.textContent="画像を選択";
    drop.onclick = pickEntryImage;
    box.appendChild(drop);
  }
}

function pickEntryImage(){
  const input = document.createElement("input");
  input.type="file"; input.accept="image/*";
  input.onchange = async ()=>{
    const file = input.files[0]; if(!file) return;
    if(!cfg.pat){
      const reader = new FileReader();
      reader.onload = e=>{ entry.image=e.target.result; entry.imageIsDataUrl=true; renderEntryImage(); };
      reader.readAsDataURL(file);
      setStatus("⚠️ GitHub未設定のためローカルプレビュー（保存時はアップロードされません）");
      return;
    }
    setStatus("画像アップロード中…");
    try{
      const filename = await uploadImage(file);
      entry.image = filename; entry.imageIsDataUrl=false;
      renderEntryImage();
      setStatus("✅ 画像アップロード完了");
    }catch(e){ setStatus("❌ 画像アップロード失敗: "+e.message); }
  };
  input.click();
}

function saveEntry(){
  const row = {
    date:   document.getElementById("fDate").value || today(),
    image:  entry.imageIsDataUrl ? entry.image : (entry.image||""),
    name:   document.getElementById("fName").value.trim(),
    rival:  document.getElementById("fRival").value.trim(),
    supply: document.getElementById("fSupply").value.trim(),
  };
  if(entry.editIndex>=0){ state.rows[entry.editIndex] = row; }
  else { state.rows.push(row); }
  persistLocal(); render(); closeEntry();
  setStatus("✅ 登録しました（GitHubに反映するには「💾 GitHubに保存」）");
}

/* ---------- 画像アップロード ---------- */
async function uploadImage(file){
  const ext = (file.name.split(".").pop()||"png").toLowerCase();
  const filename = `img_${Date.now().toString(36)}.${ext}`;
  const b64 = await fileToBase64(file);
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${IMG_DIR}/${filename}`;
  const res = await fetch(url, {
    method:"PUT",
    headers:{ Authorization:`token ${cfg.pat}`, Accept:"application/vnd.github+json" },
    body: JSON.stringify({ message:`add image ${filename}`, content:b64, branch:cfg.branch })
  });
  if(!res.ok){ throw new Error((await res.json()).message || res.status); }
  return filename;
}
function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result.split(",")[1]);
    r.onerror=rej; r.readAsDataURL(file);
  });
}

/* ---------- GitHub データ保存 ---------- */
async function saveToGitHub(){
  if(!cfg.pat||!cfg.owner||!cfg.repo){ openSettings(); setStatus("⚠️ 先にGitHub設定を入力してください"); return; }
  setStatus("保存中…");
  try{
    await fetchDataSha();
    const content = b64encode(JSON.stringify(state, null, 2));
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_PATH}`;
    const body = { message:`update ${DATA_PATH}`, content, branch:cfg.branch };
    if(dataSha) body.sha = dataSha;
    const res = await fetch(url, {
      method:"PUT",
      headers:{ Authorization:`token ${cfg.pat}`, Accept:"application/vnd.github+json" },
      body: JSON.stringify(body)
    });
    if(!res.ok){ throw new Error((await res.json()).message || res.status); }
    dataSha = (await res.json()).content.sha;
    setStatus("✅ GitHubに保存しました");
  }catch(e){ setStatus("❌ 保存失敗: "+e.message); }
}

async function fetchDataSha(){
  try{
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_PATH}?ref=${cfg.branch}`;
    const res = await fetch(url, { headers:{ Authorization:`token ${cfg.pat}`, Accept:"application/vnd.github+json" } });
    if(res.ok){ dataSha = (await res.json()).sha; } else dataSha = null;
  }catch(e){ dataSha = null; }
}

async function loadFromGitHub(){
  if(!cfg.owner||!cfg.repo) return;
  try{
    const raw = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${DATA_PATH}?t=${Date.now()}`;
    const res = await fetch(raw);
    if(res.ok){
      const data = await res.json();
      if(data && Array.isArray(data.rows)){ state = data; persistLocal(); render(); }
    }
  }catch(e){ /* 初回はファイルが無いので無視 */ }
}

function b64encode(str){ return btoa(unescape(encodeURIComponent(str))); }

/* ---------- 設定モーダル ---------- */
function openSettings(){
  document.getElementById("cfgPat").value = cfg.pat;
  document.getElementById("cfgOwner").value = cfg.owner;
  document.getElementById("cfgRepo").value = cfg.repo;
  document.getElementById("cfgBranch").value = cfg.branch || "main";
  document.getElementById("settingsModal").hidden = false;
}
function closeSettings(){ document.getElementById("settingsModal").hidden = true; }

/* ---------- UI バインド ---------- */
function bindUI(){
  document.getElementById("btnNew").onclick = ()=>openEntry(-1);
  document.getElementById("btnCloseEntry").onclick = closeEntry;
  document.getElementById("btnSaveEntry").onclick = saveEntry;
  document.getElementById("btnSave").onclick = saveToGitHub;
  document.getElementById("btnSettings").onclick = openSettings;
  document.getElementById("btnCloseSettings").onclick = closeSettings;
  document.getElementById("btnSaveSettings").onclick = ()=>{
    cfg.pat = document.getElementById("cfgPat").value.trim();
    cfg.owner = document.getElementById("cfgOwner").value.trim();
    cfg.repo = document.getElementById("cfgRepo").value.trim();
    cfg.branch = document.getElementById("cfgBranch").value.trim() || "main";
    saveCfg(); closeSettings();
    setStatus("✅ 設定を保存しました");
    loadFromGitHub();
  };
}

function setStatus(msg){
  const el = document.getElementById("status");
  el.textContent = msg;
  if(msg && msg.startsWith("✅")) setTimeout(()=>{ if(el.textContent===msg) el.textContent=""; }, 3500);
}

document.addEventListener("DOMContentLoaded", init);
