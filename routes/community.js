const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/authMiddleware');  // 인증 미들웨어 추가

// 전체 게시글 조회
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM community');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 단일 게시글 조회
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM community WHERE post_id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Post not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 게시글 작성 (JWT 기반)
router.post('/', auth, async (req, res) => {
    const { post_title, content, image_url, category } = req.body;
    const user_id = req.user.user_id;  // 토큰에서 추출된 user_id

    try {
        const [result] = await pool.query(
            'INSERT INTO community (post_title, user_id, content, image_url, category) VALUES (?, ?, ?, ?, ?)',
            [post_title, user_id, content, image_url, category]
        );
        res.status(201).json({ post_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 댓글 작성 (JWT 기반)
router.post('/:id/comments', auth, async (req, res) => {
    const { content } = req.body;
    const user_id = req.user.user_id;

    try {
        await pool.query(
            'INSERT INTO comment (post_id, user_id, content) VALUES (?, ?, ?)',
            [req.params.id, user_id, content]
        );
        res.status(201).json({ message: 'Comment added' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 댓글 목록 조회 (정렬 없음)
router.get('/:id/comments', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM comment WHERE post_id = ?',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 좋아요 누르기/취소 토글
router.post('/:id/like', auth, async (req, res) => {
    const post_id = req.params.id;
    const user_id = req.user.user_id;

    try {
        // 좋아요 여부 확인
        const [rows] = await pool.query(
            'SELECT * FROM community_like WHERE post_id = ? AND user_id = ?',
            [post_id, user_id]
        );

        if (rows.length > 0) {
            // 이미 좋아요 → 취소 처리
            await pool.query(
                'DELETE FROM community_like WHERE post_id = ? AND user_id = ?',
                [post_id, user_id]
            );
            return res.json({ message: '좋아요 취소됨' });
        } else {
            // 좋아요 추가
            await pool.query(
                'INSERT INTO community_like (post_id, user_id, created_at) VALUES (?, ?, NOW())',
                [post_id, user_id]
            );
            return res.json({ message: '좋아요 추가됨' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 게시글 별 좋아요 수 조회
router.get('/:id/likes', async (req, res) => {
    const post_id = req.params.id;
    try {
        const [rows] = await pool.query(
            'SELECT COUNT(*) AS likeCount FROM community_like WHERE post_id = ?',
            [post_id]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
