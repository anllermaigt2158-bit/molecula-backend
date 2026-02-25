const db  = require('../config/db')
const fs   = require('fs')
const path = require('path')

const getAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, COUNT(p.id) as num_productos
       FROM categorias c
       LEFT JOIN productos p ON p.categoria_id = c.id AND p.activo = 1
       WHERE c.activo = 1
       GROUP BY c.id ORDER BY c.nombre ASC`
    )
    res.json({ ok: true, data: rows })
  } catch (err) { res.status(500).json({ ok: false, msg: err.message }) }
}


const getOne = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categorias WHERE id = ? AND activo = 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Categoría no encontrada' })
    res.json({ ok: true, data: rows[0] })
  } catch (err) { res.status(500).json({ ok: false, msg: err.message }) }
}

const create = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body
    if (!nombre) return res.status(400).json({ ok: false, msg: 'El nombre es requerido' })
    const imagen = req.file ? req.file.filename : null
    const [result] = await db.query(
      'INSERT INTO categorias (nombre, descripcion, imagen) VALUES (?, ?, ?)',
      [nombre, descripcion || null, imagen]
    )
    res.status(201).json({ ok: true, msg: 'Categoría creada', id: result.insertId })
  } catch (err) { res.status(500).json({ ok: false, msg: err.message }) }
}

const update = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body
    if (!nombre) return res.status(400).json({ ok: false, msg: 'El nombre es requerido' })

    if (req.file) {
      const [old] = await db.query('SELECT imagen FROM categorias WHERE id = ?', [req.params.id])
      if (old[0]?.imagen) {
        const oldPath = path.join(__dirname, '..', 'uploads', old[0].imagen)
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
      }
    }

    const imagenClause = req.file ? ', imagen = ?' : ''
    const params = [nombre, descripcion || null]
    if (req.file) params.push(req.file.filename)
    params.push(req.params.id)

    await db.query(
      `UPDATE categorias SET nombre = ?, descripcion = ?${imagenClause} WHERE id = ?`, params
    )
    res.json({ ok: true, msg: 'Categoría actualizada' })
  } catch (err) { res.status(500).json({ ok: false, msg: err.message }) }
}

const remove = async (req, res) => {
  try {
    const [prods] = await db.query(
      'SELECT COUNT(*) as total FROM productos WHERE categoria_id = ? AND activo = 1', [req.params.id]
    )
    if (prods[0].total > 0)
      return res.status(400).json({ ok: false, msg: 'La categoría tiene productos activos' })
    await db.query('UPDATE categorias SET activo = 0 WHERE id = ?', [req.params.id])
    res.json({ ok: true, msg: 'Categoría eliminada' })
  } catch (err) { res.status(500).json({ ok: false, msg: err.message }) }
}

module.exports = { getAll, getOne, create, update, remove }
