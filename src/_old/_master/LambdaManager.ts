import Lambda from "./Lambda";
import nanoid = require("nanoid");

class LambdaManager {
  private lambda!: Lambda;
  private previousID?: string;

  public create(): Promise<void> {
    return new Promise((ok, fail) => {
      try {
        const lambdaID = this.createID();

        let newLambda = new Lambda(lambdaID, this);
        newLambda.onReady(() => {
          this.lambda = newLambda;
          ok();
        });
      } catch (err) {
        fail(err);
      }
    });
  }

  private createID() {
    let possibleID = nanoid();
    while (this.previousID && possibleID === this.previousID) possibleID = nanoid();
    return possibleID;
  }

  public get get(): Lambda {
    return this.lambda;
  }
}

export default LambdaManager;
