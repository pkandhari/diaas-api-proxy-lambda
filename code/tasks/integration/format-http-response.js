'use strict';
const uu = require('useful-utils');
const ct = require('content-type');

const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');

/*
 * Node has limited content-typing capabilities - and the HTTP default of iso-8859-1 it calls latin1
 */
const validContentEncodings = {
	'hex': 'hex', 
	'utf8':'utf8', 
	'utf-8':'utf8', 
	'ascii':'ascii', 
	'binary':'binary', 
	'base64':'base64', 
	'ucs2':'ucs2', 
	'ucs-2':'ucs2', 
	'utf16le':'utf16le', 
	'utf-16le':'utf16le',
	'latin1':'latin1',
	'iso-8859-1':'latin1'
};

module.exports = async (taskContext) => {
	if(enableLoggingDebug) console.log('Running format-http-response task');

	if (taskContext.lambdaBackend) {
		if(enableLoggingDebug) console.log('Skipping format-http-response for http - backend is a lambda');
		return taskContext;
	}

	if (!taskContext.httpResponse) {
		console.warn('Running format-http-response task ending early - No httpRresponse object in taskContext');
		return taskContext;
	}

	taskContext.response = {
		statusCode: taskContext.httpResponse.statusCode,
		multiValueHeaders: taskContext.httpResponse.multiValueHeaders
	};

	/*
	 * If it exists, the HTTP response body is a raw buffer
	 */
	if (taskContext.httpResponse.body) {
		var encodeBody = true;
		const rawContentType = taskContext.httpResponse.multiValueHeaders["content-type"] ? taskContext.httpResponse.multiValueHeaders["content-type"][0] : null;
		if (rawContentType) {
			taskContext.responseContentType = ct.parse(rawContentType);
			const mediaType = taskContext.responseContentType.type;
			if (enableLoggingDebug) console.log('Raw content type: ' + rawContentType + ', mediaType: ' + mediaType + ", is textual: " + uu.isMediaTypeText(mediaType));
			if (uu.isMediaTypeText(mediaType)) {
				var contentEncoding = taskContext.responseContentType.parameters.charset;
				if (contentEncoding) 
					contentEncoding = validContentEncodings[contentEncoding.toLowerCase()];
				if (!contentEncoding) 
					contentEncoding = 'utf8';
				var bodyString = taskContext.httpResponse.body.toString(contentEncoding);
				enableLoggingDebug && console.log('Body String: ' + bodyString);
				taskContext.response.body = bodyString;
				encodeBody = false;
			}
		}

		if (encodeBody) {
			taskContext.response.body = taskContext.httpResponse.body.toString('base64');
			taskContext.response.isBase64Encoded = true;
		}
	}
	if(enableLoggingDebug) console.log('Formatted response: ', JSON.stringify(taskContext.response));

	/*
	 * Stop the chain
	 */
	return true;
};



