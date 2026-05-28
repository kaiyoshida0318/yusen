:root{
  --bg:#f4f2ee; --surface:#ffffff; --text:#1f1d1a; --muted:#7a756d;
  --border:#e3ded6; --accent:#e2664a; --accent-dark:#c8503a;
  --green:#3f9b6e; --row-alt:#faf8f4; --radius:12px;
  --shadow:0 1px 3px rgba(0,0,0,.06),0 6px 20px rgba(0,0,0,.04);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Noto Sans JP",sans-serif;background:var(--bg);color:var(--text);font-size:14px}

.app-header{background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10}
.header-inner{margin:0;padding:12px 16px;display:flex;align-items:center;gap:14px}
.logo{font-family:"Zen Kaku Gothic New",sans-serif;font-size:20px;font-weight:700;letter-spacing:.02em}
.logo-img{display:block;height:40px;width:auto}
.version{font-size:11px;color:var(--muted);background:var(--bg);padding:2px 8px;border-radius:20px}
.header-actions{margin-left:auto;display:flex;gap:8px}

.container{max-width:none;margin:0;padding:20px 16px}

/* カテゴリタブ */
.cat-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:8px}
.cat-tab{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;color:var(--text);cursor:pointer;transition:all .15s}
.cat-tab:hover{border-color:var(--accent);color:var(--accent)}
.cat-tab.active{background:var(--accent);border-color:var(--accent);color:#fff}
.cat-icon{font-size:14px}
.cat-label{font-weight:500}
.cat-count{font-size:11px;background:rgba(0,0,0,.08);padding:1px 7px;border-radius:999px;min-width:18px;text-align:center}
.cat-tab.active .cat-count{background:rgba(255,255,255,.25)}
.cat-tab.cat-manage{margin-left:auto;color:var(--muted);background:transparent;border-style:dashed}
.cat-tab.cat-manage:hover{color:var(--accent);background:var(--surface)}

/* カテゴリ管理モーダル */
.cat-add-row{display:flex;gap:8px;margin-bottom:14px}
.cat-add-row input{flex:1;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font:inherit}
.cat-list{display:flex;flex-direction:column;gap:6px;max-height:340px;overflow:auto;margin-bottom:8px}
.cat-row{display:flex;align-items:center;gap:6px;padding:8px;background:var(--row-alt);border-radius:8px}
.cat-icon-btn{background:#fff;border:1px solid var(--border);border-radius:8px;width:42px;height:38px;font-size:18px;cursor:pointer;flex-shrink:0}
.cat-icon-btn:hover{border-color:var(--accent)}
.cat-label-input{flex:1;padding:7px 9px;border:1px solid var(--border);border-radius:8px;font:inherit}
.cat-mv{background:#fff;border:1px solid var(--border);border-radius:6px;width:28px;height:32px;cursor:pointer;font-size:11px}
.cat-mv:disabled{opacity:.3;cursor:not-allowed}
.cat-del{background:#fff;border:1px solid var(--border);border-radius:6px;width:32px;height:32px;cursor:pointer;font-size:13px}
.cat-del:hover{border-color:var(--accent);color:var(--accent)}

.modal select{width:100%;margin-top:5px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font:inherit;color:var(--text);background:#fff}
.toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.status{margin-left:auto;font-size:13px;color:var(--muted)}

.btn{font-family:inherit;font-size:13px;font-weight:500;padding:8px 14px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:all .15s}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{background:var(--accent-dark)}
.btn-add{background:var(--green);color:#fff}
.btn-add:hover{filter:brightness(.94)}
.btn-ghost{background:var(--surface);border-color:var(--border);color:var(--text)}
.btn-ghost:hover{background:var(--bg)}

.table-wrap{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:auto}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:0;text-align:left;vertical-align:middle}
th:last-child,td:last-child{border-right:none}
thead th{background:var(--bg);font-weight:700;font-size:13px;position:relative}
th .th-label{padding:12px 14px;display:block;outline:none}
th .th-label[contenteditable]:focus{background:#fff;box-shadow:inset 0 0 0 2px var(--accent)}
tbody tr:nth-child(even){background:var(--row-alt)}
tbody td{padding:10px 12px}
tbody td input[type=text]{width:100%;border:none;background:transparent;font:inherit;color:inherit;outline:none;padding:4px}
tbody td input[type=text]:focus{background:#fff;box-shadow:inset 0 0 0 2px var(--accent);border-radius:6px}

.col-date{width:130px}
.col-image{width:120px}
.col-actions{width:60px;text-align:center}

.img-cell{display:flex;align-items:center;justify-content:center;min-height:64px}
.img-cell img{max-width:96px;max-height:96px;border-radius:8px;object-fit:cover;cursor:pointer}
.img-drop{width:88px;height:64px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;cursor:pointer;text-align:center;line-height:1.3}
.img-drop:hover{border-color:var(--accent);color:var(--accent)}

.col-del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px}
.col-del:hover{color:var(--accent)}

.row-btn{background:none;border:none;cursor:pointer;font-size:15px;padding:2px 4px;opacity:.7}
.row-btn:hover{opacity:1}
.muted{color:var(--muted)}
.empty-row{text-align:center;color:var(--muted);padding:32px 12px!important}
.url-link{color:var(--accent);text-decoration:none}
.url-link:hover{text-decoration:underline}
tbody td{font-size:13px}

/* 登録モーダル */
.modal-entry .entry-right input{width:100%}
.modal-entry label{margin-bottom:18px}
.entry-body{display:flex;gap:24px;margin-bottom:8px}
.entry-left{flex:0 0 320px}
.entry-img-label{font-size:12px;font-weight:500;color:var(--muted);margin-bottom:5px}
.entry-left-meta{width:320px;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.entry-left-meta label{margin-bottom:0;font-size:12px;font-weight:500;color:var(--muted);display:block}
.entry-left-meta input,.entry-left-meta select{width:100%;margin-top:5px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font:inherit;color:var(--text);background:#fff;box-sizing:border-box}
.entry-right{flex:1}
.entry-image{width:320px;height:320px;border:2px dashed var(--border);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;overflow:hidden}
.entry-image .img-drop{width:100%;height:100%;border:none;border-radius:0;font-size:13px}
.entry-preview{width:100%;height:100%;object-fit:cover;cursor:pointer}

/* 一覧の画像セル（複数並べ） */
.img-cell-multi{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.img-cell-multi img{width:56px;height:56px;border-radius:8px;object-fit:cover;border:1px solid var(--border)}
.sup-line{font-size:12px;margin-bottom:3px}
.sup-memo{color:var(--muted)}

/* 仕入先セクション（モーダル右下） */
.btn-sm{padding:5px 10px;font-size:12px}
.supplier-section{margin-top:4px;border-top:1px solid var(--border);padding-top:14px}
.supplier-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.supplier-section-ttl{font-size:13px;font-weight:700;color:var(--text)}
.supplier-card{border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px;background:var(--row-alt)}
.supplier-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.supplier-ttl{font-size:12px;font-weight:500;color:var(--muted)}
.supplier-del{background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;line-height:1}
.supplier-del:hover{color:var(--accent)}
.supplier-body{display:flex;gap:14px}
.supplier-image{flex:0 0 110px;width:110px;height:110px;border:2px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--surface)}
.supplier-image .img-drop{width:100%;height:100%;border:none;border-radius:0;font-size:11px}
.supplier-preview{width:100%;height:100%;object-fit:cover;cursor:pointer}
.supplier-fields{flex:1;display:flex;flex-direction:column;gap:0}
.supplier-fields label{margin-bottom:8px}

/* ラクマート */
.rakumart-section{margin-top:8px}
.hint-inline{font-size:11px;color:var(--muted);margin-top:6px;line-height:1.4}
.rakumart-row{display:flex;align-items:stretch;gap:8px;margin-bottom:8px}
.rakumart-num{flex:0 0 36px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--muted);background:var(--row-alt);border-radius:8px}
.rakumart-paste{flex:1;min-height:42px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:#fff;font:inherit;color:var(--text);outline:none;line-height:1.4}
.rakumart-paste:focus{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.rakumart-paste:empty::before{content:attr(data-placeholder);color:var(--muted)}
.rakumart-paste a{color:var(--accent);text-decoration:underline;word-break:break-all}
.rakumart-del{flex:0 0 32px;background:#fff;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:16px;cursor:pointer}
.rakumart-del:hover{border-color:var(--accent);color:var(--accent)}
.th-del{position:absolute;top:6px;right:6px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;opacity:.5}
.th-del:hover{opacity:1;color:var(--accent)}

.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50}
.modal{background:var(--surface);border-radius:var(--radius);padding:28px;width:420px;max-width:90vw;box-shadow:var(--shadow)}
.modal.modal-entry{width:1600px;max-width:95vw}
.modal h2{font-family:"Zen Kaku Gothic New",sans-serif;margin-bottom:8px}
.modal .hint{font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.5}
.modal label{display:block;font-size:12px;font-weight:500;margin-bottom:14px;color:var(--muted)}
.modal input{width:100%;margin-top:5px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font:inherit;color:var(--text)}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
[hidden]{display:none!important}
