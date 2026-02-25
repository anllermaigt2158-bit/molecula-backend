const router = require('express').Router();
const { login, me } = require('../controllers/authController');
const { verifyToken } = require('../middlewares/auth');

router.post('/login', login);
router.get('/me', verifyToken, me);

module.exports = router;
