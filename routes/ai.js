const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();

router.post('/generate-plan', async (req, res) => {
  const { city, duration, companions, style, pace } = req.body;

const companionsText = companions.join(', ');
const styleText = style.join(', ');

const prompt = `
너는 여행 플래너야. 아래 조건에 맞는 ${duration}일간의 ${city} 여행 일정을 JSON 형식으로 작성해줘.

- 여행지: ${city}
- 여행 기간: ${duration}일
- 누구와 함께: ${companionsText}
- 선호하는 여행 스타일: ${styleText}
- 일정 밀도: ${pace}

결과는 다음 JSON 형식으로 줘:
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

    // JSON 응답 파싱 (try-catch로 감싸면 안전)
    let parsed;
    try {
      parsed = JSON.parse(reply);
    } catch (err) {
      return res.status(500).json({ error: 'GPT 응답 JSON 파싱 실패', raw: reply });
    }

    res.json(parsed);
  } catch (error) {
    console.error('GPT 호출 오류:', error.response?.data || error.message);
    res.status(500).json({ error: 'GPT 요청 실패' });
  }
});

module.exports = router;
