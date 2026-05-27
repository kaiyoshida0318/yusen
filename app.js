/* 優先順位決定くん app.js
   - データ構造: { columns:[{id,label,type}], rows:[{cells:{colId:value}}] }
   - type: 'date' | 'image' | 'text'
   - GitHub Contents API でデータ(data/products.json)と画像(images/)を直接保存 */

const VERSION = "1.0.0";
const DATA_PATH = "data/products.json";
const IMG_DIR = "images";
const LS_CFG = "yusen_cfg_v1";
const LS_DATA = "yusen_data_v1";

let state = { columns: [], rows: [] };
let cfg = { pat:"", owner:"", repo:"", branch:"main" };
let dataSha = null; // 既存products.jsonのsha（更新時に必要）

/* ---------- 初期化 ---------- */
function init(){
  document.getElementById("version").textContent = "v"+VERSION;
  loadCfg();
  loadData();
  bindUI();
  render();
}

function loadCfg(){
  try{ const c = JSON.parse(localStorage.getItem(LS_CFG)); if(c) cfg = {...cfg, ...c}; }catch(e){}
}
function saveCfg(){ localStorage.setItem(LS_CFG, JSON.stringify(cfg)); }

function loadData(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(LS_DATA)); }catch(e){}
  if(saved && saved.columns){ state = saved; return; }
  // 初期状態: 日付・画像 + 空白列を3つ
  state = {
    columns: [
      { id:"date",  label:"日付",  type:"date"  },
      { id:"image", label:"画像",  type:"image" },
      { id:col(),   label:"",     type:"text"  },
      { id:col(),   label:"",     type:"text"  },
      { id:col(),   label:"",     type:"text"  },
    ],
    rows: []
  };
}
function persistLocal(){ localStorage.setItem(LS_DATA, JSON.stringify(state)); }

let _c = 0;
function col(){ return "c"+Date.now().toString(36)+(_c++); }

/* ---------- レンダリング ---------- */
function render(){
  const head = document.getElementById("gridHead");
  const body = document.getElementById("gridBody");

  // ヘッダー
  const tr = document.createElement("tr");
  state.columns.forEach(c=>{
    const th = document.createElement("th");
    if(c.type==="date") th.className="col-date";
    if(c.type==="image") th.className="col-image";
    const label = document.createElement("span");
    label.className="th-label";
    label.textContent = c.label;
    // 日付・画像のラベルは固定、空白列のみ編集可
    if(c.type==="text"){
      label.contentEditable = "true";
      label.dataset.col = c.id;
      label.addEventListener("blur", e=>{
        c.label = e.target.textContent.trim();
        persistLocal();
      });
      const del = document.createElement("button");
      del.className="th-del"; del.textContent="×"; del.title="この列を削除";
      del.onclick = ()=>removeColumn(c.id);
      th.appendChild(del);
    }
    th.appendChild(label);
    tr.appendChild(th);
  });
  const thAct = document.createElement("th");
  thAct.className="col-actions"; thAct.textContent="";
  tr.appendChild(thAct);
  head.innerHTML=""; head.appendChild(tr);

  // 本体
  body.innerHTML="";
  state.rows.forEach((row, ri)=>{
    const trb = document.createElement("tr");
    state.columns.forEach(c=>{
      const td = document.createElement("td");
      if(c.type==="date") td.className="col-date";
      if(c.type==="image") td.className="col-image";
      td.appendChild(cellEl(c, row, ri));
      trb.appendChild(td);
    });
    const tdAct = document.createElement("td");
    tdAct.className="col-actions";
    const del = document.createElement("button");
    del.className="col-del"; del.textContent="🗑"; del.title="行を削除";
    del.onclick = ()=>{ state.rows.splice(ri,1); persistLocal(); render(); };
    tdAct.appendChild(del);
    trb.appendChild(tdAct);
    body.appendChild(trb);
  });
}

