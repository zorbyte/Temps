/**
 * Copyright (C) ConnectEx, Inc - All Rights Reserved.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 * Written by Oscar Davies <zorbytee@gmail.com>, June 2019.
 */

import { globalAgent as gAgentHttps, Server as HttpsServer } from "https";
import { globalAgent, Server, IncomingMessage, ServerResponse } from "http";
import ProcessAsPromised = require("process-as-promised");
import tooBusy = require("toobusy-js");
import { run } from "micro";
import { worker } from "cluster";

type TReqHandler = (req: IncomingMessage, res: ServerResponse) => any;

const debug = require("debug")(`tλ:${worker.id}:app`);

class App {
  private server: Server | HttpsServer;
  public secret: string;
  public shouldDie = false;

  constructor(private IPC: typeof ProcessAsPromised, completeReq: TReqHandler, credentials: { key?: string, cert?: string } = {}) {
    // Configure constants.
    this.secret = process.env.SECRET || "TEST";

    debug("Configuring HTTP server.");

    // Disable socket pooling.
    gAgentHttps.maxSockets = Infinity;
    globalAgent.maxSockets = Infinity;

    // The HTTP server instance.
    this.server = credentials.key && credentials.cert ? new HttpsServer(credentials) : new Server();

    // The request handler.
    this.server.on("request", (firstReq, firstRes) => {
      // Make the handler priority in the event loop for a significant performance gain.
      setImmediate(async () => {
        await run(firstReq, firstRes, completeReq);

        if (this.shouldDie) {
          debug("Shutting down lambda.")
          process.exit();
        }

        // Scales the function if required.
        if (tooBusy()) await this.IPC.send("scale");
      });
    });
  }

  public listen(port = 8080): Promise<number> {
    return new Promise((resolve, reject) => {
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
    this.server.close(callback)
  }
}

export default App;
