
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const userRoutes = require('./routes/users');
const schedulesRouter = require('./routes/schedules');
const aiRoutes = require('./routes/ai');
const path = require('path');

const app = express();
app.use(cors());  // 모든 도메인 허용
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
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


// 기본 루트 경로
app.get('/', (req, res) => res.send('PLANit Node.js 서버 실행 중'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
