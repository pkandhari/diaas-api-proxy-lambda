'use strict';
/*
 * An AWS Lambda to handle an API request using a promise driver
 */
const lu = require("./local-utils.js");
const util = require('util');
const wrapperFilters = require("./wrapper-filters");
const integrationHandler = require("./integration-handler");
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');

/*
 * Error codes that might correspond to thrown errors in this code
 */
const errorMap = {
	"bad request": 400,
	"unauthorized": 401,
	"payment required": 402,
	"forbidden": 403,
	"not found": 404,
	"method not allowed": 405,
	"not acceptable": 406,
	"proxy authentication required": 407,
	"request timeout": 408,
	"conflict": 409,
	"gone": 410,
	"length required": 411,
	"precondition failed": 412,
	"request entity too large": 413,
	"request-uri too long": 414,
	"unsupported media type": 415,
	"requested range not satisfiable": 416,
	"expectation failed": 417,
	"insufficient space on resource": 419,
	"method failure": 420,
	"unprocessable entity": 422,
	"locked": 423,
	"failed dependency": 424,
	"precondition required": 428,
	"too many requests": 429,
	"request header fields too large": 431,
	"server error": 500,
	"not implemented": 501,
	"bad gateway": 502,
	"service unavailable": 503,
	"gateway timeout": 504,
	"http version not supported": 505,
	"insufficient storage": 507,
	"network authentication required": 511
};

exports.handler = async function(evt, context) {
	const startTime = new Date().getTime();
	console.log("Running event: ", JSON.stringify(evt, (enableLoggingDebug ? null : lu.valueMasker)), (enableLoggingDebug ? JSON.stringify(context) : null));

	/*
	 * Initialize the filter context
	 */
	const filterContext = {startTime: startTime};

	try {
		/*
		 * Run the pre-processing filter which returns a modified event to use
		 */
		enableLoggingDebug && console.log("Running pre-processing wrapper filter");
		const integrationEvent = await wrapperFilters.runPreProcessingFilter(evt, context,filterContext);

		/*
		 * Run the target event handler, which returns a Lambda response
		 *
		 * We also pass the filter context for smart integrations, like the proxy lambda :D
		 */
		enableLoggingDebug && console.log("Running integration command chain");
		const integrationResponse = await integrationHandler.handle(integrationEvent ? integrationEvent : evt, context, filterContext);

		/*
		 * Run the post-processing filter which returns a modified response to return
		 */
		enableLoggingDebug && console.log("Running post-processing wrapper filter");
		const lambdaResponse = await wrapperFilters.runPostProcessingFilter(integrationResponse, evt, context, filterContext);
		
		enableLoggingDebug && console.log("Finalizing response");

		if (lambdaResponse) {
			console.log('Sending Lambda response:', JSON.stringify(lambdaResponse, (enableLoggingDebug ? null : lu.valueMasker)));
			return lambdaResponse;			
		} else {
			console.warn('No Proxy response set by tasks. Probably an error!', (enableLoggingDebug ? JSON.stringify(filterContext) : null));
			return {
				statusCode: 204
			};
		}
	} catch(err) {
		console.error('Caught Error', util.inspect(err, { showHidden: true, depth: null }), (enableLoggingDebug ? JSON.stringify(filterContext) : null));
		const errorMessage = (typeof err == 'string' ? err : (typeof err.errorMessage === 'string' ? err.errorMessage : "Server Error"));
		const statusCode = errorMap[errorMessage.toLowerCase()];
		const response = {
			statusCode: statusCode ? statusCode : 500,
			body: `{"errorMessage":"${statusCode == 500 ? 'Server Error' : errorMessage }"}`,
			headers: {"content-type": "application/json"} 
		};
        console.log('Error response', JSON.stringify(response));
		return response;
	}
};
