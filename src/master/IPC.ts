import { Worker } from "cluster";
import ProcessAsPromised = require("process-as-promised");

class IPC {
  private workers: Worker[] = [];
  public ipcs: typeof ProcessAsPromised[] = [];

  push(worker: Worker) {
    this.workers.push(new ProcessAsPromised(worker));
  }

  kill() {
    this.workers.forEach(w => w.kill());
  }
  
  send(...args: any[]): Promise<any> {
    let funcs: Promise<any>[] = [];
    this.ipcs.forEach(p => {
      funcs.push(p.send(...args));
    });
    return Promise.race(funcs);
  }
  
  on(...args: any[]) {
    this.ipcs.forEach(p => p.on(...args));
  }
}

export default IPC;
