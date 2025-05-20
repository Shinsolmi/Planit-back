const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1]; // "Bearer <token>" 형식에서 토큰만 추출

    if (!token) {
        return res.status(401).json({ error: '토큰이 없습니다' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // 토큰 검증
        req.user = decoded; // 디코딩된 사용자 정보 저장 (ex: { user_id: 1 })
        next(); // 다음 미들웨어 or 컨트롤러로 이동
    } catch (err) {
        return res.status(401).json({ error: '유효하지 않은 토큰입니다' });
    }
};
