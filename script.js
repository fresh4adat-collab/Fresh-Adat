function isRunningAsApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}
// ----------------------------- CONFIGURATION -----------------------------
const WHATSAPP_NUMBER = '919496840336';
const ADAT_LAT = 10.5530;
const ADAT_LON = 76.1668;
const MAX_DISTANCE_KM = 5;
const FREE_DELIVERY_THRESHOLD = 200;
const MAX_QTY_PER_PRODUCT = 4;

const PENDING_ORDER_KEY = 'freshadat_pending_order';
const PENDING_BANNER_SEEN_KEY = 'pending_banner_seen';

let products = [];
let cart = {};
let selectedCat = 'All';
let searchTerm = '';
let selectedSuggestionProduct = null;

// DOM elements
let productsGrid, catRow, cartCountSpan, cartOverlay, cartPanel, cartItems, cartFooter, footerItems, footerTotal;
let modalOverlay, custName, custPhone, custAddress, custLocation, mapFrame, distanceSpan, deliveryChargeSpan, finalTotalSpan, deliveryWarningBox, sendBtn, orderSummaryDiv;
let toastEl;
let categoriesModal, categoriesGrid, arrowMoreBtn;
let desktopSearch, mobileSearch, desktopClearBtn, mobileClearBtn, desktopSuggestions, mobileSuggestions;
let imageMap = {};

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

function getImageUrl(key) {
  const lowerKey = key.toLowerCase();
  if (imageMap[lowerKey]) return imageMap[lowerKey];
  if (FALLBACK_IMAGES[lowerKey]) return FALLBACK_IMAGES[lowerKey];
  return `https://via.placeholder.com/90?text=${encodeURIComponent(key)}`;
}

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
  if (delta > 0 && newQty <= MAX_QTY_PER_PRODUCT) showToast('Added to cart');
  else if (delta < 0) showToast('Removed');
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

