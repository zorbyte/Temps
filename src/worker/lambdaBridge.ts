import ProcessAsPromised = require("process-as-promised");
import { IncomingMessage, ServerResponse } from "http";
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
    if (req.url === "/.well-known/__lambda/update") {
      debug("Verifying webhook signature.");
      const checksum = req.headers["x-hub-signature"];

      // Verify if header was provided.
      if (!checksum) return await handleResult("Signature not provided", res, 401, true);

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
      if (!verif) return await handleResult("Invalid signature", res, 401, true);
      const body = jitson(payload.toString());
      if (body.ref.indexOf(process.env.BRANCH) <= -1) return await handleResult("Invalid branch", res, 403, true);

      // Updates to the new lambda.
      await IPC.send("recreate");
      app.shouldDie = true;
      return await handleResult("{\"status\":200}", res, 200, true);
    } else {
      let result = runFunc(req, res);
      return await handleResult(result, res, res.statusCode || 200);
    }
  } catch (lambdaErr) {
    debug("An error occurred while handling a request!");
    console.error(lambdaErr);
    await handleResult(lambdaErr.message, res, 500, true);
  }
};

async function handleResult(result: any, res: ServerResponse, statusCode = 200, handle = false): Promise<void> {
  if (result instanceof Promise) {
    result = await result;
    handle = true;
  }
  if (handle && result !== void 0) {
    if (typeof result === "string") res.setHeader("Content-Length", Buffer.byteLength(result));
    if (Buffer.isBuffer(result)) res.setHeader("Content-Length", result.length);
    res.statusCode = statusCode;
    res.end(result);
  }
};

app.listen(parseInt(process.env.PORT || "8080"));
