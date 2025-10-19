const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/authMiddleware');  // 인증 미들웨어 추가

// ----------------------------------------------------
// 1. 전체 및 카테고리별 게시글 조회 (수정)
// ----------------------------------------------------
router.get('/', async (req, res) => {
    const { category } = req.query; // 쿼리 파라미터에서 category를 받음

    let query = 'SELECT * FROM community';
    const params = [];

    if (category) {
        query += ' WHERE category = ?'; // 카테고리 필터링 추가
        params.push(category);
    }

    query += ' ORDER BY created_at DESC'; // 최신순 정렬 (기본)

    try {
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Community GET error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// 2. 단일 게시글 조회 (미디어 목록 포함하도록 확장 필요)
// ----------------------------------------------------
router.get('/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        // 기본 게시글 정보 조회
        const [postRows] = await pool.query('SELECT * FROM community WHERE post_id = ?', [postId]);
        if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });

        const post = postRows[0];

        // ✅ 다중 이미지 목록 조회 (community_media 테이블 필요)
        const [mediaRows] = await pool.query(
            'SELECT media_url, sort_order FROM community_media WHERE post_id = ? ORDER BY sort_order ASC',
            [postId]
        );

        // 결과에 미디어 목록 추가
        post.media = mediaRows;

        res.json(post);
    } catch (err) {
        console.error("Post Detail GET error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// 3. 게시글 작성 (다중 이미지 처리를 위해 트랜잭션 필요)
// ----------------------------------------------------
router.post('/', auth, async (req, res) => {
    // 클라이언트에서 'image_urls' 배열을 받는다고 가정
    const { post_title, content, category, image_urls } = req.body;
    const user_id = req.user.user_id;

    if (!post_title || !content || !category || !user_id) {
        return res.status(400).json({ error: '제목, 내용, 카테고리는 필수 항목입니다.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. community 테이블에 기본 정보 삽입 (image_url 칼럼은 이미 삭제되었다고 가정)
        const [result] = await connection.query(
            'INSERT INTO community (post_title, user_id, content, category) VALUES (?, ?, ?, ?)',
            [post_title, user_id, content, category]
        );
        const postId = result.insertId;

        // 2. community_media 테이블에 다중 이미지 URL 삽입
        if (Array.isArray(image_urls) && image_urls.length > 0) {
            let sortOrder = 0;
            for (const url of image_urls) {
                await connection.query(
                    'INSERT INTO community_media (post_id, media_url, sort_order) VALUES (?, ?, ?)',
                    [postId, url, sortOrder++]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ post_id: postId, message: '게시글이 성공적으로 등록되었습니다.' });

    } catch (err) {
        await connection.rollback();
        console.error("Post Creation error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// ----------------------------------------------------
// 4. 댓글 작성, 댓글 조회, 좋아요 토글, 좋아요 수 조회 (기존 로직 유지)
// ----------------------------------------------------
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

// ----------------------------------------------------
// 5. 게시글 수정 및 삭제 (404 오류 해결 및 소유권 확인)
// ----------------------------------------------------

// 게시글 수정 (PUT)
router.put('/:id', auth, async (req, res) => {
    const postId = req.params.id;
    const userId = req.user.user_id;
    const { post_title, content, category, image_urls } = req.body;

    if (!post_title || !content || !category) {
        return res.status(400).json({ error: '제목, 내용, 카테고리는 필수 항목입니다.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. 소유권 확인
        const [check] = await connection.query(
            'SELECT user_id FROM community WHERE post_id = ?',
            [postId]
        );
        if (check.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }
        if (check[0].user_id !== userId) {
            await connection.rollback();
            return res.status(403).json({ error: '수정 권한이 없습니다.' });
        }

        // 2. community 테이블 업데이트
        await connection.query(
            'UPDATE community SET post_title = ?, content = ?, category = ? WHERE post_id = ?',
            [post_title, content, category, postId]
        );

        // 3. 기존 미디어 삭제 후 새 미디어 삽입 (다중 이미지 업데이트)
        await connection.query('DELETE FROM community_media WHERE post_id = ?', [postId]);

        if (Array.isArray(image_urls) && image_urls.length > 0) {
            let sortOrder = 0;
            for (const url of image_urls) {
                await connection.query(
                    'INSERT INTO community_media (post_id, media_url, sort_order) VALUES (?, ?, ?)',
                    [postId, url, sortOrder++]
                );
            }
        }

        await connection.commit();
        res.status(200).json({ message: '게시글이 성공적으로 수정되었습니다.' });

    } catch (err) {
        await connection.rollback();
        console.error("Post Update error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});


// 게시글 삭제 (DELETE) - 404 오류 해결
router.delete('/:id', auth, async (req, res) => {
    const postId = req.params.id;
    const userId = req.user.user_id;

    try {
        // 1. 소유권 확인
        const [check] = await pool.query(
            'SELECT user_id FROM community WHERE post_id = ?',
            [postId]
        );
        if (check.length === 0) {
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }
        if (check[0].user_id !== userId) {
            return res.status(403).json({ error: '삭제 권한이 없습니다.' });
        }

        // 2. 게시글 삭제 (ON DELETE CASCADE로 media/comments/likes도 삭제됨)
        //    (주의: community_media에 대한 ON DELETE CASCADE가 DB에 설정되어 있어야 함)
        const [result] = await pool.query(
            'DELETE FROM community WHERE post_id = ?',
            [postId]
        );

        if (result.affectedRows === 0) {
             return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        res.status(200).json({ message: '게시글이 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error("Post Deletion error:", err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;