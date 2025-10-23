// community.js (수정된 코드 전문)

const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/authMiddleware'); // 인증 미들웨어 추가
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ----------------------------------------------------
// Multer 설정 (기존 코드 유지)
// ----------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'community');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB 제한
}).array('images', 5);


// ----------------------------------------------------
// 1. 전체 및 카테고리별 게시글 조회 (수정)
// ----------------------------------------------------
router.get('/', async (req, res) => {
    const { category } = req.query;

    let query = 'SELECT * FROM community';
    const params = [];

    if (category && category !== '전체') {
        query += ' WHERE category = ?';
        params.push(category);
    }

    query += ' ORDER BY created_at DESC';

    try {
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Community GET error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// 2. 단일 게시글 조회 (미디어 목록 포함하도록 확장)
// ----------------------------------------------------
router.get('/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        // 기본 게시글 정보 조회
        const [postRows] = await pool.query(
            'SELECT c.*, u.user_name FROM community c JOIN users u ON c.user_id = u.user_id WHERE post_id = ?',
            [postId]
        );
        if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });

        const post = postRows[0];

        // 다중 이미지 목록 조회 (community_media 테이블 조인)
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
// 3. 게시글 작성 (POST /community) - Multi-Part 처리 (기존 로직 유지)
// ----------------------------------------------------
router.post('/', auth, (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error("Multer upload error:", err);
            return res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.', detail: err.message });
        }

        const { post_title, content, category } = req.body;
        const user_id = req.user.user_id;
        const files = req.files || [];

        if (!post_title || !content || !category || !user_id) {
            files.forEach(file => fs.unlinkSync(file.path));
            return res.status(400).json({ error: '제목, 내용, 카테고리는 필수 항목입니다.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.query(
                'INSERT INTO community (post_title, user_id, content, category) VALUES (?, ?, ?, ?)',
                [post_title, user_id, content, category]
            );
            const postId = result.insertId;

            let sortOrder = 0;
            for (const file of files) {
                const mediaUrl = `uploads/community/${file.filename}`;
                await connection.query(
                    'INSERT INTO community_media (post_id, media_url, sort_order) VALUES (?, ?, ?)',
                    [postId, mediaUrl, sortOrder++]
                );
            }

            await connection.commit();
            res.status(201).json({ post_id: postId, message: '게시글이 성공적으로 등록되었습니다.', mediaCount: files.length });

        } catch (dbErr) {
            await connection.rollback();
            files.forEach(file => fs.unlinkSync(file.path));
            console.error("Post Creation DB error:", dbErr);
            res.status(500).json({ error: '게시글 DB 저장 중 오류가 발생했습니다.' });
        } finally {
            connection.release();
        }
    });
});


// ----------------------------------------------------
// 4. 댓글 작성 및 조회 (기존 로직 유지)
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
            // ✅ 댓글 작성자의 user_id도 함께 조회해야 프론트에서 소유권 확인 가능
            'SELECT c.*, u.user_name FROM comment c JOIN users u ON c.user_id = u.user_id WHERE post_id = ? ORDER BY c.created_at ASC',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// 5. ✅ 댓글 수정 및 삭제 라우터 (404 오류 해결)
// ----------------------------------------------------

