# Sistema de Gestión para Tienda de Mascotas (POS + Panel Admin)

Prototipo completo de **Control de Inventarios**, **Gestión de Ventas (POS)**, **Registro de Clientes** y **Panel de Administración Protegido (JWT + Chart.js)**.

## Estructura del Proyecto
* `/backend`: API REST en Python con **FastAPI**, **SQLite** (`init.sql`), transacciones atómicas con `ROLLBACK`, autenticación **JWT** + `bcrypt` y simulación End-to-End (`test_e2e_simulation.py`).
* `/frontend`: Interfaz **Punto de Venta (POS)** dividida 70/30 (`index.html`) y **Dashboard Administrativo** (`admin.html`) con Tailwind CSS, FontAwesome y Chart.js.
* `/docs`: Documentación de arquitectura y modelo relacional.

## Ejecución Rápida con Docker Compose
```bash
docker-compose up --build -d
```
- **Frontend POS:** `http://localhost:8080`
- **Panel Admin:** `http://localhost:8080/admin.html`
- **Documentación Swagger API:** `http://localhost:8000/docs`

## Ejecución Local Directa (Python)
```bash
cd backend
pip install -r requirements.txt
python test_e2e_simulation.py
uvicorn main:app --reload --port 8000
```
- Abrir `http://localhost:8000` (POS) o `http://localhost:8000/admin.html` (Credenciales: `admin` / `admin123`).
