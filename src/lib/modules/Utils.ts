import execa = require("execa");
import Catch from "catch-decorator";
import * as fs from "fs-nextra";
import { join } from "path";

import { TEMPDIR_PREFIX } from "../constants";

interface ITempDir {
  ID: string;
  dirName: string;
}

interface IExecErr extends Error {
  command: string;
}

class Utils {
  @Catch(Error, (err: IExecErr) => console.error(`Failed to run command ${err.command}. ${err.stack}`))
  public static async exec(cmd: string, cwd = process.cwd()): Promise<execa.ExecaReturns> {
    try {
      let cmdArgs = cmd.split(" ");
      const bin = cmdArgs.shift();
      if (!bin) throw new SyntaxError("Invalid command");

      const output = await execa(bin, cmdArgs, { cwd });
      return output;
    } catch (err) {
      err.command = cmd;
      throw err as IExecErr;
    }
  }

  @Catch(Error, err => console.error(`Failed to create temp dir. ${err.stack}`))
  public static async createTemp(): Promise<ITempDir> {
    let dirName = await fs.mkdtemp(TEMPDIR_PREFIX);

    return {
      ID: dirName.replace(TEMPDIR_PREFIX, ""),
      dirName,
    };
  }

  @Catch(Error, err => console.error(`Failed to copy internals to temp dir. ${err.stack}`))
  public static async cloneInternals(dir: string): Promise<void> {
    await fs.copy(join(__dirname, "worker"), dir);
  }

  // A function that wraps a promise in an error catcher.
  @Catch(Error, err => console.error(`Could not wrap function. ${err.stack}`))
  public static wrapFunction(
    func: () => Promise<any>,
    handleText = "An error occurred.",
  ): typeof func {
    try {
      let wrapped = Catch(
        Error,
        (err: Error) => {
          console.error(`${handleText} ${err.stack}`);
        })(
          null,
          null,
          async function () {
            return await func();
          });

      return wrapped.value;
    } catch (err) {
      throw err;
    } finally {
      return func;
    }
  }
}

export default Utils;