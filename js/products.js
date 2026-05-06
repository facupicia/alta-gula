(function () {
  "use strict";

  const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtysB1M_oNpuXveauerVx3N7ujqdVXBAkkc4uw4cTXmCsNl6_flTMNLERs3PSE_EibVjNbpuYPVIX1/pub?output=csv";

  const DEFAULT_CATEGORY = "Sin categoría";
  const CART_STORAGE_KEY = "altaGula.cart.v1";
  const whatsappNumber = "5493464625778";
  let cart = loadStoredCart();

  function slugify(value) {
    return String(value || "producto")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "producto";
  }

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const clean = String(value || "")
      .replace(/\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const number = Number.parseFloat(clean);
    return Number.isFinite(number) ? number : 0;
  }

  function normalizeVisible(value) {
    if (typeof value === "boolean") return value;
    const normalized = String(value || "si").trim().toLowerCase();
    return !["no", "false", "0", "oculto", "hidden", "inactivo"].includes(normalized);
  }

  function normalizeCategoryName(value) {
    const clean = String(value || "").trim();
    return clean;
  }

  function normalizeCategories(value) {
    const values = Array.isArray(value)
      ? value
      : String(value || "").split(/\s*(?:,|;|\||\/)\s*/);
    const seen = new Set();
    const normalized = [];

    values.forEach((item) => {
      const category = normalizeCategoryName(item);
      if (!category) return;
      const key = category.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(category);
    });

    return normalized.length ? normalized : [DEFAULT_CATEGORY];
  }

  function getProductCategories(product) {
    if (Array.isArray(product?.categories) && product.categories.length) {
      return normalizeCategories(product.categories);
    }
    return normalizeCategories(product?.category);
  }

  function productHasCategory(product, category) {
    const expected = String(category || "").trim().toLowerCase();
    if (!expected) return false;
    return getProductCategories(product).some((item) => item.toLowerCase() === expected);
  }

  function getCatalogCategories(products = []) {
    const seen = new Set();
    const catalogCategories = [];
    const addCategory = (category) => {
      const clean = normalizeCategoryName(category);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) return;
      seen.add(key);
      catalogCategories.push(clean);
    };

    products.forEach((product) => getProductCategories(product).forEach(addCategory));

    return catalogCategories;
  }

  function getPrimaryCategory(product) {
    return getProductCategories(product)[0] || DEFAULT_CATEGORY;
  }

  function formatCategories(product) {
    return getProductCategories(product).join(", ");
  }

  function normalizeProduct(raw, index) {
    const name = String(raw.name || raw.nombre || raw["Nombre del elemento"] || raw["Nombre del producto"] || raw["Nombre"] || "").trim();
    const stockValue = raw.stock ?? raw.Stock;
    const status = String(raw.status || raw.estado || raw.Estado || "").trim();
    const normalizedStatus = status.toLowerCase();
    const stockIsManaged = typeof raw.stockManaged === "boolean" ? raw.stockManaged : String(stockValue ?? "").trim() !== "";
    const stock = stockIsManaged
      ? Math.max(0, Math.round(toNumber(stockValue)))
      : (normalizedStatus.includes("sin stock") || normalizedStatus.includes("agotado") ? 0 : 999);
    const now = new Date().toISOString();

    const productCategories = normalizeCategories(raw["Tipo"] ?? raw.Tipo ?? raw.tipo);

    return {
      id: String(raw.id || raw.ID || raw["ID de artículo"] || raw["ID de articulo"] || slugify(name) || `producto-${index + 1}`),
      name: name || `Producto ${index + 1}`,
      description: String(raw.description || raw.descripcion || raw["Descripción"] || raw["Descripcion"] || raw["Descripcion del producto"] || "").trim(),
      price: Math.max(0, toNumber(raw.price || raw.precio || raw["Precio"])),
      category: productCategories[0],
      categories: productCategories,
      stock,
      stockManaged: stockIsManaged,
      imageUrl: String(raw.imageUrl || raw.imagen || raw["Fotos del producto"] || raw["URL de imagen"] || raw["Imagen"] || "").trim(),
      visible: normalizeVisible(raw.visible ?? raw.Visible ?? raw["Visible"] ?? status),
      updatedAt: raw.updatedAt || raw["Actualizado"] || now
    };
  }

  function parseCsv(text) {
    const rows = [];
    let current = "";
    let row = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(current);
        current = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(current);
        if (row.some((cell) => cell.trim() !== "")) rows.push(row);
        row = [];
        current = "";
      } else {
        current += char;
      }
    }

    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    if (!rows.length) return [];

    const headers = rows.shift().map((header) => header.trim());
    return rows.map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = (cells[index] || "").trim();
      });
      return record;
    });
  }

  function sheetUrlToCsv(url) {
    const value = String(url || DEFAULT_SHEET_URL).trim();
    if (!value) throw new Error("Configurá la URL publicada de Google Sheets.");
    if (value.includes("/pubhtml")) {
      const csvUrl = value.replace("/pubhtml", "/pub").replace(/([?&])output=[^&]+/, "$1output=csv");
      return csvUrl.includes("output=csv") ? csvUrl : `${csvUrl}${csvUrl.includes("?") ? "&" : "?"}output=csv`;
    }
    if (value.includes("/pub?") && !value.includes("output=csv")) {
      return `${value}${value.includes("?") ? "&" : "?"}output=csv`;
    }
    const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && value.includes("/edit")) {
      return DEFAULT_SHEET_URL;
    }
    return value;
  }

  async function syncFromSheet(url = DEFAULT_SHEET_URL) {
    const requestUrl = sheetUrlToCsv(url);
    const response = await fetch(requestUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheets respondió ${response.status}`);

    const text = await response.text();
    const trimmed = text.trim();
    let rows;
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed);
      rows = Array.isArray(json) ? json : (json.products || json.data || []);
    } else {
      rows = parseCsv(text);
    }

    if (!Array.isArray(rows) || !rows.length) {
      throw new Error("La hoja no tiene productos para importar.");
    }

    const products = rows.map(normalizeProduct).filter((product) => product.name);
    if (!products.length) throw new Error("No se encontraron filas válidas.");

    return products;
  }

  function normalizeCartEntries(nextCart) {
    if (!Array.isArray(nextCart)) return [];

    const entriesById = new Map();

    nextCart.forEach((item) => {
      const id = String(item?.id || "").trim();
      const qty = Math.max(0, Math.round(Number(item?.qty) || 0));
      if (!id || qty <= 0) return;
      entriesById.set(id, (entriesById.get(id) || 0) + qty);
    });

    return [...entriesById.entries()].map(([id, qty]) => ({ id, qty }));
  }

  function loadStoredCart() {
    try {
      const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
      return normalizeCartEntries(JSON.parse(storedCart || "[]"));
    } catch (error) {
      console.warn("No se pudo leer el carrito guardado.", error);
      return [];
    }
  }

  function persistCart() {
    try {
      if (cart.length) {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      } else {
        window.localStorage.removeItem(CART_STORAGE_KEY);
      }
    } catch (error) {
      console.warn("No se pudo guardar el carrito localmente.", error);
    }
  }

  function getCart() {
    return cart.map((item) => ({ ...item }));
  }

  function saveCart(nextCart) {
    cart = normalizeCartEntries(nextCart);
    persistCart();
    window.dispatchEvent(new CustomEvent("altaGula:cartChanged", { detail: getCart() }));
    return getCart();
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function escapeHtml(value) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return String(value ?? "").replace(/[&<>"']/g, (char) => map[char]);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = "dark";
    return "dark";
  }

  window.AltaGula = {
    DEFAULT_SHEET_URL,
    whatsappNumber,
    slugify,
    normalizeProduct,
    normalizeCategories,
    getProductCategories,
    productHasCategory,
    getCatalogCategories,
    getPrimaryCategory,
    formatCategories,
    parseCsv,
    syncFromSheet,
    sheetUrlToCsv,
    getCart,
    saveCart,
    formatPrice,
    escapeHtml,
    applyTheme
  };

  applyTheme();
})();
