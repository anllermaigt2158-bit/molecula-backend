const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, usuario_id, producto_id, metodo_pago_id } = req.query;
    let query = `
      SELECT v.id, v.folio, v.created_at as fecha,
             u.nombre as vendedor, mp.nombre as metodo_pago,
             v.subtotal, v.descuento_venta, v.total, v.estado,
             COUNT(dv.id) as num_productos
      FROM ventas v
      JOIN usuarios u ON u.id = v.usuario_id
      JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
      LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
      WHERE 1=1
    `;
    const params = [];
    if (fecha_inicio)   { query += ' AND DATE(v.created_at) >= ?'; params.push(fecha_inicio); }
    if (fecha_fin)      { query += ' AND DATE(v.created_at) <= ?'; params.push(fecha_fin); }
    if (usuario_id)     { query += ' AND v.usuario_id = ?';        params.push(usuario_id); }
    if (metodo_pago_id) { query += ' AND v.metodo_pago_id = ?';    params.push(metodo_pago_id); }
    if (producto_id)    { query += ' AND dv.producto_id = ?';       params.push(producto_id); }
    query += ' GROUP BY v.id ORDER BY v.created_at DESC';

    const [rows] = await db.query(query, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

const getOne = async (req, res) => {
  try {
    const [venta] = await db.query(
      `SELECT v.*, u.nombre as vendedor, mp.nombre as metodo_pago
       FROM ventas v
       JOIN usuarios u ON u.id = v.usuario_id
       JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
       WHERE v.id = ?`, [req.params.id]
    );
    if (!venta.length) return res.status(404).json({ ok: false, msg: 'Venta no encontrada' });
    const [detalle] = await db.query('SELECT * FROM detalle_ventas WHERE venta_id = ?', [req.params.id]);
    res.json({ ok: true, data: { ...venta[0], detalle } });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

const create = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { items, metodo_pago_id, descuento_venta, justificacion_descuento, monto_recibido } = req.body;

    if (!items?.length || !metodo_pago_id)
      return res.status(400).json({ ok: false, msg: 'Items y método de pago requeridos' });

    const [[{ ultimo }]] = await conn.query('SELECT IFNULL(MAX(id), 0) as ultimo FROM ventas');
    const folio = `FACT-${String(ultimo + 1).padStart(4, '0')}`;

    const subtotal = items.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);
    const descuento = parseFloat(descuento_venta) || 0;
    const total = Math.max(0, subtotal - descuento);
    const cambio = monto_recibido ? parseFloat(monto_recibido) - total : null;

    const [ventaResult] = await conn.query(
      `INSERT INTO ventas (folio, usuario_id, subtotal, descuento_venta, justificacion_descuento,
        total, metodo_pago_id, monto_recibido, cambio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [folio, req.usuario.id, subtotal, descuento, justificacion_descuento || null,
       total, metodo_pago_id, monto_recibido || null, cambio]
    );
    const ventaId = ventaResult.insertId;

    for (const item of items) {
      // Verificar stock por talla
      const [pt] = await conn.query(
        `SELECT pt.stock, p.nombre, t.nombre as talla
         FROM producto_tallas pt
         JOIN productos p ON p.id = pt.producto_id
         JOIN tallas t ON t.id = pt.talla_id
         WHERE pt.producto_id = ? AND pt.talla_id = ?`,
        [item.producto_id, item.talla_id]
      );
      if (!pt.length) throw new Error(`Talla no disponible para el producto`);
      if (pt[0].stock < item.cantidad) throw new Error(`Stock insuficiente: ${pt[0].nombre} talla ${pt[0].talla}`);

      await conn.query(
        `INSERT INTO detalle_ventas (venta_id, producto_id, talla_id, nombre_producto, talla_nombre, precio_unitario, cantidad, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [ventaId, item.producto_id, item.talla_id, item.nombre_producto, pt[0].talla,
         item.precio_unitario, item.cantidad, item.precio_unitario * item.cantidad]
      );

      // Descontar stock de esa talla
      await conn.query(
        'UPDATE producto_tallas SET stock = stock - ? WHERE producto_id = ? AND talla_id = ?',
        [item.cantidad, item.producto_id, item.talla_id]
      );
    }

    await conn.commit();
    res.status(201).json({ ok: true, msg: 'Venta registrada', id: ventaId, folio });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ ok: false, msg: err.message });
  } finally { conn.release(); }
};

