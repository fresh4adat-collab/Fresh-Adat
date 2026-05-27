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
let offers = [];
let cart = {};
let selectedCat = 'All';
let searchTerm = '';
let selectedSuggestionProduct = null;

let productsGrid, catRow, cartCountSpan, cartOverlay, cartPanel, cartItems, cartFooter, footerItems, footerTotal;
let toastEl;
let categoriesModal, categoriesGrid, arrowMoreBtn;
let desktopSearch, mobileSearch, desktopClearBtn, mobileClearBtn, desktopSuggestions, mobileSuggestions;
let imageMap = {};

let stickyBar, stickyCountSpan, stickySavingsSpan, stickyFreeBadge, stickyCartBtn, stickyToggleBtn, stickyDetailedDiv;
let stickyDetailedOpen = false;

let customerData = {
  name: '', phone: '', location: { lat: null, lng: null, address: '' },
  house: '', area: '', landmark: '', addressType: 'Home', useEcoBox: false
};
let map, marker, circle, currentLocationValid = false;
let addressFlowModal, currentStep = 1;

let currentOffer = null;
let offerTimerInterval = null;
let homeTimerInterval = null;

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
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function updateCartCountUI() {
  const total = Object.values(cart).reduce((a, b) => a + b, 0);
  if (cartCountSpan) cartCountSpan.textContent = total;
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

// ========== OFFERS TEASER (HOME PAGE ONLY) ==========
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
        tags: ''
      };
      html += createProductCard(fakeProduct, true);
    });
    html += `</div>`;
  }

  html += `</div>`;
  productsGrid.innerHTML = html;
  bindProductEvents(productsGrid);

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

// ========== OFFER MODAL FUNCTIONS ==========
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
    adjustQuantity(currentOffer.productId, 1);
    closeOfferModal();
  } else {
    showToast("Product not found for this offer");
  }
}

// ========== HOMEPAGE LAYOUT ==========
function renderCustomHomeLayout() {
  const teaserSection = document.getElementById('offersTeaserSection');
  if (teaserSection) teaserSection.style.display = 'none';
  
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
  renderOffersTeaser();
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
    document.body.classList.remove('cart-not-empty');
  } else {
    document.body.classList.add('cart-not-empty');
    if (stickyBar) stickyBar.style.display = 'block';
  }
  
  if (itemCount === 0) return;
  
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

// ========== ADDRESS FLOW ==========
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

function scrollToConfirmButton() {
  const btn = document.getElementById('confirmLocationBtn');
  if (btn && !btn.disabled) {
    setTimeout(() => {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }
}

// --- MAP initialization with optional saved location ---
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
    fillOpacity: 0.1,
    radius: MAX_DISTANCE_KM * 1000
  }).addTo(map);
  marker = L.marker([centerLat, centerLng], { draggable: true }).addTo(map);
  marker.on('dragend', async function(e) {
    const pos = marker.getLatLng();
    const distance = getDistanceKm(ADAT_LAT, ADAT_LON, pos.lat, pos.lng);
    if (distance <= MAX_DISTANCE_KM) {
      currentLocationValid = true;
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        const address = data.display_name || `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        const displayDiv = document.getElementById('selectedLocationDisplay');
        if (displayDiv) displayDiv.innerHTML = `<strong>Selected location:</strong> ${address}`;
        customerData.location = { lat: pos.lat, lng: pos.lng, address: address };
        const confirmBtn = document.getElementById('confirmLocationBtn');
        if (confirmBtn) confirmBtn.disabled = false;
        scrollToConfirmButton();
      } catch (err) {
        const displayDiv = document.getElementById('selectedLocationDisplay');
        if (displayDiv) displayDiv.innerHTML = `<strong>Selected location:</strong> ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        customerData.location = { lat: pos.lat, lng: pos.lng, address: `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` };
        const confirmBtn = document.getElementById('confirmLocationBtn');
        if (confirmBtn) confirmBtn.disabled = false;
        scrollToConfirmButton();
      }
    } else {
      currentLocationValid = false;
      showToast("❌ Outside delivery area (beyond 5 km). Drag the marker inside the circle.");
      const displayDiv = document.getElementById('selectedLocationDisplay');
      if (displayDiv) displayDiv.innerHTML = '';
      const confirmBtn = document.getElementById('confirmLocationBtn');
      if (confirmBtn) confirmBtn.disabled = true;
    }
  });
  // If we have an initial location, trigger validation
  if (initialLat && initialLng) {
    marker.fire('dragend');
  } else {
    attemptAutoLocation();
  }
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
    let ecoCharge = customerData.useEcoBox ? ECO_BOX_CHARGE : 0;
    let total = subtotal + ecoCharge;
    let summaryHtml = '';
    Object.keys(cart).forEach(id => {
      const p = products.find(x => x.id == id);
      const qty = cart[id];
      const price = (p.discountPrice && p.discountPrice > 0) ? p.discountPrice : p.price;
      summaryHtml += `<div>${p.name} ×${qty} = ₹${price * qty}</div>`;
    });
    const orderSummary = document.getElementById('confirmOrderSummary');
    if (orderSummary) orderSummary.innerHTML = summaryHtml;
    const ecoLine = document.getElementById('ecoBoxChargeLine');
    if (ecoLine) ecoLine.style.display = customerData.useEcoBox ? 'block' : 'none';
    const finalTotal = document.getElementById('confirmFinalTotal');
    if (finalTotal) finalTotal.innerHTML = `Total: ₹${total}`;
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

