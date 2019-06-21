import { globalAgent as gAgentHttps, Server as HttpsServer } from "https";
import { globalAgent, Server, IncomingMessage, ServerResponse } from "http";
import { inspect } from "util";
import { timingSafeEqual, createHmac } from "crypto";
import requireDep from "./requireDep";

// Types for external dependencies.
import Debug from "debug";
import TooBusy = require("toobusy-js");
import ProcAsPromised = require("process-as-promised");

type TExtDeps = [typeof Debug, typeof TooBusy, typeof ProcAsPromised];
type TReqHandler = (req: IncomingMessage, res: ServerResponse) => Promise<string | Buffer> | void;

const [
  debug,
  tooBusy,
  jitson,
  ProcessAsPromised,
]: TExtDeps = requireDep(["debug", "too-busy", "jitson", "process-as-promised"]);

class Lambda {
  public server: Server | HttpsServer;
  private IPC: typeof ProcAsPromised;
  private secret?: string;

  constructor(
    private runFunc: TReqHandler,
    credentials: { key?: string, cert?: string } = {}
  ) {
    // Configure constants.
    this.secret = process.env.SECRET;

    debug("Configuring HTTP server.");

    // Disable socket pooling.
    gAgentHttps.maxSockets = Infinity;
    globalAgent.maxSockets = Infinity;

    // The HTTP server instance.
    this.server = credentials.key
      && credentials.cert
      ? new HttpsServer(credentials)
      : new Server();

    // This reduces delay when accessing the socket.
    this.server.on("connection", socket => socket.setNoDelay(true));
  }

  public listen(port = 8080): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.removeAllListeners("request");

      // The request handler.
      this.server.on("request", (req, res) => {
        // Make the handler priority in the event loop for a significant performance gain.
        setImmediate(() => this.handler(req, res));

        // Scales the function if required.
        const testScaling = process.env.NODE_ENV !== "production"
          && process.env.TEST_SCALE === "1"
          && req.url !== "favicon.ico";
        if (testScaling || tooBusy()) this.IPC.send("scale");
      });

      // Listen to 
      this.server.listen(port);
      this.server.once("error", reject);
      this.server.once("listening", () => {
        this.server.removeListener("error", reject);
        debug(`Now listening on port ${port}`);
        resolve(port);
      });
    });
  }

  public close(callback?: (err?: Error) => {}) {
    this.server.close(err => {
      if (err && callback) callback(err);
      tooBusy.shutdown();
      if (callback) callback();
    });
  }

  private async handler(req: IncomingMessage, res: ServerResponse) {
    try {
      // Negative comparisons are more performant in V8.
      if (req.url === "/.well-known/__lambda/update") {
        let payload: Buffer;
        if (this.secret) {
          // Create a payload from the request content.
          payload = await createRaw(req);
        } else {
          debug("Verifying webhook signature.");
          const checksum = req.headers["x-hub-signature"];

          // Verify if header was provided.
          if (!checksum) return await handleResult("Signature not provided", res, 401);

          // Create a payload from the request content.
          payload = await createRaw(req);

          // Verify the signiture.
          const sig = createHmac("sha1", app.secret as string)
            .update(payload)
            .digest("hex");
          const verified = timingSafeEqual(
            Buffer.from(`sha1=${sig}`),
            Buffer.from(checksum as string),
          );
          if (!verified) return await handleResult("Invalid signature", res, 401);
        }

        // Parse the body as JSON if it is correct.
        const body = jitson(payload.toString());
        if (body.ref && body.ref.indexOf(process.env.BRANCH) <= -1) return handleResult("Invalid branch", res, 403);

        // Updates to the new lambda.
        await this.IPC.send("recreate", void 0);
        handleResult("{\"status\":200}", res, 200);

        // The other thread is ready to take this ones place, it will finish the rest of the connections.
        debug("Shutting down lambda.");
        this.close();
        return;
      } else {
        // This appears to be the fastest way to handle this.
        new Promise<any>(resolve => resolve(this.runFunc(req, res)))
          .catch(lambdaErr => {
            debug("An error occurred within the supplied lambda!");
            console.error(lambdaErr);
            handleResult(inspect(lambdaErr), res, 500);
          })
          .then(async result => {
            if (res.finished) return;
            if (result instanceof Promise) result = await result;
            handleResult(result, res, res.statusCode || 200);
          });
      }
    } catch (err) {
      debug("An error occurred while handling a request!");
      console.error(err);
      handleResult(err.message, res, 500);
    }
  }
}

function handleResult(result: string | Buffer, res: ServerResponse, statusCode = 200): void {
  if (result !== void 0) {
    if (!res.headersSent) {
      if (typeof result === "string") res.setHeader("Content-Length", Buffer.byteLength(result));
      if (Buffer.isBuffer(result)) res.setHeader("Content-Length", result.length);
    }
    res.statusCode = statusCode;
    res.end(result);
  }
};


async function createRaw(req: IncomingMessage): Promise<Buffer> {
  return await new Promise<Buffer>((ok, fail) => {
    // @ts-ignore This is typed incorrectly in the module.
    req.pipe(bl((err: Error, data: Buffer) => {
      if (err) fail(err);
      ok(data);
    }));
  });
}

export default Lambda;
