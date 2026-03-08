// ==========================================
// LÓGICA DA PÁGINA DE PROPOSTA (proposta.html)
// ==========================================

const VIDEOS_YOUTUBE = [
  'https://www.youtube.com/embed/a-3d90O2u60?si=3F89_VFQmDptzcxp',
  'https://www.youtube.com/embed/YvyIMNlm0q8?si=hJw5gToEMUEYU2LQ',
  'https://www.youtube.com/embed/SOotdCvJAkc?si=KHc78sgr9qrvwHDp'
];

const TAXAS_CARTAO = {
  1: 2.99,  2: 4.09,  3: 4.78,  4: 5.47,  5: 6.14,  6: 6.81,
  7: 7.67,  8: 8.33,  9: 8.98, 10: 9.63, 11: 10.26, 12: 10.90,
  13: 12.32,14: 12.94,15: 13.56,16: 14.17,17: 14.77, 18: 15.37
};
const MAX_PARCELAS = 18;

lucide.createIcons();

// ==========================================
// URGENCY COUNTDOWN — 72h from created_at
// ==========================================
function startCountdown(createdAt) {
  const EXPIRY_HOURS = 72;
  const expiryDate   = new Date(new Date(createdAt).getTime() + EXPIRY_HOURS * 3_600_000);
  const banner       = document.getElementById('urgency-banner');
  const timer        = document.getElementById('countdown-timer');
  const expEl        = document.getElementById('expiry-date');

  if (expEl) {
    expEl.innerText = expiryDate.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function tick() {
    const diff = expiryDate.getTime() - Date.now();
    if (diff <= 0) {
      if (timer) timer.innerText = 'EXPIRADA';
      return;
    }
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1_000);
    if (timer) timer.innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  if (banner) banner.classList.remove('hidden');
  tick();
  setInterval(tick, 1000);
}

// ==========================================
// CARROSSEL DE VÍDEOS
// ==========================================
let videoAtual = 0;
const playerContainer = document.getElementById('video-wrapper');
const dotsContainer   = document.getElementById('video-dots');

VIDEOS_YOUTUBE.forEach((link, index) => {
  const finalUrl = link + (link.includes('?') ? '&' : '?') + 'enablejsapi=1';
  const iframe   = document.createElement('iframe');
  iframe.className = `absolute top-0 left-0 w-full h-full transition-opacity duration-500 ease-in-out ${index === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`;
  iframe.src       = finalUrl;
  iframe.title     = `YouTube video player ${index + 1}`;
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
  iframe.setAttribute('allowfullscreen', '');
  iframe.id = `yt-iframe-${index}`;
  playerContainer.appendChild(iframe);
});

function atualizarCarrossel() {
  VIDEOS_YOUTUBE.forEach((_, index) => {
    const iframe = document.getElementById(`yt-iframe-${index}`);
    if (index === videoAtual) {
      iframe.classList.remove('opacity-0', 'z-0', 'pointer-events-none');
      iframe.classList.add('opacity-100', 'z-10');
    } else {
      iframe.classList.remove('opacity-100', 'z-10');
      iframe.classList.add('opacity-0', 'z-0', 'pointer-events-none');
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      }
    }
  });

  dotsContainer.innerHTML = '';
  VIDEOS_YOUTUBE.forEach((_, index) => {
    const dot      = document.createElement('button');
    const isActive = index === videoAtual;
    dot.className  = `h-2.5 rounded-full transition-all duration-300 ${isActive ? 'bg-orange-500 w-8' : 'bg-neutral-600 hover:bg-neutral-400 w-2.5'}`;
    dot.onclick = () => { videoAtual = index; atualizarCarrossel(); };
    dotsContainer.appendChild(dot);
  });
}

document.getElementById('btn-prev-vid').addEventListener('click', () => {
  videoAtual = (videoAtual - 1 + VIDEOS_YOUTUBE.length) % VIDEOS_YOUTUBE.length;
  atualizarCarrossel();
});

document.getElementById('btn-next-vid').addEventListener('click', () => {
  videoAtual = (videoAtual + 1) % VIDEOS_YOUTUBE.length;
  atualizarCarrossel();
});

atualizarCarrossel();

// ==========================================
// MODAL DE PARCELAMENTO
// ==========================================
const modalParcelamento   = document.getElementById('modal-parcelamento');
const btnShowInstallments = document.getElementById('btn-show-installments');
const btnCloseModal       = document.getElementById('btn-close-modal');

function openModal() {
  modalParcelamento.classList.remove('hidden');
  modalParcelamento.classList.add('flex');
  document.body.classList.add('overflow-hidden');
}

function closeModal() {
  modalParcelamento.classList.add('hidden');
  modalParcelamento.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
}

btnShowInstallments.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
modalParcelamento.addEventListener('click', (e) => {
  if (e.target === modalParcelamento) closeModal();
});

function gerarOpcoesParcelamento(valorBase) {
  const formatter             = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const installmentsContainer = document.getElementById('installments-list');
  installmentsContainer.innerHTML = '';

  for (let i = 1; i <= MAX_PARCELAS; i++) {
    const taxa               = TAXAS_CARTAO[i] || 0;
    const valorTotalComRepasse= valorBase / (1 - (taxa / 100));
    const valorParcela       = valorTotalComRepasse / i;

    const row       = document.createElement('div');
    row.className   = 'flex justify-center items-center p-3 rounded-lg border border-neutral-800 bg-black/40 hover:bg-neutral-800/80 transition-colors';
    row.innerHTML   = `<span class="text-white font-bold text-sm md:text-base">${i}x de ${formatter.format(valorParcela)}</span>`;
    installmentsContainer.appendChild(row);
  }
}

