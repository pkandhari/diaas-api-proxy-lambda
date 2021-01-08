"use strict";
const lu = require("../../local-utils.js");

const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == "true");

module.exports = async (taskContext) => {

	if (enableLoggingDebug) console.log("Running create-modified-event task");

	if (taskContext.lambdaBackend) {
		/*
		 * Set the host header if the backend is a lambda (i.e. we are running in filter
		 * mode ou we are in proxy mode and discovered a lambda backed)
		 */
		taskContext.backend_request.requestHeaders.host = [taskContext.urlInfo.lambdaHost];
	}
	
	/*
	 * Content Length MAY be wrong...
	 */
	if (taskContext.backend_request.requestBody) {
		taskContext.backend_request.requestHeaders["content-length"] = [taskContext.backend_request.requestBody.length.toString()];
	}

    taskContext.integrationEvent = {
		/*
		 * Stuff we messed with
		 */
		multiValueHeaders: taskContext.backend_request.requestHeaders,
		headers: lu.getSingleValueHeaders(taskContext.backend_request.requestHeaders),
		body: taskContext.backend_request.requestBody,
		isBase64Encoded: taskContext.backend_request.requestBodyIsBase64Encoded,

		/*
		 * Stuff we didn't mess with
		 */
		httpMethod: taskContext.backend_request.requestMethod,
		resource: taskContext.evt.resource,
		path: taskContext.evt.path,
		pathParameters: taskContext.evt.pathParameters,
		stageVariables: taskContext.evt.stageVariables,
		queryStringParameters: taskContext.evt.queryStringParameters,
		multiValueQueryStringParameters: taskContext.evt.multiValueQueryStringParameters,
		requestContext: taskContext.evt.requestContext
	};

	enableLoggingDebug && console.log("Integration event:", JSON.stringify(taskContext.integrationEvent));

	return taskContext;
}