// ========== HOMEPAGE LAYOUT ==========
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

        // Scroll to top smoothly
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });

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

  if (homeCarouselSection) {
    homeCarouselSection.style.display = 'none';
  }

  productsGrid.classList.add('block');
  productsGrid.style.display = 'block';

  // Related products using tags
  const matchedOthers = products.filter(p =>
    productMatchesByTagSubstring(selectedProduct, p)
  );

  // Related by same category
  const sameCategoryProducts = products.filter(p =>
    p.category === selectedProduct.category &&
    p.id !== selectedProduct.id
  );

  // Related by tags
  const relatedByTags = products.filter(p => {

    if (p.id === selectedProduct.id) return false;

    if (p.category === selectedProduct.category) return false;

    const selectedTags = (selectedProduct.tags || '')
      .toLowerCase()
      .split(',')
      .map(t => t.trim());

    const productTags = (p.tags || '')
      .toLowerCase()
      .split(',')
      .map(t => t.trim());

    return selectedTags.some(tag => productTags.includes(tag));

  });

  let html = `
    <div class="search-results-highlight">

      <h3 style="
        font-family: 'Playfair Display', serif;
        color: var(--green);
        margin-bottom: 18px;
        display: flex;
        align-items: center;
        gap: 8px;
      ">
        <i class="fas fa-leaf" style="color: var(--orange);"></i>

        Products related to "${escapeHtml(selectedProduct.name)}"
      </h3>

      <div style="
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 14px;
      ">
  `;

  // Main selected product
  html += createProductCard(selectedProduct, true);

  // Related products
  matchedOthers.forEach(p => {
    html += createProductCard(p, true);
  });

  html += `</div></div>`;

  // SAME CATEGORY CAROUSEL
  if (sameCategoryProducts.length > 0) {

    html += `
      <div class="similar-products-section" style="margin-top: 28px;">

        <div class="carousel-header">
          <h3>
            <i class="fas fa-tags"></i>
            More from ${selectedProduct.category.replace(/-/g, ' ')}
          </h3>

          <span class="carousel-hint">
            <i class="fas fa-arrow-left"></i>
            Swipe to explore
            <i class="fas fa-arrow-right"></i>
          </span>
        </div>

        <div class="horizontal-scroll-wrapper"
             id="suggestionCategoryCarousel">
        </div>

      </div>
    `;
  }

  // RELATED TAGS CAROUSEL
  if (relatedByTags.length > 0) {

    html += `
      <div class="related-by-tags-section" style="margin-top: 28px;">

        <div class="carousel-header">

          <h3>
            <i class="fas fa-link"></i>
            Related products
          </h3>

          <span class="carousel-hint">
            <i class="fas fa-arrow-left"></i>
            Swipe to explore
            <i class="fas fa-arrow-right"></i>
          </span>

        </div>

        <div class="horizontal-scroll-wrapper"
             id="suggestionTagCarousel">
        </div>

      </div>
    `;
  }

  productsGrid.innerHTML = html;

  bindProductEvents(productsGrid);

  // Render category carousel
  if (sameCategoryProducts.length > 0) {

    const catCarousel = document.getElementById('suggestionCategoryCarousel');

    if (catCarousel) {

      let carouselHtml = '';

      sameCategoryProducts.forEach(p => {
        carouselHtml += createProductCard(p, true);
      });

      catCarousel.innerHTML = carouselHtml;

      bindProductEvents(catCarousel);
    }
  }

  // Render tag carousel
  if (relatedByTags.length > 0) {

    const tagCarousel = document.getElementById('suggestionTagCarousel');

    if (tagCarousel) {

      let carouselHtml = '';

      relatedByTags.forEach(p => {
        carouselHtml += createProductCard(p, true);
      });

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
  
  let html = `<div class="search-results-highlight">
    <h3 style="font-family: 'Playfair Display', serif; color: var(--green); margin-bottom: 18px; display: flex; align-items: center; gap: 8px;">
      <i class="fas fa-search" style="color: var(--orange);"></i> Search Results (${matched.length})
    </h3>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;">
  `;
  matched.forEach(p => { html += createProductCard(p, true); });
  html += `</div></div>`;
  
  const primaryProduct = matched[0];
  const primaryCategory = primaryProduct.category;
  const shownIds = new Set(matched.map(p => p.id));
  
  const similarByCategory = products.filter(p => 
    p.category === primaryCategory && !shownIds.has(p.id)
  );
  
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
    html += `<div class="similar-products-section" style="margin-top: 28px;">
      <div class="carousel-header">
        <h3><i class="fas fa-tags"></i> More from ${primaryCategory.replace(/-/g, ' ')}</h3>
        <span class="carousel-hint"><i class="fas fa-arrow-left"></i> Swipe to explore <i class="fas fa-arrow-right"></i></span>
      </div>
      <div class="horizontal-scroll-wrapper" id="similarCategoryCarousel"></div>
    </div>`;
  }
  
  if (similarByTag.length > 0) {
    html += `<div class="related-by-tags-section" style="margin-top: 28px;">
      <div class="carousel-header">
        <h3><i class="fas fa-link"></i> Related by tags</h3>
        <span class="carousel-hint"><i class="fas fa-arrow-left"></i> Swipe to explore <i class="fas fa-arrow-right"></i></span>
      </div>
      <div class="horizontal-scroll-wrapper" id="similarTagCarousel"></div>
    </div>`;
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

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

});
  });
}

// Search suggestions
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
  const inputEl = isMobile ? mobileSearch : desktopSearch;
  const suggestionsEl = isMobile ? mobileSuggestions : desktopSuggestions;
  if (value.length >= 2) showSuggestions(inputEl, suggestionsEl, value, isMobile);
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

// Cart rendering
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
      showToast('Removed');
    });
  });
}

function openCart() {
  pushPageState('cart');

  cartOverlay.classList.add('open');
  cartPanel.classList.add('open');

  renderCart();
}
function closeCart() { cartOverlay.classList.remove('open'); cartPanel.classList.remove('open'); }

