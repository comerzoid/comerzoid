import React, { useState, useEffect, useMemo } from "react";
import {
  ShoppingCart, Search, Heart, Lock, Plus, Minus, Trash2, Pencil, LogOut,
  Package, TrendingUp, Users, ClipboardList, Settings, ChevronLeft, Check,
  X, BarChart3, Download, Store, KeyRound, AlertTriangle, Loader2,
  MessageCircle, Phone, Mail, MapPin, Send
} from "lucide-react";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

/* ---------------------------------------------------------------
   COMERZOID — plataforma completa (tienda + admin + vendedores + reportes)
   Persistencia real vía Firebase Firestore (compartida entre roles/sesiones)
--------------------------------------------------------------- */

const C = {
  ink: "#FFF8F1",
  surface: "#FFFFFF",
  surface2: "#FFF1E4",
  coral: "#FF3D71",
  teal: "#00CFB4",
  gold: "#FFAE00",
  paper: "#1C1035",
  muted: "#7A7699",
  line: "rgba(28,16,53,0.10)",
};

const KEYS = {
  catalog: "catalog",     // { products: [], categories: [] }
  sellers: "sellers",     // [ {id,name,pin,active} ]
  sales: "sales",         // [ sale ]
  orders: "orders",       // [ order ]
  config: "config",       // { adminPin, storeName, tagline, phone, email, address }
  messages: "messages",   // [ { id, name, contact, message, date, status } ]
};

const COLLECTION = "comerzoid";

const fmt = (n) => "RD$" + Math.round(n || 0).toLocaleString("es-DO");
const uid = (p = "id") => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => new Date().toISOString().slice(0, 10);

function computePrice(cost, marginPct) {
  const c = Number(cost) || 0;
  const m = Number(marginPct) || 0;
  return Math.round(c * (1 + m / 100));
}
function computeCommission(price, commissionPct) {
  return Math.round((Number(price) || 0) * (Number(commissionPct) || 0) / 100);
}
// Calcula el precio final que ve el comprador, aplicando el mayor descuento entre:
// - descuento manual que activó el admin (onSale + discountPct)
// - descuento automático por poco stock (liquidación, cuando quedan 1-2 unidades)
function getEffectiveDiscountPct(p) {
  const manual = p.onSale ? Number(p.discountPct) || 0 : 0;
  const autoClearance = p.stock > 0 && p.stock <= 2 ? 15 : 0;
  return Math.max(manual, autoClearance);
}
function getDisplayPrice(p) {
  const discount = getEffectiveDiscountPct(p);
  return discount > 0 ? Math.round(p.price * (1 - discount / 100)) : p.price;
}

const DEFAULT_CATEGORIES = ["Belleza", "Hogar", "Tecnología", "Moda", "Bebés", "Mascotas"];

