const db = require('../db');

// 일정 목록 조회
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

// 로그인된 사용자의 일정 목록 조회
exports.getMySchedules = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const [schedules] = await db.query(
      'SELECT * FROM schedules WHERE user_id = ? ORDER BY startdate ASC',
      [userId]
    );

    for (const schedule of schedules) {
      const [detailsRows] = await db.query(
        'SELECT * FROM plan_details WHERE schedule_id = ? ORDER BY day ASC, time ASC',
        [schedule.schedule_id]
      );

      const grouped = {};
      for (const row of detailsRows) {
        if (!grouped[row.day]) grouped[row.day] = [];
        grouped[row.day].push({
          place: row.place,
          time: row.time,
          memo: row.memo,
        });
      }

      schedule.details = Object.entries(grouped).map(([day, plan]) => ({
        day: parseInt(day),
        plan,
      }));
    }

    res.json(schedules);
  } catch (error) {
    console.error('getMySchedules 에러:', error);
    res.status(500).json({ error: '내 일정 조회 실패' });
  }
};

// 일정 + 일정상세 조회 (내 일정만 가능)
exports.getScheduleDetail = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'invalid id' });
    }

    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    // 1) 일정 본문
    let schedule;
    try {
      const [rows] = await db.query(
        'SELECT * FROM schedules WHERE schedule_id = ? AND user_id = ?',
        [id, userId]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      schedule = rows[0];
    } catch (e) {
      console.error('[getScheduleDetail] schedule query failed:', e);
      return res.status(500).json({ error: 'INTERNAL_SCHEDULE_QUERY' });
    }

    // 2) details 컬럼(JSON 문자열일 수 있음) 파싱 시도
    let detailsFromColumn = [];
    if (typeof schedule.details === 'string') {
      try {
        detailsFromColumn = JSON.parse(schedule.details);
      } catch (e) {
        console.warn('[getScheduleDetail] JSON parse failed (details column):', e);
      }
    } else if (Array.isArray(schedule.details)) {
      detailsFromColumn = schedule.details;
    }

    // 3) 상세 테이블에서 가져오되, 실패 시 컬럼 기반으로 fallback
    try {
      const [detailRows] = await db.query(
        `SELECT day, time, place, memo
           FROM schedule_details
          WHERE schedule_id = ?
          ORDER BY day ASC, time ASC`,
        [id]
      );

      // day별 그룹핑
      const grouped = {};
      for (const r of (detailRows || [])) {
        if (!grouped[r.day]) grouped[r.day] = [];
        grouped[r.day].push({ time: r.time, place: r.place, memo: r.memo });
      }
      const details = Object.entries(grouped)
        .map(([day, plan]) => ({ day: parseInt(day, 10), plan }))
        .sort((a, b) => a.day - b.day);

      return res.json({
        schedule,
        details: details.length ? details : detailsFromColumn, // 테이블 비어있으면 컬럼 사용
      });
    } catch (e) {
      // 테이블이 없거나 컬럼이 다른 경우 여기로 옴 → 컬럼 기반으로라도 응답
      console.warn('[getScheduleDetail] detailRows query failed, fallback to column:', e && (e.code || e.message));
      return res.json({
        schedule,
        details: detailsFromColumn, // 최소한 이건 내려주기
      });
    }
  } catch (error) {
    console.error('[getScheduleDetail] fatal error:', error);
    return res.status(500).json({ error: 'INTERNAL' });
  }
};


// 일정 생성
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

// 일정 수정
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

// 상세일정 수정
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

// 상세일정 삭제
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

// 일정 + 상세일정 전체 삭제 (내 일정만 가능)
exports.deleteSchedule = async (req, res) => {
    const scheduleId = req.params.id;
    const userId = req.user.user_id;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

    // 본인 일정인지 확인
        const [check] = await connection.query(
          'SELECT * FROM schedules WHERE schedule_id = ? AND user_id = ?',
          [scheduleId, userId]
        );
        if (check.length === 0) {
          await connection.rollback();
          return res.status(403).json({ error: '삭제 권한이 없습니다.' });
        }

        await connection.query('DELETE FROM plan_details WHERE schedule_id = ?', [scheduleId]);
        await connection.query('DELETE FROM schedules WHERE schedule_id = ?', [scheduleId]);

        await connection.commit();
        res.json({ message: '일정 및 상세일정 삭제 완료' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: '일정 삭제 실패' });
    } finally {
        connection.release();
    }
};

// 일정 + 상세일정 일괄 수정 (내 일정만 가능)
exports.updateScheduleWithDetails = async (req, res) => {
    const scheduleId = req.params.id;
    const userId = req.user.user_id;
    const { title, destination, startdate, enddate, details } = req.body;

    if (!title || !destination || !startdate || !enddate || !Array.isArray(details)) {
        return res.status(400).json({ error: 'Missing or invalid fields' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 본인 일정인지 확인
        const [check] = await connection.query(
          'SELECT * FROM schedules WHERE schedule_id = ? AND user_id = ?',
          [scheduleId, userId]
        );
        if (check.length === 0) {
          await connection.rollback();
          return res.status(403).json({ error: '수정 권한이 없습니다.' });
        }

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
        res.json({ message: '일정 및 상세일정 수정 완료' });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: '일정 수정 실패' });
    } finally {
        connection.release();
    }
};

//gpt에게서 가져온 스케줄 저장
exports.saveGPTSchedule = async (req, res) => {
    const user_id = req.user.user_id;  // JWT에서 자동 추출
    const { title, destination, startdate, enddate, details } = req.body;

  if (!details) {
    return res.status(400).json({ error: '필수 항목 누락됨' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 기본값 설정
    const scheduleTitle = title || 'GPT 추천 일정';
    const scheduleDestination = destination || details[0]?.place || '일본';
    const today = new Date().toISOString().split('T')[0];
    const scheduleStart = startdate || today;
    const scheduleEnd = enddate || today;

    // schedules 삽입
    const [scheduleResult] = await connection.query(
      `INSERT INTO schedules (user_id, title, destination, startdate, enddate)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, scheduleTitle, scheduleDestination, scheduleStart, scheduleEnd]
    );
    const scheduleId = scheduleResult.insertId;

    // 2. plan_details 삽입
    for (const dayBlock of details) {
      const day = dayBlock.day;
      if (!Array.isArray(dayBlock.plan)) continue;

      for (const item of dayBlock.plan) {
        const { place, time, memo } = item;
        if (!place || !time || !day) continue;

        await connection.query(
          `INSERT INTO plan_details (schedule_id, place, time, memo, day)
           VALUES (?, ?, ?, ?, ?)`,
          [scheduleId, place, time, memo || '', day]
        );
      }
    }


    await connection.commit();
    res.status(201).json({ message: 'GPT 일정 저장 성공', scheduleId });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'DB 저장 실패' });
  } finally {
    connection.release();
  }
};