const db = require('../db');

// 1. 일정 목록 조회 (예정/지난)
exports.getSchedules = async (req, res) => {
    const userId = req.query.user_id;
    const type = req.query.type; // "upcoming" 또는 "past"

    if (!userId) {
        return res.status(400).json({ error: 'user_id is required' });
    }

    let query = 'SELECT * FROM schedules WHERE user_id = ?';
    if (type === 'upcoming') {
        query += ' AND startdate >= CURDATE()';
    } else if (type === 'past') {
        query += ' AND enddate < CURDATE()';
    }

    try {
        const [rows] = await db.query(query, [userId]);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch schedules' });
    }
};

// 2. 일정 상세 조회
exports.getScheduleDetail = async (req, res) => {
    const scheduleId = req.params.id;

    try {
        const [scheduleRows] = await db.query('SELECT * FROM schedules WHERE schedule_id = ?', [scheduleId]);
        const [detailRows] = await db.query('SELECT * FROM plan_details WHERE schedule_id = ?', [scheduleId]);

        if (scheduleRows.length === 0) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        res.json({
            schedule: scheduleRows[0],
            details: detailRows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch schedule details' });
    }
};

// 3. 일정 생성
exports.createSchedule = async (req, res) => {
    const { user_id, title, destination, startdate, enddate, details } = req.body;

    if (!user_id || !title || !destination || !startdate || !enddate || !details) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO schedules (user_id, title, destination, startdate, enddate) VALUES (?, ?, ?, ?, ?)',
            [user_id, title, destination, startdate, enddate]
        );
        const scheduleId = result.insertId;

        for (const detail of details) {
            await connection.query(
                'INSERT INTO plan_details (schedule_id, place, time, memo, day) VALUES (?, ?, ?, ?, ?)',
                [scheduleId, detail.place, detail.time, detail.memo, detail.day]
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'Schedule created successfully', scheduleId });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: 'Failed to create schedule' });
    } finally {
        connection.release();
    }
};
