import ProcessAsPromised = require("process-as-promised");
import { IncomingMessage, ServerResponse } from "http";
import { inspect } from "util";
import { worker } from "cluster";
import bl = require("bl");
import jitson = require("jitson");
import crypto = require("crypto");
import AppClazz from "./App";

const { default: App } = require(process.env.APP_FILE as string);

const lambda = require(process.env.MAIN_FILE as string);
const debug = require("debug")(`tλ:${worker.id}:ipc`);

const IPC = new ProcessAsPromised();

// When the function has been recreated.
IPC.on("recreateDone", (exitCode: number, callback: () => {}) => {
  app.close();
  callback();
  process.exit(exitCode);
});

// Run the init function if it exists.
if (lambda.init) {
  debug("Running lambda's init function.");
  lambda.init();
}

const runFunc = lambda.default ? lambda.default : lambda;

const app: AppClazz = new App(IPC, handleRequest, lambda.credentials || {});

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // Negative comparisons are more performant in V8.
    if (req.url !== "/.well-known/__lambda/update") {
      // This appears to be the fastest way to handle this.
      new Promise<any>(resolve => resolve(runFunc(req, res)))
        .catch(lambdaErr => {
          debug("An error occurred within the supplied lambda!");
          console.error(lambdaErr);
          handleResult(inspect(lambdaErr), res, 500);
        })
        .then(result => {
          handleResult(result, res, res.statusCode || 200);
        });
    } else {
      debug("Verifying webhook signature.");
      const checksum = req.headers["x-hub-signature"];

      // Verify if header was provided.
      if (!checksum) return await handleResult("Signature not provided", res, 401);

      // Create a payload from the request content.
      const payload = await new Promise<Buffer>((ok, fail) => {
        // @ts-ignore This is typed incorrectly in the module.
        req.pipe(bl((err: Error, data: Buffer) => {
          if (err) fail(err);
          ok(data);
        }));
      });

      // Verify the signiture.
      const sig = crypto.createHmac("sha1", app.secret)
        .update(payload)
        .digest("hex");
      const verif = crypto
        .timingSafeEqual(Buffer.from(`sha1=${sig}`), Buffer.from(checksum as string));
      if (!verif) return await handleResult("Invalid signature", res, 401);
      const body = jitson(payload.toString());
      if (body.ref.indexOf(process.env.BRANCH) <= -1) return handleResult("Invalid branch", res, 403);

      // Updates to the new lambda.
      await IPC.send("recreate");
      app.shouldDie = true;
      return handleResult("{\"status\":200}", res, 200);
    }
  } catch (err) {
    debug("An error occurred while handling a request!");
    console.error(err);
    handleResult(err.message, res, 500);
  }
};

function handleResult(result: string | Buffer, res: ServerResponse, statusCode = 200): void {
  if (result !== void 0) {
    if (typeof result === "string") res.setHeader("Content-Length", Buffer.byteLength(result));
    if (Buffer.isBuffer(result)) res.setHeader("Content-Length", result.length);
    res.statusCode = statusCode;
    res.end(result);
  }
};

app.listen(parseInt(process.env.PORT || "8080"));
