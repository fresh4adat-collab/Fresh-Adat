// ----------------------------- CONFIGURATION -----------------------------
const WHATSAPP_NUMBER = '919496840336';
const ADAT_LAT = 10.5530;
const ADAT_LON = 76.1668;
const MAX_DISTANCE_KM = 5;
const FREE_DELIVERY_THRESHOLD = 200;
const MAX_QTY_PER_PRODUCT = 4;
const ECO_BOX_CHARGE = 10;

const PENDING_ORDER_KEY = 'freshadat_pending_order';
const PENDING_BANNER_SEEN_KEY = 'pending_banner_seen';

let products = [];
let cart = {};
let selectedCat = 'All';
let searchTerm = '';
let selectedSuggestionProduct = null;

// DOM elements
let productsGrid, catRow, cartCountSpan, cartOverlay, cartPanel, cartItems, cartFooter, footerItems, footerTotal;
let toastEl;
let categoriesModal, categoriesGrid, arrowMoreBtn;
let desktopSearch, mobileSearch, desktopClearBtn, mobileClearBtn, desktopSuggestions, mobileSuggestions;
let imageMap = {};

// Sticky bar elements
let stickyBar, stickyCountSpan, stickySavingsSpan, stickyFreeBadge, stickyCartBtn, stickyToggleBtn, stickyDetailedDiv;
let stickyDetailedOpen = false;

// Address flow state
let customerData = {
  name: '',
  phone: '',
  location: { lat: null, lng: null, address: '' },
  house: '',
  area: '',
  landmark: '',
  addressType: 'Home',
  useEcoBox: false
};
let map, marker, circle, currentLocationValid = false;
let addressFlowModal, currentStep = 1;

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

// ========== HELPER FUNCTIONS ==========
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
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function updateCartCountUI() {
  const total = Object.values(cart).reduce((a, b) => a + b, 0);
  cartCountSpan.textContent = total;
}

function adjustQuantity(productId, delta) {
  const currentQty = cart[productId] || 0;
  const newQty = currentQty + delta;
  if (newQty <= 0) {
    delete cart[productId];
  } else if (newQty > MAX_QTY_PER_PRODUCT) {
    alert(`You can't order more than ${MAX_QTY_PER_PRODUCT} quantities of a single product in one order.`);
    return;
  } else {
    cart[productId] = newQty;
  }
  updateCartCountUI();
  renderProducts();
  if (cartPanel && cartPanel.classList.contains('open')) renderCart();
  updateStickyCartBar();
  if (delta > 0 && newQty <= MAX_QTY_PER_PRODUCT) showToast('Added to cart');
  else if (delta < 0) showToast('Removed');
  
  // Close PWA install banner when user adds product
  const installBanner = document.getElementById('installBanner');
  if (installBanner && installBanner.style.display === 'flex') {
    installBanner.style.display = 'none';
  }
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
  return str.replace(/[&<>]/g, m => (m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'));
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
    return `<div class="product-card">${imgHtml}<div class="product-info"><div class="product-name">${escapeHtml(p.name)}</div><div class="product-unit">${p.unit}</div>${priceHtml}<button class="add-button" data-id="${p.id}"><i class="fas fa-plus"></i> Add</button></div></div>`;
  } else {
    return `<div class="product-card">${imgHtml}<div class="product-info"><div class="product-name">${escapeHtml(p.name)}</div><div class="product-unit">${p.unit}</div>${priceHtml}<div class="square-qty-box"><button class="qty-square-btn" data-id="${p.id}" data-delta="-1"><i class="fas fa-minus"></i></button><span class="qty-square-value">${qty}</span><button class="qty-square-btn" data-id="${p.id}" data-delta="1"><i class="fas fa-plus"></i></button></div></div></div>`;
  }
}

function bindProductEvents(container = document) {
  container.querySelectorAll('.add-button').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', e => adjustQuantity(parseInt(newBtn.dataset.id), 1));
  });
  container.querySelectorAll('.qty-square-btn').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', e => adjustQuantity(parseInt(newBtn.dataset.id), parseInt(newBtn.dataset.delta)));
  });
}

