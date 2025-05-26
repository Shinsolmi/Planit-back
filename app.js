const express = require('express');
const cors = require('cors');

const userRoutes = require('./routes/users');
const schedulesRouter = require('./routes/schedules');
const aiRoutes = require('./routes/ai');
const path = require('path');

const app = express();
app.use(cors());  // 모든 도메인 허용
app.use(express.json());

// 정적 파일을 제공하는 설정 (HTML 파일 포함)
app.get('/map', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));  // public/index.html 파일 제공
});
// 기존 라우트
app.use('/users', userRoutes);
app.use('/schedules', schedulesRouter);
app.use('/ai', aiRoutes);

// '/map' 경로로 Google Maps 화면을 표시할 HTML 파일 제공
app.get('/map', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));  // public/index.html 파일 제공
});

// 기본 루트 경로
app.get('/', (req, res) => res.send('PLANit Node.js 서버 실행 중'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
