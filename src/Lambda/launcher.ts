import requireDep from "./requireDep";

// Types for external dependencies.
import Debug from "debug";
import TooBusy = require("toobusy-js");
import ProcAsPromised = require("process-as-promised");

type TExtDeps = [typeof Debug, typeof TooBusy, typeof ProcAsPromised];

const [
  debug,
  tooBusy,
  ProcessAsPromised,
]: TExtDeps = requireDep(["debug", "too-busy", "process-as-promised"]);

