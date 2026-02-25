const db = require('../config/db');
const bcrypt = require('bcryptjs');

// GET /api/usuarios
const getAll = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.nombre, u.email, u.activo, u.created_at, r.nombre as rol, r.id as rol_id
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       ORDER BY u.created_at DESC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

// POST /api/usuarios
const create = async (req, res) => {
  try {
    const { nombre, email, password, rol_id } = req.body;
    if (!nombre || !email || !password || !rol_id)
      return res.status(400).json({ ok: false, msg: 'Todos los campos son requeridos' });

    const [existe] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length) return res.status(400).json({ ok: false, msg: 'El email ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO usuarios (nombre, email, password, rol_id) VALUES (?, ?, ?, ?)',
      [nombre, email, hash, rol_id]
    );
    res.status(201).json({ ok: true, msg: 'Usuario creado', id: result.insertId });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

// PUT /api/usuarios/:id
const update = async (req, res) => {
  try {
    const { nombre, email, password, rol_id, activo } = req.body;
    if (!nombre || !email || !rol_id)
      return res.status(400).json({ ok: false, msg: 'Nombre, email y rol son requeridos' });

    // Verificar email duplicado (excluyendo el propio)
    const [existe] = await db.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, req.params.id]);
    if (existe.length) return res.status(400).json({ ok: false, msg: 'El email ya está en uso' });

    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE usuarios SET nombre=?, email=?, password=?, rol_id=?, activo=? WHERE id=?',
        [nombre, email, hash, rol_id, activo ?? 1, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE usuarios SET nombre=?, email=?, rol_id=?, activo=? WHERE id=?',
        [nombre, email, rol_id, activo ?? 1, req.params.id]
      );
    }
    res.json({ ok: true, msg: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

// DELETE /api/usuarios/:id (soft delete)
const remove = async (req, res) => {
  try {
    // No se puede eliminar el propio usuario
    if (parseInt(req.params.id) === req.usuario.id)
      return res.status(400).json({ ok: false, msg: 'No puedes eliminar tu propia cuenta' });

    await db.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true, msg: 'Usuario desactivado' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

// GET /api/usuarios/roles
const getRoles = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM roles');
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

module.exports = { getAll, create, update, remove, getRoles };
