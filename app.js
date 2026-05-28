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

let state = { rows: [], categories: DEFAULT_CATEGORIES.slice() };
let cfg = { pat:"", owner:"", repo:"", branch:"main" };
let dataSha = null;
let currentCat = "all"; // 現在選択中のカテゴリID

// 登録モーダルの作業用。image=メインライバル画像, suppliers=作業中の仕入先配列
let entry = { editIndex:-1, image:"", imageIsDataUrl:false, suppliers:[], rakumart:[], category:"" };
// セクション一括折りたたみ（モーダル開く度にリセット）
let sectionCollapsed = { rakumart:false, suppliers:false };

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
  state = { rows: [], categories: DEFAULT_CATEGORIES.slice() };
}
// 旧データ（supply文字列・categoriesなし）を新スキーマに変換
function migrate(data){
  if(!Array.isArray(data.categories) || data.categories.length===0){
    data.categories = DEFAULT_CATEGORIES.slice();
  }
  data.rows.forEach(r=>{
    if(!Array.isArray(r.suppliers)){
      r.suppliers = [];
      if(r.supply){ r.suppliers.push({ image:"", url:r.supply, memo:"" }); delete r.supply; }
    }
    if(!Array.isArray(r.rakumart)) r.rakumart = [];
    if(typeof r.category !== "string") r.category = "";
  });
  return data;
}
function persistLocal(){ localStorage.setItem(LS_DATA, JSON.stringify(state)); }

function today(){ const d=new Date(); return d.toISOString().slice(0,10); }

/* ---------- カテゴリタブ ---------- */
function renderTabs(){
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
}
function countForCat(id){
  if(id==="all") return state.rows.length;
  return state.rows.filter(r=>r.category===id).length;
}
function filteredRows(){
  if(currentCat==="all") return state.rows.map((r,i)=>({r,i}));
  return state.rows.map((r,i)=>({r,i})).filter(x=>x.r.category===currentCat);
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
  // 新規作成時は、すぐ入力できるようラクマート1件・仕入先1件を初期投入
  if(!isEdit){
    if(entry.rakumart.length===0) entry.rakumart.push({ text:"", url:"", collapsed:false });
    if(entry.suppliers.length===0) entry.suppliers.push({ image:"", imageIsDataUrl:false, url:"", memo:"", collapsed:false });
  }
  // カテゴリ: 編集時はその値、新規時は現在表示中のタブ（"all"の場合は未設定）
  entry.category = row ? (row.category||"") : (currentCat==="all" ? "" : currentCat);
  // 新規作成時はセクションを閉じておく（必要なものだけ開いて使う）。編集時は展開。
  sectionCollapsed = isEdit ? { rakumart:false, suppliers:false } : { rakumart:true, suppliers:true };
  renderCatSelect();

  renderEntryImage();
  renderRakumart();
  renderSuppliers();
  document.getElementById("entryModal").hidden = false;
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
    img.className = "entry-preview"; img.title = "クリックで差し替え";
    img.onclick = ()=>pickImageInto(entry, "image");
    box.appendChild(img);
  }else{
    const drop = document.createElement("div");
    drop.className="img-drop"; drop.textContent="画像を選択";
    drop.onclick = ()=>pickImageInto(entry, "image");
    box.appendChild(drop);
  }
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
        im.className="supplier-preview"; im.title="クリックで差し替え";
        im.onclick=()=>pickImageInto(s,"image", renderSuppliers);
        imgBox.appendChild(im);
      }else{
        const drop=document.createElement("div"); drop.className="img-drop"; drop.textContent="仕入先画像";
        drop.onclick=()=>pickImageInto(s,"image", renderSuppliers);
        imgBox.appendChild(drop);
      }
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
  input.onchange = async ()=>{
    const file = input.files[0]; if(!file) return;
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
  };
  input.click();
}

function saveEntry(){
  const row = {
    date:  document.getElementById("fDate").value || today(),
    image: entry.image || "",
    name:  document.getElementById("fName").value.trim(),
    rival: document.getElementById("fRival").value.trim(),
    category: document.getElementById("fCategory").value || "",
    rakumart: entry.rakumart.map(r=>({ text:(r.text||"").trim(), url:(r.url||"").trim() })).filter(r=>r.text||r.url),
    suppliers: entry.suppliers.map(s=>({ image:s.image||"", url:(s.url||"").trim(), memo:(s.memo||"").trim() })),
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
  document.getElementById("btnSave").onclick = saveToGitHub;
  document.getElementById("btnSettings").onclick = openSettings;
  document.getElementById("btnManageCats").onclick = openCatManager;
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