// 댓글 수정 (PUT /community/comments/:id)
router.put('/comments/:id', auth, async (req, res) => {
    const commentId = req.params.id;
    const userId = req.user.user_id;
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ error: '댓글 내용은 필수입니다.' });
    }

    try {
        // 1. 소유권 확인
        const [check] = await pool.query(
            'SELECT user_id FROM comment WHERE comment_id = ?',
            [commentId]
        );
        if (check.length === 0) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        if (check[0].user_id !== userId) {
            return res.status(403).json({ error: '수정 권한이 없습니다.' });
        }

        // 2. 댓글 업데이트
        await pool.query(
            'UPDATE comment SET content = ?, updated_at = NOW() WHERE comment_id = ?',
            [content, commentId]
        );
        res.status(200).json({ message: '댓글이 성공적으로 수정되었습니다.' });

    } catch (err) {
        console.error("Comment Update error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 댓글 삭제 (DELETE /community/comments/:id)
router.delete('/comments/:id', auth, async (req, res) => {
    const commentId = req.params.id;
    const userId = req.user.user_id;

    try {
        // 1. 소유권 확인
        const [check] = await pool.query(
            'SELECT user_id FROM comment WHERE comment_id = ?',
            [commentId]
        );
        if (check.length === 0) {
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }
        if (check[0].user_id !== userId) {
            return res.status(403).json({ error: '삭제 권한이 없습니다.' });
        }

        // 2. 댓글 삭제
        await pool.query('DELETE FROM comment WHERE comment_id = ?', [commentId]);
        res.status(200).json({ message: '댓글이 성공적으로 삭제되었습니다.' });

    } catch (err) {
        console.error("Comment Deletion error:", err);
        res.status(500).json({ error: err.message });
    }
});


// ----------------------------------------------------
// 6. 게시글 수정 및 삭제 (기존 로직 유지)
// ----------------------------------------------------

// 게시글 수정 (PUT)
router.put('/:id', auth, (req, res) => {
    upload(req, res, async (err) => { // 파일 처리를 위해 upload 미들웨어 사용
        if (err) { return res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.', detail: err.message }); }

        const postId = req.params.id;
        const userId = req.user.user_id;
        const { post_title, content, category, existing_media_urls } = req.body;
        const newFiles = req.files || [];

        if (!post_title || !content || !category) {
            newFiles.forEach(file => fs.unlinkSync(file.path));
            return res.status(400).json({ error: '제목, 내용, 카테고리는 필수 항목입니다.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. 소유권 확인
            const [check] = await connection.query('SELECT user_id FROM community WHERE post_id = ?', [postId]);
            if (check.length === 0) { await connection.rollback(); return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' }); }
            if (check[0].user_id !== userId) { await connection.rollback(); return res.status(403).json({ error: '수정 권한이 없습니다.' }); }

            // 2. community 테이블 업데이트
            await connection.query(
                'UPDATE community SET post_title = ?, content = ?, category = ? WHERE post_id = ?',
                [post_title, content, category, postId]
            );

            // 3. 기존 미디어 삭제 (community_media 테이블 정리)
            await connection.query('DELETE FROM community_media WHERE post_id = ?', [postId]);

            // 4. 새 미디어 목록 구성 및 삽입 (기존 URL + 새로 업로드된 파일)
            let sortOrder = 0;
            const existingUrls = Array.isArray(existing_media_urls) ? existing_media_urls : (existing_media_urls ? [existing_media_urls] : []);

            for (const url of existingUrls) {
                await connection.query(
                    'INSERT INTO community_media (post_id, media_url, sort_order) VALUES (?, ?, ?)',
                    [postId, url, sortOrder++]
                );
            }

            for (const file of newFiles) {
                const mediaUrl = `uploads/community/${file.filename}`;
                 await connection.query(
                    'INSERT INTO community_media (post_id, media_url, sort_order) VALUES (?, ?, ?)',
                    [postId, mediaUrl, sortOrder++]
                );
            }

            await connection.commit();
            res.status(200).json({ message: '게시글이 성공적으로 수정되었습니다.' });

        } catch (dbErr) {
            await connection.rollback();
            newFiles.forEach(file => fs.unlinkSync(file.path));
            console.error("Post Update DB error:", dbErr);
            res.status(500).json({ error: '게시글 DB 수정 중 오류가 발생했습니다.' });
        } finally {
            connection.release();
        }
    });
});


// 게시글 삭제 (DELETE)
router.delete('/:id', auth, async (req, res) => {
    const postId = req.params.id;
    const userId = req.user.user_id;

    try {
        // 1. 소유권 확인
        const [check] = await pool.query(
            'SELECT user_id FROM community WHERE post_id = ?',
            [postId]
        );
        if (check.length === 0) { return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' }); }
        if (check[0].user_id !== userId) { return res.status(403).json({ error: '삭제 권한이 없습니다.' }); }

        // 2. 게시글 삭제 (DB 외래키 ON DELETE CASCADE 설정 필요)
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


// ----------------------------------------------------
// 7. 좋아요 등 기타 기능 (기존 로직 유지)
// ----------------------------------------------------

router.post('/:id/like', auth, async (req, res) => {
    const post_id = req.params.id;
    const user_id = req.user.user_id;

    try {
        const [rows] = await pool.query(
            'SELECT * FROM community_like WHERE post_id = ? AND user_id = ?',
            [post_id, user_id]
        );

        if (rows.length > 0) {
            await pool.query(
                'DELETE FROM community_like WHERE post_id = ? AND user_id = ?',
                [post_id, user_id]
            );
            return res.json({ message: '좋아요 취소됨' });
        } else {
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


module.exports = router;