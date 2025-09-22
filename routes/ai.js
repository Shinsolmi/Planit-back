// ai.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

const selections = {};
const TEMP_USER_ID = 'temp_user';

const util = require('util');
const J = (obj) => util.inspect(obj, { depth: 5, colors: false, maxArrayLength: 50 });
const now = () => new Date().toISOString();

// ---------- 유틸 ----------
function extractJson(text){ if(!text) return ''; const m=text.match(/```json([\s\S]*?)```/i); return (m?m[1]:text).trim(); }
function toHHmm(raw){ const m=/^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(raw||'').trim()); return m?`${m[1].padStart(2,'0')}:${m[2]}`:''; }
function timeKey(hhmm){ const m=/^(\d{1,2}):(\d{2})$/.exec(String(hhmm||'').trim()); return m?(parseInt(m[1],10)*60+parseInt(m[2],10)):(24*60*10); }
function isTooGenericPlace(s){
  if(!s) return true; const v=String(s).trim().toLowerCase();
  const bad=new Set(['카페','공원','미술관','박물관','식당','레스토랑','해변','시장','쇼핑몰','백화점','사원','절','성당','교회','테마파크','온천','역','터미널','호텔','숙소','장소','고유명사']);
  return v.length<2 || bad.has(v);
}
function diffDaysInclusive(s,e){
  if(!s||!e) return null; try{ const S=new Date(s), E=new Date(e);
    const d=Math.floor((E.setHours(0,0,0,0)-S.setHours(0,0,0,0))/(1000*60*60*24))+1;
    return d>0?d:null; }catch{ return null; }
}
function normalizeToDays(details, targetDays){
  const by=new Map(); for(const d of (Array.isArray(details)?details:[])){
    const day=Number(d?.day); if(!Number.isInteger(day)||day<1||day>targetDays) continue;
    by.set(day, Array.isArray(d?.plan)?d.plan:[]);
  }
  const res=[]; for(let i=1;i<=targetDays;i++){ res.push({day:i, plan: by.get(i)||[]}); }
  return res;
}
function parseDurationDays(kor){
  if(!kor) return null;
  let m=/(\d+)\s*박\s*(\d+)\s*일/.exec(kor); if(m) return parseInt(m[2],10);
  m=/(\d+)\s*일/.exec(kor); if(m) return parseInt(m[1],10);
  return null;
}

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

function buildSearchQuery(place, city) {
  const p = String(place || '').trim();
  const c = String(city || '').trim();
  return (p && c) ? `${p} ${c}` : p || c;
}

// ===== Opening hours cache =====
const detailsCache = new Map(); // placeId -> { ts, data }
const DETAILS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일 캐시

async function fetchPlaceDetails(placeId, { language='ko' } = {}) {
  if (!GOOGLE_KEY || !placeId) return null;

  const c = detailsCache.get(placeId);
  if (c && (Date.now() - c.ts) < DETAILS_TTL_MS) return c.data;

  try {
    const r = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        key: GOOGLE_KEY,
        place_id: placeId,
        language,
        fields: [
          'opening_hours',
          'current_opening_hours',
          'business_status',
          'utc_offset_minutes',
          'name',
          'place_id'
        ].join(',')
      }
    });
    const data = r.data?.result || null;
    detailsCache.set(placeId, { ts: Date.now(), data });
    return data;
  } catch (e) {
    console.error('[PLACE DETAILS] err:', e.response?.status, e.response?.data || e.message);
    return null;
  }
}

// Google 요일: 0=일,1=월,...6=토
function weekdayIndexFromDate(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  try { return new Date(dateStr + 'T00:00:00').getDay(); } catch { return null; }
}

// "HH:mm" -> 분
function toMin(hhmm) { const m=/^(\d{1,2}):(\d{2})$/.exec(hhmm||''); return m ? (+m[1]*60 + +m[2]) : null; }
// 분 -> "HH:mm"
function fromMin(min){ min=Math.max(0, Math.min(1439, min|0)); const h=String((min/60|0)).padStart(2,'0'); const m=String(min%60).padStart(2,'0'); return `${h}:${m}`; }

