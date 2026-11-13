/**
 * Motor API Híbrido (FastAPI Local + Serverless Edge / Cloudflare Workers Fallback)
 * -------------------------------------------------------------------------------
 * Permite que la aplicación funcione al 100% tanto conectada al backend Python (FastAPI + SQLite)
 * como desplegada en Cloudflare Workers / Pages (*.workers.dev / *.pages.dev) sin errores de red.
 */
(function () {
  const STORAGE_KEY = "petshop_cloud_db_v2";
  const originalFetch = window.fetch.bind(window);

  function obtenerFechaHoyISO() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, "0");
    const d = String(hoy.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function obtenerFechaHoraActual() {
    const ahora = new Date();
    const fecha = obtenerFechaHoyISO();
    const h = String(ahora.getHours()).padStart(2, "0");
    const min = String(ahora.getMinutes()).padStart(2, "0");
    const s = String(ahora.getSeconds()).padStart(2, "0");
    return `${fecha} ${h}:${min}:${s}`;
  }

  function crearBaseDatosSemilla() {
    const fechaHoy = obtenerFechaHoyISO();
    const productos = [
      {
        id: 1,
        codigo_barras: "7501001",
        nombre: "Croquetas Premium Adulto 15kg",
        categoria: "Alimento",
        precio_costo: 650.0,
        precio_venta: 920.0,
        stock_actual: 11,
        stock_minimo: 4,
        imagen: "img/producto_1.webp",
      },
      {
        id: 2,
        codigo_barras: "7501002",
        nombre: "Alimento Húmedo Salmón Gato 85g",
        categoria: "Alimento",
        precio_costo: 18.0,
        precio_venta: 32.0,
        stock_actual: 25,
        stock_minimo: 10,
        imagen: "img/producto_3.webp",
      },
      {
        id: 3,
        codigo_barras: "7501003",
        nombre: "Pelota Dental Mordedera Caucho",
        categoria: "Juguetes",
        precio_costo: 45.0,
        precio_venta: 89.0,
        stock_actual: 7,
        stock_minimo: 5,
        imagen: "img/producto_2.webp",
      },
      {
        id: 4,
        codigo_barras: "7501004",
        nombre: "Rascador Torre con Hamaca para Gato",
        categoria: "Accesorios",
        precio_costo: 420.0,
        precio_venta: 699.0,
        stock_actual: 3,
        stock_minimo: 4,
        imagen: "img/producto_4.webp",
      },
      {
        id: 5,
        codigo_barras: "7501005",
        nombre: "Shampoo Hipoalergénico Avena 500ml",
        categoria: "Higiene",
        precio_costo: 75.0,
        precio_venta: 145.0,
        stock_actual: 4,
        stock_minimo: 5,
        imagen: "img/producto_5.webp",
      },
      {
        id: 6,
        codigo_barras: "7501006",
        nombre: "Collar Antipulgas Larga Duración",
        categoria: "Salud",
        precio_costo: 190.0,
        precio_venta: 310.0,
        stock_actual: 4,
        stock_minimo: 5,
        imagen: "img/producto_6.webp",
      },
      {
        id: 7,
        codigo_barras: "7501007",
        nombre: "Arena Aglutinante Lavanda 10kg",
        categoria: "Higiene",
        precio_costo: 130.0,
        precio_venta: 225.0,
        stock_actual: 13,
        stock_minimo: 6,
        imagen: "img/producto_1.webp",
      },
      {
        id: 8,
        codigo_barras: "7501008",
        nombre: "Correa Retráctil Reflejante 5m",
        categoria: "Accesorios",
        precio_costo: 110.0,
        precio_venta: 199.0,
        stock_actual: 8,
        stock_minimo: 4,
        imagen: "img/producto_4.webp",
      },
      {
        id: 9,
        codigo_barras: "7501009",
        nombre: "Snacks Entrenamiento Pollo 200g",
        categoria: "Alimento",
        precio_costo: 38.0,
        precio_venta: 75.0,
        stock_actual: 18,
        stock_minimo: 8,
        imagen: "img/producto_2.webp",
      },
      {
        id: 10,
        codigo_barras: "7501010",
        nombre: "Cama Ortopédica Mediana Lavable",
        categoria: "Accesorios",
        precio_costo: 340.0,
        precio_venta: 580.0,
        stock_actual: 3,
        stock_minimo: 4,
        imagen: "img/producto_5.webp",
      },
    ];

    // Iniciar clientes y ventas vacíos para que las estadísticas reflejen
    // ÚNICAMENTE las ventas reales de productos realizadas en el POS
    const clientes = [];
    const ventas = [];

    return { productos, clientes, ventas };
  }

  function cargarBD() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.productos)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Inicializando almacenamiento local:", e);
    }
    const semilla = crearBaseDatosSemilla();
    guardarBD(semilla);
    return semilla;
  }

  function guardarBD(db) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn("Advertencia al guardar en localStorage:", e);
    }
  }

  function crearRespuestaJSON(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function leerArchivoComoDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  async function procesarRutaLocal(urlObj, options = {}) {
    const path = urlObj.pathname;
    const method = (options.method || "GET").toUpperCase();
    const db = cargarBD();

    let bodyObj = {};
    if (options.body && typeof options.body === "string") {
      try {
        bodyObj = JSON.parse(options.body);
      } catch (e) {
        bodyObj = {};
      }
    }

    // 1. POST /api/auth/login
    if (path.endsWith("/api/auth/login") && method === "POST") {
      const u = (bodyObj.username || "").trim();
      const p = bodyObj.password || "";
      if ((u === "admin" && p === "admin123") || (u === "cajero" && p === "cajero123")) {
        return crearRespuestaJSON({
          access_token: "cloudflare_edge_jwt_token_" + Date.now(),
          token_type: "bearer",
          username: u,
          rol: u === "admin" ? "admin" : "cajero",
        });
      }
      return crearRespuestaJSON({ detail: "Usuario o contraseña incorrectos" }, 401);
    }

    // 2. POST /api/upload-imagen
    if (path.endsWith("/api/upload-imagen") && method === "POST") {
      if (options.body instanceof FormData) {
        const archivo = options.body.get("archivo");
        if (archivo && typeof archivo === "object") {
          const dataUrl = await leerArchivoComoDataURL(archivo);
          return crearRespuestaJSON({
            imagen_url: dataUrl,
            mensaje: "Imagen guardada exitosamente",
          });
        }
      }
      return crearRespuestaJSON({ detail: "No se recibió un archivo válido" }, 400);
    }

    // 3. GET /api/productos
    if (path.endsWith("/api/productos") && method === "GET") {
      const buscar = (urlObj.searchParams.get("buscar") || "").trim().toLowerCase();
      let lista = [...db.productos];
      if (buscar) {
        lista = lista.filter(
          (p) =>
            (p.nombre || "").toLowerCase().includes(buscar) ||
            (p.codigo_barras || "").toLowerCase().includes(buscar) ||
            (p.categoria || "").toLowerCase().includes(buscar)
        );
      }
      return crearRespuestaJSON(lista);
    }

    // 4. POST /api/productos
    if (path.endsWith("/api/productos") && method === "POST") {
      const nextId =
        db.productos.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
      let codigo = (bodyObj.codigo_barras || "").trim();
      if (!codigo) {
        codigo = `SIN-COD-${String(nextId).padStart(4, "0")}`;
      } else if (
        db.productos.some(
          (p) => (p.codigo_barras || "").toLowerCase() === codigo.toLowerCase()
        )
      ) {
        return crearRespuestaJSON(
          { detail: `El código de barras '${codigo}' ya está registrado.` },
          400
        );
      }

      const nuevo = {
        id: nextId,
        codigo_barras: codigo,
        nombre: (bodyObj.nombre || "Producto").trim(),
        categoria: (bodyObj.categoria || "General").trim(),
        precio_costo: Number(bodyObj.precio_costo || 0),
        precio_venta: Number(bodyObj.precio_venta || 0),
        stock_actual: parseInt(bodyObj.stock_actual || 0, 10),
        stock_minimo: parseInt(
          bodyObj.stock_minimo !== undefined ? bodyObj.stock_minimo : 5,
          10
        ),
        imagen: bodyObj.imagen || "img/producto_1.webp",
      };
      db.productos.push(nuevo);
      guardarBD(db);
      return crearRespuestaJSON(nuevo, 201);
    }

    // 5. PUT / DELETE / GET /api/productos/{id}
    const matchProdId = path.match(/\/api\/productos\/(\d+)$/);
    if (matchProdId) {
      const prodId = parseInt(matchProdId[1], 10);
      const idx = db.productos.findIndex((p) => p.id === prodId);
      if (idx === -1) {
        return crearRespuestaJSON({ detail: "Producto no encontrado" }, 404);
      }
      if (method === "GET") {
        return crearRespuestaJSON(db.productos[idx]);
      }
      if (method === "PUT") {
        const actual = { ...db.productos[idx], ...bodyObj };
        if (!actual.codigo_barras || !String(actual.codigo_barras).trim()) {
          actual.codigo_barras = `SIN-COD-${String(prodId).padStart(4, "0")}`;
        }
        db.productos[idx] = actual;
        guardarBD(db);
        return crearRespuestaJSON(actual);
      }
      if (method === "DELETE") {
        db.productos.splice(idx, 1);
        guardarBD(db);
        return crearRespuestaJSON({
          mensaje: "Producto eliminado correctamente",
          id: prodId,
        });
      }
    }

    // 6. GET / POST /api/clientes
    if (path.endsWith("/api/clientes") && method === "GET") {
      const tel = (urlObj.searchParams.get("telefono") || "").trim().toLowerCase();
      let lista = [...db.clientes].reverse();
      if (tel) {
        lista = lista.filter(
          (c) =>
            (c.telefono || "").toLowerCase().includes(tel) ||
            (c.nombre || "").toLowerCase().includes(tel)
        );
      }
      return crearRespuestaJSON(lista);
    }

    if (path.endsWith("/api/clientes") && method === "POST") {
      const nextId =
        db.clientes.reduce((max, c) => Math.max(max, c.id || 0), 0) + 1;
      const nuevoCli = {
        id: nextId,
        nombre: (bodyObj.nombre || "").trim(),
        telefono: (bodyObj.telefono || "").trim(),
        email: bodyObj.email || null,
        fecha_registro: obtenerFechaHoraActual(),
      };
      db.clientes.push(nuevoCli);
      guardarBD(db);
      return crearRespuestaJSON(nuevoCli, 201);
    }

    // 7. POST /api/ventas (Checkout Transaccional con Rollback)
    if (path.endsWith("/api/ventas") && method === "POST") {
      const items = Array.isArray(bodyObj.items) ? bodyObj.items : [];
      if (items.length === 0) {
        return crearRespuestaJSON({ detail: "El carrito está vacío" }, 400);
      }

      // Validar stock antes de aplicar cambios (atomicidad / rollback)
      let totalVenta = 0;
      let gananciaVenta = 0;
      const detalles = [];

      for (const item of items) {
        const prod = db.productos.find((p) => p.id === item.producto_id);
        if (!prod) {
          return crearRespuestaJSON(
            { detail: `Producto ID ${item.producto_id} no existe` },
            404
          );
        }
        if (prod.stock_actual < item.cantidad) {
          return crearRespuestaJSON(
            {
              detail: `Stock insuficiente para la venta: '${prod.nombre}' (Disponible: ${prod.stock_actual}, Solicitado: ${item.cantidad})`,
            },
            400
          );
        }
        const subtotal = Number((prod.precio_venta * item.cantidad).toFixed(2));
        const gananciaItem = Number(
          ((prod.precio_venta - prod.precio_costo) * item.cantidad).toFixed(2)
        );
        totalVenta = Number((totalVenta + subtotal).toFixed(2));
        gananciaVenta = Number((gananciaVenta + gananciaItem).toFixed(2));
        detalles.push({
          producto_id: prod.id,
          nombre: prod.nombre,
          cantidad: item.cantidad,
          precio_unitario: prod.precio_venta,
          subtotal,
        });
      }

      // Gestionar cliente nuevo o existente
      let clienteId = bodyObj.cliente_id || null;
      if (!clienteId && bodyObj.nuevo_cliente) {
        const tel = (bodyObj.nuevo_cliente.telefono || "").trim();
        const existente = db.clientes.find((c) => c.telefono === tel);
        if (existente) {
          clienteId = existente.id;
        } else {
          const nextCliId =
            db.clientes.reduce((max, c) => Math.max(max, c.id || 0), 0) + 1;
          const nuevoCli = {
            id: nextCliId,
            nombre: (bodyObj.nuevo_cliente.nombre || "").trim(),
            telefono: tel,
            email: bodyObj.nuevo_cliente.email || null,
            fecha_registro: obtenerFechaHoraActual(),
          };
          db.clientes.push(nuevoCli);
          clienteId = nextCliId;
        }
      }

      // Descontar stock y guardar venta
      for (const det of detalles) {
        const prod = db.productos.find((p) => p.id === det.producto_id);
        prod.stock_actual -= det.cantidad;
      }

      const nextVentaId =
        db.ventas.reduce((max, v) => Math.max(max, v.id || 0), 0) + 1;
      const fechaVenta = obtenerFechaHoraActual();
      db.ventas.push({
        id: nextVentaId,
        fecha_venta: fechaVenta,
        cliente_id: clienteId,
        usuario_id: 1,
        total: totalVenta,
        ganancia: gananciaVenta,
      });

      guardarBD(db);

      const cliInfo = clienteId
        ? db.clientes.find((c) => c.id === clienteId) || null
        : null;

      return crearRespuestaJSON(
        {
          venta_id: nextVentaId,
          fecha_venta: fechaVenta,
          cliente: cliInfo,
          total: totalVenta,
          items: detalles,
          mensaje: "Venta procesada exitosamente",
        },
        201
      );
    }

    // 8. GET /api/admin/dashboard
    if (path.endsWith("/api/admin/dashboard") && method === "GET") {
      const hoyISO = obtenerFechaHoyISO();
      const ventasHoy = db.ventas.filter((v) =>
        (v.fecha_venta || "").startsWith(hoyISO)
      );

      const ventasHoyMonto = Number(
        ventasHoy.reduce((acc, v) => acc + Number(v.total || 0), 0).toFixed(2)
      );
      const gananciaHoyMonto = Number(
        ventasHoy.reduce((acc, v) => acc + Number(v.ganancia || 0), 0).toFixed(2)
      );
      const ingresosTotales = Number(
        db.ventas.reduce((acc, v) => acc + Number(v.total || 0), 0).toFixed(2)
      );
      const gananciaTotal = Number(
        db.ventas.reduce((acc, v) => acc + Number(v.ganancia || 0), 0).toFixed(2)
      );

      const inventario = [...db.productos].sort(
        (a, b) => a.stock_actual - a.stock_minimo - (b.stock_actual - b.stock_minimo)
      );
      const alertasCriticas = inventario.filter(
        (p) => p.stock_actual <= p.stock_minimo
      );

      const curva7Dias = [];
      const baseDate = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() - i);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;
        const etiqueta = `${String(d.getDate()).padStart(2, "0")}/${String(
          d.getMonth() + 1
        ).padStart(2, "0")}`;
        const ventasDia = db.ventas.filter((v) =>
          (v.fecha_venta || "").startsWith(iso)
        );
        const totalDia = Number(
          ventasDia.reduce((acc, v) => acc + Number(v.total || 0), 0).toFixed(2)
        );
        curva7Dias.push({
          fecha: iso,
          etiqueta,
          total: totalDia,
          ventas: ventasDia.length,
        });
      }

      const ultimasVentas = [...db.ventas]
        .reverse()
        .slice(0, 10)
        .map((v) => {
          const cli = v.cliente_id
            ? db.clientes.find((c) => c.id === v.cliente_id)
            : null;
          return {
            id: v.id,
            fecha_venta: v.fecha_venta,
            total: v.total,
            cliente_nombre: cli ? cli.nombre : "Cliente de Mostrador",
            cliente_telefono: cli ? cli.telefono : "-",
            cajero: "admin",
          };
        });

      return crearRespuestaJSON({
        usuario_autenticado: { id: 1, username: "admin", rol: "admin" },
        fecha_consulta: hoyISO,
        kpis: {
          ventas_hoy_monto: ventasHoyMonto,
          ganancia_hoy_monto: gananciaHoyMonto,
          transacciones_hoy: ventasHoy.length,
          ingresos_totales: ingresosTotales,
          ganancia_total: gananciaTotal,
          total_transacciones: db.ventas.length,
          total_clientes: db.clientes.length,
          productos_criticos: alertasCriticas.length,
          total_productos: inventario.length,
        },
        historico_7_dias: curva7Dias,
        inventario,
        alertas_stock: alertasCriticas,
        ultimas_ventas: ultimasVentas,
      });
    }

    return null;
  }

  // Envolver window.fetch para usar FastAPI si responde, o el motor Serverless en Cloudflare
  window.fetch = async function (input, options) {
    const urlStr = typeof input === "string" ? input : input.url || "";
    if (!urlStr.includes("/api/")) {
      return originalFetch(input, options);
    }

    const urlObj = new URL(urlStr, window.location.origin);

    // En Cloudflare (*.workers.dev / *.pages.dev) o cuando el backend Python no esté presente:
    const esCloudflare =
      window.location.hostname.endsWith(".workers.dev") ||
      window.location.hostname.endsWith(".pages.dev");

    if (!esCloudflare) {
      try {
        const resp = await originalFetch(input, options);
        const contentType = resp.headers.get("content-type") || "";
        // Si el backend FastAPI respondió JSON válido (incluso 400 o 401 legítimo de negocio), devolverlo
        if (
          resp.status !== 404 &&
          resp.status !== 405 &&
          resp.status < 500 &&
          contentType.includes("application/json")
        ) {
          return resp;
        }
      } catch (err) {
        // Si falla la red local, cae de forma transparente al motor local
      }
    }

    const localResp = await procesarRutaLocal(urlObj, options);
    if (localResp) {
      return localResp;
    }
    return originalFetch(input, options);
  };
})();
