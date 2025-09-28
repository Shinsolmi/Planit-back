// tips.js
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
    const { type, country } = req.query;

    if (!type || !country) {
        return res.status(400).json({ error: 'transport_type and country are required' });
    }

    try {
        // ✅ 팁 본문과 미디어를 LEFT JOIN하여 모두 가져오는 쿼리
        const [rows] = await db.query(
            `SELECT 
                t.id, t.country, t.transport_type, t.title, t.content, t.details, 
                tm.media_type, tm.media_url, tm.caption, tm.sort_order
            FROM transportation t
            LEFT JOIN transportation_media tm ON t.id = tm.tip_id
            WHERE t.transport_type = ? AND t.country = ?
            ORDER BY t.id ASC, tm.sort_order ASC`,
            [type, country]
        );

        // ✅ 데이터 그룹화: 팁 ID를 기준으로 미디어 목록을 배열로 묶기
        const tipsMap = new Map();

        for (const row of rows) {
            const tipId = row.id;
            if (!tipsMap.has(tipId)) {
                // 새로운 팁 레코드 초기화
                tipsMap.set(tipId, {
                    id: row.id,
                    country: row.country,
                    transport_type: row.transport_type,
                    title: row.title,
                    content: row.content,
                    details: row.details,
                    media: [] // 미디어 목록을 담을 배열 초기화
                });
            }

            // 미디어 정보가 있을 경우에만 'media' 배열에 추가
            if (row.media_url) {
                tipsMap.get(tipId).media.push({
                    media_type: row.media_type,
                    media_url: row.media_url,
                    caption: row.caption,
                    sort_order: row.sort_order
                });
            }
        }

        // Map의 값을 배열로 변환하여 최종 응답
        res.json(Array.from(tipsMap.values()));

    } catch (err) {
        console.error('DB Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;