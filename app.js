/* 優先順位決定くん app.js
   - データ構造: { rows:[ {date, image, name, rival, category, rakumart:[{text,url}], suppliers:[{image,url,memo}]} ],
                   categories:[{id,label,icon}] }
     image = メインライバル画像 / rival = ライバルURL
     rakumart = ラクマートの商品リンク配列（貼り付けで表示テキスト+URLを自動取得）
     suppliers = 仕入先（中国輸入元）の配列。各 {image, url, memo}
   - 新規作成モーダルで登録 → 表形式で一覧表示
   - GitHub Contents API でデータ(data/products.json)と画像(images/)を直接保存 */

const VERSION = "1.52.6";
const DATA_PATH = "data/products.json";
const IMG_DIR = "images";
const LS_CFG = "yusen_cfg_v1";
const LS_DATA = "yusen_data_v1";

const COLUMNS = [
  { key:"date",   label:"日付" },
  { key:"doneDate", label:"完了日付" },
  { key:"image",  label:"画像" },
  { key:"name",   label:"商品名" },
  { key:"expectedSales", label:"予想月商" },
  { key:"ranking", label:"ランキング" },
  { key:"rivalR", label:"楽天ライバル" },
  { key:"rivalA", label:"Amazonライバル" },
  { key:"rakumart", label:"ラクマート" },
  { key:"supply", label:"仕入先" },
  { key:"statusSel", label:"商品状態" },
  { key:"rakutenSel", label:"楽天" },
  { key:"yahooSel", label:"Yahoo" },
  { key:"actions", label:"操作" },
];

/* 列の表示設定（localStorageに保存、端末ごとの好み）
   shape: { [key]: { visible, width(px|null), wrap("wrap"|"clip") } } */
const LS_COLS = "yusen_cols_v1";
let colCfg = {};
function loadColCfg(){
  try{ const c = JSON.parse(localStorage.getItem(LS_COLS)); if(c && typeof c==="object") colCfg = c; }catch(_){}
}
function saveColCfg(){ try{ localStorage.setItem(LS_COLS, JSON.stringify(colCfg)); }catch(_){} }
function getColCfg(key){
  return colCfg[key] || { visible:true, width:null, wrap:"wrap", align:"left", headAlign:"left" };
}
function setColCfg(key, patch){
  colCfg[key] = { ...getColCfg(key), ...patch };
  saveColCfg();
}
// 一覧表で現在実際に表示されている列幅(px)を取得（自動幅の確認用）。
// 該当の th が見つからない（列が非表示など）場合は null。
function getRenderedColWidth(key){
  const th = document.querySelector(`#gridHead th[data-col-key="${key}"]`);
  if(!th) return null;
  const w = th.getBoundingClientRect().width;
  return w > 0 ? Math.round(w) : null;
}
// 列の表示スタイルを要素に反映（isHeader=true でタイトル行、false でデータセル）
function applyColStyle(el, cc, isHeader){
  if(cc.width && cc.width > 0){
    el.style.width = cc.width + "px";
    el.style.minWidth = cc.width + "px";
    el.style.maxWidth = cc.width + "px";
  }
  if(cc.wrap === "clip"){
    el.style.whiteSpace = "nowrap";
    el.style.overflow = "hidden";
    el.style.textOverflow = "ellipsis";
  }else{
    el.style.whiteSpace = "";
    el.style.overflow = "";
    el.style.textOverflow = "";
  }
  // テキストの揃え（左/中央/右）。タイトル行は headAlign、データは align
  const a = isHeader ? cc.headAlign : cc.align;
  if(a === "left" || a === "center" || a === "right"){
    el.style.textAlign = a;
  }else{
    el.style.textAlign = "";
  }
}

// デフォルトのカテゴリ（後から追加・編集・並べ替え・削除可能）
const DEFAULT_CATEGORIES = [
  { id:"new",    label:"新商品", icon:"✨" },
  { id:"rakuten",label:"楽天",   icon:"logo:rakuten" },
  { id:"yahoo",  label:"Yahoo",  icon:"logo:yahoo" },
];
const ALL_CAT = { id:"all", label:"全体", icon:"📊" }; // 特別カテゴリ（全件表示）
const NONE_CAT = { id:"none", label:"未設定", icon:"❓" }; // 未分類の行を表示

// 下段：進捗ステータス（state.statuses で管理、追加・編集・削除可能）
const DEFAULT_STATUSES = [
  { id:"buy",       label:"買付前",             icon:"num:1" },
  { id:"bought",    label:"買付済",             icon:"num:2" },
  { id:"prearrive", label:"到着前",             icon:"num:3" },
  { id:"arrived",   label:"到着分",             icon:"num:4" },
  { id:"renewal",   label:"リニューアル検討分", icon:"num:4" },
  { id:"nextup",    label:"次やる候補",         icon:"num:5" },
  { id:"working",   label:"制作着手中",         icon:"num:6" },
  { id:"done",      label:"完了分" },
];
const ALL_STATUS = { id:"all", label:"①-⑥全体" }; // 完了分を除いた行を表示
const ALL_FULL_STATUS = { id:"allfull", label:"全件" }; // 完了分も含む全件
const NONE_STATUS = { id:"none", label:"未設定" }; // 未設定の行を表示

// 楽天・Yahoo の制作状態（それぞれ編集・追加可能）
const DEFAULT_RAKUTEN_STATUSES = [
  { id:"r_pre",   label:"制作前" },
  { id:"r_new",   label:"新規制作予定" },
  { id:"r_renew", label:"リニューアル必要" },
  { id:"r_none",  label:"不要" },
];
const DEFAULT_YAHOO_STATUSES = [
  { id:"y_pre",         label:"制作前" },
  { id:"y_new",         label:"新規制作予定" },
  { id:"y_new_multi",   label:"新規制作予定-複数枚" },
  { id:"y_renew",       label:"リニューアル必要" },
  { id:"y_renew_multi", label:"リニューアル必要-複数枚" },
  { id:"y_none",        label:"不要" },
];

let state = { rows: [], categories: DEFAULT_CATEGORIES.slice(), statuses: DEFAULT_STATUSES.slice(), rakutenStatuses: DEFAULT_RAKUTEN_STATUSES.slice(), yahooStatuses: DEFAULT_YAHOO_STATUSES.slice() };
let cfg = { pat:"", owner:"kaiyoshida0318", repo:"yusen", branch:"main" };
let dataSha = null;
let currentCat = "all"; // 現在選択中のカテゴリID（上段）
let statusMgrAxis = "status"; // ステータス管理モーダルで編集中の軸
// 3軸それぞれの絞り込み選択（全部AND条件）。"all"はその軸で絞らない
let currentStatusByAxis = { status:"all", rakuten:"all", yahoo:"all" };
let dateSort = "desc";   // 日付ソート初期値は降順（新しい日付が上）: "none" | "asc" | "desc"
let pendingStatus = {};  // 一覧でのステータス保留変更 { rowIndex: newStatusId }
let pendingCat = {};     // 一覧でのカテゴリ保留変更 { rowIndex: newCatId }
let catIconOpen = -1;    // カテゴリ管理で絵文字パレットを開いているインデックス
let selectMode = false;  // 一括削除の選択モード
let selectedRows = {};   // 選択中の行 { rowIndex: true }
let listEditMode = false; // 一覧インライン編集モード（項目名・予想月商を表上で直接編集）
let colResizeMode = false; // 列幅ドラッグ調整モード（一覧表ヘッダーの境界をドラッグ）

// 登録モーダルの作業用。image=メインライバル画像, suppliers=作業中の仕入先配列
let entry = { editIndex:-1, image:"", imageIsDataUrl:false, suppliers:[], rakumart:[], tables:[], rivalRakuten:[], rivalAmazon:[], rankingUrls:[], freeNote:"", category:"", blocks:[] };
// セクション一括折りたたみ（モーダル開く度にリセット）
let sectionCollapsed = { rakumart:false, suppliers:false, tables:false };
// ブロックID採番用
let blockSeq = 0;
function nextBlockId(){ return "b_" + (Date.now().toString(36)) + "_" + (blockSeq++); }
// 新規作成時の「入力済みか」判定用スナップショット（null=編集中 or 判定不要）
let entrySnapshot = null;

/* ---------- 初期化 ---------- */
function init(){
  document.getElementById("version").textContent = "v"+VERSION;
  loadCfg();
  loadColCfg();
  loadData();
  bindUI();
  render();
  loadFromGitHub();
  updateStickyHeight();
  window.addEventListener("resize", updateStickyHeight);
}

// 上部固定領域の高さを CSS 変数として設定（テーブルヘッダや本文の余白に使う）
function updateStickyHeight(){
  const el = document.querySelector(".sticky-top");
  if(!el) return;
  // 高さの小数差で1pxずれて見えるのを防ぐため切り上げ
  const h = Math.ceil(el.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--sticky-h", h + "px");
}

function loadCfg(){
  try{ const c = JSON.parse(localStorage.getItem(LS_CFG)); if(c) cfg = {...cfg, ...c}; }catch(e){}
}
function saveCfg(){ localStorage.setItem(LS_CFG, JSON.stringify(cfg)); }

function loadData(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(LS_DATA)); }catch(e){}
  if(saved && Array.isArray(saved.rows)){ state = migrate(saved); persistLocal(); return; }
  state = { rows: [], categories: DEFAULT_CATEGORIES.slice(), statuses: DEFAULT_STATUSES.slice(), rakutenStatuses: DEFAULT_RAKUTEN_STATUSES.slice(), yahooStatuses: DEFAULT_YAHOO_STATUSES.slice() };
}
// 旧データ（supply文字列・categoriesなし）を新スキーマに変換
function migrate(data){
  if(!Array.isArray(data.categories) || data.categories.length===0){
    data.categories = DEFAULT_CATEGORIES.slice();
  }
  // 既定の 楽天/Yahoo カテゴリが旧デフォルト絵文字のままなら、ブランドロゴへ更新
  // （ユーザーが別の絵文字に変更している場合はそのまま尊重）
  data.categories.forEach(c=>{
    if(c.id==="rakuten" && (c.icon==="🛒" || !c.icon)) c.icon = "logo:rakuten";
    if(c.id==="yahoo"   && (c.icon==="🛍️" || c.icon==="🛍" || !c.icon)) c.icon = "logo:yahoo";
  });
  if(!Array.isArray(data.statuses) || data.statuses.length===0){
    data.statuses = DEFAULT_STATUSES.slice();
  }
  if(!Array.isArray(data.rakutenStatuses) || data.rakutenStatuses.length===0){
    data.rakutenStatuses = DEFAULT_RAKUTEN_STATUSES.slice();
  }
  if(!Array.isArray(data.yahooStatuses) || data.yahooStatuses.length===0){
    data.yahooStatuses = DEFAULT_YAHOO_STATUSES.slice();
  }
  // 既定ステータスに番号ロゴが未設定なら補完（icon未定義のものだけ）
  const DEF_STATUS_ICON = { buy:"num:1", bought:"num:2", prearrive:"num:3", arrived:"num:4", renewal:"num:4", nextup:"num:5", working:"num:6" };
  data.statuses.forEach(s=>{
    if(typeof s.icon === "undefined" && DEF_STATUS_ICON[s.id]) s.icon = DEF_STATUS_ICON[s.id];
    // ラベル先頭の番号文字（①②③④）を削除（バッジと二重表示になるため）
    if(typeof s.label === "string"){
      s.label = s.label.replace(/^[①②③④⑤⑥]\s*/, "").trim();
    }
  });
  // ステータス構成の刷新（買付前/買付済の分割・番号振り直し・制作着手中=5）。一度だけ実行。
  if(!data._statusMigV2){
    const NEW_STATUSES = [
      { id:"buy",       label:"買付前",             icon:"num:1" },
      { id:"bought",    label:"買付済",             icon:"num:2" },
      { id:"prearrive", label:"到着前",             icon:"num:3" },
      { id:"arrived",   label:"到着分",             icon:"num:4" },
      { id:"renewal",   label:"リニューアル検討分", icon:"num:4" },
      { id:"working",   label:"制作着手中",         icon:"num:5" },
      { id:"done",      label:"完了分" },
    ];
    // 旧id→ラベル（先頭番号は除去済み）
    const oldLabelById = {};
    (data.statuses || []).forEach(s=>{ oldLabelById[s.id] = (s.label || "").replace(/^[①②③④⑤⑥]\s*/, "").trim(); });
    // ラベル→新id（旧ラベルの揺れも吸収）
    const labelToNewId = {
      "買付前":"buy", "買付済":"bought", "買付前・済":"buy", "買付":"buy",
      "到着前":"prearrive",
      "到着分":"arrived", "到着":"arrived",
      "リニューアル検討分":"renewal", "リニューアル検討":"renewal", "リニューアル":"renewal",
      "制作着手中":"working", "着手中":"working", "制作中":"working",
      "完了分":"done", "完了":"done",
    };
    const validNewId = id => NEW_STATUSES.some(n=>n.id===id);
    // 各行のステータスを新idへ付け替え（ラベル基準）
    data.rows.forEach(r=>{
      if(!r.status) return;
      const lbl = oldLabelById[r.status];
      let newId = "";
      if(lbl && labelToNewId[lbl]) newId = labelToNewId[lbl];
      else if(labelToNewId[r.status]) newId = labelToNewId[r.status];
      else if(validNewId(r.status)) newId = r.status; // 既に新id
      r.status = validNewId(newId) ? newId : "";
    });
    data.statuses = NEW_STATUSES;
    data._statusMigV2 = true;
  }
  // ステータス構成の再更新（「次やる候補」を5に追加・制作着手中を6へ）。一度だけ実行。
  if(!data._statusMigV3){
    data.statuses = [
      { id:"buy",       label:"買付前",             icon:"num:1" },
      { id:"bought",    label:"買付済",             icon:"num:2" },
      { id:"prearrive", label:"到着前",             icon:"num:3" },
      { id:"arrived",   label:"到着分",             icon:"num:4" },
      { id:"renewal",   label:"リニューアル検討分", icon:"num:4" },
      { id:"nextup",    label:"次やる候補",         icon:"num:5" },
      { id:"working",   label:"制作着手中",         icon:"num:6" },
      { id:"done",      label:"完了分" },
    ];
    // 既存の各行のステータス割り当ては id を維持するのでそのまま有効
    // （nextup は新規なので割り当て0からスタート）
    data._statusMigV3 = true;
  }
  // 標準ステータス「次やる候補」が state.statuses に無ければ補完（移行フラグに関係なく毎回）
  if(Array.isArray(data.statuses) && !data.statuses.some(s=>s.id==="nextup")){
    const idx = data.statuses.findIndex(s=>s.id==="renewal");
    const item = { id:"nextup", label:"次やる候補", icon:"num:5" };
    if(idx>=0) data.statuses.splice(idx+1, 0, item);
    else data.statuses.push(item);
  }
  data.rows.forEach(r=>{
    if(typeof r.expectedSales !== "number") r.expectedSales = 0;
    if(typeof r.doneDate !== "string") r.doneDate = "";
    if(!Array.isArray(r.suppliers)){
      r.suppliers = [];
      if(r.supply){ r.suppliers.push({ image:"", url:r.supply, memo:"" }); delete r.supply; }
    }
    if(!Array.isArray(r.rakumart)) r.rakumart = [];
    if(!Array.isArray(r.tables)) r.tables = [];
    // ライバルURL: 旧 rival(文字列) → rivalRakuten 配列へ移行
    if(!Array.isArray(r.rivalRakuten)){
      r.rivalRakuten = [];
      if(r.rival){ r.rivalRakuten.push(r.rival); }
      delete r.rival;
    }
    if(!Array.isArray(r.rivalAmazon)) r.rivalAmazon = [];
    if(!Array.isArray(r.rankingUrls)) r.rankingUrls = [];
    if(!Array.isArray(r.companyUrls)) r.companyUrls = [];
    if(typeof r.freeNote !== "string") r.freeNote = ""; // 自由記入欄（リンク含むHTMLを保持）
    if(typeof r.category !== "string") r.category = "";
    if(typeof r.status !== "string") r.status = "";
    if(typeof r.rakutenStatus !== "string") r.rakutenStatus = "";
    if(typeof r.yahooStatus !== "string") r.yahooStatus = "";
  });
  return data;
}
function persistLocal(){
  try{
    localStorage.setItem(LS_DATA, JSON.stringify(state));
  }catch(e){
    // localStorage は通常5MB。容量超過時は DataURL 画像を抜いた軽量版で再試行
    if(e && (e.name==="QuotaExceededError" || /quota/i.test(e.message||""))){
      try{
        const slim = stripDataUrlImages(state);
        localStorage.setItem(LS_DATA, JSON.stringify(slim));
        setStatus("⚠️ ローカル保存の容量を超えたため、画像データURLは保存しませんでした（メモリ上は保持。GitHubに保存すれば画像も反映されます）");
        return;
      }catch(e2){
        console.error("persistLocal slim failed:", e2);
      }
    }
    console.error("persistLocal failed:", e);
    setStatus("⚠️ ローカル保存に失敗しました: " + (e && e.message ? e.message : e));
  }
}

// state のディープコピーを作り、DataURL（data:...）画像は空文字に置き換える
// （localStorage の容量を圧迫しないため。メモリ上の state は変更しない）
function stripDataUrlImages(src){
  const isDataUrl = v=> typeof v==="string" && v.indexOf("data:")===0;
  const stripImg = v=> isDataUrl(v) ? "" : v;
  const rows = (src.rows||[]).map(r=>{
    const nr = { ...r };
    nr.image = stripImg(r.image||"");
    nr.suppliers = (r.suppliers||[]).map(s=>({ ...s, image: stripImg(s.image||"") }));
    nr.tables = (r.tables||[]).map(t=>({
      columns: (t.columns||[]).map(c=>({ type:c.type })),
      header: (t.header||[]).slice(),
      rows: (t.rows||[]).map(rr=>({
        cells: (rr.cells||[]).map(c=>{
          if(c && typeof c.image==="string") return { ...c, image: stripImg(c.image) };
          return { ...c };
        })
      }))
    }));
    return nr;
  });
  return { ...src, rows };
}

