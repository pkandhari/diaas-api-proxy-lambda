'use strict';
const uu = require('useful-utils');
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');
//const useStringReplace = Boolean(process.env.UseStringReplace == 'true');


/*
 * Headers to ignore when forwarding the response
 */
const ignoreResponseHeaders = [
	"content-length",
    "cache-control",
    "connection",
    "transfer-encoding",
	"pragma",
	"authorization",
	"x-api-key",
	"server"
];

module.exports = async (taskContext) => {
	if (enableLoggingDebug) console.log('Running set-response-headers task');

	taskContext.lambdaResponse.multiValueHeaders = Object.assign(taskContext.additionalResponseHeaders, handleResponseHeaders(taskContext));

	return taskContext;
};

function handleResponseHeaders(taskContext) {
	
	/*
	 * Omit headers that should not be propagated and URI rewrite values as necessary
	 *
	 * NOTE - header keys do NOT need normalizing because taskContext.lambdaResponse.multiValueHeaders has
	 *        already been normaized
	 */
	const backendURLReplacePattern = taskContext.urlInfo.rewriteAllBackendURLs ? taskContext.urlInfo.backendAllURLReplacePattern : taskContext.urlInfo.backendURLReplacePattern;
	const finalHeaders = uu.omitCaseless(taskContext.lambdaResponse.multiValueHeaders, ignoreResponseHeaders);
//	const responseHeaders = useStringReplace ? JSON.parse(JSON.stringify(finalHeaders).replace(backendURLReplacePattern, taskContext.urlInfo.apiURL)) : uu.deepReplace(finalHeaders, backendURLReplacePattern, taskContext.urlInfo.apiURL);
	const responseHeaders = uu.deepReplace(finalHeaders, backendURLReplacePattern, taskContext.urlInfo.apiURL);

	/*
	 * Add CORS origin
	 */
	if (taskContext.normalizedHeaders["origin"]) {
		responseHeaders['access-control-allow-origin'] = taskContext.normalizedHeaders["origin"]; //It's already an array
	}
	taskContext.endTime = new Date().getTime();
	
	const callOverhead = (taskContext.callReturnTime && taskContext.callTime) ? taskContext.callReturnTime - taskContext.callTime : 0;
	responseHeaders['x-dxc-backend-overhead-ms'] = [ `${callOverhead}` ];
	responseHeaders['x-dxc-proxy-overhead-ms'] = [ `${taskContext.endTime - taskContext.startTime - callOverhead}` ];

	return responseHeaders;
}
