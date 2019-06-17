/**
 * Copyright (C) ConnectEx, Inc - All Rights Reserved.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 * Written by Oscar Davies <zorbytee@gmail.com>, June 2019.
 */

import { join } from "path";
import rimraf = require("rimraf");
import LambdaManager from "./master/LambdaManager";

require("dotenv").config({ path: join(__dirname, "..", "..", ".env") });

const debug = require("debug")("cλ:master");

const manager = new LambdaManager();

debug("Creating lambda manager.");
manager.create()
  .catch(console.error)
  .then(() => {
    debug("Created lambda manager.");
  });

// Tell node that we don't want to exit immediately.
process.stdin.resume();

// Cleanup the process before exiting.
process.on("exit", () => {
  // Remove the temp directory when the app is closing.
  if (manager.get && manager.get.homeDir) {
    debug("Cleaning up directory.");
    rimraf.sync(manager.get.homeDir);
  }
});

// Catches ctrl+c event.
process.on("SIGINT", () => process.exit());

// Catches "kill pid".
process.on("SIGUSR1", () => process.exit());
process.on("SIGUSR2", () => process.exit());
