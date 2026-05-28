/* 優先順位決定くん app.js
   - データ構造: { rows:[ {date, image, name, rival, category, rakumart:[{text,url}], suppliers:[{image,url,memo}]} ],
                   categories:[{id,label,icon}] }
     image = メインライバル画像 / rival = ライバルURL
     rakumart = ラクマートの商品リンク配列（貼り付けで表示テキスト+URLを自動取得）
     suppliers = 仕入先（中国輸入元）の配列。各 {image, url, memo}
   - 新規作成モーダルで登録 → 表形式で一覧表示
   - GitHub Contents API でデータ(data/products.json)と画像(images/)を直接保存 */

const VERSION = "1.4.0";
const DATA_PATH = "data/products.json";
const IMG_DIR = "images";
const LS_CFG = "yusen_cfg_v1";
const LS_DATA = "yusen_data_v1";

const COLUMNS = [
  { key:"date",   label:"日付" },
  { key:"image",  label:"画像" },
  { key:"name",   label:"項目名" },
  { key:"rival",  label:"ライバルURL" },
  { key:"rakumart", label:"ラクマート" },
  { key:"supply", label:"仕入先" },
];

// デフォルトのカテゴリ（後から追加・編集・並べ替え・削除可能）
const DEFAULT_CATEGORIES = [
  { id:"new",    label:"新商品", icon:"✨" },
  { id:"rakuten",label:"楽天",   icon:"🛒" },
  { id:"yahoo",  label:"Yahoo",  icon:"🛍️" },
];
const ALL_CAT = { id:"all", label:"全体", icon:"📊" }; // 特別カテゴリ（全件表示）

// 下段：進捗ステータス（state.statuses で管理、追加・編集・削除可能）
const DEFAULT_STATUSES = [
  { id:"buy",       label:"買付前・済" },
  { id:"arrived",   label:"到着分" },
  { id:"prearrive", label:"到着前" },
  { id:"working",   label:"着手中" },
  { id:"done",      label:"完了分" },
];
const ALL_STATUS = { id:"all", label:"全体" }; // 全件表示の特別タブ

let state = { rows: [], categories: DEFAULT_CATEGORIES.slice(), statuses: DEFAULT_STATUSES.slice() };
let cfg = { pat:"", owner:"", repo:"", branch:"main" };
let dataSha = null;
let currentCat = "all"; // 現在選択中のカテゴリID（上段）
let currentStatus = "all"; // 現在選択中のステータスID（下段）
let dateSort = "none";   // 日付ソート: "none" | "asc" | "desc"

// 登録モーダルの作業用。image=メインライバル画像, suppliers=作業中の仕入先配列
let entry = { editIndex:-1, image:"", imageIsDataUrl:false, suppliers:[], rakumart:[], tables:[], category:"" };
// セクション一括折りたたみ（モーダル開く度にリセット）
let sectionCollapsed = { rakumart:false, suppliers:false, tables:false };

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
  if(saved && Array.isArray(saved.rows)){ state = migrate(saved); return; }
  state = { rows: [], categories: DEFAULT_CATEGORIES.slice(), statuses: DEFAULT_STATUSES.slice() };
}
// 旧データ（supply文字列・categoriesなし）を新スキーマに変換
function migrate(data){
  if(!Array.isArray(data.categories) || data.categories.length===0){
    data.categories = DEFAULT_CATEGORIES.slice();
  }
  if(!Array.isArray(data.statuses) || data.statuses.length===0){
    data.statuses = DEFAULT_STATUSES.slice();
  }
  data.rows.forEach(r=>{
    if(!Array.isArray(r.suppliers)){
      r.suppliers = [];
      if(r.supply){ r.suppliers.push({ image:"", url:r.supply, memo:"" }); delete r.supply; }
    }
    if(!Array.isArray(r.rakumart)) r.rakumart = [];
    if(!Array.isArray(r.tables)) r.tables = [];
    if(typeof r.category !== "string") r.category = "";
    if(typeof r.status !== "string") r.status = "";
  });
  return data;
}
function persistLocal(){ localStorage.setItem(LS_DATA, JSON.stringify(state)); }

function today(){ const d=new Date(); return d.toISOString().slice(0,10); }

