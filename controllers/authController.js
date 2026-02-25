const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, msg: 'Email y contraseña requeridos' });
    }

    const [rows] = await db.query(
      `SELECT u.*, r.nombre as rol 
       FROM usuarios u 
       JOIN roles r ON r.id = u.rol_id
       WHERE u.email = ? AND u.activo = 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, msg: 'Credenciales incorrectas' });
    }

    const usuario = rows[0];
    const passwordOk = await bcrypt.compare(password, usuario.password);

    if (!passwordOk) {
      return res.status(401).json({ ok: false, msg: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      ok: true,
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  res.json({ ok: true, usuario: req.usuario });
};

module.exports = { login, me };
