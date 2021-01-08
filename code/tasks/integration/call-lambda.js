'use strict';
const AWS  = require("aws-sdk");
const https = require('https');

/*
 * The connection to the Lambda service can be kept open
 */
const agent = new https.Agent({
	keepAlive: true, 
	// Infinitity is read as 50 sockets
	maxSockets: Infinity
});

const lambda = new AWS.Lambda({
  httpOptions: {
    agent
  }
});
	
const lu = require('../../local-utils');
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');

/*
 * Invoking a Lambda as the backend for the API - eventually this will be replaced
 * by wrapping the target lambda with the wrapper logic rather than by using
 * this lambda to call the target lambda.
 * 
 * CURRENTLY TWO DEPENDENCIES ON WRAPPER CONTEXT
 */
module.exports = async (taskContext) => {
	if (enableLoggingDebug) console.log('Running call-lambda task');

	/*
	 * DEPENDENT ON pre-filled attribute in the task context
	 */
	if (!taskContext.lambdaBackend) {
		if (enableLoggingDebug) console.log('Skipping call-lambda - backend is not a lambda');
		return taskContext;
	}

	if (taskContext.response) {
		if (enableLoggingDebug) console.log('Running call-lambda task ending early - response already present');
		return taskContext;
	}

	/*
	 * We present a sanitized version of the API GW event to the lambda
	 */
	const lambdaParms = {
	/*
	 * DEPENDENT ON pre-filled attribute in the task context
	 */
		FunctionName: taskContext.lambdaBackend, 
		InvocationType: "RequestResponse", 
		Payload: JSON.stringify(taskContext.evt)
	};

	try {
		if(enableLoggingDebug) console.log('invoking Lambda: ', JSON.stringify(lambdaParms));
		taskContext.callTime = new Date().getTime();
		const lambdaResponse = await lambda.invoke(lambdaParms).promise();
		taskContext.callReturnTime = new Date().getTime();

		/*
		 * The Lambda returned, so format the response
		 */
		if(enableLoggingDebug) console.log("lambdaResponse",lambdaResponse);
		var responsePayload = JSON.parse(lambdaResponse.Payload);
	
		if (responsePayload.FunctionError) {
			/*
			 * The function threw an error - log it and return a 500
			 */
			console.error("LAMBDA BACKEND ERROR", responsePayload);
			taskContext.response = {
				statusCode: 500,
				multiValueHeaders: {},
				body: null
			};
		} else {
			/*
			 * The function worked - transfer its response to
			 * our response structure
			 *
			 * The function response format matches the AWS Gateway response
			 * format. If "isBas64Encoded is set here, be decode and
			 * set the body to the buffer
			 */
			if (enableLoggingDebug) console.log("httpResponse", responsePayload);
			taskContext.response = {
				statusCode: responsePayload.statusCode,
				/*
				 * Response object contains only the MV format
				 */
				multiValueHeaders: lu.normalizeAWSHeaders2MultiValueHeaders(responsePayload.headers,responsePayload.multiValueHeaders),
				body: responsePayload.body,
				isBase64Encoded: responsePayload.isBase64Encoded
			};
		}
	} catch (err) {
		console.error("LAMBDA INVOCATION ERROR", err);
		taskContext.response = {
			statusCode: 500,
			multiValueHeaders: {},
			body: null
		};
	}
	return taskContext;
};
