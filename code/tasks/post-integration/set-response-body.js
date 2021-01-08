'use strict';
const uu = require('useful-utils');
const u  = require('util');

const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');
const useStringReplace = Boolean(process.env.UseStringReplace == 'true');

module.exports = async (taskContext) => {
	if (enableLoggingDebug) console.log('Running set-response-body task');

	/*
	 * If the body is a string, perform URL rewriting on it
	 */
	if ((!taskContext.lambdaResponse.isBase64Encoded) && taskContext.lambdaResponse.body && taskContext.lambdaResponse.body.length > 0) {
		var backendURLReplacePattern = taskContext.urlInfo.rewriteAllBackendURLs ? taskContext.urlInfo.backendAllURLReplacePattern : taskContext.urlInfo.backendURLReplacePattern;
		if (enableLoggingDebug) console.log(`Body String: ${taskContext.lambdaResponse.body}, URL pattern: ${u.inspect(backendURLReplacePattern)}, replacement: ${taskContext.urlInfo.apiURL}`);

		taskContext.lambdaResponse.body = useStringReplace ? 
			taskContext.lambdaResponse.body.replace(backendURLReplacePattern, taskContext.urlInfo.apiURL) : 
			uu.deepReplace(taskContext.lambdaResponse.body, backendURLReplacePattern, taskContext.urlInfo.apiURL);
	}
	return taskContext;
};