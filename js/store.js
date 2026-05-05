(function () {
  "use strict";

  const AG = window.AltaGula;
  const state = {
    products: [],
    cart: [],
    category: "Todos",
    query: ""
  };

  const elements = {};

  function $(selector) {
    return document.querySelector(selector);
  }

  function init() {
    Object.assign(elements, {
      grid: $("#productsGrid"),
      filters: $("#categoryFilters"),
      search: $("#productSearch"),
      cartButton: $("#cartButton"),
      closeCart: $("#closeCart"),
      cartDrawer: $("#cartDrawer"),
      cartBackdrop: $("#cartBackdrop"),
      cartItems: $("#cartItems"),
      cartTotal: $("#cartTotal"),
      cartCount: $("#cartCount"),
      checkoutButton: $("#checkoutButton"),
      clearCartButton: $("#clearCartButton"),
      themeToggle: $("#themeToggle"),
      toast: $("#toast")
    });

    state.products = AG.visibleProducts();
    state.cart = AG.getCart();
    renderFilters();
    renderProducts();
    renderCart();
    bindEvents();
  }

  function bindEvents() {
    elements.search.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      renderProducts();
    });

    elements.cartButton.addEventListener("click", openCart);
    elements.closeCart.addEventListener("click", closeCart);
    elements.cartBackdrop.addEventListener("click", closeCart);
    elements.checkoutButton.addEventListener("click", checkout);
    elements.clearCartButton.addEventListener("click", clearCart);
    elements.themeToggle.addEventListener("click", () => {
      const theme = AG.toggleTheme();
      elements.themeToggle.setAttribute("aria-label", theme === "light" ? "Activar modo oscuro" : "Activar modo claro");
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeCart();
    });

    window.addEventListener("altaGula:productsChanged", () => {
      state.products = AG.visibleProducts();
      renderProducts();
    });
  }

  function renderFilters() {
    const filters = ["Todos", ...AG.categories];
    elements.filters.innerHTML = filters.map((category) => `
      <button class="filter-btn ${category === state.category ? "active" : ""}" type="button" data-category="${AG.escapeHtml(category)}" aria-pressed="${category === state.category}">
        ${AG.escapeHtml(category)}
      </button>
    `).join("");

    elements.filters.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.category = button.dataset.category;
        renderFilters();
        renderProducts();
      });
    });
  }

  function getFilteredProducts() {
    return state.products.filter((product) => {
      const matchesCategory = state.category === "Todos" || product.category === state.category;
      const haystack = `${product.name} ${product.description} ${product.category}`.toLowerCase();
      return matchesCategory && haystack.includes(state.query);
    });
  }

  function productImage(product, className = "") {
    if (product.imageUrl) {
      return `<img src="${AG.escapeHtml(product.imageUrl)}" alt="${AG.escapeHtml(product.name)}" loading="lazy" onerror="this.closest('.product-media, .cart-thumb, .admin-thumb')?.classList.add('image-error'); this.remove();">`;
    }
    return `<span class="${className}">${AG.escapeHtml(product.category.slice(0, 1))}</span>`;
  }

  function renderProducts() {
    const products = getFilteredProducts();
    if (!products.length) {
      elements.grid.innerHTML = `<div class="empty-state">No encontramos productos con esos filtros.</div>`;
      return;
    }

    elements.grid.innerHTML = products.map((product) => {
      const soldOut = product.stock <= 0;
      return `
        <article class="product-card">
          <div class="product-media">
            ${productImage(product, "product-fallback")}
            <span class="stock-label ${soldOut ? "sold-out" : ""}">${soldOut ? "Agotado" : `${product.stock} disp.`}</span>
          </div>
          <div class="product-body">
            <span class="product-kicker">${AG.escapeHtml(product.category)}</span>
            <h3>${AG.escapeHtml(product.name)}</h3>
            <p>${AG.escapeHtml(product.description || "Producto seleccionado de Alta GULA Delivery.")}</p>
            <strong class="product-price">${AG.formatPrice(product.price)}</strong>
          </div>
          <div class="product-actions">
            <button class="btn btn-primary" type="button" data-add="${AG.escapeHtml(product.id)}" ${soldOut ? "disabled" : ""}>
              ${soldOut ? "Sin stock" : "Agregar al carrito"}
            </button>
          </div>
        </article>
      `;
    }).join("");

    elements.grid.querySelectorAll("[data-add]").forEach((button) => {
      button.addEventListener("click", () => addToCart(button.dataset.add));
    });
  }

  function addToCart(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) return;
    const existing = state.cart.find((item) => item.id === productId);
    const currentQty = existing ? existing.qty : 0;

    if (currentQty >= product.stock) {
      showToast("Ya agregaste todo el stock disponible.");
      return;
    }

    if (existing) existing.qty += 1;
    else state.cart.push({ id: product.id, qty: 1 });
    AG.saveCart(state.cart);
    renderCart();
    showToast(`${product.name} agregado al carrito.`);
  }

  function updateQty(productId, qty) {
    const product = state.products.find((item) => item.id === productId);
    const nextQty = Math.max(0, Math.min(Number(qty) || 0, product ? product.stock : 0));
    state.cart = state.cart
      .map((item) => item.id === productId ? { ...item, qty: nextQty } : item)
      .filter((item) => item.qty > 0);
    AG.saveCart(state.cart);
    renderCart();
  }

  function getCartLines() {
    return state.cart
      .map((item) => {
        const product = state.products.find((candidate) => candidate.id === item.id) || AG.getProducts().find((candidate) => candidate.id === item.id);
        return product ? { ...product, qty: Math.min(item.qty, product.stock) } : null;
      })
      .filter(Boolean)
      .filter((line) => line.qty > 0);
  }

  function renderCart() {
    const lines = getCartLines();
    const count = lines.reduce((sum, item) => sum + item.qty, 0);
    const total = lines.reduce((sum, item) => sum + item.qty * item.price, 0);
    elements.cartCount.textContent = count;
    elements.cartTotal.textContent = AG.formatPrice(total);
    elements.checkoutButton.disabled = lines.length === 0;
    elements.clearCartButton.disabled = lines.length === 0;

    if (!lines.length) {
      elements.cartItems.innerHTML = `<div class="empty-state">Tu carrito está vacío.</div>`;
      return;
    }

    elements.cartItems.innerHTML = lines.map((item) => `
      <article class="cart-item">
        <div class="cart-thumb">${item.imageUrl ? `<img src="${AG.escapeHtml(item.imageUrl)}" alt="" loading="lazy">` : AG.escapeHtml(item.category.slice(0, 1))}</div>
        <div>
          <h3>${AG.escapeHtml(item.name)}</h3>
          <div class="cart-meta">
            <span>${AG.formatPrice(item.price)} c/u</span>
            <strong>${AG.formatPrice(item.price * item.qty)}</strong>
          </div>
          <div class="qty-row">
            <div class="qty-control" aria-label="Cantidad de ${AG.escapeHtml(item.name)}">
              <button type="button" data-decrease="${AG.escapeHtml(item.id)}" aria-label="Restar ${AG.escapeHtml(item.name)}">-</button>
              <input type="number" min="0" max="${item.stock}" value="${item.qty}" data-qty="${AG.escapeHtml(item.id)}" aria-label="Cantidad">
              <button type="button" data-increase="${AG.escapeHtml(item.id)}" aria-label="Sumar ${AG.escapeHtml(item.name)}">+</button>
            </div>
            <button class="btn btn-ghost" type="button" data-remove="${AG.escapeHtml(item.id)}">Quitar</button>
          </div>
        </div>
      </article>
    `).join("");

    elements.cartItems.querySelectorAll("[data-decrease]").forEach((button) => {
      button.addEventListener("click", () => {
        const line = lines.find((item) => item.id === button.dataset.decrease);
        updateQty(button.dataset.decrease, line.qty - 1);
      });
    });

    elements.cartItems.querySelectorAll("[data-increase]").forEach((button) => {
      button.addEventListener("click", () => {
        const line = lines.find((item) => item.id === button.dataset.increase);
        updateQty(button.dataset.increase, line.qty + 1);
      });
    });

    elements.cartItems.querySelectorAll("[data-qty]").forEach((input) => {
      input.addEventListener("change", () => updateQty(input.dataset.qty, input.value));
    });

    elements.cartItems.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => updateQty(button.dataset.remove, 0));
    });
  }

  function openCart() {
    elements.cartDrawer.classList.add("open");
    elements.cartBackdrop.classList.add("open");
    elements.cartDrawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("lock-scroll");
    elements.closeCart.focus();
  }

  function closeCart() {
    elements.cartDrawer.classList.remove("open");
    elements.cartBackdrop.classList.remove("open");
    elements.cartDrawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lock-scroll");
  }

  function clearCart() {
    if (!state.cart.length || !confirm("¿Vaciar todo el carrito?")) return;
    state.cart = [];
    AG.saveCart(state.cart);
    renderCart();
  }

  function checkout() {
    const lines = getCartLines();
    if (!lines.length) return;
    const total = lines.reduce((sum, item) => sum + item.qty * item.price, 0);
    const summary = lines.map((item) => `- ${item.qty} x ${item.name} (${AG.formatPrice(item.price * item.qty)})`).join("\n");
    const message = `Hola Alta GULA Delivery, quiero hacer este pedido:\n${summary}\n\nTotal: ${AG.formatPrice(total)}\n\nMi nombre y dirección son:`;
    window.open(`https://wa.me/${AG.whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => elements.toast.classList.remove("show"), 2600);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
