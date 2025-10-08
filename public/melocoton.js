(function () {
  'use strict';

  const BUSINESS_WHATSAPP = '573002223344'; // TODO: reemplazar por el WhatsApp de Lulita’s Sweet Lab

  const countdownEl = document.getElementById('countdown');
  const unitsEls = Array.from(document.querySelectorAll('.units-available'));
  const form = document.getElementById('order-form');
  const nameInput = document.getElementById('name');
  const phoneInput = document.getElementById('phone');
  const addressInput = document.getElementById('address');
  const consentInput = document.getElementById('consent');
  const nameError = document.getElementById('name-error');
  const phoneError = document.getElementById('phone-error');
  const consentError = document.getElementById('consent-error');
  const confirmSection = document.getElementById('confirmacion');
  const whatsappConfirmBtn = document.getElementById('whatsapp-confirm');

  // Units available (local-only indicator)
  const initialUnits = Number(unitsEls[0]?.dataset.initial || '20') || 20;
  let unitsAvailable = Number(localStorage.getItem('lulitas_units_available') || initialUnits);
  updateUnits(unitsAvailable);

  // Countdown to next 10:00 PM
  startCountdown();

  // Form handling
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      clearErrors();
      const name = (nameInput.value || '').trim();
      const phone = (phoneInput.value || '').trim();
      const address = (addressInput.value || '').trim();
      const consent = consentInput.checked;

      let valid = true;
      if (!name) {
        nameError.textContent = 'Por favor escribe tu nombre.';
        valid = false;
      }
      if (!phone) {
        phoneError.textContent = 'Por favor escribe tu número.';
        valid = false;
      } else if (!/^[-+()\s0-9]{7,}$/.test(phone)) {
        phoneError.textContent = 'Ingresa un número válido.';
        valid = false;
      }
      if (!consent) {
        consentError.textContent = 'Debes aceptar para continuar.';
        valid = false;
      }

      if (!valid) return;

      // Simulate order received: show confirmation view
      showConfirmation();

      // Decrease local units (non-persistent server-side)
      unitsAvailable = Math.max(0, unitsAvailable - 1);
      localStorage.setItem('lulitas_units_available', String(unitsAvailable));
      updateUnits(unitsAvailable);

      // Prepare WhatsApp link
      const msg = `Hola Lulita’s Sweet Lab, soy ${name}.\nAcabo de hacer un pedido de Postre de Melocotón 🍑.\nMi teléfono: ${phone}.\nDirección: ${address || 'la comparto por chat'}.\nForma de pago: Contraentrega.`;
      const waLink = `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(msg)}`;
      if (whatsappConfirmBtn) whatsappConfirmBtn.href = waLink;
      // Navigate to confirmation anchor for visibility
      location.hash = '#confirmacion';
      window.scrollTo({ top: confirmSection.offsetTop - 20, behavior: 'smooth' });
    });
  }

  function clearErrors() {
    if (nameError) nameError.textContent = '';
    if (phoneError) phoneError.textContent = '';
    if (consentError) consentError.textContent = '';
  }

  function updateUnits(n) {
    unitsEls.forEach(function (el) { el.textContent = String(n); });
  }

  function showConfirmation() {
    const orderSection = document.getElementById('pedido');
    if (orderSection) orderSection.hidden = true;
    if (confirmSection) confirmSection.hidden = false;
  }

  function startCountdown() {
    if (!countdownEl) return;
    function computeNextTenPM(now) {
      const target = new Date(now);
      target.setHours(22, 0, 0, 0); // 22:00 local
      if (target <= now) {
        // move to next day
        target.setDate(target.getDate() + 1);
      }
      return target;
    }

    function tick() {
      const now = new Date();
      const target = computeNextTenPM(now);
      const diffMs = target - now;
      const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      countdownEl.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    tick();
    setInterval(tick, 1000);
  }
})();

