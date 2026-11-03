// diary-release: 2026.11.03.17
var STORAGE_KEY = 'penang_timeline_diary';
var TRASH_KEY = 'penang_timeline_trash';
var trash=structuredClone(DiaryStore.snapshot.trash);
var SETTINGS_KEY='penang_timeline_settings';
var DEFAULT_BACKGROUND_URL=new URL('assets/IMG_0586.jpg',document.baseURI).href;
var INK_BACKGROUND_URL=new URL('assets/ink-bg.jpg',document.baseURI).href;
// Each theme has its own built-in background; a photo the user picks applies to both.
function defaultBackgroundUrl(){return document.documentElement.getAttribute('data-theme')==='ink'?INK_BACKGROUND_URL:DEFAULT_BACKGROUND_URL;}
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
  var shapes={photo:['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z','m4 17 5-5 4 4 3-3 5 5','M8.5 8h.01'],link:['M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2','M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2'],edit:['m14 5 5 5','M4 20l1-6L16 3a2.8 2.8 0 0 1 4 4L9 18l-5 2Z'],delete:['m6 6 12 12','M18 6 6 18'],card:['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z','M7 9h10M7 13h10M7 17h6']};
  (shapes[kind]||[]).forEach(function(d){var path=document.createElementNS(ns,'path');path.setAttribute('d',d);svg.appendChild(path);});return svg;
}
function sourceNames() { return window.AuthorSettings ? AuthorSettings.names() : Array.from(new Set(entries.map(function(entry){return sourceName(entry.source);}))); }
var activeFilters = { from: '', to: '', tags: [], search: '', source: '' };

