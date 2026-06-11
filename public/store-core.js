// Core logic for Lulitas Sweet Lab Store

async function loadStore() {
    const grid = document.getElementById('product-grid');

    try {
        const res = await fetch('/api/store-products');
        if (!res.ok) throw new Error('Error de red');
        const products = await res.json();

        const activeProducts = products.filter(p => p.is_active);

        if (activeProducts.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <h2 style="font-size: 1.5rem; margin-bottom: 12px; color: var(--text);">¡Pronto tendremos delicias aquí!</h2>
                    <p>Actualmente estamos horneando nuevas sorpresas. Vuelve pronto.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = '';
        activeProducts.forEach((p, index) => storeRenderProduct(p, index));

    } catch (err) {
        console.error('Error loading store:', err);
        grid.innerHTML = `
            <div class="empty-state">
                <h2 style="font-size: 1.5rem; margin-bottom: 12px; color: var(--danger);">¡Ups! Algo salió mal.</h2>
                <p>No pudimos cargar el menú en este momento. Por favor, recarga la página.</p>
            </div>
        `;
    }
}

function storeRenderProduct(product, index) {
    const grid = document.getElementById('product-grid');
    const card = document.createElement('div');
    card.className = 'product-card';

    const imgContainer = document.createElement('div');
    imgContainer.className = 'product-image-container';

    const track = document.createElement('div');
    track.className = 'carousel-track';

    let mediaItems = [];
    if (Array.isArray(product.media) && product.media.length > 0) {
        mediaItems = product.media;
    } else {
        mediaItems = [{ type: 'image', base64: product.image_base64 || fallbackImage }];
    }

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'carousel-dots';

    mediaItems.forEach((m, idx) => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';

        if (m.type === 'youtube') {
            const img = document.createElement('img');
            img.src = `https://img.youtube.com/vi/${m.id}/hqdefault.jpg`;
            img.alt = product.name;
            img.loading = (idx === 0 && index < 4) ? 'eager' : 'lazy';
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', () => openFullscreenGallery(mediaItems, idx));
            slide.appendChild(img);

            const playIcon = document.createElement('div');
            playIcon.innerHTML = '▶';
            playIcon.style.position = 'absolute';
            playIcon.style.top = '50%';
            playIcon.style.left = '50%';
            playIcon.style.transform = 'translate(-50%, -50%)';
            playIcon.style.fontSize = '32px';
            playIcon.style.color = 'white';
            playIcon.style.textShadow = '0 0 10px rgba(0,0,0,0.5)';
            playIcon.style.pointerEvents = 'none';
            slide.appendChild(playIcon);
        } else if (m.type === 'video') {
            const vid = document.createElement('video');
            vid.src = m.base64;
            vid.muted = true;
            vid.controls = true;
            vid.loop = true;
            vid.playsInline = true;
            vid.autoplay = idx === 0 && index < 4;
            slide.appendChild(vid);
        } else {
            const img = document.createElement('img');
            img.src = m.base64;
            img.alt = product.name;
            img.loading = (idx === 0 && index < 4) ? 'eager' : 'lazy';
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', () => openFullscreenGallery(mediaItems, idx));
            slide.appendChild(img);
        }
        track.appendChild(slide);

        if (mediaItems.length > 1) {
            const dot = document.createElement('div');
            dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
            dotsContainer.appendChild(dot);
        }
    });

    track.addEventListener('scroll', () => {
        if (mediaItems.length > 1) {
            const scrollLeft = track.scrollLeft;
            const width = track.clientWidth;
            const activeIndex = Math.round(scrollLeft / width);
            Array.from(dotsContainer.children).forEach((dot, i) => {
                dot.classList.toggle('active', i === activeIndex);
            });
        }
    });

    imgContainer.appendChild(track);

    if (mediaItems.length > 1) {
        const btnPrev = document.createElement('button');
        btnPrev.className = 'carousel-btn prev';
        btnPrev.innerHTML = '&#10094;';

        const btnNext = document.createElement('button');
        btnNext.className = 'carousel-btn next';
        btnNext.innerHTML = '&#10095;';

        btnPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
        });

        btnNext.addEventListener('click', (e) => {
            e.stopPropagation();
            track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
        });

        imgContainer.appendChild(btnPrev);
        imgContainer.appendChild(btnNext);
        imgContainer.appendChild(dotsContainer);
    }

    if (product.is_promo) {
        const badge = document.createElement('div');
        badge.className = 'product-promo-badge';
        badge.textContent = 'Promoción ✨';
        imgContainer.appendChild(badge);
    }

    if (product.is_new) {
        const newBadge = document.createElement('div');
        newBadge.className = 'product-new-badge';
        newBadge.textContent = 'Nuevo';
        imgContainer.appendChild(newBadge);
    }

    const hasPromo = product.promo_qty >= 2 && product.promo_price > 0;
    const content = document.createElement('div');
    content.className = 'product-content';

    const name = document.createElement('h3');
    name.className = 'product-name';
    name.textContent = product.name;

    const desc = document.createElement('p');
    desc.className = 'product-desc';
    desc.textContent = product.description || 'Delicioso postre de Lulitas Sweet Lab';

    const prices = document.createElement('div');
    prices.className = 'product-prices';

    const priceNormal = document.createElement('div');
    priceNormal.className = 'price-normal';
    priceNormal.textContent = fmtMoney.format(product.price);
    prices.appendChild(priceNormal);

    if (hasPromo) {
        const pricePromo = document.createElement('div');
        pricePromo.className = 'price-promo';
        pricePromo.textContent = `Lleva ${product.promo_qty} por solo ${fmtMoney.format(product.promo_price)}`;
        prices.appendChild(pricePromo);
    }

    const actionContainer = document.createElement('div');
    actionContainer.className = 'action-container';

    const buyBtn = document.createElement('button');
    buyBtn.className = 'buy-btn';
    buyBtn.textContent = 'Lo quiero 💝';

    const qtyContainer = document.createElement('div');
    qtyContainer.className = 'qty-container';
    qtyContainer.style.display = 'none';

    let qty = cart[product.id] ? cart[product.id].qty : 0;

    const calculateTotal = (productQty) => {
        let total = product.price * productQty;
        if (hasPromo) {
            let promoGroups = Math.floor(productQty / product.promo_qty);
            let remainder = productQty % product.promo_qty;
            total = (promoGroups * product.promo_price) + (remainder * product.price);
        }
        return total;
    };

    const renderQty = () => {
        qtyContainer.innerHTML = `
            <div class="qty-controls">
                <button class="qty-btn minus">-</button>
                <span class="qty-val">${qty}</span>
                <button class="qty-btn plus">+</button>
            </div>
        `;

        qtyContainer.querySelector('.minus').addEventListener('click', (e) => {
            e.stopPropagation();
            qty--;
            handleQtyChange();
        });
        qtyContainer.querySelector('.plus').addEventListener('click', (e) => {
            e.stopPropagation();
            qty++;
            handleQtyChange();
        });
    };

    const handleQtyChange = () => {
        if (qty <= 0) {
            qty = 0;
            if (!document.body.classList.contains('is-seller-active')) {
                qtyContainer.style.display = 'none';
                buyBtn.style.display = 'block';
            } else {
                renderQty();
            }
            delete cart[product.id];
        } else {
            renderQty();
            cart[product.id] = { product, qty, total: calculateTotal(qty) };
        }
        updateCartUI();
    };

    renderQty();

    if (document.body.classList.contains('is-seller-active')) {
        buyBtn.style.display = 'none';
        qtyContainer.style.display = 'flex';
        desc.style.display = 'none';
    }

    buyBtn.addEventListener('click', () => {
        qty = 1;
        buyBtn.style.display = 'none';
        qtyContainer.style.display = 'flex';
        handleQtyChange();
    });

    actionContainer.append(buyBtn, qtyContainer);
    content.append(name, desc, prices, actionContainer);
    card.append(imgContainer, content);
    grid.appendChild(card);
}

