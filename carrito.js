let carrito = JSON.parse(localStorage.getItem('triquetaCarrito')) || {};

function agregarAlCarrito(banda, imagen, tipo, precio, carpetaOrigen) {
    const idProducto = `${banda} - ${tipo}`;
    if(carrito[idProducto]) {
        carrito[idProducto].cantidad++;
    } else {
        carrito[idProducto] = { banda: banda, imagen: imagen, tipo: tipo, precio: precio, carpeta: carpetaOrigen, cantidad: 1 };
    }
    guardarCarrito();
    actualizarCarritoUI();
    const btn = document.getElementById('openCartBtn');
    if(btn) { btn.style.transform = 'scale(1.2)'; setTimeout(() => btn.style.transform = '', 200); }
}

function modificarCantidad(idProducto, delta) {
    if(carrito[idProducto]) {
        carrito[idProducto].cantidad += delta;
        if(carrito[idProducto].cantidad <= 0) delete carrito[idProducto];
        guardarCarrito(); actualizarCarritoUI();
    }
}

function guardarCarrito() { localStorage.setItem('triquetaCarrito', JSON.stringify(carrito)); }

// === MOTOR CENTRAL DE PRECIOS Y DESCUENTOS ===
function aplicarDescuentosEspeciales() {
    let totales = { Aretes: 0, Pin: 0, Llavero: 0, Camiseta: 0, 'Pick (Púa)': 0 };
    
    for (let key in carrito) {
        let tipo = carrito[key].tipo;
        if (totales[tipo] !== undefined) {
            totales[tipo] += carrito[key].cantidad;
        } else if (tipo === 'Camiseta Frontal' || tipo === 'Camiseta Doble') {
            totales.Camiseta += carrito[key].cantidad;
        }
    }
    
    for (let key in carrito) {
        let item = carrito[key];
        
        if (item.tipo === 'Aretes') {
            item.precio = (totales.Aretes >= 12) ? 3000 : 5000;
        } 
        else if (item.tipo === 'Pin') {
            if (item.cantidad >= 12) item.precio = 25000 / 12; 
            else if (totales.Pin >= 12) item.precio = 5000;
            else item.precio = 10000;
        } 
        else if (item.tipo === 'Llavero') {
            if (item.cantidad >= 12) item.precio = 3000;
            else if (totales.Llavero >= 12) item.precio = 4000;
            else item.precio = 5000;
        }
        else if (item.tipo === 'Camiseta Frontal') {
            item.precio = (totales.Camiseta >= 4) ? 26000 : 35000;
        }
        else if (item.tipo === 'Camiseta Doble') {
            item.precio = (totales.Camiseta >= 4) ? 30000 : 40000;
        }
        else if (item.tipo === 'Pick (Púa)') {
            item.precio = (totales['Pick (Púa)'] >= 12) ? (25000 / 12) : 5000;
        }
    }
    guardarCarrito();
}

function calcularTotal() {
    let costoTotal = 0;
    for (let id in carrito) { costoTotal += (carrito[id].precio * carrito[id].cantidad); }
    return Math.round(costoTotal); 
}

