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

## Setting up your function

Temps is a breeze to setup, so easy it only needs an example:
```js
// An optional function (optionally async) that runs before the server listens is executed.
exports.init = async () => { };

// A required (optionally async) handler (works with export default as well).
module.exports = async (req, res) => {
  // Refer to https://github.com/zeit/micro for what you can do here!
};
```

The dependency micro is injected therefore `require("micro")` will simply just work.
If you specify a custom version in your `package.json` it will be respected. However, please ensure that the included version of micro is semver compliant with the one in use with this repository to prevent errors from external API changes.

## Configuring Temps

### Repositories
Temps only works with GitHub repositories momentarily due to some hard coded configurations that will be fixed soon.
To configure temps to work with private repositories, setup a GitHub access token with the `repos` scope checked.
Check out `.env.example` to see how to configure your repository.
Temps works with github webhooks with plans to support more platforms in future.
To set it up, generate a secret for example: `crypto.randomBytes(32).toString("base64")`
and set it to the env variable named `SECRET`.
Then configure a push webhook on GitHub that uses that same secret and pushes to the following endpoint: `example.com/.well-known/__lambda/update`.

### Software configuration
Refer to .env.example... it's pretty self-explanatory.