async function loadSettings() {
    const logoImg = document.querySelector('.logo');
    const grid = document.getElementById('product-grid');
    
    // SWR: Load from cache first
    const cached = safeLS.getItem('store_settings_cache');
    if (cached) {
        try {
            renderSettings(JSON.parse(cached));
            if (logoImg) logoImg.style.opacity = '1';
        } catch (e) {
            console.error('Error parsing settings cache', e);
        }
    }

    try {
        const res = await fetch('/api/store-settings');
        if (res.ok) {
            const settings = await res.json();
            if (JSON.stringify(settings) !== cached) {
                safeLS.setItem('store_settings_cache', JSON.stringify(settings));
                renderSettings(settings);
            }
        }
    } catch (err) {
        console.error('Error loading settings', err);
    } finally {
        if (logoImg) logoImg.style.opacity = '1';
    }
}

function renderSettings(settings) {
    const logoImg = document.querySelector('.logo');
    const grid = document.getElementById('product-grid');
    if (!settings) return;

    if (settings.logo_base64) logoImg.src = settings.logo_base64;
    if (settings.logo_height) {
        logoImg.style.height = settings.logo_height + 'px';
        logoImg.style.maxWidth = '100vw';
        logoImg.style.maxHeight = 'none';
    }
    if (settings.grid_gap_x !== undefined) grid.style.columnGap = settings.grid_gap_x + 'px';
    if (settings.grid_gap_y !== undefined) grid.style.rowGap = settings.grid_gap_y + 'px';
    if (settings.cart_scale !== undefined) {
        const scaleDec = settings.cart_scale / 100;
        document.documentElement.style.setProperty('--cart-scale', scaleDec);
    }
    if (settings.store_title) document.getElementById('store-title-display').textContent = settings.store_title;
    if (settings.store_subtitle) document.getElementById('store-subtitle-display').textContent = settings.store_subtitle;
    if (settings.whatsapp_number) window.storeWhatsappNumber = settings.whatsapp_number;
    if (settings.upload_confirmation_message) window.storeUploadConfirmMsg = settings.upload_confirmation_message;

    const bannersContainer = document.getElementById('promo-banners-container');
    bannersContainer.innerHTML = '';

    if (settings.promo_banner_1) {
        const a1 = document.createElement('a');
        a1.href = '/publicidad-uno.html';
        a1.className = 'promo-banner-link';
        const img1 = document.createElement('img');
        img1.src = settings.promo_banner_1;
        img1.className = 'promo-banner-img';
        img1.alt = 'Banner Promocional 1';
        a1.appendChild(img1);
        bannersContainer.appendChild(a1);
    }

    if (settings.promo_banner_2) {
        const a2 = document.createElement('a');
        a2.href = '/publicidad-dos.html';
        a2.className = 'promo-banner-link';
        const img2 = document.createElement('img');
        img2.src = settings.promo_banner_2;
        img2.className = 'promo-banner-img';
        img2.alt = 'Banner Promocional 2';
        a2.appendChild(img2);
        bannersContainer.appendChild(a2);
    }
}

