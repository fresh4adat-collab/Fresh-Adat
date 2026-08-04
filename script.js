// ----------------------------- CONFIGURATION (overridden by sheet) -----------------------------
let WHATSAPP_NUMBER = '919496840336';
let ADAT_LAT = 10.5530;
let ADAT_LON = 76.1668;
let MAX_DISTANCE_KM = 5;
let FREE_DELIVERY_THRESHOLD = 200;
let MAX_QTY_PER_PRODUCT = 4;
let ECO_BOX_CHARGE = 10;
let DELIVERY_CHARGE = 10;           // per‑km rate (used for distances > 1.5 km)
let OPENING_HOURS = [];

// Delivery charge rules – can be overridden from sheet as well
const DELIVERY_MIN_DISTANCE = 1.5;   // km
const DELIVERY_MIN_CHARGE = 15;      // fixed charge for distances <= 1.5 km
const DELIVERY_MAX_CHARGE = 45;      // absolute cap

const PENDING_ORDER_KEY = 'freshadat_pending_order';
const PENDING_BANNER_SEEN_KEY = 'pending_banner_seen';

let products = [];
let offers = [];
let cart = {};
let selectedCat = 'All';
let searchTerm = '';
let selectedSuggestionProduct = null;
let isLoginMode = false;
let isStoreOpen = true;

let productsGrid, catRow, cartCountSpan, cartOverlay, cartPanel, cartItems, cartFooter, footerItems, footerTotal;
let toastEl;
let categoriesModal, categoriesGrid, arrowMoreBtn;
let desktopSearch, mobileSearch, desktopClearBtn, mobileClearBtn, desktopSuggestions, mobileSuggestions;
let imageMap = {};

let stickyBar, stickyCountSpan, stickySavingsSpan, stickyFreeBadge, stickyCartBtn, stickyToggleBtn, stickyDetailedDiv;
let stickyDetailedOpen = false;

let customerData = {
  name: '', phone: '', location: { lat: null, lng: null, address: '' },
  house: '', area: '', landmark: '', addressType: 'Home', useEcoBox: false,
  preOrderDateTime: null,
  roadDistance: null // cached road distance from store to this location
};
let map, marker, circle, currentLocationValid = false;
let addressFlowModal, currentStep = 1;

let currentOffer = null;
let offerTimerInterval = null;
let homeTimerInterval = null;

// Pre‑order on cart
let cartPreOrderDateTime = null;
function getCartPreOrder() {
  try { return localStorage.getItem('freshAdat_cartPreOrder') || null; } catch { return null; }
}
function setCartPreOrder(dt) {
  if (dt) {
    localStorage.setItem('freshAdat_cartPreOrder', dt);
  } else {
    localStorage.removeItem('freshAdat_cartPreOrder');
  }
  cartPreOrderDateTime = dt;
}
cartPreOrderDateTime = getCartPreOrder();

// Product detail modal
let productDetailModal, slideshowImages, slideshowDots, detailName, detailUnitDisplay, detailUnitWrapper, detailUnitSelector, unitOptions, detailPrice, detailHighlights, highlightsList, detailDescription, detailAddBtn;
let slideshowIndex = 0;
let slideshowImagesArray = [];
let currentProductUnits = [];
let currentProductPrices = [];
let currentProductDiscountPrices = [];
let selectedUnitIndex = 0;

const FALLBACK_IMAGES = {
  slide1: 'https://via.placeholder.com/800x400?text=Slide+1',
  slide2: 'https://via.placeholder.com/800x400?text=Slide+2',
  slide3: 'https://via.placeholder.com/800x400?text=Slide+3',
  'vegitable-fresh': 'https://via.placeholder.com/90?text=Fresh+Veg',
  'vegitable-fresh-leafs': 'https://via.placeholder.com/90?text=Fresh+Leafs',
  'fruits-fresh': 'https://via.placeholder.com/90?text=Fresh+Fruits',
  diary: 'https://via.placeholder.com/90?text=Dairy',
  meats: 'https://via.placeholder.com/90?text=Meats',
  rice: 'https://via.placeholder.com/90?text=Rice',
  oils: 'https://via.placeholder.com/90?text=Oils',
  powders: 'https://via.placeholder.com/90?text=Powders',
  all: 'https://via.placeholder.com/90?text=All',
  offers: 'https://via.placeholder.com/90?text=Offers',
  'cut vegetables': 'https://via.placeholder.com/90?text=Cut',
  organic: 'https://via.placeholder.com/90?text=Organic'
};

// ========== TIME HELPERS ==========
function parseOpeningHours(str) {
  if (!str) return [];
  const intervals = str.split(',').map(s => s.trim());
  const result = [];
  for (let interval of intervals) {
    let parts = interval.split('-');
    if (parts.length !== 2) continue;
    let start = parseTime(parts[0]);
    let end = parseTime(parts[1]);
    if (start !== null && end !== null && start < end) {
      result.push({ start, end });
    }
  }
  result.sort((a, b) => a.start - b.start);
  return result;
}

function parseTime(str) {
  str = str.trim().toLowerCase();
  let hours = 0, minutes = 0;
  let ampm = 1;
  if (str.includes('am')) {
    ampm = 1;
    str = str.replace('am', '').trim();
  } else if (str.includes('pm')) {
    ampm = 2;
    str = str.replace('pm', '').trim();
  }
  let parts = str.split(':');
  if (parts.length === 1) {
    hours = parseInt(parts[0]);
    minutes = 0;
  } else if (parts.length === 2) {
    hours = parseInt(parts[0]);
    minutes = parseInt(parts[1]);
  } else {
    return null;
  }
  if (isNaN(hours) || isNaN(minutes)) return null;
  if (ampm === 2 && hours < 12) hours += 12;
  if (ampm === 1 && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function isStoreOpenNow() {
  if (!OPENING_HOURS || OPENING_HOURS.length === 0) return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  for (let slot of OPENING_HOURS) {
    if (currentMinutes >= slot.start && currentMinutes < slot.end) return true;
  }
  return false;
}

function getNextOpenAndCloseTimes() {
  if (!OPENING_HOURS || OPENING_HOURS.length === 0) return null;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let nextOpen = null, nextClose = null, found = false;
  for (let slot of OPENING_HOURS) {
    if (currentMinutes < slot.start && !found) {
      nextOpen = slot.start;
      nextClose = slot.end;
      found = true;
      break;
    }
  }
  if (!found && OPENING_HOURS.length > 0) {
    const firstSlot = OPENING_HOURS[0];
    nextOpen = firstSlot.start + 24 * 60;
    nextClose = firstSlot.end + 24 * 60;
  }
  return { nextOpen, nextClose };
}

function formatMinutesToTime(minutes) {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const date = new Date(0, 0, 0, hours, mins);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getNextOpenTimeStr() {
  const times = getNextOpenAndCloseTimes();
  if (!times) return 'Check back later';
  return formatMinutesToTime(times.nextOpen);
}

function getStoreStatusMessage() {
  const times = getNextOpenAndCloseTimes();
  if (!times) return '';
  const openTimeStr = formatMinutesToTime(times.nextOpen);
  const closeTimeStr = formatMinutesToTime(times.nextClose);
  return `Opens at <span class="time">${openTimeStr}</span> · Closes at <span class="time">${closeTimeStr}</span>`;
}

// ========== LOADING OVERLAY ==========
function showLoadingOverlay(text = 'Fetching your location…') {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  const textEl = overlay.querySelector('.loader-text');
  if (textEl) textEl.innerHTML = `<i class="fas fa-location-dot"></i> ${text}`;
  overlay.classList.add('active');
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

// ========== HELPERS ==========
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getImageUrl(key) {
  const lowerKey = key.toLowerCase();
  if (imageMap[lowerKey]) return imageMap[lowerKey];
  if (FALLBACK_IMAGES[lowerKey]) return FALLBACK_IMAGES[lowerKey];
  return `https://via.placeholder.com/90?text=${encodeURIComponent(key)}`;
}

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._hide);
  toastEl._hide = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function updateCartCountUI() {
  const total = Object.values(cart).reduce((a, b) => a + (b.qty || 0), 0);
  if (cartCountSpan) cartCountSpan.textContent = total;
}

function getCart() {
  try { return JSON.parse(localStorage.getItem('freshAdatCart')) || {}; } catch { return {}; }
}

function saveCart(c) {
  localStorage.setItem('freshAdatCart', JSON.stringify(c));
}

function getProductUnits(product) {
  if (!product || !product.units) return [];
  return product.units.length > 0 ? product.units : [product.unit || 'unit'];
}

function getProductPrice(product, unitIndex) {
  if (!product) return 0;
  if (product.prices && product.prices.length > unitIndex && product.prices[unitIndex] !== undefined) {
    return product.prices[unitIndex];
  }
  return product.price || 0;
}

function getProductDiscountPrice(product, unitIndex) {
  if (!product) return 0;
  if (product.discountPrices && product.discountPrices.length > unitIndex && product.discountPrices[unitIndex] !== undefined) {
    return product.discountPrices[unitIndex];
  }
  return product.discountPrice || 0;
}

function getEffectivePrice(product, unitIndex) {
  const discount = getProductDiscountPrice(product, unitIndex);
  if (discount > 0 && discount < getProductPrice(product, unitIndex)) {
    return discount;
  }
  return getProductPrice(product, unitIndex);
}

function adjustQuantity(productId, delta, selectedUnit, selectedUnitIndex) {
  const product = products.find(p => p.id == productId);
  if (!product) return;
  if (product.qty === 0) {
    showToast(`${product.name} is out of stock`);
    return;
  }

  const units = getProductUnits(product);
  const unitIndex = (selectedUnitIndex !== undefined && selectedUnitIndex < units.length) ? selectedUnitIndex : 0;
  const unit = selectedUnit || units[unitIndex] || product.unit || 'unit';
  const price = getEffectivePrice(product, unitIndex);

  const cartKey = `${productId}_${unit}`;
  if (!cart[cartKey]) {
    cart[cartKey] = { qty: 0, unit: unit, price: price };
  }

  const currentQty = cart[cartKey].qty || 0;
  const newQty = currentQty + delta;
  if (newQty <= 0) {
    delete cart[cartKey];
  } else if (newQty > MAX_QTY_PER_PRODUCT) {
    alert(`You can't order more than ${MAX_QTY_PER_PRODUCT} quantities of a single product in one order.`);
    return;
  } else {
    cart[cartKey].qty = newQty;
    cart[cartKey].price = price;
  }

  saveCart(cart);
  updateCartCountUI();
  renderProducts();
  if (cartPanel && cartPanel.classList.contains('open')) renderCart();
  updateStickyCartBar();
  updateDetailAddButton();
  if (delta > 0 && newQty <= MAX_QTY_PER_PRODUCT) showToast('Added to cart');
  else if (delta < 0) showToast('Removed');

  const installBanner = document.getElementById('installBanner');
  if (installBanner && installBanner.style.display === 'flex') installBanner.style.display = 'none';
}

function getProductImageUrl(product) {
  if (product.imageUrl && product.imageUrl.startsWith('http')) return product.imageUrl;
  return `https://picsum.photos/seed/${product.id}-${encodeURIComponent(product.name.slice(0,10))}/300/200`;
}

function isCutVegetable(category) {
  if (!category) return false;
  const cat = category.trim().toLowerCase();
  return cat === 'cut-vegetable' || cat === 'cut-vegitable' || cat === 'cut vegetable';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => (m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : ''));
}

function getHomeOrderNumber(showOnHomeValue) {
  if (!showOnHomeValue) return 9999;
  const match = showOnHomeValue.match(/yes[-_]?(\d+)/i);
  return match && match[1] ? parseInt(match[1], 10) : 9999;
}

function productMatchesSearch(p, term) {
  if (!term) return true;
  const lowerTerm = term.toLowerCase();
  if (p.name.toLowerCase().includes(lowerTerm)) return true;
  if (p.category && p.category.toLowerCase().includes(lowerTerm)) return true;
  if (p.tags && p.tags.toLowerCase().includes(lowerTerm)) return true;
  const words = lowerTerm.split(/\s+/).filter(w => w.length > 2);
  for (let word of words) {
    if (p.name.toLowerCase().includes(word)) return true;
    if (p.tags && p.tags.toLowerCase().includes(word)) return true;
    if (p.category && p.category.toLowerCase().includes(word)) return true;
  }
  return false;
}

function productMatchesByTagSubstring(selectedProduct, otherProduct) {
  if (!selectedProduct || !otherProduct) return false;
  if (selectedProduct.id === otherProduct.id) return false;
  const nameWords = selectedProduct.name.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  const otherTags = (otherProduct.tags || '').toLowerCase();
  return nameWords.some(word => otherTags.includes(word));
}

// ========== PRODUCT DETAIL MODAL ==========
function openProductDetail(productId) {
  const product = products.find(p => p.id == productId);
  if (!product) return;
  const modal = document.getElementById('productDetailModal');
  if (!modal) return;

  detailName.textContent = product.name;
  const units = getProductUnits(product);
  const prices = product.prices || [];
  const discountPrices = product.discountPrices || [];
  currentProductUnits = units;
  currentProductPrices = prices;
  currentProductDiscountPrices = discountPrices;
  selectedUnitIndex = 0;

  detailUnitDisplay.textContent = units[0] || product.unit || 'unit';
  detailUnitDisplay.className = 'product-detail-unit highlight-unit';

  if (units.length > 1) {
    detailUnitSelector.style.display = 'block';
    unitOptions.innerHTML = units.map((u, idx) => {
      return `<button class="unit-option ${idx === 0 ? 'active' : ''}" data-index="${idx}">
        ${escapeHtml(u)}
      </button>`;
    }).join('');
    unitOptions.querySelectorAll('.unit-option').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.index);
        selectedUnitIndex = idx;
        detailUnitDisplay.textContent = units[idx];
        unitOptions.querySelectorAll('.unit-option').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        updateDetailPriceAndSelection(product, idx);
        updateDetailAddButton();
      });
    });
    updateDetailPriceAndSelection(product, 0);
  } else {
    detailUnitSelector.style.display = 'none';
    updateDetailPriceAndSelection(product, 0);
  }

  const highlightsContainer = detailHighlights;
  const highlightsListEl = highlightsList;
  if (product.highlight && typeof product.highlight === 'string') {
    const items = product.highlight.split(',').map(item => item.trim()).filter(item => item);
    if (items.length > 0) {
      highlightsContainer.style.display = 'block';
      highlightsListEl.innerHTML = items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    } else {
      highlightsContainer.style.display = 'none';
    }
  } else {
    highlightsContainer.style.display = 'none';
  }

  detailDescription.textContent = product.description || 'Fresh and high quality produce.';

  const mainImg = getProductImageUrl(product);
  let extraImages = [];
  if (product.othr_img && typeof product.othr_img === 'string') {
    const parts = product.othr_img.split(',').map(u => u.trim());
    extraImages.push(...parts.filter(u => u.startsWith('http')));
  }
  if (extraImages.length === 0) {
    if (product.Image2 && product.Image2.startsWith('http')) extraImages.push(product.Image2);
    if (product.Image3 && product.Image3.startsWith('http')) extraImages.push(product.Image3);
  }
  const allImages = [mainImg, ...extraImages.slice(0, 2)];
  slideshowImagesArray = [...new Set(allImages)];
  if (slideshowImagesArray.length === 0) {
    slideshowImagesArray = [getImageUrl('organic')];
  }

  slideshowIndex = 0;
  renderSlideshow();

  detailAddBtn.dataset.productId = product.id;
  updateDetailAddButton();

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function updateDetailPriceAndSelection(product, unitIndex) {
  const price = getEffectivePrice(product, unitIndex);
  const originalPrice = getProductPrice(product, unitIndex);
  let priceHtml = '';
  if (originalPrice > price) {
    priceHtml = `<span class="original-price">₹${originalPrice}</span> <span class="discount-price">₹${price}</span>`;
  } else {
    priceHtml = `<span class="single-price">₹${price}</span>`;
  }
  if (detailPrice) detailPrice.innerHTML = priceHtml;
}

