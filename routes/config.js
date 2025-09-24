const express = require('express');
const router = express.Router();

// (선택) auth 미들웨어 걸고 싶으면 추가
// const auth = require('../middleware/authMiddleware');

router.get('/maps-key', /*auth,*/ (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key) return res.status(500).json({ error: 'API key missing' });
  // 최소한의 형태로 반환
  res.json({ key });
});

module.exports = router;
