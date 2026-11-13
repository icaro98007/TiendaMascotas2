let tokenJWT = null;
let salesChartInstance = null;
let inventarioCache = [];

const posAppView = document.getElementById("pos-app-view");
const adminAppView = document.getElementById("admin-app-view");
const openAdminPanelBtn = document.getElementById("open-admin-panel-btn");
const backToPosFromLogin = document.getElementById("back-to-pos-from-login");
const goToPosBtn = document.getElementById("go-to-pos-btn");

const loginScreen = document.getElementById("login-screen");
const loginCard = document.getElementById("login-card");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginErrorText = document.getElementById("login-error-text");
const dashboardLayout = document.getElementById("dashboard-layout");

// Función para ir a la Página de Ventas (vista inicial por defecto)
function abrirPaginaVentas() {
  adminAppView.classList.add("hidden");
  posAppView.classList.remove("hidden");
  if (typeof cargarProductos === "function") {
    const buscador = document.getElementById("search-input");
    cargarProductos(buscador ? buscador.value.trim() : "");
  }
}

// Función para abrir el Panel Administrador (solo cuando el usuario pulsa el botón)
function abrirPanelAdministrador() {
  posAppView.classList.add("hidden");
  adminAppView.classList.remove("hidden");

  if (tokenJWT) {
    mostrarDashboard();
  } else {
    loginScreen.classList.remove("hidden");
    dashboardLayout.classList.add("hidden");
  }
}

if (openAdminPanelBtn) {
  openAdminPanelBtn.addEventListener("click", abrirPanelAdministrador);
}
if (backToPosFromLogin) {
  backToPosFromLogin.addEventListener("click", abrirPaginaVentas);
}
if (goToPosBtn) {
  goToPosBtn.addEventListener("click", abrirPaginaVentas);
}

// Animación de contador numérico de 0 a N
function animarContador(elemento, valorFinal, esMoneda = false, duracion = 750) {
  const inicio = 0;
  const startTime = performance.now();

  function frame(now) {
    const progreso = Math.min((now - startTime) / duracion, 1);
    const ease = 1 - Math.pow(1 - progreso, 3);
    const actual = inicio + (valorFinal - inicio) * ease;

    if (esMoneda) {
      elemento.textContent = `$${actual.toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    } else {
      elemento.textContent = Math.round(actual).toLocaleString("es-MX");
    }

    if (progreso < 1) {
      requestAnimationFrame(frame);
    }
  }
  requestAnimationFrame(frame);
}

// Manejo de inicio de sesión en el Panel Administrador
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  loginCard.classList.remove("shake-anim");

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      loginErrorText.textContent = data.detail || "Credenciales incorrectas";
      loginError.classList.remove("hidden");
      void loginCard.offsetWidth;
      loginCard.classList.add("shake-anim");
      return;
    }

    tokenJWT = data.access_token;
    document.getElementById("admin-user-label").textContent = `${data.username} (${data.rol})`;
    mostrarDashboard();
  } catch (err) {
    loginErrorText.textContent = "No se pudo conectar con la API.";
    loginError.classList.remove("hidden");
  }
});

// Cerrar sesión -> limpia el token y regresa a la Página de Ventas
document.getElementById("logout-btn").addEventListener("click", () => {
  tokenJWT = null;
  localStorage.removeItem("petshop_jwt");
  dashboardLayout.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  abrirPaginaVentas();
});

async function mostrarDashboard(animar = true) {
  if (!tokenJWT) {
    loginScreen.classList.remove("hidden");
    dashboardLayout.classList.add("hidden");
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${tokenJWT}` },
    });

    if (resp.status === 401) {
      tokenJWT = null;
      loginScreen.classList.remove("hidden");
      dashboardLayout.classList.add("hidden");
      return;
    }

    const data = await resp.json();
    loginScreen.classList.add("hidden");
    dashboardLayout.classList.remove("hidden");

    if (data.usuario_autenticado) {
      document.getElementById("admin-user-label").textContent =
        `${data.usuario_autenticado.username} (${data.usuario_autenticado.rol})`;
    }

    renderizarKPIs(data.kpis, animar);
    renderizarGrafico7Dias(data.historico_7_dias);
    inventarioCache = data.inventario;
    renderizarAlertasCriticas(data.alertas_stock);
    renderizarTablaInventario(data.inventario);
    renderizarUltimasVentas(data.ultimas_ventas);
  } catch (err) {
    console.error("Error cargando dashboard:", err);
  }
}

