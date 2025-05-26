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

// 4. 일정 수정
exports.updateSchedule = async (req, res) => {
    const scheduleId = req.params.id;
    const { title, destination, startdate, enddate } = req.body;

    if (!title || !destination || !startdate || !enddate) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await db.query(
            'UPDATE schedules SET title = ?, destination = ?, startdate = ?, enddate = ? WHERE schedule_id = ?',
            [title, destination, startdate, enddate, scheduleId]
        );
        res.json({ message: 'Schedule updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update schedule' });
    }
};

// 5. 상세일정 수정
exports.updateScheduleDetail = async (req, res) => {
    const detailId = req.params.detail_id;
    const { place, time, memo, day } = req.body;

    if (!place || !time || !day) {
        return res.status(400).json({ error: 'place, time, and day are required' });
    }

    try {
        await db.query(
            'UPDATE plan_details SET place = ?, time = ?, memo = ?, day = ? WHERE detail_id = ?',
            [place, time, memo || '', day, detailId]
        );
        res.json({ message: 'Schedule detail updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update schedule detail' });
    }
};

// 6. 상세일정 삭제
exports.deleteScheduleDetail = async (req, res) => {
    const detailId = req.params.detail_id;

    try {
        await db.query('DELETE FROM plan_details WHERE detail_id = ?', [detailId]);
        res.json({ message: 'Schedule detail deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete schedule detail' });
    }
};

// 7. 일정 + 상세일정 전체 삭제
exports.deleteSchedule = async (req, res) => {
    const scheduleId = req.params.id;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await connection.query('DELETE FROM plan_details WHERE schedule_id = ?', [scheduleId]);
        await connection.query('DELETE FROM schedules WHERE schedule_id = ?', [scheduleId]);

        await connection.commit();
        res.json({ message: 'Schedule and its details deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: 'Failed to delete schedule' });
    } finally {
        connection.release();
    }
};

// 8. 일정 + 상세일정 일괄 수정
exports.updateScheduleWithDetails = async (req, res) => {
    const scheduleId = req.params.id;
    const { title, destination, startdate, enddate, details } = req.body;

    if (!title || !destination || !startdate || !enddate || !Array.isArray(details)) {
        return res.status(400).json({ error: 'Missing or invalid fields' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 일정 수정
        await connection.query(
            'UPDATE schedules SET title = ?, destination = ?, startdate = ?, enddate = ? WHERE schedule_id = ?',
            [title, destination, startdate, enddate, scheduleId]
        );

        // 기존 상세일정 삭제 후 재삽입
        await connection.query('DELETE FROM plan_details WHERE schedule_id = ?', [scheduleId]);

        for (const detail of details) {
            await connection.query(
                'INSERT INTO plan_details (schedule_id, place, time, memo, day) VALUES (?, ?, ?, ?, ?)',
                [scheduleId, detail.place, detail.time, detail.memo || '', detail.day]
            );
        }

        await connection.commit();
        res.json({ message: 'Schedule and details updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: 'Failed to update schedule and details' });
    } finally {
        connection.release();
    }
};