// 하루 중 가장 가까운 영업 구간으로 시간 보정
function shiftIntoOpenWindow(hhmm, weekday, openingHours) {
  // openingHours?.periods[].open.day/close.day + time(hhmm '0900'형 포함)
  if (!openingHours?.periods?.length) return { ok:true, time: hhmm, note:null }; // 정보 없으면 패스

  const cur = toMin(hhmm);
  if (cur == null) return { ok:true, time: hhmm, note:null };

  // periods를 해당 요일 기준으로 평면화
  const slots = [];
  for (const p of openingHours.periods) {
    const od = p.open?.day, ot = p.open?.time, cd = p.close?.day, ct = p.close?.time;
    if (od == null || !ot || ct == null) continue;
    // overnight(다음날까지)도 있을 수 있어 close.day가 다음날로 들어옴
    if (od === weekday || (od < weekday && cd >= weekday) || (od > cd && (weekday >= od || weekday <= cd))) {
      // 대략적으로 같은 요일에 걸치는 구간만
      const openMin  = +(ot.slice(0,2))*60 + +(ot.slice(2,4));
      const closeMin = +(ct.slice(0,2))*60 + +(ct.slice(2,4));
      // 닫힘이 00:00인 경우도 있으니 1440 보정
      slots.push({ open: openMin, close: closeMin <= openMin ? closeMin + 1440 : closeMin });
    }
  }
  if (!slots.length) return { ok:true, time: hhmm, note:null };

  // 현재 시간이 어느 구간에 속하는지/가까운 구간으로 이동
  let best = null;
  for (const s of slots) {
    if (cur >= s.open && cur <= s.close) return { ok:true, time: hhmm, note:null }; // 이미 영업 중
    if (cur < s.open) { // 다음 오픈 시간으로 당기기
      if (!best || s.open < best.open) best = s;
    }
  }
  if (best) return { ok:true, time: fromMin(best.open % 1440), note:'shifted_to_open' };

  // 모두 지난 경우: 마지막 close로부터 너무 지나면 방문 불가 처리
  return { ok:false, time: hhmm, note:'closed_today' };
}

// 일정에 영업시간 적용
async function applyOpeningHours(details, { startdate, language='ko' } = {}) {
  if (!startdate) return details; // 날짜 없으면 스킵(선택)
  const wd0 = weekdayIndexFromDate(startdate);
  if (wd0 == null) return details;

  const out = [];
  for (const d of (Array.isArray(details) ? details : [])) {
    const weekday = (wd0 + (d.day - 1)) % 7; // Day N의 요일
    const kept = [];
    for (const it of (Array.isArray(d.plan) ? d.plan : [])) {
      if (!it.place_id) { kept.push(it); continue; } // 검증 실패 or place_id 없음 → 그대로 둠
      const det = await fetchPlaceDetails(it.place_id, { language });
      const oh = det?.current_opening_hours || det?.opening_hours;
      const adj = shiftIntoOpenWindow(it.time, weekday, oh);
      if (adj.ok) {
        kept.push({ ...it, time: adj.time, _open_note: adj.note || null });
      } else {
        // 닫힘(그날 영업X) → 드롭하거나 표시만 할 수 있음. 여기선 드롭.
        // kept.push({ ...it, _open_note: 'closed_today' });
      }
    }
    // 시간 정렬
    kept.sort((a,b)=> (toMin(a.time)||0) - (toMin(b.time)||0));
    out.push({ day: d.day, plan: kept });
  }
  return out;
}

// === [NEW] 지오코딩/거리/검증 유틸 ===
const cityCache = new Map(); // { city: {lat,lng} }

function toRad(d){ return d*Math.PI/180; }
function haversineKm(a, b){
  if(!a || !b) return Infinity;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

async function geocodeCity(city, { region='jp', language='ko' } = {}) {
  if (!GOOGLE_KEY || !city) return null;
  const cacheKey = `${city}|${language}`;
  if (cityCache.has(cacheKey)) return cityCache.get(cacheKey);
  try {
    const r = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: city,
        key: GOOGLE_KEY,
        region,          // 검색 바이어스
        language,        // 응답 언어
      }
    });
    const first = r.data?.results?.[0];
    const loc = first?.geometry?.location;
    if (!loc) return null;

    // 국가코드(JP, KR 등) 뽑기
    let country = null;
    const comps = first?.address_components || [];
    for (const c of comps) {
      if (Array.isArray(c.types) && c.types.includes('country')) {
        country = c.short_name || null; // 예: 'JP'
        break;
      }
    }

    const out = { lat: loc.lat, lng: loc.lng, country };
    cityCache.set(cacheKey, out);
    return out;
  } catch (e) {
    console.error('[GEOCODE] err:', e.response?.status, e.response?.data || e.message);
    return null;
  }
}

