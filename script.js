// ----------------------------- CONFIGURATION -----------------------------
const WHATSAPP_NUMBER = '919447570336';
const ADAT_LAT = 10.5520;
const ADAT_LON = 76.0900;
const MAX_DISTANCE_KM = 5;
const FREE_DELIVERY_THRESHOLD = 200;   // Free delivery if subtotal > 200

let products = [];
let cart = {};
let selectedCat = 'All';
let searchTerm = '';

// DOM elements
let productsGrid, catRow, cartCountSpan, cartOverlay, cartPanel, cartItems, cartFooter, footerItems, footerTotal;
let modalOverlay, custName, custPhone, custAddress, custLocation, mapFrame, distanceSpan, deliveryChargeSpan, finalTotalSpan, deliveryWarningBox, sendBtn, orderSummaryDiv;
let toastEl;
let categoriesModal, categoriesGrid, arrowMoreBtn;

// Search elements
let desktopSearch, mobileSearch, desktopClearBtn, mobileClearBtn, desktopSuggestions, mobileSuggestions;

// Global image map (from Sheet5)
let imageMap = {};

// Fallback images (used if Sheet5 is missing or key not found)
const FALLBACK_IMAGES = {
  slide1: 'https://via.placeholder.com/800x400?text=Slide+1',
  slide2: 'https://via.placeholder.com/800x400?text=Slide+2',
  slide3: 'https://via.placeholder.com/800x400?text=Slide+3',
  'vegitable-fresh': 'https://via.placeholder.com/90?text=Fresh+Veg',
  'fruits-fresh': 'https://via.placeholder.com/90?text=Fresh+Fruits',
  diary: 'https://via.placeholder.com/90?text=Dairy',
  meats: 'https://via.placeholder.com/90?text=Meats',
  rice: 'https://via.placeholder.com/90?text=Rice',
  'vegitable-fresh-leafs': 'https://via.placeholder.com/90?text=Leafy',
  all: 'https://via.placeholder.com/90?text=All',
  offers: 'https://via.placeholder.com/90?text=Offers',
  'cut vegetables': 'https://via.placeholder.com/90?text=Cut',
  oils: 'https://via.placeholder.com/90?text=Oils',
  powders: 'https://via.placeholder.com/90?text=Powders',
  organic: 'https://via.placeholder.com/90?text=Organic'
};

// Helper: get image URL (from sheet, then fallback)
function getImageUrl(key) {
  const lowerKey = key.toLowerCase();
  if (imageMap[lowerKey]) return imageMap[lowerKey];
  if (FALLBACK_IMAGES[lowerKey]) return FALLBACK_IMAGES[lowerKey];
  return `https://via.placeholder.com/90?text=${encodeURIComponent(key)}`;
}

// ----------------------------- Helper functions -----------------------------
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2000);
}

function updateCartCountUI() {
  const total = Object.values(cart).reduce((a, b) => a + b, 0);
  cartCountSpan.textContent = total;
}

function adjustQuantity(productId, delta) {
  const newQty = (cart[productId] || 0) + delta;
  if (newQty <= 0) {
    delete cart[productId];
  } else {
    cart[productId] = newQty;
  }
  updateCartCountUI();
  renderProducts();
  if (cartPanel && cartPanel.classList.contains('open')) renderCart();
  showToast(delta > 0 ? 'Added to cart' : 'Removed');
}

function getProductImageUrl(product) {
  if (product.imageUrl && product.imageUrl.startsWith('http')) {
    return product.imageUrl;
  }
  return `https://picsum.photos/seed/${product.id}-${encodeURIComponent(product.name.slice(0,10))}/300/200`;
}

function isCutVegetable(category) {
  if (!category) return false;
  const cat = category.trim().toLowerCase();
  return cat === 'cut-vegetable' || cat === 'cut-vegitable' || cat === 'cut vegetable';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
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
  return false;
}

