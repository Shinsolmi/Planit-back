const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
    const { type, country } = req.query;

    try {
        const [rows] = await db.query(
            `SELECT * FROM transportation
       WHERE transport_type = ? AND country = ?`,
            [type, country]
        );
        res.json(rows);
    } catch (err) {
        console.error('DB Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
