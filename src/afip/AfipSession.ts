import { Browser, BrowserContext, Page } from "puppeteer";
import { navigateWithClick, typeOnElem } from "../utils";

const LOGIN_URL = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
const KEEP_ALIVE_URL = "https://portalcf.cloud.afip.gob.ar/portal/api/portal/info";


// Usage:
//   const session = newSession(browser)(myCuit)(myPassword);
//   const page = session.getContext().goto('someafipweb');
export const newAfipSession = async (browser: Browser) => {
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();
    await page.goto(LOGIN_URL);

    return async (cuit: string) => {
        await typeOnElem(page, "input[name=\"F1:username\"]", cuit);

        await navigateWithClick(page, "input[type=submit]");

        const cuitErrorMsg = await page.evaluate((s) => {
            const errorDiv = document.querySelector(s);
            return errorDiv ? errorDiv.innerText : null;
        }, "#F1\\:msg");

        if (cuitErrorMsg) {
            throw new Error(cuitErrorMsg);
        }

        return async (password: string) => {
            // return the session object decorated with keepAlive
            await typeOnElem(page, "input[name=\"F1:password\"]", password);

            await Promise.all([
                // there's multiple redirections, see more info https://es.programqa.com/question/46948489/
                page.waitForNavigation({ waitUntil: "networkidle0" }), // The promise resolves after navigation has finished
                page.click("input[type=submit]"), // Clicking the link will indirectly cause a navigation
            ]);

            const cuitErrorMsg = await page.evaluate((s) => {
                const errorDiv = document.querySelector(s);
                return errorDiv ? errorDiv.innerText : null;
            }, "#F1\\:msg");

            if (cuitErrorMsg) {
                throw new Error(cuitErrorMsg);
            }

            await page.evaluate(() => {
                setInterval(() => { window.fetch(KEEP_ALIVE_URL); }, 30000);
            });

            return page.browserContext();
        };
    };
};
