import readline from "readline";
import _ from "lodash";
import chalk from "chalk";
import figures from "figures";
import { Page } from "puppeteer";
import spinner from "./spinner";
import { default as inquirer, ListQuestion } from "inquirer";

export function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve, reject) => {
    rl.question(question, (answer: string) => {
      resolve(answer.trim());
      rl.close();
    });
  });
}

export async function typeOnElem(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  // reset value to do not append content
  await page.evaluate((selector) => {
    document.querySelector(selector).value = "";
  }, selector);

  await page.click(selector);
  await page.keyboard.type(value);
}

export async function getInputValue(page: Page, selector: string) {
  await page.waitForSelector(selector);
  return await page.evaluate((selector) => document.querySelector(selector).value, selector);
}

export async function navigateWithClick(page: Page, selector: string) {
  await page.waitForSelector(selector);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }), // The promise resolves after navigation has finished
    page.click(selector), // Clicking the link will indirectly cause a navigation
  ]);
}

export async function askToSelectAnOptionFromList(question: string, list: { value: any; label: string }[]): Promise<any> {
  const defaultOption = list[0];
  const qstString = list
    .map(({ value, label }) => `${value}) ${label}`)
    .join("\n");

  if (list.length === 1) {
    console.log(`${question}\nSeleccionada única opción: ${defaultOption.label}`);
    return defaultOption;
  }

  const prompt = `opción: (${defaultOption.value}) `;
  const answer = await askQuestion(`${question}\n${qstString}\n${prompt}`);
  const el = list.find((o) => `${o.value}` === answer);

  if (answer === "") {
    return defaultOption;
  } else if (!el) {
    console.log("Opción inválida. Ingrese una opción válida.");
    return await askToSelectAnOptionFromList(question, list);
  }

  return el;
}

export async function askToSelectOptionsFromCheckboxes(page: Page, text: string, loadingText: string, checkboxSelector: string) {
  await page.waitForSelector(checkboxSelector);

  const checkboxOptions = await page.evaluate((selector) => {
    const checkboxes = Array.from(document.querySelectorAll(selector));
    return checkboxes.map((cb, idx) => ({
      label: (document.querySelector(`label[for=${cb.id}]`) as HTMLElement).innerText,
      value: idx + 1,
      origValue: cb.id,
    }));
  }, checkboxSelector);

  // right now we are only supporting one option
  const check = await askToSelectAnOptionFromList(text, checkboxOptions);

  await page.evaluate((id) => {
    (document.getElementById(id) as HTMLInputElement).checked = true;
  }, check.origValue);
}

export async function getOptionsFromCheckboxes(page: Page, checkboxSelector: string) {
  await page.waitForSelector(checkboxSelector);

  return await page.evaluate((selector) => {
    const checkboxes = Array.from(document.querySelectorAll(selector));
    return checkboxes.map((cb, idx) => ({
      name: (document.querySelector(`label[for=${cb.id}]`) as HTMLElement).innerText,
      value: cb.id,
    }));
  }, checkboxSelector);
}

async function waitForOptionsToLoad(page: Page, selectSelector: string) {
  await page.waitFor((s) => {
    return (Array.from(document.querySelectorAll(`${s} > option`)) as HTMLOptionElement[])
      .filter(o => o.value !== "")
      .length >= 1;
  }, {}, selectSelector);
}

export async function getOptionsFromSelect(page: Page, selectSelector: string, waitFn = waitForOptionsToLoad ): Promise<{ value: string; name: string }[]> {
  await waitFn(page, selectSelector);

  return await page.evaluate((selector: string) => {
    return (Array.from($(`${selector} > option`)) as HTMLOptionElement[])
      .filter(e => e.value !== "")
      .map(e => ({
        name: e.innerText,
        value: e.value,
      }));
  }, selectSelector);
}

