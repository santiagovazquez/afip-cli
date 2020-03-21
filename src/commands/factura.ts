import {
  inquirerList,
  inquirerDate,
  printCheckedTask,
  ListChoice,
  inquirerChecks,
  printErrorMessage,
  inquirerYesNo,
  printInformationMessage,
  printTitleMessage,
} from "../utils";
import {
  askPassword,
  askInput,

} from "../prompt";
import { newAfipSession }  from "../afip/AfipSession";
import { default as puppeteer } from "puppeteer";
import { openReceiptsPage } from "../afip/fiscal_key_portal";
import * as newReceipt from "../afip/new_receipt";
import { default as inquirer, ChoiceOptions } from "inquirer";
const env = process.env.NODE_ENV || "development";
const isDev = env === "development";


async function cmd() {
  let browser, session;

  try {
    browser =  await puppeteer.launch({ headless: !isDev, devtools: isDev });

    // Execute in parallel a newSession and ask for cuit
    const [ setCuit, cuit ] = await Promise.all([
      newAfipSession(browser),
      askInput("Ingrese CUIT: "),
    ]);

    const setPassword = await setCuit(cuit);
    const password = await askPassword("Ingrese Contraseña: ");
    session = await setPassword(password);

    const receiptsPage = await openReceiptsPage(session);
    const [ businesses, getSalePoints ] = await newReceipt.getCompaniesToRepresent(receiptsPage);

    const businessSelected = await inquirerList({
      message: "Seleccione empresa: ",
      choices: businesses,
      default: businesses[0],
      oneMessage: "Unica empresa disponible:",
    });

    const [ salePoints, getReceiptsTypes ] = await getSalePoints(businessSelected);

    const salePoint = await inquirerList({
      message: "Seleccione punto de venta: ",
      choices: salePoints,
      default: salePoints[0],
      oneMessage: "Único punto de venta disponible:",
    }) as string;

    const [ receiptTypes, getBillValidDatesAndDefaultValue ] = await getReceiptsTypes(salePoint);

    // For now we only accept "factura C" as receipt type
    const { value: receiptType } = receiptTypes.find((rt: ListChoice) => rt.name.match(/Factura C/));

    const [ {
      defaultValue: defaultBillDateValue,
      validDates: validBillDates
    }, getInvoiceContentTypes ] = await getBillValidDatesAndDefaultValue(receiptType);

    const billDate = await inquirerDate({
      default: defaultBillDateValue,
      message: "Fecha del comprobante (en formato DD/MM/AAAA): ",
      validDates: validBillDates,
    });

    const [ invoiceContentTypes, next ] = await getInvoiceContentTypes(billDate);

    const invoiceContentType = await inquirerList({
      message: "Seleccione el concepto a incluir: ",
      choices: invoiceContentTypes,
      default: invoiceContentTypes[0],
    }) as string;

    let ivaConditions;
    let getDocumentType;

    if (invoiceContentType !== "1") {
      const getBilledPeriodFrom = next;
      const [ {
        defaultValue: billedPeriodFromDefault,
        validDates: billedPeriodFromValidDates,
      }, getBilledPeriodTo ] = await getBilledPeriodFrom(invoiceContentType);

      const billedPeriodFrom = await inquirerDate({
        default: billedPeriodFromDefault,
        message: "Período facturado desde (en formato DD/MM/AAAA): ",
        validDates: billedPeriodFromValidDates,
      });

      const [ {
        defaultValue: billedPeriodToDefault,
        validDates: billedPeriodToValidDates,
      }, getExpirationDate ] = await getBilledPeriodTo(billedPeriodFrom);

      const billedPeriodTo = await inquirerDate({
        default: billedPeriodToDefault,
        message: "Período facturado hasta (en formato DD/MM/AAAA): ",
        validDates: billedPeriodToValidDates,
      });

      const [{
        defaultValue: expirationDateDefault,
        validDates: expirationDateValidDates,
      }, getIVACondition ] = await getExpirationDate(billedPeriodTo);

      const expirationDate = await inquirerDate({
        default: expirationDateDefault,
        message: "Vencimiento para el pago (en formato DD/MM/AAAA): ",
        validDates: expirationDateValidDates,
      });

      [ ivaConditions, getDocumentType ] = await getIVACondition(expirationDate);
    } else {
      const getIVACondition = next;
      [ ivaConditions, getDocumentType ] = await getIVACondition(invoiceContentType);
    }

    const ivaCondition = await inquirerList({
      message: "Seleccione la condición frente al IVA: ",
      choices: ivaConditions,
      default: ivaConditions[0],
    }) as string;

    const [ documentTypes, getBusinessDetails ] = await getDocumentType(ivaCondition);

    const documentType = await inquirerList({
      message: "Seleccione el tipo de documento: ",
      choices: documentTypes,
      default: documentTypes[0],
    }) as string;
    const documentName = documentTypes.find((e: ChoiceOptions) => e.value === documentType).name;
    const documentNumber = await askInput(`Número de ${documentName}:`);

    const [businessDetails, getCommercialAddress] = await getBusinessDetails(documentType, documentNumber);

    printCheckedTask("Razón social: ", businessDetails);

    const [commercialAddresses, getPaymentOptions] = await getCommercialAddress();

    let commercialAddress = "";

    if (commercialAddresses.length === 0) {
      const writeCommercialAddress = (ivaCondition === "5" && await inquirerYesNo("Quiere agregar el domicio comercial?"))
        || ivaCondition !== "5";
      if (writeCommercialAddress) { // consumidor final
        commercialAddress = await askInput("Domicilio comercial: ");
      }
    } else {
      commercialAddress = await inquirerList({
        message: "Seleccione el domicilio comercial: ",
        choices: commercialAddresses.concat({ value: "otro", name: "Otro..." }),
        default: commercialAddresses[0],
        oneMessage: "Único domicilio comercial disponible:",
      }) as string;

      if (commercialAddress === "otro") {
        commercialAddress = await askInput("Domicilio comercial: ");
      }
    }

    const [ paymentOptions, initReceiptContent ] = await getPaymentOptions(commercialAddress);

    let meansOfPayment;

    do {
      meansOfPayment = await inquirerChecks({
        message: "Medios de pago:",
        choices: paymentOptions,
      });

      if (meansOfPayment.length === 0) {
        printErrorMessage("Seleccione al menos un medio de pago");
      }
    } while (meansOfPayment.length === 0);

    const addProduct = await initReceiptContent(meansOfPayment);
    let addNewProduct = false;
    let nProduct = 1;
    let currentTotal = 0;
    let generateReceipt;

    do {
      printTitleMessage(`Producto ${nProduct}`);
      const desc = await askInput("Descripción del producto/servicio: ");
      const amount = await askInput("Cantidad: ");
      const price = await askInput("Precio: ");
      [ currentTotal, generateReceipt ] = await addProduct(nProduct, desc, amount, price);

      printInformationMessage(`Importe total: ${currentTotal}`);

      addNewProduct = await inquirerYesNo("Desea agregar otro producto?");

      nProduct++;
    } while (addNewProduct);


    const generate = await inquirerYesNo(`Desea generar la factura por $${currentTotal} ?`);

    if (generate) {
      await generateReceipt();
    }

    const { end } = await inquirer.prompt([
      {
        name: "end",
        type: "confirm",
        message: "Terminar?"
      }
    ]);
  } catch (e) {
    throw e;
  } finally {
    if (session) await session.close();
    if (browser) await browser.close();
  }

  return;
}

export default function factura() {
  cmd()
      .then(() => {
        console.log("success!");
      })
      .catch((e) => {
        console.log("error", e);
      })
      .finally(() => {
        console.log("end");
      });
};
