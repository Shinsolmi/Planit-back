// --- map.js (stable) ---
let currentMap;
let directionsService;
let directionsRenderers = [];
let markerCache = {};
let infoWin = null;

let allSchedules = {};     // { [day]: [{place, lat, lng, memo, time}, ...] }
let currentDay = null;

console.log('[MAP] script evaluated');
window.__dbg = {
  inited: () => window.__mapInited === true,
  days:   () => Object.keys(allSchedules||{}),
  first:  () => (function(f){ return f ? `${f.lat},${f.lng}` : null; })(findFirstLatLng(allSchedules||{}))
};

window.__mapInited = false;                 // initMap 끝났는지
window.__pending = { ctx: null, details: null }; // 맵 전 호출 대기

// ▼ 오버레이 표시 토글
const SHOW_PLACE_PANEL = false;  // 장소 리스트 패널
const SHOW_DAY_BAR     = true;   // Day 칩

// 아이콘은 https 사용
const dayColors = [
  'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
  'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
  'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
  'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
  'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
];

// ---------- DOM Ready 가드 ----------
function onDomReady(fn){
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(fn, 0);
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}
let dayBar, placePanel, uiMounted = false;
function mountUI(){
  if (uiMounted) return;

  const style = document.createElement('style');
  style.textContent = `
    .map-ui { position: absolute; z-index: 9999; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    #dayBar {
      top: 12px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 8px; background: rgba(255,255,255,.85);
      padding: 8px 10px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.12);
    }
    .day-chip { padding: 6px 10px; border-radius: 999px; font-size: 13px; cursor: pointer; border: 1px solid #ddd; background: #fff; }
    .day-chip.active { background: #0b72ff; color: #fff; border-color: #0b72ff; }
    #placePanel {
      bottom: 16px; left: 16px; width: min(360px, 80vw); max-height: 45vh; overflow: auto;
      background: rgba(255,255,255,.92); border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,.18); padding: 10px;
    }
    .place-item { display: grid; grid-template-columns: 28px 1fr; gap: 8px; align-items: start; padding: 8px; border-radius: 10px; cursor: pointer; }
    .place-item:hover { background: rgba(0,0,0,.05); }
    .badge { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:999px; font-weight:700; font-size:12px; color:#fff; background:#777; }
    .place-title { font-weight:700; font-size:14px; }
    .place-sub { color:#555; font-size:12px; margin-top:2px; }
  `;
  document.head.appendChild(style);

  dayBar = document.createElement('div');
  dayBar.id = 'dayBar';
  dayBar.className = 'map-ui';

  placePanel = document.createElement('div');
  placePanel.id = 'placePanel';
  placePanel.className = 'map-ui';

  // ▼ 플래그에 따라 표시/숨김
  if (!SHOW_DAY_BAR)     dayBar.style.display     = 'none';
  if (!SHOW_PLACE_PANEL) placePanel.style.display = 'none';

  document.body.appendChild(dayBar);
  document.body.appendChild(placePanel);

  uiMounted = true;
}
onDomReady(mountUI);

// ---------- 공통 유틸 ----------
function isNum(n) { return typeof n === 'number' && Number.isFinite(n); }

function clearMap() {
  Object.values(markerCache).forEach(m => m.setMap(null));
  markerCache = {};
  directionsRenderers.forEach(r => r.setMap(null));
  directionsRenderers = [];
  if (infoWin) { infoWin.close(); infoWin = null; }
}

function findFirstLatLng(byDay){
  const days = Object.keys(byDay).map(Number).sort((a,b)=>a-b);
  for (const d of days){
    for (const p of (byDay[d]||[])){
      if (isNum(p.lat) && isNum(p.lng)) return { lat: p.lat, lng: p.lng };
    }
  }
  return null;
}

// 지오코딩 힌트(도시명만 사용)
let _ctx = { hint: '', radiusKm: 60 };
window.setMapContext = function({ hint, radiusKm } = {}) {
  if (typeof hint === 'string') _ctx.hint = hint;
  if (Number.isFinite(radiusKm)) _ctx.radiusKm = radiusKm;
  if (!window.__mapInited) window.__pending.ctx = { ..._ctx };
};

