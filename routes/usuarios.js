// routes/usuarios.js
const router = require('express').Router();
const ctrl = require('../controllers/usuariosController');
const { verifyToken, soloAdmin } = require('../middlewares/auth');

router.get('/roles', verifyToken, soloAdmin, ctrl.getRoles);
router.get('/',      verifyToken, soloAdmin, ctrl.getAll);
router.post('/',     verifyToken, soloAdmin, ctrl.create);
router.put('/:id',   verifyToken, soloAdmin, ctrl.update);
router.delete('/:id',verifyToken, soloAdmin, ctrl.remove);

module.exports = router;
