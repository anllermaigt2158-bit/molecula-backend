const jwt = require('jsonwebtoken');

// Verifica que el token sea válido
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ ok: false, msg: 'Token requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, msg: 'Token inválido o expirado' });
  }
};

// Verifica que el usuario sea administrador
const soloAdmin = (req, res, next) => {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ ok: false, msg: 'Acceso solo para administradores' });
  }
  next();
};

module.exports = { verifyToken, soloAdmin };
