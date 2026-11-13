const API_BASE = window.location.port === "8080"
  ? "http://localhost:8000/api"
  : "/api";

let catalogoProductos = [];
let carrito = [];
let categoriaActiva = "TODOS";
let modoCliente = "mostrador";
let clienteExistenteSeleccionado = null;

const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");
const categoryPills = document.getElementById("category-pills");
const productsGrid = document.getElementById("products-grid");
const productsLoading = document.getElementById("products-loading");

const cartItemsContainer = document.getElementById("cart-items-container");
const emptyCartView = document.getElementById("empty-cart-view");
const cartCountSubtitle = document.getElementById("cart-count-subtitle");
const cartSubtotalEl = document.getElementById("cart-subtotal");
const cartTotalEl = document.getElementById("cart-total");
const clearCartBtn = document.getElementById("clear-cart-btn");
const openCheckoutBtn = document.getElementById("open-checkout-btn");

const checkoutModal = document.getElementById("checkout-modal");
const checkoutFormView = document.getElementById("checkout-form-view");
const checkoutSuccessView = document.getElementById("checkout-success-view");
const closeModalBtn = document.getElementById("close-modal-btn");
const cancelCheckoutBtn = document.getElementById("cancel-checkout-btn");
const confirmPaymentBtn = document.getElementById("confirm-payment-btn");
const newSaleBtn = document.getElementById("new-sale-btn");
const modalTotalAmount = document.getElementById("modal-total-amount");
const modalItemsSummary = document.getElementById("modal-items-summary");
const checkoutErrorBox = document.getElementById("checkout-error-box");
const checkoutErrorText = document.getElementById("checkout-error-text");

function actualizarReloj() {
  const ahora = new Date();
  const el = document.getElementById("live-clock");
  if (el) {
    el.textContent = ahora.toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  }
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

function mostrarToast(mensaje, esError = false) {
  const toast = document.getElementById("toast-notification");
  const icon = document.getElementById("toast-icon");
  const text = document.getElementById("toast-message");

  icon.textContent = esError ? "⚠️" : "✅";
  text.textContent = mensaje;
  toast.classList.remove("hidden");
  toast.classList.add("flex");

  setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("flex");
  }, 3000);
}

async function cargarProductos(terminoBusqueda = "") {
  productsLoading.classList.remove("hidden");
  try {
    const url = terminoBusqueda
      ? `${API_BASE}/productos?buscar=${encodeURIComponent(terminoBusqueda)}`
      : `${API_BASE}/productos`;
    const resp = await fetch(url);
    const data = await resp.json();
    catalogoProductos = data;
    renderizarCategorias();
    renderizarCatalogo();
  } catch (err) {
    mostrarToast("Error al conectar con el servidor API", true);
  } finally {
    productsLoading.classList.add("hidden");
  }
}