// ========== HOMEPAGE LAYOUT (unchanged) ==========
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
  const slideshowHtml = `<div class="home-slideshow"><div class="slide active"><img src="${slide1Url}" alt="Fresh vegetables"></div><div class="slide"><img src="${slide2Url}" alt="Organic fruits"></div><div class="slide"><img src="${slide3Url}" alt="Leafy greens"></div><div class="slideshow-dots"></div></div>`;
  const categoryStripHtml = `<div class="category-strip"><div class="category-square" data-cat-value="vegitable-fresh"><img class="square-img" src="${getImageUrl('vegitable-fresh')}" alt="Fresh Veg"><span class="square-name">Fresh Veg</span></div><div class="category-square" data-cat-value="fruits-fresh"><img class="square-img" src="${getImageUrl('fruits-fresh')}" alt="Fresh Fruits"><span class="square-name">Fresh Fruits</span></div><div class="category-square" data-cat-value="diary"><img class="square-img" src="${getImageUrl('diary')}" alt="Dairy & Egg"><span class="square-name">Dairy & Egg</span></div><div class="category-square" data-cat-value="vegitable-fresh-leafs"><img class="square-img" src="${getImageUrl('vegitable-fresh-leafs')}" alt="Fresh Leafs"><span class="square-name">Fresh Leafs</span></div><div class="category-square" data-cat-value="meats"><img class="square-img" src="${getImageUrl('meats')}" alt="Meats"><span class="square-name">Meats</span></div><div class="category-square" data-cat-value="rice"><img class="square-img" src="${getImageUrl('rice')}" alt="Atta & Rice"><span class="square-name">Atta & Rice</span></div></div>`;
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
  bindProductEvents(carouselContainer);
}

function renderSuggestionBasedResults(selectedProduct) {
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
  bindProductEvents(productsGrid);
  if (sameCategoryProducts.length > 0) {
    const catCarousel = document.getElementById('suggestionCategoryCarousel');
    if (catCarousel) {
      let carouselHtml = '';
      sameCategoryProducts.forEach(p => { carouselHtml += createProductCard(p, true); });
      catCarousel.innerHTML = carouselHtml;
      bindProductEvents(catCarousel);
    }
  }
  if (relatedByTags.length > 0) {
    const tagCarousel = document.getElementById('suggestionTagCarousel');
    if (tagCarousel) {
      let carouselHtml = '';
      relatedByTags.forEach(p => { carouselHtml += createProductCard(p, true); });
      tagCarousel.innerHTML = carouselHtml;
      bindProductEvents(tagCarousel);
    }
  }
}

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
  bindProductEvents(productsGrid);
  if (similarByCategory.length > 0) {
    const catCarousel = document.getElementById('similarCategoryCarousel');
    if (catCarousel) {
      let carouselHtml = '';
      similarByCategory.forEach(p => { carouselHtml += createProductCard(p, true); });
      catCarousel.innerHTML = carouselHtml;
      bindProductEvents(catCarousel);
    }
  }
  if (similarByTag.length > 0) {
    const tagCarousel = document.getElementById('similarTagCarousel');
    if (tagCarousel) {
      let carouselHtml = '';
      similarByTag.forEach(p => { carouselHtml += createProductCard(p, true); });
      tagCarousel.innerHTML = carouselHtml;
      bindProductEvents(tagCarousel);
    }
  }
}

