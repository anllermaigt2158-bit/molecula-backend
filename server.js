const express    = require('express')
const cors       = require('cors')
const path       = require('path')
require('dotenv').config()

const app = express()

// ── CORS dinámico ─────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,        // URL de Vercel en producción
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (Postman, mobile apps)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`CORS bloqueado para: ${origin}`))
  },
  credentials: true
}))

app.use(express.json())

// ── Archivos estáticos (imágenes subidas) ─────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Rutas ─────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'))
app.use('/api/productos',  require('./routes/productos'))
app.use('/api/categorias', require('./routes/categorias'))
app.use('/api/ventas',     require('./routes/ventas'))
app.use('/api/usuarios',   require('./routes/usuarios'))

// ── Health check (Railway lo necesita) ───────────────────────
app.get('/', (req, res) => res.json({ ok: true, msg: 'Molecula API corriendo ✅' }))

// ── Puerto dinámico ───────────────────────────────────────────
const PORT = process.env.PORT || 4000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
})