function today(){ const d=new Date(); return d.toISOString().slice(0,10); }

/* ---------- カテゴリタブ ---------- */
function renderTabs(){
  // 上段のカテゴリ絞り込みタブは非表示（機能ボタンはYahoo行の右端へ移動）
  const wrap = document.getElementById("catTabs");
  wrap.innerHTML = "";
  currentCat = "all";

  // 一括削除／行だけ／新規作成 ボタンを生成（Yahoo行の右端に配置する）
  const buildFuncButtons = ()=>{
    const frag = document.createDocumentFragment();
    const bulkBtn = document.createElement("button");
    bulkBtn.className = "cat-tab cat-bulk func-btn" + (selectMode ? " active" : "");
    bulkBtn.title = "複数選んで一括削除";
    bulkBtn.innerHTML = selectMode
      ? `<span class="cat-icon">✖</span><span class="cat-label">選択をやめる</span>`
      : `<span class="cat-icon">🗑</span><span class="cat-label">一括削除</span>`;
    bulkBtn.onclick = ()=>{
      selectMode = !selectMode;
      selectedRows = {};
      if(selectMode && listEditMode){ listEditMode = false; updateListEditBtn(); }
      render();
    };
    const quickBtn = document.createElement("button");
    quickBtn.className = "cat-tab cat-quick func-btn"; quickBtn.title = "行だけ追加（後で編集）";
    quickBtn.innerHTML = `<span class="cat-icon">＋</span><span class="cat-label">行だけ</span>`;
    quickBtn.onclick = addQuickRow;
    const newBtn = document.createElement("button");
    newBtn.className = "cat-tab cat-new func-btn"; newBtn.title = "新規作成";
    newBtn.innerHTML = `<span class="cat-icon">＋</span><span class="cat-label">新規作成</span>`;
    newBtn.onclick = ()=>openEntry(-1);
    frag.append(bulkBtn, quickBtn, newBtn);
    return frag;
  };

  // 軸切替タブは廃止（3軸を縦3行で同時表示するため）
  const awrap = document.getElementById("axisTabs");
  if(awrap) awrap.innerHTML = "";

  // 下段：状態・楽天・Yahoo を縦3行で表示。各行で選択肢を選んで絞り込む（AND）
  const swrap = document.getElementById("statusTabs");
  if(swrap){
    swrap.innerHTML = "";
    const axisDefs = [
      { axis:"status",  rowLabel:"状態",  list:state.statuses,        hasIcon:true },
      { axis:"rakuten", rowLabel:"楽天",  list:state.rakutenStatuses, hasIcon:true },
      { axis:"yahoo",   rowLabel:"Yahoo", list:state.yahooStatuses,   hasIcon:true },
    ];
    axisDefs.forEach(def=>{
      const rowEl = document.createElement("div"); rowEl.className = "status-row";
      const rl = document.createElement("span"); rl.className = "status-row-label"; rl.textContent = def.rowLabel;
      rowEl.appendChild(rl);
      const cur = currentStatusByAxis[def.axis];
      const tabs = def.axis==="status"
        ? [ALL_STATUS, NONE_STATUS, ...def.list, ALL_FULL_STATUS]
        : [{ id:"all", label:"全体" }, NONE_STATUS, ...def.list];
      tabs.forEach(s=>{
        const tab = document.createElement("button");
        tab.className = "status-tab" + (s.id===NONE_STATUS.id ? " status-none" : "") + (s.id===cur ? " active" : "");
        let labelHtml;
        if(s.id==="all" && def.axis==="status"){
          labelHtml = `<span class="allnum" style="color:${STATUS_NUM_COLORS[1]}">①</span>-<span class="allnum" style="color:${STATUS_NUM_COLORS[6]}">⑥</span>全体`;
        }else if(s.id==="all" || s.id==="allfull" || s.id==="none"){
          labelHtml = escapeHtml(s.label);
        }else{
          labelHtml = escapeHtml((s.label||"").replace(/^[①②③④⑤⑥]\s*/,""));
        }
        const icon = def.hasIcon ? statusIconHtml(s.icon) : "";
        tab.innerHTML = `<span class="status-ico">${icon}</span><span class="cat-label">${labelHtml}</span><span class="cat-count">${countForStatusAxisTab(def.axis, s.id)}</span>`;
        tab.onclick = ()=>{ currentStatusByAxis[def.axis] = s.id; render(); };
        rowEl.appendChild(tab);
      });
      swrap.appendChild(rowEl);
    });

    // 3行の下に機能ボタン行（一番右に 一括削除／行だけ／新規作成）
    const funcRow = document.createElement("div"); funcRow.className = "status-func-row";
    const funcSpacer = document.createElement("span"); funcSpacer.className = "func-spacer";
    funcRow.appendChild(funcSpacer);
    funcRow.appendChild(buildFuncButtons());
    swrap.appendChild(funcRow);

    // 保留中の変更・一括削除の操作行（3行の下）
    const nS = Object.keys(pendingStatus).length;
    const nC = Object.keys(pendingCat).length;
    const n = nS + nC;
    if(n>0 || selectMode){
      const opRow = document.createElement("div"); opRow.className = "status-op-row";
      if(n>0){
        const clearBtn = document.createElement("button");
        clearBtn.className = "status-clear-btn";
        clearBtn.textContent = "クリア";
        clearBtn.title = "保留中の変更をすべて取り消す";
        clearBtn.onclick = ()=>{ pendingStatus = {}; pendingCat = {}; render(); };
        const applyBtn = document.createElement("button");
        applyBtn.className = "status-apply-btn";
        applyBtn.textContent = `🔄 反映（${n}件）`;
        applyBtn.onclick = applyPendingChanges;
        opRow.append(clearBtn, applyBtn);
      }
      if(selectMode){
        const cnt = Object.keys(selectedRows).length;
        const delBtn = document.createElement("button");
        delBtn.className = "status-bulkdel-btn";
        delBtn.textContent = `🗑 選択した行を削除（${cnt}件）`;
        delBtn.disabled = cnt===0;
        delBtn.onclick = deleteSelectedRows;
        if(n===0) delBtn.style.marginLeft = "auto";
        opRow.append(delBtn);
      }
      swrap.appendChild(opRow);
    }
  }
  // タブが描画されたあと、固定領域の高さを更新
  if(typeof updateStickyHeight === "function") updateStickyHeight();
}
// 上段カウント: 現在の下段ステータス絞り込みを反映
// カテゴリ/ステータスのマッチ判定: all=全部, none=未設定(空), それ以外=id一致
function catMatch(rowCat, sel){
  if(sel==="all") return true;
  if(sel==="none") return !rowCat;
  return rowCat===sel;
}
// 指定軸に対応する行のステータス値
function rowStatusOf(r, axis){
  if(axis==="rakuten") return r.rakutenStatus || "";
  if(axis==="yahoo")   return r.yahooStatus || "";
  return r.status || "";
}
// 指定軸での絞り込みマッチ判定
function statusMatchAxis(rowStatus, sel, axis){
  if(sel==="allfull") return true;
  if(sel==="all") return axis==="status" ? rowStatus!=="done" : true; // 商品状態のみ完了分除外
  if(sel==="none") return !rowStatus;
  return rowStatus===sel;
}
// 3軸すべての現在選択にマッチするか（AND）
function rowMatchesAllAxes(r){
  return statusMatchAxis(rowStatusOf(r,"status"),  currentStatusByAxis.status,  "status")
      && statusMatchAxis(rowStatusOf(r,"rakuten"), currentStatusByAxis.rakuten, "rakuten")
      && statusMatchAxis(rowStatusOf(r,"yahoo"),   currentStatusByAxis.yahoo,   "yahoo");
}
function countForCat(id){
  return state.rows.filter(r=> catMatch(r.category, id) && rowMatchesAllAxes(r)).length;
}
// あるタブ(axis,id)のカウント：他の2軸は現在選択、対象軸はidで判定
function countForStatusAxisTab(axis, id){
  return state.rows.filter(r=>{
    if(!catMatch(r.category, currentCat)) return false;
    for(const ax of ["status","rakuten","yahoo"]){
      const sel = ax===axis ? id : currentStatusByAxis[ax];
      if(!statusMatchAxis(rowStatusOf(r,ax), sel, ax)) return false;
    }
    return true;
  }).length;
}
function filteredRows(){
  let arr = state.rows.map((r,i)=>({r,i})).filter(x=> catMatch(x.r.category, currentCat) && rowMatchesAllAxes(x.r));
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

/* ---------- カテゴリアイコン（絵文字 or ブランドロゴ） ----------
   icon 値が "logo:rakuten" / "logo:yahoo" のときはSVGロゴを返す。
   それ以外は絵文字としてそのまま表示。 */
const LOGO_KEYS = { "logo:rakuten":"楽天", "logo:yahoo":"Yahoo" };
function isLogoIcon(icon){ return typeof icon==="string" && icon.indexOf("logo:")===0; }
function logoSvg(icon){
  if(icon==="logo:rakuten"){
    // 楽天：赤地に白の R
    return `<svg class="cat-logo" viewBox="0 0 20 20" aria-label="楽天" role="img">`
      + `<rect width="20" height="20" rx="4" fill="#bf0000"/>`
      + `<text x="10" y="15" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="14" fill="#fff">R</text>`
      + `</svg>`;
  }
  if(icon==="logo:yahoo"){
    // Yahoo：赤〜オレンジのグラデ地に白の Y
    return `<svg class="cat-logo" viewBox="0 0 20 20" aria-label="Yahoo" role="img">`
      + `<defs><linearGradient id="yahooGrad" x1="0" y1="0" x2="1" y2="1">`
      + `<stop offset="0" stop-color="#ff0033"/><stop offset="1" stop-color="#ff7a00"/>`
      + `</linearGradient></defs>`
      + `<rect width="20" height="20" rx="4" fill="url(#yahooGrad)"/>`
      + `<text x="10" y="15" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="14" fill="#fff">Y</text>`
      + `</svg>`;
  }
  if(isLetterIcon(icon)){ return letterSvg(icon); }
  return "";
}

/* ---------- カテゴリの色付き文字バッジ（letter:X 形式、A〜Z） ---------- */
// 文字ごとの色（同じ文字なら常に同じ色になるよう固定）
const LETTER_COLORS = {
  A:"#3f9b6e", B:"#2f6fb0", C:"#d98324", D:"#8257c9", E:"#c0392b",
  F:"#16a085", G:"#2980b9", H:"#e67e22", I:"#9b59b6", J:"#e74c3c",
  K:"#27ae60", L:"#0e7c8a", M:"#ad6a00", N:"#7d3c98", O:"#c0392b",
  P:"#117a65", Q:"#1f618d", R:"#bf0000", S:"#6d4c41", T:"#5e35b1",
  U:"#00838f", V:"#558b2f", W:"#8e24aa", X:"#5d4037", Y:"#ef6c00",
  Z:"#283593"
};
function isLetterIcon(icon){ return typeof icon==="string" && /^letter:[A-Z]$/.test(icon); }
function letterSvg(icon){
  const ch = icon.split(":")[1];
  const color = LETTER_COLORS[ch] || "#7a756d";
  return `<svg class="cat-logo" viewBox="0 0 20 20" aria-label="${ch}" role="img">`
    + `<rect width="20" height="20" rx="4" fill="${color}"/>`
    + `<text x="10" y="15" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="14" fill="#fff">${ch}</text>`
    + `</svg>`;
}
// アイコンのHTML（タブ・セレクトのテキスト用ではなくHTML描画用）
function iconHtml(icon){
  if(isLogoIcon(icon) || isLetterIcon(icon)) return logoSvg(icon);
  return escapeHtml(icon||"");
}
// セレクトの <option> 用テキスト（SVG不可なので、ロゴは空にしてラベルだけ見せる）
function iconText(icon){
  if(isLogoIcon(icon) || isLetterIcon(icon)) return "";
  return icon || "";
}

/* ---------- ステータスの番号ロゴ（丸バッジに数字 1〜4、手動選択） ----------
   ステータスの icon フィールドに "num:1"〜"num:4" を持たせると、
   ラベルの左に色付きの丸バッジ（数字入り）を表示する。未設定なら何も出さない。 */
const STATUS_NUM_COLORS = {
  1: "#3f9b6e", // 緑
  2: "#2f6fb0", // 青
  3: "#d98324", // 橙
  4: "#8257c9", // 紫
  5: "#c0392b", // 赤
  6: "#0e7c8a", // 濃青緑
};
function isNumIcon(icon){ return typeof icon==="string" && /^num:[1-6]$/.test(icon); }
function statusNumSvg(icon){
  const n = parseInt(icon.split(":")[1], 10);
  const color = STATUS_NUM_COLORS[n] || "#7a756d";
  return `<svg class="status-num" viewBox="0 0 20 20" aria-label="${n}" role="img">`
    + `<circle cx="10" cy="10" r="9" fill="${color}"/>`
    + `<text x="10" y="14.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="#fff">${n}</text>`
    + `</svg>`;
}
// ステータスのアイコンHTML（番号ロゴ or 文字バッジ。未設定は空）
function statusIconHtml(icon){
  if(isNumIcon(icon)) return statusNumSvg(icon);
  if(isTxtIcon(icon)) return statusTxtBadge(icon);
  return "";
}
// 文字バッジ（txt:OK / txt:NG / txt:SKIP など）。色は "txt:LABEL@C"(C=1..) で指定、無指定は既定色
const TXT_PRESETS = ["OK","NG","SKIP","保留","済","★","◎","○","△","✓","♥","！","⚠"];
const TXT_COLORS = { "OK":"#3f9b6e", "NG":"#c0392b", "SKIP":"#7a756d", "保留":"#d98324", "済":"#2f6fb0", "★":"#f0a500", "◎":"#3f9b6e", "○":"#2f6fb0", "△":"#d98324", "✓":"#3f9b6e", "♥":"#e0506a", "！":"#c0392b", "⚠":"#d98324" };
const TXT_COLOR_PALETTE = ["#3f9b6e", "#c0392b", "#d98324", "#2f6fb0", "#7a756d", "#8257c9", "#0e7c8a", "#e0506a", "#f0a500", "#4aa3df", "#8d6e63", "#333333"]; // 緑・赤・橙・青・グレー・紫・濃青緑・ピンク・金・水色・茶・黒
function isTxtIcon(icon){ return typeof icon==="string" && /^txt:.+/.test(icon); }
// "txt:SKIP" or "txt:SKIP@2" → { label, c(0=無指定), color }
function parseTxtIcon(icon){
  const body = icon.slice(4);
  const at = body.indexOf("@");
  const label = at>=0 ? body.slice(0,at) : body;
  const c = at>=0 ? parseInt(body.slice(at+1),10) : 0;
  const color = c>=1 ? (TXT_COLOR_PALETTE[c-1] || TXT_COLORS[label] || "#7a756d") : (TXT_COLORS[label] || "#7a756d");
  return { label, c, color };
}
function statusTxtBadge(icon){
  const { label, color } = parseTxtIcon(icon);
  return `<span class="status-txt-badge" style="background:${color}">${escapeHtml(label)}</span>`;
}
// 番号のテキスト記号（option用、SVG不可な場所で使う）
const NUM_CHARS = { 1:"①", 2:"②", 3:"③", 4:"④", 5:"⑤", 6:"⑥" };
function statusNumChar(icon){
  if(!isNumIcon(icon)) return "";
  return NUM_CHARS[parseInt(icon.split(":")[1],10)] || "";
}

// 一覧インライン編集モードの切替（項目名・予想月商を表上で直接編集）
function toggleListEditMode(){
  listEditMode = !listEditMode;
  if(listEditMode){ selectMode = false; selectedRows = {}; }
  updateListEditBtn();
  render();
}
function updateListEditBtn(){
  const b = document.getElementById("btnListEdit");
  if(!b) return;
  b.classList.toggle("active", listEditMode);
  b.textContent = listEditMode ? "✅ 編集モード終了（保存）" : "✏️ 商品名・月商編集";
}

// 行だけ追加（モーダルを開かず空の行を1つだけ）
function addQuickRow(){
  state.rows.push({
    date: today(),
    image: "",
    name: "",
    expectedSales: 0,
    rivalRakuten: [], rivalAmazon: [], rankingUrls: [], freeNote: "",
    category: ((currentCat==="all"||currentCat==="none") ? "" : currentCat),
    status: ((currentStatusByAxis.status==="all"||currentStatusByAxis.status==="none"||currentStatusByAxis.status==="allfull") ? "" : currentStatusByAxis.status),
    rakumart: [], tables: [], suppliers: [],
  });
  persistLocal(); render();
  setStatus("✅ 行を追加しました（後で編集ボタンから編集）");
}

// 選択した行を一括削除
function deleteSelectedRows(){
  const idxs = Object.keys(selectedRows).map(n=>parseInt(n,10));
  if(idxs.length===0) return;
  const hasGh = !!(cfg.pat && cfg.owner && cfg.repo);
  const confirmMsg = hasGh
    ? `${idxs.length}件削除しますか？\nこの操作は取り消せません（GitHubにも即時反映されます）。`
    : `${idxs.length}件削除しますか？\nこの操作は取り消せません（GitHub反映は「💾 GitHubに保存」）。`;
  if(!confirm(confirmMsg)) return;
  // インデックスの大きい順に削除（ずれ防止）
  idxs.sort((a,b)=>b-a).forEach(i=>{ state.rows.splice(i,1); });
  selectedRows = {};
  selectMode = false;
  persistLocal(); render();
  if(hasGh){
    setStatus(`${idxs.length}件削除しました。GitHubに反映中…`);
    saveToGitHub().catch(()=>{});
  }else{
    setStatus(`✅ ${idxs.length}件を削除しました（GitHubに反映するには「💾 GitHubに保存」）`);
  }
}

/* ---------- 一覧レンダリング ---------- */
function render(){
  renderTabs();
  const head = document.getElementById("gridHead");
  const body = document.getElementById("gridBody");

  const tr = document.createElement("tr");
  COLUMNS.forEach((c, ci)=>{
    const cc = getColCfg(c.key);
    if(cc.visible === false) return; // 非表示は描画しない
    const th = document.createElement("th");
    th.dataset.colKey = c.key;
    if(c.key==="date"){
      th.className="col-date sortable";
      const arrow = dateSort==="asc" ? " ▲" : dateSort==="desc" ? " ▼" : " ⇅";
      th.innerHTML = `${c.label}<span class="sort-arrow">${arrow}</span>`;
      th.title = "クリックで日付の昇順／降順を切り替え";
      if(!colResizeMode){
        th.onclick = ()=>{
          dateSort = dateSort==="none" ? "asc" : dateSort==="asc" ? "desc" : "none";
          render();
        };
      }
    }else{
      if(c.key==="image") th.className="col-image";
      if(c.key==="doneDate") th.className="col-date";
      if(c.key==="expectedSales") th.className="col-exp-sales";
      if(c.key==="actions") th.className="col-actions";
      if(c.key==="catSel") th.className="col-catsel";
      if(c.key==="statusSel") th.className="col-statussel";
      if(c.key==="rakutenSel") th.className="col-statussel";
      if(c.key==="yahooSel") th.className="col-statussel";
      th.textContent = c.label;
    }
    applyColStyle(th, cc, true);
    if(colResizeMode) addColResizeHandle(th, c.key);
    if(listEditMode && (c.key==="name" || c.key==="expectedSales")) th.classList.add("list-edit-col");
    tr.appendChild(th);
  });
  head.innerHTML=""; head.appendChild(tr);

  body.innerHTML="";
  const list = filteredRows();
  if(list.length===0){
    const trEmpty = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = COLUMNS.length;
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
    if(selectMode){
      trb.classList.add("selectable-row");
      if(selectedRows[ri]) trb.classList.add("row-selected");
      trb.onclick = ()=>{
        if(selectedRows[ri]) delete selectedRows[ri];
        else selectedRows[ri] = true;
        render();
      };
    }

    const tdDate = document.createElement("td");
    tdDate.className="col-date"; tdDate.textContent = row.date || "";
    trb.appendChild(tdDate);

    // 完了日付（日付の右・画像の左）
    const tdDone = document.createElement("td");
    tdDone.className="col-date"; tdDone.textContent = row.doneDate || "";
    trb.appendChild(tdDone);

    // 画像列: メインライバル画像のみ
    const tdImg = document.createElement("td");
    tdImg.className="col-image";
    const imgWrap = document.createElement("div"); imgWrap.className="img-cell-multi";
    if(row.image){
      const im=document.createElement("img"); im.src=imgUrl(row.image); imgWrap.appendChild(im);
    }else{
      const span=document.createElement("span"); span.className="muted"; span.textContent="—";
      imgWrap.appendChild(span);
    }
    tdImg.appendChild(imgWrap);
    trb.appendChild(tdImg);

    const tdName = document.createElement("td");
    if(listEditMode){
      tdName.classList.add("list-edit-cell");
      const inp = document.createElement("input");
      inp.type = "text"; inp.className = "list-edit-input";
      inp.value = row.name || ""; inp.placeholder = "商品名";
      inp.onclick = e=>e.stopPropagation();
      inp.onchange = ()=>{ if(state.rows[ri]){ state.rows[ri].name = inp.value.trim(); persistLocal(); } };
      tdName.appendChild(inp);
    }else{
      tdName.textContent = row.name || "";
    }
    trb.appendChild(tdName);

    // 予想月商
    const tdExp = document.createElement("td");
    tdExp.className = "col-exp-sales";
    const v = (typeof row.expectedSales === "number" && row.expectedSales > 0) ? row.expectedSales : 0;
    if(listEditMode){
      tdExp.classList.add("list-edit-cell");
      const wrap = document.createElement("div"); wrap.className = "list-edit-num-wrap";
      const inp = document.createElement("input");
      inp.type = "number"; inp.min = "0"; inp.step = "0.1";
      inp.className = "list-edit-input list-edit-num";
      inp.value = v > 0 ? String(v) : ""; inp.placeholder = "0";
      inp.onclick = e=>e.stopPropagation();
      inp.onchange = ()=>{
        if(!state.rows[ri]) return;
        const n = parseFloat((inp.value||"").trim());
        state.rows[ri].expectedSales = (Number.isFinite(n) && n >= 0) ? n : 0;
        persistLocal();
      };
      const unit = document.createElement("span"); unit.className = "list-edit-unit"; unit.textContent = "万円";
      wrap.append(inp, unit);
      tdExp.appendChild(wrap);
    }else{
      tdExp.textContent = v > 0 ? (v.toLocaleString() + " 万円") : "—";
    }
    trb.appendChild(tdExp);

    trb.appendChild(urlListCell(row.rankingUrls));

    trb.appendChild(urlListCell(row.rivalRakuten));
    trb.appendChild(urlListCell(row.rivalAmazon));

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
    // 閲覧（左）と編集（右）の2ボタン
    const actWrap = document.createElement("div"); actWrap.className="act-btn-row";
    const view = document.createElement("button");
    view.className="act-btn act-view"; view.textContent="閲覧";
    view.onclick = (e)=>{ e.stopPropagation(); openEntry(ri, "view"); };
    const edit = document.createElement("button");
    edit.className="act-btn act-edit"; edit.textContent="編集";
    edit.onclick = (e)=>{ e.stopPropagation(); openEntry(ri, "edit"); };
    actWrap.append(view, edit);
    tdAct.appendChild(actWrap);

    // ステータス変更ドロップダウン（カスタム：色付きバッジ表示）
    const tdStatus = document.createElement("td");
    tdStatus.className="col-statussel";
    const pending = (ri in pendingStatus) ? pendingStatus[ri] : row.status;
    const statusItems = [
      { value:"", label:"— 未設定 —", iconHtml:"" },
      ...state.statuses.map(st=>({
        value: st.id,
        label: (st.label||"").replace(/^[①②③④⑤⑥]\s*/, ""),
        iconHtml: statusIconHtml(st.icon)
      }))
    ];
    const statusSel = createCustomSelect({
      items: statusItems,
      value: pending || "",
      placeholder: "— 未設定 —",
      pending: (pending !== row.status) && (ri in pendingStatus),
      onChange: (v)=>{
        if(v === (row.status||"")){
          delete pendingStatus[ri];
        }else{
          pendingStatus[ri] = v;
        }
        // ボタンの保留中ハイライトを更新
        statusSel.classList.toggle("cs-pending", (ri in pendingStatus));
        renderTabs();
      }
    });
    tdStatus.appendChild(statusSel);

    // 楽天・Yahoo 状態ドロップダウン（即時反映。GitHubは手動保存）
    const makeAxisCell = (axisKey, statusList)=>{
      const td = document.createElement("td");
      td.className = "col-statussel";
      const cur = row[axisKey] || "";
      const items = [
        { value:"", label:"— 未設定 —", iconHtml:"" },
        ...statusList.map(st=>({ value: st.id, label: st.label||"", iconHtml: statusIconHtml(st.icon) }))
      ];
      const sel = createCustomSelect({
        items,
        value: cur,
        placeholder: "— 未設定 —",
        onChange: (v)=>{
          if(state.rows[ri]){ state.rows[ri][axisKey] = v; persistLocal(); renderTabs(); }
        }
      });
      td.appendChild(sel);
      return td;
    };
    const tdRakuten = makeAxisCell("rakutenStatus", state.rakutenStatuses);
    const tdYahoo   = makeAxisCell("yahooStatus", state.yahooStatuses);

    // 商品状態・楽天・Yahoo・操作（COLUMNS順に一致させる）
    trb.appendChild(tdStatus);
    trb.appendChild(tdRakuten);
    trb.appendChild(tdYahoo);
    trb.appendChild(tdAct);

    // 列設定に従って各tdを表示/非表示・スタイル適用（COLUMNS順とtd追加順は一致）
    const tds = trb.children;
    for(let i=0;i<COLUMNS.length && i<tds.length;i++){
      const c = COLUMNS[i];
      const cc = getColCfg(c.key);
      const td = tds[i];
      td.dataset.colKey = c.key;
      if(cc.visible === false){ td.style.display = "none"; continue; }
      applyColStyle(td, cc, false);
    }

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
// 複数URLを縦並びで表示
function urlListCell(urls){
  const td = document.createElement("td");
  const list = (urls||[]).filter(u=>u && u.trim());
  if(list.length===0){
    const span = document.createElement("span"); span.className="muted"; span.textContent="—";
    td.appendChild(span);
    return td;
  }
  list.forEach(url=>{
    const line = document.createElement("div"); line.className="sup-line";
    const a = document.createElement("a");
    a.href = url; a.target="_blank"; a.rel="noopener";
    a.className="url-link"; a.textContent = shorten(url); a.title = url;
    line.appendChild(a);
    td.appendChild(line);
  });
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

/* ---------- カスタムドロップダウン（色付きバッジ付き） ----------
   items: [{ value, label, iconHtml }] - iconHtml はSVG文字列、空なら無視
   value: 現在の選択値
   onChange: (newValue) => void
   placeholder: 未選択時の表示
   pending: trueなら色を変えて「変更保留中」表示
*/
let openCustomSelect = null; // 開いているドロップダウン参照（外クリックで閉じる用）
function createCustomSelect(opts){
  const wrap = document.createElement("div");
  wrap.className = "cs-wrap";
  if(opts.pending) wrap.classList.add("cs-pending");
  // ボタン部分
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cs-btn";
  btn.setAttribute("aria-haspopup","listbox");
  btn.setAttribute("aria-expanded","false");
  // メニュー部分
  const menu = document.createElement("div");
  menu.className = "cs-menu"; menu.hidden = true;
  menu.setAttribute("role","listbox");

  const renderBtn = ()=>{
    const cur = opts.items.find(it=>it.value===opts.value);
    if(cur){
      btn.innerHTML = `<span class="cs-ico">${cur.iconHtml||""}</span><span class="cs-lbl">${escapeHtml(cur.label)}</span><span class="cs-arrow">▾</span>`;
    }else{
      btn.innerHTML = `<span class="cs-ico"></span><span class="cs-lbl cs-placeholder">${escapeHtml(opts.placeholder||"")}</span><span class="cs-arrow">▾</span>`;
    }
  };

  const closeMenu = ()=>{
    menu.hidden = true;
    btn.setAttribute("aria-expanded","false");
    wrap.classList.remove("cs-open");
    if(openCustomSelect===wrap) openCustomSelect = null;
  };
  const positionMenu = ()=>{
    const r = btn.getBoundingClientRect();
    // 幅はボタン幅を下限にしつつ、内容に合わせて広げる（CSSの width:max-content）
    menu.style.minWidth = r.width + "px";
    menu.style.left = r.left + "px";
    // メニューの自然な高さを測るため一旦制限を外す
    menu.style.maxHeight = "none";
    const naturalH = menu.scrollHeight;
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    if(spaceBelow >= naturalH || spaceBelow >= spaceAbove){
      // 下に出す（入りきらない分はスクロール）
      menu.style.top = (r.bottom + 4) + "px";
      menu.style.maxHeight = Math.max(120, spaceBelow) + "px";
    }else{
      // 上に出す（入りきらない分はスクロール）
      const h = Math.min(naturalH, spaceAbove);
      menu.style.top = Math.max(margin, r.top - 4 - h) + "px";
      menu.style.maxHeight = Math.max(120, spaceAbove) + "px";
    }
    // 画面右にはみ出す場合は左へずらす
    const mw = menu.offsetWidth;
    if(r.left + mw > window.innerWidth - margin){
      menu.style.left = Math.max(margin, window.innerWidth - margin - mw) + "px";
    }
  };
  const openMenu = ()=>{
    // 他に開いているものがあれば閉じる
    if(openCustomSelect && openCustomSelect!==wrap){
      const otherMenu = openCustomSelect.querySelector(".cs-menu");
      if(otherMenu) otherMenu.hidden = true;
      openCustomSelect.classList.remove("cs-open");
    }
    menu.hidden = false;
    btn.setAttribute("aria-expanded","true");
    wrap.classList.add("cs-open");
    openCustomSelect = wrap;
    positionMenu();
  };

  btn.onclick = (e)=>{
    e.stopPropagation();
    if(menu.hidden) openMenu(); else closeMenu();
  };

  // メニューの各項目
  opts.items.forEach(it=>{
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "cs-opt" + (it.value===opts.value ? " cs-selected" : "");
    opt.setAttribute("role","option");
    opt.innerHTML = `<span class="cs-ico">${it.iconHtml||""}</span><span class="cs-lbl">${escapeHtml(it.label)}</span>`;
    opt.onclick = (e)=>{
      e.stopPropagation();
      opts.value = it.value;
      renderBtn();
      menu.querySelectorAll(".cs-opt").forEach(el=>el.classList.remove("cs-selected"));
      opt.classList.add("cs-selected");
      closeMenu();
      if(opts.onChange) opts.onChange(it.value);
    };
    menu.appendChild(opt);
  });

  wrap.append(btn, menu);
  renderBtn();
  return wrap;
}
// 外クリックで開いているカスタムドロップダウンを閉じる
document.addEventListener("click", ()=>{
  if(openCustomSelect){
    const m = openCustomSelect.querySelector(".cs-menu");
    if(m) m.hidden = true;
    openCustomSelect.classList.remove("cs-open");
    const b = openCustomSelect.querySelector(".cs-btn");
    if(b) b.setAttribute("aria-expanded","false");
    openCustomSelect = null;
  }
});
// スクロール／リサイズで開いているメニューを閉じる（位置ずれ防止）
window.addEventListener("scroll", ()=>{
  if(openCustomSelect){
    const m = openCustomSelect.querySelector(".cs-menu");
    if(m) m.hidden = true;
    openCustomSelect.classList.remove("cs-open");
    openCustomSelect = null;
  }
}, true);
window.addEventListener("resize", ()=>{
  if(openCustomSelect){
    const m = openCustomSelect.querySelector(".cs-menu");
    if(m) m.hidden = true;
    openCustomSelect.classList.remove("cs-open");
    openCustomSelect = null;
  }
});

/* ---------- 登録モーダル ---------- */
function openEntry(editIndex, mode){
  // mode: "edit" | "view" | undefined
  // 既存項目を編集ボタンで開く → "edit"（編集モード直行）
  // 既存項目を閲覧ボタンで開く → "view"（閲覧モード）
  // 新規作成（editIndex<0）→ 常に編集モード
  const isEdit = (typeof editIndex==="number" && editIndex>=0);
  entry = { editIndex: isEdit?editIndex:-1, image:"", imageIsDataUrl:false, suppliers:[], category:"", blocks:[] };
  document.getElementById("entryTitle").textContent = isEdit ? (mode==="view"?"閲覧":"編集") : "新規作成";

  let row = isEdit ? state.rows[editIndex] : null;
  document.getElementById("fDate").value  = row ? (row.date||today()) : today();
  const fDoneEl = document.getElementById("fDoneDate");
  if(fDoneEl) fDoneEl.value = row ? (row.doneDate||"") : "";
  document.getElementById("fName").value  = row ? (row.name||"") : "";
  const fExp = document.getElementById("fExpectedSales");
  if(fExp) fExp.value = (row && (row.expectedSales!=null)) ? String(row.expectedSales) : "";
  // ライバルURL（楽天/Amazon、最低2行ずつ確保）
  entry.rivalRakuten = row && Array.isArray(row.rivalRakuten) ? row.rivalRakuten.slice() : [];
  entry.rivalAmazon  = row && Array.isArray(row.rivalAmazon)  ? row.rivalAmazon.slice()  : [];
  while(entry.rivalRakuten.length < 2) entry.rivalRakuten.push("");
  while(entry.rivalAmazon.length  < 2) entry.rivalAmazon.push("");
  // ランキングURL（最低1行）
  entry.rankingUrls = row && Array.isArray(row.rankingUrls) ? row.rankingUrls.slice() : [];
  while(entry.rankingUrls.length < 1) entry.rankingUrls.push("");
  // 自社URL（最低1行）
  entry.companyUrls = row && Array.isArray(row.companyUrls) ? row.companyUrls.slice() : [];
  while(entry.companyUrls.length < 1) entry.companyUrls.push("");
  // 自由記入欄
  entry.freeNote = row ? (row.freeNote||"") : "";
  entry.image = row ? (row.image||"") : "";
  entry.suppliers = row && Array.isArray(row.suppliers)
    ? row.suppliers.map(s=>({ image:s.image||"", imageIsDataUrl:false, url:s.url||"", memo:s.memo||"", collapsed:false }))
    : [];
  entry.rakumart = row && Array.isArray(row.rakumart)
    ? row.rakumart.map(r=>({ text:r.text||"", url:r.url||"", collapsed:false }))
    : [];
  // 表（ディープコピー）。旧構造（rows[].image + rows[].cells）からの変換も対応
  entry.tables = row && Array.isArray(row.tables)
    ? row.tables.map(t=>{
        if(Array.isArray(t.columns)){
          // 新構造
          return {
            columns: t.columns.map(c=>({type:c.type})),
            header: (t.header||[]).slice(),
            rows: (t.rows||[]).map(rr=>({
              cells: (rr.cells||[]).map((c,ci)=>{
                const type = t.columns[ci] ? t.columns[ci].type : "text";
                return type==="image"
                  ? { image:c.image||"", imageIsDataUrl:false }
                  : { text:c.text||"", url:c.url||"" };
              })
            }))
          };
        }else{
          // 旧構造: 先頭=画像列 + テキスト列。columns/headerを生成
          const textCount = (t.rows && t.rows[0] && t.rows[0].cells) ? t.rows[0].cells.length : 1;
          const columns = [{type:"image"}, ...Array.from({length:textCount},()=>({type:"text"}))];
          const header = ["画像", ...Array.from({length:textCount},()=>"")];
          const rows = (t.rows||[]).map(rr=>({
            cells: [
              { image: rr.image||"", imageIsDataUrl:false },
              ...(rr.cells||[]).map(c=>({ text:c.text||"", url:c.url||"" }))
            ]
          }));
          return { columns, header, rows };
        }
      })
    : [];
  // ===== ブロック構築 =====
  // 編集時: 既存の rakumart / suppliers / tables から種類ごとにブロックを構築。
  //         （従来は連結された配列なので、種類ごとに1ブロックへまとめる）
  // 新規時: ブロックは空（スッキリ表示）。
  entry.blocks = [];
  if(isEdit){
    if(entry.rakumart.length > 0){
      entry.blocks.push({ type:"rakumart", id:nextBlockId(), items: entry.rakumart });
    }
    if(entry.suppliers.length > 0){
      entry.blocks.push({ type:"supplier", id:nextBlockId(), items: entry.suppliers });
    }
    entry.tables.forEach(t=>{
      entry.blocks.push({ type:"table", id:nextBlockId(), data: t });
    });
    // 自由記入欄：内容があればブロックとして復元（末尾）
    if(entry.freeNote && entry.freeNote.trim()){
      entry.blocks.push({ type:"freenote", id:nextBlockId(), html: entry.freeNote });
    }
  }
  // カテゴリ: 編集時はその値、新規時は現在表示中のタブ（"all"の場合は未設定）
  entry.category = row ? (row.category||"") : ((currentCat==="all"||currentCat==="none") ? "" : currentCat);
  // ステータス: 編集時はその値、新規時は現在の下段タブ（"all"の場合は未設定）
  const axisInit = (axisSel)=> (axisSel==="all"||axisSel==="none"||axisSel==="allfull") ? "" : axisSel;
  entry.status = row ? (row.status||"") : axisInit(currentStatusByAxis.status);
  // 楽天・Yahoo 状態（その軸で特定の値に絞り込み中なら新規初期値に）
  entry.rakutenStatus = row ? (row.rakutenStatus||"") : axisInit(currentStatusByAxis.rakuten);
  entry.yahooStatus   = row ? (row.yahooStatus||"")   : axisInit(currentStatusByAxis.yahoo);
  // 新規作成時はセクションを閉じておく（必要なものだけ開いて使う）。編集時は展開。
  sectionCollapsed = isEdit ? { rakumart:false, suppliers:false, tables:false } : { rakumart:true, suppliers:true, tables:true };
  renderCatSelect();
  renderStatusSelect();
  renderAxisSelect("fRakutenStatus", state.rakutenStatuses, entry.rakutenStatus);
  renderAxisSelect("fYahooStatus", state.yahooStatuses, entry.yahooStatus);

  renderEntryImage();
  renderRivals();
  renderRanking();
  renderCompany();
  renderBlocks();
  // 入力済みフラグ初期化（キャンセル確認用にこの後の編集を検知）
  entrySnapshot = isEdit ? null : snapshotEntry();
  // 追加メニューは閉じておく
  const menu = document.getElementById("addBlockMenu");
  if(menu) menu.hidden = true;
  // 削除ボタンは編集時のみ表示
  const delBtn = document.getElementById("btnDeleteEntry");
  if(delBtn) delBtn.style.display = isEdit ? "" : "none";
  // モード切替：modeパラメータに従う。新規作成は常に編集モード。
  // mode="view" のみ閲覧モード、それ以外は編集モード。
  const modal = document.querySelector("#entryModal .modal-entry");
  if(modal){
    if(isEdit && mode==="view"){ modal.classList.add("is-viewmode"); }
    else                       { modal.classList.remove("is-viewmode"); }
  }
  // リンクが新規タブで開くよう整える（既存データのa要素も含めて）
  ensureLinksOpenInNewTab();
  applyViewmodeEditability();
  document.getElementById("entryModal").hidden = false;
}

// モーダル内のすべての a[href] に target=_blank rel=noopener を付与
function ensureLinksOpenInNewTab(){
  document.querySelectorAll("#entryModal a[href]").forEach(a=>{
    a.target = "_blank";
    a.rel = "noopener";
  });
}

// 閲覧/編集モードに応じて contenteditable を切り替え
function applyViewmodeEditability(){
  const modal = document.querySelector("#entryModal .modal-entry");
  if(!modal) return;
  const isView = modal.classList.contains("is-viewmode");
  modal.querySelectorAll("[contenteditable]").forEach(el=>{
    el.setAttribute("contenteditable", isView ? "false" : "true");
  });
}

// 閲覧モード→編集モードに切り替える
function startEditEntry(){
  const modal = document.querySelector("#entryModal .modal-entry");
  if(modal) modal.classList.remove("is-viewmode");
  applyViewmodeEditability();
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

// 楽天・Yahoo 状態のセレクトを描画（汎用）
function renderAxisSelect(selId, statusList, currentVal){
  const sel = document.getElementById(selId);
  if(!sel) return;
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = "— 未設定 —";
  sel.appendChild(opt0);
  (statusList||[]).forEach(s=>{
    const o = document.createElement("option");
    o.value = s.id; o.textContent = s.label;
    if(s.id===currentVal) o.selected = true;
    sel.appendChild(o);
  });
}

function renderCatSelect(){
  const sel = document.getElementById("fCategory");
  if(!sel) return;
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = "— 未分類 —";
  sel.appendChild(opt0);
  state.categories.forEach(c=>{
    const o = document.createElement("option");
    o.value = c.id; o.textContent = `${iconText(c.icon)} ${c.label}`.trim();
    if(c.id===entry.category) o.selected = true;
    sel.appendChild(o);
  });
}
function closeEntry(){ document.getElementById("entryModal").hidden = true; }

// 新規作成時の「何か入力されたか」を判定するためのスナップショット。
// ブロックを集約したうえで主要フィールドを文字列化する。
function snapshotEntry(){
  collectBlocksIntoEntry();
  const name = (document.getElementById("fName")?.value || "").trim();
  const ranking = (entry.rankingUrls||[]).map(u=>(u||"").trim()).filter(Boolean);
  const company = (entry.companyUrls||[]).map(u=>(u||"").trim()).filter(Boolean);
  const rivR = (entry.rivalRakuten||[]).map(u=>(u||"").trim()).filter(Boolean);
  const rivA = (entry.rivalAmazon||[]).map(u=>(u||"").trim()).filter(Boolean);
  const rak = (entry.rakumart||[]).filter(r=>(r.text||"").trim()||(r.url||"").trim());
  const sup = (entry.suppliers||[]).filter(s=>(s.url||"").trim()||(s.memo||"").trim()||(s.image||""));
  const note = (entry.freeNote||"").replace(/<[^>]*>/g,"").trim();
  return JSON.stringify({
    name, ranking, company, rivR, rivA,
    image: entry.image||"",
    rakLen: rak.length, supLen: sup.length,
    tblLen: (entry.tables||[]).length,
    note
  });
}
// 入力済みなら確認、なければそのまま閉じる
function cancelEntry(){
  // 編集時 or スナップショット無しは確認なしで閉じる
  if(entry.editIndex>=0 || entrySnapshot===null){ closeEntry(); return; }
  let current;
  try{ current = snapshotEntry(); }catch(e){ current = null; }
  // 初期状態から変化していれば確認
  if(current !== null && current !== entrySnapshot){
    if(!confirm("入力した内容は保存されていません。\n破棄して閉じてもよろしいですか？")) return;
  }
  closeEntry();
}

// 編集中の項目を削除
function deleteCurrentEntry(){
  if(entry.editIndex<0){ closeEntry(); return; }
  const name = state.rows[entry.editIndex] ? (state.rows[entry.editIndex].name || "この項目") : "この項目";
  if(!confirm(`「${name}」を削除しますか？\nこの操作は取り消せません（GitHub反映は「💾 GitHubに保存」）。`)) return;
  state.rows.splice(entry.editIndex, 1);
  persistLocal(); render(); closeEntry();
  setStatus("✅ 削除しました（GitHubに反映するには「💾 GitHubに保存」）");
}

function renderEntryImage(){
  const box = document.getElementById("entryImageBox");
  box.innerHTML = "";
  if(entry.image){
    const img = document.createElement("img");
    img.src = entry.imageIsDataUrl ? entry.image : imgUrl(entry.image);
    img.className = "entry-preview"; img.title = "クリック／ドロップで差し替え";
    img.onclick = ()=>pickImageInto(entry, "image", null, box);
    box.appendChild(img);
  }else{
    const drop = document.createElement("div");
    drop.className="img-drop"; drop.innerHTML="クリック<br>またはドロップ";
    drop.onclick = ()=>pickImageInto(entry, "image", null, box);
    box.appendChild(drop);
  }
  // 画像エリア全体をドロップ対象に（差し替えも可）
  enableImageDrop(box, entry, "image");
  // 下にURL貼り付け欄を1つ置く
  const slot = document.getElementById("entryImageUrlSlot");
  if(slot){
    slot.innerHTML = "";
    slot.appendChild(makeUrlPasteRow(entry, "image", null, box));
  }
}

// 楽天/Amazonライバルの入力欄を描画
function renderRivals(){
  renderRivalList("rivalRakutenList", entry.rivalRakuten, "rivalRakuten");
  renderRivalList("rivalAmazonList", entry.rivalAmazon, "rivalAmazon");
}
function renderRivalList(containerId, arr, key){
  const wrap = document.getElementById(containerId);
  if(!wrap) return;
  wrap.innerHTML = "";
  arr.forEach((url, idx)=>{
    const rowEl = document.createElement("div"); rowEl.className="rival-row";
    const inp = document.createElement("input");
    inp.type="text"; inp.placeholder="https://..."; inp.value=url;
    inp.oninput = e=>{ entry[key][idx] = e.target.value; };
    const rm = document.createElement("button");
    rm.type="button"; rm.className="rival-del"; rm.textContent="×"; rm.title="この欄を削除";
    rm.onclick = ()=>{ entry[key].splice(idx,1); if(entry[key].length===0) entry[key].push(""); renderRivals(); };
    rowEl.append(inp, rm);
    wrap.appendChild(rowEl);
  });
}
function addRival(key){
  entry[key].push("");
  renderRivals();
}

// ランキングURL（複数）
function renderRanking(){
  const wrap = document.getElementById("rankingList");
  if(!wrap) return;
  wrap.innerHTML = "";
  entry.rankingUrls.forEach((url, idx)=>{
    const rowEl = document.createElement("div"); rowEl.className="rival-row";
    const inp = document.createElement("input");
    inp.type="text"; inp.placeholder="https://..."; inp.value=url;
    inp.oninput = e=>{ entry.rankingUrls[idx] = e.target.value; };
    const rm = document.createElement("button");
    rm.type="button"; rm.className="rival-del"; rm.textContent="×"; rm.title="この欄を削除";
    rm.onclick = ()=>{ entry.rankingUrls.splice(idx,1); if(entry.rankingUrls.length===0) entry.rankingUrls.push(""); renderRanking(); };
    rowEl.append(inp, rm);
    wrap.appendChild(rowEl);
  });
}
function addRanking(){
  entry.rankingUrls.push("");
  renderRanking();
}

// 自社URL（複数）
function renderCompany(){
  const wrap = document.getElementById("companyList");
  if(!wrap) return;
  wrap.innerHTML = "";
  entry.companyUrls.forEach((url, idx)=>{
    const rowEl = document.createElement("div"); rowEl.className="rival-row";
    const inp = document.createElement("input");
    inp.type="text"; inp.placeholder="https://..."; inp.value=url;
    inp.oninput = e=>{ entry.companyUrls[idx] = e.target.value; };
    const rm = document.createElement("button");
    rm.type="button"; rm.className="rival-del"; rm.textContent="×"; rm.title="この欄を削除";
    rm.onclick = ()=>{ entry.companyUrls.splice(idx,1); if(entry.companyUrls.length===0) entry.companyUrls.push(""); renderCompany(); };
    rowEl.append(inp, rm);
    wrap.appendChild(rowEl);
  });
}
function addCompany(){
  entry.companyUrls.push("");
  renderCompany();
}

// 自由記入欄（リンク貼り付け対応のリッチテキスト、複数行OK）
function renderFreeNote(){
  const box = document.getElementById("freeNoteBox");
  if(!box) return;
  box.innerHTML = entry.freeNote || "";
  box.classList.toggle("is-empty", !(box.textContent.trim() || box.querySelector("a,img")));
}
function bindFreeNote(){
  const box = document.getElementById("freeNoteBox");
  if(!box) return;
  const sync = ()=>{
    entry.freeNote = box.innerHTML;
    box.classList.toggle("is-empty", !(box.textContent.trim() || box.querySelector("a,img")));
  };
  box.addEventListener("input", sync);
  box.addEventListener("paste", e=>{
    try{
      const html = e.clipboardData && e.clipboardData.getData("text/html");
      const plain = e.clipboardData && e.clipboardData.getData("text/plain");
      if(html){
        // リンクを含むHTMLはそのまま挿入（aタグのtarget整える）
        const tmp = document.createElement("div"); tmp.innerHTML = html;
        tmp.querySelectorAll("a").forEach(a=>{ a.target="_blank"; a.rel="noopener"; });
        e.preventDefault();
        document.execCommand("insertHTML", false, tmp.innerHTML);
        sync(); return;
      }
      if(plain){
        e.preventDefault();
        if(/^https?:\/\/\S+$/i.test(plain.trim())){
          document.execCommand("insertHTML", false, `<a href="${plain.trim()}" target="_blank" rel="noopener">${plain.trim()}</a>`);
        }else{
          document.execCommand("insertText", false, plain);
        }
        sync(); return;
      }
    }catch(err){}
    setTimeout(sync,0);
  });
}


// 仕入先セットの描画
// 配列内の要素を上/下へ移動
function moveItem(arr, idx, dir){
  const ni = idx + dir;
  if(ni<0 || ni>=arr.length) return;
  [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
}
// 上↑下↓ボタンのペアを作る。move(dir) を呼ぶ
function makeMoveButtons(idx, len, onMove, cls){
  const frag = document.createDocumentFragment();
  const up = document.createElement("button");
  up.type="button"; up.className=cls; up.textContent="↑"; up.title="上へ";
  up.disabled = idx===0;
  up.onclick = (e)=>{ e.stopPropagation(); onMove(-1); };
  const dn = document.createElement("button");
  dn.type="button"; dn.className=cls; dn.textContent="↓"; dn.title="下へ";
  dn.disabled = idx===len-1;
  dn.onclick = (e)=>{ e.stopPropagation(); onMove(1); };
  frag.append(up, dn);
  return frag;
}

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
    const mv = makeMoveButtons(idx, entry.suppliers.length, (dir)=>{ moveItem(entry.suppliers, idx, dir); renderSuppliers(); }, "supplier-mv");
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
    head.append(tg, mv, ttl, summary, rm);
    card.appendChild(head);

    if(!s.collapsed){
      const bodyRow = document.createElement("div"); bodyRow.className="supplier-body";

      const imgBox = document.createElement("div"); imgBox.className="supplier-image";
      if(s.image){
        const im=document.createElement("img"); im.src=s.imageIsDataUrl?s.image:imgUrl(s.image);
        im.className="supplier-preview"; im.title="クリック／ドロップで差し替え";
        im.onclick=()=>pickImageInto(s,"image", renderSuppliers, imgBox);
        imgBox.appendChild(im);
      }else{
        const drop=document.createElement("div"); drop.className="img-drop"; drop.innerHTML="仕入先画像<br>クリック／ドロップ";
        drop.onclick=()=>pickImageInto(s,"image", renderSuppliers, imgBox);
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

/* ---------- 表（画像列＋テキスト列、タイトル行つき） ----------
   データ構造: table = {
     columns: [{type:"image"|"text"}],   // 列定義（先頭が画像列とは限らない＝画像列も削除可能）
     header:  ["タイトル", ...],           // 各列のタイトル（テキスト）
     rows:    [{ cells:[ 値, ... ] }]      // 各セルは、画像列なら {image,imageIsDataUrl}、テキスト列なら {text,url}
   }
*/

// テキストセルにリンク貼り付け対応のエディタを作る
function makeLinkCell(cell, extraClass){
  const ed = document.createElement("div");
  ed.className = "tbl-cell-edit" + (extraClass?(" "+extraClass):"");
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

// ヘッダー（タイトル行）セル用：プレーンテキスト編集
function makeHeaderCell(tbl, ci){
  const ed = document.createElement("div");
  ed.className = "tbl-head-edit";
  ed.contentEditable = "true";
  ed.setAttribute("spellcheck","false");
  ed.textContent = tbl.header[ci] || "";
  const sync = ()=>{
    tbl.header[ci] = ed.textContent.trim();
    ed.classList.toggle("is-empty", !ed.textContent.trim());
  };
  ed.addEventListener("input", sync);
  ed.classList.toggle("is-empty", !ed.textContent.trim());
  return ed;
}

function renderTables(){
  const sec = document.getElementById("tablesSection");
  if(sec) sec.classList.toggle("section-collapsed", sectionCollapsed.tables);
  const stoggle = document.getElementById("tablesSectionToggle");
  if(stoggle) stoggle.textContent = sectionCollapsed.tables ? "\u25b6" : "\u25bc";

  const wrap = document.getElementById("tablesList");
  if(!wrap) return;
  wrap.innerHTML = "";
  entry.tables.forEach((tbl, ti)=>{
    const card = document.createElement("div"); card.className="tbl-card";

    // ヘッダー操作行
    const head = document.createElement("div"); head.className="tbl-head";
    const ttl = document.createElement("span"); ttl.className="tbl-ttl"; ttl.textContent=`\u8868 ${ti+1}`;
    const mv = makeMoveButtons(ti, entry.tables.length, (dir)=>{ moveItem(entry.tables, ti, dir); renderTables(); }, "tbl-mv");
    const addTextCol = document.createElement("button"); addTextCol.type="button"; addTextCol.className="btn btn-ghost btn-sm"; addTextCol.textContent="\uff0b\u30c6\u30ad\u30b9\u30c8\u5217";
    addTextCol.onclick = ()=>{ tbl.columns.push({type:"text"}); tbl.header.push(""); tbl.rows.forEach(r=>r.cells.push({text:"",url:""})); renderTables(); };
    const addImgCol = document.createElement("button"); addImgCol.type="button"; addImgCol.className="btn btn-ghost btn-sm"; addImgCol.textContent="\uff0b\u753b\u50cf\u5217";
    addImgCol.onclick = ()=>{ tbl.columns.push({type:"image"}); tbl.header.push(""); tbl.rows.forEach(r=>r.cells.push({image:"",imageIsDataUrl:false})); renderTables(); };
    const addRow = document.createElement("button"); addRow.type="button"; addRow.className="btn btn-ghost btn-sm"; addRow.textContent="\uff0b\u884c";
    addRow.onclick = ()=>{ tbl.rows.push({ cells: tbl.columns.map(c=> c.type==="image"?{image:"",imageIsDataUrl:false}:{text:"",url:""}) }); renderTables(); };
    const delTbl = document.createElement("button"); delTbl.type="button"; delTbl.className="tbl-del-btn"; delTbl.textContent="\u00d7 \u8868\u3092\u524a\u9664";
    delTbl.onclick = ()=>{ if(confirm("\u3053\u306e\u8868\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f")){ entry.tables.splice(ti,1); renderTables(); } };
    head.append(ttl, mv, addTextCol, addImgCol, addRow, delTbl);
    card.appendChild(head);

    const table = document.createElement("table"); table.className="tbl-grid";

    // 列削除ボタン行（生成だけ。テーブル末尾に追加する）
    const colDelTr = document.createElement("tr"); colDelTr.className="tbl-coldel-row";
    tbl.columns.forEach((col, ci)=>{
      const td = document.createElement("td"); td.className="tbl-coldel-cell";
      const cd = document.createElement("button"); cd.type="button"; cd.className="tbl-coldel"; cd.textContent="\u00d7 \u5217\u3092\u524a\u9664"; cd.title="\u3053\u306e\u5217\u3092\u524a\u9664";
      cd.onclick = ()=>{
        tbl.columns.splice(ci,1); tbl.header.splice(ci,1);
        tbl.rows.forEach(r=>r.cells.splice(ci,1));
        if(tbl.columns.length===0){ entry.tables.splice(ti,1); }
        renderTables();
      };
      td.appendChild(cd); colDelTr.appendChild(td);
    });
    colDelTr.appendChild(document.createElement("td")); // 行削除列の分

    // タイトル行
    const headTr = document.createElement("tr"); headTr.className="tbl-title-row";
    tbl.columns.forEach((col, ci)=>{
      const td = document.createElement("td");
      td.appendChild(makeHeaderCell(tbl, ci));
      headTr.appendChild(td);
    });
    headTr.appendChild(document.createElement("td"));
    table.appendChild(headTr);

    // データ行
    tbl.rows.forEach((r, ri)=>{
      const tr = document.createElement("tr");
      tbl.columns.forEach((col, ci)=>{
        const cell = r.cells[ci] || (col.type==="image"?{image:"",imageIsDataUrl:false}:{text:"",url:""});
        r.cells[ci] = cell;
        const td = document.createElement("td");
        if(col.type==="image"){
          td.className="tbl-img-cell";
          const imgBox = document.createElement("div"); imgBox.className="tbl-img-box";
          if(cell.image){
            const im=document.createElement("img"); im.src=cell.imageIsDataUrl?cell.image:imgUrl(cell.image);
            im.className="tbl-img"; im.title="\u30af\u30ea\u30c3\u30af\uff0f\u30c9\u30ed\u30c3\u30d7\u3067\u5dee\u3057\u66ff\u3048";
            im.onclick=()=>pickImageInto(cell,"image",renderTables,imgBox);
            imgBox.appendChild(im);
          }else{
            const drop=document.createElement("div"); drop.className="img-drop"; drop.innerHTML="\u753b\u50cf";
            drop.onclick=()=>pickImageInto(cell,"image",renderTables,imgBox);
            imgBox.appendChild(drop);
          }
          enableImageDrop(imgBox, cell, "image", renderTables);
          td.appendChild(imgBox);
        }else{
          td.className="tbl-txt-cell";
          td.appendChild(makeLinkCell(cell));
        }
        tr.appendChild(td);
      });
      // 行削除
      const tdDel = document.createElement("td"); tdDel.className="tbl-rowdel-cell";
      const rd = document.createElement("button"); rd.type="button"; rd.className="tbl-rowdel"; rd.textContent="\u00d7"; rd.title="\u3053\u306e\u884c\u3092\u524a\u9664";
      rd.onclick = ()=>{ tbl.rows.splice(ri,1); renderTables(); };
      tdDel.appendChild(rd);
      tr.appendChild(tdDel);
      table.appendChild(tr);
    });

    // 列削除行を一番下に追加
    table.appendChild(colDelTr);

    card.appendChild(table);
    wrap.appendChild(card);
  });
}

function addTable(){
  // 初期: 画像列1 + テキスト列2、タイトル行、データ3行
  const columns = [{type:"image"}, {type:"text"}, {type:"text"}];
  const header = ["\u753b\u50cf", "", ""];
  const rows = Array.from({length:3}, ()=>({
    cells: columns.map(c=> c.type==="image"?{image:"",imageIsDataUrl:false}:{text:"",url:""})
  }));
  entry.tables.push({ columns, header, rows });
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
    const mv = makeMoveButtons(idx, entry.rakumart.length, (dir)=>{ moveItem(entry.rakumart, idx, dir); renderRakumart(); }, "rakumart-mv");

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

    card.append(tg, mv, num, bodyEl, rm);
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
function pickImageInto(obj, key, cb, containerEl){
  // 閲覧モード中はクリック→ファイル選択を抑止（ドロップだけ受け付ける）
  if(isViewmode()) return;
  const input = document.createElement("input");
  input.type="file"; input.accept="image/*";
  input.onchange = ()=>{
    const file = input.files[0]; if(!file) return;
    handleImageFile(file, obj, key, cb, containerEl);
  };
  input.click();
}

// 編集モーダルが閲覧モード状態か
function isViewmode(){
  const m = document.querySelector("#entryModal .modal-entry");
  return !!(m && m.classList.contains("is-viewmode"));
}

/* ---------- アップロード中オーバーレイ（スピナー＋経過秒） ---------- */
function showUploadOverlay(el){
  if(!el) return null;
  // 既存があれば消す
  el.querySelectorAll(".upload-overlay").forEach(n=>n.remove());
  const ov = document.createElement("div");
  ov.className = "upload-overlay";
  ov.innerHTML = `<div class="up-spin"></div><div class="up-sec">0.0s</div>`;
  el.appendChild(ov);
  const start = performance.now();
  const sec = ov.querySelector(".up-sec");
  const timer = setInterval(()=>{
    const t = (performance.now() - start) / 1000;
    sec.textContent = t.toFixed(1) + "s";
  }, 100);
  return {
    el: ov,
    stop: (finalText)=>{
      clearInterval(timer);
      const t = (performance.now() - start) / 1000;
      if(finalText){
        sec.textContent = finalText + " " + t.toFixed(1) + "s";
        // 結果は0.8秒ほど表示してから消す
        setTimeout(()=>ov.remove(), 800);
      }else{
        ov.remove();
      }
    }
  };
}

// ファイルを受け取って obj[key] に登録（アップロード or プレビュー）
async function handleImageFile(file, obj, key, cb, containerEl){
  if(!file || !file.type || !file.type.startsWith("image/")){
    setStatus("⚠️ 画像ファイルをドロップしてください"); return;
  }
  const viewmode = isViewmode();
  const finish = ()=>{
    if(cb) cb(); else renderEntryImage();
    // 閲覧モードでのドロップは、その場で自動保存して即反映
    if(viewmode && entry.editIndex>=0){
      try{
        saveEntry(true);  // 開いたまま保存
        setStatus("✅ 画像を差し替えて保存しました");
      }catch(e){ console.error("auto-save after drop failed:", e); }
    }
  };
  if(!cfg.pat){
    // GitHub未設定では画像は永続化できない。ユーザーに明確に通知。
    const reader = new FileReader();
    reader.onload = e=>{
      obj[key]=e.target.result; obj.imageIsDataUrl=true;
      finish();
    };
    reader.readAsDataURL(file);
    setStatus("⚠️ GitHub未設定のため、この画像は保存されません（リロードで消えます）。⚙️設定からPAT等を入力してください");
    return;
  }
  // 該当画像エリアの上にスピナー＋経過秒オーバーレイ表示
  const overlay = showUploadOverlay(containerEl);
  setStatus("画像アップロード中…");
  try{
    const filename = await uploadImage(file);
    obj[key]=filename; obj.imageIsDataUrl=false;
    if(overlay) overlay.stop("✅");
    finish();
    if(!viewmode) setStatus("✅ 画像アップロード完了");
  }catch(e){
    if(overlay) overlay.stop("❌");
    setStatus("❌ 画像アップロード失敗: "+e.message);
  }
}

// 要素にドラッグ&ドロップで画像登録できるようにする
function enableImageDrop(el, obj, key, cb){
  el.addEventListener("dragover", e=>{ e.preventDefault(); e.stopPropagation(); el.classList.add("drag-over"); });
  el.addEventListener("dragleave", e=>{ e.preventDefault(); e.stopPropagation(); el.classList.remove("drag-over"); });
  el.addEventListener("drop", e=>{
    e.preventDefault(); e.stopPropagation(); el.classList.remove("drag-over");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(file) handleImageFile(file, obj, key, cb, el);  // ドロップ先要素を渡す
  });
}

/* URLから画像をfetchしてアップロード扱いにする。
   CORS等で fetch できないURLは、フォールバックとして URL を直接 obj[key] に入れる。 */
async function handleImageUrl(url, obj, key, cb, containerEl){
  url = (url||"").trim();
  if(!url) return;
  if(!/^https?:\/\//i.test(url)){
    setStatus("⚠️ 画像URLは http(s)://… で始める必要があります");
    return;
  }
  logInfo("handleImageUrl: 開始", { url });
  const overlay = showUploadOverlay(containerEl);
  setStatus("URLから画像取得中…");
  try{
    const res = await fetch(url, { mode: "cors" });
    if(!res.ok) throw new Error("HTTP "+res.status);
    const blob = await res.blob();
    if(!/^image\//.test(blob.type)){
      throw new Error("画像ではないようです (type: "+blob.type+")");
    }
    // URLから拡張子を推測
    let ext = "png";
    const m = url.match(/\.(jpg|jpeg|png|gif|webp|bmp|avif)(?:\?|#|$)/i);
    if(m) ext = m[1].toLowerCase();
    else if(blob.type){
      const tm = blob.type.match(/^image\/(\w+)/);
      if(tm) ext = tm[1].replace("jpeg","jpg");
    }
    const file = new File([blob], "url_image."+ext, { type: blob.type || "image/png" });
    // 既存の画像アップロード経路に乗せる
    await handleImageFile(file, obj, key, cb, null); // overlayは自前で出しているので2重表示しない
    if(overlay) overlay.stop("✅");
    logInfo("handleImageUrl: 成功", { url, ext });
  }catch(e){
    if(overlay) overlay.stop("❌");
    logWarn("handleImageUrl: fetch失敗、URL直参照にフォールバック", { url, error: String(e && e.message || e) });
    // CORS等でダウンロードできない場合でも、確認ダイアログは出さずにURL直参照で表示する
    obj[key] = url;
    obj.imageIsDataUrl = false;
    if(cb) cb(); else renderEntryImage();
    // 閲覧モードでのURL貼り付けも自動保存
    if(isViewmode() && entry.editIndex>=0){
      try{ saveEntry(true); }catch(_){}
    }
    setStatus("✅ URLを画像として登録しました（直接参照／GitHubには保存されません）");
  }
}

// 画像エリアの下に置く小さなURL貼り付け欄
function makeUrlPasteRow(obj, key, cb, containerEl){
  const row = document.createElement("div");
  row.className = "img-url-row";
  const inp = document.createElement("input");
  inp.type = "url"; inp.className = "img-url-input";
  inp.placeholder = "またはURLを貼り付け（http://… / https://…）";
  const go = document.createElement("button");
  go.type = "button"; go.className = "img-url-go"; go.textContent = "適用";
  const submit = ()=>{
    const v = inp.value.trim();
    if(!v) return;
    handleImageUrl(v, obj, key, cb, containerEl);
    inp.value = "";
  };
  go.onclick = submit;
  inp.addEventListener("keydown", e=>{
    if(e.key === "Enter"){ e.preventDefault(); submit(); }
  });
  // ペーストでURL貼られたら即実行（任意UX）
  inp.addEventListener("paste", (e)=>{
    setTimeout(()=>{
      const v = inp.value.trim();
      if(/^https?:\/\//i.test(v)) submit();
    }, 0);
  });
  row.append(inp, go);
  return row;
}

function saveEntry(keepOpen){
  try{
    // ブロックから従来形式へ集約
    collectBlocksIntoEntry();
    // 配列フィールドのガード（万一壊れていてもmapで落ちないように）
    if(!Array.isArray(entry.rivalRakuten)) entry.rivalRakuten = [];
    if(!Array.isArray(entry.rivalAmazon))  entry.rivalAmazon  = [];
    if(!Array.isArray(entry.rankingUrls))  entry.rankingUrls  = [];
    if(!Array.isArray(entry.companyUrls))  entry.companyUrls  = [];
    if(!Array.isArray(entry.rakumart))     entry.rakumart     = [];
    if(!Array.isArray(entry.suppliers))    entry.suppliers    = [];
    if(!Array.isArray(entry.tables))       entry.tables       = [];
    const fName = document.getElementById("fName");
    const fDate = document.getElementById("fDate");
    const fDone = document.getElementById("fDoneDate");
    const fCat  = document.getElementById("fCategory");
    const fSt   = document.getElementById("fStatus");
    const fRak  = document.getElementById("fRakutenStatus");
    const fYah  = document.getElementById("fYahooStatus");
    const fExp  = document.getElementById("fExpectedSales");
    let expectedSales = 0;
    if(fExp){
      const v = parseFloat((fExp.value||"").trim());
      expectedSales = (Number.isFinite(v) && v >= 0) ? v : 0;
    }
    const row = {
      date:  (fDate && fDate.value) || today(),
      doneDate: (fDone && fDone.value) || "",
      image: entry.image || "",
      name:  fName ? fName.value.trim() : "",
      expectedSales,
      rivalRakuten: entry.rivalRakuten.map(u=>(u||"").trim()).filter(u=>u),
      rivalAmazon:  entry.rivalAmazon.map(u=>(u||"").trim()).filter(u=>u),
      rankingUrls:  entry.rankingUrls.map(u=>(u||"").trim()).filter(u=>u),
      companyUrls:  (entry.companyUrls||[]).map(u=>(u||"").trim()).filter(u=>u),
      freeNote:     entry.freeNote || "",
      category: (fCat && fCat.value) || (entry.category || ""),
      status:   (fSt  && fSt.value)  || "",
      rakutenStatus: (fRak && fRak.value) || "",
      yahooStatus:   (fYah && fYah.value) || "",
      rakumart: entry.rakumart.map(r=>({ text:((r&&r.text)||"").trim(), url:((r&&r.url)||"").trim() })).filter(r=>r.text||r.url),
      suppliers: entry.suppliers.map(s=>({ image:(s&&s.image)||"", url:((s&&s.url)||"").trim(), memo:((s&&s.memo)||"").trim() })),
      tables: entry.tables.map(t=>{
        const cols = Array.isArray(t && t.columns) ? t.columns : [];
        const hdr  = Array.isArray(t && t.header)  ? t.header  : [];
        const rws  = Array.isArray(t && t.rows)    ? t.rows    : [];
        return {
          columns: cols.map(c=>({ type:(c && c.type) || "text" })),
          header: cols.map((_,i)=> ((hdr[i]||"")+"").trim()),
          rows: rws.map(r=>({
            cells: cols.map((c,ci)=>{
              const cell = (r && r.cells && r.cells[ci]) || {};
              const type = (c && c.type) || "text";
              return type==="image"
                ? { image:cell.image||"" }
                : { text:((cell.text)||"").trim(), url:((cell.url)||"").trim() };
            })
          }))
        };
      }),
    };
    if(entry.editIndex>=0){ state.rows[entry.editIndex] = row; }
    else {
      state.rows.push(row);
      // 開いたまま保存した場合、以降は今追加した行を編集対象にする
      if(keepOpen) entry.editIndex = state.rows.length - 1;
    }
    persistLocal(); render();
    // GitHub保存を自動実行（設定済みのときのみ）
    const hasGh = !!(cfg.pat && cfg.owner && cfg.repo);
    if(keepOpen){
      // 入力差分検知のためスナップショットを更新
      try{ entrySnapshot = snapshotEntry(); }catch(_){}
      if(hasGh){
        setStatus("ローカル保存OK。GitHubに反映中…");
        saveToGitHub().catch(()=>{}); // 内部でステータス更新するのでここでは何もしない
      }else{
        setStatus("✅ 保存しました（編集を続けられます。GitHub反映は「💾 GitHubに保存」）");
      }
    }else{
      closeEntry();
      if(hasGh){
        setStatus("ローカル保存OK。GitHubに反映中…");
        saveToGitHub().catch(()=>{});
      }else{
        setStatus("✅ 登録しました（GitHubに反映するには「💾 GitHubに保存」）");
      }
    }
  }catch(e){
    // 何かで失敗しても無音にならないようにユーザーへ通知
    console.error("saveEntry error:", e);
    setStatus("❌ 保存に失敗しました: " + (e && e.message ? e.message : e));
    try{ alert("保存に失敗しました。\n" + (e && e.message ? e.message : e)); }catch(_){}
  }
}

/* ---------- 画像アップロード ---------- */
async function uploadImage(file){
  const ext = (file.name.split(".").pop()||"png").toLowerCase();
  const filename = `img_${Date.now().toString(36)}_${Math.floor(Math.random()*1000)}.${ext}`;
  logInfo("uploadImage: 開始", { filename, sizeKB: Math.round((file.size||0)/1024) });
  const b64 = await fileToBase64(file);
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${IMG_DIR}/${filename}`;
  const res = await fetch(url, {
    method:"PUT",
    headers:{ Authorization:`token ${cfg.pat}`, Accept:"application/vnd.github+json" },
    body: JSON.stringify({ message:`add image ${filename}`, content:b64, branch:cfg.branch })
  });
  if(!res.ok){
    const m = (await res.json()).message || res.status;
    logError("uploadImage: 失敗", { filename, status: res.status, msg: m });
    throw new Error(m);
  }
  logInfo("uploadImage: 成功", { filename });
  return filename;
}
function fileToBase64(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result.split(",")[1]);
    r.onerror=rej; r.readAsDataURL(file);
  });
}

/* ---------- ステータス／カテゴリ保留変更の反映 ---------- */
async function applyPendingChanges(){
  const nS = Object.keys(pendingStatus).length;
  const nC = Object.keys(pendingCat).length;
  const n = nS + nC;
  if(n===0) return;
  // 保留中の変更をデータに適用
  Object.keys(pendingStatus).forEach(ri=>{
    const idx = parseInt(ri,10);
    if(state.rows[idx]) state.rows[idx].status = pendingStatus[ri];
  });
  Object.keys(pendingCat).forEach(ri=>{
    const idx = parseInt(ri,10);
    if(state.rows[idx]) state.rows[idx].category = pendingCat[ri];
  });
  pendingStatus = {};
  pendingCat = {};
  persistLocal();
  render();
  // GitHubにも保存
  if(cfg.pat && cfg.owner && cfg.repo){
    await saveToGitHub();
    setStatus(`✅ ${n}件の変更を反映し、GitHubに保存しました`);
  }else{
    setStatus(`✅ ${n}件の変更を反映しました（GitHub未設定のため保存は未実行）`);
  }
}

/* ---------- GitHub データ保存 ---------- */
// 同時実行を防ぐためのフラグと、実行中の Promise
let saveToGitHubRunning = null;
// 実行中に saveToGitHub が再度呼ばれたとき、終わったら一度だけ追加実行することを示すフラグ
let saveToGitHubPending = false;

/* ヘッダーのGitHub保存進行中インジケーター */
function showGhProgress(label){
  const el = document.getElementById("ghProgress");
  if(!el) return null;
  el.hidden = false;
  el.classList.remove("done","error");
  el.querySelector(".gh-text").textContent = label || "GitHub保存中…";
  const secEl = el.querySelector(".gh-sec");
  secEl.textContent = "0.0s";
  const start = performance.now();
  const timer = setInterval(()=>{
    const t = (performance.now()-start)/1000;
    secEl.textContent = t.toFixed(1) + "s";
  }, 100);
  return {
    update: (text)=>{ el.querySelector(".gh-text").textContent = text; },
    success: (text)=>{
      clearInterval(timer);
      el.classList.add("done");
      el.querySelector(".gh-text").textContent = text || "GitHubに保存しました";
      // 2秒後に消える
      setTimeout(()=>{ if(el && !el.classList.contains("active")) el.hidden = true; }, 2000);
    },
    error: (text)=>{
      clearInterval(timer);
      el.classList.add("error");
      el.querySelector(".gh-text").textContent = text || "保存失敗";
      // 5秒後に消える
      setTimeout(()=>{ if(el && !el.classList.contains("active")) el.hidden = true; }, 5000);
    }
  };
}

async function saveToGitHub(){
  if(!cfg.pat||!cfg.owner||!cfg.repo){ openSettings(); setStatus("⚠️ 先にGitHub設定を入力してください"); return; }
  // 既に実行中なら、終了後に1度だけ追加実行（連続呼び出しの最新版を必ず反映）
  if(saveToGitHubRunning){
    logInfo("saveToGitHub: 既に実行中。pending=true");
    saveToGitHubPending = true;
    return saveToGitHubRunning;
  }
  logInfo("saveToGitHub: 開始", { rows: (state.rows||[]).length });
  // 「💾 GitHubに保存」ボタンを処理中は無効化
  const btn = document.getElementById("btnSave");
  if(btn) btn.disabled = true;
  const prog = showGhProgress("GitHub保存中…");
  saveToGitHubRunning = (async ()=>{
    try{
      setStatus("保存中…");
      try{
        // 行内に残っている DataURL 画像を、保存前にすべてアップロードしてファイル名に置換
        if(prog) prog.update("画像をアップロード中…");
        const rescued = await uploadDataUrlImagesInState();
        if(rescued > 0){
          persistLocal(); render();
          setStatus(`画像 ${rescued} 件をアップロードしました。データ保存中…`);
          if(prog) prog.update(`画像${rescued}件アップ済 → データ保存中…`);
        }else{
          if(prog) prog.update("データ保存中…");
        }
        // ★直前に無条件でSHAを取り直さない。
        //   前回保存で得た正しいSHA（dataSha）をそのまま使う。
        //   毎回取り直すと、古いキャッシュ値で正しいSHAを潰して逆に競合を招くため。
        //   dataSha が無いとき（初回など）だけ取得する。
        if(!dataSha) await fetchDataSha();
        await putDataJson();
        setStatus("✅ GitHubに保存しました");
        if(prog) prog.success("GitHubに保存しました");
      }catch(e){
        const msg = "❌ 保存失敗: "+(e && e.message ? e.message : e);
        setStatus(msg);
        if(prog) prog.error(msg);
      }
    }finally{
      saveToGitHubRunning = null;
      if(btn) btn.disabled = false;
      // 実行中に追加呼び出しがあった場合、最新の state でもう一度保存
      if(saveToGitHubPending){
        saveToGitHubPending = false;
        // 即座にではなく、競合を避けるため少し待ってから最新stateで再保存
        setTimeout(()=>{ saveToGitHub(); }, 300);
      }
    }
  })();
  return saveToGitHubRunning;
}

// data/products.json を実際にPUT。SHA不一致エラーが出たらSHAを取り直して1回だけ自動リトライ。
async function putDataJson(){
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_PATH}`;
  const content = b64encode(JSON.stringify(state, null, 2));
  // 既存ファイルの更新には sha が必須。手元に無ければ取得する。
  if(!dataSha) await fetchDataSha();
  const doPut = async ()=>{
    const body = { message:`update ${DATA_PATH}`, content, branch:cfg.branch };
    if(dataSha) body.sha = dataSha;
    const res = await fetch(url, {
      method:"PUT",
      headers:{ Authorization:`token ${cfg.pat}`, Accept:"application/vnd.github+json" },
      body: JSON.stringify(body)
    });
    return res;
  };
  logInfo("putDataJson: PUT開始", { sha: dataSha });
  let res = await doPut();
  logInfo("putDataJson: PUT結果", { status: res.status, ok: res.ok });
  // SHA不一致の場合は最大8回までリトライ（短めの待機。SHA取得はキャッシュ無効化済み）
  for(let attempt=0; attempt<8 && !res.ok; attempt++){
    let info = {};
    try{ info = await res.clone().json(); }catch(_){}
    const msg = info.message || ("HTTP "+res.status);
    const looksLikeShaMismatch =
      res.status===409 ||
      res.status===422 ||
      /does not match/i.test(msg) ||
      (/sha/i.test(msg) && /match/i.test(msg));
    logWarn(`putDataJson: PUT失敗 attempt=${attempt}`, { status: res.status, msg, looksLikeShaMismatch });
    if(!looksLikeShaMismatch){
      throw new Error(msg);
    }
    const wait = Math.min(2500, 500 + 300 * attempt); // 500ms→最大2.5sの短い待機
    setStatus(`⚠️ 競合検出。最新版に追従して再保存中…(${attempt+1}回目, ${wait}ms待機)`);
    await new Promise(r=>setTimeout(r, wait));
    await fetchDataSha();
    logInfo(`putDataJson: SHA再取得 attempt=${attempt+1}`, { newSha: dataSha });
    res = await doPut();
    logInfo(`putDataJson: 再PUT結果 attempt=${attempt+1}`, { status: res.status, ok: res.ok });
  }
  if(!res.ok){
    let info2={};
    try{ info2 = await res.clone().json(); }catch(_){}
    logError("putDataJson: 全リトライ失敗", { status: res.status, msg: info2.message });
    throw new Error(info2.message || ("HTTP "+res.status));
  }
  const ok = await res.json();
  dataSha = ok.content ? ok.content.sha : dataSha;
  logInfo("putDataJson: 成功", { newSha: dataSha });
}

// data:image/* で始まる画像をGitHubにアップロードし、ファイル名に置換する。
// state.rows[*].image / .suppliers[*].image / .tables[*].rows[*].cells[*].image を走査。
// 戻り値: アップロードした件数。
async function uploadDataUrlImagesInState(){
  let count = 0;
  const upOne = async (val)=>{
    if(typeof val !== "string" || !val.startsWith("data:")) return null;
    try{
      const blob = await (await fetch(val)).blob();
      const file = new File([blob], "img.png", { type: blob.type || "image/png" });
      const filename = await uploadImage(file);
      count++;
      return filename;
    }catch(err){
      console.error("uploadDataUrl failed:", err);
      return null; // 置換失敗：DataURLのまま残す（行を壊さないため）
    }
  };
  for(const row of (state.rows||[])){
    const np = await upOne(row.image);
    if(np) row.image = np;
    for(const s of (row.suppliers||[])){
      const sp = await upOne(s.image);
      if(sp) s.image = sp;
    }
    for(const t of (row.tables||[])){
      for(const rr of (t.rows||[])){
        for(const c of (rr.cells||[])){
          if(c && typeof c.image === "string"){
            const cp = await upOne(c.image);
            if(cp) c.image = cp;
          }
        }
      }
    }
  }
  return count;
}

async function fetchDataSha(){
  try{
    // キャッシュバスター＋no-store で古いSHAを避ける。
    // ※ Cache-Control ヘッダーは付けない（CORSプリフライトで失敗しSHAがnullになるため）。
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${DATA_PATH}?ref=${cfg.branch}&_=${Date.now()}`;
    const res = await fetch(url, {
      method:"GET",
      cache:"no-store",
      headers:{
        Authorization:`token ${cfg.pat}`,
        Accept:"application/vnd.github+json"
      }
    });
    if(res.ok){
      const j = await res.json();
      if(j && j.sha) dataSha = j.sha; // 成功時のみ更新
    }
    // 取得失敗時は dataSha を変更しない（nullで上書きして422を誘発しないため）
  }catch(e){ /* 失敗時も既存の dataSha を保持 */ }
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

/* ---------- 項目（列）管理 ---------- */
function openColManager(){
  renderColManager();
  document.getElementById("colModal").hidden = false;
}
function closeColManager(){ document.getElementById("colModal").hidden = true; }

/* ---------- 列幅ドラッグ調整モード ---------- */
// 項目管理から「↔ ドラッグで幅調整」で開始。一覧表ヘッダーの境界をドラッグして幅変更。
function enterColResizeMode(){
  colResizeMode = true;
  closeColManager();
  const bar = document.getElementById("resizeBar");
  if(bar) bar.hidden = false;
  render();
  setStatus("↔ 列の境界をドラッグして幅を調整できます（完了で項目管理に戻ります）");
}
function exitColResizeMode(){
  colResizeMode = false;
  const bar = document.getElementById("resizeBar");
  if(bar) bar.hidden = true;
  render();
  openColManager(); // 項目管理に戻る
}
// 各ヘッダーセル(th)の右端にドラッグ用ハンドルを付ける
function addColResizeHandle(th, key){
  th.classList.add("resizable-th");
  const h = document.createElement("div");
  h.className = "col-resize-handle";
  h.title = "ドラッグで幅を調整";
  h.onclick = (e)=>{ e.stopPropagation(); };
  h.onmousedown = (e)=>startColResize(e, th, key);
  th.appendChild(h);
}
// ドラッグ開始：mousemoveで該当列(th+全td)の幅を更新、mouseupで設定保存
function startColResize(e, th, key){
  e.preventDefault(); e.stopPropagation();
  const startX = e.clientX;
  const startW = th.getBoundingClientRect().width;
  const cells = document.querySelectorAll(`#grid [data-col-key="${key}"]`);
  let newW = Math.round(startW);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "col-resize";
  const move = (ev)=>{
    newW = Math.max(40, Math.round(startW + (ev.clientX - startX)));
    cells.forEach(el=>{
      el.style.width = newW + "px";
      el.style.minWidth = newW + "px";
      el.style.maxWidth = newW + "px";
    });
  };
  const up = ()=>{
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setColCfg(key, { width: newW });
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}
// ラベル付きの揃えセレクト（左/中央/右）を作る
function makeColAlignGroup(labelText, value, onChange){
  const g = document.createElement("label"); g.className = "col-align-group";
  const sp = document.createElement("span"); sp.className = "col-ctrl-label"; sp.textContent = labelText;
  const s = document.createElement("select"); s.className = "col-align-sel";
  [["left","左"],["center","中央"],["right","右"]].forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; s.appendChild(o); });
  s.value = value || "left";
  s.onchange = ()=> onChange(s.value);
  g.append(sp, s);
  return g;
}
function renderColManager(){
  const visWrap = document.getElementById("colListVisible");
  const hidWrap = document.getElementById("colListHidden");
  if(!visWrap || !hidWrap) return;
  visWrap.innerHTML = "";
  hidWrap.innerHTML = "";

  COLUMNS.forEach(c=>{
    const cc = getColCfg(c.key);
    const isVisible = cc.visible !== false;
    const card = document.createElement("div"); card.className = "col-card";

    const name = document.createElement("div"); name.className = "col-card-name";
    name.textContent = c.label;
    card.appendChild(name);

    if(isVisible){
      // 幅(px)＋テキスト処理
      const controls = document.createElement("div"); controls.className = "col-card-controls";
      const w = document.createElement("input");
      w.type = "number"; w.min = "0"; w.step = "10"; w.className = "col-width-input";
      w.title = "幅(px)。空欄で自動";
      if(cc.width){
        w.value = String(cc.width); w.placeholder = "自動";
      }else{
        w.value = "";
        const measured = getRenderedColWidth(c.key);
        w.placeholder = (measured != null) ? `${measured}（自動）` : "自動";
      }
      w.onchange = ()=>{
        const v = parseInt(w.value.trim(), 10);
        setColCfg(c.key, { width: (Number.isFinite(v) && v > 0) ? v : null });
        render();
        renderColManager();
      };
      const headAlignGroup = makeColAlignGroup("タイトル", cc.headAlign || "left", (val)=>{ setColCfg(c.key, { headAlign: val }); render(); });
      const bodyAlignGroup = makeColAlignGroup("データ", cc.align || "left", (val)=>{ setColCfg(c.key, { align: val }); render(); });

      const sel = document.createElement("select"); sel.className = "col-wrap-sel";
      const o1 = document.createElement("option"); o1.value = "wrap"; o1.textContent = "折り返す";
      const o2 = document.createElement("option"); o2.value = "clip"; o2.textContent = "以降を非表示";
      sel.append(o1, o2);
      sel.value = cc.wrap || "wrap";
      sel.onchange = ()=>{ setColCfg(c.key, { wrap: sel.value }); render(); };
      controls.append(w, headAlignGroup, bodyAlignGroup, sel);
      card.appendChild(controls);

      // 非表示へ移動
      const mv = document.createElement("button"); mv.type = "button"; mv.className = "col-move-btn";
      mv.textContent = "非表示にする →"; mv.title = "この項目を非表示にする";
      mv.onclick = ()=>{ setColCfg(c.key, { visible:false }); render(); renderColManager(); };
      card.appendChild(mv);

      visWrap.appendChild(card);
    }else{
      // 表示へ戻す
      const mv = document.createElement("button"); mv.type = "button"; mv.className = "col-move-btn col-move-back";
      mv.textContent = "← 表示する"; mv.title = "この項目を表示する";
      mv.onclick = ()=>{ setColCfg(c.key, { visible:true }); render(); renderColManager(); };
      card.appendChild(mv);

      hidWrap.appendChild(card);
    }
  });

  if(!visWrap.children.length){
    const e = document.createElement("div"); e.className = "col-empty"; e.textContent = "表示中の項目がありません";
    visWrap.appendChild(e);
  }
  if(!hidWrap.children.length){
    const e = document.createElement("div"); e.className = "col-empty"; e.textContent = "（すべて表示中）";
    hidWrap.appendChild(e);
  }
}
function resetColCfg(){
  if(!confirm("項目の表示設定をすべてデフォルトに戻します。よろしいですか？")) return;
  colCfg = {};
  saveColCfg();
  renderColManager();
  render();
}

/* ---------- カテゴリ管理 ---------- */
const CAT_ICONS = ["📦","✨","🛒","🛍️","📊","🎯","🔥","⭐","🏷️","💡","📸","🎨","📝","🆕","🇯🇵","🇨🇳","💰","🎁","👕","👟","🧸","🍳","🏠","🚗","⚽","🎮","💄","📱","💻","🔧","🌸","🐾"];

function openCatManager(){
  catIconOpen = -1;
  renderCatManager();
  document.getElementById("catModal").hidden = false;
}
function closeCatManager(){ document.getElementById("catModal").hidden = true; }

function renderCatManager(){
  const list = document.getElementById("catList");
  list.innerHTML = "";
  state.categories.forEach((c, idx)=>{
    const row = document.createElement("div"); row.className = "cat-row";
    // 絵文字ボタン（クリックでパレット開閉）
    const iconBtn = document.createElement("button");
    iconBtn.className = "cat-icon-btn";
    if(isLogoIcon(c.icon) || isLetterIcon(c.icon)){ iconBtn.innerHTML = logoSvg(c.icon); }
    else { iconBtn.textContent = c.icon || "📦"; }
    iconBtn.title = "クリックで絵文字を選ぶ";
    iconBtn.onclick = ()=>{ catIconOpen = (catIconOpen===idx ? -1 : idx); renderCatManager(); };
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
      catIconOpen = -1;
      persistLocal(); renderCatManager(); render();
    };
    row.append(iconBtn, labelInp, up, dn, del);
    list.appendChild(row);

    // 絵文字パレット（このカテゴリで開いているとき）
    if(catIconOpen===idx){
      const palette = document.createElement("div"); palette.className="cat-icon-palette";
      // ブランドロゴ（楽天 / Yahoo）を先頭に
      Object.keys(LOGO_KEYS).forEach(lk=>{
        const b = document.createElement("button");
        b.className = "cat-icon-opt" + (lk===c.icon ? " selected" : "");
        b.innerHTML = logoSvg(lk);
        b.title = LOGO_KEYS[lk] + "ロゴ";
        b.onclick = ()=>{ c.icon = lk; catIconOpen = -1; persistLocal(); renderCatManager(); renderTabs(); };
        palette.appendChild(b);
      });
      // 色付き文字バッジ A〜Z（角丸四角に白文字）
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(ch=>{
        const b = document.createElement("button");
        const key = "letter:"+ch;
        b.className = "cat-icon-opt" + (key===c.icon ? " selected" : "");
        b.innerHTML = letterSvg(key);
        b.title = ch + "バッジ";
        b.onclick = ()=>{ c.icon = key; catIconOpen = -1; persistLocal(); renderCatManager(); renderTabs(); };
        palette.appendChild(b);
      });
      CAT_ICONS.forEach(ic=>{
        const b = document.createElement("button");
        b.className = "cat-icon-opt" + (ic===c.icon ? " selected" : "");
        b.textContent = ic;
        b.onclick = ()=>{ c.icon = ic; catIconOpen = -1; persistLocal(); renderCatManager(); renderTabs(); };
        palette.appendChild(b);
      });
      list.appendChild(palette);
    }
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

function statusAxisInfo(axis){
  if(axis==="rakuten") return { list: state.rakutenStatuses, rowField:"rakutenStatus", hasIcon:true, idPrefix:"r_" };
  if(axis==="yahoo")   return { list: state.yahooStatuses,   rowField:"yahooStatus",   hasIcon:true, idPrefix:"y_" };
  return { list: state.statuses, rowField:"status", hasIcon:true, idPrefix:"s_" };
}
function renderStatusManager(){
  const list = document.getElementById("statusList");
  list.innerHTML = "";
  // 軸切替タブ（商品状態 / 楽天 / Yahoo）
  const axisBar = document.createElement("div"); axisBar.className = "status-mgr-axes";
  [["status","商品状態"],["rakuten","楽天"],["yahoo","Yahoo"]].forEach(([id,lbl])=>{
    const b = document.createElement("button");
    b.type="button"; b.className = "status-mgr-axis" + (statusMgrAxis===id ? " active" : "");
    b.textContent = lbl;
    b.onclick = ()=>{ statusMgrAxis = id; renderStatusManager(); };
    axisBar.appendChild(b);
  });
  list.appendChild(axisBar);

  const info = statusAxisInfo(statusMgrAxis);
  const arr = info.list;
  arr.forEach((s, idx)=>{
    const row = document.createElement("div"); row.className = "cat-row";
    if(info.hasIcon){
      const pickCol = document.createElement("div"); pickCol.className = "status-pick-col";
      // 番号ロゴ選択（なし/1〜6・色固定）＋文字バッジ（OK/NG/SKIP/保留/済）
      const numWrap = document.createElement("div"); numWrap.className = "status-num-picker";
      const curTxt = isTxtIcon(s.icon) ? parseTxtIcon(s.icon) : null;
      const applyIcon = (val)=>{ s.icon = val; persistLocal(); renderStatusManager(); renderTabs(); render(); };
      [null,1,2,3,4,5,6].forEach(n=>{
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "status-num-opt";
        if(n===null){
          if(!s.icon) btn.classList.add("selected");
          btn.textContent = "—"; btn.title = "なし"; btn.classList.add("status-num-none");
          btn.onclick = ()=>applyIcon("");
        }else{
          const val = "num:"+n;
          if((s.icon||"")===val) btn.classList.add("selected");
          btn.innerHTML = statusNumSvg(val); btn.title = n+"番";
          btn.onclick = ()=>applyIcon(val);
        }
        numWrap.appendChild(btn);
      });
      TXT_PRESETS.forEach(t=>{
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "status-num-opt status-txt-opt";
        if(curTxt && curTxt.label===t) btn.classList.add("selected");
        btn.innerHTML = statusTxtBadge("txt:"+t);
        btn.title = t;
        // 文字バッジを選ぶと既定色（色指定なし）にする。色はチップで変更
        btn.onclick = ()=>applyIcon("txt:"+t);
        numWrap.appendChild(btn);
      });
      pickCol.appendChild(numWrap);
      // 文字バッジ選択中なら色チップを表示
      if(curTxt){
        const crow = document.createElement("div"); crow.className = "status-color-row";
        const clbl = document.createElement("span"); clbl.className = "status-color-lbl"; clbl.textContent = "色:";
        crow.appendChild(clbl);
        TXT_COLOR_PALETTE.forEach((col, ci)=>{
          const chip = document.createElement("button");
          chip.type = "button"; chip.className = "status-color-chip" + (curTxt.c===ci+1 ? " selected" : "");
          chip.style.background = col; chip.title = "この色にする";
          chip.onclick = ()=>applyIcon(`txt:${curTxt.label}@${ci+1}`);
          crow.appendChild(chip);
        });
        pickCol.appendChild(crow);
      }
      row.appendChild(pickCol);
    }
    const labelInp = document.createElement("input");
    labelInp.type = "text";
    labelInp.value = (s.label||"").replace(/^[①②③④⑤⑥]\s*/,"");
    labelInp.className = "cat-label-input";
    labelInp.onchange = ()=>{
      const cleaned = labelInp.value.replace(/^[①②③④⑤⑥]\s*/, "").trim();
      s.label = cleaned || s.label;
      labelInp.value = s.label;
      persistLocal(); renderTabs(); render();
    };
    const up = document.createElement("button"); up.className="cat-mv"; up.textContent="▲";
    up.disabled = idx===0;
    up.onclick = ()=>{ if(idx>0){ [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]]; persistLocal(); renderStatusManager(); renderTabs(); render(); } };
    const dn = document.createElement("button"); dn.className="cat-mv"; dn.textContent="▼";
    dn.disabled = idx===arr.length-1;
    dn.onclick = ()=>{ if(idx<arr.length-1){ [arr[idx+1], arr[idx]] = [arr[idx], arr[idx+1]]; persistLocal(); renderStatusManager(); renderTabs(); render(); } };
    const del = document.createElement("button"); del.className="cat-del"; del.textContent="🗑";
    del.title = "この状態を削除（割り当て済みは「未設定」になります）";
    del.onclick = ()=>{
      if(!confirm(`「${s.label}」を削除しますか？\n割り当て済みの商品は「未設定」になります（商品自体は消えません）。`)) return;
      state.rows.forEach(r=>{ if(r[info.rowField]===s.id) r[info.rowField]=""; });
      arr.splice(idx,1);
      if(currentStatusByAxis[statusMgrAxis]===s.id) currentStatusByAxis[statusMgrAxis]="all";
      persistLocal(); renderStatusManager(); render();
    };
    row.append(labelInp, up, dn, del);
    list.appendChild(row);
  });
}

function addStatus(){
  const inp = document.getElementById("newStatusLabel");
  const label = inp.value.trim();
  if(!label){ setStatus("⚠️ 名前を入力してください"); return; }
  const info = statusAxisInfo(statusMgrAxis);
  const id = info.idPrefix + Date.now().toString(36);
  info.list.push({ id, label });
  inp.value = "";
  persistLocal(); renderStatusManager(); renderTabs(); render();
}

/* ---------- 設定モーダル ---------- */
function openSettings(){
  document.getElementById("cfgPat").value = cfg.pat;
  document.getElementById("cfgOwner").value = cfg.owner || "kaiyoshida0318";
  document.getElementById("cfgRepo").value = cfg.repo || "yusen";
  document.getElementById("cfgBranch").value = cfg.branch || "main";
  // 詳細設定は閉じた状態で開く
  const adv = document.getElementById("advSettings");
  const btn = document.getElementById("btnToggleAdvSettings");
  if(adv) adv.hidden = true;
  if(btn) btn.textContent = "▶ 詳細設定（オーナー／リポジトリ／ブランチ）";
  document.getElementById("settingsModal").hidden = false;
}
function closeSettings(){ document.getElementById("settingsModal").hidden = true; }

/* ---------- UI バインド ---------- */
function bindUI(){
  // 編集モーダルの上下ボタン（data-act で委譲）
  document.getElementById("entryModal").addEventListener("click", e=>{
    const btn = e.target.closest("[data-act]");
    if(!btn) return;
    const act = btn.dataset.act;
    if(act==="cancel") cancelEntry();
    else if(act==="close-view") closeEntry();
    else if(act==="startedit") startEditEntry();
    else if(act==="save") saveEntry(true);
    else if(act==="saveclose") saveEntry(false);
    else if(act==="delete") deleteCurrentEntry();
  });
  document.getElementById("btnAddRivalR").onclick = ()=>addRival("rivalRakuten");
  document.getElementById("btnAddRivalA").onclick = ()=>addRival("rivalAmazon");
  document.getElementById("btnAddRanking").onclick = addRanking;
  const btnAddCompany = document.getElementById("btnAddCompany");
  if(btnAddCompany) btnAddCompany.onclick = addCompany;
  const btnHeaderLog = document.getElementById("btnHeaderLog");
  if(btnHeaderLog) btnHeaderLog.onclick = openLogModal;
  bindFreeNote();
  // 項目追加メニュー
  const btnAddBlock = document.getElementById("btnAddBlock");
  if(btnAddBlock){
    btnAddBlock.onclick = (e)=>{
      e.stopPropagation();
      const menu = document.getElementById("addBlockMenu");
      if(menu) menu.hidden = !menu.hidden;
    };
  }
  const addMenu = document.getElementById("addBlockMenu");
  if(addMenu){
    addMenu.addEventListener("click", e=>{
      const opt = e.target.closest("[data-block]");
      if(!opt) return;
      addBlock(opt.dataset.block);
      addMenu.hidden = true;
    });
  }
  // モーダル内の他の場所をクリックしたらメニューを閉じる
  const blocksArea = document.getElementById("blocksArea");
  document.addEventListener("click", e=>{
    const menu = document.getElementById("addBlockMenu");
    if(!menu || menu.hidden) return;
    const wrap = e.target.closest(".add-block-wrap");
    if(!wrap) menu.hidden = true;
  });
  document.getElementById("btnSave").onclick = saveToGitHub;
  const btnListEdit = document.getElementById("btnListEdit");
  if(btnListEdit){ btnListEdit.onclick = toggleListEditMode; updateListEditBtn(); }
  document.getElementById("btnSettings").onclick = openSettings;
  const _btnManageCats = document.getElementById("btnManageCats");
  if(_btnManageCats) _btnManageCats.onclick = openCatManager;
  document.getElementById("btnManageCols").onclick = openColManager;
  document.getElementById("btnCloseCols").onclick = closeColManager;
  document.getElementById("btnResetCols").onclick = resetColCfg;
  const btnDragResize = document.getElementById("btnDragResize");
  if(btnDragResize) btnDragResize.onclick = enterColResizeMode;
  const btnResizeDone = document.getElementById("btnResizeDone");
  if(btnResizeDone) btnResizeDone.onclick = exitColResizeMode;
  document.getElementById("btnManageStatus").onclick = openStatusManager;
  document.getElementById("btnCloseStatus").onclick = closeStatusManager;
  document.getElementById("btnAddStatus").onclick = addStatus;
  document.getElementById("newStatusLabel").addEventListener("keydown", e=>{ if(e.key==="Enter") addStatus(); });
  document.getElementById("btnCloseSettings").onclick = closeSettings;
  // 詳細設定トグル
  const btnToggleAdv = document.getElementById("btnToggleAdvSettings");
  if(btnToggleAdv){
    btnToggleAdv.onclick = ()=>{
      const wrap = document.getElementById("advSettings");
      const showing = !wrap.hidden;
      wrap.hidden = showing;
      btnToggleAdv.textContent = (showing ? "▶" : "▼") + " 詳細設定（オーナー／リポジトリ／ブランチ）";
    };
  }
  document.getElementById("btnCloseCat").onclick = closeCatManager;
  document.getElementById("btnAddCat").onclick = addCategory;
  document.getElementById("newCatLabel").addEventListener("keydown", e=>{ if(e.key==="Enter") addCategory(); });
  document.getElementById("btnSaveSettings").onclick = ()=>{
    cfg.pat = document.getElementById("cfgPat").value.trim();
    cfg.owner = document.getElementById("cfgOwner").value.trim() || "kaiyoshida0318";
    cfg.repo = document.getElementById("cfgRepo").value.trim() || "yusen";
    cfg.branch = document.getElementById("cfgBranch").value.trim() || "main";
    saveCfg(); closeSettings();
    setStatus("✅ 設定を保存しました");
    loadFromGitHub();
  };
  // ログモーダル
  document.getElementById("btnViewLog").onclick = openLogModal;
  document.getElementById("btnCloseLog").onclick = ()=>{ document.getElementById("logModal").hidden = true; };
  document.getElementById("btnCopyLog").onclick = ()=>{
    const text = document.getElementById("logArea").value;
    try{
      navigator.clipboard.writeText(text).then(
        ()=>setStatus("✅ ログをクリップボードにコピーしました"),
        ()=>setStatus("❌ クリップボードへのコピーに失敗（手動で選択してコピーしてください）")
      );
    }catch(e){
      // フォールバック: 選択
      document.getElementById("logArea").select();
      setStatus("⚠️ 手動で Ctrl+C / Cmd+C を押してください");
    }
  };
  document.getElementById("btnClearLog").onclick = ()=>{
    if(!confirm("ログを全削除します。よろしいですか？")) return;
    clearAppLog();
    document.getElementById("logArea").value = "";
    setStatus("✅ ログをクリアしました");
  };
}

function openLogModal(){
  document.getElementById("logArea").value = formatAppLogs() || "（ログはまだありません）";
  document.getElementById("logModal").hidden = false;
}

/* ---------- アプリログ（デバッグ用、設定モーダルから閲覧可能） ---------- */
const LS_LOG = "yusen_log_v1";
const LOG_MAX = 500;
let appLogs = [];
try{ appLogs = JSON.parse(localStorage.getItem(LS_LOG) || "[]"); if(!Array.isArray(appLogs)) appLogs = []; }catch(_){ appLogs = []; }
function appLog(level, message, extra){
  try{
    const e = {
      t: new Date().toISOString(),
      lv: level || "info",
      msg: String(message || ""),
    };
    if(extra) e.extra = (typeof extra==="string" ? extra : JSON.stringify(extra)).slice(0, 1000);
    appLogs.push(e);
    if(appLogs.length > LOG_MAX) appLogs = appLogs.slice(-LOG_MAX);
    try{ localStorage.setItem(LS_LOG, JSON.stringify(appLogs)); }catch(_){ /* 容量超過時は無視 */ }
  }catch(_){}
}
function clearAppLog(){
  appLogs = [];
  try{ localStorage.removeItem(LS_LOG); }catch(_){}
}
function formatAppLogs(){
  return appLogs.map(e=>{
    const t = e.t.replace("T"," ").replace(/\..*$/, "");
    return `[${t}] [${e.lv}] ${e.msg}` + (e.extra ? ` | ${e.extra}` : "");
  }).join("\n");
}
// レベル別ショートカット
function logInfo(m, x){ appLog("info", m, x); }
function logWarn(m, x){ appLog("warn", m, x); }
function logError(m, x){ appLog("error", m, x); }

function setStatus(msg){
  const el = document.getElementById("status");
  el.textContent = msg;
  // ステータスメッセージを自動でログに記録（先頭の絵文字でレベル判定）
  let lv = "info";
  if(typeof msg === "string"){
    if(msg.startsWith("❌")) lv = "error";
    else if(msg.startsWith("⚠️")) lv = "warn";
  }
  if(msg) appLog(lv, msg);
  if(msg && msg.startsWith("✅")) setTimeout(()=>{ if(el.textContent===msg) el.textContent=""; }, 3500);
}

/* ===================================================================
   ▼▼▼ v1.12.0 追加：ブロック方式の項目追加（既存関数は未変更） ▼▼▼
   - entry.blocks = [{ type:"rakumart"|"supplier"|"table", id, items[] / data{} }]
   - 表示順 = blocks配列の順。同種を何個でも追加できる。
   =================================================================== */

// blocks → 従来形式（entry.rakumart / entry.suppliers / entry.tables）へ集約
// 一覧表示・保存・既存データ互換のため、保存直前に呼ぶ。
function collectBlocksIntoEntry(){
  const rak = [];
  const sup = [];
  const tbls = [];
  const notes = [];
  (entry.blocks || []).forEach(b=>{
    if(b.type==="rakumart"){ (b.items||[]).forEach(it=> rak.push(it)); }
    else if(b.type==="supplier"){ (b.items||[]).forEach(it=> sup.push(it)); }
    else if(b.type==="table"){ if(b.data) tbls.push(b.data); }
    else if(b.type==="freenote"){ if(b.html && b.html.trim()) notes.push(b.html); }
  });
  entry.rakumart = rak;
  entry.suppliers = sup;
  entry.tables = tbls;
  // 自由記入欄は複数ブロックあれば連結して1つの freeNote にまとめる
  entry.freeNote = notes.join("<hr>");
}

// ブロックを順に描画
function renderBlocks(){
  const area = document.getElementById("blocksArea");
  if(!area) return;
  area.innerHTML = "";
  (entry.blocks || []).forEach((block, bi)=>{
    const sec = document.createElement("div");
    sec.className = "block-section block-" + block.type;

    // ヘッダー
    const head = document.createElement("div"); head.className = "block-head";
    const ttl = document.createElement("span"); ttl.className = "block-ttl";
    ttl.textContent = blockTitle(block.type);
    head.appendChild(ttl);

    // 並び替え 上↑下↓ボタン
    const mv = makeMoveButtons(bi, entry.blocks.length, (dir)=>{ moveItem(entry.blocks, bi, dir); renderBlocks(); }, "block-mv");
    head.appendChild(mv);

    // 種別ごとの「項目を追加」ボタン（rakumart / supplier のみ。表・自由記入欄は1ブロック=1つ）
    if(block.type==="rakumart"){
      const addItem = document.createElement("button");
      addItem.type="button"; addItem.className="btn btn-add btn-sm block-add-item";
      addItem.textContent = "＋ ラクマートを追加";
      addItem.onclick = ()=>{
        if(!Array.isArray(block.items)) block.items = [];
        block.items.unshift({ text:"", url:"", collapsed:false });
        renderBlocks();
        const editors = sec.querySelectorAll(".rakumart-paste");
        if(editors[0]) editors[0].focus();
      };
      head.appendChild(addItem);
    }else if(block.type==="supplier"){
      const addItem = document.createElement("button");
      addItem.type="button"; addItem.className="btn btn-add btn-sm block-add-item";
      addItem.textContent = "＋ 仕入先を追加";
      addItem.onclick = ()=>{
        if(!Array.isArray(block.items)) block.items = [];
        block.items.push({ image:"", imageIsDataUrl:false, url:"", memo:"", collapsed:false });
        renderBlocks();
      };
      head.appendChild(addItem);
    }

    // ブロック削除「×」
    const del = document.createElement("button");
    del.type="button"; del.className="block-del"; del.textContent="×";
    del.title = "このセクションを削除";
    del.onclick = ()=>{
      entry.blocks.splice(bi, 1);
      renderBlocks();
    };
    head.appendChild(del);

    sec.appendChild(head);

    // 本文
    const body = document.createElement("div"); body.className = "block-body";
    if(block.type==="rakumart"){
      if(!Array.isArray(block.items)) block.items = [];
      renderRakumartInto(body, block.items);
      const hint = document.createElement("p"); hint.className="hint-inline";
      hint.textContent = "ラクマート商品ページのリンクをハイパーリンク状態でコピーして欄に貼り付け（例：2026010815054728-2147）";
      body.appendChild(hint);
    }else if(block.type==="supplier"){
      if(!Array.isArray(block.items)) block.items = [];
      renderSuppliersInto(body, block.items);
    }else if(block.type==="table"){
      if(!block.data) block.data = newTableData();
      renderTableInto(body, block);
    }else if(block.type==="freenote"){
      renderFreeNoteInto(body, block);
    }
    sec.appendChild(body);

    area.appendChild(sec);
  });
}

function blockTitle(type){
  if(type==="rakumart") return "🛒 ラクマート";
  if(type==="supplier") return "🏭 仕入先（中国輸入元）";
  if(type==="table") return "📋 表";
  if(type==="freenote") return "📝 自由記入欄";
  return "";
}

// 空テーブルデータを作る（addTable と同じ初期構造）
function newTableData(){
  const columns = [{type:"image"}, {type:"text"}, {type:"text"}];
  const header = ["\u753b\u50cf", "", ""];
  const rows = Array.from({length:3}, ()=>({
    cells: columns.map(c=> c.type==="image"?{image:"",imageIsDataUrl:false}:{text:"",url:""})
  }));
  return { columns, header, rows };
}

// 指定タイプの空ブロックを追加
function addBlock(type){
  if(!Array.isArray(entry.blocks)) entry.blocks = [];
  if(type==="rakumart"){
    entry.blocks.push({ type:"rakumart", id:nextBlockId(), items:[{ text:"", url:"", collapsed:false }] });
  }else if(type==="supplier"){
    entry.blocks.push({ type:"supplier", id:nextBlockId(), items:[{ image:"", imageIsDataUrl:false, url:"", memo:"", collapsed:false }] });
  }else if(type==="table"){
    entry.blocks.push({ type:"table", id:nextBlockId(), data:newTableData() });
  }else if(type==="freenote"){
    entry.blocks.push({ type:"freenote", id:nextBlockId(), html:"" });
  }else{
    return;
  }
  renderBlocks();
}

/* ----- renderRakumartInto: 既存 renderRakumart のロジックを container / items に適用 ----- */
function renderRakumartInto(container, items){
  container.innerHTML = "";
  items.forEach((r, idx)=>{
    const card = document.createElement("div");
    card.className = "rakumart-row" + (r.collapsed ? " is-collapsed" : "");

    const tg = document.createElement("button");
    tg.type="button"; tg.className="rakumart-toggle";
    tg.textContent = r.collapsed ? "▶" : "▼";
    tg.title = r.collapsed ? "展開" : "折りたたむ";
    tg.onclick = ()=>{ r.collapsed = !r.collapsed; renderRakumartInto(container, items); };
    const mv = makeMoveButtons(idx, items.length, (dir)=>{ moveItem(items, idx, dir); renderRakumartInto(container, items); }, "rakumart-mv");

    const num = document.createElement("span"); num.className="rakumart-num"; num.textContent = `#${items.length - idx}`;

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
    rm.onclick = ()=>{ items.splice(idx,1); renderRakumartInto(container, items); };

    card.append(tg, mv, num, bodyEl, rm);
    container.appendChild(card);
  });
}

/* ----- renderSuppliersInto: 既存 renderSuppliers のロジックを container / items に適用 ----- */
function renderSuppliersInto(container, items){
  container.innerHTML = "";
  items.forEach((s, idx)=>{
    const card = document.createElement("div");
    card.className = "supplier-card" + (s.collapsed ? " is-collapsed" : "");

    const head = document.createElement("div"); head.className="supplier-head";
    const tg = document.createElement("button");
    tg.type="button"; tg.className="supplier-toggle";
    tg.textContent = s.collapsed ? "▶" : "▼";
    tg.title = s.collapsed ? "展開" : "折りたたむ";
    tg.onclick = ()=>{ s.collapsed = !s.collapsed; renderSuppliersInto(container, items); };
    const mv = makeMoveButtons(idx, items.length, (dir)=>{ moveItem(items, idx, dir); renderSuppliersInto(container, items); }, "supplier-mv");
    const ttl = document.createElement("span"); ttl.className="supplier-ttl"; ttl.textContent=`仕入先 ${idx+1}`;
    const summary = document.createElement("span"); summary.className="supplier-summary";
    if(s.collapsed){
      const parts=[];
      if(s.url) parts.push(s.url.replace(/^https?:\/\//,"").slice(0,40));
      if(s.memo) parts.push(s.memo);
      summary.textContent = parts.join(" / ") || "（未入力）";
    }
    const rm = document.createElement("button"); rm.type="button"; rm.className="supplier-del"; rm.textContent="×"; rm.title="この仕入先を削除";
    rm.onclick = ()=>{ items.splice(idx,1); renderSuppliersInto(container, items); };
    head.append(tg, mv, ttl, summary, rm);
    card.appendChild(head);

    if(!s.collapsed){
      const bodyRow = document.createElement("div"); bodyRow.className="supplier-body";

      const imgCol = document.createElement("div"); imgCol.className="supplier-image-col";
      const imgBox = document.createElement("div"); imgBox.className="supplier-image";
      if(s.image){
        const im=document.createElement("img"); im.src=s.imageIsDataUrl?s.image:imgUrl(s.image);
        im.className="supplier-preview"; im.title="クリック／ドロップで差し替え";
        im.onclick=()=>pickImageInto(s,"image", ()=>renderSuppliersInto(container, items), imgBox);
        imgBox.appendChild(im);
      }else{
        const drop=document.createElement("div"); drop.className="img-drop"; drop.innerHTML="仕入先画像<br>クリック／ドロップ";
        drop.onclick=()=>pickImageInto(s,"image", ()=>renderSuppliersInto(container, items), imgBox);
        imgBox.appendChild(drop);
      }
      enableImageDrop(imgBox, s, "image", ()=>renderSuppliersInto(container, items));
      imgCol.appendChild(imgBox);
      imgCol.appendChild(makeUrlPasteRow(s, "image", ()=>renderSuppliersInto(container, items), imgBox));
      bodyRow.appendChild(imgCol);

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
    container.appendChild(card);
  });
}

/* ----- renderTableInto: 既存 renderTables のロジックを 1ブロック=1表 に適用 ----- */
function renderTableInto(container, block){
  container.innerHTML = "";
  const tbl = block.data;
  const rerender = ()=>renderTableInto(container, block);

  const card = document.createElement("div"); card.className="tbl-card";

  // ヘッダー操作行（表自体の削除ボタンは廃止。ブロックの×で消す）
  const head = document.createElement("div"); head.className="tbl-head";
  const ttl = document.createElement("span"); ttl.className="tbl-ttl"; ttl.textContent="表の内容";
  const addTextCol = document.createElement("button"); addTextCol.type="button"; addTextCol.className="btn btn-ghost btn-sm"; addTextCol.textContent="\uff0b\u30c6\u30ad\u30b9\u30c8\u5217";
  addTextCol.onclick = ()=>{ tbl.columns.push({type:"text"}); tbl.header.push(""); tbl.rows.forEach(r=>r.cells.push({text:"",url:""})); rerender(); };
  const addImgCol = document.createElement("button"); addImgCol.type="button"; addImgCol.className="btn btn-ghost btn-sm"; addImgCol.textContent="\uff0b\u753b\u50cf\u5217";
  addImgCol.onclick = ()=>{ tbl.columns.push({type:"image"}); tbl.header.push(""); tbl.rows.forEach(r=>r.cells.push({image:"",imageIsDataUrl:false})); rerender(); };
  const addRow = document.createElement("button"); addRow.type="button"; addRow.className="btn btn-ghost btn-sm"; addRow.textContent="\uff0b\u884c";
  addRow.onclick = ()=>{ tbl.rows.push({ cells: tbl.columns.map(c=> c.type==="image"?{image:"",imageIsDataUrl:false}:{text:"",url:""}) }); rerender(); };
  head.append(ttl, addTextCol, addImgCol, addRow);
  card.appendChild(head);

  const table = document.createElement("table"); table.className="tbl-grid";

  // 列削除ボタン行
  const colDelTr = document.createElement("tr"); colDelTr.className="tbl-coldel-row";
  tbl.columns.forEach((col, ci)=>{
    const td = document.createElement("td"); td.className="tbl-coldel-cell";
    const cd = document.createElement("button"); cd.type="button"; cd.className="tbl-coldel"; cd.textContent="\u00d7 \u5217\u3092\u524a\u9664"; cd.title="\u3053\u306e\u5217\u3092\u524a\u9664";
    cd.onclick = ()=>{
      tbl.columns.splice(ci,1); tbl.header.splice(ci,1);
      tbl.rows.forEach(r=>r.cells.splice(ci,1));
      rerender();
    };
    td.appendChild(cd); colDelTr.appendChild(td);
  });
  colDelTr.appendChild(document.createElement("td"));

  // タイトル行
  const headTr = document.createElement("tr"); headTr.className="tbl-title-row";
  tbl.columns.forEach((col, ci)=>{
    const td = document.createElement("td");
    td.appendChild(makeHeaderCell(tbl, ci));
    headTr.appendChild(td);
  });
  headTr.appendChild(document.createElement("td"));
  table.appendChild(headTr);

  // データ行
  tbl.rows.forEach((r, ri)=>{
    const tr = document.createElement("tr");
    tbl.columns.forEach((col, ci)=>{
      const cell = r.cells[ci] || (col.type==="image"?{image:"",imageIsDataUrl:false}:{text:"",url:""});
      r.cells[ci] = cell;
      const td = document.createElement("td");
      if(col.type==="image"){
        td.className="tbl-img-cell";
        const imgBox = document.createElement("div"); imgBox.className="tbl-img-box";
        if(cell.image){
          const im=document.createElement("img"); im.src=cell.imageIsDataUrl?cell.image:imgUrl(cell.image);
          im.className="tbl-img"; im.title="\u30af\u30ea\u30c3\u30af\uff0f\u30c9\u30ed\u30c3\u30d7\u3067\u5dee\u3057\u66ff\u3048";
          im.onclick=()=>pickImageInto(cell,"image",rerender,imgBox);
          imgBox.appendChild(im);
        }else{
          const drop=document.createElement("div"); drop.className="img-drop"; drop.innerHTML="\u753b\u50cf";
          drop.onclick=()=>pickImageInto(cell,"image",rerender,imgBox);
          imgBox.appendChild(drop);
        }
        enableImageDrop(imgBox, cell, "image", rerender);
        td.appendChild(imgBox);
      }else{
        td.className="tbl-txt-cell";
        td.appendChild(makeLinkCell(cell));
      }
      tr.appendChild(td);
    });
    const tdDel = document.createElement("td"); tdDel.className="tbl-rowdel-cell";
    const rowCtrl = document.createElement("div"); rowCtrl.className="tbl-row-ctrl";
    const ins = document.createElement("button"); ins.type="button"; ins.className="tbl-rowins"; ins.textContent="\uff0b"; ins.title="\u3053\u306e\u884c\u306e\u4e0a\u306b1\u884c\u8ffd\u52a0";
    ins.onclick = ()=>{ tbl.rows.splice(ri, 0, { cells: tbl.columns.map(c=> c.type==="image"?{image:"",imageIsDataUrl:false}:{text:"",url:""}) }); rerender(); };
    const rd = document.createElement("button"); rd.type="button"; rd.className="tbl-rowdel"; rd.textContent="\u00d7"; rd.title="\u3053\u306e\u884c\u3092\u524a\u9664";
    rd.onclick = ()=>{ tbl.rows.splice(ri,1); rerender(); };
    rowCtrl.append(ins, rd);
    tdDel.appendChild(rowCtrl);
    tr.appendChild(tdDel);
    table.appendChild(tr);
  });

  table.appendChild(colDelTr);
  card.appendChild(table);
  container.appendChild(card);
}

/* ----- renderFreeNoteInto: 自由記入欄ブロック（リンク貼り付け対応） ----- */
function renderFreeNoteInto(container, block){
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "free-note-box";
  box.contentEditable = "true";
  box.setAttribute("spellcheck","false");
  box.setAttribute("data-ph","メモや補足を自由に記入（リンクの貼り付けもできます）");
  box.innerHTML = block.html || "";
  const refreshPh = ()=> box.classList.toggle("is-empty", !(box.textContent.trim() || box.querySelector("a,img")));
  const sync = ()=>{ block.html = box.innerHTML; refreshPh(); };
  box.addEventListener("input", sync);
  box.addEventListener("paste", e=>{
    try{
      const html = e.clipboardData && e.clipboardData.getData("text/html");
      const plain = e.clipboardData && e.clipboardData.getData("text/plain");
      if(html){
        const tmp = document.createElement("div"); tmp.innerHTML = html;
        tmp.querySelectorAll("a").forEach(a=>{ a.target="_blank"; a.rel="noopener"; });
        e.preventDefault();
        document.execCommand("insertHTML", false, tmp.innerHTML);
        sync(); return;
      }
      if(plain){
        e.preventDefault();
        if(/^https?:\/\/\S+$/i.test(plain.trim())){
          document.execCommand("insertHTML", false, `<a href="${plain.trim()}" target="_blank" rel="noopener">${plain.trim()}</a>`);
        }else{
          document.execCommand("insertText", false, plain);
        }
        sync(); return;
      }
    }catch(err){}
    setTimeout(sync,0);
  });
  refreshPh();
  container.appendChild(box);
}

/* ▲▲▲ v1.12.0 追加ここまで ▲▲▲ */

document.addEventListener("DOMContentLoaded", init);