function renderFilteredGrid() {
  productsGrid.classList.remove('block');
  productsGrid.style.display = 'grid';
  let filtered = products.filter(p => {
    if (selectedCat === 'All') {
      if (searchTerm !== '') return productMatchesSearch(p, searchTerm);
      return p.showOnHomeRaw && p.showOnHomeRaw.toLowerCase().startsWith('yes');
    } else if (selectedCat === 'Offers') return p.offer === true;
    else if (selectedCat === 'Cut Vegetables') return isCutVegetable(p.category);
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
    bindProductEvents(productsGrid);
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
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  if (!ids.length) {
    cartItems.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-cart"></i><p>Cart empty</p></div>`;
    cartFooter.style.display = 'none';
    updateStickyCartBar();
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
    cartHtml += `<div class="cart-item"><div class="cart-item-emoji"><img src="${imgSrc}" alt="${p.name}"></div><div class="cart-item-info"><div class="cart-item-name">${escapeHtml(p.name)}</div><div class="cart-item-price-original">${originalPrice > effectivePrice ? `<span class="original-price">₹${originalPrice}</span>` : ''}<span class="discount-price">₹${effectivePrice}</span></div>${saved > 0 ? `<div class="cart-item-saved">You saved: ₹${saved}</div>` : ''}</div><div class="cart-item-qty"><button class="cqty-btn" data-id="${id}" data-delta="-1"><i class="fas fa-minus"></i></button><span>${qty}</span><button class="cqty-btn" data-id="${id}" data-delta="1"><i class="fas fa-plus"></i></button><button class="remove-btn" data-id="${id}" data-remove="all"><i class="fas fa-trash-alt"></i></button></div></div>`;
  });
  cartItems.innerHTML = cartHtml;
  footerItems.textContent = count;
  footerTotal.textContent = '₹' + total;
  const existingSavedRow = document.querySelector('.cart-total-saved');
  if (existingSavedRow) existingSavedRow.remove();
  if (totalSaved > 0) {
    const savedRow = document.createElement('div');
    savedRow.className = 'cart-total-saved';
    savedRow.innerHTML = `<span><i class="fas fa-tags"></i> Total Savings</span><span>₹${totalSaved}</span>`;
    cartFooter.insertBefore(savedRow, cartFooter.querySelector('.order-btn'));
  }
  cartFooter.style.display = 'block';
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
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  if (ids.length === 0) {
    container.innerHTML = '';
    return;
  }
  let detailedHtml = '';
  let totalItems = 0;
  let totalSavings = 0;
  ids.forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const effectivePrice = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    const originalPrice = p.price;
    const saved = (originalPrice - effectivePrice) * qty;
    totalItems += qty;
    totalSavings += saved;
    const imgSrc = getProductImageUrl(p);
    detailedHtml += `
      <div class="sticky-detailed-item" data-product-id="${p.id}">
        <img class="sticky-detailed-img" src="${imgSrc}" alt="${p.name}">
        <div class="sticky-detailed-info">
          <div class="sticky-detailed-name">${escapeHtml(p.name)}</div>
          <div class="sticky-detailed-unit">${p.unit}</div>
          <div class="sticky-detailed-prices">
            ${originalPrice > effectivePrice ? `<span class="sticky-detailed-original">₹${originalPrice}</span>` : ''}
            <span class="sticky-detailed-discount">₹${effectivePrice}</span>
            ${saved > 0 ? `<span class="sticky-detailed-saved">(save ₹${saved})</span>` : ''}
          </div>
        </div>
        <div class="sticky-detailed-qty">
          <button class="sticky-qty-btn" data-id="${p.id}" data-delta="-1">-</button>
          <span class="sticky-qty-value">${qty}</span>
          <button class="sticky-qty-btn" data-id="${p.id}" data-delta="1">+</button>
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
      const productId = parseInt(newBtn.dataset.id);
      const delta = parseInt(newBtn.dataset.delta);
      adjustQuantity(productId, delta);
    });
  });
}

function updateStickyCartBar() {
  if (isCartPanelOpen()) {
    if (stickyBar) stickyBar.style.display = 'none';
    return;
  }
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  const itemCount = ids.reduce((sum, id) => sum + cart[id], 0);
  if (itemCount === 0) {
    if (stickyBar) stickyBar.style.display = 'none';
    return;
  }
  let totalSaved = 0;
  let subtotal = 0;
  ids.forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const effectivePrice = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    const saved = (p.price - effectivePrice) * qty;
    totalSaved += saved;
    subtotal += effectivePrice * qty;
  });
  const freeDelivery = subtotal > FREE_DELIVERY_THRESHOLD;
  if (stickyCountSpan) stickyCountSpan.textContent = itemCount;
  if (stickySavingsSpan) stickySavingsSpan.textContent = `Saved: ₹${totalSaved}`;
  if (stickyFreeBadge) stickyFreeBadge.style.display = freeDelivery ? 'inline-block' : 'none';
  if (stickyDetailedOpen) renderStickyDetailedList();
  if (stickyBar) stickyBar.style.display = 'block';
}

function openCart() {
  pushPageState('cart');
  cartOverlay.classList.add('open');
  cartPanel.classList.add('open');
  renderCart();
  if (stickyBar) stickyBar.style.display = 'none';
}

function closeCart() {
  cartOverlay.classList.remove('open');
  cartPanel.classList.remove('open');
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  if (ids.length > 0 && stickyBar) {
    stickyBar.style.display = 'block';
    updateStickyCartBar();
  } else if (stickyBar) {
    stickyBar.style.display = 'none';
  }
}

// ========== ADDRESS FLOW (ENHANCED) ==========
function getCartSubtotal() {
  let subtotal = 0;
  Object.keys(cart).forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const price = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    subtotal += price * qty;
  });
  return subtotal;
}

function getCartTotalSavings() {
  let savings = 0;
  Object.keys(cart).forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const originalPrice = p.price;
    const effectivePrice = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    savings += (originalPrice - effectivePrice) * qty;
  });
  return savings;
}

// Helper: scroll to Confirm Location button smoothly
function scrollToConfirmButton() {
  const btn = document.getElementById('confirmLocationBtn');
  if (btn && !btn.disabled) {
    setTimeout(() => {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }
}

function initMap() {
  if (!document.getElementById('locationMap')) return;
  if (!document.querySelector('link[href*="leaflet.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => createMap();
    document.head.appendChild(script);
  } else {
    createMap();
  }
}

function createMap() {
  map = L.map('locationMap').setView([ADAT_LAT, ADAT_LON], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> & CartoDB'
  }).addTo(map);
  const adatCenter = [ADAT_LAT, ADAT_LON];
  circle = L.circle(adatCenter, {
    color: '#f47c2b',
    weight: 2,
    fillColor: '#f47c2b',
    fillOpacity: 0.1,
    radius: MAX_DISTANCE_KM * 1000
  }).addTo(map);
  marker = L.marker(adatCenter, { draggable: true }).addTo(map);
  marker.on('dragend', async function(e) {
    const pos = marker.getLatLng();
    const distance = getDistanceKm(ADAT_LAT, ADAT_LON, pos.lat, pos.lng);
    if (distance <= MAX_DISTANCE_KM) {
      currentLocationValid = true;
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        const address = data.display_name || `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        document.getElementById('selectedLocationDisplay').innerHTML = `<strong>Selected location:</strong> ${address}`;
        customerData.location = { lat: pos.lat, lng: pos.lng, address: address };
        document.getElementById('confirmLocationBtn').disabled = false;
        scrollToConfirmButton();
      } catch (err) {
        document.getElementById('selectedLocationDisplay').innerHTML = `<strong>Selected location:</strong> ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        customerData.location = { lat: pos.lat, lng: pos.lng, address: `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` };
        document.getElementById('confirmLocationBtn').disabled = false;
        scrollToConfirmButton();
      }
    } else {
      currentLocationValid = false;
      showToast("❌ Outside delivery area (beyond 5 km). Drag the marker inside the circle.");
      document.getElementById('selectedLocationDisplay').innerHTML = '';
      document.getElementById('confirmLocationBtn').disabled = true;
    }
  });
  attemptAutoLocation();
}

function attemptAutoLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
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
        }
      },
      (error) => {
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const distance = getDistanceKm(ADAT_LAT, ADAT_LON, userLat, userLng);
        if (distance <= MAX_DISTANCE_KM) {
          map.setView([userLat, userLng], 15);
          marker.setLatLng([userLat, userLng]);
          marker.fire('dragend');
        } else {
          showToast("❌ Your location is outside our 5 km delivery area. Please drag the marker inside the circle.");
        }
      },
      (error) => {
        showToast("Unable to get your location. Please drag the marker manually.");
      }
    );
  } else {
    showToast("Geolocation is not supported by your browser.");
  }
}

function showStep(step) {
  document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');
  document.getElementById(`step${step}Content`).style.display = 'block';
  document.querySelectorAll('.step').forEach((el, idx) => {
    if (idx + 1 === step) el.classList.add('active');
    else el.classList.remove('active');
  });
  currentStep = step;
  if (step === 4) {
    const fullAddr = `${customerData.house}, ${customerData.area}${customerData.landmark ? ', ' + customerData.landmark : ''}, ${customerData.location.address}`;
    document.getElementById('confirmAddress').innerHTML = `${fullAddr}<br>Type: ${customerData.addressType}`;
    document.getElementById('confirmCustomer').innerHTML = `${customerData.name}<br>📞 ${customerData.phone}`;
    let subtotal = getCartSubtotal();
    let ecoCharge = customerData.useEcoBox ? ECO_BOX_CHARGE : 0;
    let total = subtotal + ecoCharge;
    let summaryHtml = '';
    Object.keys(cart).forEach(id => {
      const p = products.find(x => x.id == id);
      const qty = cart[id];
      const price = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
      summaryHtml += `<div>${p.name} ×${qty} = ₹${price * qty}</div>`;
    });
    document.getElementById('confirmOrderSummary').innerHTML = summaryHtml;
    document.getElementById('ecoBoxChargeLine').style.display = customerData.useEcoBox ? 'block' : 'none';
    document.getElementById('confirmFinalTotal').innerHTML = `Total: ₹${total}`;
  }
}

function loadSavedCustomerData() {
  const saved = localStorage.getItem('freshAdat_customer');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data.name) customerData.name = data.name;
      if (data.phone) customerData.phone = data.phone;
      if (data.address && data.location) {
        customerData.house = data.house || '';
        customerData.area = data.area || '';
        customerData.landmark = data.landmark || '';
        customerData.addressType = data.addressType || 'Home';
        customerData.location = data.location || { lat: ADAT_LAT, lng: ADAT_LON, address: 'Adat, Kerala, India' };
        customerData.useEcoBox = data.useEcoBox || false;
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
    useEcoBox: customerData.useEcoBox
  };
  localStorage.setItem('freshAdat_customer', JSON.stringify(toSave));
}

// Enhanced saved summary with order details and map link
function showSavedSummary() {
  document.getElementById('stepIndicator').style.display = 'none';
  document.getElementById('multiStepContent').style.display = 'none';
  document.getElementById('savedSummaryCard').style.display = 'block';
  
  const fullAddr = `${customerData.house}, ${customerData.area}${customerData.landmark ? ', ' + customerData.landmark : ''}, ${customerData.location.address}`;
  const mapLink = `https://maps.google.com/?q=${customerData.location.lat},${customerData.location.lng}`;
  
  // Build order summary HTML
  const subtotal = getCartSubtotal();
  const totalSavings = getCartTotalSavings();
  const ecoCharge = customerData.useEcoBox ? ECO_BOX_CHARGE : 0;
  const total = subtotal + ecoCharge;
  
  let itemsHtml = '';
  Object.keys(cart).forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const price = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    itemsHtml += `<div class="order-summary-item">${p.name} ×${qty} = ₹${price * qty}</div>`;
  });
  
  const summaryHtml = `
    <div class="saved-address-section">
      <h4><i class="fas fa-map-marker-alt"></i> Delivery Address</h4>
      <p><strong>📍 Address:</strong> ${escapeHtml(fullAddr)}</p>
      <p><strong>🏷️ Type:</strong> ${customerData.addressType}</p>
      <p><strong>🗺️ <a href="${mapLink}" target="_blank">View on Google Maps</a></strong></p>
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
        ${customerData.useEcoBox ? `<div>Eco-box: +₹${ECO_BOX_CHARGE}</div>` : ''}
        <div class="total"><strong>Total: ₹${total}</strong></div>
      </div>
    </div>
    <div class="eco-message-summary">
      ✅ Delivered in reusable eco‑box<br>♻️ Please return the empty box after delivery
    </div>
  `;
  document.getElementById('savedSummaryDetails').innerHTML = summaryHtml;
}

