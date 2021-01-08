'use strict';
const {JSONPath} = require('jsonpath-plus');
const awsUtils = require("../../aws-utils");
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');

const headerVarPrefix = "HEADER_";
const secretValuePrefix = "secret:";
const jsonpathValuePrefix = "jsonpath:";

/*
 * Add custom request headers as defined in the stage variables
 *
 * Syntax is:
 *
 *     "HEADER_<header_name>": "<header value>"
 *
 *  <header_name> - the name of the header, canNOT conatin - in the stage variable setting (API GW restriction)
 *      instead, use "_" and this code will translate to "-" - use "__" if you really want an underscore
 *  <header value> can be the plain value, "secret:<secret-path>:<secret-key>" for a secrets manager value
 *  or a JSON Path expression addressing the standard API Gateway request event JSON - "jsonpath:<path expression>"
 *
 *  Result is a multiValueHeader-formatted object
 */
module.exports = async (taskContext) => {
	if (enableLoggingDebug) console.log('Running set-custom-request-headers task');
	
	taskContext.customRequestHeaders = {};
	
	const stageVariables = taskContext.stageVariables;

	/*
	 * Get the "HEADER_..." variable keys
	 */
	const candidateHeaders = Object.keys(stageVariables).
		filter(varName => varName.startsWith(headerVarPrefix) && varName.length > headerVarPrefix.length);

	/*
	 * Resolve the header values with promises, and set the header object in the task context
	 */
	const valueArray = await Promise.all(candidateHeaders.map(varName => getHeaderValue(stageVariables[varName], taskContext)));

	taskContext.customRequestHeaders = candidateHeaders.reduce((acc, headerName, ind) => {
		if (valueArray[ind]) {
			acc[getHeaderName(headerName.substring(headerVarPrefix.length))] = [valueArray[ind]];
		} else {
			console.warn('no value found for ' + headerName);
		}
		return acc;
	}, {});
	return taskContext;
};

/*
 * single underscores are changed into hyphens, double underscores into singles
 */
function getHeaderName(rawHeaderName) {
	return rawHeaderName.replace(/__/g," ").replace(/_/g,"-").replace(/ /g,"_");
}

/*
 * Figure out if it's a plain value, a secret value, or a JSONPath value
 */
const getHeaderValue = (headerValue, taskContext) => {
	return (headerValue.startsWith(secretValuePrefix) ? 
		getSecretValue(headerValue) :
		( 
			headerValue.startsWith(jsonpathValuePrefix) ?
				getJsonPathValue(headerValue, taskContext) :
				headerValue
		)
	);
};

const getJsonPathValue = async (jsonpathSpec, taskContext) => {
	/*
	 * Shoud be "jsonpath:<JSON Path Expression rooted in taskContext.evt>"
	 * Errors are configuration errors, so we log them and return an error string
	 * as the value
	 */
	const specParts = jsonpathSpec.split(":", 2);
	if (specParts.length != 2) {
		console.warn('Invalid jsonpath spec string: ' + jsonpathSpec);
		return "invalid_jsonpath_spec";
	}
	const jsonPathValue = JSONPath({json: taskContext.evt,path: specParts[1]});
	return (Array.isArray(jsonPathValue) ? jsonPathValue.join(",") : jsonPathValue);
};

/*
 * Attempts to obtain the secret and return a value from it. Errors still return
 * a value, but one indicating the error, which ends up as the replacement value
 * in the custom header. Errors are configuration errors, so we log them
 */
const getSecretValue = async (secretSpec) => {
	/*
	 * Shoud be "secret:<secretName>:<secretKey>"
	 */
	const specParts = secretSpec.split(":");
	if (specParts.length != 3) {
		console.warn('Invalid secret spec string: ' + secretSpec);
		return "invalid_secret_spec";
	}

	try {
		const secretValue = await awsUtils.getSecretValue(specParts[1]);

		const secretJSON = JSON.parse(secretValue);
		if (secretJSON[specParts[2]] === undefined) {
			console.warn (`Unknown key: '${specParts[2]}', in secret: '${secretSpec}'`);
			return "unknown_secret_key";
		} else if (secretJSON[specParts[2]] === null) {
			return "null";
		} else if (typeof secretJSON[specParts[2]] === 'string') {
			return secretJSON[specParts[2]];
		} else {
			console.warn (`Invalid value: '${secretJSON[specParts[2]]}', for key: '${specParts[2]}', in secret: '${secretSpec}'`);
			return "invalid_secret_key_value";
		}
	} catch (err) {
		console.warn (`Error accessing secret: '${secretSpec}'`, err);
		return "inaccesible_secret";
	}
};