function updateDetailAddButton() {
  const productId = parseInt(detailAddBtn.dataset.productId);
  if (!productId) {
    detailAddBtn.innerHTML = `<span class="add-text"><i class="fas fa-plus"></i> Add to Cart</span>`;
    return;
  }
  const product = products.find(p => p.id === productId);
  if (!product) {
    detailAddBtn.innerHTML = `<span class="add-text"><i class="fas fa-plus"></i> Add to Cart</span>`;
    return;
  }
  const units = getProductUnits(product);
  const idx = selectedUnitIndex;
  const unit = units[idx] || units[0] || product.unit || 'unit';
  const cartKey = `${productId}_${unit}`;
  const cartItem = cart[cartKey];
  const qty = cartItem ? cartItem.qty : 0;
  
  if (qty > 0) {
    detailAddBtn.innerHTML = `
      <button class="qty-btn minus" data-id="${productId}" data-unit="${unit}" data-delta="-1">−</button>
      <span class="qty-number">${qty}</span>
      <button class="qty-btn plus" data-id="${productId}" data-unit="${unit}" data-delta="1">+</button>
    `;
  } else {
    detailAddBtn.innerHTML = `<span class="add-text"><i class="fas fa-plus"></i> Add to Cart</span>`;
  }
}

function renderSlideshow() {
  const container = slideshowImages;
  const dotsContainer = slideshowDots;
  if (!container || !dotsContainer) return;

  container.innerHTML = '';
  dotsContainer.innerHTML = '';

  slideshowImagesArray.forEach((img, idx) => {
    const div = document.createElement('div');
    div.className = `slide-image ${idx === 0 ? 'active' : ''}`;
    div.innerHTML = `<img src="${img}" alt="Product image ${idx+1}" loading="lazy">`;
    container.appendChild(div);
  });

  const prevBtn = document.getElementById('slideshowPrev');
  const nextBtn = document.getElementById('slideshowNext');

  if (slideshowImagesArray.length <= 1) {
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    dotsContainer.style.display = 'none';
  } else {
    prevBtn.style.display = 'flex';
    nextBtn.style.display = 'flex';
    dotsContainer.style.display = 'flex';

    slideshowImagesArray.forEach((_, idx) => {
      const dot = document.createElement('span');
      dot.className = `dot ${idx === 0 ? 'active' : ''}`;
      dot.dataset.index = idx;
      dot.addEventListener('click', () => goToSlide(idx));
      dotsContainer.appendChild(dot);
    });

    prevBtn.onclick = () => {
      goToSlide(slideshowIndex - 1 < 0 ? slideshowImagesArray.length - 1 : slideshowIndex - 1);
    };
    nextBtn.onclick = () => {
      goToSlide((slideshowIndex + 1) % slideshowImagesArray.length);
    };

    if (window._slideshowInterval) clearInterval(window._slideshowInterval);
    window._slideshowInterval = setInterval(() => {
      goToSlide((slideshowIndex + 1) % slideshowImagesArray.length);
    }, 4000);
  }
}

function goToSlide(index) {
  if (index < 0 || index >= slideshowImagesArray.length) return;
  slideshowIndex = index;

  const container = slideshowImages;
  const dots = slideshowDots.querySelectorAll('.dot');
  const images = container.querySelectorAll('.slide-image');

  images.forEach((img, i) => img.classList.toggle('active', i === index));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function closeProductDetail() {
  const modal = document.getElementById('productDetailModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  if (window._slideshowInterval) {
    clearInterval(window._slideshowInterval);
    window._slideshowInterval = null;
  }
}

function handleDetailAddClick(e) {
  const target = e.target;
  const btn = target.closest('.qty-btn');
  if (btn) {
    e.stopPropagation();
    const productId = parseInt(btn.dataset.id);
    const delta = parseInt(btn.dataset.delta);
    const unit = btn.dataset.unit;
    const product = products.find(p => p.id === productId);
    if (product) {
      const units = getProductUnits(product);
      const idx = units.indexOf(unit);
      adjustQuantity(productId, delta, unit, idx >= 0 ? idx : 0);
    }
    return;
  }
  if (target.closest('.add-text') || target === detailAddBtn) {
    const productId = parseInt(detailAddBtn.dataset.productId);
    if (!productId) return;
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const units = getProductUnits(product);
    const idx = selectedUnitIndex;
    const unit = units[idx] || units[0] || product.unit || 'unit';
    const cartKey = `${productId}_${unit}`;
    const cartItem = cart[cartKey];
    const qty = cartItem ? cartItem.qty : 0;
    if (qty === 0) {
      adjustQuantity(productId, 1, unit, idx);
    }
  }
}

// ========== PRODUCT CARD CREATION ==========
function createProductCard(p, showQtyControls = true) {
  const units = getProductUnits(p);
  const defaultUnit = units[0] || p.unit || 'unit';
  const defaultPrice = getEffectivePrice(p, 0);
  const defaultOriginalPrice = getProductPrice(p, 0);
  const cartKey = `${p.id}_${defaultUnit}`;
  const cartItem = cart[cartKey];
  const qty = cartItem ? cartItem.qty : 0;
  const hasQty = qty > 0;
  const isOutOfStock = (p.qty === 0);
  const imageUrl = getProductImageUrl(p);
  const hasMultipleUnits = units.length > 1;

  const imgHtml = `<div class="product-img">
    <img src="${imageUrl}" alt="${p.name}" loading="lazy">
    ${p.isOrganic ? '<span class="organic-label">🌿 Organic</span>' : ''}
    ${isCutVegetable(p.category) ? '<span class="cut-label">✂️ Cut</span>' : ''}
    ${p.label ? `<div class="product-label-badge">${escapeHtml(p.label)}</div>` : ''}
    ${isOutOfStock ? '<div class="out-of-stock-overlay">Out of Stock</div>' : ''}
  </div>`;

  let priceHtml = '';
  if (defaultOriginalPrice > defaultPrice) {
    priceHtml = `<div class="price-wrapper"><span class="original-price">₹${defaultOriginalPrice}</span><span class="discount-price">₹${defaultPrice}</span></div>`;
  } else {
    priceHtml = `<div class="single-price">₹${defaultPrice}</div>`;
  }

  let cardHtml = `<div class="product-card" data-product-id="${p.id}" data-name="${escapeHtml(p.name)}">`;
  cardHtml += imgHtml;
  cardHtml += `<div class="product-info"><div class="product-name">${escapeHtml(p.name)}</div><div class="product-unit">${escapeHtml(defaultUnit)}${hasMultipleUnits ? ' <span class="unit-multiple-indicator">▼ ' + units.length + ' sizes</span>' : ''}</div>${priceHtml}`;

  if (isOutOfStock) {
    if (!hasQty || !showQtyControls) {
      cardHtml += `<button class="add-button disabled" disabled data-id="${p.id}" data-unit="${defaultUnit}"><i class="fas fa-plus"></i> Add</button>`;
    } else {
      cardHtml += `<div class="square-qty-box"><span class="out-of-stock-text">Out of Stock</span></div>`;
    }
  } else if (!hasQty || !showQtyControls) {
    cardHtml += `<button class="add-button" data-id="${p.id}" data-unit="${defaultUnit}"><i class="fas fa-plus"></i> Add</button>`;
  } else {
    cardHtml += `<div class="square-qty-box"><button class="qty-square-btn" data-id="${p.id}" data-unit="${defaultUnit}" data-delta="-1"><i class="fas fa-minus"></i></button><span class="qty-square-value">${qty}</span><button class="qty-square-btn" data-id="${p.id}" data-unit="${defaultUnit}" data-delta="1"><i class="fas fa-plus"></i></button></div>`;
  }
  cardHtml += `</div></div>`;
  return cardHtml;
}

// ========== GLOBAL EVENT DELEGATION ==========
function setupGlobalListeners() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button');
    if (btn) {
      if (btn.classList.contains('add-button') && !btn.disabled) {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const product = products.find(p => p.id == id);
        if (product) {
          const units = getProductUnits(product);
          if (units.length > 1) {
            openProductDetail(id);
          } else {
            adjustQuantity(id, 1, units[0] || '', 0);
          }
        }
        return;
      } else if (btn.classList.contains('qty-square-btn')) {
        e.preventDefault();
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const delta = parseInt(btn.dataset.delta);
        const unit = btn.dataset.unit || '';
        const product = products.find(p => p.id == id);
        if (product) {
          const units = getProductUnits(product);
          const idx = units.indexOf(unit);
          adjustQuantity(id, delta, unit, idx >= 0 ? idx : 0);
        } else {
          adjustQuantity(id, delta, unit, 0);
        }
        return;
      }
    }
    const card = e.target.closest('.product-card');
    if (card && !e.target.closest('button')) {
      e.preventDefault();
      const id = parseInt(card.dataset.productId);
      if (id) openProductDetail(id);
    }
  });
}

// ========== STORE CLOSED BANNER ==========
let closedBannerShown = false;

function updateStoreStatusUI() {
  const mainElement = document.querySelector('main');
  if (!mainElement) return;
  const existing = document.getElementById('storeClosedBanner');
  if (existing) existing.remove();

  const isOpen = isStoreOpenNow();
  isStoreOpen = isOpen;

  const orderBtn = document.getElementById('orderBtn');
  if (orderBtn) {
    if (!isOpen) {
      orderBtn.classList.add('disabled');
      orderBtn.disabled = true;
    } else {
      orderBtn.classList.remove('disabled');
      orderBtn.disabled = false;
    }
  }

  if (!isOpen) {
    const statusMsg = getStoreStatusMessage();
    const nextOpenTime = getNextOpenTimeStr();
    const banner = document.createElement('div');
    banner.id = 'storeClosedBanner';
    banner.className = 'store-closed-banner';
    banner.innerHTML = `
      <div class="banner-icon"><i class="fas fa-store-alt-slash"></i></div>
      <div class="banner-content">
        <div class="banner-title">
          🕒 We're Closed Right Now
          <span>Closed</span>
        </div>
        <div class="banner-message">${statusMsg}</div>
      </div>
      <div class="banner-next-open">
        <i class="fas fa-clock"></i>
        Next Open: <span class="time">${nextOpenTime}</span>
      </div>
    `;
    const catHeader = document.querySelector('.category-header');
    if (catHeader && catHeader.nextSibling) {
      mainElement.insertBefore(banner, catHeader.nextSibling);
    } else {
      mainElement.prepend(banner);
    }
    closedBannerShown = true;
  } else {
    closedBannerShown = false;
  }
}

// ========== LOCATION WARNING ==========
function updateLocationWarning(isValid) {
  const warningEl = document.getElementById('locationWarning');
  if (!warningEl) return;
  if (!isValid) {
    warningEl.style.display = 'flex';
  } else {
    warningEl.style.display = 'none';
  }
}

// ========== OFFERS TEASER ==========
function renderOffersTeaser() {
  const teaserSection = document.getElementById('offersTeaserSection');
  const scrollContainer = document.getElementById('offersTeaserScroll');
  const timerSpan = document.getElementById('homeOffersTimer');
  if (!teaserSection || !scrollContainer) return;

  if (!offers.length) {
    teaserSection.style.display = 'none';
    return;
  }
  const teaserOffers = offers.filter(o => !o.isSlide);
  if (!teaserOffers.length) {
    teaserSection.style.display = 'none';
    return;
  }
  teaserSection.style.display = 'block';

  const validExpiries = teaserOffers.map(o => o.expiryDate).filter(d => d);
  if (validExpiries.length && timerSpan) {
    const earliest = new Date(Math.min(...validExpiries.map(d => new Date(d).getTime())));
    if (homeTimerInterval) clearInterval(homeTimerInterval);
    const expiry = earliest.getTime();
    function updateHomeTimer() {
      const now = new Date().getTime();
      const dist = expiry - now;
      if (dist < 0) {
        timerSpan.innerHTML = "🎉 Expired";
        if (homeTimerInterval) clearInterval(homeTimerInterval);
        return;
      }
      const days = Math.floor(dist / 86400000);
      const hours = Math.floor((dist % 86400000) / 3600000);
      const mins = Math.floor((dist % 3600000) / 60000);
      const secs = Math.floor((dist % 60000) / 1000);
      timerSpan.innerHTML = `⏱️ ${days}d ${hours}h ${mins}m ${secs}s`;
    }
    updateHomeTimer();
    homeTimerInterval = setInterval(updateHomeTimer, 1000);
  } else if (timerSpan) {
    timerSpan.style.display = 'none';
  }

  let html = '';
  teaserOffers.forEach(offer => {
    const imgUrl = offer.imageUrl || getImageUrl(offer.name);
    html += `
      <div class="offer-teaser-card" data-offer-id="${offer.id}">
        <div class="offer-teaser-img">
          <img src="${imgUrl}" alt="${offer.name}" loading="lazy">
          <span class="offer-teaser-badge">${offer.discountPercent}</span>
        </div>
        <div class="offer-teaser-info">
          <div class="offer-teaser-name">${escapeHtml(offer.name)}</div>
          <div class="offer-teaser-unit">${offer.unit}</div>
          <div class="offer-teaser-prices">
            <span class="offer-teaser-old">₹${offer.oldPrice}</span>
            <span class="offer-teaser-new">₹${offer.newPrice}</span>
          </div>
        </div>
      </div>
    `;
  });
  scrollContainer.innerHTML = html;

  document.querySelectorAll('.offer-teaser-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedCat = 'Offers';
      renderCategories();
      renderProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ========== OFFERS PAGE ==========
function renderOffersPage() {
  productsGrid.classList.remove('block');
  productsGrid.style.display = 'block';

  if (!offers.length) {
    productsGrid.innerHTML = `<div class="no-results" style="padding:40px;">✨ No offers available</div>`;
    return;
  }

  const slideOffers = offers.filter(o => o.isSlide === true);
  const cardOffers = offers.filter(o => !o.isSlide);

  let html = '<div class="offers-page-container">';

  if (slideOffers.length) {
    let slidesHtml = `<div class="offers-page-slideshow">`;
    slideOffers.forEach((offer, idx) => {
      const hasImage = offer.slideImageUrl && offer.slideImageUrl.startsWith('http');
      if (hasImage) {
        slidesHtml += `<div class="offers-slide ${idx === 0 ? 'active' : ''}">
                         <img src="${offer.slideImageUrl}" alt="${offer.name}">
                       </div>`;
      } else {
        slidesHtml += `<div class="offers-slide text-banner ${idx === 0 ? 'active' : ''}" style="background: linear-gradient(135deg, #1a6b3c, #2d9e5f); color: white; text-align: center; padding: 40px 20px; border-radius: 20px;">
                         <div class="text-banner-content">
                           <div class="text-banner-title" style="font-size: 1.8rem; font-weight: 800;">🔥 LIMITED TIME OFFER!</div>
                           <div class="text-banner-product" style="font-size: 2.5rem; font-weight: 900; margin: 10px 0;">${escapeHtml(offer.name)}</div>
                           <div class="text-banner-price" style="font-size: 2rem; background: rgba(255,255,255,0.2); display: inline-block; padding: 8px 24px; border-radius: 60px;">₹${offer.newPrice}<span style="font-size: 1rem;"> / ${offer.unit}</span></div>
                           <div class="text-banner-old" style="font-size: 1rem; text-decoration: line-through; opacity: 0.8; margin-top: 8px;">Was ₹${offer.oldPrice}</div>
                           <div class="text-banner-discount" style="margin-top: 8px;">🔥 ${offer.discountPercent} OFF</div>
                         </div>
                       </div>`;
      }
    });
    slidesHtml += `<div class="slide-dots">`;
    slideOffers.forEach((_, idx) => {
      slidesHtml += `<span class="slide-dot ${idx === 0 ? 'active' : ''}" data-slide="${idx}"></span>`;
    });
    slidesHtml += `</div></div>`;
    html += slidesHtml;
  }

  if (cardOffers.length) {
    html += `<div class="offers-page-grid">`;
    cardOffers.forEach(offer => {
      const fakeProduct = {
        id: offer.productId || `offer_${offer.id}`,
        name: offer.name,
        unit: offer.unit,
        price: offer.oldPrice,
        discountPrice: offer.newPrice,
        isOrganic: false,
        category: 'offers',
        imageUrl: offer.imageUrl,
        tags: '',
        label: '',
        qty: 999,
        description: offer.description || '',
        highlight: offer.highlight || '',
        othr_img: offer.othr_img || '',
        units: [offer.unit],
        prices: [offer.oldPrice],
        discountPrices: [offer.newPrice]
      };
      html += createProductCard(fakeProduct, true);
    });
    html += `</div>`;
  }

  html += `</div>`;
  productsGrid.innerHTML = html;

  if (slideOffers.length > 1) {
    const slides = document.querySelectorAll('.offers-slide');
    const dots = document.querySelectorAll('.slide-dot');
    if (slides.length) {
      let current = 0;
      setInterval(() => {
        slides[current].classList.remove('active');
        dots[current].classList.remove('active');
        current = (current + 1) % slides.length;
        slides[current].classList.add('active');
        dots[current].classList.add('active');
      }, 4000);
      dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
          slides[current].classList.remove('active');
          dots[current].classList.remove('active');
          current = i;
          slides[current].classList.add('active');
          dots[current].classList.add('active');
        });
      });
    }
  }
}