// Delivery & free shipping
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
   if (currentDistance <= MAX_DISTANCE_KM) {
  delivery = currentDistance <= 2 ? 10 : 20;
} else {
  delivery = 0;
}
    deliveryChargeSpan.innerText = delivery;
    finalTotalSpan.innerText = subtotal + delivery;
  if (currentDistance > MAX_DISTANCE_KM) {

  deliveryWarningBox.style.display = "flex";

  sendBtn.disabled = true;

} else {

  deliveryWarningBox.style.display = "none";

  sendBtn.disabled = false;

}
    renderOrderSummary();
  }, () => showToast("Location permission denied"));
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
    html += `<div class="summary-item"><span>${escapeHtml(p.name)} x${qty}</span><span>₹${sub} ${saved > 0 ? `<span class="saved-badge">(save ₹${saved})</span>` : ''}</span></div>`;
  });
  orderSummaryDiv.innerHTML = html || '<div>No items</div>';
  distanceSpan.innerText = currentDistance ? currentDistance.toFixed(2) + " km" : "0 km";
  let delivery = 0;
  if (subtotal > FREE_DELIVERY_THRESHOLD) {
    delivery = 0;
  } else if (currentDistance && currentDistance <= MAX_DISTANCE_KM) {
    delivery = currentDistance <= 2 ? 10 : 20;
  } else {
    delivery = 0;
  }
  deliveryChargeSpan.innerText = delivery;
  finalTotalSpan.innerText = subtotal + delivery;
  if ((currentDistance > MAX_DISTANCE_KM) && subtotal <= FREE_DELIVERY_THRESHOLD) {
    deliveryWarningBox.style.display = "flex";
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
  pushPageState('order');
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

// ========== PENDING ORDER & WHATSAPP FLOW ==========
function createPendingOrder() {
  const order = {
    id: 'pending_' + Date.now(),
    createdAt: Date.now(),
    items: Object.entries(cart).map(([id, qty]) => {
      const p = products.find(x => x.id == id);
      return { id, name: p.name, qty, price: p.discountPrice || p.price };
    }),
    total: getCartSubtotal(),
    customer: {
      name: custName.value.trim(),
      phone: custPhone.value.trim(),
      address: custAddress.value.trim(),
      location: custLocation.value.trim()
    }
  };
  localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(order));
  return order;
}

function clearPendingOrder() {
  localStorage.removeItem(PENDING_ORDER_KEY);
}

function showPendingOrderBanner() {
  if (document.getElementById('pendingOrderBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'pendingOrderBanner';
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    right: 20px;
    background: white;
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    padding: 16px;
    z-index: 10001;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    border-left: 5px solid #25D366;
  `;
  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <i class="fab fa-whatsapp" style="font-size: 24px; color: #25D366;"></i>
      <span>Did you complete your order on WhatsApp?</span>
    </div>
    <div style="display: flex; gap: 12px;">
      <button id="confirmOrderBtn" style="background: #25D366; color: white; border: none; padding: 8px 20px; border-radius: 40px; cursor: pointer;">Yes, placed</button>
      <button id="dismissBannerBtn" style="background: #f0f0f0; border: none; padding: 8px 20px; border-radius: 40px; cursor: pointer;">No, keep editing</button>
    </div>
  `;
  document.body.appendChild(banner);
  
  document.getElementById('confirmOrderBtn').onclick = () => {
    cart = {};
    updateCartCountUI();
    renderProducts();
    if (cartPanel.classList.contains('open')) renderCart();
    clearPendingOrder();
    banner.remove();
    showToast('✅ Order confirmed! We will process it shortly.');
  };
  
  document.getElementById('dismissBannerBtn').onclick = () => {
    banner.remove();
    localStorage.setItem(PENDING_BANNER_SEEN_KEY, 'true');
  };
}

function sendWhatsAppNew() {
  const subtotal = getCartSubtotal();
  if (currentDistance > MAX_DISTANCE_KM && subtotal <= FREE_DELIVERY_THRESHOLD) {
    showToast("❌ Delivery not available beyond 5 km");
    return;
  }
  const name = custName.value.trim();
  const phone = custPhone.value.trim();
  const address = custAddress.value.trim();
  const locationLink = custLocation.value.trim();
  if (!name || !phone || !address || !locationLink) {
    showToast("Please fill all fields and get location");
    return;
  }
  saveFormToLocalStorage();
  createPendingOrder();
  
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
  closeOrderModal();
  
  const visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      document.removeEventListener('visibilitychange', visibilityHandler);
      const pendingOrder = localStorage.getItem(PENDING_ORDER_KEY);
      const bannerShown = localStorage.getItem(PENDING_BANNER_SEEN_KEY);
      if (pendingOrder && !bannerShown) {
        showPendingOrderBanner();
      }
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

// Categories Modal
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

// Load data from Google Sheets
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
  });
}

