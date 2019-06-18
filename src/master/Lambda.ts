import { fork, setupMaster } from "cluster";
import execa = require("execa");
import { promisify } from "util";

// FS operations.
import rimrafCb = require("rimraf");
import dirExists = require("directory-exists");
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Managers
import LambdaManager from "./LambdaManager.js";
import IPC from "./IPC";
import { DEPENDENCIES } from "../constants.js";

type TOnReadyFunc = () => void | any;

const debug = require("debug")("tλ:master:builder");;
const rimraf = promisify(rimrafCb);

class Lambda {
  // File paths.
  private bridgeFile!: string;
  private appFile!: string;
  private requireFile!: string;
  public homeDir!: string;

  // Function data.
  private pkg: any;
  private ipc = new IPC();

  // Internals.
  private onReadyFn!: TOnReadyFunc;

  // Git information.
  public branch: string;
  private remote!: string;

  constructor(public ID: string, public manager: LambdaManager) {
    debug("Verifying git details.");
    this.branch = process.env.BRANCH || "master";
    if (!process.env.REPOSITORY) {
      console.error("No Git repository provided!");
      process.exit();
    } else {
      this.remote = process.env.REPOSITORY;
    }

    this.buildLambda().catch(err => {
      debug("Failed to build lambda!");
      console.error(err);
    }).then(() => {
      this.ipc.on("recreate", async (_: any, callback: () => {}) => {
        await this.recreate();
        callback();
      });

      this.ipc.on("scale", (_: any, callback: () => {}) => {
        this.spawn();
        callback();
      });
    });
  }

  /* Spawns the lambda package.json */
  private spawn(): void {
    let proc = fork({
      PORT: process.env.PORT as string,
      BRANCH: this.branch,
      NODE_ENV: process.env.NODE_ENV as string,
      MAIN_FILE: join(this.homeDir, this.pkg.main),
      APP_FILE: this.appFile,
      REQUIRE_FILE: this.requireFile,
      LAMBDA_ID: this.ID,
      AUTO_SCALE: process.env.AUTOSCALE || "1",
      DEBUG: process.env.DEBUG as string,
      DEPENDENCIES: DEPENDENCIES
        .map(depName => `${depName}|#|${require.resolve(depName)}`)
        .join(),
    });
    this.ipc.push(proc);
  }

  private async copyFiles() {
    const fileList = [
      ["../worker/lambdaBridge.js", this.bridgeFile],
      ["../worker/App.js", this.appFile],
      ["../worker/requireDep.js", this.requireFile],
    ];

    await Promise.all(
      fileList.map(([loc, dest]) => {
        return fs.copyFile(require.resolve(loc), dest);
      }),
    );
  }

  private async buildLambda(): Promise<void> {
    // The name of the temp folder.
    const folderName = `Temps--lambda_${this.ID}`;

    // The home directory of the lambda.
    this.homeDir = join(tmpdir(), folderName);

    // The directory of the main file that calls the lambda.
    this.bridgeFile = join(this.homeDir, `./____lambdaBridge-${this.ID}.js`);

    // The directory of the lambda file.
    this.appFile = join(this.homeDir, `./____App-${this.ID}.js`);

    // The directory of the requirer for external dependencies.
    this.requireFile = join(this.homeDir, `./____requireDep-${this.ID}.js`);

    // The directory of the lambda's package.json.
    const pkgDir = join(this.homeDir, "package.json");

    debug(`Lambda will be built in ${folderName}`);

    if (!await dirExists(`${this.homeDir}/.git`)) {
      // Clone the repository to the folder.
      debug(`Cloning repository...`);
      await execa("git", ["clone", "--single-branch", "--branch", this.branch, this.remote, this.homeDir]);

      // Wait until it does exist.
      while (!await dirExists(`${this.homeDir}/.git`)) { /* noop */ };

      // Get the package info.
      this.pkg = require(pkgDir);

      // Check if it has a main file.
      if (!this.pkg.main) throw new Error("Lambda must have a main file.");

      // Copy necessary files for the lambda to run.
      await this.copyFiles();

      // Install the lambda dependencies.
      if (this.pkg.dependencies) {
        debug("Installing dependencies for lambda.");
        await execa("npm", ["install"], { cwd: this.homeDir });

        // Wait until modules are installed to continue.
        while (!await dirExists(`${this.homeDir}/node_modules`)) { /* noop */ };
      }

      // If it has a build script, run it.
      if (this.pkg.scripts && this.pkg.scripts.lambdaBuild) {
        debug("Running build scripts for lambda.");
        await execa("npm", ["run", "lambdaBuild"], { cwd: this.homeDir });
      }
    } else {
      debug("Lambda already exists! Using it...");
    }

    if (!this.pkg) this.pkg = require(pkgDir);

    // If it has a lambda init function, run it
    debug("Running init function for lambda.");

    setupMaster({
      stdio: "inherit",
      // @ts-ignore This is supported by node now.
      cwd: this.homeDir,
      exec: this.bridgeFile,
    });

    // Fork the process.
    this.spawn();

    debug("Lambda is ready!");
    await this.onReadyFn();
  }

  public onReady(fn: TOnReadyFunc = () => { }): void {
    this.onReadyFn = fn;
  }

  public async recreate(): Promise<void> {
    try {
      debug("Updating to new lambda.");
      await this.manager.create();
      this.ipc.kill();
      await rimraf(this.homeDir);
    } catch (err) {
      console.error(err);
    }
  }
}

export default Lambda;
