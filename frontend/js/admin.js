const API_BASE = window.location.port === "8080"
  ? "http://localhost:8000/api"
  : "/api";

let tokenJWT = localStorage.getItem("petshop_jwt") || null;
let salesChartInstance = null;
let inventarioCache = [];

const loginScreen = document.getElementById("login-screen");
const loginCard = document.getElementById("login-card");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginErrorText = document.getElementById("login-error-text");
const dashboardLayout = document.getElementById("dashboard-layout");

// Animación de contador numérico de 0 a N
function animarContador(elemento, valorFinal, esMoneda = false, duracion = 850) {
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

// Login Handler
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
    localStorage.setItem("petshop_jwt", tokenJWT);
    document.getElementById("admin-user-label").textContent = `${data.username} (${data.rol})`;
    mostrarDashboard();
  } catch (err) {
    loginErrorText.textContent = "No se pudo conectar con la API.";
    loginError.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  tokenJWT = null;
  localStorage.removeItem("petshop_jwt");
  dashboardLayout.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

async function mostrarDashboard() {
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
      localStorage.removeItem("petshop_jwt");
      tokenJWT = null;
      loginScreen.classList.remove("hidden");
      dashboardLayout.classList.add("hidden");
      return;
    }

    const data = await resp.json();
    loginScreen.classList.add("hidden");
    dashboardLayout.classList.remove("hidden");

    renderizarKPIs(data.kpis);
    renderizarGrafico7Dias(data.historico_7_dias);
    inventarioCache = data.inventario;
    renderizarAlertasCriticas(data.alertas_stock);
    renderizarTablaInventario(data.inventario);
    renderizarUltimasVentas(data.ultimas_ventas);
  } catch (err) {
    console.error("Error cargando dashboard:", err);
  }
}

function renderizarKPIs(kpis) {
  animarContador(document.getElementById("kpi-ventas-hoy"), kpis.ventas_hoy_monto, true);
  animarContador(document.getElementById("kpi-ganancia-hoy"), kpis.ganancia_hoy_monto, true);
  animarContador(document.getElementById("kpi-clientes"), kpis.total_clientes, false);
  animarContador(document.getElementById("kpi-alertas"), kpis.productos_criticos, false);

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
  const ctx = document.getElementById("salesChart").getContext("2d");
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
          borderColor: "#4f46e5",
          backgroundColor: "rgba(79, 70, 229, 0.12)",
          borderWidth: 3,
          pointBackgroundColor: "#f59e0b",
          pointRadius: 5,
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
      <div class="h-full flex flex-col items-center justify-center text-center py-8 text-emerald-600">
        <i class="fa-solid fa-circle-check text-3xl mb-2"></i>
        <p class="text-xs font-bold">Todo el inventario está por encima del mínimo</p>
      </div>
    `;
    return;
  }

  container.innerHTML = alertas
    .map(
      (p) => `
      <div class="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 animate-pulse">
        <div class="min-w-0">
          <p class="text-xs font-bold text-rose-900 truncate">${p.nombre}</p>
          <p class="text-[11px] text-rose-600">Código: ${p.codigo_barras}</p>
        </div>
        <div class="text-right shrink-0">
          <span class="text-xs font-extrabold text-rose-700 block">Stock: ${p.stock_actual}</span>
          <span class="text-[10px] text-rose-500">Mín: ${p.stock_minimo}</span>
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
        ? "bg-rose-50/90 animate-pulse text-rose-900 font-medium"
        : "hover:bg-slate-50";
      const badgeHtml = esCritico
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-600 text-white shadow-sm">
             <i class="fa-solid fa-bell"></i> Crítico
           </span>`
        : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
             <i class="fa-solid fa-check"></i> Normal
           </span>`;

      return `
        <tr class="${rowClass} transition">
          <td class="py-3 px-4 font-mono text-xs">${p.codigo_barras}</td>
          <td class="py-3 px-4 font-bold">${p.nombre}</td>
          <td class="py-3 px-4 text-xs">${p.categoria}</td>
          <td class="py-3 px-4 text-right">$${Number(p.precio_costo).toFixed(2)}</td>
          <td class="py-3 px-4 text-right font-bold">$${Number(p.precio_venta).toFixed(2)}</td>
          <td class="py-3 px-4 text-center font-bold">${p.stock_actual} <span class="text-xs font-normal text-slate-400">/ ${p.stock_minimo}</span></td>
          <td class="py-3 px-4 text-center">${badgeHtml}</td>
          <td class="py-3 px-4 text-right">
            <button
              data-edit="${p.id}"
              class="px-2.5 py-1 rounded-lg bg-slate-200/80 hover:bg-indigo-600 hover:text-white text-slate-700 text-xs font-semibold transition"
            >
              <i class="fa-solid fa-pen-to-square"></i> Editar
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
    tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400 text-xs">Aún no hay ventas registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = ventas
    .map(
      (v) => `
      <tr class="hover:bg-slate-50">
        <td class="py-3 px-4 font-mono font-bold text-indigo-600">#${v.id}</td>
        <td class="py-3 px-4 text-xs text-slate-500">${v.fecha_venta}</td>
        <td class="py-3 px-4 font-semibold">${v.cliente_nombre}</td>
        <td class="py-3 px-4 text-xs text-slate-500">${v.cliente_telefono}</td>
        <td class="py-3 px-4 text-right font-extrabold text-emerald-600">$${Number(v.total).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");
}

// Modal de Producto (Crear / Editar)
const productModal = document.getElementById("product-modal");
const productForm = document.getElementById("product-form");
const prodFormError = document.getElementById("prod-form-error");

function abrirModalProducto(producto = null) {
  prodFormError.classList.add("hidden");
  if (producto) {
    document.getElementById("product-modal-title").textContent = "Editar Producto / Stock";
    document.getElementById("prod-id").value = producto.id;
    document.getElementById("prod-barcode").value = producto.codigo_barras;
    document.getElementById("prod-category").value = producto.categoria;
    document.getElementById("prod-name").value = producto.nombre;
    document.getElementById("prod-cost").value = producto.precio_costo;
    document.getElementById("prod-price").value = producto.precio_venta;
    document.getElementById("prod-stock").value = producto.stock_actual;
    document.getElementById("prod-min").value = producto.stock_minimo;
  } else {
    document.getElementById("product-modal-title").textContent = "Nuevo Producto";
    productForm.reset();
    document.getElementById("prod-id").value = "";
    document.getElementById("prod-min").value = 5;
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
  const payload = {
    codigo_barras: document.getElementById("prod-barcode").value.trim(),
    categoria: document.getElementById("prod-category").value.trim(),
    nombre: document.getElementById("prod-name").value.trim(),
    precio_costo: parseFloat(document.getElementById("prod-cost").value),
    precio_venta: parseFloat(document.getElementById("prod-price").value),
    stock_actual: parseInt(document.getElementById("prod-stock").value, 10),
    stock_minimo: parseInt(document.getElementById("prod-min").value, 10),
  };

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
  mostrarDashboard();
});

// Auto-inicio si ya hay token guardado
if (tokenJWT) {
  mostrarDashboard();
}