function renderizarCategorias() {
  const categorias = ["TODOS", ...new Set(catalogoProductos.map((p) => p.categoria))];
  categoryPills.innerHTML = categorias
    .map((cat) => {
      const activo = cat === categoriaActiva;
      return `
        <button
          data-cat="${cat}"
          class="cat-btn px-3.5 py-1.5 rounded-full font-semibold whitespace-nowrap transition ${
            activo
              ? "bg-gray-900 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }"
        >
          ${cat}
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaActiva = btn.dataset.cat;
      renderizarCategorias();
      renderizarCatalogo();
    });
  });
}

function renderizarCatalogo() {
  const filtrados =
    categoriaActiva === "TODOS"
      ? catalogoProductos
      : catalogoProductos.filter((p) => p.categoria === categoriaActiva);

  if (filtrados.length === 0) {
    productsGrid.innerHTML = `
      <div class="col-span-full bg-white rounded-xl p-12 text-center border border-gray-200 text-gray-400">
        <p class="font-semibold text-gray-600">No se encontraron productos</p>
        <p class="text-xs mt-1">Intenta con otro término de búsqueda o categoría.</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = filtrados
    .map((p) => {
      const sinStock = p.stock_actual <= 0;
      const stockCritico = p.stock_actual > 0 && p.stock_actual <= p.stock_minimo;
      const badgeColor = sinStock
        ? "bg-red-100 text-red-700 border-red-200"
        : stockCritico
        ? "bg-yellow-100 text-yellow-800 border-yellow-300 animate-pulse"
        : "bg-green-50 text-green-700 border-green-200";

      return `
        <div
          data-id="${p.id}"
          class="product-card bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-400 transition flex flex-col justify-between ${
            sinStock ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
          }"
        >
          <div>
            <div class="flex items-start justify-between gap-2 mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">${
                p.categoria
              }</span>
              <span class="text-xs font-bold px-2.5 py-0.5 rounded-full border ${badgeColor}">
                ${sinStock ? "Agotado" : `Stock: ${p.stock_actual}`}
              </span>
            </div>

            <h3 class="font-bold text-gray-900 text-sm mt-1">${p.nombre}</h3>
            <p class="text-xs text-gray-400 font-mono mt-1">Código: ${p.codigo_barras}</p>
          </div>

          <div class="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span class="text-xl font-bold text-gray-900">$${Number(p.precio_venta).toFixed(
              2
            )}</span>
            <button
              type="button"
              ${sinStock ? "disabled" : ""}
              class="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition"
            >
              + Agregar
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = parseInt(card.dataset.id, 10);
      agregarAlCarrito(id);
    });
  });
}

function agregarAlCarrito(productoId) {
  const producto = catalogoProductos.find((p) => p.id === productoId);
  if (!producto) return;

  if (producto.stock_actual <= 0) {
    mostrarToast(`"${producto.nombre}" está agotado`, true);
    return;
  }

  const itemExistente = carrito.find((item) => item.producto.id === productoId);
  if (itemExistente) {
    if (itemExistente.cantidad + 1 > producto.stock_actual) {
      mostrarToast(
        `Stock máximo alcanzado para "${producto.nombre}" (${producto.stock_actual} disp.)`,
        true
      );
      return;
    }
    itemExistente.cantidad += 1;
  } else {
    carrito.push({ producto, cantidad: 1 });
  }

  renderizarCarrito();
}

function cambiarCantidadCarrito(productoId, delta) {
  const idx = carrito.findIndex((i) => i.producto.id === productoId);
  if (idx === -1) return;

  const item = carrito[idx];
  const nuevaCantidad = item.cantidad + delta;

  if (nuevaCantidad <= 0) {
    carrito.splice(idx, 1);
  } else if (nuevaCantidad > item.producto.stock_actual) {
    mostrarToast(
      `Solo hay ${item.producto.stock_actual} unidades disponibles de "${item.producto.nombre}"`,
      true
    );
    return;
  } else {
    item.cantidad = nuevaCantidad;
  }
  renderizarCarrito();
}

function renderizarCarrito() {
  if (carrito.length === 0) {
    emptyCartView.classList.remove("hidden");
    cartItemsContainer.innerHTML = "";
    cartItemsContainer.appendChild(emptyCartView);
    cartCountSubtitle.textContent = "0 artículos seleccionados";
    cartSubtotalEl.textContent = "$0.00";
    cartTotalEl.textContent = "$0.00";
    openCheckoutBtn.disabled = true;
    return;
  }

  emptyCartView.classList.add("hidden");
  let totalUnidades = 0;
  let montoTotal = 0;

  cartItemsContainer.innerHTML = carrito
    .map(({ producto, cantidad }) => {
      const subtotal = producto.precio_venta * cantidad;
      totalUnidades += cantidad;
      montoTotal += subtotal;
      return `
        <div class="cart-item-anim bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <h4 class="font-bold text-gray-900 text-xs truncate">${producto.nombre}</h4>
            <p class="text-xs text-gray-500">
              $${Number(producto.precio_venta).toFixed(2)} c/u
            </p>
          </div>

          <div class="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-1.5 py-1">
            <button
              type="button"
              data-action="dec"
              data-id="${producto.id}"
              class="w-6 h-6 rounded hover:bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold"
            >
              -
            </button>
            <span class="w-6 text-center font-bold text-xs">${cantidad}</span>
            <button
              type="button"
              data-action="inc"
              data-id="${producto.id}"
              class="w-6 h-6 rounded hover:bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold"
            >
              +
            </button>
          </div>

          <div class="text-right" style="min-width: 68px;">
            <span class="font-bold text-gray-900 text-xs block">$${subtotal.toFixed(2)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  cartCountSubtitle.textContent = `${totalUnidades} artículo(s) en la cuenta`;
  cartSubtotalEl.textContent = `$${montoTotal.toFixed(2)}`;
  cartTotalEl.textContent = `$${montoTotal.toFixed(2)}`;
  openCheckoutBtn.disabled = false;

  cartItemsContainer.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      const delta = btn.dataset.action === "inc" ? 1 : -1;
      cambiarCantidadCarrito(id, delta);
    });
  });
}

let debounceTimer = null;
searchInput.addEventListener("input", () => {
  const val = searchInput.value.trim();
  clearSearchBtn.classList.toggle("hidden", val.length === 0);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    cargarProductos(val);
  }, 180);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const val = searchInput.value.trim();
    if (!val) return;
    const exacto = catalogoProductos.find(
      (p) => p.codigo_barras.toLowerCase() === val.toLowerCase()
    );
    if (exacto) {
      agregarAlCarrito(exacto.id);
      searchInput.value = "";
      clearSearchBtn.classList.add("hidden");
      cargarProductos("");
      mostrarToast(`Agregado: ${exacto.nombre}`);
    }
  }
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  clearSearchBtn.classList.add("hidden");
  cargarProductos("");
});

