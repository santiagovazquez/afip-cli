#!/usr/bin/env node
import factura from "./commands/factura";
import { getConfig } from "./config";
import { Argv, Arguments } from "yargs";
// const log = require('why-is-node-running') // should be your first require

// setTimeout(function () {
//   log() // logs out active handles that are keeping node running
// }, 30000)

require("yargs")
  // .config(getConfig())
  .command(["factura [app]", "run", "up"], "Start up an app", {}, factura)
  .command({
    command: "configure <key> [value]",
    aliases: ["config", "cfg"],
    desc: "Set a config variable",
    builder: (yargs: Argv) => yargs.default("value", "true"),
    handler: (argv: Arguments) => {
      console.log(`setting ${argv.key} to ${argv.value}`);
    }
  })
  .demandCommand()
  .help()
  .wrap(72)
  .argv;
