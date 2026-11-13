# Informe de Diseño: Sistema de Gestión para Tienda de Mascotas

## 1. Introducción y Alcance
Este documento define las bases técnicas y funcionales para un prototipo de software orientado a la administración de una tienda de mascotas. El sistema cubre: **Control de Inventarios**, **Gestión de Ventas**, **Registro de Clientes** y un **Panel de Administración Protegido**.

### 1.1. Stack Tecnológico
*   **Backend & API:** Python (FastAPI + Uvicorn).
*   **Base de Datos:** SQLite (Relacional, ligera, despliegue local).
*   **Frontend (UI/POS):** HTML, JavaScript y Tailwind CSS + FontAwesome + Chart.js.
*   **Despliegue:** Docker & Docker Compose.

## 2. Esquema de Base de Datos (SQLite)
El sistema relacional está compuesto por 5 tablas principales:
*   `usuarios`: `id`, `username`, `password_hash`, `rol` (admin/cajero).
*   `clientes`: `id`, `nombre`, `telefono`, `email`, `fecha_registro`.
*   `productos`: `id`, `codigo_barras`, `nombre`, `categoria`, `precio_costo`, `precio_venta`, `stock_actual`, `stock_minimo`.
*   `ventas`: `id`, `fecha_venta`, `cliente_id` (FK), `usuario_id` (FK), `total`.
*   `detalle_ventas`: `id`, `venta_id` (FK), `producto_id` (FK), `cantidad`, `precio_unitario`, `subtotal`.

## 3. Credenciales por Defecto
*   **Administrador:** `admin` / `admin123`
*   **Cajero:** `cajero` / `cajero123`