/* ---------- カテゴリタブ ---------- */
function renderTabs(){
  // 上段：販路カテゴリ
  const wrap = document.getElementById("catTabs");
  wrap.innerHTML = "";
  const all = [ALL_CAT, ...state.categories];
  all.forEach(c=>{
    const tab = document.createElement("button");
    tab.className = "cat-tab" + (c.id===currentCat ? " active" : "");
    tab.innerHTML = `<span class="cat-icon">${c.icon||""}</span><span class="cat-label">${escapeHtml(c.label)}</span><span class="cat-count">${countForCat(c.id)}</span>`;
    tab.onclick = ()=>{ currentCat = c.id; render(); };
    wrap.appendChild(tab);
  });
  // 末尾に＋行だけ＋新規作成ボタン
  const quickBtn = document.createElement("button");
  quickBtn.className = "cat-tab cat-quick"; quickBtn.title = "行だけ追加（後で編集）";
  quickBtn.innerHTML = `<span class="cat-icon">＋</span><span class="cat-label">行だけ</span>`;
  quickBtn.onclick = addQuickRow;
  wrap.appendChild(quickBtn);

  const newBtn = document.createElement("button");
  newBtn.className = "cat-tab cat-new"; newBtn.title = "新規作成";
  newBtn.innerHTML = `<span class="cat-icon">＋</span><span class="cat-label">新規作成</span>`;
  newBtn.onclick = ()=>openEntry(-1);
  wrap.appendChild(newBtn);

  // 下段：進捗ステータス
  const swrap = document.getElementById("statusTabs");
  if(swrap){
    swrap.innerHTML = "";
    [ALL_STATUS, ...state.statuses].forEach(s=>{
      const tab = document.createElement("button");
      tab.className = "status-tab" + (s.id===currentStatus ? " active" : "");
      tab.innerHTML = `<span class="cat-label">${escapeHtml(s.label)}</span><span class="cat-count">${countForStatus(s.id)}</span>`;
      tab.onclick = ()=>{ currentStatus = s.id; render(); };
      swrap.appendChild(tab);
    });
  }
}
// 上段カウント: 現在の下段ステータス絞り込みを反映
function countForCat(id){
  return state.rows.filter(r=>{
    const catOk = (id==="all") || r.category===id;
    const stOk = (currentStatus==="all") || r.status===currentStatus;
    return catOk && stOk;
  }).length;
}
// 下段カウント: 現在の上段カテゴリ絞り込みを反映
function countForStatus(id){
  return state.rows.filter(r=>{
    const catOk = (currentCat==="all") || r.category===currentCat;
    const stOk = (id==="all") || r.status===id;
    return catOk && stOk;
  }).length;
}
function filteredRows(){
  let arr = state.rows.map((r,i)=>({r,i})).filter(x=>{
    const catOk = (currentCat==="all") || x.r.category===currentCat;
    const stOk  = (currentStatus==="all") || x.r.status===currentStatus;
    return catOk && stOk;
  });
  if(dateSort!=="none"){
    arr = arr.slice().sort((a,b)=>{
      const da = a.r.date || "", db = b.r.date || "";
      // 空の日付は常に末尾へ
      if(!da && !db) return 0;
      if(!da) return 1;
      if(!db) return -1;
      const cmp = da < db ? -1 : da > db ? 1 : 0;
      return dateSort==="asc" ? cmp : -cmp;
    });
  }
  return arr;
}
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

// 行だけ追加（モーダルを開かず空の行を1つだけ）
function addQuickRow(){
  state.rows.push({
    date: today(),
    image: "",
    name: "",
    rival: "",
    category: (currentCat==="all" ? "" : currentCat),
    status: (currentStatus==="all" ? "" : currentStatus),
    rakumart: [],
    suppliers: [],
  });
  persistLocal(); render();
  setStatus("✅ 行を追加しました（後で✏️から編集）");
}