// Chinese numerals for the ink theme's date column: 1-10, 十一…十九, 二十, 廿一…廿九, 三十, 三十一.
function cnNumber(n) {
  var digits = '零一二三四五六七八九';
  if (n <= 10) return n === 10 ? '十' : digits[n];
  if (n < 20) return '十' + digits[n - 10];
  return digits[Math.floor(n / 10)] + '十' + (n % 10 ? digits[n % 10] : '');
}
function cnDay(n) { return n >= 21 && n <= 29 ? '廿' + cnNumber(n % 10) : cnNumber(n); }
// action (optional): { label, onClick, duration } adds a tappable button, e.g. 撤销.
function showToast(msg, action) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('has-action', !!action);
  if (action) {
    var button = document.createElement('button');
    button.type = 'button';button.className = 'toast-action';button.textContent = action.label;
    button.onclick = function () { clearTimeout(showToast._timer);t.classList.remove('show');action.onClick(); };
    t.appendChild(button);
  }
  if (window.DiaryFeedback) DiaryFeedback.toast(msg);
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () { t.classList.remove('show'); }, action ? (action.duration || 6000) : 2000);
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
    var inLocation=((entry.location?.name||'')+' '+(entry.location?.url||'')).toLowerCase().includes(q);
    if (!inText && !inTags && !inLocation) return false;
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
  var filterChanged=timelineView.key!==null&&timelineView.key!==key;
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
  if(window.DiaryMotion)DiaryMotion.timelineChanged(container,filterChanged,options&&options.focusId);
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
          '<div class="entry-date-day" data-cn="' + cnDay(d.getDate()) + '">' + d.getDate() + '</div>' +
          '<div class="entry-date-month" data-cn="' + cnNumber(d.getMonth() + 1) + '月">' + (d.getMonth() + 1) + '月</div>' +
          '<div class="entry-date-weekday">' + weekdays[d.getDay()] + '</div>';
      } else {
        dateCol.style.background = 'transparent';
      }
      row.appendChild(dateCol);

      var card = document.createElement('div');
      card.className = 'entry-card';
      var top = document.createElement('div');
      top.className = 'entry-top';
      var heading=document.createElement('div');heading.className='entry-heading';
      var srcTag = document.createElement('span');srcTag.className='entry-author';
      srcTag.style.fontSize = '10px';
      srcTag.style.color = '#767570';
      srcTag.textContent = sourceName(entry.source);
      srcTag.title = sourceName(entry.source);
      heading.appendChild(srcTag);
      (entry.tags||[]).forEach(function(tag){var chip=document.createElement('span');chip.className='entry-tag';chip.textContent=tag;chip.title=tag;heading.appendChild(chip);});
      top.appendChild(heading);
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
        notionLink.className='entry-notion-link';heading.appendChild(notionLink);
      }
      if (window.MediaAssets) MediaAssets.decorate(actions, entry);
      var cardBtn=document.createElement('button');cardBtn.className='entry-delete';cardBtn.appendChild(actionIcon('card'));cardBtn.setAttribute('aria-label','生成日记卡片');cardBtn.title=entry.text?.trim()?'生成文字卡片':'没有文字，暂时无法生成卡片';cardBtn.disabled=!entry.text?.trim();cardBtn.onclick=function(){if(window.DiaryCards)DiaryCards.open(entry,cardBtn);};actions.appendChild(cardBtn);
      actions.appendChild(editBtn);
      var del = document.createElement('button');
      del.className = 'entry-delete';
      del.appendChild(actionIcon('delete'));
      del.disabled = !!entry.readOnly;
      del.setAttribute('aria-label', '删除日记');
      del.onclick = async function () {
        // No confirm dialog: deleting only moves the diary to the 7-day trash, and the toast offers 撤销.
        try{await DiaryStore.remove(entry.id,entry);await refreshDiaryData();}catch(error){showToast(error.message);return;}
        showToast('已删除，7 天内可在回收站找回',{label:'撤销',duration:6000,onClick:async function(){
          try{await DiaryStore.restore(entry.id);await refreshDiaryData();showToast('已恢复');}catch(error){showToast('恢复未完成：'+error.message);}
        }});
      };
      actions.appendChild(del);
      top.appendChild(actions);
      card.appendChild(top);

      var content = document.createElement('div');
      content.className = 'entry-content';
      var textSpan = document.createElement('span');
      textSpan.className = 'entry-text-inline';
      // One block per line the writer typed, so soft-wrapped lines can sit tighter than Enter breaks.
      String(entry.text).split('\n').forEach(function (line, index) {
        if (index) textSpan.appendChild(document.createTextNode('\n'));
        var para = document.createElement('span');para.className = 'entry-line';if (line) para.textContent = line;else para.appendChild(document.createElement('br'));textSpan.appendChild(para);
      });
      content.appendChild(textSpan);
      card.appendChild(content);

      if(entry.location&&(entry.location.name||entry.location.url)){
        var place=document.createElement(entry.location.url?'a':'div');place.className='entry-location';
        if(entry.location.url){place.href=entry.location.url;place.target='_blank';place.rel='noopener noreferrer';}
        var pin=document.createElementNS('http://www.w3.org/2000/svg','svg');pin.setAttribute('viewBox','0 0 24 24');pin.setAttribute('aria-hidden','true');
        var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z');pin.appendChild(path);
        place.append(pin,document.createTextNode(entry.location.name||new URL(entry.location.url).hostname));card.appendChild(place);
      }
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
  if(window.DiaryMotion)DiaryMotion.timelineChanged(document.getElementById('timeline'),false);
};

