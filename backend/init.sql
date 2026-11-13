-- ==========================================================
-- Script de Inicialización de Base de Datos SQLite (init.sql)
-- Sistema de Gestión para Tienda de Mascotas
-- ==========================================================

PRAGMA foreign_keys = ON;

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('admin', 'cajero'))
);

-- 2. Tabla de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL UNIQUE,
    email TEXT,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Productos
CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_barras TEXT UNIQUE,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    precio_costo REAL NOT NULL CHECK(precio_costo >= 0),
    precio_venta REAL NOT NULL CHECK(precio_venta >= 0),
    stock_actual INTEGER NOT NULL DEFAULT 0 CHECK(stock_actual >= 0),
    stock_minimo INTEGER NOT NULL DEFAULT 5 CHECK(stock_minimo >= 0),
    imagen TEXT
);

-- 4. Tabla de Ventas
CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha_venta DATETIME DEFAULT CURRENT_TIMESTAMP,
    cliente_id INTEGER,
    usuario_id INTEGER NOT NULL,
    total REAL NOT NULL CHECK(total >= 0),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- 5. Tabla de Detalle de Ventas
CREATE TABLE IF NOT EXISTS detalle_ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL CHECK(cantidad > 0),
    precio_unitario REAL NOT NULL CHECK(precio_unitario >= 0),
    costo_unitario REAL NOT NULL DEFAULT 0 CHECK(costo_unitario >= 0),
    subtotal REAL NOT NULL CHECK(subtotal >= 0),
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
);

-- Índices para búsquedas rápidas en el POS y reportes
CREATE INDEX IF NOT EXISTS idx_productos_busqueda ON productos(nombre, codigo_barras, categoria);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_venta);