/* ---------- 一覧レンダリング ---------- */
function render(){
  renderTabs();
  const head = document.getElementById("gridHead");
  const body = document.getElementById("gridBody");

  const tr = document.createElement("tr");
  COLUMNS.forEach(c=>{
    const th = document.createElement("th");
    if(c.key==="date"){
      th.className="col-date sortable";
      const arrow = dateSort==="asc" ? " ▲" : dateSort==="desc" ? " ▼" : " ⇅";
      th.innerHTML = `${c.label}<span class="sort-arrow">${arrow}</span>`;
      th.title = "クリックで日付の昇順／降順を切り替え";
      th.onclick = ()=>{
        dateSort = dateSort==="none" ? "asc" : dateSort==="asc" ? "desc" : "none";
        render();
      };
    }else{
      if(c.key==="image") th.className="col-image";
      th.textContent = c.label;
    }
    tr.appendChild(th);
  });
  const thAct = document.createElement("th");
  thAct.className="col-actions"; thAct.textContent="操作";
  tr.appendChild(thAct);
  head.innerHTML=""; head.appendChild(tr);

  body.innerHTML="";
  const list = filteredRows();
  if(list.length===0){
    const trEmpty = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = COLUMNS.length+1;
    td.className = "empty-row";
    if(state.rows.length===0){
      td.textContent = "まだ登録がありません。「＋ 新規作成」から追加してください。";
    }else{
      td.textContent = "このカテゴリにはまだデータがありません。";
    }
    trEmpty.appendChild(td); body.appendChild(trEmpty);
    return;
  }

  list.forEach(({r:row, i:ri})=>{
    const trb = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.className="col-date"; tdDate.textContent = row.date || "";
    trb.appendChild(tdDate);

    // 画像列: メインライバル画像 + 仕入先画像の先頭2枚
    const tdImg = document.createElement("td");
    tdImg.className="col-image";
    const imgWrap = document.createElement("div"); imgWrap.className="img-cell-multi";
    const imgs = [];
    if(row.image) imgs.push(row.image);
    (row.suppliers||[]).forEach(s=>{ if(s.image) imgs.push(s.image); });
    const top2 = imgs.slice(0,2);
    if(top2.length===0){
      const span=document.createElement("span"); span.className="muted"; span.textContent="—";
      imgWrap.appendChild(span);
    }else{
      top2.forEach(fn=>{ const im=document.createElement("img"); im.src=imgUrl(fn); imgWrap.appendChild(im); });
    }
    tdImg.appendChild(imgWrap);
    trb.appendChild(tdImg);

    const tdName = document.createElement("td");
    tdName.textContent = row.name || "";
    trb.appendChild(tdName);

    trb.appendChild(urlCell(row.rival));

    // ラクマート列
    const tdRak = document.createElement("td");
    const raks = row.rakumart||[];
    if(raks.length===0){
      const sp=document.createElement("span"); sp.className="muted"; sp.textContent="—";
      tdRak.appendChild(sp);
    }else{
      raks.forEach(r=>{
        const line=document.createElement("div"); line.className="sup-line";
        if(r.url){
          const a=document.createElement("a"); a.href=r.url; a.target="_blank"; a.rel="noopener";
          a.className="url-link"; a.textContent = r.text || r.url; a.title = r.url;
          line.appendChild(a);
        }else{
          const sp=document.createElement("span"); sp.textContent = r.text || "";
          line.appendChild(sp);
        }
        tdRak.appendChild(line);
      });
    }
    trb.appendChild(tdRak);

    // 仕入先列: 件数 + 各URLリンク
    const tdSup = document.createElement("td");
    const sups = row.suppliers||[];
    if(sups.length===0){
      const span=document.createElement("span"); span.className="muted"; span.textContent="—";
      tdSup.appendChild(span);
    }else{
      sups.forEach((s,i)=>{
        const line=document.createElement("div"); line.className="sup-line";
        if(s.url){
          const a=document.createElement("a"); a.href=s.url; a.target="_blank"; a.rel="noopener";
          a.className="url-link"; a.textContent=`仕入${i+1}: ${shorten(s.url)}`; a.title=s.url;
          line.appendChild(a);
        }else{
          const sp=document.createElement("span"); sp.textContent=`仕入${i+1}`; line.appendChild(sp);
        }
        if(s.memo){ const m=document.createElement("span"); m.className="sup-memo"; m.textContent=" "+s.memo; line.appendChild(m); }
        tdSup.appendChild(line);
      });
    }
    trb.appendChild(tdSup);

    const tdAct = document.createElement("td");
    tdAct.className="col-actions";
    const edit = document.createElement("button");
    edit.className="act-btn act-edit"; edit.textContent="編集";
    edit.onclick = ()=>openEntry(ri);
    const del = document.createElement("button");
    del.className="act-btn act-del"; del.textContent="削除";
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
    a.className="url-link"; a.textContent = shorten(url); a.title = url;
    td.appendChild(a);
  }else{
    const span = document.createElement("span"); span.className="muted"; span.textContent="—";
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
  const isEdit = (typeof editIndex==="number" && editIndex>=0);
  entry = { editIndex: isEdit?editIndex:-1, image:"", imageIsDataUrl:false, suppliers:[], category:"" };
  document.getElementById("entryTitle").textContent = isEdit ? "編集" : "新規作成";

  let row = isEdit ? state.rows[editIndex] : null;
  document.getElementById("fDate").value  = row ? (row.date||today()) : today();
  document.getElementById("fName").value  = row ? (row.name||"") : "";
  document.getElementById("fRival").value = row ? (row.rival||"") : "";
  entry.image = row ? (row.image||"") : "";
  entry.suppliers = row && Array.isArray(row.suppliers)
    ? row.suppliers.map(s=>({ image:s.image||"", imageIsDataUrl:false, url:s.url||"", memo:s.memo||"", collapsed:false }))
    : [];
  entry.rakumart = row && Array.isArray(row.rakumart)
    ? row.rakumart.map(r=>({ text:r.text||"", url:r.url||"", collapsed:false }))
    : [];
  // 表（ディープコピー）
  entry.tables = row && Array.isArray(row.tables)
    ? row.tables.map(t=>({
        collapsed:false,
        rows: (t.rows||[]).map(rr=>({
          image: rr.image||"", imageIsDataUrl:false,
          cells: (rr.cells||[]).map(c=>({ text:c.text||"", url:c.url||"" }))
        }))
      }))
    : [];
  // 新規作成時は、すぐ入力できるようラクマート1件・仕入先1件を初期投入
  if(!isEdit){
    if(entry.rakumart.length===0) entry.rakumart.push({ text:"", url:"", collapsed:false });
    if(entry.suppliers.length===0) entry.suppliers.push({ image:"", imageIsDataUrl:false, url:"", memo:"", collapsed:false });
  }
  // カテゴリ: 編集時はその値、新規時は現在表示中のタブ（"all"の場合は未設定）
  entry.category = row ? (row.category||"") : (currentCat==="all" ? "" : currentCat);
  // ステータス: 編集時はその値、新規時は現在の下段タブ（"all"の場合は未設定）
  entry.status = row ? (row.status||"") : (currentStatus==="all" ? "" : currentStatus);
  // 新規作成時はセクションを閉じておく（必要なものだけ開いて使う）。編集時は展開。
  sectionCollapsed = isEdit ? { rakumart:false, suppliers:false, tables:false } : { rakumart:true, suppliers:true, tables:true };
  renderCatSelect();
  renderStatusSelect();

  renderEntryImage();
  renderRakumart();
  renderSuppliers();
  renderTables();
  document.getElementById("entryModal").hidden = false;
}

function renderStatusSelect(){
  const sel = document.getElementById("fStatus");
  if(!sel) return;
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = "— 未設定 —";
  sel.appendChild(opt0);
  state.statuses.forEach(s=>{
    const o = document.createElement("option");
    o.value = s.id; o.textContent = s.label;
    if(s.id===entry.status) o.selected = true;
    sel.appendChild(o);
  });
}

function renderCatSelect(){
  const sel = document.getElementById("fCategory");
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = "— 未分類 —";
  sel.appendChild(opt0);
  state.categories.forEach(c=>{
    const o = document.createElement("option");
    o.value = c.id; o.textContent = `${c.icon||""} ${c.label}`;
    if(c.id===entry.category) o.selected = true;
    sel.appendChild(o);
  });
}
function closeEntry(){ document.getElementById("entryModal").hidden = true; }

function renderEntryImage(){
  const box = document.getElementById("entryImageBox");
  box.innerHTML = "";
  if(entry.image){
    const img = document.createElement("img");
    img.src = entry.imageIsDataUrl ? entry.image : imgUrl(entry.image);
    img.className = "entry-preview"; img.title = "クリック／ドロップで差し替え";
    img.onclick = ()=>pickImageInto(entry, "image");
    box.appendChild(img);
  }else{
    const drop = document.createElement("div");
    drop.className="img-drop"; drop.innerHTML="クリック<br>またはドロップ";
    drop.onclick = ()=>pickImageInto(entry, "image");
    box.appendChild(drop);
  }
  // 画像エリア全体をドロップ対象に（差し替えも可）
  enableImageDrop(box, entry, "image");
}


// 仕入先セットの描画
function renderSuppliers(){
  // セクション一括折りたたみ
  const sec = document.getElementById("suppliersSection");
  if(sec) sec.classList.toggle("section-collapsed", sectionCollapsed.suppliers);
  const stoggle = document.getElementById("suppliersSectionToggle");
  if(stoggle) stoggle.textContent = sectionCollapsed.suppliers ? "▶" : "▼";

  const list = document.getElementById("supplierList");
  list.innerHTML = "";
  entry.suppliers.forEach((s, idx)=>{
    const card = document.createElement("div");
    card.className = "supplier-card" + (s.collapsed ? " is-collapsed" : "");

    const head = document.createElement("div"); head.className="supplier-head";
    // 折りたたみトグル
    const tg = document.createElement("button");
    tg.type="button"; tg.className="supplier-toggle";
    tg.textContent = s.collapsed ? "▶" : "▼";
    tg.title = s.collapsed ? "展開" : "折りたたむ";
    tg.onclick = ()=>{ s.collapsed = !s.collapsed; renderSuppliers(); };
    const ttl = document.createElement("span"); ttl.className="supplier-ttl"; ttl.textContent=`仕入先 ${idx+1}`;
    const summary = document.createElement("span"); summary.className="supplier-summary";
    if(s.collapsed){
      const parts=[];
      if(s.url) parts.push(s.url.replace(/^https?:\/\//,"").slice(0,40));
      if(s.memo) parts.push(s.memo);
      summary.textContent = parts.join(" / ") || "（未入力）";
    }
    const rm = document.createElement("button"); rm.type="button"; rm.className="supplier-del"; rm.textContent="×"; rm.title="この仕入先を削除";
    rm.onclick = ()=>{ entry.suppliers.splice(idx,1); renderSuppliers(); };
    head.append(tg, ttl, summary, rm);
    card.appendChild(head);

    if(!s.collapsed){
      const bodyRow = document.createElement("div"); bodyRow.className="supplier-body";

      const imgBox = document.createElement("div"); imgBox.className="supplier-image";
      if(s.image){
        const im=document.createElement("img"); im.src=s.imageIsDataUrl?s.image:imgUrl(s.image);
        im.className="supplier-preview"; im.title="クリック／ドロップで差し替え";
        im.onclick=()=>pickImageInto(s,"image", renderSuppliers);
        imgBox.appendChild(im);
      }else{
        const drop=document.createElement("div"); drop.className="img-drop"; drop.innerHTML="仕入先画像<br>クリック／ドロップ";
        drop.onclick=()=>pickImageInto(s,"image", renderSuppliers);
        imgBox.appendChild(drop);
      }
      enableImageDrop(imgBox, s, "image", renderSuppliers);
      bodyRow.appendChild(imgBox);

      const fields = document.createElement("div"); fields.className="supplier-fields";
      const lUrl=document.createElement("label"); lUrl.textContent="仕入先URL";
      const iUrl=document.createElement("input"); iUrl.type="text"; iUrl.placeholder="https://..."; iUrl.value=s.url;
      iUrl.oninput=e=>{ s.url=e.target.value; }; lUrl.appendChild(iUrl);
      const lMemo=document.createElement("label"); lMemo.textContent="メモ";
      const iMemo=document.createElement("input"); iMemo.type="text"; iMemo.placeholder="単価・MOQ・備考など"; iMemo.value=s.memo;
      iMemo.oninput=e=>{ s.memo=e.target.value; }; lMemo.appendChild(iMemo);
      fields.appendChild(lUrl); fields.appendChild(lMemo);
      bodyRow.appendChild(fields);

      card.appendChild(bodyRow);
    }
    list.appendChild(card);
  });
}

function addSupplier(){
  entry.suppliers.push({ image:"", imageIsDataUrl:false, url:"", memo:"", collapsed:false });
  renderSuppliers();
}

function toggleSectionSuppliers(){
  sectionCollapsed.suppliers = !sectionCollapsed.suppliers;
  renderSuppliers();
}

/* ---------- 表（画像＋テキスト列） ---------- */
// テキストセルにリンク貼り付け対応のエディタを作る（ラクマートと同じ挙動）
function makeLinkCell(cell){
  const ed = document.createElement("div");
  ed.className = "tbl-cell-edit";
  ed.contentEditable = "true";
  ed.setAttribute("spellcheck","false");
  if(cell.text || cell.url){
    if(cell.url){
      const a = document.createElement("a");
      a.href = cell.url; a.target="_blank"; a.rel="noopener";
      a.textContent = cell.text || cell.url;
      ed.appendChild(a);
    }else{
      ed.textContent = cell.text;
    }
  }
  const sync = ()=>{
    const a = ed.querySelector("a[href]");
    if(a){ cell.text=(a.textContent||"").trim(); cell.url=a.getAttribute("href")||""; }
    else{
      const t = ed.textContent.trim();
      if(/^https?:\/\/\S+$/i.test(t)){ cell.text=t; cell.url=t; }
      else { cell.text=t; cell.url=""; }
    }
    ed.classList.toggle("is-empty", !(ed.textContent.trim() || ed.querySelector("a")));
  };
  ed.addEventListener("input", sync);
  ed.addEventListener("paste", e=>{
    try{
      const html  = e.clipboardData && e.clipboardData.getData("text/html");
      const plain = e.clipboardData && e.clipboardData.getData("text/plain");
      if(html){
        const tmp=document.createElement("div"); tmp.innerHTML=html;
        const a=tmp.querySelector("a[href]");
        if(a){
          e.preventDefault(); ed.innerHTML="";
          const link=document.createElement("a");
          link.href=a.getAttribute("href"); link.target="_blank"; link.rel="noopener";
          link.textContent=(a.textContent||"").trim()||a.getAttribute("href");
          ed.appendChild(link); sync(); return;
        }
      }
      if(plain && /^https?:\/\/\S+$/i.test(plain.trim())){
        e.preventDefault(); ed.innerHTML="";
        const link=document.createElement("a");
        link.href=plain.trim(); link.target="_blank"; link.rel="noopener";
        link.textContent=plain.trim();
        ed.appendChild(link); sync(); return;
      }
    }catch(err){}
    setTimeout(sync,0);
  });
  ed.classList.toggle("is-empty", !(ed.textContent.trim() || ed.querySelector("a")));
  return ed;
}

function renderTables(){
  const sec = document.getElementById("tablesSection");
  if(sec) sec.classList.toggle("section-collapsed", sectionCollapsed.tables);
  const stoggle = document.getElementById("tablesSectionToggle");
  if(stoggle) stoggle.textContent = sectionCollapsed.tables ? "▶" : "▼";

  const wrap = document.getElementById("tablesList");
  if(!wrap) return;
  wrap.innerHTML = "";
  entry.tables.forEach((tbl, ti)=>{
    const card = document.createElement("div"); card.className="tbl-card";

    // ヘッダー（タイトル + 列追加 + 行追加 + 表削除）
    const head = document.createElement("div"); head.className="tbl-head";
    const ttl = document.createElement("span"); ttl.className="tbl-ttl"; ttl.textContent=`表 ${ti+1}`;
    const addCol = document.createElement("button"); addCol.type="button"; addCol.className="btn btn-ghost btn-sm"; addCol.textContent="＋列";
    addCol.onclick = ()=>{ tbl.rows.forEach(r=>r.cells.push({text:"",url:""})); renderTables(); };
    const addRow = document.createElement("button"); addRow.type="button"; addRow.className="btn btn-ghost btn-sm"; addRow.textContent="＋行";
    addRow.onclick = ()=>{ const nc=(tbl.rows[0]?tbl.rows[0].cells.length:1); tbl.rows.push({image:"",imageIsDataUrl:false,cells:Array.from({length:nc},()=>({text:"",url:""}))}); renderTables(); };
    const delTbl = document.createElement("button"); delTbl.type="button"; delTbl.className="tbl-del-btn"; delTbl.textContent="× 表を削除";
    delTbl.onclick = ()=>{ if(confirm("この表を削除しますか？")){ entry.tables.splice(ti,1); renderTables(); } };
    head.append(ttl, addCol, addRow, delTbl);
    card.appendChild(head);

    // テーブル本体
    const table = document.createElement("table"); table.className="tbl-grid";
    tbl.rows.forEach((r, ri)=>{
      const tr = document.createElement("tr");
      // 画像セル
      const tdImg = document.createElement("td"); tdImg.className="tbl-img-cell";
      const imgBox = document.createElement("div"); imgBox.className="tbl-img-box";
      if(r.image){
        const im=document.createElement("img"); im.src=r.imageIsDataUrl?r.image:imgUrl(r.image);
        im.className="tbl-img"; im.title="クリック／ドロップで差し替え";
        im.onclick=()=>pickImageInto(r,"image",renderTables);
        imgBox.appendChild(im);
      }else{
        const drop=document.createElement("div"); drop.className="img-drop"; drop.innerHTML="画像";
        drop.onclick=()=>pickImageInto(r,"image",renderTables);
        imgBox.appendChild(drop);
      }
      enableImageDrop(imgBox, r, "image", renderTables);
      tdImg.appendChild(imgBox);
      tr.appendChild(tdImg);
      // テキストセル群
      r.cells.forEach((cell, ci)=>{
        const td = document.createElement("td"); td.className="tbl-txt-cell";
        td.appendChild(makeLinkCell(cell));
        tr.appendChild(td);
      });
      // 行削除
      const tdDel = document.createElement("td"); tdDel.className="tbl-rowdel-cell";
      const rd = document.createElement("button"); rd.type="button"; rd.className="tbl-rowdel"; rd.textContent="×"; rd.title="この行を削除";
      rd.onclick = ()=>{ tbl.rows.splice(ri,1); if(tbl.rows.length===0){ entry.tables.splice(ti,1); } renderTables(); };
      tdDel.appendChild(rd);
      tr.appendChild(tdDel);
      table.appendChild(tr);
    });
    card.appendChild(table);
    wrap.appendChild(card);
  });
}

function addTable(){
  // 初期3行・テキスト列1
  const rows = Array.from({length:3}, ()=>({ image:"", imageIsDataUrl:false, cells:[{text:"",url:""}] }));
  entry.tables.push({ collapsed:false, rows });
  renderTables();
}

function toggleSectionTables(){
  sectionCollapsed.tables = !sectionCollapsed.tables;
  renderTables();
}



/* ---------- ラクマート ---------- */
function renderRakumart(){
  // セクション一括折りたたみ
  const sec = document.getElementById("rakumartSection");
  if(sec) sec.classList.toggle("section-collapsed", sectionCollapsed.rakumart);
  const stoggle = document.getElementById("rakumartSectionToggle");
  if(stoggle) stoggle.textContent = sectionCollapsed.rakumart ? "▶" : "▼";

  const list = document.getElementById("rakumartList");
  list.innerHTML = "";
  entry.rakumart.forEach((r, idx)=>{
    const card = document.createElement("div");
    card.className = "rakumart-row" + (r.collapsed ? " is-collapsed" : "");

    // 個別折りたたみトグル
    const tg = document.createElement("button");
    tg.type="button"; tg.className="rakumart-toggle";
    tg.textContent = r.collapsed ? "▶" : "▼";
    tg.title = r.collapsed ? "展開" : "折りたたむ";
    tg.onclick = ()=>{ r.collapsed = !r.collapsed; renderRakumart(); };

    const num = document.createElement("span"); num.className="rakumart-num"; num.textContent = `#${entry.rakumart.length - idx}`;

    let bodyEl;
    if(r.collapsed){
      bodyEl = document.createElement("div"); bodyEl.className="rakumart-summary";
      if(r.text || r.url){
        const a = document.createElement("a");
        a.href = r.url || "#"; a.target="_blank"; a.rel="noopener";
        a.textContent = r.text || r.url;
        bodyEl.appendChild(a);
      }else{
        const sp = document.createElement("span"); sp.className="muted"; sp.textContent="（未入力）";
        bodyEl.appendChild(sp);
      }
    }else{
      bodyEl = document.createElement("div");
      bodyEl.className = "rakumart-paste";
      bodyEl.contentEditable = "true";
      bodyEl.setAttribute("role","textbox");
      bodyEl.setAttribute("spellcheck","false");
      if(r.text || r.url){
        if(r.url){
          const a = document.createElement("a");
          a.href = r.url; a.target = "_blank"; a.rel="noopener";
          a.textContent = r.text || r.url;
          bodyEl.appendChild(a);
        }else{
          bodyEl.textContent = r.text;
        }
      }
      const sync = ()=>{
        const a = bodyEl.querySelector("a[href]");
        if(a){
          r.text = (a.textContent||"").trim();
          r.url  = a.getAttribute("href") || "";
        }else{
          const t = bodyEl.textContent.trim();
          if(/^https?:\/\/\S+$/i.test(t)){ r.text = t; r.url = t; }
          else { r.text = t; r.url = ""; }
        }
        togglePlaceholder();
      };
      const togglePlaceholder = ()=>{
        const hasContent = bodyEl.textContent.trim().length>0 || bodyEl.querySelector("a,img");
        bodyEl.classList.toggle("is-empty", !hasContent);
      };
      bodyEl.addEventListener("input", sync);
      bodyEl.addEventListener("paste", e=>{
        try{
          const html  = e.clipboardData && e.clipboardData.getData("text/html");
          const plain = e.clipboardData && e.clipboardData.getData("text/plain");
          if(html){
            const tmp = document.createElement("div"); tmp.innerHTML = html;
            const a = tmp.querySelector("a[href]");
            if(a){
              e.preventDefault();
              bodyEl.innerHTML = "";
              const link = document.createElement("a");
              link.href = a.getAttribute("href"); link.target="_blank"; link.rel="noopener";
              link.textContent = (a.textContent||"").trim() || a.getAttribute("href");
              bodyEl.appendChild(link);
              sync();
              return;
            }
          }
          if(plain && /^https?:\/\/\S+$/i.test(plain.trim())){
            e.preventDefault();
            bodyEl.innerHTML = "";
            const link = document.createElement("a");
            link.href = plain.trim(); link.target="_blank"; link.rel="noopener";
            link.textContent = plain.trim();
            bodyEl.appendChild(link);
            sync();
            return;
          }
        }catch(err){}
        setTimeout(sync, 0);
      });
      togglePlaceholder();
    }

    const rm = document.createElement("button"); rm.type="button"; rm.className="rakumart-del"; rm.textContent="×"; rm.title="削除";
    rm.onclick = ()=>{ entry.rakumart.splice(idx,1); renderRakumart(); };

    card.append(tg, num, bodyEl, rm);
    list.appendChild(card);
  });
}

function addRakumart(){
  // 先頭に追加（最新が上に来る、番号は配列長＝最大番号になる）
  entry.rakumart.unshift({ text:"", url:"", collapsed:false });
  renderRakumart();
  const editors = document.querySelectorAll("#rakumartList .rakumart-paste");
  const first = editors[0];
  if(first) first.focus();
}

function toggleSectionRakumart(){
  sectionCollapsed.rakumart = !sectionCollapsed.rakumart;
  renderRakumart();
}

/* obj[key] に画像を取り込む（メインライバル/仕入先 共通）。cb で再描画 */
function pickImageInto(obj, key, cb){
  const input = document.createElement("input");
  input.type="file"; input.accept="image/*";
  input.onchange = ()=>{
    const file = input.files[0]; if(!file) return;
    handleImageFile(file, obj, key, cb);
  };
  input.click();
}

// ファイルを受け取って obj[key] に登録（アップロード or プレビュー）
async function handleImageFile(file, obj, key, cb){
  if(!file || !file.type || !file.type.startsWith("image/")){
    setStatus("⚠️ 画像ファイルをドロップしてください"); return;
  }
  if(!cfg.pat){
    const reader = new FileReader();
    reader.onload = e=>{
      obj[key]=e.target.result; obj.imageIsDataUrl=true;
      if(cb) cb(); else renderEntryImage();
    };
    reader.readAsDataURL(file);
    setStatus("⚠️ GitHub未設定のためローカルプレビュー（保存時はアップロードされません）");
    return;
  }
  setStatus("画像アップロード中…");
  try{
    const filename = await uploadImage(file);
    obj[key]=filename; obj.imageIsDataUrl=false;
    if(cb) cb(); else renderEntryImage();
    setStatus("✅ 画像アップロード完了");
  }catch(e){ setStatus("❌ 画像アップロード失敗: "+e.message); }
}

// 要素にドラッグ&ドロップで画像登録できるようにする
function enableImageDrop(el, obj, key, cb){
  el.addEventListener("dragover", e=>{ e.preventDefault(); e.stopPropagation(); el.classList.add("drag-over"); });
  el.addEventListener("dragleave", e=>{ e.preventDefault(); e.stopPropagation(); el.classList.remove("drag-over"); });
  el.addEventListener("drop", e=>{
    e.preventDefault(); e.stopPropagation(); el.classList.remove("drag-over");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(file) handleImageFile(file, obj, key, cb);
  });
}

function saveEntry(){
  const row = {
    date:  document.getElementById("fDate").value || today(),
    image: entry.image || "",
    name:  document.getElementById("fName").value.trim(),
    rival: document.getElementById("fRival").value.trim(),
    category: document.getElementById("fCategory").value || "",
    status: document.getElementById("fStatus").value || "",
    rakumart: entry.rakumart.map(r=>({ text:(r.text||"").trim(), url:(r.url||"").trim() })).filter(r=>r.text||r.url),
    suppliers: entry.suppliers.map(s=>({ image:s.image||"", url:(s.url||"").trim(), memo:(s.memo||"").trim() })),
    tables: entry.tables.map(t=>({
      rows: t.rows.map(r=>({
        image: r.image||"",
        cells: r.cells.map(c=>({ text:(c.text||"").trim(), url:(c.url||"").trim() }))
      }))
    })),
  };
  if(entry.editIndex>=0){ state.rows[entry.editIndex] = row; }
  else { state.rows.push(row); }
  persistLocal(); render(); closeEntry();
  setStatus("✅ 登録しました（GitHubに反映するには「💾 GitHubに保存」）");
}

/* ---------- 画像アップロード ---------- */
async function uploadImage(file){
  const ext = (file.name.split(".").pop()||"png").toLowerCase();
  const filename = `img_${Date.now().toString(36)}_${Math.floor(Math.random()*1000)}.${ext}`;
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
      if(data && Array.isArray(data.rows)){ state = migrate(data); persistLocal(); render(); }
    }
  }catch(e){ /* 初回はファイルが無いので無視 */ }
}

function b64encode(str){ return btoa(unescape(encodeURIComponent(str))); }

/* ---------- カテゴリ管理 ---------- */
const CAT_ICONS = ["📦","✨","🛒","🛍️","📊","🎯","🔥","⭐","🏷️","💡","📸","🎨","📝","🆕","🇯🇵","🇨🇳"];

function openCatManager(){
  renderCatManager();
  document.getElementById("catModal").hidden = false;
}
function closeCatManager(){ document.getElementById("catModal").hidden = true; }

function renderCatManager(){
  const list = document.getElementById("catList");
  list.innerHTML = "";
  state.categories.forEach((c, idx)=>{
    const row = document.createElement("div"); row.className = "cat-row";
    // 絵文字セレクター
    const iconBtn = document.createElement("button");
    iconBtn.className = "cat-icon-btn"; iconBtn.textContent = c.icon || "📦";
    iconBtn.onclick = ()=>{
      const cur = CAT_ICONS.indexOf(c.icon);
      c.icon = CAT_ICONS[(cur+1) % CAT_ICONS.length];
      persistLocal(); renderCatManager(); renderTabs();
    };
    iconBtn.title = "クリックで絵文字を切り替え";
    // ラベル入力
    const labelInp = document.createElement("input");
    labelInp.type = "text"; labelInp.value = c.label; labelInp.className = "cat-label-input";
    labelInp.onchange = ()=>{ c.label = labelInp.value.trim() || c.label; persistLocal(); renderTabs(); };
    // 並べ替えボタン
    const up = document.createElement("button"); up.className="cat-mv"; up.textContent="▲";
    up.disabled = idx===0;
    up.onclick = ()=>{ if(idx>0){ [state.categories[idx-1], state.categories[idx]] = [state.categories[idx], state.categories[idx-1]]; persistLocal(); renderCatManager(); renderTabs(); } };
    const dn = document.createElement("button"); dn.className="cat-mv"; dn.textContent="▼";
    dn.disabled = idx===state.categories.length-1;
    dn.onclick = ()=>{ if(idx<state.categories.length-1){ [state.categories[idx+1], state.categories[idx]] = [state.categories[idx], state.categories[idx+1]]; persistLocal(); renderCatManager(); renderTabs(); } };
    // 削除
    const del = document.createElement("button"); del.className="cat-del"; del.textContent="🗑";
    del.title = "このカテゴリを削除（中のデータは「未分類」になります）";
    del.onclick = ()=>{
      if(!confirm(`カテゴリ「${c.label}」を削除しますか？\n中のデータは「未分類」になります（データ自体は消えません）。`)) return;
      state.rows.forEach(r=>{ if(r.category===c.id) r.category=""; });
      state.categories.splice(idx,1);
      if(currentCat===c.id) currentCat="all";
      persistLocal(); renderCatManager(); render();
    };
    row.append(iconBtn, labelInp, up, dn, del);
    list.appendChild(row);
  });
}

function addCategory(){
  const label = document.getElementById("newCatLabel").value.trim();
  if(!label){ setStatus("⚠️ カテゴリ名を入力してください"); return; }
  const id = "c_"+Date.now().toString(36);
  state.categories.push({ id, label, icon:"📦" });
  document.getElementById("newCatLabel").value = "";
  persistLocal(); renderCatManager(); renderTabs();
}

/* ---------- ステータス管理 ---------- */
function openStatusManager(){
  renderStatusManager();
  document.getElementById("statusModal").hidden = false;
}
function closeStatusManager(){ document.getElementById("statusModal").hidden = true; }

function renderStatusManager(){
  const list = document.getElementById("statusList");
  list.innerHTML = "";
  state.statuses.forEach((s, idx)=>{
    const row = document.createElement("div"); row.className = "cat-row";
    const labelInp = document.createElement("input");
    labelInp.type = "text"; labelInp.value = s.label; labelInp.className = "cat-label-input";
    labelInp.onchange = ()=>{ s.label = labelInp.value.trim() || s.label; persistLocal(); renderTabs(); };
    const up = document.createElement("button"); up.className="cat-mv"; up.textContent="▲";
    up.disabled = idx===0;
    up.onclick = ()=>{ if(idx>0){ [state.statuses[idx-1], state.statuses[idx]] = [state.statuses[idx], state.statuses[idx-1]]; persistLocal(); renderStatusManager(); renderTabs(); } };
    const dn = document.createElement("button"); dn.className="cat-mv"; dn.textContent="▼";
    dn.disabled = idx===state.statuses.length-1;
    dn.onclick = ()=>{ if(idx<state.statuses.length-1){ [state.statuses[idx+1], state.statuses[idx]] = [state.statuses[idx], state.statuses[idx+1]]; persistLocal(); renderStatusManager(); renderTabs(); } };
    const del = document.createElement("button"); del.className="cat-del"; del.textContent="🗑";
    del.title = "このステータスを削除（中のデータは「未設定」になります）";
    del.onclick = ()=>{
      if(!confirm(`ステータス「${s.label}」を削除しますか？\n中のデータは「未設定」になります（データ自体は消えません）。`)) return;
      state.rows.forEach(r=>{ if(r.status===s.id) r.status=""; });
      state.statuses.splice(idx,1);
      if(currentStatus===s.id) currentStatus="all";
      persistLocal(); renderStatusManager(); render();
    };
    row.append(labelInp, up, dn, del);
    list.appendChild(row);
  });
}

function addStatus(){
  const label = document.getElementById("newStatusLabel").value.trim();
  if(!label){ setStatus("⚠️ ステータス名を入力してください"); return; }
  const id = "s_"+Date.now().toString(36);
  state.statuses.push({ id, label });
  document.getElementById("newStatusLabel").value = "";
  persistLocal(); renderStatusManager(); renderTabs();
}

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
  document.getElementById("btnCloseEntry").onclick = closeEntry;
  document.getElementById("btnSaveEntry").onclick = saveEntry;
  document.getElementById("btnAddSupplier").onclick = addSupplier;
  document.getElementById("btnAddRakumart").onclick = addRakumart;
  document.getElementById("rakumartSectionToggle").onclick = toggleSectionRakumart;
  document.getElementById("suppliersSectionToggle").onclick = toggleSectionSuppliers;
  document.getElementById("btnAddTable").onclick = addTable;
  document.getElementById("tablesSectionToggle").onclick = toggleSectionTables;
  document.getElementById("btnSave").onclick = saveToGitHub;
  document.getElementById("btnSettings").onclick = openSettings;
  document.getElementById("btnManageCats").onclick = openCatManager;
  document.getElementById("btnManageStatus").onclick = openStatusManager;
  document.getElementById("btnCloseStatus").onclick = closeStatusManager;
  document.getElementById("btnAddStatus").onclick = addStatus;
  document.getElementById("newStatusLabel").addEventListener("keydown", e=>{ if(e.key==="Enter") addStatus(); });
  document.getElementById("btnCloseSettings").onclick = closeSettings;
  document.getElementById("btnCloseCat").onclick = closeCatManager;
  document.getElementById("btnAddCat").onclick = addCategory;
  document.getElementById("newCatLabel").addEventListener("keydown", e=>{ if(e.key==="Enter") addCategory(); });
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