// ========== OFFER MODAL ==========
function showOfferDetailModal(offer) {
  currentOffer = offer;
  const modal = document.getElementById('offerDetailModal');
  const contentDiv = document.getElementById('offerDetailContent');

  if (!modal || !contentDiv) {
    console.error("Offer modal elements missing");
    showToast("Cannot show offer details. Please refresh.");
    return;
  }

  const imgUrl = offer.imageUrl || getImageUrl(offer.name);

  let timerHtml = '';
  if (offer.expiryDate) {
    timerHtml = `<div class="offer-detail-timer">⏱️ Ends in: <span id="offerTimerDisplay"></span></div>`;
  }

  contentDiv.innerHTML = `
    <img class="offer-detail-img" src="${imgUrl}" alt="${offer.name}">
    <div class="offer-detail-name">${escapeHtml(offer.name)}</div>
    <div class="offer-detail-unit">${offer.unit}</div>
    <div class="offer-detail-prices">
      <span class="offer-detail-old">₹${offer.oldPrice}</span>
      <span class="offer-detail-new">₹${offer.newPrice}</span>
    </div>
    <div class="offer-detail-discount">🔥 ${offer.discountPercent}</div>
    ${timerHtml}
  `;

  modal.style.display = 'flex';

  if (offer.expiryDate) {
    if (offerTimerInterval) clearInterval(offerTimerInterval);
    const expiry = new Date(offer.expiryDate).getTime();
    function updateTimer() {
      const now = new Date().getTime();
      const dist = expiry - now;
      if (dist < 0) {
        const timerSpan = document.getElementById('offerTimerDisplay');
        if (timerSpan) timerSpan.innerText = "Expired";
        if (offerTimerInterval) clearInterval(offerTimerInterval);
        return;
      }
      const days = Math.floor(dist / 86400000);
      const hours = Math.floor((dist % 86400000) / 3600000);
      const mins = Math.floor((dist % 3600000) / 60000);
      const secs = Math.floor((dist % 60000) / 1000);
      const timerSpan = document.getElementById('offerTimerDisplay');
      if (timerSpan) timerSpan.innerText = `${days}d ${hours}h ${mins}m ${secs}s`;
    }
    updateTimer();
    offerTimerInterval = setInterval(updateTimer, 1000);
  }
}

function closeOfferModal() {
  const modal = document.getElementById('offerDetailModal');
  if (modal) modal.style.display = 'none';
  if (offerTimerInterval) clearInterval(offerTimerInterval);
  currentOffer = null;
}

function addOfferToCart() {
  if (currentOffer && currentOffer.productId) {
    adjustQuantity(currentOffer.productId, 1, currentOffer.unit || '', 0);
    closeOfferModal();
  } else {
    showToast("Product not found for this offer");
  }
}

// ========== HOMEPAGE LAYOUT ==========
function renderCustomHomeLayout() {
  const teaserSection = document.getElementById('offersTeaserSection');
  if (teaserSection) teaserSection.style.display = 'none';
  
  let bannerHtml = '';
  let closeTimer = null;
  if (!localStorage.getItem('announcement_closed')) {
    bannerHtml = `<div id="announcementBanner" class="announcement-banner">
      <div class="announcement-content">
        <i class="fas fa-star" style="color: var(--orange);"></i>
        <span>🌟 New Products Added Daily! ഞങ്ങൾ ദിവസവും പുതിയ ഉൽപ്പന്നങ്ങൾ ചേർക്കുന്നു. നിങ്ങൾ അന്വേഷിക്കുന്ന ഉൽപ്പന്നം ഇപ്പോൾ ലഭ്യമല്ലെങ്കിൽ ഉടൻ തന്നെ ലഭ്യമാക്കുന്നതാണ്. Thank you for your support!</span>
        <button class="close-banner" id="closeAnnouncementBtn">&times;</button>
      </div>
    </div>`;
  }
  
  productsGrid.classList.add('block');
  productsGrid.style.display = 'block';
  const sortedAll = [...products].sort((a,b) => getHomeOrderNumber(a.showOnHomeRaw) - getHomeOrderNumber(b.showOnHomeRaw));
  const firstFour = sortedAll.slice(0,4);
  const nextTen = sortedAll.slice(4,14);
  let firstFourHtml = `<div class="first-four-grid">`;
  firstFour.forEach(p => { firstFourHtml += createProductCard(p, true); });
  firstFourHtml += `</div>`;
  const slide1Url = getImageUrl('slide1');
  const slide2Url = getImageUrl('slide2');
  const slide3Url = getImageUrl('slide3');
  const slideshowHtml = `<div class="home-slideshow"><div class="slide active"><img src="${slide1Url}" alt="Fresh vegetables"></div><div class="slide"><img src="${slide2Url}" alt="Organic fruits"></div><div class="slide"><img src="${slide3Url}" alt="Leafy greens"></div><div class="slideshow-dots"></div></div>`;
  const categoryStripHtml = `<div class="category-strip"><div class="category-square" data-cat-value="vegitable-fresh"><img class="square-img" src="${getImageUrl('vegitable-fresh')}" alt="Fresh Veg"><span class="square-name">Fresh Veg</span></div><div class="category-square" data-cat-value="vegitable-fresh-leafs"><img class="square-img" src="${getImageUrl('vegitable-fresh-leafs')}" alt="Fresh Leafs"><span class="square-name">Fresh Leafs</span></div><div class="category-square" data-cat-value="fruits-fresh"><img class="square-img" src="${getImageUrl('fruits-fresh')}" alt="Fresh Fruits"><span class="square-name">Fresh Fruits</span></div><div class="category-square" data-cat-value="diary"><img class="square-img" src="${getImageUrl('diary')}" alt="Dairy & Egg"><span class="square-name">Dairy & Egg</span></div><div class="category-square" data-cat-value="meats"><img class="square-img" src="${getImageUrl('meats')}" alt="Meats"><span class="square-name">Meats</span></div><div class="category-square" data-cat-value="rice"><img class="square-img" src="${getImageUrl('rice')}" alt="Atta & Rice"><span class="square-name">Atta & Rice</span></div></div>`;
  
  productsGrid.innerHTML = bannerHtml + firstFourHtml + slideshowHtml + categoryStripHtml;
  
  if (bannerHtml) {
    setTimeout(() => {
      const banner = document.getElementById('announcementBanner');
      const closeBtn = document.getElementById('closeAnnouncementBtn');
      
      const removeBanner = () => {
        if (banner && banner.parentNode) banner.remove();
        if (closeTimer) clearTimeout(closeTimer);
        localStorage.setItem('announcement_closed', 'true');
      };
      
      closeTimer = setTimeout(() => {
        removeBanner();
      }, 15000);
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          removeBanner();
        });
      }
    }, 0);
  }
  
  initSlideshow();
  attachCategorySquareEvents();
  renderHomeCarousel(nextTen);
  renderOffersTeaser();
  updateStoreStatusUI();
}

function initSlideshow() {
  const slideshow = document.querySelector('.home-slideshow');
  if (!slideshow) return;
  const slides = slideshow.querySelectorAll('.slide');
  const dotsContainer = slideshow.querySelector('.slideshow-dots');
  if (!slides.length) return;
  dotsContainer.innerHTML = '';
  slides.forEach((_, idx) => {
    const dot = document.createElement('span');
    dot.classList.add('dot');
    if (idx === 0) dot.classList.add('active');
    dot.addEventListener('click', () => {
      slides.forEach((s,i) => s.classList.toggle('active', i === idx));
      dotsContainer.querySelectorAll('.dot').forEach((d,i) => d.classList.toggle('active', i === idx));
    });
    dotsContainer.appendChild(dot);
  });
  let currentIndex = 0;
  setInterval(() => {
    currentIndex = (currentIndex + 1) % slides.length;
    slides.forEach((s,i) => s.classList.toggle('active', i === currentIndex));
    const dots = dotsContainer.querySelectorAll('.dot');
    dots.forEach((d,i) => d.classList.toggle('active', i === currentIndex));
  }, 4000);
}