function geocodePlace(query){
  return new Promise((resolve, reject) => {
    const geocoder = new google.maps.Geocoder();
    const biased = _ctx.hint ? `${query} ${_ctx.hint}` : query;
    geocoder.geocode(
      { address: biased, componentRestrictions: { country: 'JP' }, region: 'JP' },
      (results, status) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else { reject(status); }
      }
    );
  });
}

async function ensureLatLng(plan){
  const out = [];
  for (const p of plan) {
    if (isNum(p.lat) && isNum(p.lng)) { out.push(p); continue; }
    const q = (p.place || '').trim();
    if (!q) continue;
    try {
      const pos = await geocodePlace(q);
      out.push({ ...p, lat: pos.lat, lng: pos.lng });
      await new Promise(r => setTimeout(r, 80)); // rate limit 완화
    } catch(_) { /* skip */ }
  }
  return out;
}

// ---------- 오버레이 UI ----------
function renderDayChips(days, current) {
  if (!uiMounted) mountUI();
  dayBar.innerHTML = '';
  days.forEach(d => {
    const chip = document.createElement('button');
    chip.className = 'day-chip' + (d === current ? ' active' : '');
    chip.textContent = `Day ${d}`;
    chip.addEventListener('click', () => focusDay(d));
    dayBar.appendChild(chip);
  });
}

function renderPlaceList(day) {
  if (!uiMounted) mountUI();
  const items = (allSchedules[day] || []);
  placePanel.innerHTML = '';
  if (!items.length) {
    placePanel.innerHTML = '<div class="place-sub">이 일차에는 장소가 없습니다.</div>';
    return;
  }
  items.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'place-item';
    row.innerHTML = `
      <div class="badge">${idx + 1}</div>
      <div>
        <div class="place-title">${it.place ?? ''}</div>
        <div class="place-sub">${it.time ? `⏰ ${it.time}` : ''}${it.memo ? ` · 📝 ${it.memo}` : ''}</div>
      </div>
    `;
    row.addEventListener('click', () => openPlaceInfo(idx));
    placePanel.appendChild(row);
  });
}

window.openPlaceInfo = function(index) {
  const m = markerCache[index];
  if (!m) return;
  google.maps.event.trigger(m, 'click');
  currentMap.panTo(m.getPosition());
};

// ---------- 렌더 ----------
function renderAllRoutes(list) {
  const items = list ?? (allSchedules[currentDay] || []).filter(p => isNum(p.lat) && isNum(p.lng));
  if (items.length < 2) return;

  directionsRenderers.forEach(r => r.setMap(null));
  directionsRenderers = [];

  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i], b = items[i + 1];
    const req = {
      origin: { lat: a.lat, lng: a.lng },
      destination: { lat: b.lat, lng: b.lng },
      travelMode: google.maps.TravelMode.WALKING,
    };
    const renderer = new google.maps.DirectionsRenderer({
      map: currentMap,
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#00897B', strokeOpacity: 0.8, strokeWeight: 5 },
    });
    directionsService.route(req, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK) {
        renderer.setDirections(result);
        directionsRenderers.push(renderer);
      } else {
        console.warn('Directions failed:', status);
      }
    });
  }
}