function renderizarKPIs(kpis, animar = true) {
  const duracion = animar ? 750 : 1;
  animarContador(document.getElementById("kpi-ventas-hoy"), kpis.ventas_hoy_monto, true, duracion);
  animarContador(document.getElementById("kpi-ganancia-hoy"), kpis.ganancia_hoy_monto, true, duracion);
  animarContador(document.getElementById("kpi-clientes"), kpis.total_clientes, false, duracion);
  animarContador(document.getElementById("kpi-alertas"), kpis.productos_criticos, false, duracion);

  document.getElementById("kpi-transacciones-hoy").textContent =
    `${kpis.transacciones_hoy} venta(s) hoy (${kpis.total_transacciones} totales)`;
  document.getElementById("kpi-ganancia-total").textContent =
    `Ganancia hist.: $${Number(kpis.ganancia_total).toFixed(2)}`;
  document.getElementById("kpi-ingresos-totales").textContent =
    `Ingresos hist.: $${Number(kpis.ingresos_totales).toFixed(2)}`;
  document.getElementById("kpi-total-productos").textContent =
    `de ${kpis.total_productos} productos activos`;
}

function renderizarGrafico7Dias(historico) {
  const canvas = document.getElementById("salesChart");
  if (!canvas || typeof Chart === "undefined") return;
  const ctx = canvas.getContext("2d");
  const labels = historico.map((d) => d.etiqueta);
  const valores = historico.map((d) => d.total);

  if (salesChartInstance) {
    salesChartInstance.destroy();
  }

  salesChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Ventas ($)",
          data: valores,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.10)",
          borderWidth: 3,
          pointBackgroundColor: "#2563eb",
          pointRadius: 4,
          tension: 0.35,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => `$${val}`,
          },
        },
      },
    },
  });
}

function renderizarAlertasCriticas(alertas) {
  const badge = document.getElementById("critical-badge-count");
  const container = document.getElementById("critical-alerts-list");
  badge.textContent = alertas.length;

  if (alertas.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center py-8 text-green-600">
        <p class="text-xs font-bold">Todo el inventario está por encima del mínimo</p>
      </div>
    `;
    return;
  }

  container.innerHTML = alertas
    .map(
      (p) => `
      <div class="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between gap-2 animate-pulse">
        <div class="min-w-0">
          <p class="text-xs font-bold text-red-900 truncate">${p.nombre}</p>
          <p class="text-xs text-red-600">Código: ${p.codigo_barras}</p>
        </div>
        <div class="text-right">
          <span class="text-xs font-bold text-red-700 block">Stock: ${p.stock_actual}</span>
          <span class="text-xs text-red-500">Mín: ${p.stock_minimo}</span>
        </div>
      </div>
    `
    )
    .join("");
}

function renderizarTablaInventario(productos) {
  const tbody = document.getElementById("inventory-table-body");
  tbody.innerHTML = productos
    .map((p) => {
      const esCritico = p.stock_actual <= p.stock_minimo;
      const rowClass = esCritico
        ? "bg-red-50 animate-pulse text-red-900 font-medium"
        : "hover:bg-gray-50";
      const badgeHtml = esCritico
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-600 text-white">
             Crítico
           </span>`
        : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
             Normal
           </span>`;

      return `
        <tr class="${rowClass} transition">
          <td class="py-3 px-4 font-mono text-xs">${p.codigo_barras}</td>
          <td class="py-3 px-4 font-bold text-gray-900">${p.nombre}</td>
          <td class="py-3 px-4 text-xs text-gray-600">${p.categoria}</td>
          <td class="py-3 px-4 text-right text-gray-600">$${Number(p.precio_costo).toFixed(2)}</td>
          <td class="py-3 px-4 text-right font-bold text-gray-900">$${Number(p.precio_venta).toFixed(2)}</td>
          <td class="py-3 px-4 text-center font-bold">${p.stock_actual} <span class="text-xs font-normal text-gray-400">/ ${p.stock_minimo}</span></td>
          <td class="py-3 px-4 text-center">${badgeHtml}</td>
          <td class="py-3 px-4 text-right">
            <button
              data-edit="${p.id}"
              class="bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-md px-3 py-1 text-xs font-medium transition"
            >
              Editar
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.edit, 10);
      abrirModalProducto(inventarioCache.find((x) => x.id === id));
    });
  });
}