function attachCategorySquareEvents() {
  document.querySelectorAll('.category-square').forEach(sq => {
    sq.addEventListener('click', () => {
      const catValue = sq.dataset.catValue;
      if (catValue) {
        selectedCat = catValue;
        renderCategories();
        renderProducts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

function renderHomeCarousel(productsToShow = null) {
  const carouselSection = document.getElementById('homeCarouselSection');
  const carouselContainer = document.getElementById('homeCarousel');
  if (!carouselSection || !carouselContainer) return;
  let items = productsToShow;
  if (!items || items.length === 0) {
    const sorted = [...products].sort((a,b) => getHomeOrderNumber(a.showOnHomeRaw) - getHomeOrderNumber(b.showOnHomeRaw));
    items = sorted.slice(4,14);
  }
  if (items.length === 0) {
    carouselSection.style.display = 'none';
    return;
  }
  carouselSection.style.display = 'block';
  let carouselHtml = '';
  items.forEach(p => { carouselHtml += createProductCard(p, true); });
  carouselContainer.innerHTML = carouselHtml;
}

function renderSuggestionBasedResults(selectedProduct) {
  const teaserSection = document.getElementById('offersTeaserSection');
  if (teaserSection) teaserSection.style.display = 'none';
  
  const homeCarouselSection = document.getElementById('homeCarouselSection');
  if (homeCarouselSection) homeCarouselSection.style.display = 'none';
  productsGrid.classList.add('block');
  productsGrid.style.display = 'block';
  const matchedOthers = products.filter(p => productMatchesByTagSubstring(selectedProduct, p));
  const sameCategoryProducts = products.filter(p => p.category === selectedProduct.category && p.id !== selectedProduct.id);
  const relatedByTags = products.filter(p => {
    if (p.id === selectedProduct.id) return false;
    if (p.category === selectedProduct.category) return false;
    const selectedTags = (selectedProduct.tags || '').toLowerCase().split(',').map(t => t.trim());
    const productTags = (p.tags || '').toLowerCase().split(',').map(t => t.trim());
    return selectedTags.some(tag => productTags.includes(tag));
  });
  let html = `<div class="search-results-highlight"><h3 style="font-family: 'Playfair Display', serif; color: var(--green); margin-bottom: 18px; display: flex; align-items: center; gap: 8px;"><i class="fas fa-leaf" style="color: var(--orange);"></i> Products related to "${escapeHtml(selectedProduct.name)}"</h3><div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;">`;
  html += createProductCard(selectedProduct, true);
  matchedOthers.forEach(p => { html += createProductCard(p, true); });
  html += `</div></div>`;
  if (sameCategoryProducts.length > 0) {
    html += `<div class="similar-products-section" style="margin-top: 28px;"><div class="carousel-header"><h3><i class="fas fa-tags"></i> More from ${selectedProduct.category.replace(/-/g, ' ')}</h3><span class="carousel-hint"><i class="fas fa-arrow-left"></i> Swipe to explore <i class="fas fa-arrow-right"></i></span></div><div class="horizontal-scroll-wrapper" id="suggestionCategoryCarousel"></div></div>`;
  }
  if (relatedByTags.length > 0) {
    html += `<div class="related-by-tags-section" style="margin-top: 28px;"><div class="carousel-header"><h3><i class="fas fa-link"></i> Related products</h3><span class="carousel-hint"><i class="fas fa-arrow-left"></i> Swipe to explore <i class="fas fa-arrow-right"></i></span></div><div class="horizontal-scroll-wrapper" id="suggestionTagCarousel"></div></div>`;
  }
  productsGrid.innerHTML = html;
  if (sameCategoryProducts.length > 0) {
    const catCarousel = document.getElementById('suggestionCategoryCarousel');
    if (catCarousel) {
      let carouselHtml = '';
      sameCategoryProducts.forEach(p => { carouselHtml += createProductCard(p, true); });
      catCarousel.innerHTML = carouselHtml;
    }
  }
  if (relatedByTags.length > 0) {
    const tagCarousel = document.getElementById('suggestionTagCarousel');
    if (tagCarousel) {
      let carouselHtml = '';
      relatedByTags.forEach(p => { carouselHtml += createProductCard(p, true); });
      tagCarousel.innerHTML = carouselHtml;
    }
  }
}

function renderSearchResults() {
  const teaserSection = document.getElementById('offersTeaserSection');
  if (teaserSection) teaserSection.style.display = 'none';
  
  const homeCarouselSection = document.getElementById('homeCarouselSection');
  if (homeCarouselSection) homeCarouselSection.style.display = 'none';
  let matched = products.filter(p => productMatchesSearch(p, searchTerm));
  if (matched.length === 0) {
    productsGrid.classList.remove('block');
    productsGrid.style.display = 'grid';
    productsGrid.innerHTML = `<div class="no-results" style="grid-column:1/-1; padding:40px;">✨ No products found for "${escapeHtml(searchTerm)}"</div>`;
    return;
  }
  matched.sort((a, b) => {
    const aNameMatch = a.name.toLowerCase().includes(searchTerm);
    const bNameMatch = b.name.toLowerCase().includes(searchTerm);
    if (aNameMatch && !bNameMatch) return -1;
    if (!aNameMatch && bNameMatch) return 1;
    const aCatMatch = a.category && a.category.toLowerCase().includes(searchTerm);
    const bCatMatch = b.category && b.category.toLowerCase().includes(searchTerm);
    if (aCatMatch && !bCatMatch) return -1;
    if (!aCatMatch && bCatMatch) return 1;
    return 0;
  });
  productsGrid.classList.add('block');
  productsGrid.style.display = 'block';
  let html = `<div class="search-results-highlight"><h3 style="font-family: 'Playfair Display', serif; color: var(--green); margin-bottom: 18px; display: flex; align-items: center; gap: 8px;"><i class="fas fa-search" style="color: var(--orange);"></i> Search Results (${matched.length})</h3><div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;">`;
  matched.forEach(p => { html += createProductCard(p, true); });
  html += `</div></div>`;
  const primaryProduct = matched[0];
  const primaryCategory = primaryProduct.category;
  const shownIds = new Set(matched.map(p => p.id));
  const similarByCategory = products.filter(p => p.category === primaryCategory && !shownIds.has(p.id));
  let primaryTags = (primaryProduct.tags || '').toLowerCase().split(',').map(t => t.trim());
  const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  primaryTags.push(...searchWords);
  const similarByTag = products.filter(p => {
    if (shownIds.has(p.id)) return false;
    if (p.category === primaryCategory) return false;
    let productTags = (p.tags || '').toLowerCase().split(',').map(t => t.trim());
    return primaryTags.some(tag => productTags.includes(tag));
  });
  if (similarByCategory.length > 0) {
    html += `<div class="similar-products-section" style="margin-top: 28px;"><div class="carousel-header"><h3><i class="fas fa-tags"></i> More from ${primaryCategory.replace(/-/g, ' ')}</h3><span class="carousel-hint"><i class="fas fa-arrow-left"></i> Swipe to explore <i class="fas fa-arrow-right"></i></span></div><div class="horizontal-scroll-wrapper" id="similarCategoryCarousel"></div></div>`;
  }
  if (similarByTag.length > 0) {
    html += `<div class="related-by-tags-section" style="margin-top: 28px;"><div class="carousel-header"><h3><i class="fas fa-link"></i> Related by tags</h3><span class="carousel-hint"><i class="fas fa-arrow-left"></i> Swipe to explore <i class="fas fa-arrow-right"></i></span></div><div class="horizontal-scroll-wrapper" id="similarTagCarousel"></div></div>`;
  }
  productsGrid.innerHTML = html;
  if (similarByCategory.length > 0) {
    const catCarousel = document.getElementById('similarCategoryCarousel');
    if (catCarousel) {
      let carouselHtml = '';
      similarByCategory.forEach(p => { carouselHtml += createProductCard(p, true); });
      catCarousel.innerHTML = carouselHtml;
    }
  }
  if (similarByTag.length > 0) {
    const tagCarousel = document.getElementById('similarTagCarousel');
    if (tagCarousel) {
      let carouselHtml = '';
      similarByTag.forEach(p => { carouselHtml += createProductCard(p, true); });
      tagCarousel.innerHTML = carouselHtml;
    }
  }
}

function renderFilteredGrid() {
  const teaserSection = document.getElementById('offersTeaserSection');
  if (teaserSection) teaserSection.style.display = 'none';
  
  if (selectedCat === 'Offers') {
    renderOffersPage();
    return;
  }

  productsGrid.classList.remove('block');
  productsGrid.style.display = 'grid';
  let filtered = products.filter(p => {
    if (selectedCat === 'All') {
      if (searchTerm !== '') return productMatchesSearch(p, searchTerm);
      return p.showOnHomeRaw && p.showOnHomeRaw.toLowerCase().startsWith('yes');
    } else if (selectedCat === 'Cut Vegetables') return isCutVegetable(p.category);
    else return p.category === selectedCat;
  });
  if (selectedCat === 'All' && searchTerm === '') {
    filtered.sort((a,b) => getHomeOrderNumber(a.showOnHomeRaw) - getHomeOrderNumber(b.showOnHomeRaw));
  } else {
    filtered.sort((a,b) => (b.offer === true) - (a.offer === true));
  }
  if (!filtered.length) {
    productsGrid.innerHTML = `<div class="no-results" style="grid-column:1/-1; padding:40px;">✨ No products found</div>`;
  } else {
    productsGrid.innerHTML = filtered.map(p => createProductCard(p, true)).join('');
  }
  const carouselSection = document.getElementById('homeCarouselSection');
  if (carouselSection) carouselSection.style.display = 'none';
}

function renderProducts() {
  if (selectedSuggestionProduct !== null) {
    renderSuggestionBasedResults(selectedSuggestionProduct);
    return;
  }
  if (searchTerm !== '') {
    renderSearchResults();
    return;
  }
  if (selectedCat === 'All' && searchTerm === '') {
    renderCustomHomeLayout();
  } else {
    renderFilteredGrid();
  }
  updateStoreStatusUI();
}

function getCategoryList() {
  let dynamicCats = [...new Set(products.map(p => p.category ? p.category.trim().toLowerCase() : ''))];
  dynamicCats = dynamicCats.filter(c => c && !isCutVegetable(c));
  return ['All', 'Offers', 'Cut Vegetables', ...dynamicCats];
}

function renderCategories() {
  const categoryList = getCategoryList();
  catRow.innerHTML = categoryList.map(c => {
    let displayName = c === 'Cut Vegetables' ? '🥒 Cut Vegetables' : c === 'All' ? '📦 All' : c === 'Offers' ? '🔥 Offers' : c;
    return `<button class="cat-chip ${selectedCat === c ? 'active' : ''}" data-cat="${c}">${displayName}</button>`;
  }).join('');
  document.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCat = btn.dataset.cat;
      renderCategories();
      renderProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ========== SEARCH SUGGESTIONS ==========
function updateClearButtons() {
  if (desktopClearBtn) desktopClearBtn.style.display = searchTerm ? 'block' : 'none';
  if (mobileClearBtn) mobileClearBtn.style.display = searchTerm ? 'block' : 'none';
}

function getSuggestionProducts(input) {
  if (!input || input.length < 2) return [];
  const lowerInput = input.toLowerCase();
  const matched = new Map();
  products.forEach(p => {
    if (p.name.toLowerCase().includes(lowerInput)) matched.set(p.id, p);
    else if (p.tags && p.tags.toLowerCase().includes(lowerInput)) matched.set(p.id, p);
  });
  if (lowerInput === 'lady') {
    const ladyProduct = products.find(p => p.name.toLowerCase().includes('lady finger') || p.name.toLowerCase().includes('okra'));
    if (ladyProduct) matched.set(ladyProduct.id, ladyProduct);
  }
  return Array.from(matched.values()).slice(0, 5);
}

function showSuggestions(inputElement, suggestionsContainer, inputValue, isMobile = false) {
  const matchedProducts = getSuggestionProducts(inputValue);
  if (matchedProducts.length === 0) {
    suggestionsContainer.classList.remove('active');
    return;
  }
  suggestionsContainer.innerHTML = matchedProducts.map(p => {
    const imgUrl = getProductImageUrl(p);
    return `<div class="suggestion-item" data-product-id="${p.id}"><img class="suggestion-img" src="${imgUrl}" alt="${escapeHtml(p.name)}" loading="lazy"><span class="suggestion-name">${escapeHtml(p.name)}</span></div>`;
  }).join('');
  suggestionsContainer.classList.add('active');
  suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const productId = parseInt(item.dataset.productId);
      const product = products.find(p => p.id === productId);
      if (product) {
        selectedSuggestionProduct = product;
        searchTerm = product.name.toLowerCase();
        if (isMobile && mobileSearch) mobileSearch.value = product.name;
        else if (desktopSearch) desktopSearch.value = product.name;
        updateClearButtons();
        suggestionsContainer.classList.remove('active');
        renderProducts();
      }
    });
  });
}

function handleSearchInput(value, isMobile = false) {
  selectedSuggestionProduct = null;
  searchTerm = value.trim().toLowerCase();
  updateClearButtons();
  const suggestionsEl = isMobile ? mobileSuggestions : desktopSuggestions;
  if (value.length >= 2) showSuggestions(isMobile ? mobileSearch : desktopSearch, suggestionsEl, value, isMobile);
  else suggestionsEl.classList.remove('active');
  renderProducts();
}

function clearSearch(isMobile = false) {
  selectedSuggestionProduct = null;
  searchTerm = '';
  if (isMobile && mobileSearch) {
    mobileSearch.value = '';
    mobileSuggestions.classList.remove('active');
  } else if (desktopSearch) {
    desktopSearch.value = '';
    desktopSuggestions.classList.remove('active');
  }
  updateClearButtons();
  renderProducts();
}

function initSearchListeners() {
  desktopSearch = document.getElementById('desktopSearch');
  mobileSearch = document.getElementById('mobileSearchInput');
  desktopClearBtn = document.getElementById('desktopClearBtn');
  mobileClearBtn = document.getElementById('mobileClearBtn');
  desktopSuggestions = document.getElementById('desktopSuggestions');
  mobileSuggestions = document.getElementById('mobileSuggestions');
  if (desktopSearch) {
    desktopSearch.addEventListener('input', e => handleSearchInput(e.target.value, false));
    desktopSearch.addEventListener('blur', () => setTimeout(() => desktopSuggestions.classList.remove('active'), 200));
  }
  if (mobileSearch) {
    mobileSearch.addEventListener('input', e => handleSearchInput(e.target.value, true));
    mobileSearch.addEventListener('blur', () => setTimeout(() => mobileSuggestions.classList.remove('active'), 200));
  }
  if (desktopClearBtn) desktopClearBtn.addEventListener('click', () => clearSearch(false));
  if (mobileClearBtn) mobileClearBtn.addEventListener('click', () => clearSearch(true));
}

// ========== CART RENDERING ==========
function renderCart() {
  const keys = Object.keys(cart).filter(k => cart[k].qty > 0);
  const cartPreOrderContainer = document.getElementById('cartPreOrderContainer');

  if (!keys.length) {
    cartItems.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-cart"></i><p>Cart empty</p></div>`;
    cartFooter.style.display = 'none';
    if (cartPreOrderContainer) {
      cartPreOrderContainer.innerHTML = '';
      cartPreOrderContainer.style.display = 'none';
    }
    updateStickyCartBar();
    return;
  }

  let total = 0, count = 0, totalSaved = 0;
  let cartHtml = '';
  let hasMeat = false;

  keys.forEach(key => {
    const [productId, unit] = key.split('_');
    const p = products.find(x => x.id == parseInt(productId));
    if (!p) return;
    const item = cart[key];
    const qty = item.qty;
    const price = item.price || 0;
    const originalPrice = getProductPrice(p, 0) || p.price || 0;
    const sub = price * qty;
    const saved = (originalPrice - price) * qty;
    total += sub;
    count += qty;
    totalSaved += saved;
    const imgSrc = getProductImageUrl(p);
    if (isMeatProduct(p)) hasMeat = true;

    cartHtml += `<div class="cart-item">
      <div class="cart-item-emoji"><img src="${imgSrc}" alt="${p.name}"></div>
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(p.name)}</div>
        <div class="cart-item-unit">${escapeHtml(unit)}</div>
        <div class="cart-item-price-original">
          ${originalPrice > price ? `<span class="original-price">₹${originalPrice}</span>` : ''}
          <span class="discount-price">₹${price}</span>
        </div>
        ${saved > 0 ? `<div class="cart-item-saved">You saved: ₹${saved}</div>` : ''}
      </div>
      <div class="cart-item-qty">
        <button class="cqty-btn" data-key="${key}" data-delta="-1"><i class="fas fa-minus"></i></button>
        <span>${qty}</span>
        <button class="cqty-btn" data-key="${key}" data-delta="1"><i class="fas fa-plus"></i></button>
        <button class="remove-btn" data-key="${key}" data-remove="all"><i class="fas fa-trash-alt"></i></button>
      </div>
    </div>`;
  });

  cartItems.innerHTML = cartHtml;

  // ---- Delivery Option Section (only if meat is in cart) ----
  if (hasMeat) {
    const currentPreOrder = cartPreOrderDateTime;
    const isScheduled = !!currentPreOrder;

    let preOrderHtml = `
      <div class="delivery-option-section">
        <div class="delivery-option-header">
          <i class="fas fa-truck"></i>
          <span>Delivery Option</span>
          <small>Choose only if you need delivery on a specific date</small>
        </div>
        <div class="delivery-option-choices">
          <label class="delivery-option-radio ${!isScheduled ? 'active' : ''}">
            <input type="radio" name="deliveryType" value="today" ${!isScheduled ? 'checked' : ''}>
            <span class="radio-label">
              <strong>Today Delivery</strong>
              <span class="radio-sub">As soon as possible</span>
            </span>
          </label>
          <label class="delivery-option-radio ${isScheduled ? 'active' : ''}">
            <input type="radio" name="deliveryType" value="schedule" ${isScheduled ? 'checked' : ''}>
            <span class="radio-label">
              <strong>Schedule for Later</strong>
              <span class="radio-sub">Pre-order</span>
            </span>
          </label>
        </div>
        <div class="delivery-schedule-body" id="deliveryScheduleBody" style="display: ${isScheduled ? 'block' : 'none'};">
          <div class="schedule-datetime">
            <input type="datetime-local" id="cartPreOrderInput" min="">
            <button class="schedule-set-btn" id="cartPreOrderSetBtn">Set</button>
          </div>
          ${isScheduled ? `<div class="schedule-confirmed">✅ Scheduled for: ${new Date(currentPreOrder).toLocaleString()}</div>` : ''}
          <small>Don't worry! You can choose a specific delivery date & time only if needed.</small>
        </div>
      </div>
    `;

    cartPreOrderContainer.innerHTML = preOrderHtml;
    cartPreOrderContainer.style.display = 'block';

    // ---- Event listeners ----
    const radios = document.querySelectorAll('input[name="deliveryType"]');
    const scheduleBody = document.getElementById('deliveryScheduleBody');
    const input = document.getElementById('cartPreOrderInput');
    const setBtn = document.getElementById('cartPreOrderSetBtn');

    if (input) {
      const now = new Date();
      now.setHours(now.getHours() + 1);
      input.min = now.toISOString().slice(0, 16);
      if (!input.value && !isScheduled) {
        input.value = now.toISOString().slice(0, 16);
      }
    }

    radios.forEach(radio => {
      radio.addEventListener('change', function() {
        const isSchedule = this.value === 'schedule';
        document.querySelectorAll('.delivery-option-radio').forEach(lbl => {
          lbl.classList.toggle('active', lbl.querySelector('input').checked);
        });
        if (scheduleBody) {
          scheduleBody.style.display = isSchedule ? 'block' : 'none';
        }
        if (!isSchedule) {
          setCartPreOrder(null);
          showToast('📦 Delivery set to today');
          renderCart();
        }
      });
    });

    if (setBtn && input) {
      setBtn.addEventListener('click', function() {
        const dt = input.value;
        if (!dt) {
          showToast('Please select a date and time.');
          return;
        }
        const selected = new Date(dt);
        const now = new Date();
        if (selected.getTime() < now.getTime() + 3600000) {
          showToast('Please choose a time at least 1 hour from now.');
          return;
        }
        setCartPreOrder(dt);
        showToast('✅ Pre‑order time set!');
        renderCart();
      });
    }

  } else {
    cartPreOrderContainer.innerHTML = '';
    cartPreOrderContainer.style.display = 'none';
  }

  // ---- Footer ----
  // Use road distance via getDistanceFromStore (async, but we need it for display)
  // We'll fetch it if not yet cached; for quick rendering we use straight-line fallback
  // but we'll update after fetch.
  const subtotal = total;
  // Try to get cached road distance, if not, use straight-line
  let distance = customerData.roadDistance;
  if (distance === null || distance === undefined) {
    // fallback to straight-line for immediate display
    if (customerData.location && customerData.location.lat) {
      distance = getDistanceKm(ADAT_LAT, ADAT_LON, customerData.location.lat, customerData.location.lng);
    } else {
      distance = null;
    }
  }
  const deliveryCharge = getDeliveryCharge(subtotal, distance);
  const ecoCharge = customerData.useEcoBox ? ECO_BOX_CHARGE : 0;
  const grandTotal = subtotal + deliveryCharge + ecoCharge;

  footerItems.textContent = count;
  let footerHtml = `
    <div class="cart-total"><span>Items (${count})</span><span>₹${subtotal}</span></div>
    <div class="cart-total"><span>Delivery</span><span>${deliveryCharge === 0 ? 'Free' : '₹' + deliveryCharge}</span></div>
    ${customerData.useEcoBox ? `<div class="cart-total"><span>Eco-box</span><span>₹${ECO_BOX_CHARGE}</span></div>` : ''}
    <div class="cart-total grand"><span>Total</span><span>₹${grandTotal}</span></div>
  `;
  if (cartPreOrderDateTime) {
    footerHtml += `<div class="cart-preorder-footer">📅 Scheduled: ${new Date(cartPreOrderDateTime).toLocaleString()}</div>`;
  }
  if (totalSaved > 0) {
    footerHtml += `<div class="cart-total-saved">You saved: ₹${totalSaved}</div>`;
  }
  footerHtml += `<div class="cart-eco-message">✅ Delivered in reusable eco‑box  |  ♻️ Please return the empty box</div>`;

  const footerContainer = document.getElementById('cartFooter');
  const orderBtn = footerContainer.querySelector('.order-btn');
  footerContainer.innerHTML = footerHtml;
  footerContainer.appendChild(orderBtn);
  footerContainer.style.display = 'block';

  // ---- Attach cart item controls ----
  document.querySelectorAll('.cqty-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      const key = newBtn.dataset.key;
      const delta = parseInt(newBtn.dataset.delta);
      const [productId, unit] = key.split('_');
      const p = products.find(x => x.id == parseInt(productId));
      if (p) {
        const units = getProductUnits(p);
        const idx = units.indexOf(unit);
        adjustQuantity(parseInt(productId), delta, unit, idx >= 0 ? idx : 0);
      }
    });
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      const key = newBtn.dataset.key;
      delete cart[key];
      saveCart(cart);
      updateCartCountUI();
      renderProducts();
      renderCart();
      updateStickyCartBar();
      showToast('Removed');
    });
  });

  updateStickyCartBar();
}

// ========== STICKY CART BAR ==========
function isCartPanelOpen() {
  return cartPanel && cartPanel.classList.contains('open');
}

function toggleStickyDetailed() {
  if (!stickyDetailedDiv) return;
  stickyDetailedOpen = !stickyDetailedOpen;
  if (stickyDetailedOpen) {
    stickyDetailedDiv.style.display = 'block';
    if (stickyToggleBtn) stickyToggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    renderStickyDetailedList();
  } else {
    stickyDetailedDiv.style.display = 'none';
    if (stickyToggleBtn) stickyToggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
  }
}