clearCartBtn.addEventListener("click", () => {
  carrito = [];
  renderizarCarrito();
});

function configurarModoCliente(modo) {
  modoCliente = modo;
  clienteExistenteSeleccionado = null;
  document.getElementById("client-search-result").innerHTML = "";
  checkoutErrorBox.classList.add("hidden");

  document.querySelectorAll(".client-mode-btn").forEach((btn) => {
    if (btn.dataset.mode === modo) {
      btn.className =
        "client-mode-btn py-2 px-3 rounded-md bg-white text-gray-900 shadow-sm transition";
    } else {
      btn.className =
        "client-mode-btn py-2 px-3 rounded-md text-gray-600 hover:text-gray-900 transition";
    }
  });

  document
    .getElementById("panel-cliente-existente")
    .classList.toggle("hidden", modo !== "existente");
  document
    .getElementById("panel-cliente-nuevo")
    .classList.toggle("hidden", modo !== "nuevo");
}

document.querySelectorAll(".client-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => configurarModoCliente(btn.dataset.mode));
});

document.getElementById("btn-search-client").addEventListener("click", async () => {
  const tel = document.getElementById("search-client-phone").value.trim();
  const resultDiv = document.getElementById("client-search-result");
  if (!tel) {
    resultDiv.innerHTML = `<span class="text-red-600 font-semibold">Ingresa un teléfono o nombre para buscar.</span>`;
    return;
  }

  const resp = await fetch(`${API_BASE}/clientes?telefono=${encodeURIComponent(tel)}`);
  const lista = await resp.json();
  if (lista.length === 0) {
    clienteExistenteSeleccionado = null;
    resultDiv.innerHTML = `<span class="text-yellow-700 font-medium">No se encontró cliente con "${tel}". Puedes registrarlo en la pestaña "Cliente Nuevo".</span>`;
  } else {
    clienteExistenteSeleccionado = lista[0];
    resultDiv.innerHTML = `
      <div class="bg-green-50 border border-green-200 text-green-800 p-2.5 rounded-lg flex items-center justify-between">
        <div>
          <strong>${clienteExistenteSeleccionado.nombre}</strong> (${clienteExistenteSeleccionado.telefono})
        </div>
        <span class="text-xs uppercase font-bold bg-green-200 px-2 py-0.5 rounded">Seleccionado</span>
      </div>
    `;
  }
});

