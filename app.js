// diary-release: 2026.10.26.9
var STORAGE_KEY = 'penang_timeline_diary';
var TRASH_KEY = 'penang_timeline_trash';
var trash=structuredClone(DiaryStore.snapshot.trash);
var SETTINGS_KEY='penang_timeline_settings';
var entries=structuredClone(DiaryStore.snapshot.entries);
function legacySourceName(value){return value==='user'?'五月':value==='yan'?'言':value==='G老师'?'叙':value||'未署名';}
function sourceName(value){return typeof value==='string'&&value?value:'未署名';}
var didMigrateLegacySources=false;
async function refreshDiaryData(render){
  await DiaryStore.refresh();entries=structuredClone(DiaryStore.snapshot.entries);trash=structuredClone(DiaryStore.snapshot.trash);
  if(render!==false){renderTimeline();renderTagChips();renderSourceChips();}
  if(window.refreshSyncStatus)await refreshSyncStatus();
}
DiaryStore.onChange(async function(external){await refreshDiaryData(external);if(external&&hasDiaryDraft())showToast('其他窗口有更新，当前草稿已保留；保存冲突时会另存副本');});
function actionIcon(kind) {
  var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.classList.add('attachment-icon');
  var shapes={photo:['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z','m4 17 5-5 4 4 3-3 5 5','M8.5 8h.01'],link:['M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2','M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2'],edit:['m14 5 5 5','M4 20l1-6L16 3a2.8 2.8 0 0 1 4 4L9 18l-5 2Z'],delete:['m6 6 12 12','M18 6 6 18']};
  (shapes[kind]||[]).forEach(function(d){var path=document.createElementNS(ns,'path');path.setAttribute('d',d);svg.appendChild(path);});return svg;
}
function sourceNames() { return window.AuthorSettings ? AuthorSettings.names() : Array.from(new Set(entries.map(function(entry){return sourceName(entry.source);}))); }
var activeFilters = { from: '', to: '', tags: [], search: '', source: '' };

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () { t.classList.remove('show'); }, 2000);
}

function uid() {
  return crypto.randomUUID();
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function allTags() {
  var set = Object.create(null);
  entries.forEach(function (e) { (e.tags || []).forEach(function (t) { set[t] = true; }); });
  var used = Object.keys(set);
  var ordered = PRESET_TAGS.filter(function (t) { return used.indexOf(t) > -1; });
  var extras = used.filter(function (t) { return PRESET_TAGS.indexOf(t) === -1; }).sort();
  return ordered.concat(extras);
}

function renderTagChips() {
  var wrap = document.getElementById('tag-chips');
  var tags = allTags();
  wrap.innerHTML = '';
  if (tags.length === 0) {
    wrap.innerHTML = '<span style="font-size:12px;color:#C7C6BE;">还没有标签</span>';
    return;
  }
  tags.forEach(function (tag) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip' + (activeFilters.tags.indexOf(tag) > -1 ? ' selected' : '');
    chip.textContent = tag;
    chip.onclick = function () {
      var idx = activeFilters.tags.indexOf(tag);
      if (idx > -1) activeFilters.tags.splice(idx, 1);
      else activeFilters.tags.push(tag);
      renderTagChips();
      renderTimeline();
      updateFilterBtnState();
    };
    wrap.appendChild(chip);
  });
}

function renderSourceChips() {
  var wrap = document.getElementById('source-chips');
  wrap.innerHTML = '';
  sourceNames().map(function (name) { return { key: name, label: name }; }).forEach(function (opt) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip' + (activeFilters.source === opt.key ? ' selected' : '');
    chip.textContent = opt.label;
    chip.onclick = function () {
      activeFilters.source = activeFilters.source === opt.key ? '' : opt.key;
      renderSourceChips();
      renderTimeline();
      updateFilterBtnState();
    };
    wrap.appendChild(chip);
  });
}

function updateFilterBtnState() {
  var isActive = activeFilters.from || activeFilters.to || activeFilters.tags.length > 0 || activeFilters.source;
  document.getElementById('filter-toggle').classList.toggle('active-filter', !!isActive);
}

