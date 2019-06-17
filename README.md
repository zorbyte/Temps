<br />
<p align="center">
  <a href="">
    <img src="assets/Temps.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Temps</h3>

  <p align="center">
    A serverless lambda runner, inspired by zeit now.
  </p>
</p>

<br>

## More info coming soon but...
The gist of it:
trigger a webhook that clones the repo code on /.well-known/__lambda/update
If the repo is private, supply an API key in the env file
Works with github only right now, because of silly hard coding that needs to be fixed.

Lambda code that runs before requests is run in exports.init

The serverless func itself is in `module.exports = (req, res) => {};`
(This can be async, refer to the zeit/micro docs)
The dependency micro comes included (require("micro") will just work, custom versions in package.json work too! but make sure it matches the major semver version included with ours as it may cause incompatibilities).

Blazing fast response times, can range from 3-10ms on an old macbook air.
