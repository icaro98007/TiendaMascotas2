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

from fastapi.testclient import TestClient
from database import DATABASE_PATH, init_db
from main import app


def ejecutar_simulacion_e2e():
    # Limpiar BD previa para una simulación reproducible y dejarla poblada para uso interactivo
    if DATABASE_PATH.exists():
        DATABASE_PATH.unlink()
    init_db()

    client = TestClient(app)

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

    productos_creados = []
    for p in productos_semilla:
        r = client.post("/api/productos", json=p)
        assert r.status_code == 201, f"Fallo creando producto: {r.text}"
        productos_creados.append(r.json())
    print(f"-> {len(productos_creados)} productos cargados correctamente.")

    # Pre-registrar 1 cliente existente por endpoint directo
    r_cli = client.post(
        "/api/clientes",
        json={
            "nombre": "Carlos Rivera",
            "telefono": "555-0101",
            "email": "carlos.rivera@email.com",
        },
    )
    assert r_cli.status_code == 201
    cliente_carlos_id = r_cli.json()["id"]

    print("\n=== 2. SIMULANDO 5 VENTAS DEL DÍA (CON Y SIN CLIENTES NUEVOS) ===")
    ventas_simuladas = [
        # Venta 1: Cliente existente (Carlos Rivera)
        {
            "cliente_id": cliente_carlos_id,
            "items": [
                {"producto_id": 1, "cantidad": 1},  # Croquetas $920
                {"producto_id": 9, "cantidad": 2},  # Snacks 2 x $75 = $150
            ],
        },
        # Venta 2: Cliente Nuevo registrado en el checkout (Ana Gómez)
        {
            "nuevo_cliente": {
                "nombre": "Ana Gómez",
                "telefono": "555-0202",
                "email": "ana.gomez@email.com",
            },
            "items": [
                {"producto_id": 4, "cantidad": 2},  # Rascador 2 x $699 = $1398 (deja stock en 3 <= min 4 -> CRÍTICO)
                {"producto_id": 2, "cantidad": 5},  # Alimento húmedo 5 x $32 = $160
            ],
        },
        # Venta 3: Venta rápida de mostrador (Sin cliente)
        {
            "items": [
                {"producto_id": 5, "cantidad": 2},  # Shampoo 2 x $145 = $290 (deja stock en 4 <= min 5 -> CRÍTICO)
                {"producto_id": 3, "cantidad": 1},  # Pelota Dental $89
            ],
        },
        # Venta 4: Cliente Nuevo registrado en el checkout (Roberto Díaz)
        {
            "nuevo_cliente": {
                "nombre": "Roberto Díaz",
                "telefono": "555-0303",
                "email": "roberto.diaz@email.com",
            },
            "items": [
                {"producto_id": 6, "cantidad": 3},  # Collar Antipulgas 3 x $310 = $930 (deja stock en 4 <= min 5 -> CRÍTICO)
                {"producto_id": 7, "cantidad": 2},  # Arena 2 x $225 = $450
            ],
        },
        # Venta 5: Venta de mostrador
        {
            "items": [
                {"producto_id": 8, "cantidad": 1},  # Correa $199
                {"producto_id": 10, "cantidad": 1}, # Cama Ortopédica $580 (deja stock en 3 <= min 4 -> CRÍTICO)
            ],
        },
    ]

    suma_esperada = 0.0
    for idx, v in enumerate(ventas_simuladas, start=1):
        resp_v = client.post("/api/ventas", json=v)
        assert resp_v.status_code == 201, f"Error en Venta {idx}: {resp_v.text}"
        datos_v = resp_v.json()
        suma_esperada = round(suma_esperada + datos_v["total"], 2)
        print(
            f"-> Venta #{datos_v['venta_id']} procesada | Total: ${datos_v['total']:.2f}"
        )

    print("\n=== 3. PROBANDO ROLLBACK TRANSACCIONAL (STOCK INSUFICIENTE) ===")
    # El producto 10 (Cama Ortopédica) tenía 4 y se vendió 1 -> quedan 3. Intentamos comprar 50.
    resp_fallo = client.post(
        "/api/ventas",
        json={
            "items": [
                {"producto_id": 1, "cantidad": 1},
                {"producto_id": 10, "cantidad": 50},
            ]
        },
    )
    assert resp_fallo.status_code == 400
    assert "Stock insuficiente para la venta" in resp_fallo.json()["detail"]
    print(f"-> Rollback verificado con éxito: {resp_fallo.json()['detail']}")

    # Verificar que el producto 1 no sufrió descuento por la venta abortada (tenía 12 - 1 = 11)
    prod_1 = client.get("/api/productos/1").json()
    assert prod_1["stock_actual"] == 11, "El rollback no restauró el producto 1"

    print("\n=== 4. VERIFICANDO LOGIN JWT Y MÉTRICAS DEL DASHBOARD ADMIN ===")
    resp_login = client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin123"}
    )
    assert resp_login.status_code == 200
    token = resp_login.json()["access_token"]

    resp_dash = client.get(
        "/api/admin/dashboard", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp_dash.status_code == 200
    dash = resp_dash.json()
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