function renderDaySchedule(day) {
  if (!uiMounted) mountUI();
  clearMap();

  const items = (allSchedules[day] || []);
  currentDay = day;

  const days = Object.keys(allSchedules).map(Number).sort((a,b)=>a-b);
  if (SHOW_DAY_BAR)     renderDayChips(days, currentDay);
  if (SHOW_PLACE_PANEL) renderPlaceList(currentDay);

  const itemsWithCoords = items.filter(p => isNum(p.lat) && isNum(p.lng));
  if (!itemsWithCoords.length) return;

  infoWin = new google.maps.InfoWindow();
  const icon = dayColors[(day - 1) % dayColors.length];
  const bounds = new google.maps.LatLngBounds();

  itemsWithCoords.forEach((it, idx) => {
    const pos = { lat: it.lat, lng: it.lng };
    const m = new google.maps.Marker({
      position: pos,
      map: currentMap,
      title: it.place || '',
      icon: { url: icon, scaledSize: new google.maps.Size(32, 32) },
      label: { text: String(idx + 1), color: 'white', fontWeight: 'bold' },
      zIndex: 1000 + idx,
    });
    const html = `
      <div style="min-width:180px">
        <div style="font-weight:600;margin-bottom:4px">${it.place ?? ''}</div>
        ${it.time ? `<div>⏰ ${it.time}</div>` : ''}
        ${it.memo ? `<div>📝 ${it.memo}</div>` : ''}
        <div style="margin-top:6px">
          <a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.place || '')}%20@${it.lat},${it.lng}">
            Google 지도에서 보기
          </a>
        </div>
      </div>`;
    m.addListener('click', () => { infoWin.setContent(html); infoWin.open(currentMap, m); });
    markerCache[idx] = m;
    bounds.extend(pos);
  });

  if (!bounds.isEmpty()) currentMap.fitBounds(bounds);
  if (itemsWithCoords.length >= 2) renderAllRoutes(itemsWithCoords);
}

// ---------- 데이터 주입(Flutter) ----------
async function applySchedules(details){
  allSchedules = {};
  if (!Array.isArray(details)) return;

  for (const d of details) {
    const day = Number(d.day);
    if (!Number.isFinite(day)) continue;
    const plan = Array.isArray(d.plan) ? d.plan : [];
    allSchedules[day] = await ensureLatLng(plan);
  }

  const days = Object.keys(allSchedules).map(Number).sort((a,b)=>a-b);
  const first = findFirstLatLng(allSchedules);
  if (first && currentMap) currentMap.setCenter(first);

  if (days.length) {
    renderDaySchedule(days[0]);
  } else {
    if (SHOW_DAY_BAR)     renderDayChips([], null);
    if (SHOW_PLACE_PANEL) renderPlaceList(null);
  }
}

window.setSchedules = function(details){
  console.log('[MAP] setSchedules() called. mapInited=', window.__mapInited, 'details len=', Array.isArray(details)?details.length:'-');

  // ✨ 재주입 전에 깨끗이
  if (typeof window.__reset === 'function') window.__reset();

  if (!window.__mapInited) {
    window.__pending.details = details;
    return;
  }
  applySchedules(details);
};


window.focusDay = function(day){
  if (!Number.isFinite(day) || !allSchedules[day]) return;
  renderDaySchedule(day);
};

// ---------- Google Maps 콜백 ----------
window.initMap = function () {
  console.log('[MAP] initMap() start');

  // #map 가드: 없으면 생성
  let mapDiv = document.getElementById('map');
  if (!mapDiv) {
    mapDiv = document.createElement('div');
    mapDiv.id = 'map';
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    document.body.appendChild(mapDiv);
  }

  const first = findFirstLatLng(allSchedules);
  currentMap = new google.maps.Map(mapDiv, {
    zoom: 12,
    center: first || { lat: 35.681236, lng: 139.767125 } // fallback: 도쿄
  });
  directionsService = new google.maps.DirectionsService();

  window.__mapInited = true;
  console.log('[MAP] initMap() done');

  if (window.__pending && window.__pending.ctx) {
    // 컨텍스트 대기분 반영
    // (필요 시 _ctx.merge만)
    // _ctx = { ..._ctx, ...window.__pending.ctx };
  }
  if (window.__pending && window.__pending.details) {
    const d = window.__pending.details;
    window.__pending = { ctx: null, details: null };
    applySchedules(d);
  }
};

window.__reset = function(){
  try {
    clearMap();                // 마커/라인/infowin 정리
  } catch(_) {}
  allSchedules = {};
  currentDay   = null;
  // 오버레이 UI를 쓰는 경우 패널도 비움
  if (typeof placePanel !== 'undefined' && placePanel) placePanel.innerHTML = '';
  if (typeof dayBar !== 'undefined' && dayBar) dayBar.innerHTML = '';
  // __pending은 건들 필요 없음 (새 주입에서 다시 채움)
};
// HTML: <script src="/map.js"></script>
//       <script async defer src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&callback=initMap&libraries=places&language=ko&region=JP"></script>