function createProductCard(p, showQtyControls = true) {
  const qty = cart[p.id] || 0;
  const hasQty = qty > 0;
  const imageUrl = getProductImageUrl(p);
  const imgHtml = `<div class="product-img"><img src="${imageUrl}" alt="${p.name}" loading="lazy">${p.isOrganic ? '<span class="organic-label">🌿 Organic</span>' : ''}${isCutVegetable(p.category) ? '<span class="cut-label">✂️ Cut</span>' : ''}</div>`;
  
  let priceHtml = '';
  if (p.discountPrice && p.discountPrice > 0 && p.discountPrice < p.price) {
    priceHtml = `<div class="price-wrapper"><span class="original-price">₹${p.price}</span><span class="discount-price">₹${p.discountPrice}</span></div>`;
  } else {
    priceHtml = `<div class="single-price">₹${p.price}</div>`;
  }

  if (!hasQty || !showQtyControls) {
    return `<div class="product-card">
      ${imgHtml}
      <div class="product-info">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-unit">${p.unit}</div>
        ${priceHtml}
        <button class="add-button" data-id="${p.id}"><i class="fas fa-plus"></i> Add</button>
      </div>
    </div>`;
  } else {
    return `<div class="product-card">
      ${imgHtml}
      <div class="product-info">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-unit">${p.unit}</div>
        ${priceHtml}
        <div class="square-qty-box">
          <button class="qty-square-btn" data-id="${p.id}" data-delta="-1"><i class="fas fa-minus"></i></button>
          <span class="qty-square-value">${qty}</span>
          <button class="qty-square-btn" data-id="${p.id}" data-delta="1"><i class="fas fa-plus"></i></button>
        </div>
      </div>
    </div>`;
  }
}

function bindProductEvents(container = document) {
  container.querySelectorAll('.add-button').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      adjustQuantity(parseInt(newBtn.dataset.id), 1);
    });
  });
  container.querySelectorAll('.qty-square-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      adjustQuantity(parseInt(newBtn.dataset.id), parseInt(newBtn.dataset.delta));
    });
  });
}

// ========== HOMEPAGE CUSTOM LAYOUT ==========
function renderCustomHomeLayout() {
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
  
  const slideshowHtml = `
    <div class="home-slideshow">
      <div class="slide active"><img src="${slide1Url}" alt="Fresh vegetables"></div>
      <div class="slide"><img src="${slide2Url}" alt="Organic fruits"></div>
      <div class="slide"><img src="${slide3Url}" alt="Leafy greens"></div>
      <div class="slideshow-dots"></div>
    </div>
  `;
  
  const categoryStripHtml = `
    <div class="category-strip">
      <div class="category-square" data-cat-value="vegitable-fresh"><img class="square-img" src="${getImageUrl('vegitable-fresh')}" alt="Fresh Veg"><span class="square-name">Fresh Veg</span></div>
      <div class="category-square" data-cat-value="fruits-fresh"><img class="square-img" src="${getImageUrl('fruits-fresh')}" alt="Fresh Fruits"><span class="square-name">Fresh Fruits</span></div>
      <div class="category-square" data-cat-value="diary"><img class="square-img" src="${getImageUrl('diary')}" alt="Dairy & Egg"><span class="square-name">Dairy & Egg</span></div>
      <div class="category-square" data-cat-value="vegitable-fresh-leafs"><img class="square-img" src="${getImageUrl('vegitable-fresh-leafs')}" alt="Fresh Leafs"><span class="square-name">Fresh Leafs</span></div>
      <div class="category-square" data-cat-value="meats"><img class="square-img" src="${getImageUrl('meats')}" alt="Meats"><span class="square-name">Meats</span></div>
      <div class="category-square" data-cat-value="rice"><img class="square-img" src="${getImageUrl('rice')}" alt="Atta & Rice"><span class="square-name">Atta & Rice</span></div>
    </div>
  `;
  
  productsGrid.innerHTML = firstFourHtml + slideshowHtml + categoryStripHtml;
  bindProductEvents(productsGrid);
  initSlideshow();
  attachCategorySquareEvents();
  renderHomeCarousel(nextTen);
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
  items.forEach(p => {
    carouselHtml += createProductCard(p, true);
  });
  carouselContainer.innerHTML = carouselHtml;
  bindProductEvents(carouselContainer);
}

