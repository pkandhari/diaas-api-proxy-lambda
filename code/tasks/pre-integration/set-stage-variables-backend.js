"use strict";

const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == "true");

module.exports = async (taskContext) => {

  if (enableLoggingDebug) console.log("Running set-stage-variables-backend task");

  if (!taskContext.isProxyMode) {
    enableLoggingDebug && console.log("Running in filter mode - no dynamic backend");
    return taskContext;
  }

	if (taskContext.stageVariables.backendURL) {
    if (enableLoggingDebug) console.log("Found stage variable backendURL");
    taskContext.backendURL = taskContext.stageVariables.backendURL;
	} else {
    if (enableLoggingDebug) console.log("Stage variable backendURL not found");
  }
  return taskContext;
};