function syncSearchClear() { document.getElementById('search-clear').hidden = !document.getElementById('search-input').value; }
// One tap clears the whole search; the keyboard stays up so a new search can start right away.
document.getElementById('search-clear').addEventListener('pointerdown', function (e) { e.preventDefault(); });
document.getElementById('search-clear').onclick = function () {
  var input = document.getElementById('search-input');
  input.value = '';input.dispatchEvent(new Event('input'));input.focus();
};
document.getElementById('search-input').oninput = function (e) {
  syncSearchClear();
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
  document.getElementById('search-input').value = '';syncSearchClear();
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

function mapSearchUrl(query){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);}
var locationRequest=0;
function resetLocationRequest(){locationRequest++;document.getElementById('location-current').disabled=false;document.getElementById('location-current').textContent='使用当前位置';document.getElementById('location-status').textContent='可选择地图位置，或使用手机当前位置。';}
document.getElementById('location-current').onclick=function(){
 var status=document.getElementById('location-status');if(!navigator.geolocation){status.textContent='当前浏览器不支持定位，可填写地点名称搜索。';return;}
 var token=++locationRequest,button=this;button.disabled=true;button.textContent='定位中…';status.textContent='正在请求当前位置，请允许手机定位权限。';
 function active(){return token===locationRequest&&document.getElementById('sheet').classList.contains('open');}
 function finish(message){if(!active())return;button.disabled=false;button.textContent='使用当前位置';status.textContent=message;}
 navigator.geolocation.getCurrentPosition(function(position){
  if(!active())return;var lat=position.coords.latitude,lng=position.coords.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){finish('未取得有效位置，请重试或填写地点名称。');return;}
  if(!document.getElementById('entry-location-name').value.trim())document.getElementById('entry-location-name').value='当前位置';
  document.getElementById('entry-location-url').value=mapSearchUrl(lat.toFixed(6)+','+lng.toFixed(6));document.getElementById('entry-location-url').dispatchEvent(new Event('input',{bubbles:true}));
  finish('已记录当前位置。可以把名称改成店名或你喜欢的称呼。');
 },function(error){finish(error.code===1?'未获得定位权限，可在手机设置中允许，或填写地点名称搜索。':error.code===3?'定位超时，请重试或填写地点名称。':'暂时无法取得位置，请重试或填写地点名称。');},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
};
document.getElementById('entry-location-url').addEventListener('input',function(e){if(e.isTrusted&&document.getElementById('location-current').disabled)resetLocationRequest();});
var sheetPhotos = [];
var mediaBusy = false;
var editingId = null;
var editingBase=null;
var sheetInitialSnapshot = '';
var DRAFT_KEY = 'penang_timeline_draft';
function sheetSnapshot() {
  return JSON.stringify({ id: editingId, date: document.getElementById('entry-date').value, text: document.getElementById('entry-text').value, tags: sheetSelectedTags.slice(), source: document.getElementById('entry-source').value, photos: sheetPhotos, location:{name:document.getElementById('entry-location-name').value,url:document.getElementById('entry-location-url').value}, linksText: document.getElementById('entry-links').value });
}
function hasDiaryDraft() { return document.getElementById('sheet').classList.contains('open') && sheetSnapshot() !== sheetInitialSnapshot; }