// ========== SEARCH RESULTS LAYOUT ==========
function renderSearchResults() {
  const homeCarouselSection = document.getElementById('homeCarouselSection');
  if (homeCarouselSection) homeCarouselSection.style.display = 'none';
  
  let matched = products.filter(p => productMatchesSearch(p, searchTerm));
  
  if (matched.length === 0) {
    productsGrid.classList.remove('block');
    productsGrid.style.display = 'grid';
    productsGrid.innerHTML = `<div class="no-results" style="grid-column:1/-1; padding:40px;">✨ No products found for "${escapeHtml(searchTerm)}"</div>`;
    return;
  }
  
  productsGrid.classList.add('block');
  productsGrid.style.display = 'block';
  
  let html = '';
  
  html += `<div class="search-results-highlight">
    <h3 style="font-family: 'Playfair Display', serif; color: var(--green); margin-bottom: 18px; display: flex; align-items: center; gap: 8px;">
      <i class="fas fa-search" style="color: var(--orange);"></i> Search Results (${matched.length})
    </h3>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;">
  `;
  matched.forEach(p => {
    html += createProductCard(p, true);
  });
  html += `</div></div>`;
  
  const primaryProduct = matched[0];
  const primaryCategory = primaryProduct.category;
  const similarProducts = products.filter(p => 
    p.category === primaryCategory && !matched.some(m => m.id === p.id)
  );
  
  if (similarProducts.length > 0) {
    html += `<div class="similar-products-section" style="margin-top: 28px;">
      <div class="carousel-header">
        <h3><i class="fas fa-tags"></i> More from ${primaryCategory.replace(/-/g, ' ')}</h3>
        <span class="carousel-hint"><i class="fas fa-arrow-left"></i> Swipe to explore <i class="fas fa-arrow-right"></i></span>
      </div>
      <div class="horizontal-scroll-wrapper" id="similarCarousel"></div>
    </div>`;
  }
  
  productsGrid.innerHTML = html;
  bindProductEvents(productsGrid);
  
  if (similarProducts.length > 0) {
    const carouselContainer = document.getElementById('similarCarousel');
    if (carouselContainer) {
      let carouselHtml = '';
      similarProducts.forEach(p => {
        carouselHtml += createProductCard(p, true);
      });
      carouselContainer.innerHTML = carouselHtml;
      bindProductEvents(carouselContainer);
    }
  }
}

function renderFilteredGrid() {
  productsGrid.classList.remove('block');
  productsGrid.style.display = 'grid';
  
  let filtered = products.filter(p => {
    let categoryMatch = false;
    if (selectedCat === 'All') {
      if (searchTerm !== '') {
        return productMatchesSearch(p, searchTerm);
      }
      categoryMatch = p.showOnHomeRaw && p.showOnHomeRaw.toLowerCase().startsWith('yes');
    } else if (selectedCat === 'Offers') {
      categoryMatch = p.offer === true;
    } else if (selectedCat === 'Cut Vegetables') {
      categoryMatch = isCutVegetable(p.category);
    } else {
      categoryMatch = (p.category === selectedCat);
    }
    const searchMatch = (searchTerm === '') || productMatchesSearch(p, searchTerm);
    return categoryMatch && searchMatch;
  });
  
  if (selectedCat === 'All' && searchTerm === '') {
    filtered.sort((a, b) => getHomeOrderNumber(a.showOnHomeRaw) - getHomeOrderNumber(b.showOnHomeRaw));
  } else {
    filtered.sort((a, b) => (b.offer === true) - (a.offer === true));
  }
  
  if (!filtered.length) {
    productsGrid.innerHTML = `<div class="no-results" style="grid-column:1/-1; padding:40px;">✨ No products found</div>`;
  } else {
    productsGrid.innerHTML = filtered.map(p => createProductCard(p, true)).join('');
    bindProductEvents(productsGrid);
  }
  const carouselSection = document.getElementById('homeCarouselSection');
  if (carouselSection) carouselSection.style.display = 'none';
}

function renderProducts() {
  if (searchTerm !== '') {
    renderSearchResults();
    return;
  }
  if (selectedCat === 'All' && searchTerm === '') {
    renderCustomHomeLayout();
  } else {
    renderFilteredGrid();
  }
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
    });
  });
}

// ========== SEARCH WITH SUGGESTIONS ==========
function updateClearButtons() {
  if (desktopClearBtn) desktopClearBtn.style.display = searchTerm ? 'block' : 'none';
  if (mobileClearBtn) mobileClearBtn.style.display = searchTerm ? 'block' : 'none';
}

