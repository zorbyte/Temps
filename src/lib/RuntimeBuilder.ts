import buildDebug from "debug";
import Utils from "./modules/Utils";

import Catch from "catch-decorator";
import * as fs from "fs-nextra";
import { join } from "path";
import { TEMPDIR_PREFIX } from "./constants";

const debug = buildDebug("λ:Builder");

class RuntimeBuilder {
  // Runtime data.
  public ID!: string;
  private instructions = new Map<string, (() => Promise<void>) | null>()

  // FS data.
  public cwd!: string;
  public branch!: string;
  public functionFile!: string;

  constructor() {
    Utils.createTemp()
      .then(async ({ ID, dirName }) => {
        this.ID = ID;
        this.cwd = dirName;

        // Prioritise some actions and force their order to be immutable.
        this.instructions.set("clone", null);
        this.instructions.set("scripts", null);
        this.set("cloneInternals", this.cloneInternals);
      })
      .then(() => debug("Created temp dir."));
  }

  public cloneRepo(remote: string, branch?: string): RuntimeBuilder {
    if (!branch) {
      this.set("clone", Utils.wrapFunction(
        async (): Promise<void> => {
          fs.copy(remote, this.cwd);
        },
        "Failed to clone repo.",
      ));
    } else {
      this.branch = branch;
      this.set("clone", async () => {
        await Utils.exec(`git clone --single-branch --branch ${this.branch} ${remote} ${this.cwd}`);
      });
    }
    return this;
  }

  public runScripts(): RuntimeBuilder {
    this.set("scripts", Utils.wrapFunction(async () => {
      const packageJSON = require(join(this.cwd, "package.json"));
      if (!packageJSON.main) throw new Error("Function package.json requires field main");
      if (Object.keys(packageJSON.dependencies).length > 0) await Utils.exec(`npm install`, this.cwd);
      if (packageJSON.scripts && packageJSON.scripts["temps-build"]) await Utils.exec(`npm run temps-build`, this.cwd);
    }, "Failed to validate and run repo scripts."));
    return this;
  }

  // Clones the content of the Lambda folder.
  @Catch(Error, err => console.error(`Error copying internals to cwd: ${err.stack}`))
  private async cloneInternals() {
    const internalsPath = join(this.cwd, TEMPDIR_PREFIX.concat("Lambda"));
    await fs.copy(join(__dirname, "..", "Lambda"), internalsPath);

    // Wait until the operation completes, sometimes the promise resolves too early.
    while (!await fs.pathExists(internalsPath)) { /* Noop. */ };
    return;
  }

  // Alias to insert an instruction.
  private set(key: string, value: () => Promise<void>) {
    this.instructions.set(key, value);
  }

  // Runs all the build instructions/actions.
  public async run(): Promise<RuntimeBuilder> {
    try {
      await Promise.all([...this.instructions.values()]);
      return this;
    } catch (err) {
      throw err;
    }
  }
}

export default RuntimeBuilder;