function openSheet(editEntry) {
  if (mediaBusy) { showToast('图片处理中，请稍候'); return; }
  if(window.DiaryMapPicker?.isOpen())DiaryMapPicker.close();
  resetLocationRequest();
  if (!editEntry && window.AuthorSettings && !AuthorSettings.defaultName()) { AuthorSettings.begin(); return; }
  editingId = editEntry ? editEntry.id : null;
  editingBase=editEntry&&editEntry.id?structuredClone(editEntry):undefined;
  sheetExtraTags=editEntry?(editEntry.tags||[]).slice():[];
  document.getElementById('entry-location-name').value=editEntry?.location?.name||'';
  document.getElementById('entry-location-url').value=editEntry?.location?.url||'';
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
  var sheetEl=document.getElementById('sheet');
  // The sheet scrolls itself; always start at the top so the date is visible.
  sheetEl.scrollTop=0;
  document.getElementById('sheet-backdrop').classList.add('open');
  sheetEl.classList.add('open');
  sheetEl.scrollTop=0;requestAnimationFrame(function(){sheetEl.scrollTop=0;});
  if(editEntry&&editEntry.id){var source=document.querySelector('[data-entry-id="'+String(editEntry.id).replace(/["\\]/g,'')+'"]');if(source){source.classList.remove('edit-source');void source.offsetWidth;source.classList.add('edit-source');setTimeout(function(){source.classList.remove('edit-source');},700);}}
}
function closeSheet() {
  if(window.DiaryMapPicker?.isOpen())DiaryMapPicker.close();
  resetLocationRequest();
  if (mediaBusy) { showToast('图片处理中，请稍候'); return; }
  try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
  if(window.DiaryDrafts)DiaryDrafts.clear().catch(function(){});
  if(window.MediaAssets)MediaAssets.releaseSheet();
  if(document.getElementById('sheet').contains(document.activeElement))document.activeElement.blur();
  document.getElementById('sheet-backdrop').classList.remove('open');
  document.getElementById('sheet').classList.remove('open');
}
document.getElementById('add-fab').onclick = function () { openSheet(); };
document.getElementById('sheet-cancel').onclick = closeSheet;
document.getElementById('sheet-backdrop').onclick = closeSheet;

document.getElementById('sheet-save').onclick = async function () {
  if (mediaBusy) { showToast('图片处理中，请稍候'); return; }
  var links,location;
  try { location=DiaryStore.locationValue({name:document.getElementById('entry-location-name').value,url:document.getElementById('entry-location-url').value});links = window.MediaAssets ? MediaAssets.links() : []; } catch (error) { showToast(error.message); return; }
  var date = document.getElementById('entry-date').value || todayStr();
  var text = document.getElementById('entry-text').value.trim();
  if (!text && !sheetPhotos.length && !links.length && !location) { showToast('记点什么或添加附件再保存吧'); return; }
  var tags = sheetSelectedTags.slice();
  var selectedSource = document.getElementById('entry-source').value;
  if (!selectedSource) { showToast('请先填写记录人的名字'); return; }
  var savedEntryId = editingId || uid();
  var savedEntry={...(editingBase||{}),id:savedEntryId,date:date,text:text,tags:tags,source:selectedSource,photos:sheetPhotos.map(function(p){return {...p};}),links:links,location:location,createdAt:editingBase?.createdAt||Date.now()};
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
  if (savedEntryId && window.DiaryMotion) DiaryMotion.focusSaved(savedEntryId);
};

function loadSettings(){return DiaryStore.config(SETTINGS_KEY,{});}
var appSettings=loadSettings();
document.getElementById('sync-url').value = appSettings.syncUrl || '';
document.getElementById('bg-scrim-input').value = appSettings.scrim === undefined ? 72 : appSettings.scrim;
document.getElementById('card-opacity-input').value = appSettings.cardOpacity === undefined ? 62 : appSettings.cardOpacity;
// Sliders preview instantly; only「保存外观」keeps the values, and closing settings restores the saved ones.
function bindSlider(id, valueId, apply) {
  var input = document.getElementById(id), output = document.getElementById(valueId);
  function show() { output.textContent = input.value; }
  input.addEventListener('input', function () { show(); apply(input.value); });
  show();
}
bindSlider('bg-scrim-input', 'bg-scrim-value', function (v) { applyScrim(v); });
bindSlider('card-opacity-input', 'card-opacity-value', function (v) { applyCardOpacity(v); });
function restoreAppearancePreview() {
  var scrim = document.getElementById('bg-scrim-input'), card = document.getElementById('card-opacity-input');
  scrim.value = appSettings.scrim === undefined || appSettings.scrim === '' ? 72 : appSettings.scrim;
  card.value = appSettings.cardOpacity === undefined || appSettings.cardOpacity === '' ? 62 : appSettings.cardOpacity;
  document.getElementById('bg-scrim-value').textContent = scrim.value;
  document.getElementById('card-opacity-value').textContent = card.value;
  applyScrim(scrim.value);applyCardOpacity(card.value);
}
if (!appSettings.localBackground) applyBackground(appSettings.bgUrl);
applyScrim(appSettings.scrim);
applyCardOpacity(appSettings.cardOpacity);

function applyBackground(url) {
  var layer = document.getElementById('bg-layer');
  layer.style.backgroundImage = 'url(' + JSON.stringify(url || defaultBackgroundUrl()) + ')';
  if (url) layer.setAttribute('data-custom', ''); else layer.removeAttribute('data-custom');
}
function applyScrim(val) {
  var pct = (val === undefined || val === null || val === '') ? 72 : Math.max(0, Math.min(100, parseInt(val, 10)));
  document.getElementById('bg-scrim').style.background = 'rgba(244,241,234,' + (pct / 100) + ')';
  document.documentElement.style.setProperty('--scrim-alpha', String(pct / 100));
}
function applyCardOpacity(val) {
  var pct = (val === undefined || val === null || val === '') ? 62 : Math.max(0, Math.min(100, parseInt(val, 10)));
  document.documentElement.style.setProperty('--card-opacity', pct / 100);
}

document.getElementById('tags-toggle').onclick = function () {
  toggleSettingsGroup('tags');
};

var selectedManageTag = null, lastAddedTag = null;
function tagUsage(tag) { return entries.filter(function (e) { return (e.tags || []).indexOf(tag) > -1; }).length; }
// Tags are chips; tapping one selects it and reveals large move / delete buttons below.
function renderManageTagChips() {
  var wrap = document.getElementById('manage-tag-chips'), bar = document.getElementById('tag-actions');
  wrap.replaceChildren();
  if (selectedManageTag && PRESET_TAGS.indexOf(selectedManageTag) < 0) selectedManageTag = null;
  document.getElementById('tag-summary').textContent = PRESET_TAGS.length ? '共 ' + PRESET_TAGS.length + ' 个标签 · 按住标签拖动可排序，点一下可选中' : '';
  if (PRESET_TAGS.length === 0) {
    var empty = document.createElement('p');empty.className = 'tag-empty';empty.textContent = '还没有标签，先在下面添加一个吧';wrap.appendChild(empty);
    bar.hidden = true;return;
  }
  PRESET_TAGS.forEach(function (tag) {
    var chip = document.createElement('button');
    chip.type = 'button';chip.dataset.tag = tag;chip.className = 'manage-tag-chip' + (tag === selectedManageTag ? ' is-selected' : '') + (tag === lastAddedTag ? ' is-new' : '');
    chip.setAttribute('aria-pressed', String(tag === selectedManageTag));
    var name = document.createElement('span');name.textContent = tag;chip.appendChild(name);
    var count = tagUsage(tag), badge = document.createElement('small');badge.textContent = count ? String(count) : '';
    if (count) { badge.setAttribute('aria-label', count + ' 篇日记使用'); chip.appendChild(badge); }
    chip.onclick = function () { if (suppressTagClick) return;selectedManageTag = selectedManageTag === tag ? null : tag; lastAddedTag = null; renderManageTagChips(); };
    wrap.appendChild(chip);
  });
  lastAddedTag = null;
  bar.hidden = !selectedManageTag;
  if (selectedManageTag) {
    var index = PRESET_TAGS.indexOf(selectedManageTag);
    document.getElementById('tag-selected-name').textContent = '「' + selectedManageTag + '」';
    document.getElementById('tag-move-earlier').disabled = index === 0;
    document.getElementById('tag-move-later').disabled = index === PRESET_TAGS.length - 1;
  }
}
// Press and hold a tag chip, then drag it to a new place; the others slide out of the way.
var tagDrag = null, suppressTagClick = false;
(function setupTagDrag() {
  var wrap = document.getElementById('manage-tag-chips'), drawer = document.getElementById('settings-drawer');
  function chipsOf() { return Array.prototype.slice.call(wrap.querySelectorAll('.manage-tag-chip')); }
  function place() {
    var d = tagDrag, chip = d.chip;
    chip.style.transform = 'none';
    var r = chip.getBoundingClientRect();
    d.tx = d.x - d.grabX - (r.left + r.width / 2);d.ty = d.y - d.grabY - (r.top + r.height / 2);
    chip.style.transform = 'translate(' + d.tx + 'px,' + d.ty + 'px) scale(1.06)';
  }
  function reorder() {
    var d = tagDrag, chips = chipsOf().filter(function (c) { return c !== d.chip; });
    // Hit-test on layout positions (offset*), which ignore the slide animations still running on the others.
    var box = wrap.getBoundingClientRect(), px = d.x - box.left, py = d.y - box.top;
    var target = chips.filter(function (c) { return px >= c.offsetLeft && px <= c.offsetLeft + c.offsetWidth && py >= c.offsetTop && py <= c.offsetTop + c.offsetHeight; })[0];
    if (!target) return;
    var all = chipsOf(), before = {};
    all.forEach(function (c) { before[c.dataset.tag] = c.getBoundingClientRect(); });
    if (all.indexOf(d.chip) < all.indexOf(target)) target.after(d.chip);else target.before(d.chip);
    chipsOf().forEach(function (c) { // slide the others from their old spot to the new one
      if (c === d.chip) return;
      var from = before[c.dataset.tag], to = c.getBoundingClientRect();
      var dx = from.left - to.left, dy = from.top - to.top;
      if (!dx && !dy) return;
      c.style.transition = 'none';c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(function () { c.style.transition = '';c.style.transform = ''; });
    });
  }
  function frame() {
    var d = tagDrag;if (!d || !d.active) return;
    var r = drawer.getBoundingClientRect(), dy = d.y < r.top + 80 ? -10 : d.y > r.bottom - 80 ? 10 : 0;
    if (dy) { drawer.scrollTop += dy;place();reorder(); }
    requestAnimationFrame(frame);
  }
  function begin() {
    var d = tagDrag;if (!d) return;
    d.active = true;wrap.classList.add('is-sorting');d.chip.classList.add('is-dragging');
    try { d.chip.setPointerCapture(d.pointerId); } catch (_) {}
    if (window.DiaryFeedback) DiaryFeedback.tick();
    place();requestAnimationFrame(frame);
  }
  function finish(cancelled) {
    var d = tagDrag;if (!d) return;
    clearTimeout(d.timer);tagDrag = null;
    if (!d.active) return;
    suppressTagClick = true;setTimeout(function () { suppressTagClick = false; }, 60);
    wrap.classList.remove('is-sorting');d.chip.classList.remove('is-dragging');d.chip.style.transform = '';
    var names = chipsOf().map(function (c) { return c.dataset.tag; });
    if (cancelled || names.join('\n') === PRESET_TAGS.join('\n')) { renderManageTagChips();return; }
    PRESET_TAGS = names;selectedManageTag = d.chip.dataset.tag;
    savePresetTags().then(function () { renderManageTagChips(); });
  }
  // iOS would otherwise scroll the page while the chip is being dragged.
  wrap.addEventListener('touchmove', function (e) { if (tagDrag && tagDrag.active) e.preventDefault(); }, { passive: false });
  wrap.addEventListener('contextmenu', function (e) { if (tagDrag) e.preventDefault(); });
  wrap.addEventListener('pointerdown', function (e) {
    var chip = e.target.closest('.manage-tag-chip');
    if (!chip || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var r = chip.getBoundingClientRect();
    tagDrag = { chip: chip, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, grabX: e.clientX - (r.left + r.width / 2), grabY: e.clientY - (r.top + r.height / 2), active: false, tx: 0, ty: 0 };
    tagDrag.timer = setTimeout(begin, 240);
  });
  wrap.addEventListener('pointermove', function (e) {
    var d = tagDrag;if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;d.y = e.clientY;
    if (!d.active) { if (Math.hypot(d.x - d.startX, d.y - d.startY) > 8) { clearTimeout(d.timer);tagDrag = null; } return; } // moved before the hold finished: a scroll or swipe
    e.preventDefault();place();reorder();
  });
  wrap.addEventListener('pointerup', function () { finish(false); });
  wrap.addEventListener('pointercancel', function () { finish(true); });
})();
async function moveManageTag(step) {
  var index = PRESET_TAGS.indexOf(selectedManageTag), target = index + step;
  if (index < 0 || target < 0 || target >= PRESET_TAGS.length) return;
  var swap = PRESET_TAGS[target];PRESET_TAGS[target] = PRESET_TAGS[index];PRESET_TAGS[index] = swap;
  if (!await savePresetTags()) return;
  renderManageTagChips();
}
document.getElementById('tag-move-earlier').onclick = function () { moveManageTag(-1); };
document.getElementById('tag-move-later').onclick = function () { moveManageTag(1); };
document.getElementById('tag-delete').onclick = async function () {
  var tag = selectedManageTag;if (!tag) return;
  var used = tagUsage(tag), position = PRESET_TAGS.indexOf(tag);
  PRESET_TAGS = PRESET_TAGS.filter(function (t) { return t !== tag; });
  selectedManageTag = null;
  if (!await savePresetTags()) return;
  renderManageTagChips();
  showToast('已删除标签「' + tag + '」' + (used ? '（' + used + ' 篇日记用过它，内容不受影响）' : ''), { label: '撤销', duration: 6000, onClick: async function () {
    if (PRESET_TAGS.indexOf(tag) < 0) PRESET_TAGS.splice(Math.min(position, PRESET_TAGS.length), 0, tag);
    if (!await savePresetTags()) return;
    selectedManageTag = tag;renderManageTagChips();showToast('已恢复标签');
  } });
};
document.getElementById('add-tag-btn').onclick = async function () {
  var input = document.getElementById('new-tag-input');
  var val = input.value.trim();
  if (!val) return;
  if (PRESET_TAGS.indexOf(val) > -1) { showToast('这个标签已经存在了'); return; }
  PRESET_TAGS.push(val);
  if(!await savePresetTags())return;
  input.value = '';
  selectedManageTag = null;lastAddedTag = val;
  renderManageTagChips();
  showToast('标签已添加');
};
document.getElementById('new-tag-input').addEventListener('keydown', function (event) {
  if (event.key === 'Enter' && !event.isComposing) { event.preventDefault();document.getElementById('add-tag-btn').click(); }
});

renderManageTagChips();

document.getElementById('trash-toggle').onclick = function () {
  toggleSettingsGroup('trash');
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
  toggleSettingsGroup('settings');
};
function renderConnectionSummary(){
  document.getElementById('notion-connection-summary').textContent=appSettings.syncUrl?'已保存连接：'+appSettings.syncUrl:'尚未连接 Notion，日记仍保存在本机。';
}
renderConnectionSummary();
document.getElementById('appearance-save-btn').onclick=async function(){
  try{
    var next={...loadSettings(),scrim:document.getElementById('bg-scrim-input').value.trim(),cardOpacity:document.getElementById('card-opacity-input').value.trim()};
    for(var key of ['scrim','cardOpacity'])if(next[key]!==''&&(!Number.isFinite(Number(next[key]))||Number(next[key])<0||Number(next[key])>100))throw new Error('透明度请填写0至100的数字');
    await DiaryStore.setConfig(SETTINGS_KEY,next);appSettings=next;
    applyBackground(next.bgUrl);applyScrim(next.scrim);applyCardOpacity(next.cardOpacity);showToast('外观已保存');
  }catch(error){showToast('外观未保存：'+error.message);}
};
document.getElementById('settings-save-btn').onclick=async function(){
  try{
    var url=document.getElementById('sync-url').value.trim();
    if(url){var target=new URL(url);if(target.protocol!=='https:'||target.pathname!=='/'||target.username||target.password||target.search||target.hash)throw new Error('请使用HTTPS服务根地址');url=target.origin;}
    if(appSettings.syncUrl&&!url&&!confirm('确定清空已保存的Worker地址？'))return;
    var secret=document.getElementById('sync-secret').value;
    await DiaryStore.configureSync(url,secret,document.getElementById('remember-secret').checked);
    try{sessionStorage.setItem('diary_sync_secret',secret);}catch(_){}
    appSettings=loadSettings();document.getElementById('sync-url').value=appSettings.syncUrl;renderConnectionSummary();
    showToast('连接设置已保存');if(window.refreshSyncStatus)await refreshSyncStatus();
  }catch(error){showToast('连接未保存：'+error.message);}
};
function toggleSettingsGroup(id){
 var panel=document.getElementById(id+'-panel'),open=panel.classList.toggle('open');
 document.getElementById(id+'-toggle').setAttribute('aria-expanded',String(open));
}
for(var group of ['data','about']){(function(id){document.getElementById(id+'-toggle').onclick=function(){toggleSettingsGroup(id);};})(group);}
for(var group of ['authors','tags','settings','data','about','trash']){(function(id){
 var toggle=document.getElementById(id+'-toggle');toggle.setAttribute('role','button');toggle.tabIndex=0;toggle.setAttribute('aria-controls',id+'-panel');toggle.setAttribute('aria-expanded','false');
 if(id!=='authors')toggle.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle.click();}};
})(group);}
document.getElementById('forget-secret').onclick=async function(){try{await DiaryStore.secret('');try{sessionStorage.removeItem('diary_sync_secret');}catch(_){}document.getElementById('sync-secret').value='';document.getElementById('remember-secret').checked=false;showToast('已忘记此设备保存的口令');}catch(error){showToast(error.message);}};

var settingsReturnFocus;
function toggleSettings(open) {
  var drawer = document.getElementById('settings-drawer');
  if (open) settingsReturnFocus = document.activeElement;
  drawer.hidden = !open;
  document.getElementById('open-settings').setAttribute('aria-expanded', String(open));
  document.body.style.overflowY = open ? 'hidden' : '';
  if (open) document.getElementById('close-settings').focus();
  else restoreAppearancePreview();
  if (!open && settingsReturnFocus) settingsReturnFocus.focus();
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
},{passive:true});
topFab.onclick = function () {
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth' });
};
