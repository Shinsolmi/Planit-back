const express = require('express');
const router = express.Router();
const db = require('../db');

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
