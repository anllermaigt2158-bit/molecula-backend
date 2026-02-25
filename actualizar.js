const bcrypt = require('bcryptjs');
const db = require('./config/db');
require('dotenv').config();

(async () => {
  const hash = await bcrypt.hash('admin123', 10);
  await db.query('UPDATE usuarios SET password = ? WHERE email = ?', [hash, 'admin@molecula.com']);
  await db.query('UPDATE usuarios SET password = ? WHERE email = ?', [hash, 'vendedor@molecula.com']);
  console.log('Listo! Contrasenas actualizadas');
  process.exit();
})();