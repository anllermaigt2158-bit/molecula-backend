const router  = require('express').Router()
const ctrl    = require('../controllers/categoriasController')
const { verifyToken, soloAdmin } = require('../middlewares/auth')
const upload  = require('../middlewares/upload')

router.get('/',      verifyToken,             ctrl.getAll)
router.get('/:id',   verifyToken,             ctrl.getOne)
router.post('/',     verifyToken, soloAdmin, upload.single('imagen'), ctrl.create)
router.put('/:id',   verifyToken, soloAdmin, upload.single('imagen'), ctrl.update)
router.delete('/:id',verifyToken, soloAdmin, ctrl.remove)

module.exports = router