// 후보 중 "운영상태 OK + 평점/리뷰 수 기준 만족 + 그 시간에 open" 을 우선 채택
async function verifyPlaceOnGoogleMaps({
  place, city, query, region='jp', language='ko',
  radiusKm=60,
  desiredISODate, // "YYYY-MM-DD"
  desiredTimeHHmm, // "HH:mm"
  minRating=2.0,
  minReviews=3,
  requireOperational=true,
}) {
  if (!GOOGLE_KEY) return { ok: true, placeId: null, mapUrl: null, loc: null };

  const center = await geocodeCity(city, { region, language });
  const q = (query && query.trim()) || buildSearchQuery(place, city);
  if (!center || !q) return { ok: false };

  // 1) TextSearch로 후보 가져오기
  const resp = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
    params: {
      query: q,
      key: GOOGLE_KEY,
      language,
      region,
      location: `${center.lat},${center.lng}`,
      radius: Math.min(50000, radiusKm*1000),
    }
  });
  const results = resp.data?.results || [];
  if (!results.length) return { ok: false };

  // 2) 가까운 순으로 소트
  const withDist = results
    .map(r => {
      const loc = r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : null;
      const dist = loc ? haversineKm(center, loc) : Infinity;
      return { r, loc, dist };
    })
    .filter(x => x.loc && x.dist <= radiusKm)
    .sort((a,b)=> a.dist - b.dist);

  const weekday = desiredISODate ? weekdayIndexFromISO(desiredISODate) : null;
  const minutes = toMinutes(desiredTimeHHmm);

  // 3) 후보를 돌며 Details API로 필터링
  for (const cand of withDist) {
    const placeId = cand.r.place_id;
    if (!placeId) continue;

    // Details (opening_hours, rating, user_ratings_total, business_status)
    const det = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        key: GOOGLE_KEY,
        language,
        region,
        fields: 'place_id,geometry,opening_hours,rating,user_ratings_total,business_status,name',
      }
    }).then(x=>x.data?.result).catch(()=>null);

    if (!det) continue;

    // 상태/평점/리뷰 필터
    if (requireOperational && det.business_status && det.business_status !== 'OPERATIONAL') continue;
    if (det.user_ratings_total != null && det.user_ratings_total < minReviews) continue;
    if (det.rating != null && det.rating < minRating) continue;

    // 시간 필터: 영업시간 정보가 있으면 '그때 오픈'인지 체크
    if (weekday != null && minutes != null && det.opening_hours?.periods) {
      const open = isOpenAt(det.opening_hours, weekday, minutes);
      if (open === false) continue; // 명시적으로 닫힘이면 패스
      // null 은 정보없음 → 통과 (원하면 여기서도 제외 가능)
    }

    // 통과
    const loc = det.geometry?.location ? { lat: det.geometry.location.lat, lng: det.geometry.location.lng } : cand.loc;
    const mapUrl = `https://www.google.com/maps/place/?q=place_id:${placeId}`;
    return { ok: true, placeId, mapUrl, loc };
  }

  return { ok: false };
}

// === [REPLACE] 검증 통과 항목만 통과시키고 place_id/좌표를 실어줌 ===
async function verifyAllPlans(details, city, {
  region='jp', language='ko', radiusKm=60,
  startdate, // ISO (YYYY-MM-DD)
} = {}) {
  const out = [];
  for (const d of (Array.isArray(details) ? details : [])) {
    const day = Number(d?.day);
    const plan = Array.isArray(d?.plan) ? d.plan : [];
    const kept = [];

    // day → 실제 날짜 (startdate + (day-1))
    let dateISO = null;
    if (startdate && Number.isInteger(day) && day >= 1) {
      const base = new Date(startdate);
      base.setDate(base.getDate() + (day - 1));
      dateISO = base.toISOString().slice(0,10);
    }

    const checks = await Promise.allSettled(plan.map(async (p) => {
      const q = (p.query && String(p.query).trim()) || buildSearchQuery(p.place, city);
      const r = await verifyPlaceOnGoogleMaps({
        place: p.place,
        city,
        query: q,
        region,
        language,
        radiusKm,
        desiredISODate: dateISO,           // ⬅️ 날짜 전달
        desiredTimeHHmm: String(p.time||''), // ⬅️ 시간 전달
        minRating: 4.0,
        minReviews: 20,
        requireOperational: true,
      });
      return { p, r };
    }));

    for (const c of checks) {
      if (c.status !== 'fulfilled') continue;
      const { p, r } = c.value;
      if (!r.ok) continue;
      kept.push({
        time: p.time,
        place: p.place,
        memo: p.memo,
        query: p.query || buildSearchQuery(p.place, city),
        place_id: r.placeId,
        map_url: r.mapUrl,
        loc: r.loc,
      });
    }
    out.push({ day, plan: kept });
  }
  return out;
}

function parseHHmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s||'').trim());
  if (!m) return null;
  const h = parseInt(m[1],10), mm = parseInt(m[2],10);
  if (h<0 || h>23 || mm<0 || mm>59) return null;
  return h*60 + mm;
}
function fmtHHmm(mins) {
  mins = Math.max(0, Math.min(24*60-1, mins|0));
  const h = String(Math.floor(mins/60)).padStart(2,'0');
  const m = String(mins%60).padStart(2,'0');
  return `${h}:${m}`;
}
function addMinutes(hhmm, delta) {
  const m = parseHHmm(hhmm) ?? 0;
  return fmtHHmm(m + delta);
}
function diffMinutes(a, b) {
  const ma = parseHHmm(a), mb = parseHHmm(b);
  if (ma==null || mb==null) return 0;
  return mb - ma;
}

// 요일: Sun=0 ... Sat=6 (Google places periods도 0=Sun)
function weekdayIndexFromISO(isoDate) {
  const d = new Date(isoDate);
  return d.getUTCDay(); // 또는 로컬 기준이면 getDay()
}

// "HH:mm" -> 분
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm||'').trim());
  if (!m) return null;
  const h = parseInt(m[1],10), mm = parseInt(m[2],10);
  return h*60 + mm;
}

// Places opening_hours.periods 기준으로 특정 요일/시간에 오픈인지 판정
function isOpenAt(openingHours, weekday, minutes) {
  // openingHours.periods: [{open:{day,hour,minute}, close:{day,hour,minute}}, ...]
  const periods = openingHours?.periods;
  if (!Array.isArray(periods) || minutes == null) return null; // 정보없음

  // 분 비교를 위해 (day, hour, minute) → (요일, 분)로 정규화
  const toDayMins = (o) => (o ? (o.day*1440 + (o.hour??0)*60 + (o.minute??0)) : null);
  const target = weekday*1440 + minutes;

  for (const p of periods) {
    const o = toDayMins(p.open);
    const c = toDayMins(p.close);
    if (o == null || c == null) continue;

    if (c > o) {
      // 같은 날 내에 닫힘
      if (target >= o && target < c) return true;
    } else {
      // 자정 넘어가는 케이스 (e.g. 22:00 ~ 다음날 02:00)
      // 범위 1: [o, o+1440) 및 범위 2: [0, c)
      if (target >= o || target < c) return true;
    }
  }
  return false;
}

// 각 day별로 최소 간격 강제, 초과분은 드롭
function enforceMinGap(details, {
  minGap = 90, // 분
  dayStart = '09:00',
  dayEnd   = '21:00',
} = {}) {
  const startM = parseHHmm(dayStart) ?? 540;
  const endM   = parseHHmm(dayEnd)   ?? 1260;

  const out = [];
  for (const d of (Array.isArray(details) ? details : [])) {
    const day = Number(d?.day);
    let items = Array.isArray(d?.plan) ? d.plan.slice() : [];

    // 시간 정규화 + 정렬
    items = items.map(it => ({
      ...it,
      time: parseHHmm(it.time) ? it.time : dayStart, // 형식 깨지면 dayStart로
    })).sort((a,b)=> (parseHHmm(a.time)||0) - (parseHHmm(b.time)||0));

    const kept = [];
    let last = startM - minGap; // 첫 항목은 그냥 dayStart 이상이면 허용
    for (const it of items) {
      let t = parseHHmm(it.time) ?? startM;
      if (t < startM) t = startM;
      if (t - last < minGap) {
        // 간격이 모자라면 last+minGap으로 밀기
        t = last + minGap;
      }
      if (t > endM) {
        // 하루 종료를 넘어가면 드롭
        continue;
      }
      kept.push({ ...it, time: fmtHHmm(t) });
      last = t;
    }

    out.push({ day, plan: kept });
  }
  return out;
}