openCheckoutBtn.addEventListener("click", () => {
  if (carrito.length === 0) return;

  const total = carrito.reduce((acc, i) => acc + i.producto.precio_venta * i.cantidad, 0);
  const unidades = carrito.reduce((acc, i) => acc + i.cantidad, 0);

  modalTotalAmount.textContent = `$${total.toFixed(2)}`;
  modalItemsSummary.textContent = `${unidades} artículo(s) a procesar`;

  checkoutFormView.classList.remove("hidden");
  checkoutSuccessView.classList.add("hidden");
  checkoutErrorBox.classList.add("hidden");
  configurarModoCliente("mostrador");

  checkoutModal.classList.remove("hidden");
  checkoutModal.classList.add("flex");
});

function cerrarModalCheckout() {
  checkoutModal.classList.add("hidden");
  checkoutModal.classList.remove("flex");
}

closeModalBtn.addEventListener("click", cerrarModalCheckout);
cancelCheckoutBtn.addEventListener("click", cerrarModalCheckout);

confirmPaymentBtn.addEventListener("click", async () => {
  checkoutErrorBox.classList.add("hidden");

  const payload = {
    items: carrito.map((i) => ({
      producto_id: i.producto.id,
      cantidad: i.cantidad,
    })),
    usuario_id: 1,
  };

  if (modoCliente === "existente") {
    if (!clienteExistenteSeleccionado) {
      checkoutErrorText.textContent =
        "Busca y selecciona un cliente existente, o cambia a 'Mostrador'.";
      checkoutErrorBox.classList.remove("hidden");
      return;
    }
    payload.cliente_id = clienteExistenteSeleccionado.id;
  } else if (modoCliente === "nuevo") {
    const nombre = document.getElementById("new-client-name").value.trim();
    const telefono = document.getElementById("new-client-phone").value.trim();
    const email = document.getElementById("new-client-email").value.trim();

    if (!nombre || !telefono) {
      checkoutErrorText.textContent =
        "Por favor ingresa el Nombre y Teléfono del nuevo cliente.";
      checkoutErrorBox.classList.remove("hidden");
      return;
    }
    payload.nuevo_cliente = { nombre, telefono, email: email || null };
  }

  confirmPaymentBtn.disabled = true;
  confirmPaymentBtn.innerHTML = `<span>Procesando...</span>`;

  try {
    const resp = await fetch(`${API_BASE}/ventas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();

    if (!resp.ok) {
      checkoutErrorText.textContent = data.detail || "No se pudo procesar la venta.";
      checkoutErrorBox.classList.remove("hidden");
      return;
    }

    checkoutFormView.classList.add("hidden");
    checkoutSuccessView.classList.remove("hidden");
    const nombreCli = data.cliente ? data.cliente.nombre : "Cliente de Mostrador";
    document.getElementById("success-receipt-details").innerHTML = `
      Folio de Venta <strong>#${data.venta_id}</strong> &bull; Cliente: <strong>${nombreCli}</strong><br/>
      Total Cobrado: <strong class="text-green-600">$${Number(data.total).toFixed(2)}</strong>
    `;

    carrito = [];
    renderizarCarrito();
    await cargarProductos(searchInput.value.trim());
  } catch (err) {
    checkoutErrorText.textContent = "Error de red al procesar la transacción.";
    checkoutErrorBox.classList.remove("hidden");
  } finally {
    confirmPaymentBtn.disabled = false;
    confirmPaymentBtn.innerHTML = `<span>Confirmar Pago Total</span>`;
  }
});

newSaleBtn.addEventListener("click", () => {
  cerrarModalCheckout();
  searchInput.focus();
});

cargarProductos();
