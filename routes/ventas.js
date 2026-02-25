const router = require('express').Router();
const ctrl = require('../controllers/ventasController');
const { verifyToken, soloAdmin } = require('../middlewares/auth');

router.get('/dashboard', verifyToken, soloAdmin, ctrl.dashboard);
router.get('/vendedores', verifyToken, soloAdmin, ctrl.getVendedores);
router.get('/metodos-pago', verifyToken, ctrl.getMetodosPago);
router.get('/dashboard-avanzado', verifyToken, soloAdmin, ctrl.dashboardAvanzado)
router.get('/', verifyToken, soloAdmin, ctrl.getAll);
router.get('/:id', verifyToken, ctrl.getOne);
router.post('/', verifyToken, ctrl.create);


module.exports = router;
