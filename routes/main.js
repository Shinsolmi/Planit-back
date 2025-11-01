const express = require('express');
const router = express.Router();
const db = require('../db');

// 날짜 포맷 함수
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
}

router.get('/summary', async (req, res) => {
    try {
        // ✅ 인기 게시글 쿼리 수정: media_url을 서브쿼리로 가져와 추가
        const [rawPosts] = await db.query(`
            SELECT
                c.post_id,
                c.post_title,
                c.category,
                c.created_at,
                c.user_id,
                u.user_name,
                COUNT(cl.like_id) AS like_count,
                (SELECT media_url FROM community_media cm WHERE cm.post_id = c.post_id ORDER BY sort_order ASC LIMIT 1) AS media_url /* ⬅️ 이 부분이 추가되었습니다 */
            FROM community c
            JOIN users u ON c.user_id = u.user_id
            LEFT JOIN community_like cl ON c.post_id = cl.post_id
            GROUP BY c.post_id, c.post_title, c.category, c.created_at, c.user_id, u.user_name, media_url
            ORDER BY like_count DESC
            LIMIT 5
        `);

        const popularPosts = rawPosts.map(post => ({
            ...post,
            created_at: formatDate(post.created_at) // ✅ 날짜 포맷
        }));

        // 최신 팁 쿼리 (SQL 오류 해결 버전 유지)
        const [rawTips] = await db.query(`
            SELECT id, country, transport_type, title, content
            FROM transportation
            ORDER BY id DESC
            LIMIT 5
        `);

        const recentTips = rawTips.map(tip => ({
            ...tip,
            // created_at 필드는 DB에 없으므로 포맷팅은 생략
        }));

        res.json({
            popularPosts,
            recentTips
        });
    } catch (err) {
        console.error('Failed to load summary data:', err);
        res.status(500).json({ error: 'Failed to load summary data' });
    }
});

module.exports = router;