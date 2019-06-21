const dependencies = new Map();

if (process.env.DEPENDENCIES) process.env.DEPENDENCIES.split(",").forEach(dep => {
  let [depName, depPath] = dep.split("|#|");
  dependencies.set(depName, depPath);
});

function requireDep(id: string): any {
  let file = dependencies.get(id);
  if (!file) throw new Error(`Could not find dependency ${id}`);
  let requiredDep = require(file);
  return requiredDep.default ? requiredDep.default : requiredDep;
}

export default requireDep;
