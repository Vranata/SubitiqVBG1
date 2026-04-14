import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`PAGE LOG [${msg.type()}]:`, msg.text());
    }
  });

  page.on('response', async response => {
    const status = response.status();
    if (status >= 400) {
      console.log(`NETWORK ERROR [${status}]: ${response.request().method()} ${response.url()}`);
      try {
        const text = await response.text();
        console.log(`Response body: ${text.substring(0, 300)}`);
      } catch (e) { }
    }
  });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  await browser.close();
  console.log('Done.');
})();
