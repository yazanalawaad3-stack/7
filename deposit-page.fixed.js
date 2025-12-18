// Deposit page logic (BEP20 USDT)
// - No UI/style changes.
// - Fetch existing deposit address from `deposit_addresses`.
// - If missing, call Supabase Edge Function to create a NOWPayments payment and store the address.
// - Render QR code for the address.

;(function () {
  'use strict';

  function $(sel, root) {
    try { return (root || document).querySelector(sel); } catch (_e) { return null; }
  }
  function $all(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (_e) { return []; }
  }

  var SB = window.SB_CONFIG || null;
  var qrImgEl = null;
  var addressTextEl = null;
  var qrCaptionEl = null;
  var networkButtons = [];
  var copyBtn = null;

  var NETWORK = 'BEP20';
  var PAY_CURRENCY = 'USDT';
  var EDGE_FUNCTION = (window.DEPOSIT_EDGE_FUNCTION || 'nowpayments-create-payment');
  // Used only when we must create a payment. Keep small but > 0.
  var DEFAULT_AMOUNT_USD = Number(window.DEPOSIT_DEFAULT_AMOUNT_USD || 10);

  function placeholderQrDataUri() {
    var svg = ""
      + "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'>"
      + "<rect width='220' height='220' fill='#fff'/>"
      + "<rect x='10' y='10' width='200' height='200' rx='12' fill='none' stroke='#d9d9d9' stroke-width='2'/>"
      + "<circle cx='110' cy='110' r='26' fill='#fff' stroke='#111' stroke-width='6'/>"
      + "<circle cx='110' cy='110' r='10' fill='#111'/>"
      + "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function setLoading(msg) {
    if (addressTextEl) addressTextEl.textContent = msg || 'Loading...';
    if (qrCaptionEl) qrCaptionEl.textContent = 'Fetching ' + NETWORK + ' ' + PAY_CURRENCY + ' address...';
    if (qrImgEl) qrImgEl.src = placeholderQrDataUri();
  }

  function updateQr(address) {
    if (!qrImgEl) return;
    var data = address ? String(address).trim() : '';
    if (!data) {
      qrImgEl.src = placeholderQrDataUri();
      return;
    }
    var url = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(data);
    qrImgEl.src = url;
  }

  function setAddress(address) {
    var addr = address ? String(address).trim() : '';
    if (!addr) {
      setLoading('Loading...');
      return;
    }
    if (addressTextEl) addressTextEl.textContent = addr;
    if (qrCaptionEl) qrCaptionEl.textContent = 'This address only supports deposits of ' + NETWORK + ' ' + PAY_CURRENCY;
    updateQr(addr);
  }

  function setActiveNetworkUI() {
    networkButtons.forEach(function (b) {
      var name = (b.textContent || '').trim();
      if (name === NETWORK) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  function safeJson(res) {
    return res.json().catch(function () { return null; });
  }

  function getCurrentSupabaseUserId() {
    try {
      if (window.ExaAuth && typeof window.ExaAuth.ensureSupabaseUserId === 'function') {
        return window.ExaAuth.ensureSupabaseUserId().then(function (id) {
          return id ? String(id) : '';
        });
      }
    } catch (_e) {}
    return Promise.resolve('');
  }

  function fetchExistingAddress(userId) {
    if (!SB || !SB.url || !SB.headers) return Promise.resolve(null);
    var url = SB.url + '/rest/v1/deposit_addresses'
      + '?select=pay_address,payment_id,network,pay_currency,updated_at'
      + '&user_id=eq.' + encodeURIComponent(userId)
      + '&network=eq.' + encodeURIComponent(NETWORK)
      + '&pay_currency=eq.' + encodeURIComponent(PAY_CURRENCY)
      + '&limit=1';
    return fetch(url, { method: 'GET', headers: SB.headers() })
      .then(function (r) { if (!r.ok) return null; return safeJson(r); })
      .then(function (rows) {
        if (!rows || !Array.isArray(rows) || !rows.length) return null;
        return rows[0] || null;
      })
      .catch(function () { return null; });
  }

  function createNowPaymentsAddress(userId) {
    if (!SB || !SB.url || !SB.headers) return Promise.resolve(null);
    var fnUrl = SB.url + '/functions/v1/' + encodeURIComponent(EDGE_FUNCTION);
    var payload = { user_id: userId, amount_usd: DEFAULT_AMOUNT_USD, network: NETWORK, pay_currency: PAY_CURRENCY };
    return fetch(fnUrl, {
      method: 'POST',
      headers: SB.headers(),
      body: JSON.stringify(payload)
    })
      .then(function (r) { if (!r.ok) return safeJson(r).then(function (e) { throw e || new Error('Edge function error'); }); return safeJson(r); })
      .then(function (data) { return data || null; });
  }

  function wireCopy() {
    if (!copyBtn || !addressTextEl) return;
    copyBtn.addEventListener('click', function () {
      var addr = (addressTextEl.textContent || '').trim();
      if (!addr || addr.toLowerCase() === 'loading...' || addr.toLowerCase() === 'loading.') return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).catch(function () {});
      } else {
        try {
          var ta = document.createElement('textarea');
          ta.value = addr;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch (_e) {}
      }
    });
  }

  function wireNetworkButtons() {
    networkButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = (btn.textContent || '').trim();
        if (name !== NETWORK) {
          // Keep UI intact but do not switch logic yet.
          setActiveNetworkUI();
          return;
        }
        setActiveNetworkUI();
      });
    });
  }

  function boot() {
    qrImgEl = document.getElementById('depositQr');
    addressTextEl = $('.address-text');
    qrCaptionEl = $('.qr-caption');
    networkButtons = $all('.network-btn');
    copyBtn = $('.copy-btn');

    setActiveNetworkUI();
    wireNetworkButtons();
    wireCopy();
    setLoading('Loading...');

    getCurrentSupabaseUserId().then(function (userId) {
      if (!userId) return;
            return fetchExistingAddress(userId).then(function (row) {
        if (row && row.pay_address) {
          var existingAddr = String(row.pay_address || '').trim();
          // If old data contains an ATLOS payment link, regenerate a real wallet address.
          if (existingAddr && !/^https?:\/\//i.test(existingAddr)) {
            setAddress(existingAddr);
            return;
          }
        }
        return createNowPaymentsAddress(userId).then(function (data) {
          if (!data) return;
          // Edge function returns {pay_address, network, pay_currency, ...}
          var addr = (data.pay_address || data.address || '').trim();
          if (addr) setAddress(addr);
        });
      });
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();