export async function askToSelectAnOptionFromSelect(page: Page, question: string, selectSelector: string, conf: { loadingText: string; mapValue?: (v: any, idx: number) => any }) {
  const {
    loadingText = "Cargando opciones...",
    mapValue = (v: any) => v,
  } = conf;
  spinner.start(loadingText);

  const options = await getOptionsFromSelect(page, selectSelector);

  spinner.stop();
  const option =  await askToSelectAnOptionFromList(
    question,
    options.map((e, idx) => ({
      label: e.name,
      value: mapValue(e.value, idx),
      origValue: e.value
    }))
  );

  await page.select(selectSelector, option.origValue);

  return option;
}

export async function askValueForInput(page: Page, question: string, selector: string, { defaultValue = "", isValid = (value: string) => true }) {
  let value = await askQuestion(`${question} (${defaultValue})`);

  while(!isValid(value)) {
    console.log("Valor inválido. Vuelva a intentar");
    value = await askQuestion(question);
  }

  await typeOnElem(page, selector, value);
}

export async function askForDate(page: Page, question: string, loadingText: string, dateInputSelector: string): Promise<string> {
  const VALID_DAYS_SELECTOR = ".calendar td:not(.name):not(.wn).day.false";

  spinner.start(loadingText);

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
  const prompt = `Escriba fecha en formato DD/MM/AAAA: (${defaultValue}) `;

  const promptMsg = `${question}\n${prompt}`;
  // print valid format
  spinner.stop();
  const date = await askQuestion(promptMsg) || defaultValue;

  // validate
  if (!_.includes(validDates, date)) {
    console.log("¡Fecha inválida! Los posibles valores son:");
    console.log(validDates.join(", "));
    return await askForDate(page, question, loadingText, dateInputSelector);
  }

  await page.click(dateInputSelector);

  await page.evaluate((sel, val) => {
    $(sel).val(val);
  }, dateInputSelector, date);

  return date;
}

export function printCheckedTask(prefix: string, message: string) {
  console.log(chalk.green(figures.tick), chalk.bold(prefix), chalk.cyan(message));
}

export function printErrorMessage(msg: string) {
  console.log(chalk.red(figures.warning), chalk.bold(msg));
}

export function printInformationMessage(msg: string) {
  console.log(figures.info, chalk.bold(msg));
}

export function printTitleMessage(msg: string) {
  console.log(figures.bullet, chalk.bold(msg));
}

/**
 *
 */

export type ListChoice = { value: any; name: string };

type PartialListQuestion = Pick<ListQuestion, "message" | "default"> & {
  oneMessage?: string;
  choices: string[] | ListChoice[];
};

export async function inquirerList({ message, default: choiceDefault, choices, oneMessage = "" }: PartialListQuestion): Promise<string> {
  const ret = choices[0];

  if (choices.length === 1) {
    printCheckedTask(oneMessage, ret.hasOwnProperty("name") ? (ret as ListChoice)["name"] : (ret as string));
    return ret.hasOwnProperty("value") ? (ret as ListChoice)["value"] : (ret as string);
  }

  const { myChoice } = await inquirer.prompt({
    name: "myChoice",
    type: "list",
    default: choiceDefault,
    message,
    choices,
  });

  return myChoice;
}

export async function inquirerChecks({ message, choices }: { message: string; choices: ListChoice[] }) {
  const { myChoice } = await inquirer.prompt({
    name: "myChoice",
    type: "checkbox",
    message,
    choices,
  });

  return myChoice;
}

export async function inquirerYesNo(message: string): Promise<boolean> {
  const { end } = await inquirer.prompt({
    name: "end",
    type: "confirm",
    message
  });
  return end;
}

// "Fecha del comprobante (en formato DD/MM/AAAA): "
export async function inquirerDate({ default: defaultValue, validDates, message }: { default: string; validDates: string[]; message: string }) {
  const { billDate: date } = await inquirer.prompt({
    name: "billDate",
    type: "input",
    default: defaultValue,
    message,
    validate: async function(input: string) {
      if (!input.match(/[0-9]{2}\/[0-9]{2}\/[0-9]{4}/)) {
        return "Formato de fecha inválido. Debe estar en el formato DD/MM/AAAA";
      }

      if (!validDates.includes(input)) {
        return `Fecha inválida. Las fechas posibles son ${validDates.join(", ")}`;
      }
      return true;
    }
  });
  return date;
}