function showSavedSummary() {
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
  // Initialize map with saved location if exists
  if (customerData.location && customerData.location.lat) {
    initMap(customerData.location.lat, customerData.location.lng);
  } else {
    initMap();
  }
}

function openAddressFlow() {
  if (Object.keys(cart).length === 0) {
    showToast("Cart is empty");
    return;
  }
  closeCart();
  loadSavedCustomerData();
  const modal = document.getElementById('addressFlowModal');
  if (modal) modal.style.display = 'flex';
  const hasSavedData = customerData.name && customerData.phone && customerData.house && customerData.location && customerData.location.lat;
  if (hasSavedData) {
    // Validate saved location distance
    const distance = getDistanceKm(ADAT_LAT, ADAT_LON, customerData.location.lat, customerData.location.lng);
    if (distance <= MAX_DISTANCE_KM) {
      showSavedSummary();
    } else {
      showToast("⚠️ Your saved location is outside delivery area. Please update your location on the map.");
      startMultiStepFlow();
    }
  } else {
    startMultiStepFlow();
  }
}

function closeAddressFlow() {
  const modal = document.getElementById('addressFlowModal');
  if (modal) modal.style.display = 'none';
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
  // Re-validate distance before sending
  const distance = getDistanceKm(ADAT_LAT, ADAT_LON, customerData.location.lat, customerData.location.lng);
  if (distance > MAX_DISTANCE_KM) {
    showToast("❌ Delivery address is outside our 5 km area. Please update location.");
    closeAddressFlow();
    startMultiStepFlow();
    return;
  }
  sendFinalWhatsApp();
}

