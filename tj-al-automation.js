Salve em um arquivo com esse nome e rode com node tj-al-automation.js <processo> <mes> <ano>

// tj-al-automation.js
// Uso: node tj-al-automation.js "0000000-00.0000.0.00.0000" 05 2024
// Ajuste os 'selectors' se a estrutura do site mudar.

const puppeteer = require('puppeteer');

if (process.argv.length < 5) {
  console.log('Uso: node tj-al-automation.js "<numero_processo>" <mes> <ano>');
  process.exit(1);
}


const PROCESS_NUMBER = process.argv[2] || ''; // vazio pega todos
const TARGET_MONTH = process.argv[3] || '';   // vazio pega todos
const TARGET_YEAR = process.argv[4] || '';    // vazio pega todos


// ----- CONFIGURAR AQUI se necessário -----
const config = {
  // Seletores candidatos para o campo de pesquisa (tente vários; o primeiro que der match será usado)
  searchFieldSelectors: [
    'input#numero',                 // exemplo hipotético
    'input[name="numero"]',
    'input[name*="processo"]',
    'input[type="text"]',
    'input[placeholder*="Número"]',
    'input[placeholder*="Pesquisar"]'
  ],
  // Seletores candidatos para botão de pesquisar
  searchButtonSelectors: [
    'button#btn-search',
    'button[type="submit"]',
    'input[type="submit"]',
    'button[title*="Pesquisar"]',
    'a[onclick*="pesquisar"]'
  ],
  // Seletores para linhas de resultado e para link do número (ajuste conforme HTML real da página)
  resultsRowSelectorCandidates: [
    'table.resultados tbody tr',
    'table#resultado tbody tr',
    'table tbody tr',     // fallback genérico - cuidado com falsos positivos
    '.resultado-linha'
  ],
  // Dentro de cada row, selector para data e para link do processo
  dateCellSelectors: ['td[data-col="data"]', 'td:nth-last-child(2)', 'td:nth-child(3)', '.col-data'],
  processLinkSelectors: ['a.process-number', 'a[href*="open.do?"]', 'a.linkProcesso', 'td a']
};
// -----------------------------------------

function monthYearMatches(text, mm, yyyy) {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  // tenta formatos comuns: dd/mm/yyyy, mm/yyyy, monthname yyyy
  const re1 = new RegExp(`\\b${mm}\\/${yyyy}\\b`); // mm/yyyy
  const re2 = new RegExp(`\\b\\d{1,2}\\/${mm}\\/${yyyy}\\b`); // dd/mm/yyyy
  const re3 = new RegExp(`${yyyy}`); // fallback (qualquer ocorrência do ano)
  return re1.test(normalized) || re2.test(normalized) || re3.test(normalized);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true, // ver o que está acontecendo - mudar para true para rodar em background
    defaultViewport: null
  });

  try {
    const page = await browser.newPage();
    await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // 1) localizar campo de busca
    let searchFieldHandle = null;
    for (const sel of config.searchFieldSelectors) {
      try {
        const el = await page.$(sel);
        if (el) { searchFieldHandle = el; break; }
      } catch(e){ /* ignora */ }
    }

    if (!searchFieldHandle) {
      console.warn('Campo de busca não encontrado automaticamente. Você deve ajustar os seletores em config.searchFieldSelectors.');
      await browser.close();
      return;
    }

    // 2) escrever o numero do processo
    await searchFieldHandle.click({clickCount: 3});
    await searchFieldHandle.type(PROCESS_NUMBER, {delay: 50});

    // 3) tentar submeter: clicar botão de pesquisa ou Enter
    let clicked = false;
    for (const sel of config.searchButtonSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      // fallback: pressionar Enter
      await searchFieldHandle.press('Enter');
    }

    // 4) aguardar resultados (ajuste timeout conforme sua conexão)
    await page.waitForTimeout(2000); // espera inicial
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(()=>{}); // nem sempre há navegação

    // 5) buscar linhas de resultado
    let rows = [];
    for (const sel of config.resultsRowSelectorCandidates) {
      const found = await page.$$(sel);
      if (found && found.length > 0) { rows = found; break; }
    }

    if (rows.length === 0) {
      console.warn('Nenhum resultado encontrado com os seletores atuais. Tente ajustar config.resultsRowSelectorCandidates.');
      await browser.close();
      return;
    }

    console.log(`Encontradas ${rows.length} linhas. Verificando datas...`);

    // 6) percorrer linhas e procurar data que contenha mês/ano
    let matchedLink = null;
    for (const row of rows) {
      // obter texto completo da linha
      const rowText = (await page.evaluate(el => el.innerText, row)).trim();
      // verificar data nas células usando os seletores candidatos
      let dateMatched = false;
      for (const dsel of config.dateCellSelectors) {
        try {
          const dateEl = await row.$(dsel);
          if (dateEl) {
            const dateText = (await page.evaluate(el => el.innerText, dateEl)).trim();
            if (monthYearMatches(dateText, TARGET_MONTH, TARGET_YEAR)) { dateMatched = true; break; }
          }
        } catch(e){}
      }
      // fallback: procurar mm/yyyy no texto da linha inteira
      if (!dateMatched && monthYearMatches(rowText, TARGET_MONTH, TARGET_YEAR)) dateMatched = true;

      if (dateMatched) {
        // tentar achar link do processo (link azul)
        for (const plsel of config.processLinkSelectors) {
          const linkHandle = await row.$(plsel);
          if (linkHandle) {
            const href = await page.evaluate(a => a.href || a.getAttribute('href'), linkHandle);
            if (href && href.trim() !== '') {
              matchedLink = href;
              break;
            }
          }
        }
        if (matchedLink) break;
      }
    }

    if (!matchedLink) {
      console.warn('Não achei nenhum link correspondente à data solicitada. Talvez seja necessário ajustar os seletores.');
      await browser.close();
      return;
    }

    console.log('Link encontrado:', matchedLink);

    // 7) abrir em nova aba (equivalente a Ctrl+Click)
    const newPage = await browser.newPage();
    await newPage.goto(matchedLink, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Detalhes do processo abertos em nova aba.');

    // Você pode fazer ações adicionais na nova aba aqui (salvar PDF, extrair informações, etc).
    // Exemplo: tirar um screenshot (descomente se quiser)
    // await newPage.screenshot({path: 'processo_detail.png', fullPage: true});

    // nota: manter o browser aberto para inspeção. Se quiser fechar automaticamente:
    // await browser.close();

  } catch (err) {
    console.error('Erro na automação:', err);
    await browser.close();
  }
})();