function renderizarUltimasVentas(ventas) {
  const tbody = document.getElementById("recent-sales-body");
  if (!ventas || ventas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-gray-400 text-xs">Aún no hay ventas registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = ventas
    .map(
      (v) => `
      <tr class="hover:bg-gray-50">
        <td class="py-3 px-4 font-mono font-bold text-blue-600">#${v.id}</td>
        <td class="py-3 px-4 text-xs text-gray-500">${v.fecha_venta}</td>
        <td class="py-3 px-4 font-medium text-gray-900">${v.cliente_nombre}</td>
        <td class="py-3 px-4 text-xs text-gray-500">${v.cliente_telefono}</td>
        <td class="py-3 px-4 text-right font-bold text-green-600">$${Number(v.total).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");
}

const productModal = document.getElementById("product-modal");
const productForm = document.getElementById("product-form");
const prodFormError = document.getElementById("prod-form-error");
const prodImageFile = document.getElementById("prod-image-file");
const prodImageUrl = document.getElementById("prod-image-url");
const prodImagePreview = document.getElementById("prod-image-preview");
const prodImageStatus = document.getElementById("prod-image-status");

// Subir archivo inmediatamente al seleccionarlo y guardarlo en el servidor
if (prodImageFile) {
  prodImageFile.addEventListener("change", async () => {
    const file = prodImageFile.files && prodImageFile.files[0];
    if (!file) return;

    prodImageStatus.textContent = "Subiendo y guardando imagen...";
    prodImageStatus.className = "text-xs text-blue-600 font-semibold";

    const formData = new FormData();
    formData.append("archivo", file);

    try {
      const resp = await fetch(`${API_BASE}/upload-imagen`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();

      if (!resp.ok) {
        prodImageStatus.textContent = data.detail || "No se pudo subir la imagen.";
        prodImageStatus.className = "text-xs text-red-600 font-semibold";
        return;
      }

      prodImageUrl.value = data.imagen_url;
      prodImagePreview.src = data.imagen_url;
      prodImageStatus.textContent = `✓ Imagen guardada (${file.name})`;
      prodImageStatus.className = "text-xs text-green-600 font-semibold";
    } catch (err) {
      prodImageStatus.textContent = "Error al subir la imagen al servidor.";
      prodImageStatus.className = "text-xs text-red-600 font-semibold";
    }
  });
}

function abrirModalProducto(producto = null) {
  prodFormError.classList.add("hidden");
  if (prodImageFile) prodImageFile.value = "";
  if (producto) {
    document.getElementById("product-modal-title").textContent = "Editar Producto / Stock";
    document.getElementById("prod-id").value = producto.id;
    document.getElementById("prod-barcode").value = producto.codigo_barras || "";
    document.getElementById("prod-category").value = producto.categoria;
    document.getElementById("prod-name").value = producto.nombre;
    document.getElementById("prod-cost").value = producto.precio_costo;
    document.getElementById("prod-price").value = producto.precio_venta;
    document.getElementById("prod-stock").value = producto.stock_actual;
    document.getElementById("prod-min").value = producto.stock_minimo;
    const imgActual =
      producto.imagen ||
      (typeof obtenerImagenProducto === "function"
        ? obtenerImagenProducto(producto)
        : "img/producto_1.webp");
    prodImageUrl.value = producto.imagen || "";
    prodImagePreview.src = imgActual;
    prodImageStatus.textContent = "Puedes seleccionar otra imagen para reemplazar la actual.";
    prodImageStatus.className = "text-xs text-gray-500";
  } else {
    document.getElementById("product-modal-title").textContent = "Nuevo Producto";
    productForm.reset();
    document.getElementById("prod-id").value = "";
    document.getElementById("prod-min").value = 5;
    prodImageUrl.value = "";
    prodImagePreview.src = "img/producto_1.webp";
    prodImageStatus.textContent =
      "Selecciona una imagen de tu equipo para guardarla en el catálogo.";
    prodImageStatus.className = "text-xs text-gray-500";
  }
  productModal.classList.remove("hidden");
  productModal.classList.add("flex");
}

function cerrarModalProducto() {
  productModal.classList.add("hidden");
  productModal.classList.remove("flex");
}

document.getElementById("open-new-product-btn").addEventListener("click", () => abrirModalProducto());
document.getElementById("close-product-modal").addEventListener("click", cerrarModalProducto);
document.getElementById("cancel-product-modal").addEventListener("click", cerrarModalProducto);
document.getElementById("refresh-dashboard-btn").addEventListener("click", mostrarDashboard);

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  prodFormError.classList.add("hidden");

  const id = document.getElementById("prod-id").value;
  const barcodeVal = document.getElementById("prod-barcode").value.trim();
  const imgVal = prodImageUrl.value.trim();

  const payload = {
    codigo_barras: barcodeVal || null,
    categoria: document.getElementById("prod-category").value.trim(),
    nombre: document.getElementById("prod-name").value.trim(),
    precio_costo: parseFloat(document.getElementById("prod-cost").value),
    precio_venta: parseFloat(document.getElementById("prod-price").value),
    stock_actual: parseInt(document.getElementById("prod-stock").value, 10),
    stock_minimo: parseInt(document.getElementById("prod-min").value, 10),
  };
  if (imgVal) {
    payload.imagen = imgVal;
  }

  const url = id ? `${API_BASE}/productos/${id}` : `${API_BASE}/productos`;
  const method = id ? "PUT" : "POST";

  const resp = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();

  if (!resp.ok) {
    prodFormError.textContent = data.detail || "Error al guardar el producto";
    prodFormError.classList.remove("hidden");
    return;
  }

  cerrarModalProducto();
  mostrarDashboard(false);
  if (typeof cargarProductos === "function") {
    cargarProductos("");
  }
});

// Garantizar que al cargar la página SIEMPRE arranque directo en la Página de Ventas (POS)
abrirPaginaVentas();