// ---------- 개별 저장 라우트 ----------
router.post('/save-city',      (req,res)=>{ const {city}=req.body||{}; selections[TEMP_USER_ID]={...selections[TEMP_USER_ID], city}; res.json({ok:true}); });
router.post('/save-duration',  (req,res)=>{ const {duration}=req.body||{}; selections[TEMP_USER_ID]={...selections[TEMP_USER_ID], duration}; res.json({ok:true}); });
router.post('/save-companion', (req,res)=>{ const {companion}=req.body||{}; selections[TEMP_USER_ID]={...selections[TEMP_USER_ID], companion}; res.json({ok:true}); });
router.post('/save-theme',     (req,res)=>{ const {theme}=req.body||{}; selections[TEMP_USER_ID]={...selections[TEMP_USER_ID], theme}; res.json({ok:true}); });
router.post('/save-pace',      (req,res)=>{ const {pace}=req.body||{}; selections[TEMP_USER_ID]={...selections[TEMP_USER_ID], pace}; res.json({ok:true}); });
router.post('/save-dates',     (req,res)=>{ const {startdate,enddate}=req.body||{}; selections[TEMP_USER_ID]={...selections[TEMP_USER_ID], startdate,enddate}; res.json({ok:true}); });

// ---------- GPT 최초 생성 ----------
router.post('/schedule', async (req,res)=>{
  const data = selections[TEMP_USER_ID] || {};
  const required = ['city','duration','companion','theme','pace'];

  // 입력 로그
  console.log(`[SCHEDULE][${now()}] selections=`, J(data));

  if (required.some(k=>!data[k])) {
    console.warn(`[SCHEDULE][${now()}] 400 missing fields`, required.filter(k=>!data[k]));
    return res.status(400).json({ error:'선택 정보가 부족합니다.', missing: required.filter(k=>!data[k]) });
  }

  const city = data.city;
  const days = diffDaysInclusive(data.startdate, data.enddate) || parseDurationDays(data.duration) || 2;

  const system='You are a meticulous travel itinerary planner.';
  const prompt=`
다음 조건에 맞춰 **${city} ${days}일** 여행 일정을 만들어주세요.

[여행 조건]
- 시작일: ${data.startdate||''}
- 종료일: ${data.enddate||''}
- 여행지: ${city}
- 여행 기간: ${data.duration}
- 동행: ${data.companion}
- 선호 테마: ${data.theme}
- 일정 밀도: ${data.pace}

[엄격 규칙]
- 결과는 **JSON ONLY** (설명/코드펜스 금지).
- "title"은 **"${city} ${days}일 (핵심 키워드 1~2개) 여행"** 형태.
- 한 Day에 최소 2개 이상의 장소 추천.
- **모든 장소(place)는 Google 지도에서 검색되는 실존 POI여야 한다.**
  - "카페", "공원", "미술관", "식당", "장소", "고유명사" 같은 추상/플레이스홀더 금지.
  - 가능하면 각 항목에 "query" 필드도 제공한다(미제공 시 서버가 place+city로 보정).
- 시간은 "HH:mm" 형식, 같은 day에서는 일정 간 최소 90분 이상 간격을 두어라, memo는 장소명 반복 금지.
- **day는 1..${days} “정확히 ${days}개”만 존재** (초과/누락 금지).
- 모든 설명(memo)은 반드시 한국어로 작성.

[반환 JSON]
{
  "title": "${city} ${days}일 미식·산책 여행",
  "details": [ { "day": 1, "plan": [ { "time": "10:00", "place": "고유명사", "memo": "활동/특징", "query": "고유명사 + 도시명(선택)" } ] } ]
}`.trim();

  try{
    const r=await axios.post('https://api.openai.com/v1/chat/completions',
      { model:'gpt-3.5-turbo', messages:[{role:'system',content:system},{role:'user',content:prompt}], temperature:0.5 },
      { headers:{'Content-Type':'application/json', Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}, timeout:30000 }
    );
    const reply=r.data?.choices?.[0]?.message?.content||'';
    let obj; try{ obj=JSON.parse(extractJson(reply)); }catch{ return res.status(500).json({error:'PARSE_FAIL', raw:reply}); }

    // 1) 클린/정렬
    const cleaned=[];
    for(const d of (Array.isArray(obj.details)?obj.details:[])){
      const day=Number(d?.day); const plan=Array.isArray(d?.plan)?d.plan:[];
      const items=[];
      const seen=new Set();
      for(const p of plan){
        const t=toHHmm(p?.time)||'23:59';
        const place=String(p?.place||'').trim(); const memo=String(p?.memo||'').trim();
        const key=`${t}||${place.toLowerCase()}`;
        if(!place || isTooGenericPlace(place) || seen.has(key)) continue;
        seen.add(key); items.push({time:t, place, memo});
      }
      items.sort((a,b)=>timeKey(a.time)-timeKey(b.time));
      if(Number.isInteger(day)) cleaned.push({day, plan:items});
    }

    console.log(`[SCHEDULE][${now()}] cleaned(before verify) days=${cleaned.length} sample=`, J(cleaned.slice(0,1)));

    // 최초 생성 (/schedule)에서 cleaned 만든 뒤:
    const cityInfo = await geocodeCity(city, { region: 'jp', language: 'ko' });
    const region = (cityInfo?.country || 'JP').toLowerCase();   // 'jp'
    const lang   = region === 'jp' ? 'ja' : 'en';

    let verified = await verifyAllPlans(cleaned, city, {
      region: 'jp',
      language: 'ko',
      radiusKm: 60,
      startdate: data.startdate || null,   // ⬅️ 추가
    });

    // Google Maps 검증
    let verifiedPlans = await verifyAllPlans(cleaned, city, { region: 'jp' });
    console.log(`[SCHEDULE][${now()}] verified(after maps) days=${verifiedPlans.length}`,
                `keptTotal=${verifiedPlans.reduce((s,d)=>s+(d.plan?.length||0),0)}`);

    verified = enforceMinGap(verified, { minGap: 90, dayStart:'09:00', dayEnd:'21:00' });

    // ✅ 영업시간 보정 추가
    verified = await applyOpeningHours(verified, { startdate: data.startdate, language: 'ko' });

    // 간격 보정
    verifiedPlans = enforceMinGap(verifiedPlans, { minGap: 90, dayStart:'09:00', dayEnd:'21:00' });
    console.log(`[SCHEDULE][${now()}] minGap applied days=${verifiedPlans.length}`,
                `keptTotal=${verifiedPlans.reduce((s,d)=>s+(d.plan?.length||0),0)}`,
                'sample=', J(verifiedPlans.slice(0,1)));

    // 목표 일수 정규화
    let result = normalizeToDays(verifiedPlans, days);

    // 3) 후검증(빈 day 금지: 최소 1개)
    const lacks = [];
    for (const d of result) {
      if (!Array.isArray(d.plan) || d.plan.length < 1) {
        lacks.push({ day: d.day, need: 1, got: d.plan?.length || 0 });
      }
    }
    console.log('[SCHEDULE]', new Date().toISOString(), 'post-check lacks=', lacks);
    if (lacks.length) {
      return res.status(422).json({ error: 'INSUFFICIENT_FILL', lacks });
    }

    // 4) 제목 보정  ← title 대신 finalTitle 사용
    let finalTitle = String(obj.title || '').trim();
    if (!finalTitle || /^여행 제목$/i.test(finalTitle)) {
      finalTitle = `${city} ${days}일 맞춤 여행`;
    } else if (city && !finalTitle.includes(city)) {
      finalTitle = `${city} · ${finalTitle}`;
    }

    // 5) 응답  ← 선언 완료된 finalTitle을 여기서 사용
    return res.json({
      title: finalTitle,
      city,
      startdate: data.startdate || null,
      enddate:   data.enddate   || null,
      details: result,
    });
  }catch(e){
    console.error('[SCHEDULE] error:', e.response?.status, e.response?.data||e.message);
    return res.status(500).json({error:'일정 생성 중 서버 오류'});
  }
});