function cellEl(c, row, ri){
  const val = row.cells[c.id] || "";
  if(c.type==="date"){
    const inp = document.createElement("input");
    inp.type="date"; inp.value=val;
    inp.style.cssText="border:none;background:transparent;font:inherit;outline:none;padding:4px";
    inp.onchange = e=>{ row.cells[c.id]=e.target.value; persistLocal(); };
    return inp;
  }
  if(c.type==="image"){
    const wrap = document.createElement("div"); wrap.className="img-cell";
    if(val){
      const img = document.createElement("img");
      img.src = imgUrl(val); img.title="クリックで差し替え";
      img.onclick = ()=>pickImage(row, c.id);
      wrap.appendChild(img);
    }else{
      const drop = document.createElement("div");
      drop.className="img-drop"; drop.textContent="画像を選択";
      drop.onclick = ()=>pickImage(row, c.id);
      wrap.appendChild(drop);
    }
    return wrap;
  }
  // text
  const inp = document.createElement("input");
  inp.type="text"; inp.value=val; inp.placeholder="";
  inp.oninput = e=>{ row.cells[c.id]=e.target.value; persistLocal(); };
  return inp;
}

// 画像はリポジトリのimages/に保存される想定。valueにはファイル名を格納
function imgUrl(filename){
  if(/^https?:|^data:/.test(filename)) return filename;
  if(cfg.owner && cfg.repo){
    return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${IMG_DIR}/${filename}`;
  }
  return filename;
}

/* ---------- 行・列操作 ---------- */
function addRow(){
  const r = { cells:{} };
  state.columns.forEach(c=>{ r.cells[c.id] = c.type==="date" ? today() : ""; });
  state.rows.push(r); persistLocal(); render();
}
function addColumn(){
  state.columns.push({ id:col(), label:"", type:"text" });
  persistLocal(); render();
}
function removeColumn(id){
  if(!confirm("この列を削除しますか？入力済みの値も消えます。")) return;
  state.columns = state.columns.filter(c=>c.id!==id);
  state.rows.forEach(r=>{ delete r.cells[id]; });
  persistLocal(); render();
}
function today(){ const d=new Date(); return d.toISOString().slice(0,10); }

/* ---------- 画像アップロード ---------- */
function pickImage(row, colId){
  const input = document.createElement("input");
  input.type="file"; input.accept="image/*";
  input.onchange = async ()=>{
    const file = input.files[0]; if(!file) return;
    if(!cfg.pat){
      // 未設定ならとりあえずローカルプレビュー（DataURL）
      const reader = new FileReader();
      reader.onload = e=>{ row.cells[colId]=e.target.result; persistLocal(); render(); };
      reader.readAsDataURL(file);
      setStatus("⚠️ GitHub未設定のためローカルプレビュー保存（保存時にアップロードされません）");
      return;
    }
    setStatus("画像アップロード中…");
    try{
      const filename = await uploadImage(file);
      row.cells[colId]=filename; persistLocal(); render();
      setStatus("✅ 画像アップロード完了");
    }catch(e){ setStatus("❌ 画像アップロード失敗: "+e.message); }
  };
  input.click();
}

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
    // 既存shaを取得（更新の場合）
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
    if(res.ok){ dataSha = (await res.json()).sha; }
    else dataSha = null;
  }catch(e){ dataSha = null; }
}

// 既存データの読み込み（GitHubから）
async function loadFromGitHub(){
  if(!cfg.owner||!cfg.repo) return;
  try{
    const raw = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${DATA_PATH}?t=${Date.now()}`;
    const res = await fetch(raw);
    if(res.ok){
      const data = await res.json();
      if(data && data.columns){ state = data; persistLocal(); render(); setStatus("✅ GitHubから読み込みました"); }
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
  document.getElementById("btnAddRow").onclick = addRow;
  document.getElementById("btnAddCol").onclick = addColumn;
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
  if(msg && msg.startsWith("✅")) setTimeout(()=>{ if(el.textContent===msg) el.textContent=""; }, 3000);
}

document.addEventListener("DOMContentLoaded", init);