const dashboard = async (req, res) => {
  try {
    const [[totales]] = await db.query(`
      SELECT COUNT(*) as total_ventas,
        IFNULL(SUM(total), 0) as ingresos_totales,
        IFNULL(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total ELSE 0 END), 0) as ventas_hoy,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as num_ventas_hoy
      FROM ventas WHERE estado = 'completada'
    `);

    // Ventas de los últimos 7 días (solo los que tienen ventas)
    const [ventasDB] = await db.query(`
      SELECT DATE_FORMAT(DATE(created_at), '%Y-%m-%d') as dia, SUM(total) as total
      FROM ventas
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND estado = 'completada'
      GROUP BY DATE(created_at)
      ORDER BY dia ASC
    `);

    // Generar los 7 días completos rellenando con 0 los que no tienen ventas
    const ventasSemana = [];
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      const dia = fecha.toISOString().split('T')[0]; // "2026-02-21"
      const encontrado = ventasDB.find(v => v.dia === dia);
      ventasSemana.push({ dia, total: encontrado ? parseFloat(encontrado.total) : 0 });
    }

    const [topProductos] = await db.query(`
      SELECT p.nombre, SUM(dv.cantidad) as unidades, SUM(dv.subtotal) as ingresos
      FROM detalle_ventas dv JOIN productos p ON p.id = dv.producto_id
      GROUP BY dv.producto_id ORDER BY unidades DESC LIMIT 5
    `);

    const [[{ total_productos }]] = await db.query(
      'SELECT COUNT(*) as total_productos FROM productos WHERE activo = 1'
    );

    res.json({ ok: true, data: { totales, ventasSemana, topProductos, total_productos } });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
};

const getVendedores    = async (req, res) => {
  const [rows] = await db.query('SELECT id, nombre FROM usuarios WHERE activo = 1 ORDER BY nombre');
  res.json({ ok: true, data: rows });
};
const getMetodosPago   = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM metodos_pago ORDER BY nombre');
  res.json({ ok: true, data: rows });
};

// Agregar esta función al ventasController.js
// y registrar la ruta: router.get('/dashboard-avanzado', verifyToken, soloAdmin, dashboardAvanzado)