function matchesFilter(entry) {
  if (activeFilters.from && entry.date < activeFilters.from) return false;
  if (activeFilters.to && entry.date > activeFilters.to) return false;
  if (activeFilters.source && entry.source !== activeFilters.source) return false;
  if (activeFilters.tags.length > 0) {
    var hasAll = activeFilters.tags.every(function (t) { return (entry.tags || []).indexOf(t) > -1; });
    if (!hasAll) return false;
  }
  if (activeFilters.search) {
    var q = activeFilters.search.toLowerCase();
    var inText = (entry.text || '').toLowerCase().indexOf(q) > -1;
    var inTags = (entry.tags || []).some(function (t) { return t.toLowerCase().indexOf(q) > -1; });
    if (!inText && !inTags) return false;
  }
  return true;
}

function isAnyFilterActive() {
  return !!(activeFilters.from || activeFilters.to || activeFilters.tags.length > 0 || activeFilters.source || activeFilters.search);
}

function updateEntryCount(filteredCount) {
  var el = document.getElementById('entry-count');
  if (!el) return;
  var total = entries.length;
  if (isAnyFilterActive()) {
    el.textContent = '筛选出 ' + filteredCount + ' / ' + total + ' 条';
  } else {
    el.textContent = '共 ' + total + ' 条记录';
  }
}

