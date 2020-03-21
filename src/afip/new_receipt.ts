import { Page } from "puppeteer";
import {
  getInputValue,
  getOptionsFromSelect,
  navigateWithClick,
  typeOnElem,
  getOptionsFromCheckboxes
} from "../utils";
import { getDateComponentInfo } from "./afip_utils";
import { receiptsPageKeepAlive } from "./fiscal_key_portal";

const generateReceipt = (page: Page) => async () => {
  await navigateWithClick(page, "input[value=\"Continuar >\"]");

  page.on("dialog", async function(dialog) {
    await dialog.accept();

    await page.waitFor((s) => {
      return document.getElementById(s).style.display === "block";
    }, {}, "botones_comprobante");

    await this.click("input[value='Imprimir...']");
  });

  await navigateWithClick(page, "#btngenerar");
};

const addProduct = (page: Page) => async (n: number, desc: string, amount: string, price: string) => {
  if (n > 1) {
    await page.click("input[value='Agregar línea descripción']");
  }

  await typeOnElem(page, `#detalle_descripcion${n}`, desc);

  await typeOnElem(page, `#detalle_cantidad${n}`, amount);

  await typeOnElem(page, `#detalle_precio${n}`, price);

  return [
    await getInputValue(page, "#imptotal"),
    generateReceipt(page),
  ];
};

const initReceiptContent = (page: Page) => async (meansOfPayment: string[]) => {
  await page.evaluate((arr: string[]) => {
    arr.forEach(mop => {
      (document.getElementById(mop) as HTMLInputElement).checked = true;
    });
  }, meansOfPayment);

  await navigateWithClick(page, "input[value=\"Continuar >\"]");

  await receiptsPageKeepAlive(page);

  return addProduct(page);
};

const getPaymentOptions = (page: Page) => async (commercialAddress: string) => {
  await page.select("select[name=domicilioReceptorCombo]", commercialAddress);

  return [
    await getOptionsFromCheckboxes(page, "input[name=formaDePago]"),
    initReceiptContent(page),
  ];
};

const getCommercialAddress = (page: Page) => async () => {
  return [
    await getOptionsFromSelect(page, "select[name=domicilioReceptorCombo]", async () => { return; }),
    getPaymentOptions(page)
  ];
};

const getBusinessDetails = (page: Page) => async (documentType: string, documentNumber: string) => {
  await page.select("select[name=idTipoDocReceptor]", documentType);

  await typeOnElem(page, "input[name=nroDocReceptor]", documentNumber);

  await Promise.all([
    page.waitForResponse(response => {
      const match = response.url().match(/(.*)\?/);
      return match ? match[1] === "https://serviciosjava2.afip.gob.ar/rcel/jsp/ajax.do" : false;
    }),
    // trigger onblur to load razon social field
    page.click("input[name=razonSocialReceptor]"),
  ]);
  // wait for javascript to load values
  await page.waitFor(500);

  return [
    await getInputValue(page, "input[name=razonSocialReceptor]"),
    getCommercialAddress(page),
  ];
};


const getDocumentType = (page: Page) => async (ivaCondition: string) => {
  await page.select("select[name=idIVAReceptor]", ivaCondition);

  return [
    await getOptionsFromSelect(page, "select[name=idTipoDocReceptor]"),
    getBusinessDetails(page),
  ];
};

const getIVACondition = (page: Page) => async (expirationDate?: string) => {
  // si existe expiration date, entonces ya estoy en la pantalla de datos del receptor, sino debo morverme a la misma
  if (expirationDate) {
    await page.evaluate((sel, val) => {
      $(sel).val(val);
    }, "input[name=vencimientoPago]", expirationDate);
  }

  await page.waitFor(500);

  // const test = await page.$("input[value=\"Continuar >\"]");
  await navigateWithClick(page, "input[value=\"Continuar >\"]");

  await receiptsPageKeepAlive(page);

  return [
    await getOptionsFromSelect(page, "select[name=idIVAReceptor]"),
    getDocumentType(page),
  ];
};

const getExpirationDate = (page: Page) => async (billedPeriodTo: string) => {
  await page.evaluate((sel, val) => {
    $(sel).val(val);
  }, "input[name=periodoFacturadoHasta]", billedPeriodTo);

  return [
    await getDateComponentInfo(page, "input[name=vencimientoPago]"),
    getIVACondition(page),
  ];
};


const getBilledPeriodTo = (page: Page) => async (billedPeriodFrom: string) => {
  await page.evaluate((sel, val) => {
    $(sel).val(val);
  }, "input[name=periodoFacturadoDesde]", billedPeriodFrom);

  return [
    await getDateComponentInfo(page, "input[name=periodoFacturadoHasta]"),
    getExpirationDate(page),
  ];
};

const getBilledPeriodFrom = async (page: Page) => {
  return [
    await getDateComponentInfo(page, "input[name=periodoFacturadoDesde]"),
    getBilledPeriodTo(page),
  ];
};

const getBilledPeriodFromOrIVACondition = (page: Page) => async (invoiceContentType: string) => {
  await page.select("#idconcepto", invoiceContentType);

  return invoiceContentType === "1" ? await getIVACondition(page)() : await getBilledPeriodFrom(page);
};

const getInvoiceContentTypes = (page: Page) => async (date: string) => {
  await page.evaluate((sel, val) => {
    $(sel).val(val);
  }, "input[name=fechaEmisionComprobante]", date);

  return [
    await getOptionsFromSelect(page, "#idconcepto"),
    getBilledPeriodFromOrIVACondition(page),
  ];
};

const getBillValidDatesAndDefaultValue = (page: Page) => async (receiptType: string) => {
  await page.select("select[name=universoComprobante]", receiptType);

  await navigateWithClick(page, "input[value=\"Continuar >\"]");

  await receiptsPageKeepAlive(page);

  return [
    await getDateComponentInfo(page, "input[name=fechaEmisionComprobante]"),
    getInvoiceContentTypes(page),
  ];
};

const getReceiptsTypes = (page: Page) => async (salePoint: string) => {
  await page.select("select[name=puntoDeVenta]", salePoint);

  return [
    await getOptionsFromSelect(page, "select[name=universoComprobante]"),
    getBillValidDatesAndDefaultValue(page),
  ];
};

const getSalePoints = (page: Page) => async (business: string) => {
  await navigateWithClick(page, `input[value="${business}"][type=button]`);

  // go to "Generar comprobantes page"
  await navigateWithClick(page, "#btn_gen_cmp");

  await receiptsPageKeepAlive(page);

  return [await getOptionsFromSelect(page, "select[name=puntoDeVenta]"), getReceiptsTypes(page)];
};

export async function getCompaniesToRepresent(receiptsPage: Page): Promise<[string[], any]> {
  await receiptsPage.waitForSelector("input[type=button]");

  const businesses = await receiptsPage.evaluate(
    (s: string) => Array.from($(s)).map((e) => (e as HTMLInputElement).value),
    "input[type=button]"
  ) as string[];

  return [businesses, getSalePoints(receiptsPage)];
}