function seedProducts() {
  const raw = [
    { name: "Set de brochas de maquillaje profesional (12 pzs)", category: "Belleza", cost: 620, marginPct: 45, commissionPct: 8, stock: 18, img: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=400&q=80" },
    { name: "Serum facial de vitamina C 30ml", category: "Belleza", cost: 480, marginPct: 40, commissionPct: 8, stock: 24, img: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80" },
    { name: "Audífonos inalámbricos con cancelación de ruido", category: "Tecnología", cost: 1450, marginPct: 35, commissionPct: 6, stock: 9, img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80" },
    { name: "Organizador de cocina apilable x3", category: "Hogar", cost: 380, marginPct: 42, commissionPct: 7, stock: 30, img: "https://images.unsplash.com/photo-1584589167171-541ce45f1eea?w=400&q=80" },
    { name: "Plancha de cabello cerámica profesional", category: "Belleza", cost: 1150, marginPct: 38, commissionPct: 8, stock: 7, img: "https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400&q=80" },
    { name: "Lámpara LED de escritorio regulable", category: "Hogar", cost: 420, marginPct: 40, commissionPct: 7, stock: 15, img: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400&q=80" },
    { name: "Power bank 20,000mAh carga rápida", category: "Tecnología", cost: 890, marginPct: 38, commissionPct: 6, stock: 12, img: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400&q=80" },
    { name: "Paleta de sombras 18 tonos mate y shimmer", category: "Belleza", cost: 540, marginPct: 45, commissionPct: 8, stock: 20, img: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&q=80" },
  ];
  return raw.map((p) => ({
    id: uid("p"),
    ...p,
    price: computePrice(p.cost, p.marginPct),
    description: "",
  }));
}

/* ---------- persistencia con Firestore (reemplaza window.storage) ---------- */
async function loadKey(key, fallback) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, key));
    return snap.exists() ? snap.data().value : fallback;
  } catch (e) {
    console.error("Error cargando", key, e);
    return fallback;
  }
}
async function saveKey(key, value) {
  try {
    await setDoc(doc(db, COLLECTION, key), { value });
  } catch (e) {
    console.error("No se pudo guardar", key, e);
  }
}

/* ---------------- root component ---------------- */
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [sellers, setSellers] = useState([]);
  const [sales, setSales] = useState([]);
  const [orders, setOrders] = useState([]);
  const [config, setConfig] = useState({ adminPin: "1234", storeName: "COMERZOID", tagline: "Todo lo que buscas, en un solo lugar.", phone: "809-000-0000", email: "contacto@comerzoid.com", address: "Santiago de los Caballeros, República Dominicana" });
  const [messages, setMessages] = useState([]);

  const [view, setView] = useState("store"); // store | cart | checkout | confirmed | sellerLogin | seller | adminLogin | admin
  const [session, setSession] = useState(null); // {role:'seller', sellerId} | {role:'admin'}
  const [cart, setCart] = useState([]);
  const [lastOrder, setLastOrder] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let finished = false;
    const timeoutId = setTimeout(() => {
      if (!finished) setLoadTimedOut(true);
    }, 10000); // si en 10 segundos no ha cargado, mostramos opción de reintentar

    (async () => {
      try {
        const cat = await loadKey(KEYS.catalog, null);
        const sell = await loadKey(KEYS.sellers, null);
        const sal = await loadKey(KEYS.sales, []);
        const ord = await loadKey(KEYS.orders, []);
        const cfg = await loadKey(KEYS.config, null);
        const msgs = await loadKey(KEYS.messages, []);

        if (cat) {
          setProducts(cat.products || []);
          setCategories(cat.categories || DEFAULT_CATEGORIES);
        } else {
          const seeded = seedProducts();
          setProducts(seeded);
          setCategories(DEFAULT_CATEGORIES);
          saveKey(KEYS.catalog, { products: seeded, categories: DEFAULT_CATEGORIES });
        }
        if (sell) {
          setSellers(sell);
        } else {
          const seededSellers = [{ id: uid("sv"), name: "Vendedora Demo", pin: "1111", active: true }];
          setSellers(seededSellers);
          saveKey(KEYS.sellers, seededSellers);
        }
        setSales(sal);
        setOrders(ord);
        setMessages(msgs);
        if (cfg) {
          setConfig({ phone: "809-000-0000", email: "contacto@comerzoid.com", address: "Santiago de los Caballeros, República Dominicana", ...cfg });
        } else {
          const seededCfg = { adminPin: "1234", storeName: "COMERZOID", tagline: "Todo lo que buscas, en un solo lugar.", phone: "809-000-0000", email: "contacto@comerzoid.com", address: "Santiago de los Caballeros, República Dominicana" };
          setConfig(seededCfg);
          saveKey(KEYS.config, seededCfg);
        }
        finished = true;
        clearTimeout(timeoutId);
        setLoaded(true);
      } catch (e) {
        console.error("Error cargando la app", e);
        finished = true;
        clearTimeout(timeoutId);
        setLoadError(true);
      }
    })();

    return () => clearTimeout(timeoutId);
  }, []);

  function persistCatalog(nextProducts, nextCategories) {
    const p = nextProducts ?? products;
    const c = nextCategories ?? categories;
    if (nextProducts) setProducts(nextProducts);
    if (nextCategories) setCategories(nextCategories);
    saveKey(KEYS.catalog, { products: p, categories: c });
  }
  function persistSellers(next) {
    setSellers(next);
    saveKey(KEYS.sellers, next);
  }
  function persistSales(next) {
    setSales(next);
    saveKey(KEYS.sales, next);
  }
  function persistOrders(next) {
    setOrders(next);
    saveKey(KEYS.orders, next);
  }
  function persistConfig(next) {
    setConfig(next);
    saveKey(KEYS.config, next);
  }
  function persistMessages(next) {
    setMessages(next);
    saveKey(KEYS.messages, next);
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function decrementStock(items) {
    // items: [{productId, qty}]
    const next = products.map((p) => {
      const hit = items.find((i) => i.productId === p.id);
      if (!hit) return p;
      return { ...p, stock: Math.max(0, p.stock - hit.qty) };
    });
    persistCatalog(next, null);
  }

  function logout() {
    setSession(null);
    setView("store");
  }

  if (!loaded && (loadTimedOut || loadError)) {
    return (
      <div style={{ background: C.ink, color: C.paper, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", padding: 24, textAlign: "center" }}>
        <AlertTriangle size={32} color={C.coral} style={{ marginBottom: 14 }} />
        <p style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>La tienda está tardando más de lo normal</p>
        <p style={{ color: C.muted, fontSize: 13.5, maxWidth: 340, marginBottom: 18 }}>
          Puede ser tu conexión a internet o un problema temporal. Intenta de nuevo.
        </p>
        <button onClick={() => window.location.reload()} style={primaryBtn()}>Reintentar</button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{ background: C.ink, color: C.paper, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <Loader2 style={{ marginRight: 10, animation: "spin 1s linear infinite" }} /> Cargando COMERZOID…
      </div>
    );
  }

  return (
    <div style={{ background: C.ink, color: C.paper, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
      <TopBar
        config={config}
        session={session}
        cartCount={cart.reduce((s, i) => s + i.qty, 0)}
        onGoStore={() => setView("store")}
        onGoCart={() => setView("cart")}
        onGoSeller={() => setView(session?.role === "seller" ? "seller" : "sellerLogin")}
        onGoAdmin={() => setView(session?.role === "admin" ? "admin" : "adminLogin")}
        onLogout={logout}
      />

      {toast && (
        <div style={{ position: "fixed", top: 78, left: "50%", transform: "translateX(-50%)", zIndex: 100, background: C.paper, color: C.ink, padding: "10px 18px", borderRadius: 999, fontWeight: 700, fontSize: 13.5, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 60px" }}>
        {view === "store" && (
          <StoreView
            config={config}
            products={products}
            categories={categories}
            cart={cart}
            setCart={setCart}
            showToast={showToast}
          />
        )}

        {view === "cart" && (
          <CartView
            cart={cart}
            setCart={setCart}
            products={products}
            onBack={() => setView("store")}
            onCheckout={() => setView("checkout")}
          />
        )}

        {view === "checkout" && (
          <CheckoutView
            cart={cart}
            products={products}
            onBack={() => setView("cart")}
            onConfirm={(orderData) => {
              const order = {
                id: uid("ord"),
                date: new Date().toISOString(),
                items: cart.map((i) => ({ productId: i.id, name: i.name, qty: i.qty, price: i.price })),
                total: cart.reduce((s, i) => s + i.price * i.qty, 0),
                status: "pendiente",
                ...orderData,
              };
              persistOrders([order, ...orders]);
              decrementStock(cart.map((i) => ({ productId: i.id, qty: i.qty })));
              setLastOrder(order);
              setCart([]);
              setView("confirmed");
            }}
          />
        )}

        {view === "confirmed" && lastOrder && (
          <OrderConfirmed order={lastOrder} onBackToStore={() => setView("store")} />
        )}

        {view === "sellerLogin" && (
          <SellerLogin
            sellers={sellers}
            onSuccess={(seller) => {
              setSession({ role: "seller", sellerId: seller.id });
              setView("seller");
            }}
          />
        )}

        {view === "seller" && session?.role === "seller" && (
          <SellerPanel
            seller={sellers.find((s) => s.id === session.sellerId)}
            products={products}
            sales={sales}
            onRegisterSale={(sale) => {
              persistSales([sale, ...sales]);
              decrementStock([{ productId: sale.productId, qty: sale.qty }]);
              showToast("Venta registrada ✓");
            }}
          />
        )}

        {view === "adminLogin" && (
          <AdminLogin
            adminPin={config.adminPin}
            onSuccess={() => {
              setSession({ role: "admin" });
              setView("admin");
            }}
          />
        )}

        {view === "admin" && session?.role === "admin" && (
          <AdminPanel
            products={products}
            categories={categories}
            sellers={sellers}
            sales={sales}
            orders={orders}
            messages={messages}
            config={config}
            persistCatalog={persistCatalog}
            persistSellers={persistSellers}
            persistOrders={persistOrders}
            persistMessages={persistMessages}
            persistConfig={persistConfig}
            showToast={showToast}
          />
        )}
      </div>

      <CompanyFooter config={config} />

      <ContactWidget
        onSubmit={(entry) => {
          persistMessages([{ id: uid("msg"), date: new Date().toISOString(), status: "nuevo", ...entry }, ...messages]);
          showToast("¡Mensaje enviado! Te responderemos pronto ✓");
        }}
      />
    </div>
  );
}

/* ---------------- top bar ---------------- */
function TopBar({ config, session, cartCount, onGoStore, onGoCart, onGoSeller, onGoAdmin, onLogout }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,248,241,0.92)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button onClick={onGoStore} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ fontWeight: 800, fontSize: 20, color: C.paper }}>
            {config.storeName}
            <span style={{ color: C.coral }}>.</span>
          </span>
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={onGoStore} style={navBtnStyle()}>
          <Store size={15} /> Tienda
        </button>

        <button onClick={onGoCart} style={{ ...navBtnStyle(), position: "relative" }}>
          <ShoppingCart size={15} /> Carrito
          {cartCount > 0 && (
            <span style={{ position: "absolute", top: -6, right: -8, background: C.coral, color: "#fff", fontSize: 10, fontWeight: 800, width: 17, height: 17, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {cartCount}
            </span>
          )}
        </button>

        {session?.role === "seller" ? (
          <>
            <button onClick={onGoSeller} style={navBtnStyle(C.teal)}>
              <Users size={15} /> Panel vendedor
            </button>
            <button onClick={onLogout} style={navBtnStyle()}>
              <LogOut size={15} /> Salir
            </button>
          </>
        ) : session?.role === "admin" ? (
          <>
            <button onClick={onGoAdmin} style={navBtnStyle(C.gold)}>
              <Settings size={15} /> Panel admin
            </button>
            <button onClick={onLogout} style={navBtnStyle()}>
              <LogOut size={15} /> Salir
            </button>
          </>
        ) : (
          <>
            <button onClick={onGoSeller} style={navBtnStyle()}>
              <KeyRound size={15} /> Vendedor
            </button>
            <button onClick={onGoAdmin} style={navBtnStyle()}>
              <Lock size={15} /> Admin
            </button>
          </>
        )}
      </div>
    </div>
  );
}
function navBtnStyle(accent) {
  return {
    display: "flex", alignItems: "center", gap: 6, background: C.surface, color: accent || C.paper,
    border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  };
}

/* ---------------- banner de ofertas rotativo ---------------- */
function PromoBanner({ offers }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (offers.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % offers.length), 4000);
    return () => clearInterval(t);
  }, [offers.length]);

  if (offers.length === 0) return null;
  const p = offers[idx % offers.length];

  return (
    <div style={{
      marginTop: 20, borderRadius: 20, overflow: "hidden", position: "relative",
      background: `linear-gradient(120deg, ${C.coral}, ${C.gold})`, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 26px", gap: 16, flexWrap: "wrap",
    }}>
      <div>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.9 }}>
          🔥 Oferta especial
        </span>
        <p style={{ fontSize: "clamp(16px,2.4vw,22px)", fontWeight: 800, margin: "6px 0 0" }}>{p.name}</p>
        <p style={{ fontSize: 15, marginTop: 6 }}>
          <span style={{ fontWeight: 800 }}>{fmt(getDisplayPrice(p))}</span>{" "}
          <span style={{ textDecoration: "line-through", opacity: 0.75 }}>{fmt(p.price)}</span>{" "}
          <span style={{ background: "rgba(255,255,255,0.25)", padding: "3px 9px", borderRadius: 999, fontSize: 12.5, fontWeight: 800 }}>-{p.discountPct}%</span>
        </p>
      </div>
      {offers.length > 1 && (
        <div style={{ display: "flex", gap: 6 }}>
          {offers.map((_, i) => (
            <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === idx ? "#fff" : "rgba(255,255,255,0.4)" }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- storefront ---------------- */
function StoreView({ config, products, categories, cart, setCart, showToast }) {
  const [tab, setTab] = useState("Todos");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesTab = tab === "Todos" || p.category === tab;
      const matchesQ = !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase());
      return matchesTab && matchesQ;
    });
  }, [products, tab, q]);

  function addToCart(p) {
    if (p.stock <= 0) return;
    setCart((prev) => {
      const hit = prev.find((i) => i.id === p.id);
      if (hit) {
        if (hit.qty >= p.stock) return prev;
        return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { id: p.id, name: p.name, price: getDisplayPrice(p), img: p.img, qty: 1 }];
    });
    showToast("Agregado al carrito ✓");
  }

  const offers = useMemo(() => products.filter((p) => p.onSale && p.discountPct > 0 && p.stock > 0), [products]);

  return (
    <div>
      <PromoBanner offers={offers} />
      <div style={{ padding: "44px 0 30px" }}>
        <h1 style={{ fontSize: "clamp(28px,4.4vw,44px)", fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
          {config.tagline}
        </h1>
        <p style={{ color: C.muted, marginTop: 10, maxWidth: 480 }}>
          Belleza, hogar, tecnología y más — entregas en Santiago de los Caballeros, pago contra entrega.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 999, padding: "10px 18px", marginBottom: 24 }}>
        <Search size={16} color={C.muted} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar productos o categorías..."
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.paper, fontSize: 15 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 26, flexWrap: "wrap" }}>
        {["Todos", ...categories].map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            style={{
              border: `1px solid ${C.line}`,
              background: tab === c ? C.paper : C.surface,
              color: tab === c ? C.ink : C.muted,
              borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 }}>
        {filtered.map((p) => (
          <div key={p.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ aspectRatio: "1/1", backgroundImage: `url(${p.img})`, backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
              {p.stock <= 0 && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(28,16,53,0.68)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
                  Agotado
                </div>
              )}
              {p.stock > 0 && p.stock <= 3 && (
                <span style={{ position: "absolute", top: 10, left: 10, background: C.gold, color: C.ink, fontSize: 11, fontWeight: 800, padding: "4px 9px", borderRadius: 999 }}>
                  Últimas {p.stock}
                </span>
              )}
              {p.onSale && p.discountPct > 0 && p.stock > 0 && (
                <span style={{ position: "absolute", top: 10, right: 10, background: `linear-gradient(135deg, ${C.coral}, ${C.gold})`, color: "#fff", fontSize: 11, fontWeight: 800, padding: "4px 9px", borderRadius: 999 }}>
                  -{p.discountPct}% OFERTA
                </span>
              )}
            </div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <span style={{ fontSize: 11, color: C.teal, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{p.category}</span>
              <span style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.35 }}>{p.name}</span>
              {p.onSale && p.discountPct > 0 ? (
                <span style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: C.coral }}>{fmt(getDisplayPrice(p))}</span>
                  <span style={{ fontSize: 13, color: C.muted, textDecoration: "line-through" }}>{fmt(p.price)}</span>
                </span>
              ) : (
                <span style={{ fontSize: 17, fontWeight: 800, marginTop: "auto" }}>{fmt(p.price)}</span>
              )}
              <button
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0}
                style={{
                  marginTop: 6, width: "100%", background: p.stock <= 0 ? C.surface2 : C.surface2, color: C.paper,
                  border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700,
                  cursor: p.stock <= 0 ? "not-allowed" : "pointer", opacity: p.stock <= 0 ? 0.5 : 1,
                }}
              >
                {p.stock <= 0 ? "Sin stock" : "Agregar al carrito"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={{ color: C.muted }}>No encontramos productos con ese criterio.</p>}
      </div>
    </div>
  );
}

/* ---------------- cart ---------------- */
function CartView({ cart, setCart, products, onBack, onCheckout }) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  function changeQty(id, delta) {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.id !== id) return i;
          const stock = products.find((p) => p.id === id)?.stock ?? 999;
          const nextQty = Math.min(stock, Math.max(1, i.qty + delta));
          return { ...i, qty: nextQty };
        })
        .filter((i) => i.qty > 0)
    );
  }
  function removeItem(id) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div style={{ padding: "36px 0" }}>
      <BackLink onClick={onBack} label="Seguir comprando" />
      <h2 style={{ fontSize: 26, fontWeight: 800, margin: "16px 0 22px" }}>Tu carrito</h2>

      {cart.length === 0 ? (
        <p style={{ color: C.muted }}>Tu carrito está vacío.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cart.map((i) => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 14, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 12 }}>
              <div style={{ width: 64, height: 64, borderRadius: 10, backgroundImage: `url(${i.img})`, backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{i.name}</p>
                <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>{fmt(i.price)} c/u</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => changeQty(i.id, -1)} style={qtyBtn()}><Minus size={13} /></button>
                <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700 }}>{i.qty}</span>
                <button onClick={() => changeQty(i.id, 1)} style={qtyBtn()}><Plus size={13} /></button>
              </div>
              <span style={{ fontWeight: 800, minWidth: 90, textAlign: "right" }}>{fmt(i.price * i.qty)}</span>
              <button onClick={() => removeItem(i.id)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, padding: "18px 0", borderTop: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 15, color: C.muted }}>Total</span>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{fmt(total)}</span>
          </div>
          <button onClick={onCheckout} style={primaryBtn()}>Proceder al pago</button>
        </div>
      )}
    </div>
  );
}
function qtyBtn() {
  return { width: 26, height: 26, borderRadius: "50%", border: `1px solid ${C.line}`, background: C.surface2, color: C.paper, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
}
function primaryBtn(extra) {
  return { background: C.coral, color: "#fff", border: "none", borderRadius: 999, padding: "14px 26px", fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 8px 24px rgba(255,61,113,0.28)", ...extra };
}
function BackLink({ onClick, label }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer" }}>
      <ChevronLeft size={15} /> {label}
    </button>
  );
}

/* ---------------- footer con info de la empresa ---------------- */
function CompanyFooter({ config }) {
  return (
    <footer style={{ borderTop: `1px solid ${C.line}`, marginTop: 40, padding: "36px 20px 90px", background: C.surface2 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 26 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 18, color: C.paper }}>
            {config.storeName}<span style={{ color: C.coral }}>.</span>
          </span>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>{config.tagline}</p>
        </div>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.paper, marginBottom: 12 }}>Contáctanos</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, color: C.muted }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Phone size={14} color={C.teal} /> {config.phone}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Mail size={14} color={C.teal} /> {config.email}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><MapPin size={14} color={C.teal} /> {config.address}</span>
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.paper, marginBottom: 12 }}>Entregas y pago</h4>
          <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6 }}>
            Entregas en Santiago de los Caballeros.<br />Pago contra entrega, en efectivo.
          </p>
        </div>
      </div>
      <p style={{ textAlign: "center", color: C.muted, fontSize: 12, marginTop: 28 }}>
        © {new Date().getFullYear()} {config.storeName}. Todos los derechos reservados.
      </p>
    </footer>
  );
}

