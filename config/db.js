const mysql = require('mysql2/promise')
require('dotenv').config()

const db = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'molecula_db',
  waitForConnections: true,
  connectionLimit:    10,
  // SSL requerido por Railway
  ssl: process.env.DB_HOST?.includes('railway.app')
    ? { rejectUnauthorized: false }
    : false
})

module.exports = db
