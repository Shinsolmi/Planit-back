const express = require('express');
const router = express.Router();
const db = require('../db');

// 날짜 포맷 함수
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
}

router.get('/summary', async (req, res) => {
    try {
        // 인기 게시글
        const [rawPosts] = await db.query(`
            SELECT
                c.post_id,
                c.post_title,
                c.category,
                c.created_at,
                u.user_name,
                COUNT(cl.like_id) AS like_count
            FROM community c
            JOIN users u ON c.user_id = u.user_id
            LEFT JOIN community_like cl ON c.post_id = cl.post_id
            GROUP BY c.post_id
            ORDER BY like_count DESC
            LIMIT 5
        `);

        const popularPosts = rawPosts.map(post => ({
            ...post,
            created_at: formatDate(post.created_at)
        }));

        // 최신 팁
        const [rawTips] = await db.query(`
            SELECT id, country, transport_type, title, content, created_at
            FROM transportation
            ORDER BY id DESC
            LIMIT 5
        `);

        const recentTips = rawTips.map(tip => ({
            ...tip,
            created_at: formatDate(tip.created_at)
        }));

        res.json({
            popularPosts,
            recentTips
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load summary data' });
    }
});

module.exports = router;