function getSuggestionProducts(input) {
  if (!input || input.length < 2) return [];
  const lowerInput = input.toLowerCase();
  const matched = new Map();
  products.forEach(p => {
    if (p.name.toLowerCase().includes(lowerInput)) {
      matched.set(p.id, p);
    } else if (p.tags && p.tags.toLowerCase().includes(lowerInput)) {
      matched.set(p.id, p);
    }
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
    return `
      <div class="suggestion-item" data-product-id="${p.id}">
        <img class="suggestion-img" src="${imgUrl}" alt="${escapeHtml(p.name)}" loading="lazy">
        <span class="suggestion-name">${escapeHtml(p.name)}</span>
      </div>
    `;
  }).join('');
  suggestionsContainer.classList.add('active');
  
  suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      const productId = parseInt(item.dataset.productId);
      const product = products.find(p => p.id === productId);
      if (product) {
        searchTerm = product.name.toLowerCase();
        inputElement.value = product.name;
        updateClearButtons();
        suggestionsContainer.classList.remove('active');
        renderProducts();
      }
    });
  });
}

function handleSearchInput(value, isMobile = false) {
  searchTerm = value.trim().toLowerCase();
  updateClearButtons();
  const inputEl = isMobile ? mobileSearch : desktopSearch;
  const suggestionsEl = isMobile ? mobileSuggestions : desktopSuggestions;
  if (value.length >= 2) {
    showSuggestions(inputEl, suggestionsEl, value, isMobile);
  } else {
    suggestionsEl.classList.remove('active');
  }
  renderProducts();
}

function clearSearch(isMobile = false) {
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
    desktopSearch.addEventListener('input', (e) => handleSearchInput(e.target.value, false));
    desktopSearch.addEventListener('blur', () => setTimeout(() => desktopSuggestions.classList.remove('active'), 200));
  }
  if (mobileSearch) {
    mobileSearch.addEventListener('input', (e) => handleSearchInput(e.target.value, true));
    mobileSearch.addEventListener('blur', () => setTimeout(() => mobileSuggestions.classList.remove('active'), 200));
  }
  if (desktopClearBtn) desktopClearBtn.addEventListener('click', () => clearSearch(false));
  if (mobileClearBtn) mobileClearBtn.addEventListener('click', () => clearSearch(true));
}

// ========== CART RENDERING WITH SAVINGS ==========
function renderCart() {
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  if (!ids.length) {
    cartItems.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-cart"></i><p>Cart empty</p></div>`;
    cartFooter.style.display = 'none';
    return;
  }
  
  let total = 0, count = 0, totalSaved = 0;
  let cartHtml = '';
  
  ids.forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const effectivePrice = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    const originalPrice = p.price;
    const sub = effectivePrice * qty;
    const saved = (originalPrice - effectivePrice) * qty;
    total += sub;
    count += qty;
    totalSaved += saved;
    const imgSrc = getProductImageUrl(p);
    
    cartHtml += `
      <div class="cart-item">
        <div class="cart-item-emoji"><img src="${imgSrc}" alt="${p.name}"></div>
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(p.name)}</div>
          <div class="cart-item-price-original">
            ${originalPrice > effectivePrice ? `<span class="original-price">₹${originalPrice}</span>` : ''}
            <span class="discount-price">₹${effectivePrice}</span>
          </div>
          ${saved > 0 ? `<div class="cart-item-saved">You saved: ₹${saved}</div>` : ''}
        </div>
        <div class="cart-item-qty">
          <button class="cqty-btn" data-id="${id}" data-delta="-1"><i class="fas fa-minus"></i></button>
          <span>${qty}</span>
          <button class="cqty-btn" data-id="${id}" data-delta="1"><i class="fas fa-plus"></i></button>
          <button class="remove-btn" data-id="${id}" data-remove="all"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
    `;
  });
  
  cartItems.innerHTML = cartHtml;
  footerItems.textContent = count;
  footerTotal.textContent = '₹' + total;
  
  // Remove existing totalSaved row if any
  const existingSavedRow = document.querySelector('.cart-total-saved');
  if (existingSavedRow) existingSavedRow.remove();
  
  if (totalSaved > 0) {
    const savedRow = document.createElement('div');
    savedRow.className = 'cart-total-saved';
    savedRow.style.cssText = 'display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e0e0e0; font-weight: bold; color: var(--orange);';
    savedRow.innerHTML = `<span><i class="fas fa-tags"></i> Total Savings</span><span>₹${totalSaved}</span>`;
    cartFooter.insertBefore(savedRow, cartFooter.querySelector('.order-btn'));
  }
  
  cartFooter.style.display = 'block';
  
  // Re-attach event listeners
  document.querySelectorAll('.cqty-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => adjustQuantity(parseInt(newBtn.dataset.id), parseInt(newBtn.dataset.delta)));
  });
  document.querySelectorAll('.remove-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      const id = parseInt(newBtn.dataset.id);
      delete cart[id];
      updateCartCountUI();
      renderProducts();
      renderCart();
      showToast('Removed');
    });
  });
}

