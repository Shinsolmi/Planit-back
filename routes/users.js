const express = require('express');
const router = express.Router();
const db = require('../db');
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 3c81fba (fix: remove .env)
const usersController = require('../controllers/usersController');
const auth = require('../middleware/authMiddleware');


router.post('/register', usersController.register); // 회원가입
router.post('/login', usersController.login);
router.get('/me', auth, usersController.getMyPage);
router.get('/me/saved-restaurants', auth, usersController.getSavedRestaurants);
router.get('/me/saved-tips', auth, usersController.getSavedTips);

<<<<<<< HEAD
=======
>>>>>>> 9dab7d0 (Initial commit - PLANit server)
=======
>>>>>>> 3c81fba (fix: remove .env)

// 사용자 전체 조회
router.get('/', async (req, res) => {
    const [rows] = await db.query('SELECT * FROM users');
    res.json(rows);
});

// 사용자 등록
router.post('/', async (req, res) => {
    const { user_name, email, password } = req.body;
    const [result] = await db.query(
        'INSERT INTO users (user_name, email, password) VALUES (?, ?, ?)',
        [user_name, email, password]
    );
    res.json({ id: result.insertId, user_name, email });
});

module.exports = router;
