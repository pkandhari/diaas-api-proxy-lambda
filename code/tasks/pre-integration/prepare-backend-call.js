'use strict';
const querystring = require("querystring");
const uu = require('useful-utils');
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');
const useStringReplace = Boolean(process.env.UseStringReplace == 'true');


/*
 * Forwards the request to a backend and stores the response in the task context
 * property "response"
 */

/*
 * Headers to ignore when constructing the request
 */
const ignoreRequestHeadersForwardXForwarded = [
    "host",
    "connection",
    "transfer-encoding"
];

const ignoreRequestHeadersNoForwardXForwarded = ignoreRequestHeadersForwardXForwarded.concat(
	[
		"x-forwarded-host",
		"x-forwarded-port",
		"x-forwarded-for",
		"x-forwarded-proto"
	]);

module.exports = async (taskContext) => {
	if (enableLoggingDebug) console.log('Running prepare-backend-call task');

	/*
	 * Do we want to include the x-forwarded headers in the request
	 *
	 * WARNING: If we DO, it can ROYALLY screw up URI rewriting
	 *
	 * Why?
	 *
	 * Because if the backend system does its OWN URI rewrites based on these
	 * headers (AIA does) then it will not create the correct rewrites because
	 * these headers don't provide ALL the information necessary to produce a
	 * correctly traversible URI from the front end! 
	 *
	 * Best, then, to NOT forward these headers, but, instead, to let this Lambda
	 * perform the correct rewrites.
	 *
	 * If we DO forward the headers, then the lambda also adds the NON-STANDARD x-forwarded-prefix
	 * headers to give the backend system at least a CHANCE at producing the correct URI - but
	 * it will probably still fail to produce a correct rewrite.
	 *
	 * All incoming headers are from the multiValueHeaders object
	 */
	const forwardXForwarded = taskContext.stageVariables.forwardXForwarded ? taskContext.stageVariables.forwardXForwarded == "true" : false;
	const skipBodyRewrite = taskContext.stageVariables.skipBodyRewrite ? taskContext.stageVariables.skipBodyRewrite == "true" : false; 
	const headersToIgnore = forwardXForwarded ? ignoreRequestHeadersForwardXForwarded : ignoreRequestHeadersNoForwardXForwarded;

	const requestURL = 
		taskContext.urlInfo.backendURL + 
		taskContext.urlInfo.resourcePath + 
		(taskContext.evt.queryStringParameters ? `?${querystring.stringify(taskContext.evt.queryStringParameters)}` : "");

	/*
	 * We merge custom headers and request headers
	 *
	 * customRequestHeaders take precidence 
	 * headers-to-remove are removed AFTER the merge (you can't hack that with custom headers)
	 * all headers are subject to URL rewrites
	 */
	const trimmedHeaders = uu.omitCaseless(
		Object.assign(
			{},
			taskContext.normalizedHeaders,taskContext.customRequestHeaders
		),
		headersToIgnore
	);
    const requestHeaders = useStringReplace ?
		JSON.parse(JSON.stringify(trimmedHeaders).replace(taskContext.urlInfo.apiURLReplacePattern, taskContext.urlInfo.backendURL)) :
		uu.deepReplace(trimmedHeaders, taskContext.urlInfo.apiURLReplacePattern, taskContext.urlInfo.backendURL);

	if (forwardXForwarded) {
		/*
		 * API Gateway doesn't actually set x-forwarded-host, so we set it here
		 *
		 * We also add the non, standard x-forwarded-prefix-fe and x-forwraded-prefix-be headers
		 * which can be used by the backend to produce correct URI rewrites.
		 *
		 * But, again, this can ROYALLY screw up URL rewrites
		 */
		requestHeaders["x-forwarded-host"] = taskContext.normalizedHeaders["host"]; //it's already an array
		requestHeaders["x-forwarded-prefix-fe"] = [taskContext.urlInfo.frontendPrefix];
		requestHeaders["x-forwarded-prefix-be"] = [taskContext.urlInfo.backendPrefix];
	}

	/*
	 * If the body is present and plain-text we do replacements too
	 */
	const requestBody = ((taskContext.evt.body && !taskContext.evt.isBase64Encoded && !skipBodyRewrite) ? 
			(useStringReplace ?
				taskContext.evt.body.replace(taskContext.urlInfo.apiURLReplacePattern, taskContext.urlInfo.backendURL):
				uu.deepReplace(taskContext.evt.body, taskContext.urlInfo.apiURLReplacePattern, taskContext.urlInfo.backendURL)) : 
			taskContext.evt.body);
	
	taskContext.backend_request = {
		requestMethod: taskContext.evt.httpMethod.toUpperCase(),
		requestURL: requestURL,
		requestHeaders: requestHeaders,
		requestBody: requestBody,
		requestBodyIsBase64Encoded: taskContext.evt.isBase64Encoded
	};

	return taskContext;
};
