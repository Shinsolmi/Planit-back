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
    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId)) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

    // 1) 일정 메타
    const [scheduleRows] = await db.query(
      'SELECT * FROM schedules WHERE schedule_id = ? AND user_id = ?',
      [scheduleId, userId]
    );
    if (!scheduleRows?.length) return res.status(404).json({ error: 'NOT_FOUND' });
    const schedule = scheduleRows[0];

    // 2) 상세: plan_details 기준
    const [detailRows] = await db.query(
      `SELECT day, time, place, memo
         FROM plan_details
        WHERE schedule_id = ?
        ORDER BY day ASC, time ASC`,
      [scheduleId]
    );

    // day별 그룹
    const grouped = {};
    for (const r of detailRows || []) {
      if (!grouped[r.day]) grouped[r.day] = [];
      grouped[r.day].push({ time: r.time ?? '', place: r.place ?? '', memo: r.memo ?? '' });
    }
    let details = Object.entries(grouped)
      .map(([day, plan]) => ({ day: parseInt(day, 10), plan }))
      .sort((a, b) => a.day - b.day);

    // 3) 폴백: schedules.details(JSON) 사용
    if (!details.length && typeof schedule.details === 'string') {
      try { details = JSON.parse(schedule.details); } catch (_) {}
    }

    return res.json({ schedule, details });
  } catch (e) {
    console.error('getScheduleDetail error:', e);
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
// controllers/schedulesController.js

exports.updateScheduleWithDetails = async (req, res) => {
  const scheduleId = req.params.id;

  // ✅ 인증 누락 500 방지
  if (!req.user || !req.user.user_id) {
    return res.status(401).json({ error: '인증 필요(토큰 누락/무효)' });
  }
  const userId = req.user.user_id;

  const { title, destination, startdate, enddate, details } = req.body;

  // ✅ 바디 유효성 검사 (서버에서 한 번 더)
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

    // 일정 메타 업데이트
    await connection.query(
      'UPDATE schedules SET title = ?, destination = ?, startdate = ?, enddate = ? WHERE schedule_id = ?',
      [title, destination, startdate, enddate, scheduleId]
    );

    // 기존 상세 삭제
    await connection.query('DELETE FROM plan_details WHERE schedule_id = ?', [scheduleId]);

    // ✅ details 정규화 & 삽입 (NULL/빈값 방어)
    const incoming = Array.isArray(details) ? details : [];
    for (const dayBlock of incoming) {
      const dayNum = Number(dayBlock?.day);
      if (!Number.isFinite(dayNum)) continue; // day가 숫자여야 함

      const plan = Array.isArray(dayBlock?.plan) ? dayBlock.plan : [];
      for (const item of plan) {
        const rawPlace = (item?.place ?? '').toString().trim();
        const rawTime  = (item?.time  ?? '').toString().trim();
        const memo     = (item?.memo  ?? '').toString();

        // ✅ 필수값 검증: place/time 둘 다 있어야 삽입
        if (!rawPlace || !rawTime) continue;

        // ✅ TIME 형식 보정: HH:mm → HH:mm:ss
        const time = /^\d{1,2}:\d{2}$/.test(rawTime) ? `${rawTime}:00` : rawTime;

        // ✅ 최종 삽입
        await connection.query(
          'INSERT INTO plan_details (schedule_id, place, time, memo, day) VALUES (?, ?, ?, ?, ?)',
          [scheduleId, rawPlace, time, memo, dayNum]
        );
      }
    }

    await connection.commit();
    return res.json({ message: '일정 및 상세일정 수정 완료' });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    return res.status(500).json({ error: '일정 수정 실패' });
  } finally {
    connection.release();
  }
};

//gpt에게서 가져온 스케줄 저장
exports.saveGPTSchedule = async (req, res) => {
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

  const { title, destination, startdate, enddate, details, duration } = req.body || {};
  const blocks = Array.isArray(details) ? details : [];

  // 1) 기간 계산
  const daysFromBody = Number(duration);                  // 프론트에서 숫자(일수)로 보내면 최우선
  const daysFromDetails = blocks.length || undefined;     // details day 수
  const days = daysFromBody && daysFromBody > 0
    ? daysFromBody
    : (daysFromDetails && daysFromDetails > 0 ? daysFromDetails : 1);

  // 2) 날짜 보정 (DATE 컬럼이므로 YYYY-MM-DD로 저장)
  const toYMD = (d) => {
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    const pad = (n)=> String(n).padStart(2,'0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
  };
  const today = new Date();
  const startYMD = toYMD(startdate) || toYMD(today);
  const endDt = new Date(startYMD);
  endDt.setDate(endDt.getDate() + (days - 1));
  const endYMD = toYMD(endDt);

  // 3) 기본값
  const firstPlace = blocks?.[0]?.plan?.[0]?.place;
  const scheduleTitle = title || 'GPT 추천 일정';
  const scheduleDestination = destination || firstPlace || '일본';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 4) schedules INSERT (DATE 컬럼에 YYYY-MM-DD)
    const [r] = await conn.query(
      `INSERT INTO schedules (user_id, title, destination, startdate, enddate)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, scheduleTitle, scheduleDestination, startYMD, endYMD]
    );
    const scheduleId = r.insertId;

    // 5) 상세 저장 (plan_details, TIME 보정)
    const toTime = (t) => {
      if (!t) return null;
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(t).trim());
      if (!m) return null;
      const hh = m[1].padStart(2,'0');
      const mm = m[2].padStart(2,'0');
      const ss = (m[3] || '00').padStart(2,'0');
      return `${hh}:${mm}:${ss}`;
    };

    for (const block of blocks) {
      const day = Number(block?.day);
      if (!Number.isInteger(day) || !Array.isArray(block?.plan)) continue;

      for (const it of block.plan) {
        const place = (it?.place ?? '').toString().trim();
        const timeStr = toTime(it?.time);
        const memo = (it?.memo ?? '').toString().trim();
        // place 필수, time은 NULL 허용(TIME 컬럼이 NULL 허용이면) — 스키마에 맞게 조정
        if (!place) continue;

        await conn.query(
          `INSERT INTO plan_details (schedule_id, place, memo, time, day)
           VALUES (?, ?, ?, ?, ?)`,
          [scheduleId, place, memo || null, timeStr, day]
        );
      }
    }

    await conn.commit();
    return res.status(201).json({ message: 'GPT 일정 저장 성공', scheduleId });
  } catch (err) {
    await conn.rollback();
    console.error('[saveGPTSchedule] code=', err.code, ' msg=', err.sqlMessage, ' sql=', err.sql);
    return res.status(500).json({ error: 'DB 저장 실패' });
  } finally {
    conn.release();
  }
};
