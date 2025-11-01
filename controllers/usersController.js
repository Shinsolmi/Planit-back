const db = require('../db');
const jwt = require('jsonwebtoken');

//회원가입
exports.register = async (req, res) => {
    const { user_name, email, password } = req.body;

    if (!user_name || !email || !password) {
        return res.status(400).json({ error: '모든 항목을 입력해주세요.' });
    }

    try {
        // 이메일 중복 확인
        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
        }

        // 유저 저장
        const [result] = await db.query(
            'INSERT INTO users (user_name, email, password) VALUES (?, ?, ?)',
            [user_name, email, password]
        );

        // JWT 발급 (선택사항)
        const token = jwt.sign(
            { user_id: result.insertId, email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        res.status(201).json({
            message: '회원가입 성공',
            token,
            user: {
                user_id: result.insertId,
                user_name,
                email
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
    }
};

//로그인
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const [rows] = await db.query(
            'SELECT user_id, user_name, email, password FROM users WHERE email = ?',
            [email]
        );

        if (rows.length === 0 || rows[0].password !== password) {
            return res.status(401).json({ error: '이메일 또는 비밀번호가 틀렸습니다' });
        }

        const user = rows[0];

        // JWT 토큰 생성
        const token = jwt.sign(
            { user_id: user.user_id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        res.json({
            message: '로그인 성공',
            token,
            user: {
                user_id: user.user_id,
                user_name: user.user_name,
                email: user.email
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다' });
    }
};

//내 정보 조회
exports.getMyPage = async (req, res) => {
    const userId = req.user.user_id;

    try {
        const [rows] = await db.query(
            'SELECT user_id, user_name, email FROM users WHERE user_id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load user info' });
    }
};

//찜한 식당 조회
exports.getSavedRestaurants = async (req, res) => {
    const userId = req.user.user_id;

    try {
        const [rows] = await db.query(
            `SELECT r.id, r.name, r.city, r.category, r.description, r.image_url, sr.saved_at
       FROM saved_restaurant sr
       JOIN restaurant r ON sr.restaurant_id = r.id
       WHERE sr.user_id = ?
       ORDER BY sr.saved_at DESC`,
            [userId]
        );

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch saved restaurants' });
    }
};

// ✅ 교통팁 저장 및 저장 취소 (토글)
exports.saveTip = async (req, res) => {
    const userId = req.user.user_id; // JWT에서 추출
    const { tip_id } = req.body;     // 저장할 팁 ID (클라이언트에서 POST 요청으로 전달)

    if (!tip_id) {
        return res.status(400).json({ error: 'tip_id is required' });
    }

    try {
        // 1. 이미 저장되어 있는지 확인
        const [rows] = await db.query(
            'SELECT * FROM saved_tip WHERE user_id = ? AND tip_id = ?',
            [userId, tip_id]
        );

        if (rows.length > 0) {
            // 2. 이미 저장되어 있으면 삭제 (저장 취소)
            await db.query(
                'DELETE FROM saved_tip WHERE user_id = ? AND tip_id = ?',
                [userId, tip_id]
            );
            return res.json({ message: 'Tip unsaved', saved: false });
        } else {
            // 3. 저장되어 있지 않으면 추가 (저장)
            await db.query(
                'INSERT INTO saved_tip (user_id, tip_id, saved_at) VALUES (?, ?, NOW())',
                [userId, tip_id]
            );
            return res.json({ message: 'Tip saved', saved: true });
        }
    } catch (error) {
        console.error('Save Tip Error:', error);
        res.status(500).json({ error: 'Failed to process tip save/unsave' });
    }
};
