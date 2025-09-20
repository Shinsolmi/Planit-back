require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, cb) => cb(null, true), // 프로덕션은 화이트리스트 권장
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));  // 모든 도메인 허용

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const userRoutes = require('./routes/users');
const schedulesRouter = require('./routes/schedules');
const aiRoutes = require('./routes/ai');
const communityRouter = require('./routes/community');
const tipsRouter = require('./routes/tips');
const mainRouter = require('./routes/main');
const searchRouter = require('./routes/search');

app.use('/community', communityRouter);
app.use('/tips', tipsRouter);
app.use('/main', mainRouter);
app.use('/search', searchRouter);

// 정적 파일을 제공하는 설정 (HTML 파일 포함)
app.get('/map', (req, res) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Google Map</title>
            <script>
                const apiKey = "${apiKey}";
                window.onload = () => {
                    const script = document.createElement('script');
                    script.src = '/map.js';
                    script.onload = () => loadGoogleMaps(apiKey);
                    document.head.appendChild(script);
                };
            </script>
        </head>
        <body></body>
        </html>
    `);
});
app.get('/placemap', (req, res) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
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

// 예: 임시 스케줄 데이터 (DB에서 가져올 수도 있음)
const schedules = [
    { title: '회의실 A', lat: 37.5665, lng: 126.9780, description: '오전 회의' },
    { title: '카페 B', lat: 37.5700, lng: 126.9820, description: '점심 식사' }
];
app.get('/schedules/map', (req, res) => {
    res.json(schedules);
});

// 기존 라우트
app.use('/users', userRoutes);
app.use('/schedules', schedulesRouter);
app.use('/ai', aiRoutes);

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
