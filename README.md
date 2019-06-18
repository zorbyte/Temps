<br />
<p align="center">
  <a href="">
    <img src="assets/Temps.png" alt="Logo" width="80" height="66">
  </a>

  <h3 align="center">Temps</h3>

  <p align="center">
    A serverless lambda runner, inspired by zeit now.
  </p>
</p>

<br>

## What can Temps do?

- Temps can automatically hot swap your functions to an updated version without any dramas. This is achieved through GitHub webhooks.
- Temps auto-scales your lambda function, whenever it detects a large amount of load in the event loop it creates a new thread to spread the load on.
- Lightning fast, responds in under 5ms for a hello world async function!

## Setting up your function

### Programmatic setup

Temps is a breeze to setup, it's so easy it only needs an example:
```js
// An optional function (optionally async) that runs before the server listens is executed.
exports.init = async () => { };

// Also works with HTTPS!
exports.credentials = {
  key,
  cert,
};

// A required (optionally async) handler (works with export default as well).
module.exports = async (req, res) => {
  // If this is an async function and you return either a string or buffer here
  // Temps will send the returned data! Async functions can still be used without this behavior.
  // You can run whatever you want in here: express, koa etc.
};
```

Make sure to use the `main` field in your `package.json` to point to an entry point file that matches the signature of the example above.

### Compiling your code

Temps compiles your code by running the `lambdaBuild` script if present in your package.json.
Please ensure that the entry point specified in the `main` field of your lambda's `package.json` points to the compiled entry point.

## Configuring Temps

### Repositories
To configure temps to work with private repositories, setup a GitHub access token with the `repos` scope checked.
Check out `.env.example` to see how to configure your repository.
Temps works with github webhooks with plans to support more platforms in future.
To set it up, generate a secret for example: `crypto.randomBytes(32).toString("base64")`
and set it to the env variable named `SECRET`.
Then configure a push webhook on GitHub that uses that same secret and pushes to the following endpoint: `example.com/.well-known/__lambda/update`.

### Software configuration
Refer to .env.example... it's pretty self-explanatory.