function renderStickyDetailedList() {
  const container = document.getElementById('stickyCartProductsList');
  if (!container) return;
  const keys = Object.keys(cart).filter(k => cart[k].qty > 0);
  if (keys.length === 0) {
    container.innerHTML = '';
    return;
  }
  let detailedHtml = '';
  let totalItems = 0;
  let totalSavings = 0;
  keys.forEach(key => {
    const [productId, unit] = key.split('_');
    const p = products.find(x => x.id == parseInt(productId));
    if (!p) return;
    const item = cart[key];
    const qty = item.qty;
    const price = item.price || 0;
    const originalPrice = getProductPrice(p, 0) || p.price || 0;
    const saved = (originalPrice - price) * qty;
    totalItems += qty;
    totalSavings += saved;
    const imgSrc = getProductImageUrl(p);
    detailedHtml += `
      <div class="sticky-detailed-item" data-product-id="${p.id}">
        <img class="sticky-detailed-img" src="${imgSrc}" alt="${p.name}">
        <div class="sticky-detailed-info">
          <div class="sticky-detailed-name">${escapeHtml(p.name)}</div>
          <div class="sticky-detailed-unit">${escapeHtml(unit)}</div>
          <div class="sticky-detailed-prices">
            ${originalPrice > price ? `<span class="sticky-detailed-original">₹${originalPrice}</span>` : ''}
            <span class="sticky-detailed-discount">₹${price}</span>
            ${saved > 0 ? `<span class="sticky-detailed-saved">(save ₹${saved})</span>` : ''}
          </div>
        </div>
        <div class="sticky-detailed-qty">
          <button class="sticky-qty-btn" data-key="${key}" data-delta="-1">-</button>
          <span class="sticky-qty-value">${qty}</span>
          <button class="sticky-qty-btn" data-key="${key}" data-delta="1">+</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = detailedHtml;
  const itemsSpan = document.getElementById('stickyDetailedItems');
  const savingsSpan = document.getElementById('stickyDetailedSavings');
  if (itemsSpan) itemsSpan.textContent = totalItems;
  if (savingsSpan) savingsSpan.textContent = `₹${totalSavings}`;

  container.querySelectorAll('.sticky-qty-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = newBtn.dataset.key;
      const delta = parseInt(newBtn.dataset.delta);
      const [productId, unit] = key.split('_');
      const p = products.find(x => x.id == parseInt(productId));
      if (p) {
        const units = getProductUnits(p);
        const idx = units.indexOf(unit);
        adjustQuantity(parseInt(productId), delta, unit, idx >= 0 ? idx : 0);
      }
    });
  });
}

function updateStickyCartBar() {
  if (isCartPanelOpen()) {
    if (stickyBar) {
      stickyBar.style.display = 'none';
      stickyBar.style.zIndex = 100;
    }
    return;
  }
  const keys = Object.keys(cart).filter(k => cart[k].qty > 0);
  const itemCount = keys.reduce((sum, k) => sum + cart[k].qty, 0);
  if (itemCount === 0) {
    if (stickyBar) {
      stickyBar.style.display = 'none';
      stickyBar.style.zIndex = 1000;
    }
    document.body.classList.remove('cart-not-empty');
  } else {
    document.body.classList.add('cart-not-empty');
    if (stickyBar) {
      stickyBar.style.display = 'block';
      stickyBar.style.zIndex = 1000;
    }
  }
  
  if (itemCount === 0) return;
  
  let totalSaved = 0;
  let subtotal = 0;
  keys.forEach(key => {
    const [productId, unit] = key.split('_');
    const p = products.find(x => x.id == parseInt(productId));
    if (!p) return;
    const item = cart[key];
    const price = item.price || 0;
    const originalPrice = getProductPrice(p, 0) || p.price || 0;
    const saved = (originalPrice - price) * item.qty;
    totalSaved += saved;
    subtotal += price * item.qty;
  });
  const freeDelivery = subtotal > FREE_DELIVERY_THRESHOLD;
  if (stickyCountSpan) stickyCountSpan.textContent = itemCount;
  if (stickySavingsSpan) stickySavingsSpan.textContent = `Saved: ₹${totalSaved}`;
  if (stickyFreeBadge) stickyFreeBadge.style.display = freeDelivery ? 'inline-block' : 'none';
  if (stickyDetailedOpen) renderStickyDetailedList();
  if (stickyBar) {
    stickyBar.style.display = 'block';
    stickyBar.style.zIndex = 1000;
  }
}

function openCart() {
  pushPageState('cart');
  cartOverlay.classList.add('open');
  cartPanel.classList.add('open');
  renderCart();
  if (stickyBar) {
    stickyBar.style.display = 'none';
    stickyBar.style.zIndex = 100;
  }
}

function closeCart() {
  cartOverlay.classList.remove('open');
  cartPanel.classList.remove('open');
  if (stickyBar) {
    stickyBar.style.zIndex = 1000;
    const keys = Object.keys(cart).filter(k => cart[k].qty > 0);
    if (keys.length > 0) {
      stickyBar.style.display = 'block';
      updateStickyCartBar();
    } else {
      stickyBar.style.display = 'none';
    }
  }
}

// ========== ROAD DISTANCE (OSRM) ==========
async function getDistanceFromStore() {
  if (!customerData.location || !customerData.location.lat || !customerData.location.lng) return null;
  if (customerData.roadDistance !== null && customerData.roadDistance !== undefined) {
    return customerData.roadDistance;
  }
  const from = `${ADAT_LON},${ADAT_LAT}`;
  const to = `${customerData.location.lng},${customerData.location.lat}`;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from};${to}?overview=false`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.routes && data.routes.length > 0) {
      const distanceKm = data.routes[0].distance / 1000;
      customerData.roadDistance = distanceKm;
      return distanceKm;
    } else {
      const straight = getDistanceKm(ADAT_LAT, ADAT_LON, customerData.location.lat, customerData.location.lng);
      customerData.roadDistance = straight;
      return straight;
    }
  } catch (err) {
    const straight = getDistanceKm(ADAT_LAT, ADAT_LON, customerData.location.lat, customerData.location.lng);
    customerData.roadDistance = straight;
    return straight;
  }
}

function getDeliveryCharge(subtotal, distance) {
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
  if (!distance || distance <= 0) return 0;
  if (distance <= DELIVERY_MIN_DISTANCE) {
    return DELIVERY_MIN_CHARGE;
  }
  let charge = Math.round(distance * DELIVERY_CHARGE);
  return Math.min(charge, DELIVERY_MAX_CHARGE);
}

// ========== ADDRESS FLOW ==========
function getCartSubtotal() {
  let subtotal = 0;
  Object.keys(cart).forEach(key => {
    const item = cart[key];
    subtotal += item.price * item.qty;
  });
  return subtotal;
}

function getCartTotalSavings() {
  let savings = 0;
  Object.keys(cart).forEach(key => {
    const [productId, unit] = key.split('_');
    const p = products.find(x => x.id == parseInt(productId));
    if (!p) return;
    const item = cart[key];
    const price = item.price || 0;
    const originalPrice = getProductPrice(p, 0) || p.price || 0;
    savings += (originalPrice - price) * item.qty;
  });
  return savings;
}

