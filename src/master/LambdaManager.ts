/**
 * Copyright (C) ConnectEx, Inc - All Rights Reserved.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 * Written by Oscar Davies <zorbytee@gmail.com>, June 2019.
 */

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
    if (this.previousID) {
      while (possibleID === this.previousID) {
        possibleID = nanoid();
      }
    }
    return possibleID;
  }

  public get get(): Lambda {
    return this.lambda;
  }
}

export default LambdaManager;