const dashboardAvanzado = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, producto_id, categoria_id, usuario_id, metodo_pago_id } = req.query

    const fi = fecha_inicio || '2000-01-01'
    const ff = fecha_fin    || new Date().toISOString().split('T')[0]

    // Condiciones dinámicas
    let where = `v.estado = 'completada' AND DATE(v.created_at) BETWEEN '${fi}' AND '${ff}'`
    if (usuario_id)     where += ` AND v.usuario_id = ${parseInt(usuario_id)}`
    if (metodo_pago_id) where += ` AND v.metodo_pago_id = ${parseInt(metodo_pago_id)}`

    let whereDetalle = where.replace(/v\./g, 'v.')
    if (producto_id)    whereDetalle += ` AND dv.producto_id = ${parseInt(producto_id)}`
    if (categoria_id)   whereDetalle += ` AND p.categoria_id = ${parseInt(categoria_id)}`

    // ── Resumen general ───────────────────────────────────────
    const [[resumen]] = await db.query(`
      SELECT
        COUNT(DISTINCT v.id)        AS total_ventas,
        IFNULL(SUM(v.total), 0)     AS ingresos_totales,
        IFNULL(SUM(dv.cantidad), 0) AS unidades_vendidas,
        IFNULL(AVG(v.total), 0)     AS ticket_promedio
      FROM ventas v
      JOIN detalle_ventas dv ON dv.venta_id = v.id
      JOIN productos p ON p.id = dv.producto_id
      WHERE ${whereDetalle}
    `)

    // ── Ventas por día (todos los días del rango, rellenando 0) ──
    const [ventasDB] = await db.query(`
      SELECT DATE_FORMAT(DATE(v.created_at), '%Y-%m-%d') AS dia,
             SUM(v.total) AS total,
             COUNT(DISTINCT v.id) AS num_ventas
      FROM ventas v
      JOIN detalle_ventas dv ON dv.venta_id = v.id
      JOIN productos p ON p.id = dv.producto_id
      WHERE ${whereDetalle}
      GROUP BY DATE(v.created_at)
      ORDER BY dia ASC
    `)

    // Generar todos los días del rango con 0 si no hay venta
    const ventasSemana = []
    const inicio = new Date(fi + 'T12:00:00')
    const fin    = new Date(ff + 'T12:00:00')
    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      const dia = d.toISOString().split('T')[0]
      const enc = ventasDB.find(v => v.dia === dia)
      ventasSemana.push({ dia, total: enc ? parseFloat(enc.total) : 0, num_ventas: enc ? enc.num_ventas : 0 })
    }

    // ── Top productos ─────────────────────────────────────────
    const [topProductos] = await db.query(`
      SELECT p.nombre, p.imagen,
             SUM(dv.cantidad)  AS unidades,
             SUM(dv.subtotal)  AS ingresos
      FROM detalle_ventas dv
      JOIN ventas v   ON v.id  = dv.venta_id
      JOIN productos p ON p.id = dv.producto_id
      WHERE ${whereDetalle}
      GROUP BY dv.producto_id
      ORDER BY unidades DESC
      LIMIT 8
    `)

    // ── Ventas por categoría ──────────────────────────────────
    const [ventasPorCategoria] = await db.query(`
      SELECT c.nombre AS categoria,
             SUM(dv.subtotal)       AS total,
             SUM(dv.cantidad)       AS unidades,
             COUNT(DISTINCT v.id)   AS num_ventas
      FROM detalle_ventas dv
      JOIN ventas v    ON v.id   = dv.venta_id
      JOIN productos p ON p.id   = dv.producto_id
      JOIN categorias c ON c.id  = p.categoria_id
      WHERE ${whereDetalle}
      GROUP BY p.categoria_id
      ORDER BY total DESC
    `)

    // ── Ventas por método de pago ─────────────────────────────
    const [ventasPorMetodo] = await db.query(`
      SELECT mp.nombre AS metodo,
             SUM(v.total)         AS total,
             COUNT(v.id)          AS num_ventas
      FROM ventas v
      JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
      JOIN detalle_ventas dv ON dv.venta_id = v.id
      JOIN productos p ON p.id = dv.producto_id
      WHERE ${whereDetalle}
      GROUP BY v.metodo_pago_id
      ORDER BY total DESC
    `)

    // ── Ventas por vendedor ───────────────────────────────────
    const [ventasPorVendedor] = await db.query(`
      SELECT u.nombre AS vendedor,
             SUM(v.total)       AS total,
             COUNT(v.id)        AS num_ventas,
             SUM(dv.cantidad)   AS unidades
      FROM ventas v
      JOIN usuarios u ON u.id = v.usuario_id
      JOIN detalle_ventas dv ON dv.venta_id = v.id
      JOIN productos p ON p.id = dv.producto_id
      WHERE ${whereDetalle}
      GROUP BY v.usuario_id
      ORDER BY total DESC
    `)

    // ── Ventas por talla ──────────────────────────────────────
    const [ventasPorTalla] = await db.query(`
      SELECT IFNULL(dv.talla_nombre, 'Sin talla') AS talla,
             SUM(dv.cantidad) AS unidades,
             SUM(dv.subtotal) AS ingresos
      FROM detalle_ventas dv
      JOIN ventas v   ON v.id  = dv.venta_id
      JOIN productos p ON p.id = dv.producto_id
      WHERE ${whereDetalle}
      GROUP BY dv.talla_nombre
      ORDER BY unidades DESC
    `)

    res.json({
      ok: true,
      data: {
        resumen: {
          ...resumen,
          ingresos_totales:  parseFloat(resumen.ingresos_totales),
          unidades_vendidas: parseInt(resumen.unidades_vendidas),
          ticket_promedio:   parseFloat(resumen.ticket_promedio),
        },
        ventasSemana,
        topProductos,
        ventasPorCategoria,
        ventasPorMetodo,
        ventasPorVendedor,
        ventasPorTalla,
      }
    })
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message })
  }
}

module.exports = { getAll, getOne, create, dashboard, getVendedores, getMetodosPago, dashboardAvanzado};