var TIMELINE_BATCH_SIZE = 30;
var timelineView = { key: null, filtered: [], shown: 0 };
var searchRenderTimer;
function timelineOrder(a,b) {
  var byDate = String(b.date).localeCompare(String(a.date));
  return byDate || (b.createdAt || 0) - (a.createdAt || 0) || String(a.id).localeCompare(String(b.id));
}
function updateTimelinePagination() {
  var total=timelineView.filtered.length,shown=timelineView.shown;
  document.getElementById('timeline-pagination').hidden=total===0;
  document.getElementById('timeline-progress').textContent=shown>=total?'已显示全部 '+total+' 条':'已显示 '+shown+' / '+total+' 条';
  var more=document.getElementById('load-more-entries');more.hidden=shown>=total;more.disabled=shown>=total;
  more.textContent='再显示'+Math.min(TIMELINE_BATCH_SIZE,total-shown)+'条';
}
function renderTimeline(options) {
  clearTimeout(searchRenderTimer);
  var container=document.getElementById('timeline'),key=JSON.stringify(activeFilters);
  var limit=timelineView.key===key?Math.max(TIMELINE_BATCH_SIZE,timelineView.shown):TIMELINE_BATCH_SIZE;
  timelineView.key=key;
  timelineView.filtered=entries.filter(matchesFilter).sort(timelineOrder);
  if(options && options.focusId) {
    var index=timelineView.filtered.findIndex(function(entry){return entry.id===options.focusId;});
    if(index>=0)limit=Math.max(limit,Math.ceil((index+1)/TIMELINE_BATCH_SIZE)*TIMELINE_BATCH_SIZE);
  }
  container.replaceChildren();
  timelineView.shown=Math.min(limit,timelineView.filtered.length);
  updateEntryCount(timelineView.filtered.length);
  if(!timelineView.shown)container.innerHTML='<div class="empty-state">还没有符合条件的记录<br>点右下角 + 开始记录吧</div>';
  else appendTimelineBatch(timelineView.filtered.slice(0,timelineView.shown));
  updateTimelinePagination();
}
function appendTimelineBatch(batch) {
  var container=document.getElementById('timeline');
  var byDate = Object.create(null);
  batch.forEach(function (e) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  });
  var dates = Object.keys(byDate).sort().reverse();
  var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  dates.forEach(function (date) {
    var lastGroup = container.lastElementChild;
    var group = lastGroup && lastGroup.dataset.timelineDate === date ? lastGroup : document.createElement('div');
    group.className = 'date-group';
    group.dataset.timelineDate = date;
    var d = new Date(date + 'T00:00:00');
    byDate[date].sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    byDate[date].forEach(function (entry, idx) {
      var row = document.createElement('div');
      row.className = 'entry-row';
      row.setAttribute('data-entry-id', entry.id);

      var dateCol = document.createElement('div');
      dateCol.className = 'entry-date-col';
      if (idx === 0 && group.children.length === 0) {
        dateCol.innerHTML =
          '<div class="entry-date-day">' + d.getDate() + '</div>' +
          '<div class="entry-date-month">' + (d.getMonth() + 1) + '月</div>' +
          '<div class="entry-date-weekday">' + weekdays[d.getDay()] + '</div>';
      } else {
        dateCol.style.background = 'transparent';
      }
      row.appendChild(dateCol);

      var card = document.createElement('div');
      card.className = 'entry-card';
      var top = document.createElement('div');
      top.className = 'entry-top';
      var srcTag = document.createElement('span');
      srcTag.style.fontSize = '10px';
      srcTag.style.color = '#767570';
      srcTag.textContent = sourceName(entry.source);
      srcTag.title = sourceName(entry.source);
      top.appendChild(srcTag);
      var actions = document.createElement('div');
      actions.className = 'entry-actions';
      actions.style.display = 'flex';
      actions.style.gap = '2px';
      var editBtn = document.createElement('button');
      editBtn.className = 'entry-delete';
      editBtn.appendChild(actionIcon('edit'));
      editBtn.setAttribute('aria-label', '编辑日记');
      editBtn.disabled = !!entry.readOnly;
      editBtn.title = entry.readOnly ? '复杂格式请在Notion编辑' : '编辑';
      editBtn.onclick = function () { openSheet(entry); };
      if (/^https:\/\/(www\.)?notion\.so\//.test(entry.notionUrl || '')) {
        var notionLink = document.createElement('a');
        notionLink.textContent = entry.readOnly ? 'Notion（只读预览）' : 'Notion';
        notionLink.href = entry.notionUrl;
        notionLink.target = '_blank';
        notionLink.rel = 'noopener noreferrer';
        actions.appendChild(notionLink);
      }
      if (window.MediaAssets) MediaAssets.decorate(actions, entry);
      actions.appendChild(editBtn);
      var del = document.createElement('button');
      del.className = 'entry-delete';
      del.appendChild(actionIcon('delete'));
      del.disabled = !!entry.readOnly;
      del.setAttribute('aria-label', '删除日记');
      del.onclick = async function () {
        if(!confirm('删除这条记录？会移入回收站，7天内可恢复。'))return;
        try{await DiaryStore.remove(entry.id,entry);await refreshDiaryData();}catch(error){showToast(error.message);}
      };
      actions.appendChild(del);
      top.appendChild(actions);
      card.appendChild(top);

      var content = document.createElement('div');
      content.className = 'entry-content';
      (entry.tags || []).forEach(function (tag) {
        var tagSpan = document.createElement('span');
        tagSpan.className = 'entry-tag';
        tagSpan.textContent = tag;
        content.appendChild(tagSpan);
      });
      var textSpan = document.createElement('span');
      textSpan.className = 'entry-text-inline';
      textSpan.textContent = entry.text;
      content.appendChild(textSpan);
      card.appendChild(content);

      row.appendChild(card);
      group.appendChild(row);
    });
    container.appendChild(group);
  });
}
document.getElementById('load-more-entries').onclick=function(){
  var start=timelineView.shown,end=Math.min(start+TIMELINE_BATCH_SIZE,timelineView.filtered.length);
  appendTimelineBatch(timelineView.filtered.slice(start,end));
  timelineView.shown=end;updateTimelinePagination();
};

document.getElementById('search-input').oninput = function (e) {
  activeFilters.search = e.target.value.trim();
  clearTimeout(searchRenderTimer);
  document.getElementById('load-more-entries').disabled = true;
  searchRenderTimer = setTimeout(renderTimeline,180);
};

