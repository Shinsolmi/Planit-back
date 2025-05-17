const express = require('express');
const router = express.Router();
const controller = require('../controllers/schedulesController');

router.get('/', controller.getSchedules); // 리스트
router.get('/:id', controller.getScheduleDetail); // 상세
router.post('/', controller.createSchedule); // 생성

module.exports = router;
