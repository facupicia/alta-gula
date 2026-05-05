(function () {
  "use strict";

  const PRODUCT_KEY = "altaGula.products";
  const CART_KEY = "altaGula.cart";
  const SHEET_URL_KEY = "altaGula.sheetUrl";
  const LAST_SYNC_KEY = "altaGula.lastSync";
  const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtysB1M_oNpuXveauerVx3N7ujqdVXBAkkc4uw4cTXmCsNl6_flTMNLERs3PSE_EibVjNbpuYPVIX1/pub?output=csv";

  const categories = ["Golosinas", "Chocolates", "Bebidas", "Snacks", "Combos"];
  const defaultProducts = [
    {
      id: "papas-lays",
      name: "Papas lays",
      description: "",
      price: 4000,
      category: "Snacks",
      stock: 999,
      stockManaged: false,
      imageUrl: "",
      visible: true
    },
    {
      id: "gomitas",
      name: "Gomitas",
      description: "",
      price: 2500,
      category: "Golosinas",
      stock: 999,
      stockManaged: false,
      imageUrl: "",
      visible: true
    },
    {
      id: "coca-cola",
      name: "Coca cola",
      description: "",
      price: 4800,
      category: "Bebidas",
      stock: 999,
      stockManaged: false,
      imageUrl: "",
      visible: true
    },
    {
      id: "fernet-coca",
      name: "Fernet + coca",
      description: "",
      price: 18000,
      category: "Combos",
      stock: 999,
      stockManaged: false,
      imageUrl: "",
      visible: true
    }
  ];
  const whatsappNumber = "5493464000000";


  function safeJsonParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn("No se pudo leer localStorage", error);
      return fallback;
    }
  }

  function slugify(value) {
    return String(value || "producto")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "producto";
  }

  function uid(base) {
    return `${slugify(base)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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

  function normalizeCategory(value) {
    const match = categories.find((category) => category.toLowerCase() === String(value || "").trim().toLowerCase());
    return match || categories[0];
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

    return {
      id: String(raw.id || raw.ID || raw["ID de artículo"] || raw["ID de articulo"] || slugify(name) || `producto-${index + 1}`),
      name: name || `Producto ${index + 1}`,
      description: String(raw.description || raw.descripcion || raw["Descripción"] || raw["Descripcion"] || "").trim(),
      price: Math.max(0, toNumber(raw.price || raw.precio || raw["Precio"])),
      category: normalizeCategory(raw.category || raw.categoria || raw["Tipo"] || raw["Categoría"] || raw["Categoria"]),
      stock,
      stockManaged: stockIsManaged,
      imageUrl: String(raw.imageUrl || raw.imagen || raw["Fotos del producto"] || raw["URL de imagen"] || raw["Imagen"] || "").trim(),
      visible: normalizeVisible(raw.visible ?? raw.Visible ?? raw["Visible"] ?? status),
      updatedAt: raw.updatedAt || raw["Actualizado"] || now
    };
  }

  function getProducts() {
    const products = safeJsonParse(localStorage.getItem(PRODUCT_KEY), null);
    if (Array.isArray(products) && products.length) {
      return products.map(normalizeProduct);
    }
    saveProducts(defaultProducts);
    return defaultProducts;
  }

  function saveProducts(products) {
    const normalized = products.map(normalizeProduct);
    localStorage.setItem(PRODUCT_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("altaGula:productsChanged", { detail: normalized }));
    return normalized;
  }

  function upsertProduct(product) {
    const products = getProducts();
    const normalized = normalizeProduct({ ...product, id: product.id || uid(product.name), updatedAt: new Date().toISOString() }, products.length);
    const index = products.findIndex((item) => item.id === normalized.id);
    if (index >= 0) products[index] = normalized;
    else products.unshift(normalized);
    return saveProducts(products);
  }

  function deleteProduct(id) {
    return saveProducts(getProducts().filter((product) => product.id !== id));
  }

  function visibleProducts() {
    return getProducts().filter((product) => product.visible);
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

    localStorage.setItem(SHEET_URL_KEY, url);
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return saveProducts(products);
  }

  function getCart() {
    return safeJsonParse(localStorage.getItem(CART_KEY), []);
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("altaGula:cartChanged", { detail: cart }));
    return cart;
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
    localStorage.removeItem("altaGula.theme");
    return "dark";
  }

  window.AltaGula = {
    PRODUCT_KEY,
    CART_KEY,
    SHEET_URL_KEY,
    LAST_SYNC_KEY,
    DEFAULT_SHEET_URL,
    categories,
    whatsappNumber,
    defaultProducts,
    uid,
    slugify,
    normalizeProduct,
    getProducts,
    saveProducts,
    upsertProduct,
    deleteProduct,
    visibleProducts,
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
