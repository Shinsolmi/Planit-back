const express = require('express');
const router = express.Router();
const controller = require('../controllers/schedulesController');

router.get('/', controller.getSchedules);
router.get('/:id', controller.getScheduleDetail);
router.post('/', controller.createSchedule);
router.put('/:id', controller.updateSchedule);
router.put('/details/:detail_id', controller.updateScheduleDetail);
router.delete('/details/:detail_id', controller.deleteScheduleDetail);
router.delete('/:id', controller.deleteSchedule);
router.put('/:id/full', controller.updateScheduleWithDetails);

module.exports = router;