function openFullscreenGallery(mediaItems, startIndex) {
    const galleryTrack = document.getElementById('gallery-track');
    const galleryDots = document.getElementById('gallery-dots');
    const galleryModal = document.getElementById('gallery-modal');
    const galleryPrev = document.getElementById('gallery-prev');
    const galleryNext = document.getElementById('gallery-next');

    currentGalleryItems = mediaItems;
    galleryTrack.innerHTML = '';
    galleryDots.innerHTML = '';

    mediaItems.forEach((m, idx) => {
        const slide = document.createElement('div');
        slide.className = 'gallery-slide';
        slide.addEventListener('click', (e) => {
            if (e.target === slide) closeGallery();
        });

        if (m.type === 'youtube') {
            const ifr = document.createElement('iframe');
            ifr.src = `https://www.youtube.com/embed/${m.id}?rel=0`;
            ifr.style.width = '100%';
            ifr.style.height = '100%';
            ifr.style.border = 'none';
            ifr.style.borderRadius = '12px';
            ifr.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
            ifr.setAttribute('allowfullscreen', 'true');
            slide.appendChild(ifr);
        } else if (m.type === 'video') {
            const vid = document.createElement('video');
            vid.src = m.base64;
            vid.controls = true;
            vid.playsInline = true;
            vid.autoplay = idx === startIndex;
            slide.appendChild(vid);
        } else {
            const img = document.createElement('img');
            img.src = m.base64;
            img.style.cursor = 'zoom-out';
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                closeGallery();
            });
            slide.appendChild(img);
        }
        galleryTrack.appendChild(slide);

        if (mediaItems.length > 1) {
            const dot = document.createElement('div');
            dot.className = `gallery-dot ${idx === startIndex ? 'active' : ''}`;
            galleryDots.appendChild(dot);
        }
    });

    galleryPrev.style.display = mediaItems.length > 1 ? '' : 'none';
    galleryNext.style.display = mediaItems.length > 1 ? '' : 'none';

    galleryModal.style.display = 'flex';
    void galleryModal.offsetWidth;
    galleryModal.classList.add('show');
    document.body.style.overflow = 'hidden';

    if (startIndex > 0) {
        setTimeout(() => {
            galleryTrack.scrollLeft = startIndex * galleryTrack.clientWidth;
        }, 50);
    }
}

function closeGallery() {
    const galleryModal = document.getElementById('gallery-modal');
    const galleryTrack = document.getElementById('gallery-track');
    const galleryDots = document.getElementById('gallery-dots');

    galleryModal.classList.remove('show');
    setTimeout(() => {
        galleryModal.style.display = 'none';
        galleryTrack.innerHTML = '';
        galleryDots.innerHTML = '';
        document.body.style.overflow = '';
    }, 300);
}
