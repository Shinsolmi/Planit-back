const express = require('express');
const router = express.Router();
const controller = require('../controllers/schedulesController');
const auth = require('../middleware/authMiddleware');

router.post('/save-gpt', auth, controller.saveGPTSchedule);
router.post('/', auth, controller.createSchedule);

router.get('/me', auth, controller.getMySchedules);
router.get('/', controller.getSchedules);
router.get('/:id', auth, controller.getScheduleDetail);                       //보호

router.put('/:id', controller.updateSchedule);
router.put('/details/:detail_id', controller.updateScheduleDetail);
router.put('/:id/full', controller.updateScheduleWithDetails);          //보호
router.delete('/details/:detail_id', auth, controller.deleteScheduleDetail);
router.delete('/:id', auth, controller.deleteSchedule);                       //보호

module.exports = router;