function startMultiStepFlow() {
  document.getElementById('stepIndicator').style.display = 'flex';
  document.getElementById('multiStepContent').style.display = 'block';
  document.getElementById('savedSummaryCard').style.display = 'none';
  currentStep = 1;
  showStep(1);
  if (customerData.house) {
    document.getElementById('addrHouse').value = customerData.house;
    document.getElementById('addrArea').value = customerData.area;
    document.getElementById('addrLandmark').value = customerData.landmark;
    const radio = document.querySelector(`input[name="addrType"][value="${customerData.addressType}"]`);
    if (radio) radio.checked = true;
    document.getElementById('ecoBoxCheckbox').checked = customerData.useEcoBox;
  }
  if (customerData.name) {
    document.getElementById('custFullName').value = customerData.name;
    document.getElementById('custPhoneNumber').value = customerData.phone;
    document.getElementById('savedAddressPreview').innerHTML = `<strong>Saved address:</strong> ${customerData.house}, ${customerData.area}`;
  } else {
    document.getElementById('savedAddressPreview').innerHTML = '';
  }
  if (!map) initMap();
}

function openAddressFlow() {
  if (Object.keys(cart).length === 0) {
    showToast("Cart is empty");
    return;
  }
  closeCart();
  loadSavedCustomerData();
  addressFlowModal.style.display = 'flex';
  const hasSavedData = customerData.name && customerData.phone && customerData.house && customerData.location.lat;
  if (hasSavedData) {

  const useSaved = confirm(
    `Use saved delivery address for ${customerData.name}?`
  );

  if (useSaved) {
    sendFinalWhatsApp();
    return;
  } else {
    startMultiStepFlow();
  }

} else {
  startMultiStepFlow();
}
}