// ---------- GPT 부분 재추천 (remove 기반 diff) ----------
router.post('/schedule-refine-diff', async (req,res)=>{
  try{
    let { city, startdate, enddate, duration, baseDetails, remove } = req.body || {};
    if(typeof baseDetails==='string'){ try{ baseDetails=JSON.parse(baseDetails); }catch{ return res.status(400).json({error:'BAD_BASE_DETAILS'}); } }
    if(!Array.isArray(baseDetails)) return res.status(400).json({error:'BAD_BASE_DETAILS'});
    if(typeof remove==='string'){ try{ remove=JSON.parse(remove); }catch{ remove=[]; } } if(!Array.isArray(remove)) remove=[];

    const daysByDate = diffDaysInclusive(startdate, enddate);
    const targetDays = daysByDate || Number(duration) || baseDetails.length || 2;

    // 잠금/제거
    const shouldRemove=(day,time,place)=> remove.some(x=> Number(x.day)===Number(day) && String(x.time||'').trim()===String(time||'').trim() && String(x.place||'').trim()===String(place||'').trim());
    const locked=[]; const forbiddenSet=new Set();
    for(const d of baseDetails){
      const day=d?.day; const plan=Array.isArray(d?.plan)?d.plan:[];
      const kept=[];
      for(const p of plan){
        const t=String(p?.time||''); const place=String(p?.place||''); const memo=String(p?.memo||'');
        forbiddenSet.add(place.trim().toLowerCase());
        if(!shouldRemove(day,t,place)) kept.push({ time:t, place, memo, _locked:true });
      }
      locked.push({ day, plan:kept });
    }

    // 최소 채움 개수
    const removedPerDay=new Map();
    for(const r of remove){ const d=Number(r.day); removedPerDay.set(d,(removedPerDay.get(d)||0)+1); }
    const requiredPerDay={};
    for(const [d,cnt] of removedPerDay.entries()) requiredPerDay[d]=Math.max(1,Math.min(cnt,2));

    // 🔴 수정 가능한 day 집합 (여기에만 신규 허용)
    const touchableDays = new Set([...removedPerDay.keys()]);

    const system='You are a meticulous travel itinerary editor.';
    const prompt=`
아래 입력에는 day별로 일부 항목이 _locked:true 로 잠겨있습니다.
규칙(엄격):
- “_locked:true는 절대 변경 금지”
- 빈 부분만 해당 day에 맞춰 채우기.
- 시간은 "HH:mm" 형식, 같은 day에서는 일정 간 최소 90분 이상 간격을 두어라.
- 신규로 채우는 **모든 장소(place)는 Google 지도에서 검색되는 실존 POI여야 한다.**(추상/플레이스홀더 금지).
- 가능하면 각 항목에 "query" 필드도 제공한다(미제공 시 서버가 place+city로 보정).
- day는 1..${targetDays} 정확히 ${targetDays}개.
- 금지 장소(forbiddenPlaces)는 사용 금지(대소문자 무시, 유사/동일 피하기).
- 각 day는 최소 requiredPerDay[day]개 이상 신규 항목 추가(없으면 1개).
- 모든 설명(memo)은 반드시 한국어로 작성.
- 결과는 JSON ONLY.

requiredPerDay:
${JSON.stringify(requiredPerDay,null,2)}

forbiddenPlaces:
${JSON.stringify([...forbiddenSet],null,2)}

입력(수정 금지):
${JSON.stringify(locked,null,2)}

반환(JSON ONLY):
{ "title":"${city||'여행 도시'} ${targetDays}일 여행", "details":[{ "day":1,"plan":[{"time":"10:00","place":"고유명사","memo":"설명","query":"고유명사 + 도시명(선택)"}]}] }
`.trim();

    const r=await axios.post('https://api.openai.com/v1/chat/completions',
      { model:'gpt-3.5-turbo', messages:[{role:'system',content:system},{role:'user',content:prompt}], temperature:0.5 },
      { headers:{'Content-Type':'application/json', Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}, timeout:30000 }
    );
    const reply=r.data?.choices?.[0]?.message?.content||'';
    let obj; try{ obj=JSON.parse(extractJson(reply)); }catch{ return res.status(500).json({error:'PARSE_FAIL', raw:reply}); }

    // === [REPLACE] 병합+클린: touchableDays 외 신규 금지 + 개수 캡 ===
    const result=[];
    for(const d of (Array.isArray(obj.details)?obj.details:[])){
      const day=Number(d?.day); const plan=Array.isArray(d?.plan)?d.plan:[];
      const lockedDay = locked.find(x=>Number(x.day)===day) || { plan:[] };

      const combined = [
        ...lockedDay.plan.map(p => ({
          time: toHHmm(p.time) || '23:59',
          place: String(p.place || '').trim(),
          memo:  String(p.memo  || '').trim(),
          _locked: true
        })),
        ...plan.map(p => ({
          time: toHHmm(p?.time) || '23:59',
          place: String(p?.place || '').trim(),
          memo:  String(p?.memo  || '').trim(),
          _locked: false
        })),
      ];

      const seen = new Set();
      const cleaned = [];
      let added = 0;
      const cap = requiredPerDay[day] ?? 0; // 손댈 day가 아니면 cap=0 → 신규 불가

      for (const it of combined) {
        const placeKey = String(it.place || '').trim().toLowerCase();
        const dupKey = `${it.time}||${placeKey}`;
        if (seen.has(dupKey)) continue;

        if (it._locked) {                    // ✅ 기존은 항상 보존
          cleaned.push({ time: it.time, place: it.place, memo: it.memo });
          seen.add(dupKey);
          continue;
        }

        // ✅ 신규는 "손댈 수 있는 day"에서만, 그리고 cap만큼만
        if (!touchableDays.has(day)) continue;
        if (added >= cap) continue;

        if (!it.place) continue;
        if (isTooGenericPlace(it.place)) continue;
        if (forbiddenSet.has(placeKey)) continue;

        cleaned.push({ time: it.time, place: it.place, memo: it.memo });
        seen.add(dupKey);
        added++;
      }

      cleaned.sort((a,b)=>timeKey(a.time)-timeKey(b.time));
      if(Number.isInteger(day)) result.push({day, plan:cleaned});
    }

    const cityInfo = await geocodeCity(city, { region: 'jp', language: 'ko' });
    const region = (cityInfo?.country || 'JP').toLowerCase();
    const lang   = region === 'jp' ? 'ja' : 'en';

    let verified = await verifyAllPlans(result, city, {
      region: 'jp',
      language: 'ko',
      radiusKm: 60,
      startdate: startdate || null,        // ⬅️ 추가
    });
    verified = enforceMinGap(verified, { minGap: 90, dayStart:'09:00', dayEnd:'21:00' });

    // ✅ 영업시간 보정 추가
    verified = await applyOpeningHours(verified, { startdate, language: 'ko' });

    // 병합된 result 만들고 나서
    console.log(`[REFINE][${now()}] combined(before verify) days=${result.length} sample=`, J(result.slice(0,1)));

    // Google Maps 검증
    let verifiedPlans = await verifyAllPlans(result, city, { region: 'jp' });
    console.log(`[REFINE][${now()}] verified(after maps) days=${verifiedPlans.length}`,
                `keptTotal=${verifiedPlans.reduce((s,d)=>s+(d.plan?.length||0),0)}`);

    // 간격 보정
    verifiedPlans = enforceMinGap(verifiedPlans, { minGap: 90, dayStart:'09:00', dayEnd:'21:00' });
    console.log(`[REFINE][${now()}] minGap applied days=${verifiedPlans.length}`,
                `keptTotal=${verifiedPlans.reduce((s,d)=>s+(d.plan?.length||0),0)}`,
                'sample=', J(verifiedPlans.slice(0,1)));

    // 정규화
    let normalized = normalizeToDays(verifiedPlans, targetDays);

    // 후검증
    const lacks = [];
    for (const d of normalized) {
      const need = requiredPerDay[d.day] || 1;
      const got = Array.isArray(d.plan) ? d.plan.length : 0;
      if (got < need) lacks.push({ day: d.day, need, got });
    }
    console.log(`[REFINE][${now()}] post-check lacks=${J(lacks)}`);

    // 제목 보정
    let title=String(obj.title||'').trim();
    if(!title || /^여행 제목$/i.test(title)) title=`${city||'여행'} ${targetDays}일 맞춤 여행`;
    else if(city && !title.includes(city)) title=`${city} · ${title}`;

    console.log(`[REFINE][${now()}] responding title="${title}" totalDays=${normalized.length} totalItems=${
      normalized.reduce((s,d)=> s + (d.plan?.length||0), 0)}`);

    return res.json({ title, city: city||null, startdate: startdate||null, enddate: enddate||null, details: normalized });
  }catch(e){
    console.error('[REFINE-DIFF] error:', e.response?.status, e.response?.data||e.message);
    return res.status(500).json({error:'리파인 중 서버 오류'});
  }
});

module.exports = router;