function openCart() { cartOverlay.classList.add('open'); cartPanel.classList.add('open'); renderCart(); }
function closeCart() { cartOverlay.classList.remove('open'); cartPanel.classList.remove('open'); }

// ========== ORDER MODAL WITH FREE DELIVERY THRESHOLD ==========
let currentDistance = 0;

function getCartSubtotal() {
  let subtotal = 0;
  Object.keys(cart).forEach(id => {
    const p = products.find(x => x.id == id);
    const effectivePrice = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    subtotal += effectivePrice * cart[id];
  });
  return subtotal;
}

function calculateDeliveryFinal(distance, subtotal) {
  if (subtotal > FREE_DELIVERY_THRESHOLD) return 0;
  if (distance > MAX_DISTANCE_KM) return 0;
  return distance <= 2 ? 10 : 20;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getLocation() {
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    currentDistance = getDistanceKm(lat, lon, ADAT_LAT, ADAT_LON);
    const mapLink = `https://www.google.com/maps?q=${lat},${lon}`;
    custLocation.value = mapLink;
    mapFrame.src = `https://maps.google.com/maps?q=${lat},${lon}&z=15&output=embed`;
    mapFrame.style.display = "block";
    distanceSpan.innerText = currentDistance.toFixed(2) + " km";
    
    const subtotal = getCartSubtotal();
    let delivery = 0;
    if (subtotal > FREE_DELIVERY_THRESHOLD) {
      delivery = 0;
    } else if (currentDistance <= MAX_DISTANCE_KM) {
      delivery = currentDistance <= 2 ? 10 : 20;
    }
    deliveryChargeSpan.innerText = delivery;
    finalTotalSpan.innerText = subtotal + delivery;
    
    if (currentDistance > MAX_DISTANCE_KM && subtotal <= FREE_DELIVERY_THRESHOLD) {
      deliveryWarningBox.style.display = "block";
      sendBtn.disabled = true;
    } else {
      deliveryWarningBox.style.display = "none";
      sendBtn.disabled = false;
    }
    renderOrderSummary();
  }, () => showToast("Location permission denied"));
}

function updateModalTotal() {
  const subtotal = getCartSubtotal();
  let delivery = 0;
  if (subtotal > FREE_DELIVERY_THRESHOLD) {
    delivery = 0;
  } else if (currentDistance <= MAX_DISTANCE_KM) {
    delivery = currentDistance <= 2 ? 10 : 20;
  }
  deliveryChargeSpan.innerText = delivery;
  finalTotalSpan.innerText = subtotal + delivery;
  return { subtotal, delivery };
}

function renderOrderSummary() {
  let html = '';
  let subtotal = 0;
  Object.keys(cart).forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const effectivePrice = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    const originalPrice = p.price;
    const sub = effectivePrice * qty;
    subtotal += sub;
    const saved = (originalPrice - effectivePrice) * qty;
    html += `<div class="summary-item">
      <span>${escapeHtml(p.name)} x${qty}</span>
      <span>₹${sub} ${saved > 0 ? `<span style="color:var(--orange); font-size:0.75rem;">(save ₹${saved})</span>` : ''}</span>
    </div>`;
  });
  orderSummaryDiv.innerHTML = html || '<div>No items</div>';
  
  distanceSpan.innerText = currentDistance ? currentDistance.toFixed(2) + " km" : "0 km";
  let delivery = 0;
  if (subtotal > FREE_DELIVERY_THRESHOLD) {
    delivery = 0;
  } else if (currentDistance && currentDistance <= MAX_DISTANCE_KM) {
    delivery = currentDistance <= 2 ? 10 : 20;
  }
  deliveryChargeSpan.innerText = delivery;
  finalTotalSpan.innerText = subtotal + delivery;
  
  if ((currentDistance > MAX_DISTANCE_KM) && subtotal <= FREE_DELIVERY_THRESHOLD) {
    deliveryWarningBox.style.display = "block";
    sendBtn.disabled = true;
  } else {
    deliveryWarningBox.style.display = "none";
    sendBtn.disabled = false;
  }
}