function closeAddressFlow() {
  addressFlowModal.style.display = 'none';
}

function handleBack() {
  if (document.getElementById('savedSummaryCard').style.display === 'block') {
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
  sendFinalWhatsApp();
}

function sendFinalWhatsApp() {
  saveCustomerData();
  const subtotal = getCartSubtotal();
  const ecoCharge = customerData.useEcoBox ? ECO_BOX_CHARGE : 0;
  const total = subtotal + ecoCharge;
  const fullAddress = `${customerData.house}, ${customerData.area}${customerData.landmark ? ', ' + customerData.landmark : ''}, ${customerData.location.address}`;
  const mapLink = `https://maps.google.com/?q=${customerData.location.lat},${customerData.location.lng}`;
  
  let itemsList = '';
  Object.keys(cart).forEach(id => {
    const p = products.find(x => x.id == id);
    const qty = cart[id];
    const price = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
    itemsList += `  🛒 ${p.name} x ${qty} ${p.unit} = ₹${price * qty}\n`;
  });
  const ecoLine = customerData.useEcoBox ? `♻️ Eco-box charge: ₹${ECO_BOX_CHARGE}\n` : '';
  const orderId = 'ORD' + Date.now().toString().slice(-6);
  const msg = `🌿 *FRESH ADAT ORDER* 🌿\n━━━━━━━━━━━━━━━━━━\n🆔 Order ID: ${orderId}\n👤 Customer: ${customerData.name}\n📞 Phone: ${customerData.phone}\n📍 Address: ${fullAddress}\n🏷️ Type: ${customerData.addressType}\n🗺️ Map: ${mapLink}\n\n🛍️ *Items:*\n${itemsList}${ecoLine}💰 Subtotal: ₹${subtotal}\n💵 Total: ₹${total}\n\n✅ Delivered in reusable eco‑box\n♻️ Please return the empty box after delivery\n📝 Note: Thank you for ordering with Fresh Adat!`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  cart = {};
  updateCartCountUI();
  renderProducts();
  updateStickyCartBar();
  closeAddressFlow();
  showToast('✅ Order sent! We will process it shortly.');
}

function initAddressFlow() {
  addressFlowModal = document.getElementById('addressFlowModal');
  if (!addressFlowModal) return;
  document.getElementById('closeAddressFlow').addEventListener('click', closeAddressFlow);
  document.getElementById('backArrowBtn').addEventListener('click', handleBack);
  window.addEventListener('click', (e) => {
    if (e.target === addressFlowModal) closeAddressFlow();
  });
  document.getElementById('confirmLocationBtn').addEventListener('click', () => {
    if (currentLocationValid) {
      showStep(2);
    } else {
      showToast('Please select a location within 5 km delivery area.');
    }
  });
  document.getElementById('nextToPersonalBtn').addEventListener('click', () => {
    customerData.house = document.getElementById('addrHouse').value.trim();
    if (!customerData.house) {
      showToast('Please enter house/flat/floor number');
      return;
    }
    customerData.area = document.getElementById('addrArea').value.trim();
    customerData.landmark = document.getElementById('addrLandmark').value.trim();
    const selectedType = document.querySelector('input[name="addrType"]:checked');
    if (selectedType) customerData.addressType = selectedType.value;
    customerData.useEcoBox = document.getElementById('ecoBoxCheckbox').checked;
    showStep(3);
  });
  document.getElementById('nextToConfirmBtn').addEventListener('click', () => {
    const name = document.getElementById('custFullName').value.trim();
    const phone = document.getElementById('custPhoneNumber').value.trim();
    if (!name || !phone) {
      showToast('Please enter your full name and phone number');
      return;
    }
    customerData.name = name;
    customerData.phone = phone;
    showStep(4);
  });
  document.getElementById('sendWhatsAppFinalBtn').addEventListener('click', sendFinalWhatsApp);
  document.getElementById('editAddressBtn').addEventListener('click', () => {
    startMultiStepFlow();
  });
  document.getElementById('sendFromSummaryBtn').addEventListener('click', sendOrderFromSummary);
  document.getElementById('useMyLocationBtn').addEventListener('click', useCurrentLocation);
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
  Promise.all([
    fetch(`${baseUrl}/Sheet1`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet2`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet4`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet5`).then(res => res.json()).catch(() => { console.warn('Sheet5 not found'); return []; })
  ]).then(([sheet1, sheet2, sheet4, sheet5]) => {
    if (sheet5 && sheet5.length) {
      sheet5.forEach(row => {
        let nameKey = null, url = null;
        for (let [col, val] of Object.entries(row)) {
          if (col.toLowerCase() === 'name') nameKey = val;
          if (col.toLowerCase() === 'image_url') url = val;
        }
        if (nameKey && url && url.startsWith('http')) imageMap[nameKey.toLowerCase()] = url;
      });
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
    updateStickyCartBar();
  }).catch(err => {
    console.error("Sheet fetch error, using fallback data:", err);
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
  
  initSearchListeners();
  initAddressFlow();
  loadData();

  // PWA install banner
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
});