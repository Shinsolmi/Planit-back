const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 토큰 추출: "Bearer <token>" 형식
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '토큰이 없습니다.' });
  }

  const token = authHeader.split(' ')[1];  //여기서 token 정의

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); //이제 오류 없음
    req.user = decoded;  // 예: { user_id: 1, email: '...' }
    next();
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
};