function saveFormToLocalStorage() {
  const formData = {
    name: custName.value.trim(),
    phone: custPhone.value.trim(),
    address: custAddress.value.trim(),
    note: document.getElementById('custNote')?.value.trim() || ''
  };
  localStorage.setItem('freshAdat_customer', JSON.stringify(formData));
}

function loadFormFromLocalStorage() {
  const saved = localStorage.getItem('freshAdat_customer');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.name) custName.value = data.name;
      if (data.phone) custPhone.value = data.phone;
      if (data.address) custAddress.value = data.address;
      if (data.note) document.getElementById('custNote').value = data.note;
    } catch(e) {}
  }
}

function openOrderModal() {
  if (Object.keys(cart).length === 0) { showToast("Cart is empty"); return; }
  closeCart();
  modalOverlay.classList.add('show');
  renderOrderSummary();
  distanceSpan.innerText = "0 km";
  deliveryChargeSpan.innerText = "0";
  finalTotalSpan.innerText = "0";
  currentDistance = 0;
  deliveryWarningBox.style.display = "none";
  sendBtn.disabled = false;
  loadFormFromLocalStorage();
}

function closeOrderModal() { modalOverlay.classList.remove('show'); }

function sendWhatsApp() {
  if (currentDistance > MAX_DISTANCE_KM && getCartSubtotal() <= FREE_DELIVERY_THRESHOLD) {
    showToast("❌ Delivery not available beyond 5 km");
    return;
  }
  const name = custName.value.trim();
  const phone = custPhone.value.trim();
  const address = custAddress.value.trim();
  const locationLink = custLocation.value.trim();
  if (!name || !phone || !address || !locationLink) { showToast("Please fill all fields and get location"); return; }
  saveFormToLocalStorage();
  let itemsList = '', total = 0;
  Object.keys(cart).forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const effectivePrice = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    const sub = effectivePrice * qty;
    total += sub;
    itemsList += `  • ${p.name} × ${qty} ${p.unit} = ₹${sub}\n`;
  });
  const orderId = 'ORD' + Date.now().toString().slice(-6);
  const note = document.getElementById('custNote')?.value.trim() || '-';
  const msg = `🌿 *FRESH ADAT ORDER*\n━━━━━━━━━━━━━━\n🆔 Order: ${orderId}\n👤 ${name} | ${phone}\n📍 ${address}\n🗺️ Location: ${locationLink}\n\n🛒 Items:\n${itemsList}\n💰 TOTAL: ₹${total}\n📝 Note: ${note}\nThank you!`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ---------- CATEGORIES MODAL (uses imageMap) ----------