function actualizarCarritoUI() {
    aplicarDescuentosEspeciales();
    const container = document.getElementById('cartItemsContainer');
    const totalElement = document.getElementById('cartTotal');
    const badge = document.getElementById('cartCount');
    if(!container || !totalElement || !badge) return;

    container.innerHTML = '';
    let totalItems = 0;
    let totalesCat = { Aretes: 0, Pin: 0, Llavero: 0, Camiseta: 0, 'Pick (Púa)': 0 };

    for (let id in carrito) {
        let item = carrito[id];
        totalItems += item.cantidad;
        
        if (totalesCat[item.tipo] !== undefined) {
            totalesCat[item.tipo] += item.cantidad;
        } else if (item.tipo === 'Camiseta Frontal' || item.tipo === 'Camiseta Doble') {
            totalesCat.Camiseta += item.cantidad;
        }
        
        let descuentoModeloHtml = '';
        if ((item.tipo === 'Pin' || item.tipo === 'Llavero' || item.tipo === 'Pick (Púa)') && item.cantidad >= 12) {
            descuentoModeloHtml = `<span style="color: #25D366; font-size: 0.75rem; font-weight: bold; display: block; margin-top: 3px;">✅ ¡Promo x1 Modelo!</span>`;
        }

        let imgPath = (item.imagen.startsWith('http') || item.imagen.includes('/')) ? item.imagen : `${item.carpeta}/${item.imagen}`;
        let precioUI = Math.round(item.precio).toLocaleString('es-CO');
        
        container.innerHTML += `
            <div class="cart-item">
                <img src="${imgPath}" alt="${item.banda}" onerror="this.src='logo.png'">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.banda}</div>
                    <span style="color: var(--accent-red); font-size: 0.8rem; font-weight: bold; text-transform: uppercase;">${item.tipo}</span>
                    <span style="color: #888; font-size: 0.8rem; margin-left: 5px;">$${precioUI}</span>
                    ${descuentoModeloHtml}
                </div>
                <div class="cart-controls">
                    <button class="cart-btn" onclick="modificarCantidad('${id.replace(/'/g, "\\'")}', -1)">-</button>
                    <span>${item.cantidad}</span>
                    <button class="cart-btn" onclick="modificarCantidad('${id.replace(/'/g, "\\'")}', 1)">+</button>
                </div>
            </div>
        `;
    }

    badge.innerText = totalItems;
    let totalCosto = calcularTotal();
    
    let promoSurtidaMsg = document.getElementById('cartPromoMsg');
    if (!promoSurtidaMsg) {
        promoSurtidaMsg = document.createElement('div');
        promoSurtidaMsg.id = 'cartPromoMsg';
        promoSurtidaMsg.style = "color: #25D366; font-size: 0.95rem; text-align: center; margin-bottom: 15px; font-weight: bold; font-family: 'Oswald', sans-serif;";
        const footerCarrito = document.getElementById('cartTotal').parentElement.parentElement;
        footerCarrito.insertBefore(promoSurtidaMsg, footerCarrito.firstChild);
    }

    let mensajesPromo = [];
    if (totalesCat.Pin >= 12) mensajesPromo.push("✨ ¡Precio mayorista en Pines aplicado!");
    if (totalesCat.Llavero >= 12) mensajesPromo.push("🔑 ¡Precio mayorista en Llaveros aplicado!");
    if (totalesCat.Aretes >= 12) mensajesPromo.push("💎 ¡Precio mayorista en Aretes aplicado!");
    if (totalesCat.Camiseta >= 4) mensajesPromo.push("👕 ¡Precio mayorista en Camisetas aplicado!");
    if (totalesCat['Pick (Púa)'] >= 12) mensajesPromo.push("🎸 ¡Precio mayorista en Picks aplicado!");

    if (mensajesPromo.length > 0) {
        promoSurtidaMsg.innerHTML = mensajesPromo.join('<br>');
        promoSurtidaMsg.style.display = "block";
    } else {
        promoSurtidaMsg.style.display = "none";
    }
    
    document.getElementById('cartTotalItems').innerText = `(${totalItems} arts.)`;
    totalElement.innerText = "$" + totalCosto.toLocaleString('es-CO') + " COP";
}

function finalizarCompra() {
    if (Object.keys(carrito).length === 0) { alert("Tu pedido está vacío."); return; }
    let mensaje = "¡Hola Triqueta Lunar! Quiero confirmar mi pedido:\n\n";
    for (let id in carrito) {
        let item = carrito[id];
        mensaje += `- ${item.cantidad}x [${item.tipo}] ${item.banda}\n`;
    }
    let totalCosto = calcularTotal();
    mensaje += `\n*TOTAL: $${totalCosto.toLocaleString('es-CO')} COP* (Sin envío)\n\nPor favor indíquenme el valor del envío y los datos para transferir. ¡Gracias!`;
    window.open(`https://wa.me/573125935222?text=${encodeURIComponent(mensaje)}`, '_blank');
}