function scrollToConfirmButton() {
  const btn = document.getElementById('confirmLocationBtn');
  if (btn && !btn.disabled) {
    setTimeout(() => {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }
}

function initMap(initialLat = null, initialLng = null) {
  if (!document.getElementById('locationMap')) return;
  if (!document.querySelector('link[href*="leaflet.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => createMap(initialLat, initialLng);
    document.head.appendChild(script);
  } else {
    createMap(initialLat, initialLng);
  }
}

function createMap(initialLat = null, initialLng = null) {
  const centerLat = (initialLat && initialLng) ? initialLat : ADAT_LAT;
  const centerLng = (initialLat && initialLng) ? initialLng : ADAT_LON;

  map = L.map('locationMap').setView([centerLat, centerLng], 14);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> & CartoDB'
  }).addTo(map);

  const adatCenter = [ADAT_LAT, ADAT_LON];
  circle = L.circle(adatCenter, {
    color: '#f47c2b',
    weight: 2,
    fillColor: '#f47c2b',
    fillOpacity: 0.08,
    radius: MAX_DISTANCE_KM * 1000
  }).addTo(map);

  marker = L.marker([centerLat, centerLng], { draggable: true }).addTo(map);

  marker.on('dragend', async function () {
    const pos = marker.getLatLng();
    const distance = getDistanceKm(ADAT_LAT, ADAT_LON, pos.lat, pos.lng);
    if (distance <= MAX_DISTANCE_KM) {
      currentLocationValid = true;
      updateLocationWarning(true);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        const address = data.display_name || `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        const displayDiv = document.getElementById('selectedLocationDisplay');
        if (displayDiv) displayDiv.innerHTML = `<strong>Selected location:</strong> ${address}`;
        customerData.location = { lat: pos.lat, lng: pos.lng, address: address };
        customerData.roadDistance = null;
        // Pre-fetch road distance
        getDistanceFromStore().then(roadDist => { /* cached */ });
        const confirmBtn = document.getElementById('confirmLocationBtn');
        if (confirmBtn) confirmBtn.disabled = false;
        scrollToConfirmButton();
      } catch (err) {
        const fallback = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        const displayDiv = document.getElementById('selectedLocationDisplay');
        if (displayDiv) displayDiv.innerHTML = `<strong>Selected location:</strong> ${fallback}`;
        customerData.location = { lat: pos.lat, lng: pos.lng, address: fallback };
        customerData.roadDistance = null;
        const confirmBtn = document.getElementById('confirmLocationBtn');
        if (confirmBtn) confirmBtn.disabled = false;
        scrollToConfirmButton();
      }
    } else {
      currentLocationValid = false;
      updateLocationWarning(false);
      showToast('❌ Outside delivery area (beyond 5 km). Drag the marker inside the circle.');
      const displayDiv = document.getElementById('selectedLocationDisplay');
      if (displayDiv) displayDiv.innerHTML = '';
      const confirmBtn = document.getElementById('confirmLocationBtn');
      if (confirmBtn) confirmBtn.disabled = true;
    }
  });

  // Major place labels (unchanged)
  const majorPlaces = [
    { name: 'Adat Centre', lat: 10.5578, lng: 76.1572 },
    { name: 'Sobha City Junction', lat: 10.5457, lng: 76.1795 },
    { name: 'Amala Hospital', lat: 10.5629, lng: 76.1689 },
    { name: 'Puranattukara', lat: 10.5534, lng: 76.1552 },
    { name: 'Nithya Sahaya Matha Church', lat: 10.5457, lng: 76.1498 },
    { name: 'St. Joseph Church Amala', lat: 10.5633, lng: 76.1648 },
    { name: 'St. Rita\'s Church Chittilapilly', lat: 10.5601, lng: 76.1408 }
  ];
  const majorGroup = L.featureGroup();
  majorPlaces.forEach(place => {
    const icon = L.divIcon({
      className: 'major-place-label',
      html: `<div class="major-text">${place.name}</div>`,
      iconSize: [100, 24],
      iconAnchor: [50, 12]
    });
    L.marker([place.lat, place.lng], { icon })
      .addTo(majorGroup)
      .bindPopup(`<b>${place.name}</b>`);
  });
  majorGroup.addTo(map);

  map.setView(adatCenter, 14);
  if (initialLat && initialLng) {
    marker.fire('dragend');
  } else {
    attemptAutoLocation();
  }
}

function attemptAutoLocation() {
  if (navigator.geolocation) {
    showLoadingOverlay('Fetching your location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        hideLoadingOverlay();
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const distance = getDistanceKm(ADAT_LAT, ADAT_LON, userLat, userLng);
        if (distance <= MAX_DISTANCE_KM) {
          map.setView([userLat, userLng], 15);
          marker.setLatLng([userLat, userLng]);
          marker.fire('dragend');
          showToast("📍 Location set to your current position");
        } else {
          showToast("📍 Your location is outside delivery area. Please drag marker inside the circle.");
          updateLocationWarning(false);
          map.setView([userLat, userLng], 15);
          marker.setLatLng([userLat, userLng]);
          currentLocationValid = false;
        }
      },
      (error) => {
        hideLoadingOverlay();
        console.warn("Geolocation error:", error);
        showToast("Could not get your location. Please drag the marker manually.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  } else {
    showToast("Geolocation not supported. Please drag the marker.");
  }
}

function useCurrentLocation() {
  if (navigator.geolocation) {
    showLoadingOverlay('Fetching your location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        hideLoadingOverlay();
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const distance = getDistanceKm(ADAT_LAT, ADAT_LON, userLat, userLng);
        if (distance <= MAX_DISTANCE_KM) {
          map.setView([userLat, userLng], 15);
          marker.setLatLng([userLat, userLng]);
          marker.fire('dragend');
          showToast("📍 Location updated");
        } else {
          showToast("❌ Your location is outside our 5 km delivery area. Please drag the marker inside the circle.");
          updateLocationWarning(false);
          map.setView([userLat, userLng], 15);
          marker.setLatLng([userLat, userLng]);
          currentLocationValid = false;
        }
      },
      (error) => {
        hideLoadingOverlay();
        showToast("Unable to get your location. Please drag the marker manually.");
        console.warn("Geolocation error:", error);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  } else {
    showToast("Geolocation is not supported by your browser.");
  }
}

async function showStep(step) {
  document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');
  const stepContent = document.getElementById(`step${step}Content`);
  if (stepContent) stepContent.style.display = 'block';
  document.querySelectorAll('.step').forEach((el, idx) => {
    if (idx + 1 === step) el.classList.add('active');
    else el.classList.remove('active');
  });
  currentStep = step;
  if (step === 4) {
    const fullAddr = `${customerData.house}, ${customerData.area}${customerData.landmark ? ', ' + customerData.landmark : ''}, ${customerData.location.address}`;
    const confirmAddress = document.getElementById('confirmAddress');
    if (confirmAddress) confirmAddress.innerHTML = `${fullAddr}<br>Type: ${customerData.addressType}`;
    const confirmCustomer = document.getElementById('confirmCustomer');
    if (confirmCustomer) confirmCustomer.innerHTML = `${customerData.name}<br>📞 ${customerData.phone}`;
    let subtotal = getCartSubtotal();
    const distance = await getDistanceFromStore();
    let deliveryCharge = getDeliveryCharge(subtotal, distance);
    let ecoCharge = customerData.useEcoBox ? ECO_BOX_CHARGE : 0;
    let total = subtotal + deliveryCharge + ecoCharge;
    let summaryHtml = '';
    Object.keys(cart).forEach(key => {
      const [productId, unit] = key.split('_');
      const p = products.find(x => x.id == parseInt(productId));
      if (!p) return;
      const item = cart[key];
      const price = item.price || 0;
      summaryHtml += `<div>${p.name} (${unit}) ×${item.qty} = ₹${price * item.qty}</div>`;
    });
    const orderSummary = document.getElementById('confirmOrderSummary');
    if (orderSummary) orderSummary.innerHTML = summaryHtml;
    const ecoLine = document.getElementById('ecoBoxChargeLine');
    if (ecoLine) ecoLine.style.display = customerData.useEcoBox ? 'block' : 'none';
    const finalTotal = document.getElementById('confirmFinalTotal');
    if (finalTotal) {
      let totalText = `Total: ₹${total}`;
      if (deliveryCharge > 0) {
        totalText += ` (incl. delivery ₹${deliveryCharge})`;
      } else if (deliveryCharge === 0 && subtotal < FREE_DELIVERY_THRESHOLD) {
        totalText += ` (free delivery)`;
      }
      finalTotal.innerHTML = totalText;
    }
  }
}

function loadSavedCustomerData() {
  const saved = localStorage.getItem('freshAdat_customer');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.name) customerData.name = data.name;
      if (data.phone) customerData.phone = data.phone;
      if (data.location && data.location.lat) {
        customerData.house = data.house || '';
        customerData.area = data.area || '';
        customerData.landmark = data.landmark || '';
        customerData.addressType = data.addressType || 'Home';
        customerData.location = data.location;
        customerData.useEcoBox = data.useEcoBox || false;
        customerData.preOrderDateTime = data.preOrderDateTime || null;
        customerData.roadDistance = data.roadDistance || null;
      }
    } catch(e) {}
  }
}

function saveCustomerData() {
  const toSave = {
    name: customerData.name,
    phone: customerData.phone,
    house: customerData.house,
    area: customerData.area,
    landmark: customerData.landmark,
    addressType: customerData.addressType,
    location: customerData.location,
    useEcoBox: customerData.useEcoBox,
    preOrderDateTime: customerData.preOrderDateTime,
    roadDistance: customerData.roadDistance
  };
  localStorage.setItem('freshAdat_customer', JSON.stringify(toSave));
}

async function showSavedSummary() {
  const stepIndicator = document.getElementById('stepIndicator');
  const multiStep = document.getElementById('multiStepContent');
  const savedCard = document.getElementById('savedSummaryCard');
  if (stepIndicator) stepIndicator.style.display = 'none';
  if (multiStep) multiStep.style.display = 'none';
  if (savedCard) savedCard.style.display = 'block';

  const fullAddr = `${customerData.house}, ${customerData.area}${customerData.landmark ? ', ' + customerData.landmark : ''}, ${customerData.location.address}`;
  const mapLink = `https://maps.google.com/?q=${customerData.location.lat},${customerData.location.lng}`;

  const subtotal = getCartSubtotal();
  const totalSavings = getCartTotalSavings();
  const distance = await getDistanceFromStore();
  const deliveryCharge = getDeliveryCharge(subtotal, distance);
  const ecoCharge = customerData.useEcoBox ? ECO_BOX_CHARGE : 0;
  const total = subtotal + deliveryCharge + ecoCharge;

  let itemsHtml = '';
  Object.keys(cart).forEach(key => {
    const [productId, unit] = key.split('_');
    const p = products.find(x => x.id == parseInt(productId));
    if (!p) return;
    const item = cart[key];
    const price = item.price || 0;
    itemsHtml += `<div class="order-summary-item">${p.name} (${unit}) ×${item.qty} = ₹${price * item.qty}</div>`;
  });

  let preOrderHtml = '';
  if (customerData.preOrderDateTime) {
    const dateObj = new Date(customerData.preOrderDateTime);
    preOrderHtml = `<div><strong>📅 Scheduled Delivery:</strong> ${dateObj.toLocaleString()}</div>`;
  }

  const summaryHtml = `
    <div class="saved-address-section">
      <h4><i class="fas fa-map-marker-alt"></i> Delivery Address</h4>
      <p><strong>📍 Address:</strong> ${escapeHtml(fullAddr)}</p>
      <p><strong>🏷️ Type:</strong> ${customerData.addressType}</p>
      <p><strong>🗺️ <a href="${mapLink}" target="_blank">View on Google Maps</a></strong></p>
      ${preOrderHtml}
    </div>
    <div class="saved-customer-section">
      <h4><i class="fas fa-user"></i> Customer Details</h4>
      <p><strong>👤 Name:</strong> ${escapeHtml(customerData.name)}</p>
      <p><strong>📞 Phone:</strong> ${customerData.phone}</p>
    </div>
    <div class="order-summary-section">
      <h4><i class="fas fa-shopping-cart"></i> Order Summary</h4>
      <div class="order-items">${itemsHtml}</div>
      <div class="order-totals">
        <div>Subtotal: ₹${subtotal}</div>
        ${totalSavings > 0 ? `<div>Savings: -₹${totalSavings}</div>` : ''}
        <div>Delivery: ${deliveryCharge > 0 ? '₹' + deliveryCharge : 'Free'}</div>
        ${customerData.useEcoBox ? `<div>Eco-box: +₹${ECO_BOX_CHARGE}</div>` : ''}
        <div class="total"><strong>Total: ₹${total}</strong></div>
      </div>
    </div>
    <div class="eco-message-summary">
      ✅ Delivered in reusable eco‑box<br>♻️ Please return the empty box after delivery
    </div>
  `;
  const detailsDiv = document.getElementById('savedSummaryDetails');
  if (detailsDiv) detailsDiv.innerHTML = summaryHtml;
}

function startMultiStepFlow() {
  const stepIndicator = document.getElementById('stepIndicator');
  const multiStep = document.getElementById('multiStepContent');
  const savedCard = document.getElementById('savedSummaryCard');
  if (stepIndicator) stepIndicator.style.display = 'flex';
  if (multiStep) multiStep.style.display = 'block';
  if (savedCard) savedCard.style.display = 'none';
  currentStep = 1;
  showStep(1);
  const houseInput = document.getElementById('addrHouse');
  const areaInput = document.getElementById('addrArea');
  const landmarkInput = document.getElementById('addrLandmark');
  const ecoCheckbox = document.getElementById('ecoBoxCheckbox');
  if (customerData.house && houseInput) houseInput.value = customerData.house;
  if (customerData.area && areaInput) areaInput.value = customerData.area;
  if (customerData.landmark && landmarkInput) landmarkInput.value = customerData.landmark;
  const radio = document.querySelector(`input[name="addrType"][value="${customerData.addressType}"]`);
  if (radio) radio.checked = true;
  if (ecoCheckbox) ecoCheckbox.checked = customerData.useEcoBox;
  if (customerData.name) {
    const nameInput = document.getElementById('custFullName');
    const phoneInput = document.getElementById('custPhoneNumber');
    const preview = document.getElementById('savedAddressPreview');
    if (nameInput) nameInput.value = customerData.name;
    if (phoneInput) phoneInput.value = customerData.phone;
    if (preview) preview.innerHTML = `<strong>Saved address:</strong> ${customerData.house}, ${customerData.area}`;
  }
  if (customerData.location && customerData.location.lat) {
    initMap(customerData.location.lat, customerData.location.lng);
  } else {
    initMap();
  }
}

function openAddressFlow() {
  if (stickyBar) stickyBar.style.display = 'none';
  if (!isStoreOpen) {
    showToast("⚠️ Store is currently closed. You can pre‑order for later.");
  }
  isLoginMode = false;
  if (Object.keys(cart).length === 0) {
    showToast("Cart is empty");
    return;
  }
  closeCart();
  loadSavedCustomerData();

  if (cartPreOrderDateTime && !customerData.preOrderDateTime) {
    customerData.preOrderDateTime = cartPreOrderDateTime;
    saveCustomerData();
  }

  const modal = document.getElementById('addressFlowModal');
  if (modal) modal.style.display = 'flex';
  const hasSavedData = customerData.name && customerData.phone && customerData.house && customerData.location && customerData.location.lat;
  if (hasSavedData) {
    const distance = getDistanceKm(ADAT_LAT, ADAT_LON, customerData.location.lat, customerData.location.lng);
    if (distance <= MAX_DISTANCE_KM) {
      showSavedSummary();
      updateLocationWarning(true);
    } else {
      showToast("⚠️ Your saved location is outside delivery area. Please update your location on the map.");
      startMultiStepFlow();
      updateLocationWarning(false);
    }
  } else {
    startMultiStepFlow();
  }
}

function closeAddressFlow() {
  const modal = document.getElementById('addressFlowModal');
  if (modal) modal.style.display = 'none';
  hideLoadingOverlay();
  updateLocationWarning(true);
  if (stickyBar) {
    const keys = Object.keys(cart).filter(k => cart[k].qty > 0);
    if (keys.length > 0) {
      stickyBar.style.display = 'block';
      updateStickyCartBar();
    } else {
      stickyBar.style.display = 'none';
    }
  }
}

function handleBack() {
  const savedCard = document.getElementById('savedSummaryCard');
  if (savedCard && savedCard.style.display === 'block') {
    closeAddressFlow();
  } else {
    if (currentStep === 1) {
      closeAddressFlow();
    } else {
      showStep(currentStep - 1);
    }
  }
}

function sendOrderFromSummary() {
  const isOpen = isStoreOpenNow();
  if (!isOpen && !customerData.preOrderDateTime) {
    showToast('❌ Store is closed now. Please select a future delivery time (pre‑order).');
    showStep(3);
    return;
  }
  const distance = getDistanceKm(ADAT_LAT, ADAT_LON, customerData.location.lat, customerData.location.lng);
  if (distance > MAX_DISTANCE_KM) {
    showToast("❌ Delivery address is outside our 5 km area. Please update location.");
    closeAddressFlow();
    startMultiStepFlow();
    return;
  }
  sendFinalWhatsApp();
}

// ========== MEAT SEPARATION ==========
function isMeatProduct(product) {
  if (!product) return false;
  const cat = (product.category || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  return cat.includes('meat') || 
         cat.includes('chicken') ||
         cat.includes('mutton') ||
         cat.includes('fish') ||
         cat.includes('pork') ||
         name.includes('chicken') ||
         name.includes('mutton') ||
         name.includes('fish') ||
         name.includes('pork');
}

async function sendFinalWhatsApp() {
  const subtotal = getCartSubtotal();
  const distance = await getDistanceFromStore();
  const deliveryCharge = getDeliveryCharge(subtotal, distance);
  const ecoCharge = customerData.useEcoBox ? ECO_BOX_CHARGE : 0;
  const total = subtotal + deliveryCharge + ecoCharge;
  const fullAddress = `${customerData.house}, ${customerData.area}${customerData.landmark ? ', ' + customerData.landmark : ''}, ${customerData.location.address}`;
  const mapLink = `https://maps.google.com/?q=${customerData.location.lat},${customerData.location.lng}`;

  let itemLines = [];
  let hasMeat = false;

  Object.keys(cart).forEach(key => {
    const [productId, unit] = key.split('_');
    const p = products.find(x => x.id == parseInt(productId));
    if (!p) return;
    const item = cart[key];
    const price = item.price || 0;
    const qty = item.qty;
    const line = `🛒 ${p.name} (${unit}) × ${qty} = ₹${price * qty}`;
    itemLines.push(line);
    if (isMeatProduct(p)) hasMeat = true;
  });

  const orderId = 'ORD' + Date.now().toString().slice(-6);

  let msg = `🌿 *FRESH ADAT ORDER* 🌿\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `🆔 *Order ID:* ${orderId}\n`;
  msg += `👤 *Customer:* ${customerData.name}\n`;
  msg += `📞 *Phone:* ${customerData.phone}\n`;
  msg += `📍 *Address:* ${fullAddress}\n`;
  msg += `🏷️ *Type:* ${customerData.addressType}\n`;
  msg += `🗺️ *Map:* ${mapLink}\n\n`;

  msg += `🛍️ *Items:*\n`;
  msg += itemLines.join('\n') + '\n\n';

  msg += `🚚 *Delivery charge:* ₹${deliveryCharge}\n`;
  msg += `💰 *Subtotal:* ₹${subtotal}\n`;
  msg += `💵 *Total:* ₹${total}\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;

  if (hasMeat) {
    msg += `⚖️ *ശ്രദ്ധിക്കുക:*\n`;
    msg += `മാംസ ഉൽപ്പന്നങ്ങളുടെ ഭാരം **കട്ട് ചെയ്യുന്നതിന് മുമ്പ് തൂക്കിയ ശേഷമാണ്** അന്തിമ വില നിശ്ചയിക്കുന്നത്.\n`;
    msg += `തൂക്കത്തിന് ശേഷം **ശരിയായ ഭാരം, നിരക്ക്, അന്തിമ ബിൽ** പ്രത്യേകം അയയ്ക്കുന്നതാണ്.\n\n`;
  }

  msg += `✅ Delivered in reusable eco-box\n`;
  msg += `♻️ Please return the empty box after delivery\n`;
  msg += `📝 Note: Thank you for ordering with Fresh Adat!`;

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  cart = {};
  saveCart(cart);
  updateCartCountUI();
  renderProducts();
  updateStickyCartBar();
  closeAddressFlow();
  showToast('✅ Order sent! We will process it shortly.');
}

// ========== ACCOUNT MODAL ==========
function getUserDetails() {
  try { return JSON.parse(localStorage.getItem('freshAdatUserDetails')) || null; } catch { return null; }
}

function saveUserDetails(details) {
  localStorage.setItem('freshAdatUserDetails', JSON.stringify(details));
}

function clearUserDetails() {
  localStorage.removeItem('freshAdatUserDetails');
}

function renderAccountModal() {
  const body = document.getElementById('accountModalBody');
  if (!body) return;

  const saved = localStorage.getItem('freshAdat_customer');
  let user = null;
  if (saved) {
    try { user = JSON.parse(saved); } catch(e) {}
  }

  if (user && user.name && user.phone && user.location && user.house) {
    const fullAddress = `${user.house}, ${user.area ? user.area + ', ' : ''}${user.landmark ? user.landmark + ', ' : ''}${user.location.address || ''}`;
    const cleanAddress = fullAddress.replace(/, ,/g, ',').replace(/,\s*,/g, ',').replace(/,\s*$/, '');
    
    body.innerHTML = `
      <div class="user-info">
        <div class="user-avatar"><i class="fas fa-user-circle"></i></div>
        <div class="user-name">${escapeHtml(user.name)}</div>
        <div class="user-detail"><i class="fas fa-phone"></i> ${escapeHtml(user.phone)}</div>
        <div class="user-address">📍 ${escapeHtml(cleanAddress)}</div>
        <div class="user-detail"><i class="fas fa-envelope"></i> fresh4adat@gmail.com</div>
        <button id="editProfileBtn" class="edit-profile-btn"><i class="fas fa-edit"></i> Edit Profile</button>
      </div>
      <div class="account-menu">
        <div class="menu-item" id="contactUsBtnLogged"><i class="fas fa-headset"></i><span>Contact Us</span><i class="fas fa-chevron-right"></i></div>
        <div class="menu-item" id="downloadAppBtnLogged"><i class="fas fa-download"></i><span>Download App</span><i class="fas fa-chevron-right"></i></div>
        <div class="menu-item" id="faqsBtnLogged"><i class="fas fa-question-circle"></i><span>FAQs</span><i class="fas fa-chevron-right"></i></div>
        <div class="menu-item" id="termsBtnLogged"><i class="fas fa-file-contract"></i><span>Terms & Conditions</span><i class="fas fa-chevron-right"></i></div>
        <div class="menu-item" id="privacyBtnLogged"><i class="fas fa-shield-alt"></i><span>Privacy Policy</span><i class="fas fa-chevron-right"></i></div>
        <div class="menu-item" id="sellerInfoBtnLogged"><i class="fas fa-store"></i><span>Seller Information</span><i class="fas fa-chevron-right"></i></div>
        <div class="menu-item logout-item" id="logoutBtn"><i class="fas fa-sign-out-alt"></i><span>Logout</span><i class="fas fa-chevron-right"></i></div>
      </div>
    `;

    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
      closeAccountModalFunc();
      openAddressFlowForLogin();
    });
    document.getElementById('contactUsBtnLogged')?.addEventListener('click', () => {
      showStaticContent('Contact Us', `
        <p><strong>📞 Phone:</strong> <a href="tel:+919496840336">+91 94968 40336</a></p>
        <p><strong>📧 Email:</strong> <a href="mailto:fresh4adat@gmail.com">fresh4adat@gmail.com</a></p>
        <p><strong>📍 Address:</strong> Adat, Thrissur, Kerala, India</p>
        <p><strong>⏰ Business Hours:</strong> Monday - Saturday, 9:00 AM - 7:00 PM</p>
      `);
    });
    document.getElementById('downloadAppBtnLogged')?.addEventListener('click', () => {
      const installBanner = document.getElementById('installBanner');
      if (installBanner) installBanner.style.display = 'flex';
      else showToast('📱 Please use Chrome or Safari to install the app');
      closeAccountModalFunc();
    });
    document.getElementById('faqsBtnLogged')?.addEventListener('click', () => {
      showStaticContent('Frequently Asked Questions', `
        <div class="faq-item"><strong>❓ How do I place an order?</strong><br>Select products, add to cart, then click "Place Order" and fill delivery details.</div>
        <div class="faq-item"><strong>❓ What is the delivery area?</strong><br>We deliver within 5 km of Adat, Thrissur.</div>
        <div class="faq-item"><strong>❓ Is there a minimum order value?</strong><br>No minimum order value. Free delivery above ₹200.</div>
        <div class="faq-item"><strong>❓ What is the eco-box charge?</strong><br>We deliver in reusable eco-boxes for ₹10 per order. Please return the empty box after delivery.</div>
        <div class="faq-item"><strong>❓ How do I track my order?</strong><br>You will receive a WhatsApp confirmation after placing the order.</div>
        <div class="faq-item"><strong>❓ Can I modify my order after placing?</strong><br>Please contact us immediately via WhatsApp or phone.</div>
      `);
    });
    document.getElementById('termsBtnLogged')?.addEventListener('click', () => {
      showStaticContent('Terms & Conditions', `
        <p><strong>1. Acceptance of Terms</strong><br>By using Fresh Adat, you agree to these terms.</p>
        <p><strong>2. Delivery Policy</strong><br>We deliver within 5 km of Adat. Delivery times may vary.</p>
        <p><strong>3. Payment</strong><br>Payments are accepted via cash on delivery, Google Pay, PhonePe, Paytm.</p>
        <p><strong>4. Returns & Refunds</strong><br>Quality issues must be reported within 2 hours of delivery.</p>
        <p><strong>5. Eco-Box</strong><br>Eco-boxes are reusable. Failure to return may incur additional charges.</p>
        <p><strong>6. Privacy</strong><br>Your data is safe and never shared with third parties.</p>
      `);
    });
    document.getElementById('privacyBtnLogged')?.addEventListener('click', () => {
      showStaticContent('Privacy Policy', `
        <p><strong>Information Collection</strong><br>We collect name, phone, address for delivery purposes.</p>
        <p><strong>Data Security</strong><br>Your data is stored securely and not shared with third parties.</p>
        <p><strong>Cookies</strong><br>We use cookies to improve your shopping experience.</p>
        <p><strong>Your Rights</strong><br>You may request deletion of your data by contacting us.</p>
      `);
    });
    document.getElementById('sellerInfoBtnLogged')?.addEventListener('click', () => {
      showStaticContent('Seller Information', `
        <p><strong>Business Name:</strong> Fresh Adat</p>
        <p><strong>Registered Address:</strong> Adat, Thrissur, Kerala - 680551</p>
        <p><strong>GSTIN:</strong> 32ABCDE1234F1Z5</p>
        <p><strong>FSSAI License:</strong> 12345678901234</p>
        <p><strong>Contact:</strong> +91 94968 40336</p>
        <p><strong>Email:</strong> fresh4adat@gmail.com</p>
      `);
    });
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      localStorage.removeItem('freshAdat_customer');
      customerData = {
        name: '', phone: '', location: { lat: null, lng: null, address: '' },
        house: '', area: '', landmark: '', addressType: 'Home', useEcoBox: false,
        preOrderDateTime: null
      };
      renderAccountModal();
      showToast('👋 Logged out successfully');
    });
    return;
  }

  // GUEST view
  body.innerHTML = `
    <div class="guest-section">
      <div class="guest-icon"><i class="fas fa-user-circle"></i></div>
      <h2>Hi, Guest</h2>
      <p>Please Login to enjoy your shopping</p>
      <p><i class="fas fa-envelope"></i> fresh4adat@gmail.com</p>
      <button id="accountLoginBtn" class="login-btn"><i class="fas fa-sign-in-alt"></i> Login</button>
    </div>
    <div class="account-menu">
      <div class="menu-item" id="contactUsBtnGuest"><i class="fas fa-headset"></i><span>Contact Us</span><i class="fas fa-chevron-right"></i></div>
      <div class="menu-item" id="downloadAppBtnGuest"><i class="fas fa-download"></i><span>Download App</span><i class="fas fa-chevron-right"></i></div>
      <div class="menu-item" id="faqsBtnGuest"><i class="fas fa-question-circle"></i><span>FAQs</span><i class="fas fa-chevron-right"></i></div>
      <div class="menu-item" id="termsBtnGuest"><i class="fas fa-file-contract"></i><span>Terms & Conditions</span><i class="fas fa-chevron-right"></i></div>
      <div class="menu-item" id="privacyBtnGuest"><i class="fas fa-shield-alt"></i><span>Privacy Policy</span><i class="fas fa-chevron-right"></i></div>
    </div>
  `;

  document.getElementById('accountLoginBtn')?.addEventListener('click', () => {
    closeAccountModalFunc();
    openAddressFlowForLogin();
  });
  document.getElementById('contactUsBtnGuest')?.addEventListener('click', () => {
    showStaticContent('Contact Us', `
      <p><strong>📞 Phone:</strong> <a href="tel:+919496840336">+91 94968 40336</a></p>
      <p><strong>📧 Email:</strong> <a href="mailto:fresh4adat@gmail.com">fresh4adat@gmail.com</a></p>
      <p><strong>📍 Address:</strong> Adat, Thrissur, Kerala, India</p>
      <p><strong>⏰ Business Hours:</strong> Monday - Saturday, 9:00 AM - 7:00 PM</p>
    `);
  });
  document.getElementById('downloadAppBtnGuest')?.addEventListener('click', () => {
    const installBanner = document.getElementById('installBanner');
    if (installBanner) installBanner.style.display = 'flex';
    else showToast('📱 Please use Chrome or Safari to install the app');
    closeAccountModalFunc();
  });
  document.getElementById('faqsBtnGuest')?.addEventListener('click', () => {
    showStaticContent('Frequently Asked Questions', `
      <div class="faq-item"><strong>❓ How do I place an order?</strong><br>Select products, add to cart, then click "Place Order" and fill delivery details.</div>
      <div class="faq-item"><strong>❓ What is the delivery area?</strong><br>We deliver within 5 km of Adat, Thrissur.</div>
      <div class="faq-item"><strong>❓ Is there a minimum order value?</strong><br>No minimum order value. Free delivery above ₹200.</div>
      <div class="faq-item"><strong>❓ What is the eco-box charge?</strong><br>We deliver in reusable eco-boxes for ₹10 per order. Please return the empty box after delivery.</div>
      <div class="faq-item"><strong>❓ How do I track my order?</strong><br>You will receive a WhatsApp confirmation after placing the order.</div>
      <div class="faq-item"><strong>❓ Can I modify my order after placing?</strong><br>Please contact us immediately via WhatsApp or phone.</div>
    `);
  });
  document.getElementById('termsBtnGuest')?.addEventListener('click', () => {
    showStaticContent('Terms & Conditions', `
      <p><strong>1. Acceptance of Terms</strong><br>By using Fresh Adat, you agree to these terms.</p>
      <p><strong>2. Delivery Policy</strong><br>We deliver within 5 km of Adat. Delivery times may vary.</p>
      <p><strong>3. Payment</strong><br>Payments are accepted via cash on delivery, Google Pay, PhonePe, Paytm.</p>
      <p><strong>4. Returns & Refunds</strong><br>Quality issues must be reported within 2 hours of delivery.</p>
      <p><strong>5. Eco-Box</strong><br>Eco-boxes are reusable. Failure to return may incur additional charges.</p>
      <p><strong>6. Privacy</strong><br>Your data is safe and never shared with third parties.</p>
    `);
  });
  document.getElementById('privacyBtnGuest')?.addEventListener('click', () => {
    showStaticContent('Privacy Policy', `
      <p><strong>Information Collection</strong><br>We collect name, phone, address for delivery purposes.</p>
      <p><strong>Data Security</strong><br>Your data is stored securely and not shared with third parties.</p>
      <p><strong>Cookies</strong><br>We use cookies to improve your shopping experience.</p>
      <p><strong>Your Rights</strong><br>You may request deletion of your data by contacting us.</p>
    `);
  });
}

function openAccountModal() {
  const modal = document.getElementById('accountModal');
  if (modal) {
    modal.style.display = 'flex';
    renderAccountModal();
  }
}

function closeAccountModalFunc() {
  const modal = document.getElementById('accountModal');
  if (modal) modal.style.display = 'none';
}

function openAddressFlowForLogin() {
  isLoginMode = true;
  loadSavedCustomerData();
  const modal = document.getElementById('addressFlowModal');
  if (modal) modal.style.display = 'flex';
  const hasSavedData = customerData.name && customerData.phone && customerData.house && customerData.location && customerData.location.lat;
  if (hasSavedData) {
    showSavedSummary();
    const sendSummaryBtn = document.getElementById('sendFromSummaryBtn');
    if (sendSummaryBtn) {
      sendSummaryBtn.textContent = '💾 Save Profile';
      sendSummaryBtn.innerHTML = '<i class="fas fa-save"></i> Save Profile';
      sendSummaryBtn.onclick = () => {
        saveCustomerData();
        closeAddressFlow();
        renderAccountModal();
        showToast('✅ Profile saved');
      };
    }
  } else {
    startMultiStepFlow();
    const finalSendBtn = document.getElementById('sendWhatsAppFinalBtn');
    if (finalSendBtn) {
      finalSendBtn.textContent = '💾 Save Profile';
      finalSendBtn.innerHTML = '<i class="fas fa-save"></i> Save Profile';
      finalSendBtn.onclick = () => {
        const house = document.getElementById('addrHouse')?.value.trim() || '';
        const area = document.getElementById('addrArea')?.value.trim() || '';
        const landmark = document.getElementById('addrLandmark')?.value.trim() || '';
        const name = document.getElementById('custFullName')?.value.trim() || '';
        const phone = document.getElementById('custPhoneNumber')?.value.trim() || '';
        const selectedType = document.querySelector('input[name="addrType"]:checked')?.value || 'Home';
        const useEco = document.getElementById('ecoBoxCheckbox')?.checked || false;
        
        customerData.house = house;
        customerData.area = area;
        customerData.landmark = landmark;
        customerData.name = name;
        customerData.phone = phone;
        customerData.addressType = selectedType;
        customerData.useEcoBox = useEco;
        if (!customerData.location.lat) {
          showToast("Please set your delivery location on the map first");
          showStep(1);
          return;
        }
        saveCustomerData();
        closeAddressFlow();
        renderAccountModal();
        showToast('✅ Profile saved');
      };
    }
  }
}

function showStaticContent(title, content) {
  const body = document.getElementById('accountModalBody');
  if (!body) return;
  body.innerHTML = `
    <div class="static-content">
      <div class="static-header">
        <button class="back-to-account" id="backToAccountBtn"><i class="fas fa-arrow-left"></i></button>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="static-body">
        ${content}
      </div>
    </div>
  `;
  document.getElementById('backToAccountBtn')?.addEventListener('click', () => {
    renderAccountModal();
  });
}

// ========== CATEGORIES MODAL ==========
function openCategoriesModal() {
  const allCats = getCategoryList();
  categoriesGrid.innerHTML = allCats.map(cat => {
    const key = cat.toLowerCase();
    let imgUrl = getImageUrl(key);
    return `<div class="category-item" data-category="${cat}"><img class="category-image" src="${imgUrl}" alt="${cat}" loading="lazy"><span class="category-name">${cat}</span></div>`;
  }).join('');
  pushPageState('categories');
  categoriesModal.classList.add('open');
  document.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedCat = item.dataset.category;
      renderCategories();
      renderProducts();
      closeCategoriesModal();
    });
  });
}
function closeCategoriesModal() { categoriesModal.classList.remove('open'); }