// ========== MOBILE BACK BUTTON NAVIGATION ==========

// Add one initial history state
window.addEventListener('load', () => {
  history.replaceState({ page: 'home' }, '', location.href);
});

function resetToHome() {

  // Close cart
  closeCart();

  // Close order modal
  closeOrderModal();

  // Close categories modal
  closeCategoriesModal();

  // Close vision modal
  const visionModal = document.getElementById('visionModal');
  if (visionModal) {
    visionModal.classList.remove('open');
  }

  // Reset category + search
  selectedCat = 'All';
  searchTerm = '';
  selectedSuggestionProduct = null;

  // Clear desktop search
  if (desktopSearch) {
    desktopSearch.value = '';
  }

  // Clear mobile search
  if (mobileSearch) {
    mobileSearch.value = '';
  }

  // Hide suggestions
  if (desktopSuggestions) {
    desktopSuggestions.classList.remove('active');
  }

  if (mobileSuggestions) {
    mobileSuggestions.classList.remove('active');
  }

  updateClearButtons();

  // Re-render homepage
  renderCategories();
  renderProducts();
}

// Whenever user opens something important,
// push a history state

function pushPageState(pageName) {
  history.pushState({ page: pageName }, '', '#'+pageName);
}

// Handle browser/mobile back button
window.addEventListener('popstate', (event) => {

  // Always go back to home UI
  resetToHome();

});

// Ensure we always have at least one "home" state to go back to
// This prevents the app from closing when back is pressed
if (window.history.length <= 1) {
  // Push a dummy state that represents the home view
  history.pushState({ home: true }, '', location.href);
}

window.addEventListener('popstate', function(event) {
  // Always reset to home view
  resetToHome();
  // Push a fresh home state again so next back press also goes to home (not close)
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
  if (sendBtn) sendBtn.addEventListener('click', sendWhatsAppNew);
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
  
  const visionModal = document.getElementById('visionModal');
  const visionLink = document.getElementById('visionLink');
  const closeVisionBtn = document.getElementById('closeVisionModal');
  if (visionLink && visionModal) {
    visionLink.addEventListener('click', (e) => { e.preventDefault();pushPageState('vision');
visionModal.classList.add('open');  });
  }
  if (closeVisionBtn && visionModal) {
    closeVisionBtn.addEventListener('click', () => visionModal.classList.remove('open'));
    visionModal.addEventListener('click', (e) => { if (e.target === visionModal) visionModal.classList.remove('open'); });
  }
  
  initSearchListeners();
  loadData();

  // ========== PWA INSTALL (inside DOMContentLoaded) ==========
  let deferredPrompt;
  const installBanner = document.getElementById('installBanner');
  const installBtn = document.getElementById('installAppBtn');
  const closeInstallBanner = document.getElementById('closeInstallBanner');

 window.addEventListener('beforeinstallprompt', (e) => {

  // If already opened as installed app, don't show banner
  if (isRunningAsApp()) {
    return;
  }
  // Hide install banner if already installed app
if (isRunningAsApp()) {
  if (installBanner) {
    installBanner.style.display = 'none';
  }
}
  console.log('📲 beforeinstallprompt fired');

  e.preventDefault();

  deferredPrompt = e;

  if (installBanner) {
    installBanner.style.display = 'flex';
  }
});

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        console.log('No deferredPrompt – maybe already installed');
        alert('Click the three dots ⋮ and select "Install app"');
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install: ${outcome}`);
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
    console.log('✅ App installed successfully');
    if (installBanner) installBanner.style.display = 'none';
    deferredPrompt = null;
  });
});