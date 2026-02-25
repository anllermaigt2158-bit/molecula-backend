const db = require('../config/db');
const fs = require('fs');
const path = require('path');

// GET /api/productos
const getAll = async (req, res) => {
  try {
    const { categoria_id, search } = req.query;
    let query = `
      SELECT p.*, c.nombre as categoria
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = 1
    `;
    const params = [];
    if (categoria_id) { query += ' AND p.categoria_id = ?'; params.push(categoria_id); }
    if (search)       { query += ' AND p.nombre LIKE ?';    params.push(`%${search}%`); }
    query += ' ORDER BY p.nombre ASC';

    const [productos] = await db.query(query, params);

    // Para cada producto, obtener sus tallas con stock
    for (const p of productos) {
      const [tallas] = await db.query(
        `SELECT pt.id, pt.talla_id, t.nombre as talla, pt.stock
         FROM producto_tallas pt
         JOIN tallas t ON t.id = pt.talla_id
         WHERE pt.producto_id = ? AND pt.stock > 0
         ORDER BY t.orden ASC`,
        [p.id]
      );
      p.tallas = tallas;
      p.stock_total = tallas.reduce((acc, t) => acc + t.stock, 0);
    }

    res.json({ ok: true, data: productos });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

// GET /api/productos/:id
const getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, c.nombre as categoria
       FROM productos p JOIN categorias c ON c.id = p.categoria_id
       WHERE p.id = ? AND p.activo = 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Producto no encontrado' });

    const [tallas] = await db.query(
      `SELECT pt.id, pt.talla_id, t.nombre as talla, pt.stock
       FROM producto_tallas pt
       JOIN tallas t ON t.id = pt.talla_id
       WHERE pt.producto_id = ?
       ORDER BY t.orden ASC`,
      [req.params.id]
    );

    res.json({ ok: true, data: { ...rows[0], tallas } });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

// POST /api/productos
const create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { nombre, descripcion, precio, porcentaje_descuento, categoria_id, tallas } = req.body;

    if (!nombre || !precio || !categoria_id)
      return res.status(400).json({ ok: false, msg: 'Nombre, precio y categoría son requeridos' });

    let precio_con_descuento = null, pct = null;
    if (porcentaje_descuento && parseFloat(porcentaje_descuento) > 0) {
      pct = parseFloat(porcentaje_descuento);
      precio_con_descuento = Math.round(parseFloat(precio) * (1 - pct / 100) * 100) / 100;
    }

    const imagen = req.file ? req.file.filename : null;
    const [result] = await conn.query(
      `INSERT INTO productos (nombre, descripcion, precio, precio_con_descuento, porcentaje_descuento, categoria_id, imagen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, descripcion || null, parseFloat(precio), precio_con_descuento, pct, categoria_id, imagen]
    );

    const productoId = result.insertId;

    // Insertar tallas y stock
    const tallasArr = typeof tallas === 'string' ? JSON.parse(tallas) : (tallas || []);
    for (const t of tallasArr) {
      if (t.talla_id && parseInt(t.stock) >= 0) {
        await conn.query(
          'INSERT INTO producto_tallas (producto_id, talla_id, stock) VALUES (?, ?, ?)',
          [productoId, t.talla_id, parseInt(t.stock)]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ ok: true, msg: 'Producto creado', id: productoId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ ok: false, msg: err.message });
  } finally { conn.release(); }
};

// PUT /api/productos/:id
const update = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { nombre, descripcion, precio, porcentaje_descuento, categoria_id, tallas } = req.body;

    if (!nombre || !precio || !categoria_id)
      return res.status(400).json({ ok: false, msg: 'Nombre, precio y categoría son requeridos' });

    let precio_con_descuento = null, pct = null;
    if (porcentaje_descuento && parseFloat(porcentaje_descuento) > 0) {
      pct = parseFloat(porcentaje_descuento);
      precio_con_descuento = Math.round(parseFloat(precio) * (1 - pct / 100) * 100) / 100;
    }

    if (req.file) {
      const [old] = await conn.query('SELECT imagen FROM productos WHERE id = ?', [req.params.id]);
      if (old[0]?.imagen) {
        const oldPath = path.join(__dirname, '..', 'uploads', old[0].imagen);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    const imagenClause = req.file ? ', imagen = ?' : '';
    const params = [nombre, descripcion || null, parseFloat(precio), precio_con_descuento, pct, categoria_id];
    if (req.file) params.push(req.file.filename);
    params.push(req.params.id);

    await conn.query(
      `UPDATE productos SET nombre=?, descripcion=?, precio=?, precio_con_descuento=?,
       porcentaje_descuento=?, categoria_id=?${imagenClause} WHERE id=?`,
      params
    );

    // Actualizar tallas: borrar y reinsertar
    await conn.query('DELETE FROM producto_tallas WHERE producto_id = ?', [req.params.id]);
    const tallasArr = typeof tallas === 'string' ? JSON.parse(tallas) : (tallas || []);
    for (const t of tallasArr) {
      if (t.talla_id && parseInt(t.stock) >= 0) {
        await conn.query(
          'INSERT INTO producto_tallas (producto_id, talla_id, stock) VALUES (?, ?, ?)',
          [req.params.id, t.talla_id, parseInt(t.stock)]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true, msg: 'Producto actualizado' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ ok: false, msg: err.message });
  } finally { conn.release(); }
};

// DELETE /api/productos/:id
const remove = async (req, res) => {
  try {
    await db.query('UPDATE productos SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true, msg: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

// GET /api/productos/tallas — todas las tallas disponibles
const getTallas = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM tallas ORDER BY orden ASC');
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

module.exports = { getAll, getOne, create, update, remove, getTallas };