function openCategoriesModal() {
  const allCats = getCategoryList();
  categoriesGrid.innerHTML = allCats.map(cat => {
    const key = cat.toLowerCase();
    let imgUrl = getImageUrl(key);
    return `
      <div class="category-item" data-category="${cat}">
        <img class="category-image" src="${imgUrl}" alt="${cat}" loading="lazy">
        <span class="category-name">${cat}</span>
      </div>
    `;
  }).join('');
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

// ---------- LOAD DATA FROM GOOGLE SHEETS (fetch images from Sheet5) ----------
function loadData() {
  const baseUrl = 'https://opensheet.elk.sh/1FEpSYZlTrlp0BYPEcVCYISC0kgXpt_3Fcw5XAcjLOvs';
  
  Promise.all([
    fetch(`${baseUrl}/Sheet1`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet2`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet4`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet5`).then(res => res.json()).catch(() => { console.warn('Sheet5 not found or not published'); return []; })
  ]).then(([sheet1, sheet2, sheet4, sheet5]) => {
    // Process Sheet5 into imageMap
    if (sheet5 && sheet5.length) {
      sheet5.forEach(row => {
        let nameKey = null;
        let url = null;
        for (let [col, val] of Object.entries(row)) {
          if (col.toLowerCase() === 'name') nameKey = val;
          if (col.toLowerCase() === 'image_url') url = val;
        }
        if (nameKey && url && url.startsWith('http')) {
          imageMap[nameKey.toLowerCase()] = url;
        }
      });
      console.log('✅ Loaded custom images from Sheet5:', imageMap);
    } else {
      console.log('⚠️ Sheet5 missing or empty – using fallback images');
    }

    const processSheet = (items, startId, isOrganic) => {
      return (items || []).map((item, idx) => {
        let tags = item.Tags || '';
        if (!tags) {
          let nameWords = (item.Name || '').toLowerCase().split(' ');
          tags = nameWords.concat(item.Category ? [item.Category.toLowerCase()] : []).join(',');
        }
        return {
          id: startId + idx,
          name: item.Name || 'Fresh Item',
          price: Number(item.Price) || 0,
          discountPrice: item['Price-off'] ? Number(item['Price-off']) : 0,
          unit: item.Unit || 'unit',
          category: (item.Category || 'vegitable-fresh').trim().toLowerCase(),
          imageUrl: item.Emoji || '',
          showOnHomeRaw: item.ShowOnHome || `yes${idx+1}`,
          offer: (item.ShowOnHome || '').toLowerCase().startsWith('yes'),
          isOrganic: isOrganic,
          tags: tags.toLowerCase()
        };
      });
    };
    const fresh = processSheet(sheet1, 1, false);
    const organic = processSheet(sheet2, 100, true);
    const cut = processSheet(sheet4, 200, false);
    products = [...fresh, ...organic, ...cut];
    renderCategories();
    renderProducts();
  }).catch(err => {
    console.error('Sheet fetch error, using fallback data:', err);
    products = [
      { id:1, name:'Fresh Tomato', price:40, discountPrice:35, unit:'kg', category:'vegitable-fresh', showOnHomeRaw:'yes1', offer:true, isOrganic:false, tags:'tomato, fresh, vegetable' },
      { id:2, name:'Organic Apple', price:120, discountPrice:100, unit:'kg', category:'fruits-fresh', showOnHomeRaw:'yes2', offer:true, isOrganic:true, tags:'apple, organic, fruit' },
      { id:3, name:'Carrot', price:45, discountPrice:0, unit:'kg', category:'vegitable-fresh', showOnHomeRaw:'yes3', offer:false, isOrganic:false, tags:'carrot, root vegetable' },
      { id:4, name:'Broccoli', price:80, discountPrice:70, unit:'piece', category:'vegitable-fresh', showOnHomeRaw:'yes4', offer:true, isOrganic:true, tags:'broccoli, green vegetable' },
      { id:5, name:'Lady Finger (Okra)', price:55, discountPrice:50, unit:'kg', category:'vegitable-fresh', showOnHomeRaw:'yes5', offer:true, isOrganic:false, tags:'lady finger, okra, bhindi' },
      { id:6, name:'Milk (1L)', price:60, discountPrice:55, unit:'liter', category:'diary', showOnHomeRaw:'yes6', offer:true, isOrganic:false, tags:'milk, dairy' },
      { id:7, name:'Chicken Breast', price:250, discountPrice:230, unit:'kg', category:'meats', showOnHomeRaw:'yes7', offer:true, isOrganic:false, tags:'chicken, meat' },
      { id:8, name:'Basmati Rice', price:180, discountPrice:160, unit:'kg', category:'rice', showOnHomeRaw:'yes8', offer:true, isOrganic:false, tags:'rice, basmati' },
      { id:9, name:'Orange', price:90, discountPrice:80, unit:'kg', category:'fruits-fresh', showOnHomeRaw:'yes9', offer:true, isOrganic:true, tags:'orange, citrus' },
      { id:10, name:'Cucumber', price:35, discountPrice:0, unit:'kg', category:'vegitable-fresh', showOnHomeRaw:'yes10', offer:false, isOrganic:false, tags:'cucumber, salad' },
      { id:11, name:'Eggs (6 pcs)', price:45, discountPrice:42, unit:'pack', category:'diary', showOnHomeRaw:'yes11', offer:true, isOrganic:false, tags:'eggs, protein' },
      { id:12, name:'Fish Fillet', price:320, discountPrice:290, unit:'kg', category:'meats', showOnHomeRaw:'yes12', offer:true, isOrganic:false, tags:'fish, seafood' },
      { id:13, name:'Wheat Atta', price:220, discountPrice:200, unit:'kg', category:'rice', showOnHomeRaw:'yes13', offer:true, isOrganic:false, tags:'atta, wheat, flour' },
      { id:14, name:'Pomegranate', price:110, discountPrice:95, unit:'kg', category:'fruits-fresh', showOnHomeRaw:'yes14', offer:true, isOrganic:true, tags:'pomegranate, fruit' }
    ];
    renderCategories();
    renderProducts();
  });
}

// ----------------------------- DOMContentLoaded -----------------------------
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
  modalOverlay = document.getElementById('modalOverlay');
  custName = document.getElementById('custName');
  custPhone = document.getElementById('custPhone');
  custAddress = document.getElementById('custAddress');
  custLocation = document.getElementById('custLocation');
  mapFrame = document.getElementById('mapFrame');
  distanceSpan = document.getElementById('distanceText');
  deliveryChargeSpan = document.getElementById('deliveryCharge');
  finalTotalSpan = document.getElementById('finalTotal');
  deliveryWarningBox = document.getElementById('deliveryWarningBox');
  sendBtn = document.getElementById('sendWhatsAppBtn');
  orderSummaryDiv = document.getElementById('orderSummary');
  toastEl = document.getElementById('toast');
  categoriesModal = document.getElementById('categoriesModal');
  categoriesGrid = document.getElementById('categoriesGrid');
  arrowMoreBtn = document.getElementById('arrowMoreBtn');

  document.getElementById('cartButton').addEventListener('click', openCart);
  document.getElementById('closeCartBtn').addEventListener('click', closeCart);
  cartOverlay.addEventListener('click', closeCart);
  document.getElementById('orderBtn').addEventListener('click', openOrderModal);
  document.getElementById('getLocationBtn').addEventListener('click', getLocation);
  document.getElementById('cancelModalBtn').addEventListener('click', closeOrderModal);
  if (sendBtn) sendBtn.addEventListener('click', sendWhatsApp);
  arrowMoreBtn.addEventListener('click', openCategoriesModal);
  document.getElementById('closeCategoriesModal').addEventListener('click', closeCategoriesModal);
  categoriesModal.addEventListener('click', (e) => { if (e.target === categoriesModal) closeCategoriesModal(); });

  const noteInput = document.getElementById('custNote');
  [custName, custPhone, custAddress, noteInput].forEach(field => {
    if (field) field.addEventListener('input', saveFormToLocalStorage);
  });
  
  const mobileIcon = document.getElementById('mobileSearchIcon');
  const mobileRow = document.getElementById('mobileSearchRow');
  const innerArrow = document.getElementById('mobileSearchInnerIcon');
  
  if (mobileIcon && mobileRow) {
    mobileIcon.addEventListener('click', () => {
      mobileRow.classList.toggle('open');
    });
  }
  
  if (innerArrow && mobileRow) {
    innerArrow.addEventListener('click', () => {
      if (mobileRow.classList.contains('open')) {
        mobileRow.classList.remove('open');
      }
    });
  }
  
  // Vision Modal
  const visionModal = document.getElementById('visionModal');
  const visionLink = document.getElementById('visionLink');
  const closeVisionBtn = document.getElementById('closeVisionModal');
  
  if (visionLink && visionModal) {
    visionLink.addEventListener('click', (e) => {
      e.preventDefault();
      visionModal.classList.add('open');
    });
  }
  if (closeVisionBtn && visionModal) {
    closeVisionBtn.addEventListener('click', () => {
      visionModal.classList.remove('open');
    });
    visionModal.addEventListener('click', (e) => {
      if (e.target === visionModal) visionModal.classList.remove('open');
    });
  }
  
  initSearchListeners();
  loadData();
});