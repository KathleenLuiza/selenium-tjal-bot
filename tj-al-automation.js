// tj-al-automation.js
// Uso: node tj-al-automation.js "<numero_processo>" <mes> <ano>
// Se não passar argumentos, buscará todos os processos disponíveis.

const puppeteer = require('puppeteer');

const PROCESS_NUMBER = process.argv[2] || ''; // vazio pega todos
const TARGET_MONTH = process.argv[3] || '';   // vazio pega todos
const TARGET_YEAR = process.argv[4] || '';    // vazio pega todos
const SITE_URL = 'https://www2.tjal.jus.br/cpopg/open.do';

// Configuração de seletores (ajuste se o site mudar)
const config = {
  searchFieldSelectors: [
    'input#numero',
    'input[name="numero"]',
    'input[name*="processo"]',
    'input[type="text"]',
    'input[placeholder*="Número"]',
    'input[placeholder*="Pesquisar"]'
  ],
  searchButtonSelectors: [
    'button#btn-search',
    'button[type="submit"]',
    'input[type="submit"]',
    'button[title*="Pesquisar"]',
    'a[onclick*="pesquisar"]'
  ],
  resultsRowSelectorCandidates: [
    'table.resultados tbody tr',
    'table#resultado tbody tr',
    'table tbody tr',
    '.resultado-linha'
  ],
  dateCellSelectors: ['td[data-col="data"]', 'td:nth-last-child(2)', 'td:nth-child(3)', '.col-data'],
  processLinkSelectors: ['a.process-number', 'a[href*="open.do?"]', 'a.linkProcesso', 'td a']
};

// Função para verificar mês/ano na data
function monthYearMatches(text, mm, yyyy) {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  const re1 = new RegExp(`\\b${mm}/${yyyy}\\b`);
  const re2 = new RegExp(`\\b\\d{1,2}/${mm}/${yyyy}\\b`);
  const re3 = new RegExp(`${yyyy}`);
  return re1.test(normalized) || re2.test(normalized) || re3.test(normalized);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: null
  });

  try {
    const page = await browser.newPage();
    await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // 1) localizar campo de busca
    let searchFieldHandle = null;
    for (const sel of config.searchFieldSelectors) {
      const el = await page.$(sel);
      if (el) { searchFieldHandle = el; break; }
    }

    if (searchFieldHandle && PROCESS_NUMBER) {
      await searchFieldHandle.click({clickCount: 3});
      await searchFieldHandle.type(PROCESS_NUMBER, {delay: 50});
    }

    // 2) clicar botão de pesquisa
    if (searchFieldHandle) {
      let clicked = false;
      for (const sel of config.searchButtonSelectors) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); clicked = true; break; }
      }
      if (!clicked && PROCESS_NUMBER) await searchFieldHandle.press('Enter');
    }

    // 3) aguardar resultados
    await page.waitForTimeout(2000);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(()=>{});

    // 4) buscar linhas de resultado
    let rows = [];
    for (const sel of config.resultsRowSelectorCandidates) {
      const found = await page.$$(sel);
      if (found && found.length > 0) { rows = found; break; }
    }

    if (rows.length === 0) {
      console.warn('Nenhum resultado encontrado.');
      await browser.close();
      return;
    }

    console.log(`Encontradas ${rows.length} linhas. Verificando datas...`);

    for (const row of rows) {
      const rowText = (await page.evaluate(el => el.innerText, row)).trim();
      let dateMatched = false;

      if (TARGET_MONTH && TARGET_YEAR) {
        for (const dsel of config.dateCellSelectors) {
          try {
            const dateEl = await row.$(dsel);
            if (dateEl) {
              const dateText = (await page.evaluate(el => el.innerText, dateEl)).trim();
              if (monthYearMatches(dateText, TARGET_MONTH, TARGET_YEAR)) { dateMatched = true; break; }
            }
          } catch(e){}
        }
        if (!dateMatched && monthYearMatches(rowText, TARGET_MONTH, TARGET_YEAR)) dateMatched = true;
      } else {
        dateMatched = true; // sem filtro de data, pega todos
      }

      if (dateMatched) {
        for (const plsel of config.processLinkSelectors) {
          const linkHandle = await row.$(plsel);
          if (linkHandle) {
            const href = await page.evaluate(a => a.href || a.getAttribute('href'), linkHandle);
            if (href && href.trim() !== '') {
              console.log('Link encontrado:', href);
              break;
            }
          }
        }
      }
    }

    await browser.close();
  } catch (err) {
    console.error('Erro na automação:', err);
    await browser.close();
  }
})();