// === SISTEMA DE INYECCIÓN DE HEADER Y FOOTER ===
document.addEventListener("DOMContentLoaded", () => {
    const headerPlaceholder = document.getElementById('global-header');
    if (headerPlaceholder) {
        fetch('header.html').then(res => res.text()).then(data => {
            headerPlaceholder.outerHTML = data;
            let rutaActual = window.location.pathname;
            let idBoton = 'nav-inicio';
            if (rutaActual.includes('pines')) idBoton = 'nav-pines';
            else if (rutaActual.includes('picks')) idBoton = 'nav-picks';
            else if (rutaActual.includes('stickers')) idBoton = 'nav-stickers';
            else if (rutaActual.includes('llaveros')) idBoton = 'nav-llaveros';
            else if (rutaActual.includes('posavasos')) idBoton = 'nav-posavasos';
            else if (rutaActual.includes('aretes')) idBoton = 'nav-aretes';
            else if (rutaActual.includes('camisetas')) idBoton = 'nav-camisetas';
            else if (rutaActual.includes('decoraciones')) idBoton = 'nav-decoraciones';
            else if (rutaActual.includes('index')) idBoton = 'nav-inicio';
            let botonActivo = document.getElementById(idBoton);
            if (botonActivo) botonActivo.classList.add('active');
        }).catch(err => console.error('Error cargando header:', err));
    }

    const footerPlaceholder = document.getElementById('global-footer');
    if (footerPlaceholder) {
        fetch('footer.html').then(res => res.text()).then(data => {
            footerPlaceholder.outerHTML = data;
            document.body.addEventListener('click', function(e) {
                if (e.target.closest('#openCartBtn')) {
                    const sidebar = document.getElementById('cartSidebar');
                    if (sidebar) sidebar.classList.add('open');
                }
                if (e.target.closest('#closeCartBtn')) {
                    const sidebar = document.getElementById('cartSidebar');
                    if (sidebar) sidebar.classList.remove('open');
                }
            });
            actualizarCarritoUI();
        }).catch(err => console.error('Error cargando footer:', err));
    } else { actualizarCarritoUI(); }
});

