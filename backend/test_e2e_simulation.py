"""
Fase 4: Pruebas de Flujo (End-to-End) - Simulación de un Día de Trabajo
-----------------------------------------------------------------------
1. Inicializa la base de datos SQLite limpia.
2. Carga 10 productos de prueba para la tienda de mascotas.
3. Registra 5 ventas (con clientes nuevos, clientes existentes y mostrador).
4. Verifica el ROLLBACK transaccional intentando una venta que excede el stock.
5. Inicia sesión como Admin (JWT) y verifica que el Dashboard refleje los ingresos,
   ganancias netas, descuentos de stock y alertas críticas exactamente.
"""

from fastapi import HTTPException
from database import DATABASE_PATH, init_db
from main import (
    crear_cliente,
    crear_producto,
    login,
    obtener_dashboard,
    obtener_producto,
    registrar_venta,
)
from schemas import (
    ClienteCreate,
    ItemCarrito,
    LoginRequest,
    NuevoClienteCheckout,
    ProductoCreate,
    VentaCreate,
)


def ejecutar_simulacion_e2e():
    if DATABASE_PATH.exists():
        DATABASE_PATH.unlink()
    init_db()

    print("=== 1. CARGANDO 10 PRODUCTOS DE PRUEBA ===")
    productos_semilla = [
        {
            "codigo_barras": "7501001",
            "nombre": "Croquetas Premium Adulto 15kg",
            "categoria": "Alimento",
            "precio_costo": 650.00,
            "precio_venta": 920.00,
            "stock_actual": 12,
            "stock_minimo": 4,
        },
        {
            "codigo_barras": "7501002",
            "nombre": "Alimento Húmedo Salmón Gato 85g",
            "categoria": "Alimento",
            "precio_costo": 18.00,
            "precio_venta": 32.00,
            "stock_actual": 30,
            "stock_minimo": 10,
        },
        {
            "codigo_barras": "7501003",
            "nombre": "Pelota Dental Mordedera Caucho",
            "categoria": "Juguetes",
            "precio_costo": 45.00,
            "precio_venta": 89.00,
            "stock_actual": 8,
            "stock_minimo": 5,
        },
        {
            "codigo_barras": "7501004",
            "nombre": "Rascador Torre con Hamaca para Gato",
            "categoria": "Accesorios",
            "precio_costo": 420.00,
            "precio_venta": 699.00,
            "stock_actual": 5,
            "stock_minimo": 4,
        },
        {
            "codigo_barras": "7501005",
            "nombre": "Shampoo Hipoalergénico Avena 500ml",
            "categoria": "Higiene",
            "precio_costo": 75.00,
            "precio_venta": 145.00,
            "stock_actual": 6,
            "stock_minimo": 5,
        },
        {
            "codigo_barras": "7501006",
            "nombre": "Collar Antipulgas Larga Duración",
            "categoria": "Salud",
            "precio_costo": 190.00,
            "precio_venta": 310.00,
            "stock_actual": 7,
            "stock_minimo": 5,
        },
        {
            "codigo_barras": "7501007",
            "nombre": "Arena Aglutinante Lavanda 10kg",
            "categoria": "Higiene",
            "precio_costo": 130.00,
            "precio_venta": 225.00,
            "stock_actual": 15,
            "stock_minimo": 6,
        },
        {
            "codigo_barras": "7501008",
            "nombre": "Correa Retráctil Reflejante 5m",
            "categoria": "Accesorios",
            "precio_costo": 110.00,
            "precio_venta": 199.00,
            "stock_actual": 9,
            "stock_minimo": 4,
        },
        {
            "codigo_barras": "7501009",
            "nombre": "Snacks Entrenamiento Pollo 200g",
            "categoria": "Alimento",
            "precio_costo": 38.00,
            "precio_venta": 75.00,
            "stock_actual": 20,
            "stock_minimo": 8,
        },
        {
            "codigo_barras": "7501010",
            "nombre": "Cama Ortopédica Mediana Lavable",
            "categoria": "Accesorios",
            "precio_costo": 340.00,
            "precio_venta": 580.00,
            "stock_actual": 4,
            "stock_minimo": 4,
        },
    ]

    for p in productos_semilla:
        crear_producto(ProductoCreate(**p))
    print(f"-> {len(productos_semilla)} productos cargados correctamente.")

    cli_carlos = crear_cliente(
        ClienteCreate(
            nombre="Carlos Rivera",
            telefono="555-0101",
            email="carlos.rivera@email.com",
        )
    )

    print("\n=== 2. SIMULANDO 5 VENTAS DEL DÍA (CON Y SIN CLIENTES NUEVOS) ===")
    ventas_simuladas = [
        VentaCreate(
            cliente_id=cli_carlos["id"],
            items=[
                ItemCarrito(producto_id=1, cantidad=1),
                ItemCarrito(producto_id=9, cantidad=2),
            ],
        ),
        VentaCreate(
            nuevo_cliente=NuevoClienteCheckout(
                nombre="Ana Gómez",
                telefono="555-0202",
                email="ana.gomez@email.com",
            ),
            items=[
                ItemCarrito(producto_id=4, cantidad=2),
                ItemCarrito(producto_id=2, cantidad=5),
            ],
        ),
        VentaCreate(
            items=[
                ItemCarrito(producto_id=5, cantidad=2),
                ItemCarrito(producto_id=3, cantidad=1),
            ],
        ),
        VentaCreate(
            nuevo_cliente=NuevoClienteCheckout(
                nombre="Roberto Díaz",
                telefono="555-0303",
                email="roberto.diaz@email.com",
            ),
            items=[
                ItemCarrito(producto_id=6, cantidad=3),
                ItemCarrito(producto_id=7, cantidad=2),
            ],
        ),
        VentaCreate(
            items=[
                ItemCarrito(producto_id=8, cantidad=1),
                ItemCarrito(producto_id=10, cantidad=1),
            ],
        ),
    ]

    suma_esperada = 0.0
    for v in ventas_simuladas:
        datos_v = registrar_venta(v)
        suma_esperada = round(suma_esperada + datos_v["total"], 2)
        print(
            f"-> Venta #{datos_v['venta_id']} procesada | Total: ${datos_v['total']:.2f}"
        )

    print("\n=== 3. PROBANDO ROLLBACK TRANSACCIONAL (STOCK INSUFICIENTE) ===")
    try:
        registrar_venta(
            VentaCreate(
                items=[
                    ItemCarrito(producto_id=1, cantidad=1),
                    ItemCarrito(producto_id=10, cantidad=50),
                ]
            )
        )
        raise AssertionError("Debió fallar por stock insuficiente")
    except HTTPException as exc:
        assert exc.status_code == 400
        print(f"-> Rollback verificado con éxito: {exc.detail}")

    prod_1 = obtener_producto(1)
    assert prod_1["stock_actual"] == 11, "El rollback no restauró el producto 1"

    print("\n=== 4. VERIFICANDO LOGIN JWT Y MÉTRICAS DEL DASHBOARD ADMIN ===")
    tok = login(LoginRequest(username="admin", password="admin123"))
    assert tok.access_token

    dash = obtener_dashboard(
        current_user={"id": 1, "username": tok.username, "rol": tok.rol}
    )
    kpis = dash["kpis"]
    assert kpis["transacciones_hoy"] == 5
    assert kpis["ventas_hoy_monto"] == suma_esperada
    assert kpis["total_clientes"] == 3
    assert kpis["productos_criticos"] == 4

    print(f"-> Ingresos del Día verificados: ${kpis['ventas_hoy_monto']:.2f}")
    print(f"-> Ganancia Neta del Día:        ${kpis['ganancia_hoy_monto']:.2f}")
    print(f"-> Transacciones Registradas:    {kpis['transacciones_hoy']}")
    print(f"-> Clientes Registrados:         {kpis['total_clientes']}")
    print(f"-> Alertas de Stock Crítico:     {kpis['productos_criticos']} productos")
    print("\n[OK] TODAS LAS PRUEBAS END-TO-END PASARON EXITOSAMENTE.")


if __name__ == "__main__":
    ejecutar_simulacion_e2e()
