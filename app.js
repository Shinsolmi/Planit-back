require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.set('trust proxy', 1);

const publicDir = path.join(__dirname, 'public');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('/map.js') || filePath.endsWith('/map.html')) {
      res.setHeader('Cache-Control', 'no-store'); // 개발 중 캐시 금지
    }
  }
}));

app.use(cors({
  origin: (origin, cb) => cb(null, true), // 프로덕션은 화이트리스트 권장
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));  // 모든 도메인 허용

app.use(express.json({ limit: '1mb' }));

// ❌ (제거: 중복된 static 서빙)

// ✅ 키 반환 라우트
app.get('/config/maps-key', (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key) return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY missing' });
  res.json({ key });
});

const userRoutes = require('./routes/users');
const schedulesRouter = require('./routes/schedules');
const aiRoutes = require('./routes/ai');
const communityRouter = require('./routes/community');
const tipsRouter = require('./routes/tips');
const mainRouter = require('./routes/main');
const searchRouter = require('./routes/search');

// --- API 라우터 연결 ---
app.use('/community', communityRouter);
app.use('/tips', tipsRouter);
app.use('/main', mainRouter);
app.use('/search', searchRouter);
app.use('/users', userRoutes);
app.use('/schedules', schedulesRouter);
app.use('/ai', aiRoutes);

// ✅ 지도 페이지 (스케줄 지도)
app.get('/map', (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key) return res.status(500).send('GOOGLE_MAPS_API_KEY missing');
  res.set('Cache-Control', 'no-store'); // 개발 중 캐시 방지
  res.type('html').send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>html,body{margin:0;padding:0;height:100%}#map{width:100%;height:100%}</style>
  <script src="/map.js?v=3"></script>
  <script async defer
    src="https://maps.googleapis.com/maps/api/js?key=${key}&callback=initMap&libraries=places&language=ko&region=JP">
  </script>
</head>
<body><div id="map"></div></body>
</html>`);
});


// ✅ 장소 검색 지도 서빙 (placemap) - 중복된 정의를 제거하고 하나만 남깁니다.
app.get('/placemap', (req, res) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).send('GOOGLE_MAPS_API_KEY missing');
    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Place Map</title>
<script>
const apiKey = "${apiKey}";
window.onload = () => {
const script = document.createElement('script');
script.src = '/placemap.js';
script.onload = () => loadGoogleMaps(apiKey);
document.head.appendChild(script);
};
</script>
</head>
<body></body>
</html>
`);
});


app.get('/schedules/map', (req, res) => {
    // ⚠️ 'schedules' 변수가 정의되어 있지 않아 에러가 날 수 있으므로,
    // 실제 데이터베이스 로직으로 대체되어야 합니다.
    res.status(501).json({ error: 'Schedules map data logic not implemented yet.' });
});


// 헬스체크/루트
app.get('/healthz', (req,res)=>res.send('ok'));
app.get('/', (req, res) => res.send('PLANit Node.js 서버 실행 중'));

// 404/에러 핸들러
app.use((req,res) => res.status(404).json({error:'NOT_FOUND'}));
app.use((err,req,res,next) => {
  console.error(err);
  res.status(500).json({error:'INTERNAL'});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`API on :${PORT}`));