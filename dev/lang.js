#!/usr/bin/env node

import { spawn } from "node:child_process";
import { lstatSync, readdirSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const langDir = "./src/lang";
const typedefFile = "./src/lang/main.d.ts";
const action = process.argv[2];
const fix = process.argv.includes("--fix");
const skipKeys = [
  "lang",
  "langName",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
  "zadigGuide",
  "zadigGuideMessage",
  "zadig1",
  "zadig2",
  "zadig3",
  "zadig4",
  "zadig5",
  "zadig6",
];

const input = createInterface({
  input: process.stdin,
  output: process.stdout,
});

let newKey;
const translations = {};

main()
  .then(() => {})
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

async function main() {
  let keyFlag = false;
  let translationFlag = false;
  for (const arg of process.argv.slice(3)) {
    if (keyFlag) {
      newKey = arg;
      keyFlag = false;
      continue;
    }

    if (translationFlag) {
      const [lang, value] = arg.split("=");
      translations[lang] = value;
      translationFlag = false;
      continue;
    }

    if (["--key", "-k"].includes(arg)) {
      keyFlag = true;
      continue;
    }

    if (["--translation", "-t"].includes(arg)) {
      translationFlag = true;
    }
  }

  switch (action) {
    case "check":
      await check(fix);
      break;
    case "add":
      await add();
      break;
    case "remove":
      await remove();
      break;
    case "format":
      await formatAll();
      break;
    default:
      process.stdout.write(`${red("Oh no!")} ${red("Invalid action")}\n`);
      process.stdout.write("Usage: npm run lang [check|add|remove] [--fix]\n\n");
  }

  process.stdout.write("\n");
  input.close();
  process.exit();
}

async function add() {
  const [englishData, languages] = await getLangFiles();
  const key = newKey || (await getUserInput(`${blue("Enter the key")}\n`));

  if (key in englishData) {
    process.stdout.write(`${red("Key")} "${teal(key)}" ${red("already exists")}\n`);
    await add();
    return;
  }

  englishData[key] = translations.english || (await getUserInput(`${blue("Enter the value in")} ${teal("english")}\n`));

  for (const [name, lang] of Object.entries(languages)) {
    lang[key] = translations[name] || (await getKeyValue(englishData[key], name, `${name}.js`)) || englishData[key];
  }

  await writeFile(`${langDir}/english.js`, `export default ${JSON.stringify(englishData, null, 2)};`);
  for (const [name, lang] of Object.entries(languages)) {
    await writeFile(`${langDir}/${name}.js`, `export default ${JSON.stringify(lang, null, 2)};`);
  }

  process.stdout.write(`\n${green("Key")} "${teal(key)}" ${green("has been added")}\n`);
  await format();
}

async function remove() {
  const [englishData, languages] = await getLangFiles();
  const key = process.argv[3] || (await getUserInput(`${blue("Enter the key")}\n`));

  if (!(key in englishData)) {
    process.stdout.write(`${red("Key")} "${teal(key)}" ${red("does not exist")}\n`);
    await remove();
    return;
  }

  delete englishData[key];

  for (const [, lang] of Object.entries(languages)) {
    delete lang[key];
  }

  const confirm = await getUserInput(`${blue("Are you sure you want to delete")} ${teal(key)} ${blue("from all languages?")} ${light("(y/n)")}\n`);
  if (confirm.toLowerCase() !== "y") {
    process.stdout.write(`${red("Key")} "${teal(key)}" ${red("has not been removed")}\n`);
    return;
  }

  await writeFile(`${langDir}/english.js`, `export default ${JSON.stringify(englishData, null, 2)};`);
  for (const [name, lang] of Object.entries(languages)) {
    await writeFile(`${langDir}/${name}.js`, `export default ${JSON.stringify(lang, null, 2)};`);
  }

  process.stdout.write(`\n${green("Key")} "${teal(key)}" ${green("has been removed")}\n`);
  await format();
}

async function check(fix = false) {
  const [englishData, languages] = await getLangFiles();
  const jsFiles = await Promise.all(getAllSrcJsFiles().map((file) => readFile(file, "utf8")));

  let missingKeys = 0;
  let redundantKeys = 0;
  const deletedKeys = [];

  for (const key in englishData) {
    if (!skipKeys.includes(key)) {
      let keyUsed = false;

      for (const jsFile of jsFiles) {
        if (new RegExp(`((\\.get\\([^)]*?['"]${key}['"][^)]*?\\))|(text\\s*=\\s*['"]${key}['"]))`, "g").test(jsFile)) {
          keyUsed = true;
        }
      }

      if (!keyUsed) {
        deletedKeys.push(key);
        if (!fix) {
          process.stdout.write(`❗ ${red("Key")} "${teal(key)}" ${red("is not used")}\n`);
        } else {
          process.stdout.write(`❗ "${teal(key)} ${green("will be deleted")}\n`);
        }
      }
    }

    for (const [name, lang] of Object.entries(languages)) {
      const exists = key in lang;

      if (deletedKeys.includes(key)) {
        if (fix && exists) {
          delete lang[key];
        }

        continue;
      }

      if (!exists) {
        missingKeys++;
      }

      if (!exists && fix) {
        process.stdout.write(`❗ ${red("Key")} "${teal(key)}" ${red("is missing from")} ${blue(`${name}.js`)}\n`);
        lang[key] = (await getKeyValue(englishData[key], name, `${name}.js`)) || englishData[key];
      } else if (!exists && !fix) {
        process.stdout.write(`❗ ${red("Key")} "${teal(key)}" ${red("is missing from")} ${blue(lang.langName)}\n`);
      }
    }
  }

  for (const [name, lang] of Object.entries(languages)) {
    for (const key in lang) {
      if (!(key in englishData)) {
        redundantKeys++;
        if (fix) {
          process.stdout.write(`🔄 ${teal(key)} ${green("will be delete from")} ${blue(`${name}.js`)}\n`);
          delete lang[key];
        } else {
          process.stdout.write(`❗ ${red("Key")} "${teal(key)}" ${red("is redundant")} in ${blue(`${name}.js`)}\n`);
        }
      }
    }
  }

  process.stdout.write("\n");
  if (missingKeys) {
    if (fix) {
      process.stdout.write(`🔄 ${green("Total")} ${blue(missingKeys)} ${green(`${missingKeys > 1 ? "keys" : "key"} will be fixed`)}\n`);
    } else {
      process.stdout.write(`${red(missingKeys)} ${red("keys are missing")}\n`);
    }
  }

  if (deletedKeys.length) {
    if (fix) {
      for (const key of deletedKeys) {
        delete englishData[key];
      }
      process.stdout.write(
        `🔄 ${green("Total")} ${blue(deletedKeys.length)} ${green(`${deletedKeys.length > 1 ? "keys" : "key"} will be deleted`)}\n`,
      );
    } else {
      process.stdout.write(`${red(deletedKeys.length)} ${red(`keys ${deletedKeys.length > 1 ? "are" : "is"} not used`)}\n`);
    }
  }

  if (redundantKeys) {
    if (fix) {
      process.stdout.write(`🔄 ${green("Total")} ${blue(redundantKeys)} ${green(`${redundantKeys > 1 ? "keys" : "key"} will be deleted`)}\n`);
    } else {
      process.stdout.write(`${red(redundantKeys)} ${red("keys are redundant")}\n`);
    }
  }

  if (!missingKeys && !redundantKeys && !deletedKeys.length) {
    process.stdout.write(`${green("All keys are up to date!")}\n`);
  } else if (fix) {
    const confirm = await getUserInput(`\n${blue("Would you like to fix the issues?")} ${light("(y/n)")}\n`);
    if (confirm.toLowerCase() === "y") {
      await writeFile(`${langDir}/english.js`, `export default ${JSON.stringify(englishData, null, 2)};`);
      for (const [name, lang] of Object.entries(languages)) {
        await writeFile(`${langDir}/${name}.js`, `export default ${JSON.stringify(lang, null, 2)};`);
      }

      await format();
    }
  } else {
    process.exit(1);
  }
}

async function format() {
  const englishData = await getLangData("english.js");
  const keys = Object.keys(englishData);
  const typedef = `type LangKeys = ${keys.map((key) => `"${key}"`).join(" | ")};`;

  await writeFile(typedefFile, typedef, "utf8");
}

async function formatAll() {
  const [englishData, languages] = await getLangFiles();
  await writeFile(`${langDir}/english.js`, `export default ${JSON.stringify(englishData, null, 2)};`);
  for (const [name, lang] of Object.entries(languages)) {
    await writeFile(`${langDir}/${name}.js`, `export default ${JSON.stringify(lang, null, 2)};`);
  }
}

async function getUserInput(question) {
  input.setPrompt(`${question}> `);
  input.prompt();
  return new Promise((resolve, _reject) => {
    input.on("line", (line) => {
      resolve(line);
    });
  });
}

async function getLangFiles() {
  const langFiles = (await readdir(langDir)).filter((file) => !["english.js", "index.js", "fonts", "main.d.ts"].includes(file));
  const englishData = await getLangData("english.js");
  const languages = {};

  for (const file of langFiles) {
    languages[file.replace(".js", "")] = await getLangData(file);
  }

  return [englishData, languages, langFiles];
}

async function getKeyValue(value, lang, file) {
  if (process.platform === "darwin" || process.platform === "linux") {
    const pbcopy = spawn("pbcopy", [], { stdio: "pipe" });
    pbcopy.stdin.write(value);
    pbcopy.stdin.end();
    process.stdout.write(`\n${italic("i")} "${teal(value)}" ${light("copied!")}\n`);
  } else {
    process.stdout.write("\n");
  }

  return getUserInput(`${blue(value)} in ${teal(lang)} (${file})\n`);
}

function getAllSrcJsFiles() {
  const files = [];
  const ignore = ["res", "lang", "schemas", "themes"];
  getFiles("./src");
  return files;

  function getFiles(dir) {
    const dirFiles = readdirSync(dir);

    for (const file of dirFiles) {
      if (ignore.includes(file)) {
        continue;
      }
      const entry = `${dir}/${file}`;
      if (lstatSync(entry).isDirectory()) {
        getFiles(entry);
      } else if (file.endsWith(".js")) {
        files.push(entry);
      }
    }
  }
}

/**
 * Get the language data from a file
 * @param {string} lang
 * @returns
 */
async function getLangData(lang) {
  const langData = await readFile(`${langDir}/${lang}`, "utf8");
  // biome-ignore lint/security/noGlobalEval: for development only
  return eval(`(()=>{${langData.replace("export default", "const lang =")}\nreturn lang;})()`);
}

function red(message) {
  const red = "\x1b[31m";
  const reset = "\x1b[0m";
  return `${red}${message}${reset}`;
}

function green(message) {
  const green = "\x1b[32m";
  const reset = "\x1b[0m";
  return `${green}${message}${reset}`;
}

function blue(message) {
  const blue = "\x1b[34m";
  const reset = "\x1b[0m";
  return `${blue}${message}${reset}`;
}

function teal(message) {
  const teal = "\x1b[36m";
  const reset = "\x1b[0m";
  return `${teal}${message}${reset}`;
}

function light(message) {
  // style like ghost text
  const light = "\x1b[2m";
  const reset = "\x1b[0m";
  return `${light}${message}${reset}`;
}

function italic(message) {
  const italic = "\x1b[3m";
  const reset = "\x1b[0m";
  return `${italic}${message}${reset}`;
}