function toggleFilters(open){
  var panel=document.getElementById('filter-panel'),button=document.getElementById('filter-toggle');
  panel.style.setProperty('--filter-top',(document.querySelector('.toolbar').getBoundingClientRect().bottom+6)+'px');
  panel.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open));
}
document.getElementById('filter-toggle').onclick=function(){toggleFilters(!document.getElementById('filter-panel').classList.contains('open'));};
document.getElementById('close-filters').onclick=function(){toggleFilters(false);document.getElementById('filter-toggle').focus();};
window.addEventListener('resize',function(){if(document.getElementById('filter-panel').classList.contains('open'))toggleFilters(true);});
document.addEventListener('keydown',function(e){if(e.key==='Escape')toggleFilters(false);});
document.addEventListener('pointerdown',function(e){if(!e.target.closest('#filter-panel,#filter-toggle'))toggleFilters(false);});
document.getElementById('filter-date-from').onchange = function (e) {
  activeFilters.from = e.target.value;
  renderTimeline();
  updateFilterBtnState();
};
document.getElementById('filter-date-to').onchange = function (e) {
  activeFilters.to = e.target.value;
  renderTimeline();
  updateFilterBtnState();
};
document.getElementById('filter-clear').onclick = function () {
  activeFilters = { from: '', to: '', tags: [], search: '', source: '' };
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('search-input').value = '';
  renderTagChips();
  renderSourceChips();
  renderTimeline();
  updateFilterBtnState();
};

var DEFAULT_TAGS = ['日常', '游戏', '诗词', '灵感', '资讯', '动漫', '嗑CP'];
var TAGS_KEY = 'penang_timeline_tags';
var PRESET_TAGS=DiaryStore.config(TAGS_KEY,DEFAULT_TAGS.slice());
if(!Array.isArray(PRESET_TAGS))PRESET_TAGS=DEFAULT_TAGS.slice();
async function savePresetTags(){
  try{await DiaryStore.setConfig(TAGS_KEY,PRESET_TAGS);return true;}
  catch(error){PRESET_TAGS=DiaryStore.config(TAGS_KEY,DEFAULT_TAGS.slice());showToast('标签未保存：'+error.message);return false;}
}
var sheetExtraTags=[];
var sheetSelectedTags = [];

function renderSheetTagChips() {
  var wrap = document.getElementById('sheet-tag-chips');
  wrap.innerHTML = '';
  Array.from(new Set(PRESET_TAGS.concat(sheetExtraTags,sheetSelectedTags))).forEach(function (tag) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tag-chip' + (sheetSelectedTags.indexOf(tag) > -1 ? ' selected' : '');
    chip.textContent = tag;
    chip.onclick = function () {
      var idx = sheetSelectedTags.indexOf(tag);
      if (idx > -1) sheetSelectedTags.splice(idx, 1);
      else sheetSelectedTags.push(tag);
      renderSheetTagChips();
    };
    wrap.appendChild(chip);
  });
}

var sheetPhotos = [];
var mediaBusy = false;
var editingId = null;
var editingBase=null;
var sheetInitialSnapshot = '';
var DRAFT_KEY = 'penang_timeline_draft';
function sheetSnapshot() {
  return JSON.stringify({ id: editingId, date: document.getElementById('entry-date').value, text: document.getElementById('entry-text').value, tags: sheetSelectedTags.slice(), source: document.getElementById('entry-source').value, photos: sheetPhotos, linksText: document.getElementById('entry-links').value });
}
function hasDiaryDraft() { return document.getElementById('sheet').classList.contains('open') && sheetSnapshot() !== sheetInitialSnapshot; }

function openSheet(editEntry) {
  if (mediaBusy) { showToast('图片处理中，请稍候'); return; }
  if (!editEntry && window.AuthorSettings && !AuthorSettings.defaultName()) { AuthorSettings.begin(); return; }
  editingId = editEntry ? editEntry.id : null;
  editingBase=editEntry&&editEntry.id?structuredClone(editEntry):undefined;
  sheetExtraTags=editEntry?(editEntry.tags||[]).slice():[];
  sheetPhotos = editEntry ? (editEntry.photos || []).map(function (p) { return {...p}; }) : [];
  document.getElementById('entry-links').value = editEntry ? (editEntry.links || []).join('\n') : '';
  if (window.MediaAssets) MediaAssets.renderSheet();
  document.getElementById('sheet-title').textContent = editEntry ? '编辑记录' : '新增记录';
  document.getElementById('entry-date').value = editEntry ? editEntry.date : todayStr();
  document.getElementById('entry-text').value = editEntry ? editEntry.text : '';
  sheetSelectedTags = editEntry ? (editEntry.tags || []).slice() : [];
  renderSheetTagChips();
  var sourceSelect = document.getElementById('entry-source');
  sourceSelect.replaceChildren();
  var authorOptions = window.AuthorSettings ? AuthorSettings.options(editEntry && editEntry.source) : sourceNames();
  authorOptions.forEach(function (name) { var option = document.createElement('option'); option.value = name; option.textContent = name; sourceSelect.appendChild(option); });
  sourceSelect.value = editEntry ? sourceName(editEntry.source) : (window.AuthorSettings ? AuthorSettings.defaultName() : sourceNames()[0] || '');
  sheetInitialSnapshot = sheetSnapshot();
  document.getElementById('sheet-backdrop').classList.add('open');
  document.getElementById('sheet').classList.add('open');
}
function closeSheet() {
  if (mediaBusy) { showToast('图片处理中，请稍候'); return; }
  try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
  if(window.DiaryDrafts)DiaryDrafts.clear().catch(function(){});
  document.getElementById('sheet-backdrop').classList.remove('open');
  document.getElementById('sheet').classList.remove('open');
}
document.getElementById('add-fab').onclick = function () { openSheet(); };
document.getElementById('sheet-cancel').onclick = closeSheet;
document.getElementById('sheet-backdrop').onclick = closeSheet;

