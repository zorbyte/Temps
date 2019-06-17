import ProcessAsPromised = require("process-as-promised");
import { IncomingMessage, ServerResponse } from "http";
import { worker } from "cluster";
import { sendError, send, buffer } from "micro";
import crypto = require("crypto");
import AppClazz from "./App";

const { default: App } = require(process.env.APP_FILE as string);

const lambda = require(process.env.MAIN_FILE as string);
const debug = require("debug")(`tλ:${worker.id}:ipc`);

const IPC = new ProcessAsPromised();

// When the function has been recreated.
IPC.on("recreateDone", (exitCode: number) => {
  app.close();
  process.exit(exitCode);
});

// Run the init function if it exists.
if (lambda.init) {
  debug("Running lambda's init function.");
  lambda.init();
}

const app: AppClazz = new App(IPC, handleRequest, lambda.credentials || {});

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.url === "/.well-known/__lambda/update") {
      debug("Verifying webhook signature.");
      const checksum = req.headers["x-hub-signature"];

      // Verify if header was provided.
      if (!checksum) return send(res, 401, "Signature not provided");

      // Verify the signature.
      const payload = await buffer(req);
      const sig = crypto.createHmac("sha1", app.secret)
        .update(payload)
        .digest("hex");
      const verif = crypto
        .timingSafeEqual(Buffer.from(`sha1=${sig}`), Buffer.from(checksum as string))
      if (!verif) return send(res, 401, "Invalid signature");
      const body = JSON.parse(payload.toString());
      if (body.ref.indexOf(process.env.BRANCH) <= -1) return send(res, 403, "Invalid branch");

      // Updates to the new lambda.
      await IPC.send("recreate");
      app.shouldDie = true;
      return "{\"status\":200}";
    } else {
      let runFunc = lambda.default ? lambda.default : lambda;
      return await runFunc(req, res);
    }
  } catch (lambdaErr) {
    sendError(req, res, lambdaErr);
  }
};

app.listen(parseInt(process.env.PORT || "8080"));