/* ---------------- widget de contacto flotante ---------------- */
function ContactWidget({ onSubmit }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", message: "" });

  function submit(e) {
    e.preventDefault();
    if (!form.name || !form.contact || !form.message) return;
    onSubmit(form);
    setSent(true);
    setTimeout(() => {
      setForm({ name: "", contact: "", message: "" });
      setSent(false);
      setOpen(false);
    }, 1600);
  }

  return (
    <div style={{ position: "fixed", bottom: 22, right: 22, zIndex: 90 }}>
      {open && (
        <div style={{ width: 300, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: "0 16px 44px rgba(28,16,53,0.22)", padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h4 style={{ fontSize: 15, fontWeight: 800, color: C.paper, margin: 0 }}>¿Tienes una pregunta?</h4>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={16} /></button>
          </div>
          {sent ? (
            <div style={{ textAlign: "center", padding: "18px 0" }}>
              <Check color={C.teal} size={26} />
              <p style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>¡Enviado! Te contactaremos pronto.</p>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input required style={inputStyle()} placeholder="Tu nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input required style={inputStyle()} placeholder="Teléfono o correo" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              <textarea required style={{ ...inputStyle(), minHeight: 70 }} placeholder="Escribe tu pregunta..." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              <button type="submit" style={{ ...primaryBtn(), display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px" }}>
                <Send size={14} /> Enviar
              </button>
            </form>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 58, height: 58, borderRadius: "50%", border: "none", cursor: "pointer",
          background: `linear-gradient(135deg, ${C.coral}, ${C.gold})`, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 10px 28px rgba(255,61,113,0.4)", marginLeft: "auto",
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}

/* ---------------- checkout ---------------- */
function CheckoutView({ cart, products, onBack, onConfirm }) {
  const [form, setForm] = useState({ customerName: "", phone: "", sector: "", address: "", city: "Santiago de los Caballeros", paymentMethod: "contra_entrega", notes: "" });
  const [error, setError] = useState("");
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  function submit(e) {
    e.preventDefault();
    if (!form.customerName || !form.phone || !form.address || !form.sector) {
      setError("Completa nombre, teléfono, sector y dirección.");
      return;
    }
    for (const item of cart) {
      const p = products.find((pp) => pp.id === item.id);
      if (!p || p.stock < item.qty) {
        setError(`No hay suficiente stock de "${item.name}".`);
        return;
      }
    }
    onConfirm(form);
  }

  return (
    <div style={{ padding: "36px 0", maxWidth: 560 }}>
      <BackLink onClick={onBack} label="Volver al carrito" />
      <h2 style={{ fontSize: 26, fontWeight: 800, margin: "16px 0 6px" }}>Finalizar pedido</h2>
      <p style={{ color: C.muted, fontSize: 13.5, marginBottom: 22 }}>Total a pagar: <strong style={{ color: C.paper }}>{fmt(total)}</strong></p>

      <div style={{ background: "rgba(0,207,180,0.12)", border: `1px solid ${C.teal}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18, fontSize: 13, color: C.paper }}>
        Por ahora solo hacemos entregas en <strong>Santiago de los Caballeros</strong>, con <strong>pago contra entrega</strong>.
      </div>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nombre completo">
          <input style={inputStyle()} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
        </Field>
        <Field label="Teléfono">
          <input style={inputStyle()} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="809-000-0000" />
        </Field>
        <Field label="Sector / Barrio en Santiago">
          <input style={inputStyle()} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} placeholder="Ej. Los Jardines, Gurabo, Cienfuegos..." />
        </Field>
        <Field label="Dirección exacta">
          <input style={inputStyle()} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Calle, número, referencia" />
        </Field>
        <Field label="Método de pago">
          <div style={{ padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${C.coral}`, background: "rgba(255,61,113,0.12)", color: C.paper, fontWeight: 700, fontSize: 13.5 }}>
            Contra entrega (pagas en efectivo cuando recibes tu pedido)
          </div>
        </Field>
        <Field label="Notas (opcional)">
          <textarea style={{ ...inputStyle(), minHeight: 60 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>

        {error && (
          <p style={{ color: C.coral, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} /> {error}
          </p>
        )}

        <button type="submit" style={primaryBtn({ marginTop: 8 })}>Confirmar pedido — {fmt(total)}</button>
      </form>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: C.muted, fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}
function inputStyle() {
  return { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 14px", color: C.paper, fontSize: 14, outline: "none", fontFamily: "inherit" };
}

function OrderConfirmed({ order, onBackToStore }) {
  return (
    <div style={{ padding: "70px 0", textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
      <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(0,207,180,0.18)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
        <Check color={C.teal} size={28} />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800 }}>¡Pedido recibido!</h2>
      <p style={{ color: C.muted, marginTop: 8, fontSize: 14 }}>
        Número de orden <strong style={{ color: C.paper }}>{order.id}</strong>. Te contactaremos al {order.phone} para coordinar
        la entrega en {order.sector}, Santiago. Pagas en efectivo al recibir tu pedido.
      </p>
      <p style={{ marginTop: 18, fontWeight: 800, fontSize: 20 }}>{fmt(order.total)}</p>
      <button onClick={onBackToStore} style={{ ...primaryBtn(), marginTop: 20 }}>Volver a la tienda</button>
    </div>
  );
}

/* ---------------- seller login / panel ---------------- */
function PinPad({ value, onChange, length = 4 }) {
  const digits = "123456789 0⌫".split("");
  return (
    <div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 18 }}>
        {Array.from({ length }).map((_, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < value.length ? C.coral : C.surface2, border: `1px solid ${C.line}` }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 240, margin: "0 auto" }}>
        {digits.map((d, idx) => {
          if (d === " ") return <div key={idx} />;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (d === "⌫") onChange(value.slice(0, -1));
                else if (value.length < length) onChange(value + d);
              }}
              style={{ padding: "16px 0", borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, color: C.paper, fontSize: 17, fontWeight: 700, cursor: "pointer" }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SellerLogin({ sellers, onSuccess }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (pin.length === 4) {
      const seller = sellers.find((s) => s.pin === pin && s.active);
      if (seller) onSuccess(seller);
      else {
        setError("PIN incorrecto o vendedor inactivo.");
        setTimeout(() => { setPin(""); setError(""); }, 900);
      }
    }
  }, [pin]);

  return (
    <div style={{ padding: "60px 0", textAlign: "center", maxWidth: 340, margin: "0 auto" }}>
      <KeyRound size={26} color={C.teal} style={{ marginBottom: 10 }} />
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>Acceso vendedor</h2>
      <p style={{ color: C.muted, fontSize: 13, margin: "8px 0 24px" }}>Introduce tu PIN de 4 dígitos</p>
      <PinPad value={pin} onChange={setPin} />
      {error && <p style={{ color: C.coral, fontSize: 13, marginTop: 14 }}>{error}</p>}
    </div>
  );
}

function SellerPanel({ seller, products, sales, onRegisterSale }) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("contra_entrega");
  const [confirming, setConfirming] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const mySales = sales.filter((s) => s.sellerId === seller.id);
  const totalAmount = mySales.reduce((s, x) => s + x.price * x.qty, 0);
  const totalCommission = mySales.reduce((s, x) => s + x.commission, 0);

  const product = products.find((p) => p.id === productId);

  function startConfirm(e) {
    e.preventDefault();
    if (!product || qty < 1 || qty > product.stock) return;
    setConfirming(true);
  }

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === seller.pin) {
        const salePrice = getDisplayPrice(product);
        const commission = computeCommission(salePrice, product.commissionPct);
        onRegisterSale({
          id: uid("sale"),
          date: new Date().toISOString(),
          sellerId: seller.id,
          sellerName: seller.name,
          productId: product.id,
          productName: product.name,
          category: product.category,
          qty: Number(qty),
          price: salePrice,
          cost: product.cost,
          commissionPct: product.commissionPct,
          commission,
          profit: salePrice - product.cost - commission,
          customerName: customerName || "Cliente en tienda",
          paymentMethod,
        });
        setConfirming(false);
        setPin("");
        setProductId("");
        setQty(1);
        setCustomerName("");
      } else {
        setPinError("PIN incorrecto.");
        setTimeout(() => { setPin(""); setPinError(""); }, 800);
      }
    }
  }, [pin]);

  return (
    <div style={{ padding: "34px 0" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800 }}>Hola, {seller.name} 👋</h2>
      <p style={{ color: C.muted, fontSize: 13.5, marginBottom: 26 }}>Registra ventas y consulta tus comisiones. No puedes ver costos ni ganancias de la tienda.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 30 }}>
        <StatCard label="Mis ventas" value={mySales.length} icon={<ClipboardList size={16} />} />
        <StatCard label="Monto vendido" value={fmt(totalAmount)} icon={<TrendingUp size={16} />} />
        <StatCard label="Mi comisión total" value={fmt(totalCommission)} icon={<Package size={16} />} accent={C.gold} />
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 22, marginBottom: 30 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Registrar venta</h3>
        {!confirming ? (
          <form onSubmit={startConfirm} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Producto">
              <select style={inputStyle()} value={productId} onChange={(e) => { setProductId(e.target.value); setQty(1); }} required>
                <option value="">Selecciona un producto</option>
                {products.filter((p) => p.stock > 0).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {fmt(getDisplayPrice(p))}{p.onSale && p.discountPct > 0 ? " (oferta)" : ""} ({p.stock} disp.)</option>
                ))}
              </select>
            </Field>
            {product && (
              <Field label={`Cantidad (máx ${product.stock})`}>
                <input type="number" min={1} max={product.stock} style={inputStyle()} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              </Field>
            )}
            <Field label="Cliente (opcional)">
              <input style={inputStyle()} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre del cliente" />
            </Field>
            <Field label="Método de pago">
              <select style={inputStyle()} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="contra_entrega">Contra entrega</option>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo en tienda</option>
              </select>
            </Field>
            {product && (
              <p style={{ fontSize: 13, color: C.muted }}>
                Total: <strong style={{ color: C.paper }}>{fmt(getDisplayPrice(product) * qty)}</strong>
                {product.onSale && product.discountPct > 0 && <span style={{ color: C.coral, fontWeight: 700 }}> (Oferta -{product.discountPct}%)</span>}
              </p>
            )}
            <button type="submit" disabled={!product} style={{ ...primaryBtn(), opacity: product ? 1 : 0.5, cursor: product ? "pointer" : "not-allowed" }}>
              Continuar
            </button>
          </form>
        ) : (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 14 }}>
              Confirma con tu PIN para registrar la venta de <strong style={{ color: C.paper }}>{product.name}</strong> x{qty}
            </p>
            <PinPad value={pin} onChange={setPin} />
            {pinError && <p style={{ color: C.coral, fontSize: 13, marginTop: 12 }}>{pinError}</p>}
            <button onClick={() => { setConfirming(false); setPin(""); }} style={{ ...navBtnStyle(), margin: "18px auto 0" }}>Cancelar</button>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Mis ventas recientes</h3>
      <TableShell headers={["Fecha", "Producto", "Cant.", "Precio", "Comisión", "Cliente"]}>
        {mySales.slice(0, 25).map((s) => (
          <tr key={s.id}>
            <Td>{new Date(s.date).toLocaleDateString("es-DO")}</Td>
            <Td>{s.productName}</Td>
            <Td>{s.qty}</Td>
            <Td>{fmt(s.price)}</Td>
            <Td style={{ color: C.gold, fontWeight: 700 }}>{fmt(s.commission)}</Td>
            <Td>{s.customerName}</Td>
          </tr>
        ))}
        {mySales.length === 0 && (
          <tr><Td colSpan={6} style={{ color: C.muted, textAlign: "center", padding: "20px 0" }}>Aún no tienes ventas registradas.</Td></tr>
        )}
      </TableShell>
    </div>
  );
}

function StatCard({ label, value, icon, accent }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 12, marginBottom: 8 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || C.paper }}>{value}</div>
    </div>
  );
}
function TableShell({ headers, children }) {
  return (
    <div style={{ overflowX: "auto", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "12px 14px", color: C.muted, fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: `1px solid ${C.line}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children, colSpan, style }) {
  return <td colSpan={colSpan} style={{ padding: "11px 14px", borderBottom: `1px solid ${C.line}`, ...style }}>{children}</td>;
}

/* ---------------- admin login ---------------- */
function AdminLogin({ adminPin, onSuccess }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === adminPin) onSuccess();
      else {
        setError("PIN incorrecto.");
        setTimeout(() => { setPin(""); setError(""); }, 800);
      }
    }
  }, [pin]);

  return (
    <div style={{ padding: "60px 0", textAlign: "center", maxWidth: 340, margin: "0 auto" }}>
      <Lock size={26} color={C.gold} style={{ marginBottom: 10 }} />
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>Acceso administrador</h2>
      <p style={{ color: C.muted, fontSize: 13, margin: "8px 0 24px" }}>Introduce el PIN de administración</p>
      <PinPad value={pin} onChange={setPin} />
      {error && <p style={{ color: C.coral, fontSize: 13, marginTop: 14 }}>{error}</p>}
    </div>
  );
}

/* ---------------- admin panel ---------------- */
function AdminPanel({ products, categories, sellers, sales, orders, messages, config, persistCatalog, persistSellers, persistOrders, persistMessages, persistConfig, showToast }) {
  const [tab, setTab] = useState("dashboard");

  const newMessages = messages.filter((m) => m.status === "nuevo").length;

  const tabs = [
    ["dashboard", "Dashboard", <BarChart3 size={15} />],
    ["products", "Productos", <Package size={15} />],
    ["categories", "Categorías", <ClipboardList size={15} />],
    ["sellers", "Vendedores", <Users size={15} />],
    ["orders", "Pedidos", <ShoppingCart size={15} />],
    ["messages", `Mensajes${newMessages > 0 ? ` (${newMessages})` : ""}`, <MessageCircle size={15} />],
    ["reports", "Reportes", <TrendingUp size={15} />],
    ["settings", "Configuración", <Settings size={15} />],
  ];

  return (
    <div style={{ padding: "30px 0" }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 18 }}>Panel de administración</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 26, flexWrap: "wrap" }}>
        {tabs.map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              border: `1px solid ${C.line}`, background: tab === key ? C.paper : C.surface,
              color: tab === key ? C.ink : C.muted, borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <AdminDashboard products={products} sales={sales} orders={orders} />}
      {tab === "products" && <AdminProducts products={products} categories={categories} persistCatalog={persistCatalog} showToast={showToast} />}
      {tab === "categories" && <AdminCategories categories={categories} products={products} persistCatalog={persistCatalog} showToast={showToast} />}
      {tab === "sellers" && <AdminSellers sellers={sellers} sales={sales} persistSellers={persistSellers} showToast={showToast} />}
      {tab === "orders" && <AdminOrders orders={orders} persistOrders={persistOrders} showToast={showToast} />}
      {tab === "messages" && <AdminMessages messages={messages} persistMessages={persistMessages} showToast={showToast} />}
      {tab === "reports" && <AdminReports sales={sales} orders={orders} sellers={sellers} categories={categories} />}
      {tab === "settings" && <AdminSettings config={config} persistConfig={persistConfig} showToast={showToast} />}
    </div>
  );
}

function withinDays(dateStr, days) {
  const d = new Date(dateStr).getTime();
  const now = Date.now();
  return now - d <= days * 24 * 60 * 60 * 1000;
}

function AdminDashboard({ products, sales, orders }) {
  const saleRevenue = (arr) => arr.reduce((s, x) => s + x.price * x.qty, 0);
  const saleProfit = (arr) => arr.reduce((s, x) => s + (x.profit ?? (x.price - x.cost - x.commission)), 0);

  const today = sales.filter((s) => withinDays(s.date, 1));
  const week = sales.filter((s) => withinDays(s.date, 7));
  const month = sales.filter((s) => withinDays(s.date, 30));

  const pendingOrders = orders.filter((o) => o.status === "pendiente");
  const lowStock = products.filter((p) => p.stock <= 3 && p.stock > 0);
  const outOfStock = products.filter((p) => p.stock === 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: 26 }}>
        <StatCard label="Ventas hoy (vendedores)" value={fmt(saleRevenue(today))} icon={<TrendingUp size={16} />} />
        <StatCard label="Ganancia neta hoy" value={fmt(saleProfit(today))} icon={<TrendingUp size={16} />} accent={C.teal} />
        <StatCard label="Ventas 7 días" value={fmt(saleRevenue(week))} icon={<BarChart3 size={16} />} />
        <StatCard label="Ventas 30 días" value={fmt(saleRevenue(month))} icon={<BarChart3 size={16} />} />
        <StatCard label="Ganancia neta 30 días" value={fmt(saleProfit(month))} icon={<TrendingUp size={16} />} accent={C.teal} />
        <StatCard label="Pedidos pendientes" value={pendingOrders.length} icon={<ShoppingCart size={16} />} accent={C.gold} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Stock bajo (≤3 unidades)</h3>
          <TableShell headers={["Producto", "Stock"]}>
            {lowStock.map((p) => (
              <tr key={p.id}><Td>{p.name}</Td><Td style={{ color: C.gold, fontWeight: 700 }}>{p.stock}</Td></tr>
            ))}
            {lowStock.length === 0 && <tr><Td colSpan={2} style={{ color: C.muted }}>Sin alertas de stock bajo.</Td></tr>}
          </TableShell>
        </div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Agotados</h3>
          <TableShell headers={["Producto"]}>
            {outOfStock.map((p) => (<tr key={p.id}><Td style={{ color: C.coral }}>{p.name}</Td></tr>))}
            {outOfStock.length === 0 && <tr><Td style={{ color: C.muted }}>No hay productos agotados.</Td></tr>}
          </TableShell>
        </div>
      </div>
    </div>
  );
}

const emptyProductForm = { name: "", category: "", cost: "", marginPct: "40", commissionPct: "8", stock: "", img: "", description: "", onSale: false, discountPct: "0" };

function AdminProducts({ products, categories, persistCatalog, showToast }) {
  const [editing, setEditing] = useState(null); // product id or 'new'
  const [form, setForm] = useState(emptyProductForm);

  function startNew() {
    setForm(emptyProductForm);
    setEditing("new");
  }
  function startEdit(p) {
    setForm({ ...p, cost: String(p.cost), marginPct: String(p.marginPct), commissionPct: String(p.commissionPct), stock: String(p.stock), discountPct: String(p.discountPct || 0), onSale: !!p.onSale });
    setEditing(p.id);
  }
  function save(e) {
    e.preventDefault();
    const price = computePrice(form.cost, form.marginPct);
    const payload = {
      name: form.name, category: form.category, cost: Number(form.cost), marginPct: Number(form.marginPct),
      commissionPct: Number(form.commissionPct), stock: Number(form.stock), img: form.img || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80",
      description: form.description, price, onSale: !!form.onSale, discountPct: Number(form.discountPct) || 0,
    };
    let next;
    if (editing === "new") {
      next = [{ id: uid("p"), ...payload }, ...products];
    } else {
      next = products.map((p) => (p.id === editing ? { ...p, ...payload } : p));
    }
    persistCatalog(next, null);
    setEditing(null);
    showToast("Producto guardado ✓");
  }
  function remove(id) {
    persistCatalog(products.filter((p) => p.id !== id), null);
    showToast("Producto eliminado");
  }

  const previewPrice = computePrice(form.cost, form.marginPct);
  const previewCommission = computeCommission(previewPrice, form.commissionPct);
  const previewProfit = previewPrice - Number(form.cost || 0) - previewCommission;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ color: C.muted, fontSize: 13.5 }}>{products.length} productos en catálogo</p>
        <button onClick={startNew} style={{ ...navBtnStyle(C.teal), fontSize: 13 }}><Plus size={14} /> Nuevo producto</button>
      </div>

      {editing && (
        <form onSubmit={save} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, marginBottom: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nombre"><input required style={inputStyle()} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Categoría">
            <select required style={inputStyle()} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Selecciona</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Costo de adquisición (RD$)"><input required type="number" style={inputStyle()} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          <Field label="Margen (%)"><input required type="number" style={inputStyle()} value={form.marginPct} onChange={(e) => setForm({ ...form, marginPct: e.target.value })} /></Field>
          <Field label="Comisión de vendedor (%)"><input required type="number" style={inputStyle()} value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} /></Field>
          <Field label="Stock"><input required type="number" style={inputStyle()} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
          <Field label="URL de imagen"><input style={inputStyle()} value={form.img} onChange={(e) => setForm({ ...form, img: e.target.value })} placeholder="https://..." /></Field>
          <Field label="Descripción (opcional)"><input style={inputStyle()} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>

          <div style={{ gridColumn: "1 / -1", border: `1.5px solid ${form.onSale ? C.coral : C.line}`, borderRadius: 12, padding: 14, background: form.onSale ? "rgba(255,61,113,0.06)" : "transparent" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
              <input type="checkbox" checked={form.onSale} onChange={(e) => setForm({ ...form, onSale: e.target.checked })} />
              🔥 Poner este producto en oferta
            </label>
            {form.onSale && (
              <div style={{ marginTop: 10 }}>
                <Field label="Descuento (%)">
                  <input type="number" min="1" max="90" style={inputStyle()} value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
                </Field>
                <p style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>
                  Aparecerá con etiqueta de oferta y en el banner destacado de la tienda automáticamente.
                </p>
              </div>
            )}
          </div>

          <div style={{ gridColumn: "1 / -1", background: C.surface2, borderRadius: 10, padding: 14, fontSize: 13, display: "flex", gap: 24, flexWrap: "wrap" }}>
            <span>Precio de venta: <strong style={{ color: C.paper }}>{fmt(previewPrice)}</strong></span>
            {form.onSale && Number(form.discountPct) > 0 && (
              <span>Precio en oferta: <strong style={{ color: C.coral }}>{fmt(Math.round(previewPrice * (1 - Number(form.discountPct) / 100)))}</strong></span>
            )}
            <span>Comisión vendedor: <strong style={{ color: C.gold }}>{fmt(previewCommission)}</strong></span>
            <span>Ganancia neta: <strong style={{ color: C.teal }}>{fmt(previewProfit)}</strong></span>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
            <button type="submit" style={primaryBtn()}>Guardar producto</button>
            <button type="button" onClick={() => setEditing(null)} style={navBtnStyle()}>Cancelar</button>
          </div>
        </form>
      )}

      <TableShell headers={["Producto", "Categoría", "Costo", "Precio", "Oferta", "Comisión", "Ganancia", "Stock", ""]}>
        {products.map((p) => {
          const commission = computeCommission(p.price, p.commissionPct);
          const profit = p.price - p.cost - commission;
          return (
            <tr key={p.id}>
              <Td>{p.name}</Td>
              <Td>{p.category}</Td>
              <Td>{fmt(p.cost)}</Td>
              <Td style={{ fontWeight: 700 }}>{fmt(p.price)}</Td>
              <Td>
                {p.onSale && p.discountPct > 0 ? (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: C.coral }}>-{p.discountPct}% ({fmt(getDisplayPrice(p))})</span>
                ) : (
                  <span style={{ fontSize: 12, color: C.muted }}>—</span>
                )}
              </Td>
              <Td style={{ color: C.gold }}>{fmt(commission)}</Td>
              <Td style={{ color: C.teal }}>{fmt(profit)}</Td>
              <Td style={{ color: p.stock <= 3 ? C.coral : C.paper }}>{p.stock}</Td>
              <Td>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => startEdit(p)} style={iconBtn()}><Pencil size={13} /></button>
                  <button onClick={() => remove(p.id)} style={iconBtn()}><Trash2 size={13} /></button>
                </div>
              </Td>
            </tr>
          );
        })}
      </TableShell>
    </div>
  );
}
function iconBtn() {
  return { width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface2, color: C.paper, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
}

function AdminCategories({ categories, products, persistCatalog, showToast }) {
  const [name, setName] = useState("");
  function add(e) {
    e.preventDefault();
    if (!name.trim() || categories.includes(name.trim())) return;
    persistCatalog(null, [...categories, name.trim()]);
    setName("");
    showToast("Categoría añadida ✓");
  }
  function remove(c) {
    if (products.some((p) => p.category === c)) {
      showToast("No puedes eliminar: hay productos en esa categoría.");
      return;
    }
    persistCatalog(null, categories.filter((x) => x !== c));
  }
  return (
    <div style={{ maxWidth: 480 }}>
      <form onSubmit={add} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input style={{ ...inputStyle(), flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" />
        <button type="submit" style={primaryBtn()}>Añadir</button>
      </form>
      <TableShell headers={["Categoría", "Productos", ""]}>
        {categories.map((c) => (
          <tr key={c}>
            <Td>{c}</Td>
            <Td>{products.filter((p) => p.category === c).length}</Td>
            <Td><button onClick={() => remove(c)} style={iconBtn()}><Trash2 size={13} /></button></Td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}

function AdminSellers({ sellers, sales, persistSellers, showToast }) {
  const [form, setForm] = useState({ name: "", pin: "" });

  function add(e) {
    e.preventDefault();
    if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) {
      showToast("El PIN debe tener 4 dígitos.");
      return;
    }
    if (sellers.some((s) => s.pin === form.pin)) {
      showToast("Ese PIN ya está en uso.");
      return;
    }
    persistSellers([...sellers, { id: uid("sv"), name: form.name, pin: form.pin, active: true }]);
    setForm({ name: "", pin: "" });
    showToast("Vendedor creado ✓");
  }
  function toggle(id) {
    persistSellers(sellers.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
  }
  function remove(id) {
    persistSellers(sellers.filter((s) => s.id !== id));
  }

  return (
    <div>
      <form onSubmit={add} style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        <input style={{ ...inputStyle(), flex: 1, minWidth: 180 }} placeholder="Nombre del vendedor" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input style={{ ...inputStyle(), width: 120 }} placeholder="PIN (4 dígitos)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} required />
        <button type="submit" style={primaryBtn()}>Crear vendedor</button>
      </form>

      <TableShell headers={["Nombre", "PIN", "Estado", "Ventas", "Comisión total", ""]}>
        {sellers.map((s) => {
          const mySales = sales.filter((x) => x.sellerId === s.id);
          const commission = mySales.reduce((a, x) => a + x.commission, 0);
          return (
            <tr key={s.id}>
              <Td>{s.name}</Td>
              <Td>••{s.pin.slice(-2)}</Td>
              <Td>
                <span style={{ color: s.active ? C.teal : C.muted, fontWeight: 700 }}>{s.active ? "Activo" : "Suspendido"}</span>
              </Td>
              <Td>{mySales.length}</Td>
              <Td style={{ color: C.gold, fontWeight: 700 }}>{fmt(commission)}</Td>
              <Td>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => toggle(s.id)} style={iconBtn()}>{s.active ? <X size={13} /> : <Check size={13} />}</button>
                  <button onClick={() => remove(s.id)} style={iconBtn()}><Trash2 size={13} /></button>
                </div>
              </Td>
            </tr>
          );
        })}
      </TableShell>
    </div>
  );
}

function AdminOrders({ orders, persistOrders, showToast }) {
  const statuses = ["pendiente", "confirmado", "en_camino", "entregado", "cancelado"];
  function updateStatus(id, status) {
    persistOrders(orders.map((o) => (o.id === id ? { ...o, status } : o)));
    showToast("Estado actualizado ✓");
  }
  return (
    <TableShell headers={["Orden", "Cliente", "Total", "Pago", "Estado", "Fecha"]}>
      {orders.map((o) => (
        <tr key={o.id}>
          <Td>{o.id}</Td>
          <Td>{o.customerName}<br /><span style={{ color: C.muted, fontSize: 11.5 }}>{o.phone} · {o.sector || o.city}, Santiago</span></Td>
          <Td style={{ fontWeight: 700 }}>{fmt(o.total)}</Td>
          <Td>Contra entrega</Td>
          <Td>
            <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)} style={{ ...inputStyle(), padding: "6px 10px", fontSize: 12 }}>
              {statuses.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </Td>
          <Td>{new Date(o.date).toLocaleDateString("es-DO")}</Td>
        </tr>
      ))}
      {orders.length === 0 && <tr><Td colSpan={6} style={{ color: C.muted, textAlign: "center", padding: 20 }}>Aún no hay pedidos.</Td></tr>}
    </TableShell>
  );
}

function AdminMessages({ messages, persistMessages, showToast }) {
  function markRead(id) {
    persistMessages(messages.map((m) => (m.id === id ? { ...m, status: "atendido" } : m)));
  }
  function remove(id) {
    persistMessages(messages.filter((m) => m.id !== id));
    showToast("Mensaje eliminado");
  }
  const sorted = [...messages].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div>
      <p style={{ color: C.muted, fontSize: 13.5, marginBottom: 16 }}>Consultas enviadas desde el chat de la tienda.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map((m) => (
          <div key={m.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontWeight: 700, margin: 0 }}>{m.name} <span style={{ color: C.muted, fontWeight: 400, fontSize: 12.5 }}>· {m.contact}</span></p>
                <p style={{ color: C.muted, fontSize: 12, margin: "2px 0 0" }}>{new Date(m.date).toLocaleString("es-DO")}</p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: m.status === "nuevo" ? "rgba(255,61,113,0.12)" : "rgba(0,207,180,0.12)", color: m.status === "nuevo" ? C.coral : C.teal }}>
                {m.status === "nuevo" ? "Nuevo" : "Atendido"}
              </span>
            </div>
            <p style={{ fontSize: 13.5, margin: "10px 0 0", color: C.paper }}>{m.message}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {m.status === "nuevo" && (
                <button onClick={() => markRead(m.id)} style={navBtnStyle(C.teal)}><Check size={13} /> Marcar atendido</button>
              )}
              <button onClick={() => remove(m.id)} style={navBtnStyle()}><Trash2 size={13} /> Eliminar</button>
            </div>
          </div>
        ))}
        {sorted.length === 0 && <p style={{ color: C.muted, fontSize: 13.5 }}>Aún no has recibido mensajes.</p>}
      </div>
    </div>
  );
}

function AdminReports({ sales, orders, sellers, categories }) {
  const [sellerFilter, setSellerFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [range, setRange] = useState(30);

  const filtered = sales.filter((s) => {
    if (!withinDays(s.date, range)) return false;
    if (sellerFilter !== "all" && s.sellerId !== sellerFilter) return false;
    if (catFilter !== "all" && s.category !== catFilter) return false;
    return true;
  });

  const gross = filtered.reduce((s, x) => s + x.price * x.qty, 0);
  const cost = filtered.reduce((s, x) => s + x.cost * x.qty, 0);
  const commission = filtered.reduce((s, x) => s + x.commission, 0);
  const netProfit = gross - cost - commission;

  function exportCSV() {
    const rows = [["Fecha", "Vendedor", "Producto", "Categoría", "Cantidad", "Precio", "Costo", "Comisión", "Ganancia", "Cliente", "Pago"]];
    filtered.forEach((s) => rows.push([
      new Date(s.date).toLocaleString("es-DO"), s.sellerName, s.productName, s.category, s.qty, s.price, s.cost, s.commission, s.price - s.cost - s.commission, s.customerName, s.paymentMethod,
    ]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comerzoid_ventas_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <select style={inputStyle()} value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}>
          <option value="all">Todos los vendedores</option>
          {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select style={inputStyle()} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">Todas las categorías</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={inputStyle()} value={range} onChange={(e) => setRange(Number(e.target.value))}>
          <option value={1}>Hoy</option>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={365}>Último año</option>
        </select>
        <button onClick={exportCSV} style={{ ...navBtnStyle(C.teal) }}><Download size={14} /> Exportar CSV</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Ventas brutas" value={fmt(gross)} icon={<TrendingUp size={16} />} />
        <StatCard label="Costos" value={fmt(cost)} icon={<Package size={16} />} />
        <StatCard label="Comisiones" value={fmt(commission)} icon={<Users size={16} />} accent={C.gold} />
        <StatCard label="Ganancia neta" value={fmt(netProfit)} icon={<BarChart3 size={16} />} accent={C.teal} />
      </div>

      <TableShell headers={["Fecha", "Vendedor", "Producto", "Cant.", "Precio", "Comisión", "Ganancia", "Cliente"]}>
        {filtered.map((s) => (
          <tr key={s.id}>
            <Td>{new Date(s.date).toLocaleDateString("es-DO")}</Td>
            <Td>{s.sellerName}</Td>
            <Td>{s.productName}</Td>
            <Td>{s.qty}</Td>
            <Td>{fmt(s.price)}</Td>
            <Td style={{ color: C.gold }}>{fmt(s.commission)}</Td>
            <Td style={{ color: C.teal }}>{fmt(s.price - s.cost - s.commission)}</Td>
            <Td>{s.customerName}</Td>
          </tr>
        ))}
        {filtered.length === 0 && <tr><Td colSpan={8} style={{ color: C.muted, textAlign: "center", padding: 20 }}>Sin ventas en este período/filtro.</Td></tr>}
      </TableShell>
    </div>
  );
}

function AdminSettings({ config, persistConfig, showToast }) {
  const [form, setForm] = useState(config);
  const [newPin, setNewPin] = useState("");

  function save(e) {
    e.preventDefault();
    const next = { ...form };
    if (newPin) {
      if (!/^\d{4}$/.test(newPin)) {
        showToast("El nuevo PIN debe tener 4 dígitos.");
        return;
      }
      next.adminPin = newPin;
    }
    persistConfig(next);
    setNewPin("");
    showToast("Configuración guardada ✓");
  }

  return (
    <form onSubmit={save} style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Nombre de la tienda"><input style={inputStyle()} value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} /></Field>
      <Field label="Eslogan"><input style={inputStyle()} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></Field>
      <Field label="Teléfono de contacto"><input style={inputStyle()} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="Correo de contacto"><input style={inputStyle()} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="Dirección"><input style={inputStyle()} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field label="Cambiar PIN de administrador (dejar vacío para no cambiar)">
        <input style={inputStyle()} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Nuevo PIN de 4 dígitos" />
      </Field>
      <button type="submit" style={primaryBtn()}>Guardar configuración</button>
    </form>
  );
}
