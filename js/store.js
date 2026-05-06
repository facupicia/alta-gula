(function () {
  "use strict";

  const AG = window.AltaGula;
  const MIN_ORDER_TOTAL = 1000;
  const DELIVERY_FEE = 1500;
  const state = {
    products: [],
    cart: [],
    category: "Todos",
    query: "",
    catalogError: false,
    activeProductId: null,
    modalQty: 1
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
      mobileCartSummary: $("#mobileCartSummary"),
      mobileCartCount: $("#mobileCartCount"),
      mobileCartTotal: $("#mobileCartTotal"),
      checkoutButton: $("#checkoutButton"),
      checkoutForm: $("#checkoutForm"),
      checkoutSection: $("#checkout"),
      checkoutSummary: $("#checkoutSummary"),
      checkoutTotal: $("#checkoutTotal"),
      checkoutStatus: $("#checkoutStatus"),
      shippingMethod: $("#shippingMethod"),
      customerAddress: $("#customerAddress"),
      customerAddressLabel: $("label[for='customerAddress']"),
      customerName: $("#customerName"),
      paymentTransfer: $("#paymentTransfer"),
      transferInfo: $("#transferInfo"),
      transferDetails: $("#transferDetails"),
      copyTransferButton: $("#copyTransferButton"),
      sendWhatsappButton: $("#sendWhatsappButton"),
      clearCartButton: $("#clearCartButton"),
      productModal: $("#productModal"),
      productModalBackdrop: $("#productModalBackdrop"),
      productModalContent: $("#productModalContent"),
      closeProductModal: $("#closeProductModal"),
      toast: $("#toast")
    });

    state.cart = AG.getCart();
    renderFilters();
    renderProducts();
    renderCart();
    bindEvents();
    loadSheetProducts();
  }

  function bindEvents() {
    elements.search.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      renderProducts();
    });

    elements.cartButton.addEventListener("click", openCart);
    elements.mobileCartSummary.addEventListener("click", openCart);
    elements.closeCart.addEventListener("click", closeCart);
    elements.cartBackdrop.addEventListener("click", closeCart);
    elements.closeProductModal.addEventListener("click", closeProductModal);
    elements.productModalBackdrop.addEventListener("click", closeProductModal);
    elements.productModalContent.addEventListener("click", handleProductModalClick);
    elements.productModalContent.addEventListener("change", handleProductModalChange);
    elements.checkoutButton.addEventListener("click", goToCheckout);
    elements.checkoutForm.addEventListener("submit", sendCheckoutToWhatsapp);
    elements.shippingMethod.addEventListener("change", () => {
      updateAddressFieldState();
      renderCheckoutSummary();
    });
    elements.clearCartButton.addEventListener("click", clearCart);
    elements.copyTransferButton.addEventListener("click", copyTransferDetails);
    document.addEventListener("change", handlePaymentMethodChange);
    updateTransferInfoVisibility();
    updateAddressFieldState();

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (isProductModalOpen()) closeProductModal();
        else closeCart();
      }
    });

  }

  function handlePaymentMethodChange(event) {
    if (event.target.name !== "paymentMethod") return;
    updateTransferInfoVisibility();
  }

  function updateTransferInfoVisibility() {
    elements.transferInfo.dataset.visible = elements.paymentTransfer.checked ? "true" : "false";
  }

  async function copyTransferDetails() {
    const transferText = [...elements.transferDetails.querySelectorAll("[data-copy-line]")]
      .map((line) => line.textContent.trim())
      .filter(Boolean)
      .join("\n");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(transferText);
      } else if (!copyTextFallback(transferText)) {
        throw new Error("Clipboard unavailable");
      }
      showToast("Datos de transferencia copiados.");
    } catch (error) {
      showToast("No se pudieron copiar los datos.");
    }
  }

  function copyTextFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }

  function renderFilters() {
    const filters = ["Todos", ...AG.getCatalogCategories(state.products)];
    elements.filters.innerHTML = filters.map((category) => `
      <button class="filter-btn ${category === state.category ? "active" : ""}" type="button" data-category="${AG.escapeHtml(category)}" aria-pressed="${category === state.category}">
        <span class="filter-icon" aria-hidden="true">${categoryIcon(category)}</span>
        <span class="filter-label">${AG.escapeHtml(category)}</span>
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

  function categoryIcon(category) {
    if (category === "Todos") return "AG";
    const initials = String(category || "")
      .trim()
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    return AG.escapeHtml(initials || "CA");
  }

  function getFilteredProducts() {
    return state.products.filter((product) => {
      const productCategories = AG.getProductCategories(product);
      const matchesCategory = state.category === "Todos" || AG.productHasCategory(product, state.category);
      const haystack = `${product.name} ${product.description} ${productCategories.join(" ")}`.toLowerCase();
      return matchesCategory && haystack.includes(state.query);
    });
  }

  function productImage(product, className = "") {
    if (product.imageUrl) {
      return `<img src="${AG.escapeHtml(product.imageUrl)}" alt="${AG.escapeHtml(product.name)}" loading="lazy" onerror="this.closest('.product-media, .cart-thumb, .modal-product-media')?.classList.add('image-error'); this.remove();">`;
    }
    return `<span class="${className}">${AG.escapeHtml(AG.getPrimaryCategory(product).slice(0, 1))}</span>`;
  }

  async function loadSheetProducts() {
    try {
      state.catalogError = false;
      state.products = (await AG.syncFromSheet(AG.DEFAULT_SHEET_URL)).filter((product) => product.visible);
      if (state.category !== "Todos" && !AG.getCatalogCategories(state.products).includes(state.category)) {
        state.category = "Todos";
      }
      renderFilters();
      renderProducts();
      renderCart();
    } catch (error) {
      console.error(error);
      state.products = [];
      state.catalogError = true;
      renderProducts();
      renderCart();
      showToast("No se pudo cargar la hoja de productos.");
    }
  }

  function renderProducts() {
    const products = getFilteredProducts();
    if (!products.length) {
      const message = state.catalogError
        ? "No se pudo cargar la hoja de productos."
        : (state.query ? "No encontramos productos con esos filtros." : "Cargando productos desde la hoja de cálculo...");
      elements.grid.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    const categories = (state.category === "Todos" ? AG.getCatalogCategories(products) : [state.category])
      .map((category) => ({
        category,
        products: products.filter((product) => AG.productHasCategory(product, category))
      }))
      .filter((group) => group.products.length);

    elements.grid.innerHTML = categories.map((group) => `
      <section class="category-carousel-section" aria-labelledby="category-${AG.slugify(group.category)}">
        <div class="carousel-head">
          <div>
            <h3 id="category-${AG.slugify(group.category)}">${AG.escapeHtml(group.category)}</h3>
          </div>
          <div class="carousel-controls" aria-label="Mover carrusel de ${AG.escapeHtml(group.category)}">
            <button class="icon-btn" type="button" data-carousel-scroll="${AG.escapeHtml(group.category)}" data-direction="-1" aria-label="Ver productos anteriores">
              <svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 18-6-6 6-6"></path>
              </svg>
            </button>
            <button class="icon-btn" type="button" data-carousel-scroll="${AG.escapeHtml(group.category)}" data-direction="1" aria-label="Ver más productos">
              <svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 18 6-6-6-6"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="products-carousel" data-carousel="${AG.escapeHtml(group.category)}">
          ${group.products.map(renderProductCard).join("")}
        </div>
      </section>
    `).join("");

    elements.grid.querySelectorAll("[data-add]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        button.blur();
        addToCart(button.dataset.add);
      });
    });

    elements.grid.querySelectorAll("[data-product-id]").forEach((card) => {
      card.addEventListener("click", () => openProductModal(card.dataset.productId));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openProductModal(card.dataset.productId);
        }
      });
    });

    elements.grid.querySelectorAll("[data-carousel-scroll]").forEach((button) => {
      button.addEventListener("click", () => scrollCarousel(button.dataset.carouselScroll, Number(button.dataset.direction)));
    });
  }

  function renderProductCard(product) {
    const soldOut = product.stock <= 0;
    return `
      <article class="product-card" role="button" tabindex="0" data-product-id="${AG.escapeHtml(product.id)}" aria-label="Ver detalle de ${AG.escapeHtml(product.name)}">
        <div class="product-media">
          ${productImage(product, "product-fallback")}
          <span class="stock-label ${soldOut ? "sold-out" : ""}">${getStockLabel(product)}</span>
        </div>
        <div class="product-body">
          <h3>${AG.escapeHtml(product.name)}</h3>
          <div class="product-price-row">
            <span>ARS$</span>
            <strong class="product-price">${AG.formatPrice(product.price).replace(/\s?ARS|\$/g, "").trim()}</strong>
          </div>
        </div>
        <div class="product-actions">
          <button class="quick-add-btn" type="button" data-add="${AG.escapeHtml(product.id)}" aria-label="Agregar ${AG.escapeHtml(product.name)} al carrito" ${soldOut ? "disabled" : ""}>
            ${soldOut ? "Agotado" : "+"}
          </button>
        </div>
      </article>
    `;
  }

  function scrollCarousel(category, direction) {
    const carousel = [...elements.grid.querySelectorAll("[data-carousel]")]
      .find((candidate) => candidate.dataset.carousel === category);
    if (!carousel) return;

    const maxScrollLeft = carousel.scrollWidth - carousel.clientWidth;
    if (maxScrollLeft <= 0) return;

    const scrollAmount = carousel.clientWidth * 0.82;
    const edgeTolerance = 8;
    const nextLeft = carousel.scrollLeft + direction * scrollAmount;
    let targetLeft = nextLeft;

    if (direction > 0 && nextLeft >= maxScrollLeft - edgeTolerance) {
      targetLeft = 0;
    } else if (direction < 0 && nextLeft <= edgeTolerance) {
      targetLeft = maxScrollLeft;
    }

    carousel.scrollBy({
      left: targetLeft - carousel.scrollLeft,
      behavior: "smooth"
    });
  }

  function getStockLabel(product) {
    if (product.stock <= 0) return "Agotado";
    return product.stockManaged ? `${product.stock} disp.` : "En stock";
  }

  function addToCart(productId, qty = 1) {
    const product = state.products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) return false;
    const existing = state.cart.find((item) => item.id === productId);
    const currentQty = existing ? existing.qty : 0;
    const requestedQty = Math.max(1, Math.round(Number(qty) || 1));
    const nextQty = Math.min(currentQty + requestedQty, product.stock);

    if (nextQty <= currentQty) {
      showToast("Ya agregaste todo el stock disponible.");
      return false;
    }

    if (existing) existing.qty = nextQty;
    else state.cart.push({ id: product.id, qty: nextQty });
    AG.saveCart(state.cart);
    renderCart();
    const addedQty = nextQty - currentQty;
    showToast(`${addedQty} x ${product.name} agregado${addedQty === 1 ? "" : "s"} al carrito.`);
    return true;
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
        const product = state.products.find((candidate) => candidate.id === item.id);
        return product ? { ...product, qty: Math.min(item.qty, product.stock) } : null;
      })
      .filter(Boolean)
      .filter((line) => line.qty > 0);
  }

  function getProductsTotal(lines) {
    return lines.reduce((sum, item) => sum + item.qty * item.price, 0);
  }

  function isDeliverySelected(shipping = elements.shippingMethod.value) {
    return String(shipping || "").trim().toLowerCase() === "delivery";
  }

  function getDeliveryFee(shipping = elements.shippingMethod.value) {
    return isDeliverySelected(shipping) ? DELIVERY_FEE : 0;
  }

  function updateAddressFieldState() {
    const needsAddress = isDeliverySelected();
    elements.customerAddress.required = needsAddress;
    elements.customerAddress.disabled = !needsAddress;
    elements.customerAddress.placeholder = needsAddress
      ? "Calle, número, barrio o referencia para la entrega."
      : "No hace falta domicilio para retiro local.";

    if (elements.customerAddressLabel) {
      elements.customerAddressLabel.textContent = needsAddress
        ? "Dirección de envío (*)"
        : "Dirección de envío";
    }

    if (!needsAddress) {
      elements.customerAddress.value = "";
    }
  }

  function renderCart() {
    const lines = getCartLines();
    const count = lines.reduce((sum, item) => sum + item.qty, 0);
    const total = getProductsTotal(lines);
    elements.cartCount.textContent = count;
    elements.cartTotal.textContent = AG.formatPrice(total);
    elements.mobileCartCount.textContent = `${count} producto${count === 1 ? "" : "s"}`;
    elements.mobileCartTotal.textContent = AG.formatPrice(total);
    elements.mobileCartSummary.hidden = count === 0;
    document.body.classList.toggle("has-mobile-cart", count > 0);
    elements.checkoutButton.disabled = lines.length === 0;
    elements.clearCartButton.disabled = lines.length === 0;
    renderCheckoutSummary(lines, total);

    if (!lines.length) {
      elements.cartItems.innerHTML = `<div class="empty-state">Tu carrito está vacío.</div>`;
      return;
    }

    elements.cartItems.innerHTML = lines.map((item) => `
      <article class="cart-item">
        <div class="cart-thumb">${item.imageUrl ? `<img src="${AG.escapeHtml(item.imageUrl)}" alt="" loading="lazy">` : AG.escapeHtml(AG.getPrimaryCategory(item).slice(0, 1))}</div>
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

  function openProductModal(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    state.activeProductId = product.id;
    state.modalQty = product.stock <= 0 ? 0 : 1;
    renderProductModal(product);
    elements.productModal.classList.add("open");
    elements.productModalBackdrop.classList.add("open");
    elements.productModal.setAttribute("aria-hidden", "false");
    syncBodyLock();
    elements.closeProductModal.focus();
  }

  function renderProductModal(product) {
    const soldOut = product.stock <= 0;
    const description = product.description || "Producto seleccionado de Alta GULA Delivery.";
    elements.productModalContent.innerHTML = `
      <div class="modal-product-grid">
        <div class="modal-product-media">
          ${productImage(product, "product-fallback modal-fallback")}
          <span class="stock-label ${soldOut ? "sold-out" : ""}">${getStockLabel(product)}</span>
        </div>
        <div class="modal-product-detail">
          <span class="product-kicker">${AG.escapeHtml(AG.formatCategories(product))}</span>
          <h2 id="productModalTitle">${AG.escapeHtml(product.name)}</h2>
          <p>${AG.escapeHtml(description)}</p>
          <div class="modal-price-row">
            <strong class="product-price">${AG.formatPrice(product.price)}</strong>
            <span class="muted">Precio unitario</span>
          </div>
          <div class="modal-qty-panel">
            <label for="modalQtyInput">Cantidad</label>
            <div class="qty-control modal-qty-control" aria-label="Cantidad de ${AG.escapeHtml(product.name)}">
              <button type="button" data-modal-decrease aria-label="Restar cantidad" ${soldOut ? "disabled" : ""}>-</button>
              <input id="modalQtyInput" type="number" min="${soldOut ? 0 : 1}" max="${product.stock}" value="${state.modalQty}" data-modal-qty aria-label="Cantidad" ${soldOut ? "disabled" : ""}>
              <button type="button" data-modal-increase aria-label="Sumar cantidad" ${soldOut ? "disabled" : ""}>+</button>
            </div>
          </div>
          <div class="modal-total">
            <span>Total</span>
            <strong data-modal-total>${AG.formatPrice(product.price * state.modalQty)}</strong>
          </div>
          <button class="btn btn-primary modal-add-btn" type="button" data-modal-add ${soldOut ? "disabled" : ""}>
            ${soldOut ? "Sin stock" : "Agregar al carrito"}
          </button>
        </div>
      </div>
    `;

    updateModalQty(product, state.modalQty);
  }

  function getActiveProduct() {
    return state.products.find((item) => item.id === state.activeProductId);
  }

  function handleProductModalClick(event) {
    const button = event.target.closest("[data-modal-decrease], [data-modal-increase], [data-modal-add]");
    if (!button || !elements.productModalContent.contains(button)) return;

    event.preventDefault();
    const product = getActiveProduct();
    if (!product) return;

    if (button.hasAttribute("data-modal-decrease")) {
      updateModalQty(product, state.modalQty - 1);
      return;
    }

    if (button.hasAttribute("data-modal-increase")) {
      updateModalQty(product, state.modalQty + 1);
      return;
    }

    if (button.hasAttribute("data-modal-add") && addToCart(product.id, state.modalQty)) {
      closeProductModal();
    }
  }

  function handleProductModalChange(event) {
    if (!event.target.matches("[data-modal-qty]")) return;
    const product = getActiveProduct();
    if (product) updateModalQty(product, event.target.value);
  }

  function updateModalQty(product, qty) {
    if (!product || product.stock <= 0) {
      state.modalQty = 0;
      return;
    }

    state.modalQty = Math.max(1, Math.min(Math.round(Number(qty) || 1), product.stock));
    const qtyInput = elements.productModalContent.querySelector("[data-modal-qty]");
    const total = elements.productModalContent.querySelector("[data-modal-total]");
    const decreaseButton = elements.productModalContent.querySelector("[data-modal-decrease]");
    const increaseButton = elements.productModalContent.querySelector("[data-modal-increase]");

    if (qtyInput) qtyInput.value = state.modalQty;
    if (total) total.textContent = AG.formatPrice(product.price * state.modalQty);
    if (decreaseButton) decreaseButton.disabled = state.modalQty <= 1;
    if (increaseButton) increaseButton.disabled = state.modalQty >= product.stock;
  }

  function closeProductModal() {
    elements.productModal.classList.remove("open");
    elements.productModalBackdrop.classList.remove("open");
    elements.productModal.setAttribute("aria-hidden", "true");
    state.activeProductId = null;
    syncBodyLock();
  }

  function isProductModalOpen() {
    return elements.productModal.classList.contains("open");
  }

  function openCart() {
    elements.cartDrawer.classList.add("open");
    elements.cartBackdrop.classList.add("open");
    elements.cartDrawer.setAttribute("aria-hidden", "false");
    syncBodyLock();
    elements.closeCart.focus();
  }

  function closeCart() {
    elements.cartDrawer.classList.remove("open");
    elements.cartBackdrop.classList.remove("open");
    elements.cartDrawer.setAttribute("aria-hidden", "true");
    syncBodyLock();
  }

  function syncBodyLock() {
    const cartOpen = elements.cartDrawer.classList.contains("open");
    const modalOpen = isProductModalOpen();
    document.body.classList.toggle("cart-open", cartOpen);
    document.body.classList.toggle("lock-scroll", cartOpen || modalOpen);
  }

  function clearCart() {
    if (!state.cart.length) return;
    state.cart = [];
    AG.saveCart(state.cart);
    renderCart();
    showToast("Carrito vacío.");
  }

  function renderCheckoutSummary(lines = getCartLines(), total = null) {
    const productsTotal = total ?? getProductsTotal(lines);
    const count = lines.reduce((sum, item) => sum + item.qty, 0);
    const hasCart = lines.length > 0;
    const deliveryFee = hasCart ? getDeliveryFee() : 0;
    const orderTotal = productsTotal + deliveryFee;

    elements.checkoutTotal.textContent = AG.formatPrice(orderTotal);
    elements.sendWhatsappButton.disabled = !hasCart;
    elements.checkoutStatus.textContent = hasCart ? "Listo para completar" : "Agregá productos primero";
    elements.checkoutStatus.className = `status ${hasCart ? "success" : "error"}`;

    if (!hasCart) {
      elements.checkoutSummary.innerHTML = `<div class="empty-state">Tu carrito está vacío. Agregá productos desde el catálogo.</div>`;
      return;
    }

    elements.checkoutSummary.innerHTML = `
      <div class="summary-row summary-head">
        <span>Descripción</span>
        <span>Cant.</span>
        <span>Total</span>
      </div>
      ${lines.map((item) => `
        <div class="summary-row">
          <span>${AG.escapeHtml(item.name)}</span>
          <span>${item.qty}</span>
          <strong>${AG.formatPrice(item.price * item.qty)}</strong>
        </div>
      `).join("")}
      ${deliveryFee ? `
        <div class="summary-row">
          <span>Envío</span>
          <span>Delivery</span>
          <strong>${AG.formatPrice(deliveryFee)}</strong>
        </div>
      ` : ""}
      <div class="summary-row summary-total-line">
        <span>Total a pagar (${count} producto${count === 1 ? "" : "s"})</span>
        <span></span>
        <strong>${AG.formatPrice(orderTotal)}</strong>
      </div>
    `;
  }

  function goToCheckout() {
    const lines = getCartLines();
    if (!lines.length) return;
    closeCart();
    renderCheckoutSummary(lines);
    elements.checkoutSection.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => elements.customerName.focus(), 420);
  }

  function sendCheckoutToWhatsapp(event) {
  event.preventDefault();

  const lines = getCartLines();

  if (!lines.length) {
    showToast("Agregá productos al carrito antes de enviar el pedido.");
    return;
  }

  const productsTotal = getProductsTotal(lines);

  if (productsTotal < MIN_ORDER_TOTAL) {
    showToast(`El pedido mínimo es ${AG.formatPrice(MIN_ORDER_TOTAL)}.`);
    return;
  }

  if (!elements.checkoutForm.reportValidity()) return;

  const formData = new FormData(elements.checkoutForm);

  const name = String(formData.get("customerName") || "").trim();
  const phonePrefix = String(formData.get("phonePrefix") || "").trim();
  const phone = String(formData.get("customerPhone") || "").trim();
  const shipping = String(formData.get("shippingMethod") || "").trim();
  const address = String(formData.get("customerAddress") || "").trim();
  const comment = String(formData.get("customerComment") || "").trim();
  const payment = String(formData.get("paymentMethod") || "Efectivo").trim();

  const deliveryFee = getDeliveryFee(shipping);
  const total = productsTotal + deliveryFee;

  const fullPhone = [phonePrefix, phone].filter(Boolean).join(" ");
  const shippingLabel = isDeliverySelected(shipping)
    ? "Envío a domicilio"
    : "Retiro local";
  const addressLabel = isDeliverySelected(shipping)
    ? "Dirección de envío"
    : "Retiro";
  const addressValue = isDeliverySelected(shipping)
    ? address || "-"
    : "Retiro en local";

  // Emojis escritos como surrogate pairs para evitar problemas de encoding
  const EMOJI_HANDS = "\uD83D\uDE4C"; // 🙌
  const EMOJI_CART = "\uD83D\uDED2";  // 🛒
  const EMOJI_TRUCK = "\uD83D\uDE9A"; // 🚚

  const summary = lines
    .map((item) => {
      const itemTotal = item.price * item.qty;

      return `- ${item.qty} x ${item.name} | precio ${formatOrderPrice(item.price)} | total ${formatOrderPrice(itemTotal)}`;
    })
    .join("\n");

  const message = [
    "--------------------------------------------",
    `Nombre y apellido: ${EMOJI_HANDS}`,
    name,
    "",
    addressLabel,
    addressValue,
    "",
    `Detalle del pedido ${EMOJI_CART}`,
    summary,
    "",
    `Selecciona envío ${EMOJI_TRUCK}`,
    `- 1 x ${shippingLabel} | precio ${formatOrderPrice(deliveryFee)} | total ${formatOrderPrice(deliveryFee)}`,
    "",
    "--------------------------------------------",
    `Sub-total ${formatOrderCurrency(productsTotal)}`,
    `Envío ${formatOrderCurrency(deliveryFee)}`,
    "",
    `TOTAL DE LA ORDEN ${formatOrderCurrency(total)}`,
    "",
    "TIPO DE PAGO",
    payment,
    comment ? ["", "Comentario", comment].join("\n") : ""
  ]
    .join("\n");

  console.log("MENSAJE WHATSAPP:", message);

  const whatsappUrl = `https://wa.me/${AG.whatsappNumber}?text=${encodeURIComponent(message)}`;

  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  function formatOrderPrice(value) {
    return new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function formatOrderCurrency(value) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0).replace(/\s+/g, " ");
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => elements.toast.classList.remove("show"), 2600);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