document.getElementById('sheet-save').onclick = async function () {
  if (mediaBusy) { showToast('图片处理中，请稍候'); return; }
  var links;
  try { links = window.MediaAssets ? MediaAssets.links() : []; } catch (error) { showToast(error.message); return; }
  var date = document.getElementById('entry-date').value || todayStr();
  var text = document.getElementById('entry-text').value.trim();
  if (!text && !sheetPhotos.length && !links.length) { showToast('记点什么或添加附件再保存吧'); return; }
  var tags = sheetSelectedTags.slice();
  var selectedSource = document.getElementById('entry-source').value;
  if (!selectedSource) { showToast('请先填写记录人的名字'); return; }
  var savedEntryId = editingId || uid();
  var savedEntry={...(editingBase||{}),id:savedEntryId,date:date,text:text,tags:tags,source:selectedSource,photos:sheetPhotos.map(function(p){return {...p};}),links:links,createdAt:editingBase?.createdAt||Date.now()};
  var conflict=false;
  document.getElementById('sheet-save').disabled=true;
  try{var result=await DiaryStore.upsert(savedEntry,editingBase);savedEntryId=result.id;conflict=result.conflict;await refreshDiaryData(false);}
  catch(error){showToast('未能保存，草稿保留：'+error.message);return;}
  finally{document.getElementById('sheet-save').disabled=false;}
  closeSheet();
  renderTagChips();
  renderTimeline({focusId:savedEntryId});
  showToast(conflict?'其他窗口已修改原记录，当前内容已另存冲突副本':editingId?'已更新':'已保存');
  editingId = null;
  if (!entries.filter(matchesFilter).some(function (entry) { return entry.id === savedEntryId; })) {
    document.getElementById('filter-clear').onclick();
    renderTimeline({focusId:savedEntryId});
    showToast('已保存；已清除筛选以显示该记录');
  }
  if (savedEntryId) {
    requestAnimationFrame(function () {
      var el = Array.from(document.querySelectorAll('[data-entry-id]')).find(function (row) { return row.dataset.entryId === savedEntryId; });
      if (el) {
        el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        el.classList.add('saved-highlight');
      }
    });
  }
};

function loadSettings(){return DiaryStore.config(SETTINGS_KEY,{});}
var appSettings=loadSettings();
document.getElementById('sync-url').value = appSettings.syncUrl || '';
document.getElementById('bg-url').value = appSettings.bgUrl || '';
document.getElementById('bg-scrim-input').value = appSettings.scrim === undefined ? 72 : appSettings.scrim;
document.getElementById('card-opacity-input').value = appSettings.cardOpacity === undefined ? 62 : appSettings.cardOpacity;
if (!appSettings.localBackground) applyBackground(appSettings.bgUrl);
applyScrim(appSettings.scrim);
applyCardOpacity(appSettings.cardOpacity);

