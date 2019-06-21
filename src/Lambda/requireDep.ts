const dependencies = new Map();

if (process.env.DEPENDENCIES) process.env.DEPENDENCIES.split(",").forEach(dep => {
  let [depName, depPath] = dep.split("|#|");
  dependencies.set(depName, depPath);
});

function requireDep(ids: string | string[]): any | any[] {
  if (!Array.isArray(ids)) ids = [ids as string];
  const idsSet = new Set(ids);

  const files = [...dependencies.entries()].map<any>(([id, item]) => {
    if (id === idsSet.has(id)) {
      let requiredDep = require(item);
      return requiredDep.default ? requiredDep.default : requiredDep;
    }
    throw new Error(`Could not find dependency ${id}`);
  });

  return files.length > 1 ? files as any[] : files[0] as any;
};

export default requireDep;