// ========== LOAD DATA ==========
function loadData() {
  const baseUrl = 'https://opensheet.elk.sh/1FEpSYZlTrlp0BYPEcVCYISC0kgXpt_3Fcw5XAcjLOvs';
  
  fetch(`${baseUrl}/Config`)
    .then(res => res.json())
    .then(configRows => {
      if (configRows && configRows.length) {
        configRows.forEach(row => {
          const key = row.key?.trim();
          const val = row.value?.trim();
          if (!key || !val) return;
          switch(key.toLowerCase()) {
            case 'whatsapp_number':
              WHATSAPP_NUMBER = val;
              break;
            case 'adat_lat':
              ADAT_LAT = parseFloat(val);
              break;
            case 'adat_lon':
              ADAT_LON = parseFloat(val);
              break;
            case 'max_distance_km':
              MAX_DISTANCE_KM = parseFloat(val);
              break;
            case 'free_delivery_threshold':
              FREE_DELIVERY_THRESHOLD = parseFloat(val);
              break;
            case 'max_qty_per_product':
              MAX_QTY_PER_PRODUCT = parseInt(val, 10);
              break;
            case 'eco_box_charge':
              ECO_BOX_CHARGE = parseFloat(val);
              break;
            case 'delivery_charge':
              DELIVERY_CHARGE = parseFloat(val);
              break;
            case 'opening_hours':
              OPENING_HOURS = parseOpeningHours(val);
              break;
          }
        });
        console.log('✅ Config loaded from sheet');
      }
    })
    .catch(err => console.warn('⚠️ Config sheet not found, using defaults', err))
    .finally(() => {
      loadProductsAndOffers(baseUrl);
      updateStoreStatusUI();
    });
}

function loadProductsAndOffers(baseUrl) {
  const sheetMapping = [
    { sheet: 'Sheet1', category: 'vegitable-fresh', isOrganic: false },
    { sheet: 'Sheet10', category: 'vegitable-fresh-leafs', isOrganic: false },
    { sheet: 'Sheet11', category: 'fruits-fresh', isOrganic: false },
    { sheet: 'Sheet12', category: 'diary', isOrganic: false },
    { sheet: 'Sheet13', category: 'meats', isOrganic: false },
    { sheet: 'Sheet14', category: 'rice', isOrganic: false },
    { sheet: 'Sheet15', category: 'oils', isOrganic: false },
    { sheet: 'Sheet16', category: 'powders', isOrganic: false },
    { sheet: 'Sheet2', category: null, isOrganic: true },
    { sheet: 'Sheet4', category: 'cut-vegetable', isOrganic: false }
  ];
  
  const fetchPromises = sheetMapping.map(({ sheet }) =>
    fetch(`${baseUrl}/${sheet}`)
      .then(res => res.json())
      .catch(() => [])
  );
  
  fetchPromises.push(
    fetch(`${baseUrl}/Sheet5`).then(res => res.json()).catch(() => []),
    fetch(`${baseUrl}/Sheet6`).then(res => res.json()).catch(() => [])
  );
  
  Promise.all(fetchPromises).then(results => {
    const productSheets = results.slice(0, sheetMapping.length);
    const sheet5Data = results[sheetMapping.length];
    const sheet6Data = results[sheetMapping.length + 1];
    
    if (sheet5Data && sheet5Data.length) {
      sheet5Data.forEach(row => {
        let nameKey = null, url = null;
        for (let [col, val] of Object.entries(row)) {
          if (col.toLowerCase() === 'name') nameKey = val;
          if (col.toLowerCase() === 'image_url') url = val;
        }
        if (nameKey && url && url.startsWith('http')) imageMap[nameKey.toLowerCase()] = url;
      });
    }
    
    const processSheet = (rows, startId, defaultCategory, isOrganic) => {
      return (rows || []).filter(item => {
        const qtyRaw = item.qty || item.Qty || '';
        if (typeof qtyRaw === 'string' && qtyRaw.toLowerCase() === 'n') return false;
        return true;
      }).map((item, idx) => {
        let category = defaultCategory;
        if (defaultCategory === null) {
          category = (item.Category || 'organic').trim().toLowerCase();
        }
        let tags = item.Tags || '';
        if (!tags) {
          let nameWords = (item.Name || '').toLowerCase().split(' ');
          tags = nameWords.concat(category).join(',');
        }
        let qtyValue = item.qty || item.Qty;
        let productQty = 1;
        if (qtyValue !== undefined && qtyValue !== '') {
          if (!isNaN(Number(qtyValue))) {
            productQty = Number(qtyValue);
          } else {
            productQty = 0;
          }
        }
        
        const unitStr = item.Unit || 'unit';
        const units = unitStr.split(',').map(u => u.trim()).filter(u => u);
        const priceStr = item.Price ? String(item.Price) : '';
        const priceParts = priceStr.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
        const discountStr = item['Price-off'] ? String(item['Price-off']) : '';
        const discountParts = discountStr.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
        
        const prices = (priceParts.length === units.length) ? priceParts : (priceParts.length > 0 ? [priceParts[0]] : []);
        const discountPrices = (discountParts.length === units.length) ? discountParts : (discountParts.length > 0 ? [discountParts[0]] : []);
        
        return {
          id: startId + idx,
          name: item.Name || 'Fresh Item',
          price: Number(item.Price) || 0,
          discountPrice: item['Price-off'] ? Number(item['Price-off']) : 0,
          unit: unitStr,
          units: units,
          prices: prices,
          discountPrices: discountPrices,
          category: category,
          imageUrl: item.Emoji || '',
          showOnHomeRaw: item.ShowOnHome || `yes${idx+1}`,
          offer: (item.ShowOnHome || '').toLowerCase().startsWith('yes'),
          isOrganic: isOrganic,
          tags: tags.toLowerCase(),
          label: item.Label || '',
          qty: productQty,
          description: item.Description || item.description || '',
          highlight: item.Highlight || item.highlight || '',
          othr_img: item.othr_img || item.OtherImages || ''
        };
      });
    };
    
    let allProducts = [];
    let idCounter = 1;
    
    sheetMapping.forEach(({ sheet, category, isOrganic }, idx) => {
      const rows = productSheets[idx];
      const productsFromSheet = processSheet(rows, idCounter, category, isOrganic);
      allProducts.push(...productsFromSheet);
      idCounter += productsFromSheet.length + 100;
    });
    
    products = allProducts;
    
    if (sheet6Data && sheet6Data.length) {
      offers = sheet6Data.map((row, idx) => {
        const isSlide = row.is_slide && row.is_slide.toString().toLowerCase() === 'true';
        return {
          id: idx,
          name: row.offer_name || 'Special Offer',
          unit: row.offer_unit || '1 pc',
          oldPrice: Number(row.offer_old_price) || 0,
          newPrice: Number(row.offer_new_price) || 0,
          discountPercent: row.discount_percent || '🔥 OFF',
          expiryDate: row.expiry_date || null,
          productId: Number(row.product_id) || null,
          isSlide: isSlide,
          slideImageUrl: isSlide ? (row.slide_image_url || '') : '',
          imageUrl: row.image_url || getImageUrl(row.offer_name),
          description: row.description || '',
          highlight: row.highlight || '',
          othr_img: row.othr_img || ''
        };
      });
    } else {
      offers = [];
    }
    
    renderCategories();
    renderProducts();
    updateStickyCartBar();
  }).catch(err => {
    console.error("Sheet fetch error, using fallback data:", err);
    products = [
      { id:1, name:'Fresh Tomato', price:40, discountPrice:35, unit:'1kg, 500g', units:['1kg', '500g'], prices:[40, 25], discountPrices:[35, 20], category:'vegitable-fresh', showOnHomeRaw:'yes1', offer:true, isOrganic:false, tags:'tomato', label:'', qty:10, description:'Juicy red tomatoes, perfect for salads and cooking.', highlight:'Rich in Vitamin C, Fresh from farm', othr_img:'' },
      { id:2, name:'Onion', price:40, discountPrice:0, unit:'1kg', units:['1kg'], prices:[40], discountPrices:[0], category:'vegitable-fresh', showOnHomeRaw:'yes2', offer:false, isOrganic:false, tags:'onion', label:'', qty:0, description:'Fresh onions, essential for every kitchen.', highlight:'', othr_img:'' },
      { id:3, name:'Lady Finger', price:70, discountPrice:60, unit:'500g, 1kg', units:['500g', '1kg'], prices:[40, 70], discountPrices:[30, 60], category:'vegitable-fresh', showOnHomeRaw:'yes3', offer:true, isOrganic:false, tags:'okra', label:'buy 1 get 1', qty:5, description:'Tender lady fingers, great for curries.', highlight:'High in fiber, Fresh stock', othr_img:'' },
      { id:4, name:'Carrot', price:45, discountPrice:0, unit:'1kg', units:['1kg'], prices:[45], discountPrices:[0], category:'vegitable-fresh', showOnHomeRaw:'yes4', offer:false, isOrganic:false, tags:'carrot', label:'', qty:3, description:'Crunchy carrots, rich in vitamins.', highlight:'Good for eyesight, Organic', othr_img:'' },
      { id:5, name:'Broccoli', price:80, discountPrice:70, unit:'250g, 500g', units:['250g', '500g'], prices:[45, 80], discountPrices:[35, 70], category:'vegitable-fresh', showOnHomeRaw:'yes5', offer:true, isOrganic:true, tags:'broccoli', label:'', qty:2, description:'Fresh organic broccoli, high in fiber.', highlight:'Superfood, Rich in antioxidants', othr_img:'' },
      { id:6, name:'Spinach', price:25, discountPrice:20, unit:'1kg', units:['1kg'], prices:[25], discountPrices:[20], category:'vegitable-fresh-leafs', showOnHomeRaw:'yes6', offer:true, isOrganic:true, tags:'spinach', label:'Fresh Stock', qty:8, description:'Nutrient-rich spinach leaves.', highlight:'Iron-rich, Organic', othr_img:'' }
    ];
    offers = [];
    renderCategories();
    renderProducts();
    updateStickyCartBar();
  });
}