function applyBackground(url) {
  var layer = document.getElementById('bg-layer');
  layer.style.backgroundImage = url ? 'url(' + url + ')' : 'none';
}
function applyScrim(val) {
  var pct = (val === undefined || val === null || val === '') ? 72 : Math.max(0, Math.min(100, parseInt(val, 10)));
  document.getElementById('bg-scrim').style.background = 'rgba(244,241,234,' + (pct / 100) + ')';
}
function applyCardOpacity(val) {
  var pct = (val === undefined || val === null || val === '') ? 62 : Math.max(0, Math.min(100, parseInt(val, 10)));
  document.documentElement.style.setProperty('--card-opacity', pct / 100);
}

document.getElementById('tags-toggle').onclick = function () {
  document.getElementById('tags-panel').classList.toggle('open');
};

function renderManageTagChips() {
  var wrap = document.getElementById('manage-tag-chips');
  wrap.innerHTML = '';
  if (PRESET_TAGS.length === 0) {
    wrap.innerHTML = '<span style="font-size:12px;color:#C7C6BE;">还没有标签，先加一个吧</span>';
    return;
  }
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '6px';
  PRESET_TAGS.forEach(function (tag, idx) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;background:#FCFCFB;border:0.5px solid #E1E0D9;border-radius:10px;padding:6px 8px;';
    var label = document.createElement('span');
    label.textContent = tag;
    label.style.cssText = 'flex:1;font-size:13px;color:#52514E;';
    row.appendChild(label);

    var upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.textContent = '↑';
    upBtn.disabled = idx === 0;
    upBtn.style.cssText = 'background:transparent;border:none;font-size:14px;color:' + (idx === 0 ? '#E1E0D9' : '#767570') + ';padding:2px 6px;';
    upBtn.onclick = async function () {
      if (idx === 0) return;
      var tmp = PRESET_TAGS[idx - 1];
      PRESET_TAGS[idx - 1] = PRESET_TAGS[idx];
      PRESET_TAGS[idx] = tmp;
      if(!await savePresetTags())return;
      renderManageTagChips();
    };
    row.appendChild(upBtn);

    var downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.textContent = '↓';
    downBtn.disabled = idx === PRESET_TAGS.length - 1;
    downBtn.style.cssText = 'background:transparent;border:none;font-size:14px;color:' + (idx === PRESET_TAGS.length - 1 ? '#E1E0D9' : '#767570') + ';padding:2px 6px;';
    downBtn.onclick = async function () {
      if (idx === PRESET_TAGS.length - 1) return;
      var tmp = PRESET_TAGS[idx + 1];
      PRESET_TAGS[idx + 1] = PRESET_TAGS[idx];
      PRESET_TAGS[idx] = tmp;
      if(!await savePresetTags())return;
      renderManageTagChips();
    };
    row.appendChild(downBtn);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '✕';
    removeBtn.style.cssText = 'background:transparent;border:none;font-size:13px;color:#C7C6BE;padding:2px 6px;';
    removeBtn.onclick = async function () {
      if (!confirm('删除标签"' + tag + '"？已记录的内容不会受影响。')) return;
      PRESET_TAGS = PRESET_TAGS.filter(function (t) { return t !== tag; });
      if(!await savePresetTags())return;
      renderManageTagChips();
    };
    row.appendChild(removeBtn);

    wrap.appendChild(row);
  });
}

document.getElementById('add-tag-btn').onclick = async function () {
  var input = document.getElementById('new-tag-input');
  var val = input.value.trim();
  if (!val) return;
  if (PRESET_TAGS.indexOf(val) > -1) { showToast('这个标签已经存在了'); return; }
  PRESET_TAGS.push(val);
  if(!await savePresetTags())return;
  input.value = '';
  renderManageTagChips();
  showToast('标签已添加');
};

renderManageTagChips();

document.getElementById('trash-toggle').onclick = function () {
  document.getElementById('trash-panel').classList.toggle('open');
  renderTrashList();
};

