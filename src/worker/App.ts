import { globalAgent as gAgentHttps, Server as HttpsServer } from "https";
import { globalAgent, Server, IncomingMessage, ServerResponse } from "http";
import { worker } from "cluster";

// Types.
import TrequireDep from "./requireDep";
import TProcAsPromised = require("process-as-promised");
import TtooBusy = require("toobusy-js")

// For dependency injection.
const requireDep: typeof TrequireDep = require(process.env.REQUIRE_FILE as string).default;
const tooBusy: typeof TtooBusy = requireDep("toobusy-js");
const debug = requireDep("debug")(`tλ:${worker.id}:app`);

type TReqHandler = (req: IncomingMessage, res: ServerResponse) => any;

class App {
  public server: Server | HttpsServer;
  public secret?: string;

  constructor(private IPC: typeof TProcAsPromised, private completeReq: TReqHandler, credentials: { key?: string, cert?: string } = {}) {
    // Configure constants.
    this.secret = process.env.SECRET;

    debug("Configuring HTTP server.");

    // Disable socket pooling.
    gAgentHttps.maxSockets = Infinity;
    globalAgent.maxSockets = Infinity;

    // The HTTP server instance.
    this.server = credentials.key && credentials.cert ? new HttpsServer(credentials) : new Server();

    // This reduces delay when accessing the socket.
    this.server.on("connection", socket => socket.setNoDelay(true));
  }

  public listen(port = 8080): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.removeAllListeners("request");

      // The request handler.
      this.server.on("request", (req, res) => {
        // Make the handler priority in the event loop for a significant performance gain.
        setImmediate(() => this.completeReq(req, res));

        // Scales the function if required.
        let testScaling = process.env.NODE_ENV !== "production"
          && process.env.TEST_SCALE === "1"
          && req.url !== "favicon.ico";
        if (testScaling || tooBusy()) this.IPC.send("scale");
      });

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
}

export default App;
