import { Worker } from "cluster";
import ProcessAsPromised = require("process-as-promised");

interface Ilistener {
  (): void;
  (callback?: (data?: any) => void): void;
  (data?: any, callback?: (data?: any) => void): void;
}

class IPC {
  private workers: Worker[] = [];
  private IPCs: typeof ProcessAsPromised[] = [];

  public add(worker: Worker): IPC {
    this.IPCs.push(new ProcessAsPromised(worker));
    return this;
  }

  public kill(): void {
    this.workers.forEach(worker => worker.kill());
  }

  public async send(eventName: string, ...data: any[]): Promise<any[]> {
    let sendTasks: Promise<any>[] = [];
    this.IPCs.forEach(IPC => {
      sendTasks.push(IPC.send(eventName, ...data));
    });

    const taskResults = await Promise.all(sendTasks);
    return taskResults;
  }

  public on(eventName: string, listener: Ilistener): void {
    this.IPCs.forEach(IPC => IPC.on(eventName, (data: any, callback: (data?: any) => void) => {
      // No arguments provided.
      if (listener.length === 0) listener();

      // One argument provided.
      if (listener.length === 1) {
        // The first argument is the callback.
        if (typeof listener.arguments[0] === "function") return listener(callback);

        // Otherwise return the data.
        listener(data);
      }
      
      // Run the callback in it's entirety.
      if (listener.length === 2) return listener(data, callback);

      // Run the callbacks for the functions that did not recieve it.
      callback();
    }));
  }
}

export default IPC;