async function renderTrashList() {
  try{await DiaryStore.purgeExpired();await refreshDiaryData(false);}catch(error){showToast(error.message);}
  var wrap = document.getElementById('trash-list');
  wrap.innerHTML = '';
  if (trash.length === 0) {
    wrap.innerHTML = '<p style="font-size:12px;color:#C7C6BE;margin:0;">回收站是空的</p>';
    return;
  }
  trash.slice().sort(function (a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); }).forEach(function (item) {
    var row = document.createElement('div');
    row.className = 'trash-item';
    var text = document.createElement('div');
    text.className = 'trash-item-text';
    text.textContent = item.date + ' · ' + item.text;
    row.appendChild(text);
    var actions = document.createElement('div');
    actions.className = 'trash-item-actions';
    var restoreBtn = document.createElement('button');
    restoreBtn.textContent = '恢复';
    restoreBtn.onclick=async function(){try{await DiaryStore.restore(item.id);await refreshDiaryData();await renderTrashList();showToast('已恢复');}catch(error){showToast('恢复未完成，原记录保留：'+error.message);}};
    actions.appendChild(restoreBtn);
    var purgeBtn = document.createElement('button');
    purgeBtn.textContent = '彻底删除';
    purgeBtn.onclick=async function(){if(!confirm('彻底删除后无法找回，确定吗？'))return;try{await DiaryStore.purge(item.id);await renderTrashList();}catch(error){showToast(error.message);}};
    actions.appendChild(purgeBtn);
    row.appendChild(actions);
    wrap.appendChild(row);
  });
}

document.getElementById('settings-toggle').onclick = function () {
  document.getElementById('settings-panel').classList.toggle('open');
};
document.getElementById('settings-save-btn').onclick=async function(){
  var next={...appSettings,localBackground:appSettings.localBackground===true,syncUrl:document.getElementById('sync-url').value.trim(),bgUrl:document.getElementById('bg-url').value.trim(),scrim:document.getElementById('bg-scrim-input').value.trim(),cardOpacity:document.getElementById('card-opacity-input').value.trim()};
  try{
    if(next.syncUrl){var target=new URL(next.syncUrl);if(target.protocol!=='https:'||target.pathname!=='/'||target.username||target.password||target.search||target.hash)throw new Error('请使用HTTPS服务根地址');next.syncUrl=target.origin;}
    if(appSettings.syncUrl&&!next.syncUrl&&!confirm('确定清空已保存的Worker地址？'))return;
    for(var key of ['scrim','cardOpacity']){if(next[key]!==''&&(!Number.isFinite(Number(next[key]))||Number(next[key])<0||Number(next[key])>100))throw new Error('透明度请填写0至100的数字');}
    await DiaryStore.setConfig(SETTINGS_KEY,next);
    var secret=document.getElementById('sync-secret').value;
    if(document.getElementById('remember-secret').checked)await DiaryStore.secret(secret);else await DiaryStore.secret('');
    try{sessionStorage.setItem('diary_sync_secret',secret);}catch(_){}
    appSettings=next;document.getElementById('sync-url').value=next.syncUrl;
    applyBackground(next.bgUrl);applyScrim(next.scrim);applyCardOpacity(next.cardOpacity);showToast('设置已保存，应用更新会保留');if(window.refreshSyncStatus)await refreshSyncStatus();
  }catch(error){showToast('设置未保存：'+error.message);}
};
document.getElementById('forget-secret').onclick=async function(){try{await DiaryStore.secret('');try{sessionStorage.removeItem('diary_sync_secret');}catch(_){}document.getElementById('sync-secret').value='';document.getElementById('remember-secret').checked=false;showToast('已忘记此设备保存的口令');}catch(error){showToast(error.message);}};

var settingsReturnFocus;
function toggleSettings(open) {
  var drawer = document.getElementById('settings-drawer');
  if (open) settingsReturnFocus = document.activeElement;
  drawer.hidden = !open;
  document.getElementById('open-settings').setAttribute('aria-expanded', String(open));
  document.body.style.overflowY = open ? 'hidden' : '';
  if (open) document.getElementById('close-settings').focus();
  else if (settingsReturnFocus) settingsReturnFocus.focus();
}
document.getElementById('open-settings').onclick = function () { toggleSettings(true); };
document.getElementById('close-settings').onclick = function () { toggleSettings(false); };
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && !document.getElementById('settings-drawer').hidden) toggleSettings(false);
});

renderTagChips();
renderSourceChips();
renderTimeline();
updateFilterBtnState();

var topFab = document.getElementById('top-fab');
window.addEventListener('scroll', function () {
  topFab.classList.toggle('show', window.scrollY > 400);
});
topFab.onclick = function () {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