// ==========================================
// CARREGAR E RENDERIZAR PROPOSTA
// ==========================================
const urlParams  = new URLSearchParams(window.location.search);
const propostaId = urlParams.get('id');

async function carregarProposta() {
  if (!propostaId) { showError(); return; }
  try {
    const { data, error } = await supabaseClient
      .from('propostas')
      .select('*')
      .eq('id', propostaId)
      .single();

    if (error || !data) { showError(); return; }

    renderData(data);
    gerarOpcoesParcelamento(data.kit_price);
  } catch (err) {
    showError();
  }
}

function renderData(data) {
  const formatter    = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const TARIFA_MEDIA = 0.95;
  const estGeneration= data.kit_power * 120;

  const valorFaturaIdeal = estGeneration * TARIFA_MEDIA;
  const economiaMensal   = valorFaturaIdeal * 0.85;
  const economiaAnual    = economiaMensal * 12;
  const economia25Anos   = economiaAnual * 25;
  const arvoresPlantadas = Math.round(data.kit_power * 3);

  const mesesTotaisPayback= Math.ceil(data.kit_price / economiaMensal);
  const anosPayback       = Math.floor(mesesTotaisPayback / 12);
  const mesesRestantes    = mesesTotaisPayback % 12;

  let textoPayback = '';
  if (anosPayback > 0)                    textoPayback += `${anosPayback} ano${anosPayback > 1 ? 's' : ''}`;
  if (anosPayback > 0 && mesesRestantes > 0) textoPayback += ' e ';
  if (mesesRestantes > 0)                 textoPayback += `${mesesRestantes} ${mesesRestantes > 1 ? 'meses' : 'mês'}`;
  if (textoPayback === '')                textoPayback = 'Menos de 1 mês';

  document.getElementById('client-name').innerText    = data.cliente_nome.split(' ')[0];
  document.getElementById('kit-brand').innerText      = data.kit_brand;
  document.getElementById('kit-name').innerText       = data.kit_nome;
  document.getElementById('kit-power').innerText      = data.kit_power + ' kWp';
  document.getElementById('kit-generation').innerText = estGeneration.toFixed(0) + ' kWh/mês';
  document.getElementById('kit-list-price').innerText = 'De: ' + formatter.format(data.kit_list_price);
  document.getElementById('kit-ideal-bill').innerText = formatter.format(valorFaturaIdeal);

  const priceParts = formatter.format(data.kit_price).split(',');
  document.getElementById('kit-price').innerHTML = `
    <span class="text-xl align-top text-neutral-500 mr-1">R$</span>${priceParts[0].replace('R$', '').trim()}<span class="text-xl align-top text-neutral-500">,${priceParts[1]}</span>
  `;

  document.getElementById('eco-month').innerText    = formatter.format(economiaMensal);
  document.getElementById('eco-year').innerText     = formatter.format(economiaAnual);
  document.getElementById('eco-25years').innerText  = formatter.format(economia25Anos);
  document.getElementById('env-trees').innerText    = '+' + arvoresPlantadas;
  document.getElementById('eco-payback').innerText  = textoPayback;

  // --- Urgency countdown ---
  if (data.created_at) startCountdown(data.created_at);

  // --- WhatsApp CTA links ---
  const vendorNome = data.vendedor_nome || (data.vendedor_email ? data.vendedor_email.split('@')[0] : 'Consultor');
  const vendorTel  = data.vendedor_telefone || '';
  const waMsg      = encodeURIComponent(
    `Olá ${vendorNome.split(' ')[0]}! Vi a proposta do kit "${data.kit_nome}" (${formatter.format(data.kit_price)}) e quero saber mais. Pode me ajudar? Meu nome é ${data.cliente_nome.split(' ')[0]}.`
  );
  const waLink = vendorTel
    ? `https://wa.me/55${vendorTel.replace(/\D/g, '')}?text=${waMsg}`
    : (data.vendedor_email ? `mailto:${data.vendedor_email}?subject=Interesse na proposta solar&body=Olá, tenho interesse na proposta enviada.` : '#');

  const finalCta    = document.getElementById('final-cta-btn');
  const floatWa     = document.getElementById('floating-whatsapp');
  const vendorWaBtn = document.getElementById('vendor-whatsapp-btn');
  if (finalCta)    finalCta.href    = waLink;
  if (floatWa)     floatWa.href     = waLink;
  if (vendorWaBtn) vendorWaBtn.href = waLink;

  // --- Vendor card ---
  const vendorCard     = document.getElementById('vendor-card');
  const vendorAvatarEl = document.getElementById('vendor-avatar');
  const vendorNameEl   = document.getElementById('vendor-name');
  const vendorEmailEl  = document.getElementById('vendor-email-text');
  if (vendorAvatarEl) vendorAvatarEl.innerText = vendorNome.charAt(0).toUpperCase();
  if (vendorNameEl)   vendorNameEl.innerText   = vendorNome.toUpperCase();
  if (vendorEmailEl && data.vendedor_email) vendorEmailEl.innerText = data.vendedor_email;
  if (vendorCard)     vendorCard.classList.remove('hidden');

  // --- Show floating CTA ---
  const floatingDiv = document.getElementById('floating-cta');
  if (floatingDiv) {
    floatingDiv.classList.remove('hidden');
    lucide.createIcons();
  }

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('proposal-content').classList.remove('hidden');
}

function showError() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error-state').classList.remove('hidden');
  document.getElementById('error-state').classList.add('flex');
}

carregarProposta();
