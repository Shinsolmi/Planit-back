const express = require('express');
const axios = require('axios');
const router = express.Router();

const selections = {};
const TEMP_USER_ID = 'temp_user';

// 개별 저장 라우트
router.post('/save-city', (req, res) => {
  const { city } = req.body;
  selections[TEMP_USER_ID] = { ...selections[TEMP_USER_ID], city };
  res.json({ message: '도시 저장 완료' });
});

router.post('/save-duration', (req, res) => {
  const { duration } = req.body;
  selections[TEMP_USER_ID] = { ...selections[TEMP_USER_ID], duration };
  res.json({ message: '숙박일 수 저장 완료' });
});

router.post('/save-companion', (req, res) => {
  const { companion } = req.body;
  selections[TEMP_USER_ID] = { ...selections[TEMP_USER_ID], companion };
  res.json({ message: '동행자 저장 완료' });
});

router.post('/save-theme', (req, res) => {
  const { theme } = req.body;
  selections[TEMP_USER_ID] = { ...selections[TEMP_USER_ID], theme };
  res.json({ message: '테마 저장 완료' });
});

router.post('/save-pace', (req, res) => {
  const { pace } = req.body;
  selections[TEMP_USER_ID] = { ...selections[TEMP_USER_ID], pace };
  res.json({ message: '일정 스타일 저장 완료' });
});

// GPT 요청
router.post('/schedule', async (req, res) => {
  const data = selections[TEMP_USER_ID];

  if (!data || !data.city || !data.duration || !data.companion || !data.theme || !data.pace) {
    return res.status(400).json({ error: '선택 정보가 부족합니다.' });
  }

  const prompt = `
너는 여행 플래너야. 아래 조건에 맞는 ${data.duration}간의 ${data.city} 여행 일정을 JSON 형식으로 작성해줘.

- 여행지: ${data.city}
- 여행 기간: ${data.duration}
- 누구와 함께: ${data.companion}
- 선호하는 여행 스타일: ${data.theme}
- 일정 밀도: ${data.pace}

결과는 다음 형식으로 줘:
[
  {
    "day": 1,
    "plan": [
      { "time": "10:00", "place": "○○", "memo": "○○" }
    ]
  }
]
`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const reply = response.data.choices[0].message.content;

    try {
      const parsed = JSON.parse(reply);
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: '응답 파싱 실패', raw: reply });
    }
  } catch (error) {
    res.status(500).json({ error: 'GPT 호출 실패', detail: error.message });
  }
});

module.exports = router;
