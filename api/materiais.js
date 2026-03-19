// Vercel Serverless Function — proxy para o Google Apps Script
// Evita o bloqueio de CORS ao chamar o GAS direto do browser.
// Chamada do front-end: fetch('/api/materiais')

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzXY5YiEgUrXX4E1CsHWoDHRRqZMomTPzbNaY8M8CljI3MRneF6LT5bORvKj2VbiUZGMQ/exec';

export default async function handler(req, res) {
  // Apenas GET permitido
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, erro: 'Método não permitido' });
  }

  try {
    const response = await fetch(GAS_URL, { redirect: 'follow' });

    if (!response.ok) {
      return res.status(502).json({ ok: false, erro: 'Erro HTTP ' + response.status + ' ao contatar o Google Apps Script' });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(502).json({ ok: false, erro: 'Falha ao contatar o Google Apps Script: ' + err.message });
  }
}
