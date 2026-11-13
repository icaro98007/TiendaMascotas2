import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import get_connection, init_db, transaction_scope
from schemas import (
    ClienteCreate,
    ClienteResponse,
    ClienteUpdate,
    LoginRequest,
    ProductoCreate,
    ProductoResponse,
    ProductoUpdate,
    TokenResponse,
    VentaCreate,
)
from security import create_access_token, get_current_user, verify_password

app = FastAPI(
    title="PetShop POS & Admin API",
    description="API REST para Control de Inventarios, Punto de Venta y Administración de Tienda de Mascotas",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# ==========================================================
# 1. MÓDULO DE SEGURIDAD Y AUTENTICACIÓN (JWT)
# ==========================================================
@app.post("/api/auth/login", response_model=TokenResponse, tags=["Autenticación"])
def login(credentials: LoginRequest):
    conn = get_connection()
    try:
        cur = conn.execute(
            "SELECT id, username, password_hash, rol FROM usuarios WHERE username = ?",
            (credentials.username.strip(),),
        )
        user = cur.fetchone()
        if not user or not verify_password(credentials.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuario o contraseña incorrectos",
            )
        token = create_access_token(
            user_id=user["id"], username=user["username"], rol=user["rol"]
        )
        return TokenResponse(
            access_token=token,
            username=user["username"],
            rol=user["rol"],
        )
    finally:
        conn.close()


# ==========================================================
# 2. CRUD DE PRODUCTOS Y BÚSQUEDA EN TIEMPO REAL
# ==========================================================
@app.get("/api/productos", response_model=List[ProductoResponse], tags=["Productos"])
def listar_productos(buscar: Optional[str] = Query(default=None)):
    conn = get_connection()
    try:
        if buscar and buscar.strip():
            term = f"%{buscar.strip()}%"
            cur = conn.execute(
                """
                SELECT * FROM productos
                WHERE nombre LIKE ? OR codigo_barras LIKE ? OR categoria LIKE ?
                ORDER BY nombre ASC
                """,
                (term, term, term),
            )
        else:
            cur = conn.execute("SELECT * FROM productos ORDER BY id ASC")
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.get("/api/productos/{producto_id}", response_model=ProductoResponse, tags=["Productos"])
def obtener_producto(producto_id: int):
    conn = get_connection()
    try:
        cur = conn.execute("SELECT * FROM productos WHERE id = ?", (producto_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return dict(row)
    finally:
        conn.close()


@app.post(
    "/api/productos",
    response_model=ProductoResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Productos"],
)
def crear_producto(producto: ProductoCreate):
    try:
        with transaction_scope() as conn:
            cur = conn.execute(
                """
                INSERT INTO productos (
                    codigo_barras, nombre, categoria,
                    precio_costo, precio_venta, stock_actual, stock_minimo
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    producto.codigo_barras.strip(),
                    producto.nombre.strip(),
                    producto.categoria.strip(),
                    producto.precio_costo,
                    producto.precio_venta,
                    producto.stock_actual,
                    producto.stock_minimo,
                ),
            )
            new_id = cur.lastrowid
            row = conn.execute(
                "SELECT * FROM productos WHERE id = ?", (new_id,)
            ).fetchone()
            return dict(row)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail=f"El código de barras '{producto.codigo_barras}' ya está registrado.",
        )


@app.put("/api/productos/{producto_id}", response_model=ProductoResponse, tags=["Productos"])
def actualizar_producto(producto_id: int, cambios: ProductoUpdate):
    try:
        with transaction_scope() as conn:
            actual = conn.execute(
                "SELECT * FROM productos WHERE id = ?", (producto_id,)
            ).fetchone()
            if not actual:
                raise HTTPException(status_code=404, detail="Producto no encontrado")

            data = dict(actual)
            update_data = cambios.model_dump(exclude_unset=True)
            data.update(update_data)

            conn.execute(
                """
                UPDATE productos
                SET codigo_barras = ?, nombre = ?, categoria = ?,
                    precio_costo = ?, precio_venta = ?, stock_actual = ?, stock_minimo = ?
                WHERE id = ?
                """,
                (
                    data["codigo_barras"],
                    data["nombre"],
                    data["categoria"],
                    data["precio_costo"],
                    data["precio_venta"],
                    data["stock_actual"],
                    data["stock_minimo"],
                    producto_id,
                ),
            )
            row = conn.execute(
                "SELECT * FROM productos WHERE id = ?", (producto_id,)
            ).fetchone()
            return dict(row)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="Conflicto al actualizar: el código de barras ya pertenece a otro producto.",
        )


@app.delete("/api/productos/{producto_id}", tags=["Productos"])
def eliminar_producto(producto_id: int):
    try:
        with transaction_scope() as conn:
            cur = conn.execute("DELETE FROM productos WHERE id = ?", (producto_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Producto no encontrado")
            return {"mensaje": "Producto eliminado correctamente", "id": producto_id}
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar un producto que tiene historial de ventas.",
        )


# ==========================================================
# 3. CRUD DE CLIENTES Y BÚSQUEDA RÁPIDA POR TELÉFONO
# ==========================================================
@app.get("/api/clientes", response_model=List[ClienteResponse], tags=["Clientes"])
def listar_clientes(telefono: Optional[str] = Query(default=None)):
    conn = get_connection()
    try:
        if telefono and telefono.strip():
            term = f"%{telefono.strip()}%"
            cur = conn.execute(
                "SELECT * FROM clientes WHERE telefono LIKE ? OR nombre LIKE ? ORDER BY id DESC",
                (term, term),
            )
        else:
            cur = conn.execute("SELECT * FROM clientes ORDER BY id DESC")
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


@app.post(
    "/api/clientes",
    response_model=ClienteResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Clientes"],
)
def crear_cliente(cliente: ClienteCreate):
    try:
        with transaction_scope() as conn:
            cur = conn.execute(
                "INSERT INTO clientes (nombre, telefono, email) VALUES (?, ?, ?)",
                (
                    cliente.nombre.strip(),
                    cliente.telefono.strip(),
                    cliente.email.strip() if cliente.email else None,
                ),
            )
            new_id = cur.lastrowid
            row = conn.execute(
                "SELECT * FROM clientes WHERE id = ?", (new_id,)
            ).fetchone()
            return dict(row)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail=f"El número de teléfono '{cliente.telefono}' ya está registrado.",
        )


@app.put("/api/clientes/{cliente_id}", response_model=ClienteResponse, tags=["Clientes"])
def actualizar_cliente(cliente_id: int, cambios: ClienteUpdate):
    try:
        with transaction_scope() as conn:
            actual = conn.execute(
                "SELECT * FROM clientes WHERE id = ?", (cliente_id,)
            ).fetchone()
            if not actual:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")

            data = dict(actual)
            data.update(cambios.model_dump(exclude_unset=True))
            conn.execute(
                "UPDATE clientes SET nombre = ?, telefono = ?, email = ? WHERE id = ?",
                (data["nombre"], data["telefono"], data["email"], cliente_id),
            )
            row = conn.execute(
                "SELECT * FROM clientes WHERE id = ?", (cliente_id,)
            ).fetchone()
            return dict(row)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=400, detail="El teléfono ingresado ya pertenece a otro cliente."
        )


@app.delete("/api/clientes/{cliente_id}", tags=["Clientes"])
def eliminar_cliente(cliente_id: int):
    with transaction_scope() as conn:
        cur = conn.execute("DELETE FROM clientes WHERE id = ?", (cliente_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        return {"mensaje": "Cliente eliminado correctamente", "id": cliente_id}


# ==========================================================
# 4. LÓGICA TRANSACCIONAL (CHECKOUT DE VENTAS CON ROLLBACK)
# ==========================================================
@app.post("/api/ventas", status_code=status.HTTP_201_CREATED, tags=["Ventas"])
def registrar_venta(venta: VentaCreate):
    """
    Procesa el carrito de forma atómica:
    1. Si viene `nuevo_cliente`, lo crea o recupera en la misma transacción.
    2. Verifica existencia y stock disponible de cada producto.
    3. Si algún producto no tiene stock suficiente, lanza excepción y ejecuta ROLLBACK total.
    4. Inserta en `ventas` y `detalle_ventas`, y descuenta `stock_actual` en `productos`.
    """
    with transaction_scope() as conn:
        cliente_id = venta.cliente_id

        # Registro o vinculación de cliente nuevo durante el checkout
        if not cliente_id and venta.nuevo_cliente:
            tel = venta.nuevo_cliente.telefono.strip()
            existente = conn.execute(
                "SELECT id FROM clientes WHERE telefono = ?", (tel,)
            ).fetchone()
            if existente:
                cliente_id = existente["id"]
            else:
                cur_cli = conn.execute(
                    "INSERT INTO clientes (nombre, telefono, email) VALUES (?, ?, ?)",
                    (
                        venta.nuevo_cliente.nombre.strip(),
                        tel,
                        venta.nuevo_cliente.email.strip()
                        if venta.nuevo_cliente.email
                        else None,
                    ),
                )
                cliente_id = cur_cli.lastrowid

        # Consolidar cantidades si el carrito repite el mismo producto_id
        cantidades_por_producto = {}
        for item in venta.items:
            cantidades_por_producto[item.producto_id] = (
                cantidades_por_producto.get(item.producto_id, 0) + item.cantidad
            )

        detalles_para_insertar = []
        total_venta = 0.0

        for prod_id, cantidad in cantidades_por_producto.items():
            prod = conn.execute(
                "SELECT id, nombre, precio_venta, stock_actual FROM productos WHERE id = ?",
                (prod_id,),
            ).fetchone()

            if not prod:
                raise HTTPException(
                    status_code=404,
                    detail=f"El producto con ID {prod_id} no existe.",
                )

            if prod["stock_actual"] < cantidad:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente para la venta: '{prod['nombre']}' "
                        f"(Disponible: {prod['stock_actual']}, Solicitado: {cantidad})"
                    ),
                )

            subtotal = round(prod["precio_venta"] * cantidad, 2)
            total_venta = round(total_venta + subtotal, 2)
            detalles_para_insertar.append(
                {
                    "producto_id": prod["id"],
                    "nombre": prod["nombre"],
                    "cantidad": cantidad,
                    "precio_unitario": prod["precio_venta"],
                    "subtotal": subtotal,
                }
            )

        # Insertar cabecera de venta
        cur_venta = conn.execute(
            """
            INSERT INTO ventas (fecha_venta, cliente_id, usuario_id, total)
            VALUES (datetime('now', 'localtime'), ?, ?, ?)
            """,
            (cliente_id, venta.usuario_id, total_venta),
        )
        venta_id = cur_venta.lastrowid

        # Insertar detalles y descontar stock
        for det in detalles_para_insertar:
            conn.execute(
                """
                INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    venta_id,
                    det["producto_id"],
                    det["cantidad"],
                    det["precio_unitario"],
                    det["subtotal"],
                ),
            )
            conn.execute(
                """
                UPDATE productos
                SET stock_actual = stock_actual - ?
                WHERE id = ?
                """,
                (det["cantidad"], det["producto_id"]),
            )

        cliente_info = None
        if cliente_id:
            row_cli = conn.execute(
                "SELECT id, nombre, telefono FROM clientes WHERE id = ?", (cliente_id,)
            ).fetchone()
            if row_cli:
                cliente_info = dict(row_cli)

        return {
            "venta_id": venta_id,
            "fecha_venta": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "cliente": cliente_info,
            "total": total_venta,
            "items": detalles_para_insertar,
            "mensaje": "Venta procesada exitosamente",
        }


# ==========================================================
# 5. DASHBOARD ADMINISTRATIVO PROTEGIDO (KPIs Y GRÁFICOS)
# ==========================================================
@app.get("/api/admin/dashboard", tags=["Administración"])
def obtener_dashboard(current_user: dict = Depends(get_current_user)):
    conn = get_connection()
    try:
        hoy_str = datetime.now().strftime("%Y-%m-%d")

        # KPIs del día y acumulados
        kpi_hoy = conn.execute(
            """
            SELECT
                COUNT(DISTINCT v.id) AS num_ventas_hoy,
                COALESCE(SUM(dv.subtotal), 0) AS ingresos_hoy,
                COALESCE(SUM((dv.precio_unitario - p.precio_costo) * dv.cantidad), 0) AS ganancia_hoy
            FROM ventas v
            LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
            LEFT JOIN productos p ON p.id = dv.producto_id
            WHERE date(v.fecha_venta) = date('now', 'localtime')
            """
        ).fetchone()

        kpi_total = conn.execute(
            """
            SELECT
                COUNT(DISTINCT v.id) AS total_transacciones,
                COALESCE(SUM(dv.subtotal), 0) AS ingresos_totales,
                COALESCE(SUM((dv.precio_unitario - p.precio_costo) * dv.cantidad), 0) AS ganancia_total
            FROM ventas v
            LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
            LEFT JOIN productos p ON p.id = dv.producto_id
            """
        ).fetchone()

        total_clientes = conn.execute(
            "SELECT COUNT(*) AS c FROM clientes"
        ).fetchone()["c"]

        # Curva de ventas de los últimos 7 días
        curva_7_dias = []
        hoy_dt = datetime.now().date()
        for i in range(6, -1, -1):
            dia = hoy_dt - timedelta(days=i)
            dia_iso = dia.strftime("%Y-%m-%d")
            fila_dia = conn.execute(
                """
                SELECT
                    COALESCE(SUM(v.total), 0) AS total_dia,
                    COUNT(v.id) AS cantidad_ventas
                FROM ventas v
                WHERE date(v.fecha_venta) = ?
                """,
                (dia_iso,),
            ).fetchone()
            curva_7_dias.append(
                {
                    "fecha": dia_iso,
                    "etiqueta": dia.strftime("%d/%m"),
                    "total": round(float(fila_dia["total_dia"]), 2),
                    "ventas": fila_dia["cantidad_ventas"],
                }
            )

        # Inventario completo y alertas de stock crítico
        productos_rows = conn.execute(
            "SELECT * FROM productos ORDER BY (stock_actual - stock_minimo) ASC, nombre ASC"
        ).fetchall()
        inventario = [dict(r) for r in productos_rows]
        alertas_criticas = [
            p for p in inventario if p["stock_actual"] <= p["stock_minimo"]
        ]

        # Últimas 10 ventas registradas
        ultimas_ventas_rows = conn.execute(
            """
            SELECT
                v.id,
                v.fecha_venta,
                v.total,
                COALESCE(c.nombre, 'Cliente de Mostrador') AS cliente_nombre,
                COALESCE(c.telefono, '-') AS cliente_telefono,
                u.username AS cajero
            FROM ventas v
            LEFT JOIN clientes c ON c.id = v.cliente_id
            LEFT JOIN usuarios u ON u.id = v.usuario_id
            ORDER BY v.id DESC
            LIMIT 10
            """
        ).fetchall()

        return {
            "usuario_autenticado": current_user,
            "fecha_consulta": hoy_str,
            "kpis": {
                "ventas_hoy_monto": round(float(kpi_hoy["ingresos_hoy"]), 2),
                "ganancia_hoy_monto": round(float(kpi_hoy["ganancia_hoy"]), 2),
                "transacciones_hoy": int(kpi_hoy["num_ventas_hoy"]),
                "ingresos_totales": round(float(kpi_total["ingresos_totales"]), 2),
                "ganancia_total": round(float(kpi_total["ganancia_total"]), 2),
                "total_transacciones": int(kpi_total["total_transacciones"]),
                "total_clientes": total_clientes,
                "productos_criticos": len(alertas_criticas),
                "total_productos": len(inventario),
            },
            "historico_7_dias": curva_7_dias,
            "inventario": inventario,
            "alertas_stock": alertas_criticas,
            "ultimas_ventas": [dict(r) for r in ultimas_ventas_rows],
        }
    finally:
        conn.close()


# ==========================================================
# 6. ARCHIVOS ESTÁTICOS DEL FRONTEND (PARA DESARROLLO LOCAL)
# ==========================================================
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    def root_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/admin", include_in_schema=False)
    def admin_page():
        return FileResponse(str(FRONTEND_DIR / "admin.html"))

    @app.get("/{filename}.html", include_in_schema=False)
    def html_pages(filename: str):
        target = FRONTEND_DIR / f"{filename}.html"
        if target.exists():
            return FileResponse(str(target))
        raise HTTPException(status_code=404, detail="Página no encontrada")

    @app.get("/js/{filename}", include_in_schema=False)
    def js_files(filename: str):
        target = FRONTEND_DIR / "js" / filename
        if target.exists():
            return FileResponse(str(target))
        raise HTTPException(status_code=404, detail="Archivo JS no encontrado")

    @app.get("/css/{filename}", include_in_schema=False)
    def css_files(filename: str):
        target = FRONTEND_DIR / "css" / filename
        if target.exists():
            return FileResponse(str(target), media_type="text/css")
        raise HTTPException(status_code=404, detail="Archivo CSS no encontrado")
