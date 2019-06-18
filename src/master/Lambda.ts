import { fork, setupMaster } from "cluster";
import execa = require("execa");
import runnerPkg = require("../../package.json");
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

type TOnReadyFunc = () => void | any;

const debug = require("debug")("tλ:master:builder");;
const rimraf = promisify(rimrafCb);

class Lambda {
  // Function data.
  private handlerFile!: string;
  private appFile!: string;
  private pkg: any;
  private ipc = new IPC();
  private dontSpawn = true;

  // Internals.
  private onReadyFn!: TOnReadyFunc;

  // FS data.
  public homeDir!: string;

  // Git information.
  public branch: string;
  private remote!: string;
  private repositoryName!: string;

  constructor(public ID: string, public manager: LambdaManager) {
    debug("Verifying git details.");
    this.branch = process.env.BRANCH || "master";
    if (!process.env.REPOSITORY) {
      console.error("No Github repository provided!");
      process.exit();
    } else {
      this.repositoryName = process.env.REPOSITORY.replace(".git", "");
      this.remote = `github.com/${this.repositoryName}.git`;
      if (process.env.TOKEN) this.remote = `${process.env.TOKEN}@${this.remote}`;
      this.remote = `https://${this.remote}`;
    }

    this.buildLambda().catch(err => {
      debug("Failed to build lambda!");
      console.error(err);
    }).then(() => {
      this.ipc.on("recreate", this.recreate);
      this.ipc.on("scale", (_: any, callback: () => {}) => {
        this.spawn();
        callback();
      });
    });
  }

  /* Adds a dependency to the lambda's package.json */
  private addDependency(name: string): void {
    this.pkg.dependencies[name] = this.pkg.dependencies[name]
      ? this.pkg.dependencies[name]
      // @ts-ignore Typescript doesn't like this.
      : runnerPkg.dependencies[name] || "*";
  }

  /* Spawns the lambda package.json */
  private spawn(firstSpawn = false): void {
    // Stops the function from being called twice.
    this.dontSpawn = !this.dontSpawn;
    if (!firstSpawn && this.dontSpawn) return;

    let proc = fork({
      "PORT": process.env.PORT as string,
      "BRANCH": this.branch,
      "NODE_ENV": process.env.NODE_ENV as string,
      "MAIN_FILE": join(this.homeDir, this.pkg.main),
      "APP_FILE": this.appFile,
      "LAMBDA_ID": this.ID,
      "DEBUG": process.env.DEBUG as string,
    });
    this.ipc.push(proc);
  }

  private async buildLambda(): Promise<void> {
    // The name of the temp folder.
    const folderName = `tmp-clone-${this.repositoryName
      .replace(".git", "")
      .split("/")[1]}-${this.ID}`;

    // The home directory of the lambda.
    this.homeDir = join(tmpdir(), folderName);

    // The directory of the main file that calls the lambda.
    this.handlerFile = join(this.homeDir, `./____lambdaBridge-${this.ID}.js`);

    // The directory of the main file that calls the lambda.
    this.appFile = join(this.homeDir, `./____App-${this.ID}.js`);

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

      if (!this.pkg.dependencies) this.pkg.dependencies = {};

      // Add required dependencies for bridging the two apps.
      this.addDependency("process-as-promised");
      this.addDependency("toobusy-js");
      this.addDependency("jitson");
      this.addDependency("debug");
      this.addDependency("bl");

      // Commit these changes.
      await fs.writeFile(pkgDir, JSON.stringify(this.pkg));

      // Check if it has a main file.
      if (!this.pkg.main) throw new Error("Lambda must have a main file.");

      // Copy the lambda bridge.
      await fs.copyFile(join(__dirname, "..", "worker", "lambdaBridge.js"), this.handlerFile);

      // Copy the lambda bridge.
      await fs.copyFile(join(__dirname, "..", "worker", "App.js"), this.appFile);

      // Install the lambda dependencies.
      debug("Installing dependencies for lambda.");
      await execa("npm", ["install"], { cwd: this.homeDir });

      // Wait until modules are installed.
      while (!await dirExists(`${this.homeDir}/node_modules`)) { /* noop */ };

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
      // @ts-ignore This is supported by node now.
      cwd: this.homeDir,
      exec: this.handlerFile,
    });

    // Fork the process.
    this.spawn(true);

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
      await this.ipc.send("recreateDone", void 0);
      await rimraf(this.homeDir);
    } catch (err) {
      console.error(err);
    }
  }
}

export default Lambda;