// === SISTEMA UNIVERSAL DE ZOOM Y VIDEOS (LIGHTBOX) ===
document.addEventListener("DOMContentLoaded", () => {
    const lightboxHTML = `
        <style>
            .lightbox-unv { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); backdrop-filter: blur(8px); z-index: 9999; display: none; align-items: center; justify-content: center; padding: 20px; }
            .lightbox-unv.open { display: flex; }
            .lightbox-unv-content { max-width: 90vw; max-height: 85vh; object-fit: contain; border-radius: 8px; box-shadow: 0 0 30px rgba(0,0,0,0.9); border: 1px solid #333; display: none; }
            .lightbox-unv-content.active { display: block; }
            .lightbox-unv-close { position: absolute; top: 20px; right: 25px; color: white; font-size: 2.2rem; cursor: pointer; background: none; border: none; transition: color 0.2s; z-index: 10000; }
            .lightbox-unv-close:hover { color: #882222; }
            .foto-real, .pin-card img, .carousel img { cursor: zoom-in !important; }
        </style>
        
        <div class="lightbox-unv" id="lb-unv-modal">
            <button class="lightbox-unv-close" id="lb-unv-close">&times;</button>
            <img class="lightbox-unv-content" id="lb-unv-img" src="" alt="Ampliación">
            <!-- Nueva etiqueta exclusiva para reproducir videos -->
            <video class="lightbox-unv-content" id="lb-unv-video" src="" controls autoplay loop playsinline></video>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', lightboxHTML);

    document.body.addEventListener('click', function(e) {
        if (e.target.matches('.foto-real') || e.target.matches('.pin-card img') || e.target.matches('.carousel img')) {
            const imgModal = document.getElementById('lb-unv-img');
            const videoModal = document.getElementById('lb-unv-video');

            if (e.target.tagName.toLowerCase() === 'video') {
                imgModal.classList.remove('active'); 
                videoModal.classList.add('active');  
                videoModal.src = e.target.src;       
                videoModal.play();
            } 
            else {
                videoModal.classList.remove('active'); 
                videoModal.pause(); 
                imgModal.classList.add('active');      
                imgModal.src = e.target.src;           
            }
            
            document.getElementById('lb-unv-modal').classList.add('open');
        }
        else if (e.target.id === 'lb-unv-modal' || e.target.id === 'lb-unv-close') {
            document.getElementById('lb-unv-modal').classList.remove('open');
            const videoModal = document.getElementById('lb-unv-video');
            videoModal.pause();
            videoModal.src = ''; 
        }
    });

    // --- SISTEMA UNIVERSAL PARA BARAJAR FOTOS REALES ---
    const galerias = document.querySelectorAll('.galeria-reales');
    galerias.forEach(galeria => {
        let elementos = Array.from(galeria.children);
        elementos.sort(() => Math.random() - 0.5);
        elementos.forEach(el => galeria.appendChild(el));
    });
});

// === WIDGET FLOTANTE DE REDES SOCIALES ===
document.addEventListener("DOMContentLoaded", () => {
    const socialWidgetHTML = `
        <style>
            .floating-social-widget {
                position: fixed;
                bottom: 25px;
                left: 25px;
                /* Degradado vino tinto a negro */
                background: linear-gradient(135deg, rgba(136, 34, 34, 0.95) 0%, rgba(10, 10, 10, 0.95) 100%);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 68, 68, 0.4);
                border-radius: 50px;
                padding: 10px 20px;
                display: flex;
                align-items: center;
                gap: 15px;
                z-index: 2000;
                /* Sombra con un ligero resplandor rojo */
                box-shadow: 0 5px 20px rgba(0,0,0,0.8), 0 0 15px rgba(136, 34, 34, 0.4);
                animation: slideUpFade 1s ease-out forwards;
                opacity: 0;
                transform: translateY(20px);
            }
            @keyframes slideUpFade {
                to { opacity: 1; transform: translateY(0); }
            }
            .fsw-text {
                font-family: 'Oswald', sans-serif;
                color: #fff;
                font-size: 0.95rem;
                letter-spacing: 1px;
                text-transform: uppercase;
                margin-right: 5px;
                border-right: 1px solid rgba(255, 255, 255, 0.3);
                padding-right: 15px;
            }
            .fsw-icon {
                color: #fff; /* Blanco para que resalte en el fondo rojo */
                font-size: 1.4rem;
                text-decoration: none;
                transition: all 0.3s ease;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
            }
            .fsw-icon:hover {
                color: #25D366; /* Verde WhatsApp al pasar el mouse */
                transform: translateY(-3px) scale(1.1);
            }
            .fsw-close {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 1.5rem;
                cursor: pointer;
                margin-left: 5px;
                transition: color 0.2s;
                display: flex;
                align-items: center;
                line-height: 0;
            }
            .fsw-close:hover { color: #fff; }
            
            /* Ajuste para celulares: Alineado a la izquierda, compacto y sin chocar con el carrito */
            @media (max-width: 768px) {
                .floating-social-widget {
                    bottom: 20px;
                    left: 20px;
                    width: auto;
                    padding: 8px 15px;
                    gap: 12px;
                }
                .fsw-text { font-size: 0.85rem; padding-right: 10px; margin-right: 0; }
                .fsw-icon { font-size: 1.2rem; }
            }
        </style>
        
        <div class="floating-social-widget" id="socialWidget">
            <span class="fsw-text">¡Síguenos!</span>
            <a href="https://www.instagram.com/triquetalunar/" target="_blank" class="fsw-icon"><i class="fab fa-instagram"></i></a>
            <a href="https://www.tiktok.com/@triquetalunar" target="_blank" class="fsw-icon"><i class="fab fa-tiktok"></i></a>
            <a href="https://www.facebook.com/TriquetaLunar" target="_blank" class="fsw-icon"><i class="fab fa-facebook-f"></i></a>
            <button class="fsw-close" onclick="document.getElementById('socialWidget').style.display='none'">&times;</button>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', socialWidgetHTML);
});