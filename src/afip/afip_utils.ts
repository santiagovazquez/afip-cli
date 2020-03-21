import { Page } from "puppeteer";

type DateComponentInfo = {
  defaultValue: string;
  validDates: string[];
};


export async function getDateComponentInfo(page: Page, dateInputSelector: string): Promise<Readonly<DateComponentInfo>> {
  const VALID_DAYS_SELECTOR = ".calendar td:not(.name):not(.wn).day.false";

  await page.waitForSelector(dateInputSelector);

  // clicks on calendar to load calendar info
  await page.evaluate((selector) => {
    document.querySelector(selector).nextElementSibling.click();
  }, dateInputSelector);

  // wait for children to load
  await page.waitFor((s) => document.querySelectorAll(s).length > 1, {}, VALID_DAYS_SELECTOR);

  const defaultValue = await page.evaluate((selector) => document.querySelector(selector).value, dateInputSelector);

  const validDates = await page.evaluate((selector) => {
    const tds = $(selector).toArray();
    const calendarObject = tds[0].calendar;
    return tds.map(e => e.caldate.print(calendarObject.dateFormat));
  }, VALID_DAYS_SELECTOR);

  // clicks on input to close calendar
  await page.click(dateInputSelector);

  return { defaultValue, validDates };
};
