import { setupMaster, fork } from "cluster";
import RuntimeBuilder from "./RuntimeBuilder";
import { DEFAULT_RUNTIME_CONFIG } from "./constants";
import IPC from "./modules/IPC";

interface ILambda {
  ID: string;
  clusterIDs: Set<number>;
  IPC: IPC;
  builder: RuntimeBuilder;
}

export interface IRuntimeConfig {
  remote: string;
  branch?: string;
  autoScale?: boolean;
}

class Runtime {
  private lambda!: ILambda;
  private clusterConfigured = false;

  constructor(private config: IRuntimeConfig) {
    if (!config) throw new RangeError("Config not provided");

    // Amend unprovided options.
    this.config = {
      ...DEFAULT_RUNTIME_CONFIG as IRuntimeConfig,
      ...this.config,
    };
  }

  public async spawn(): Promise<void> {
    const builder = await new RuntimeBuilder()
      .cloneRepo(this.config.remote, this.config.branch)
      .runScripts()
      .run();
    
    if (!this.clusterConfigured) {
      setupMaster({
        // @ts-ignore This type has not been added to node yet.
        cwd: this.builder.cwd,
        exec: this.lambda.builder.functionFile,
      });

      // Ensure this doesn't run every time a Lambda is spawned.
      this.clusterConfigured = true;
    }
    
    const lambdaProc = this.fork();
    const lambdaIPC = new IPC().add(lambdaProc);
    this.lambda = {
      ID: builder.ID,
      clusterIDs: new Set(),
      IPC: lambdaIPC,
      builder,
    };
  }

  private fork() {
    const builder = this.lambda.builder;
    return fork({
      TEMPS_FUNC: builder.functionFile,
      SECRET: process.env.SECRET,
      PORT: process.env.PORT || 8080,

      // 3 is considered test mode.
      AUTO_SCALE: process.env.AUTO_SCALE || 0,
    });
  }

  public async reSpawn() { }
  public async destroy() { }
  public async kill() { }
}

export default Runtime