// ========== BACK BUTTON HANDLING ==========
function resetToHome() {
  closeCart();
  closeCategoriesModal();
  const visionModalElem = document.getElementById('visionModal');
  if (visionModalElem) visionModalElem.classList.remove('open');
  selectedCat = 'All';
  searchTerm = '';
  selectedSuggestionProduct = null;
  if (desktopSearch) desktopSearch.value = '';
  if (mobileSearch) mobileSearch.value = '';
  if (desktopSuggestions) desktopSuggestions.classList.remove('active');
  if (mobileSuggestions) mobileSuggestions.classList.remove('active');
  updateClearButtons();
  renderCategories();
  renderProducts();
}

function pushPageState(pageName) {
  history.pushState({ page: pageName }, '', '#'+pageName);
}

if (window.history.length <= 1) {
  history.pushState({ home: true }, '', location.href);
}
window.addEventListener('popstate', function(event) {
  resetToHome();
  history.pushState({ home: true }, '', location.href);
});

// ========== ADDRESS FLOW INIT ==========
function initAddressFlow() {
  addressFlowModal = document.getElementById('addressFlowModal');
  if (!addressFlowModal) return;

  document.getElementById('closeAddressFlow').addEventListener('click', closeAddressFlow);
  document.getElementById('backArrowBtn').addEventListener('click', handleBack);

  document.getElementById('confirmLocationBtn').addEventListener('click', () => {
    if (currentLocationValid) {
      showStep(2);
    } else {
      showToast('Please select a location within 5 km delivery area.');
    }
  });

  document.getElementById('nextToPersonalBtn').addEventListener('click', () => {
    const house = document.getElementById('addrHouse');
    if (!house || !house.value.trim()) {
      showToast('Please enter house/flat/floor number');
      return;
    }
    customerData.house = house.value.trim();
    customerData.area = document.getElementById('addrArea').value.trim();
    customerData.landmark = document.getElementById('addrLandmark').value.trim();
    const selectedType = document.querySelector('input[name="addrType"]:checked');
    if (selectedType) customerData.addressType = selectedType.value;
    customerData.useEcoBox = document.getElementById('ecoBoxCheckbox').checked;
    showStep(3);
  });

  document.getElementById('nextToConfirmBtn').addEventListener('click', () => {
    const name = document.getElementById('custFullName');
    const phone = document.getElementById('custPhoneNumber');
    if (!name || !name.value.trim() || !phone || !phone.value.trim()) {
      showToast('Please enter your full name and phone number');
      return;
    }
    customerData.name = name.value.trim();
    customerData.phone = phone.value.trim();
    saveCustomerData();
    showStep(4);
  });

  const finalSendBtn = document.getElementById('sendWhatsAppFinalBtn');
  if (finalSendBtn) {
    finalSendBtn.addEventListener('click', function() {
      if (isLoginMode) {
        const house = document.getElementById('addrHouse')?.value.trim() || '';
        const area = document.getElementById('addrArea')?.value.trim() || '';
        const landmark = document.getElementById('addrLandmark')?.value.trim() || '';
        const name = document.getElementById('custFullName')?.value.trim() || '';
        const phone = document.getElementById('custPhoneNumber')?.value.trim() || '';
        const selectedType = document.querySelector('input[name="addrType"]:checked')?.value || 'Home';
        const useEco = document.getElementById('ecoBoxCheckbox')?.checked || false;
        
        customerData.house = house;
        customerData.area = area;
        customerData.landmark = landmark;
        customerData.name = name;
        customerData.phone = phone;
        customerData.addressType = selectedType;
        customerData.useEcoBox = useEco;
        if (!customerData.location.lat) {
          showToast("Please set your delivery location on the map first");
          showStep(1);
          return;
        }
        saveCustomerData();
        closeAddressFlow();
        renderAccountModal();
        showToast('✅ Profile saved');
      } else {
        sendFinalWhatsApp();
      }
    });
  }

  const editBtn = document.getElementById('editAddressBtn');
  if (editBtn) editBtn.addEventListener('click', startMultiStepFlow);

  const sendSummaryBtn = document.getElementById('sendFromSummaryBtn');
  if (sendSummaryBtn) {
    sendSummaryBtn.addEventListener('click', function() {
      if (isLoginMode) {
        saveCustomerData();
        closeAddressFlow();
        renderAccountModal();
        showToast('✅ Profile saved');
      } else {
        sendOrderFromSummary();
      }
    });
    
    function updateSummaryButtonText() {
      if (sendSummaryBtn) {
        sendSummaryBtn.innerHTML = isLoginMode ? '<i class="fas fa-save"></i> Save Profile' : '<i class="fas fa-check"></i> Confirm Order';
      }
    }
    setTimeout(updateSummaryButtonText, 100);
    const origOpenAddressFlow = openAddressFlow;
    openAddressFlow = function() {
      isLoginMode = false;
      origOpenAddressFlow.call(this);
      setTimeout(updateSummaryButtonText, 200);
    };
    const origOpenAddressFlowForLogin = openAddressFlowForLogin;
    openAddressFlowForLogin = function() {
      isLoginMode = true;
      origOpenAddressFlowForLogin.call(this);
      setTimeout(updateSummaryButtonText, 200);
    };
  }

  document.getElementById('useMyLocationBtn').addEventListener('click', useCurrentLocation);

  addressFlowModal.addEventListener('click', (e) => {
    if (e.target === addressFlowModal) closeAddressFlow();
  });
}

// ========== DOMContentLoaded ==========
document.addEventListener('DOMContentLoaded', () => {
  productsGrid = document.getElementById('productsGrid');
  catRow = document.getElementById('catRow');
  cartCountSpan = document.getElementById('cartCount');
  cartOverlay = document.getElementById('cartOverlay');
  cartPanel = document.getElementById('cartPanel');
  cartItems = document.getElementById('cartItems');
  cartFooter = document.getElementById('cartFooter');
  footerItems = document.getElementById('footerItems');
  footerTotal = document.getElementById('footerTotal');
  toastEl = document.getElementById('toast');
  categoriesModal = document.getElementById('categoriesModal');
  categoriesGrid = document.getElementById('categoriesGrid');
  arrowMoreBtn = document.getElementById('arrowMoreBtn');

  stickyBar = document.getElementById('stickyCartBar');
  stickyCountSpan = document.getElementById('stickyCartCount');
  stickySavingsSpan = document.getElementById('stickyCartSavings');
  stickyFreeBadge = document.getElementById('stickyFreeBadge');
  stickyCartBtn = document.getElementById('stickyCartBtn');
  stickyToggleBtn = document.getElementById('stickyCartToggleBtn');
  stickyDetailedDiv = document.getElementById('stickyCartDetailed');

  if (stickyCartBtn) stickyCartBtn.addEventListener('click', openCart);
  if (stickyToggleBtn) stickyToggleBtn.addEventListener('click', toggleStickyDetailed);

  document.getElementById('cartButton').addEventListener('click', openCart);
  document.getElementById('closeCartBtn').addEventListener('click', closeCart);
  cartOverlay.addEventListener('click', closeCart);
  document.getElementById('orderBtn').addEventListener('click', openAddressFlow);
  arrowMoreBtn.addEventListener('click', openCategoriesModal);
  document.getElementById('closeCategoriesModal').addEventListener('click', closeCategoriesModal);
  categoriesModal.addEventListener('click', (e) => { if (e.target === categoriesModal) closeCategoriesModal(); });

  const mobileIcon = document.getElementById('mobileSearchIcon');
  const mobileRow = document.getElementById('mobileSearchRow');
  const innerArrow = document.getElementById('mobileSearchInnerIcon');
  if (mobileIcon && mobileRow) {
    mobileIcon.addEventListener('click', () => mobileRow.classList.toggle('open'));
  }
  if (innerArrow && mobileRow) {
    innerArrow.addEventListener('click', () => {
      if (mobileRow.classList.contains('open')) {
        if (mobileSearch) mobileSearch.value = '';
        selectedSuggestionProduct = null;
        searchTerm = '';
        if (mobileSuggestions) {
          mobileSuggestions.classList.remove('active');
          mobileSuggestions.innerHTML = '';
        }
        updateClearButtons();
        renderProducts();
        mobileRow.classList.remove('open');
      }
    });
  }

  const visionModalElem = document.getElementById('visionModal');
  const visionLink = document.getElementById('visionLink');
  const closeVisionBtn = document.getElementById('closeVisionModal');
  if (visionLink && visionModalElem) {
    visionLink.addEventListener('click', (e) => { e.preventDefault(); pushPageState('vision'); visionModalElem.classList.add('open'); });
  }
  if (closeVisionBtn && visionModalElem) {
    closeVisionBtn.addEventListener('click', () => visionModalElem.classList.remove('open'));
    visionModalElem.addEventListener('click', (e) => { if (e.target === visionModalElem) visionModalElem.classList.remove('open'); });
  }

  productDetailModal = document.getElementById('productDetailModal');
  slideshowImages = document.getElementById('slideshowImages');
  slideshowDots = document.getElementById('slideshowDots');
  detailName = document.getElementById('detailName');
  detailUnitDisplay = document.getElementById('detailUnitDisplay');
  detailUnitWrapper = document.getElementById('detailUnitWrapper');
  detailUnitSelector = document.getElementById('detailUnitSelector');
  unitOptions = document.getElementById('unitOptions');
  detailPrice = document.getElementById('detailPrice');
  detailHighlights = document.getElementById('detailHighlights');
  highlightsList = document.getElementById('highlightsList');
  detailDescription = document.getElementById('detailDescription');
  detailAddBtn = document.getElementById('detailAddBtn');

  detailAddBtn.addEventListener('click', handleDetailAddClick);

  document.getElementById('closeProductDetail').addEventListener('click', closeProductDetail);
  productDetailModal.addEventListener('click', (e) => {
    if (e.target === productDetailModal || e.target.classList.contains('product-detail-overlay')) {
      closeProductDetail();
    }
  });

  const warningEl = document.getElementById('locationWarning');
  if (warningEl) {
    const distSpan = document.getElementById('maxDistDisplay');
    const labelSpan = document.getElementById('maxDistKmLabel');
    if (distSpan) distSpan.textContent = MAX_DISTANCE_KM;
    if (labelSpan) labelSpan.textContent = MAX_DISTANCE_KM;
  }

  setupGlobalListeners();
  initSearchListeners();
  initAddressFlow();
  loadData();

  const offerModal = document.getElementById('offerDetailModal');
  const closeOfferModalBtn = document.getElementById('closeOfferModal');
  const addOfferBtn = document.getElementById('addOfferToCartBtn');
  if (closeOfferModalBtn) closeOfferModalBtn.addEventListener('click', closeOfferModal);
  if (addOfferBtn) addOfferBtn.addEventListener('click', addOfferToCart);
  if (offerModal) offerModal.addEventListener('click', (e) => { if (e.target === offerModal) closeOfferModal(); });

  const bottomNavBar = document.getElementById('bottomNavBar');
  let lastScrollTop = 0;
  let scrollTimeout;

  function handleBottomBar() {
    if (!bottomNavBar) return;
    if (document.body.classList.contains('cart-not-empty')) {
      bottomNavBar.classList.remove('visible');
      return;
    }
    const currentScroll = window.scrollY || document.documentElement.scrollTop;
    if (currentScroll < lastScrollTop) {
      bottomNavBar.classList.add('visible');
    } else if (currentScroll > lastScrollTop) {
      bottomNavBar.classList.remove('visible');
    } else if (currentScroll === 0) {
      bottomNavBar.classList.add('visible');
    }
    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
  }

  setTimeout(() => {
    if (!document.body.classList.contains('cart-not-empty') && (window.scrollY || document.documentElement.scrollTop) === 0) {
      bottomNavBar.classList.add('visible');
    }
  }, 100);

  window.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(handleBottomBar, 20);
  });
  window.addEventListener('resize', handleBottomBar);
  window.addEventListener('load', handleBottomBar);

  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.nav;
      switch(action) {
        case 'home':
          resetToHome();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'category':
          openCategoriesModal();
          break;
        case 'account':
          openAccountModal();
          break;
      }
      bottomNavBar.classList.remove('visible');
    });
  });

  const accountModal = document.getElementById('accountModal');
  const closeAccountModalBtn = document.getElementById('closeAccountModal');
  if (closeAccountModalBtn) closeAccountModalBtn.addEventListener('click', closeAccountModalFunc);
  if (accountModal) accountModal.addEventListener('click', (e) => {
    if (e.target === accountModal) closeAccountModalFunc();
  });

  let deferredPrompt;
  const installBanner = document.getElementById('installBanner');
  const installBtn = document.getElementById('installAppBtn');
  const closeInstallBanner = document.getElementById('closeInstallBanner');
  window.addEventListener('beforeinstallprompt', (e) => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) return;
    e.preventDefault();
    deferredPrompt = e;
    if (installBanner) installBanner.style.display = 'flex';
  });
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        alert('Click the three dots ⋮ and select "Install app"');
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (installBanner) installBanner.style.display = 'none';
    });
  }
  if (closeInstallBanner) {
    closeInstallBanner.addEventListener('click', () => {
      if (installBanner) installBanner.style.display = 'none';
    });
  }
  window.addEventListener('appinstalled', () => {
    if (installBanner) installBanner.style.display = 'none';
    deferredPrompt = null;
  });

  const savedCart = getCart();
  cart = savedCart;
  updateCartCountUI();
  updateStickyCartBar();
});