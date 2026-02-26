const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const htmlPath = path.resolve(__dirname, '..', 'booklets', 'nlp-booklet-branded.html');
  const pdfPath = path.resolve(__dirname, '..', 'booklets', 'nlp-booklet-branded.pdf');

  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  console.log('Loading:', fileUrl);

  await page.goto(encodeURI(fileUrl), { waitUntil: 'networkidle0', timeout: 30000 });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', right: '15mm', bottom: '15mm', left: '15mm' }
  });

  await browser.close();
  console.log('PDF generated:', pdfPath);
})();