function sendFinalWhatsApp() {
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
  const closeBtn = document.getElementById('closeAddressFlow');
  const backBtn = document.getElementById('backArrowBtn');
  const confirmLocationBtn = document.getElementById('confirmLocationBtn');
  const nextPersonalBtn = document.getElementById('nextToPersonalBtn');
  const nextConfirmBtn = document.getElementById('nextToConfirmBtn');
  const sendFinalBtn = document.getElementById('sendWhatsAppFinalBtn');
  const editBtn = document.getElementById('editAddressBtn');
  const sendSummaryBtn = document.getElementById('sendFromSummaryBtn');
  const useLocationBtn = document.getElementById('useMyLocationBtn');

  if (closeBtn) closeBtn.addEventListener('click', closeAddressFlow);
  if (backBtn) backBtn.addEventListener('click', handleBack);
  if (confirmLocationBtn) {
    confirmLocationBtn.addEventListener('click', () => {
      if (currentLocationValid) {
        showStep(2);
      } else {
        showToast('Please select a location within 5 km delivery area.');
      }
    });
  }
  if (nextPersonalBtn) {
    nextPersonalBtn.addEventListener('click', () => {
      const house = document.getElementById('addrHouse');
      const area = document.getElementById('addrArea');
      const landmark = document.getElementById('addrLandmark');
      const selectedType = document.querySelector('input[name="addrType"]:checked');
      const ecoCheckbox = document.getElementById('ecoBoxCheckbox');
      if (!house || !house.value.trim()) {
        showToast('Please enter house/flat/floor number');
        return;
      }
      customerData.house = house.value.trim();
      customerData.area = area ? area.value.trim() : '';
      customerData.landmark = landmark ? landmark.value.trim() : '';
      if (selectedType) customerData.addressType = selectedType.value;
      if (ecoCheckbox) customerData.useEcoBox = ecoCheckbox.checked;
      showStep(3);
    });
  }
  if (nextConfirmBtn) {
    nextConfirmBtn.addEventListener('click', () => {
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
  }
  if (sendFinalBtn) sendFinalBtn.addEventListener('click', sendFinalWhatsApp);
  if (editBtn) editBtn.addEventListener('click', startMultiStepFlow);
  if (sendSummaryBtn) sendSummaryBtn.addEventListener('click', sendOrderFromSummary);
  if (useLocationBtn) useLocationBtn.addEventListener('click', useCurrentLocation);

  window.addEventListener('click', (e) => {
    if (e.target === addressFlowModal) closeAddressFlow();
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

// ========== ACCOUNT MODAL ==========
function openAccountModal() {
  renderAccountModal();
  const accountModal = document.getElementById('accountModal');
  if (accountModal) accountModal.style.display = 'flex';
}

function closeAccountModalFunc() {
  const accountModal = document.getElementById('accountModal');
  if (accountModal) accountModal.style.display = 'none';
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

function renderAccountModal() {
  const body = document.getElementById('accountModalBody');
  if (!body) return;
  
  const saved = localStorage.getItem('freshAdat_customer');
  if (saved) {
    try {
      const user = JSON.parse(saved);
      if (user.name && user.phone && user.location && user.house) {
        // Logged in user
        const fullAddress = `${user.house}, ${user.area}${user.landmark ? ', ' + user.landmark : ''}, ${user.location.address}`;
        body.innerHTML = `
          <div class="user-info" style="text-align: center; padding: 20px;">
            <div class="user-avatar"><i class="fas fa-user-circle" style="font-size: 4rem; color: var(--green);"></i></div>
            <h2>${escapeHtml(user.name)}</h2>
            <p><i class="fas fa-phone"></i> ${escapeHtml(user.phone)}</p>
            <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(fullAddress)}</p>
            <p><i class="fas fa-envelope"></i> fresh4adat@gmail.com</p>
            <button id="editProfileBtn" class="edit-profile-btn" style="background: var(--green); color: white; border: none; border-radius: 40px; padding: 10px 24px; margin-top: 16px; cursor: pointer;"><i class="fas fa-edit"></i> Edit Profile</button>
          </div>
          <div class="account-menu">
            <div class="menu-item" id="contactUsBtnLogged">
              <i class="fas fa-headset"></i>
              <span>Contact Us</span>
              <i class="fas fa-chevron-right"></i>
            </div>
            <div class="menu-item" id="downloadAppBtnLogged">
              <i class="fas fa-download"></i>
              <span>Download App</span>
              <i class="fas fa-chevron-right"></i>
            </div>
            <div class="menu-item" id="faqsBtnLogged">
              <i class="fas fa-question-circle"></i>
              <span>FAQs</span>
              <i class="fas fa-chevron-right"></i>
            </div>
            <div class="menu-item" id="termsBtnLogged">
              <i class="fas fa-file-contract"></i>
              <span>Terms & Conditions</span>
              <i class="fas fa-chevron-right"></i>
            </div>
            <div class="menu-item" id="privacyBtnLogged">
              <i class="fas fa-shield-alt"></i>
              <span>Privacy Policy</span>
              <i class="fas fa-chevron-right"></i>
            </div>
            <div class="menu-item" id="sellerInfoBtnLogged">
              <i class="fas fa-store"></i>
              <span>Seller Information</span>
              <i class="fas fa-chevron-right"></i>
            </div>
            <div class="menu-item logout-item" id="logoutBtn">
              <i class="fas fa-sign-out-alt"></i>
              <span>Logout</span>
              <i class="fas fa-chevron-right"></i>
            </div>
          </div>
        `;
        
        document.getElementById('editProfileBtn')?.addEventListener('click', () => {
          closeAccountModalFunc();
          startMultiStepFlow();
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
            house: '', area: '', landmark: '', addressType: 'Home', useEcoBox: false
          };
          renderAccountModal();
          showToast('👋 Logged out successfully');
        });
        return;
      }
    } catch(e) {}
  }
  
  // Guest view
  body.innerHTML = `
    <div class="guest-section">
      <div class="guest-icon"><i class="fas fa-user-circle"></i></div>
      <h2>Hi, Guest</h2>
      <p>Please Login to enjoy your shopping</p>
      <p><i class="fas fa-envelope"></i> fresh4adat@gmail.com</p>
      <button id="accountLoginBtn" class="login-btn"><i class="fas fa-sign-in-alt"></i> Login</button>
    </div>
    <div class="account-menu">
      <div class="menu-item" id="contactUsBtnGuest">
        <i class="fas fa-headset"></i>
        <span>Contact Us</span>
        <i class="fas fa-chevron-right"></i>
      </div>
      <div class="menu-item" id="downloadAppBtnGuest">
        <i class="fas fa-download"></i>
        <span>Download App</span>
        <i class="fas fa-chevron-right"></i>
      </div>
      <div class="menu-item" id="faqsBtnGuest">
        <i class="fas fa-question-circle"></i>
        <span>FAQs</span>
        <i class="fas fa-chevron-right"></i>
      </div>
      <div class="menu-item" id="termsBtnGuest">
        <i class="fas fa-file-contract"></i>
        <span>Terms & Conditions</span>
        <i class="fas fa-chevron-right"></i>
      </div>
      <div class="menu-item" id="privacyBtnGuest">
        <i class="fas fa-shield-alt"></i>
        <span>Privacy Policy</span>
        <i class="fas fa-chevron-right"></i>
      </div>
      <div class="menu-item" id="sellerInfoBtnGuest">
        <i class="fas fa-store"></i>
        <span>Seller Information</span>
        <i class="fas fa-chevron-right"></i>
      </div>
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
  document.getElementById('sellerInfoBtnGuest')?.addEventListener('click', () => {
    showStaticContent('Seller Information', `
      <p><strong>Business Name:</strong> Fresh Adat</p>
      <p><strong>Registered Address:</strong> Adat, Thrissur, Kerala - 680551</p>
      <p><strong>GSTIN:</strong> 32ABCDE1234F1Z5</p>
      <p><strong>FSSAI License:</strong> 12345678901234</p>
      <p><strong>Contact:</strong> +91 94968 40336</p>
      <p><strong>Email:</strong> fresh4adat@gmail.com</p>
    `);
  });
}

// Simplified login flow that saves profile without placing an order
function openAddressFlowForLogin() {
  loadSavedCustomerData();
  const modal = document.getElementById('addressFlowModal');
  if (modal) modal.style.display = 'flex';
  const hasSavedData = customerData.name && customerData.phone && customerData.house && customerData.location && customerData.location.lat;
  if (hasSavedData) {
    showSavedSummary();
    const sendSummaryBtn = document.getElementById('sendFromSummaryBtn');
    if (sendSummaryBtn) {
      sendSummaryBtn.innerHTML = '<i class="fas fa-save"></i> Save Profile';
      sendSummaryBtn.onclick = () => {
        // Capture latest data from the hidden fields (they are not visible in saved summary, but we can keep current)
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
      finalSendBtn.innerHTML = '<i class="fas fa-save"></i> Save Profile';
      finalSendBtn.onclick = () => {
        // Gather data from step4 (which is currently shown)
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
        // Location should have been set in step1 (map)
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

// ========== LOAD DATA ==========
function loadData() {
  const baseUrl = 'https://opensheet.elk.sh/1FEpSYZlTrlp0BYPEcVCYISC0kgXpt_3Fcw5XAcjLOvs';
  Promise.all([
    fetch(`${baseUrl}/Sheet1`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet2`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet4`).then(res => res.json()),
    fetch(`${baseUrl}/Sheet5`).then(res => res.json()).catch(() => []),
    fetch(`${baseUrl}/Sheet6`).then(res => res.json()).catch(() => [])
  ]).then(([sheet1, sheet2, sheet4, sheet5, sheet6]) => {
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

    if (sheet6 && sheet6.length) {
      offers = sheet6.map((row, idx) => {
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
          imageUrl: row.image_url || getImageUrl(row.offer_name)
        };
      });
    }
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

  // Offer modal listeners
  const offerModal = document.getElementById('offerDetailModal');
  const closeOfferModalBtn = document.getElementById('closeOfferModal');
  const addOfferBtn = document.getElementById('addOfferToCartBtn');
  if (closeOfferModalBtn) closeOfferModalBtn.addEventListener('click', closeOfferModal);
  if (addOfferBtn) addOfferBtn.addEventListener('click', addOfferToCart);
  if (offerModal) offerModal.addEventListener('click', (e) => { if (e.target === offerModal) closeOfferModal(); });

  // ========== BOTTOM NAVIGATION BAR ==========
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

  // ========== ACCOUNT MODAL CLOSE ==========
  const accountModal = document.getElementById('accountModal');
  const closeAccountModalBtn = document.getElementById('closeAccountModal');
  if (closeAccountModalBtn) closeAccountModalBtn.addEventListener('click', closeAccountModalFunc);
  if (accountModal) accountModal.addEventListener('click', (e) => {
    if (e.target === accountModal) closeAccountModalFunc();
  });

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