import {BrowserContext, Page} from "puppeteer";

const PORTAL_URL = "https://portalcf.cloud.afip.gob.ar/portal/app/";

async function openPortalCVPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(PORTAL_URL, { waitUntil: "networkidle0" });
  return page;
}

export async function receiptsPageKeepAlive(page: Page) {
  await page.evaluate(() => {
    setInterval(() => {
      window.fetch(`https://serviciosjava2.afip.gob.ar/rcel/jsp/ajax.do?f=keepalive&r=${Math.random()}`);
    }, 30000);
  });
}

export async function openReceiptsPage(context: BrowserContext) {
  const page = await openPortalCVPage(context);

  await page.waitForXPath("//a//*[contains(text(),\'Mis Servicios\')]");

  const [servicesBtn] = await page.$x("//a//*[contains(text(),\'Mis Servicios\')]");
  if (servicesBtn) {
    await servicesBtn.click();
  } else {
    throw new Error("Problem loading comprobantes!");
  }

  await page.waitForXPath("//h4[contains(text(),\'Comprobantes en línea\')]");

  const [link] = await page.$x("//h4[contains(text(),\'Comprobantes en línea\')]");

  const [popup] = await Promise.all([
    (new Promise(resolve => page.once("popup", resolve))) as Promise<Page>,
    link.click(),
  ]);

  // await popup.waitForNavigation({ waitUntil: "networkidle0" });
  // keep alive
  await receiptsPageKeepAlive(popup);

  // await page.close();

  return popup;
}

