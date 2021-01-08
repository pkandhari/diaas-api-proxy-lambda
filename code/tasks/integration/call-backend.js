'use strict';
const srq = require("../../http-agent");
const lu = require('../../local-utils');
const awsUtils = require("../../aws-utils");

const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');

/*
 * This handles an HTTP endpoint integration
 *
 * ONE DEPENDENCY ON Wrapper Context
 * 
 * NEED TO REVIEW CREATING THE HTTP REQUEST URL FROM THE INCOMING EVENT 
 */
module.exports = async (taskContext) => {
	if(enableLoggingDebug) console.log('Running call-backend task');

	/*
	 * DEPENDENT ON pre-filled attribute in the task context
	 */
	if (!taskContext.requestURL) {
		if(enableLoggingDebug) console.log('Skipping call-backend for http - not an http backend integration');
		return taskContext;
	}

	if (taskContext.response) {
		if(enableLoggingDebug) console.log('Running call-backend task ending early - response property already present');
		return taskContext;
	}

	var localBody = taskContext.evt.body;
	if (localBody && taskContext.evt.isBase64Encoded) {
		localBody = Buffer.alloc(localBody, 'base64');
	}
	
	var nodeHeaders = lu.covertAWSHeaders2NodeHeaders(taskContext.evt.headers,taskContext.evt.multiValueHeaders);

	/*
	 * Sometimes the content length we get isn't actually correct. We remove it to ensure that
	 * the request itself calculates this properly
	 */
	delete nodeHeaders['content-length'];

	/*
	 * And we kinda want the connection left open please!
	 */
	nodeHeaders.connection = "keep-alive";
	
	/*
	 * See if we have a key and/or certificate specified in the Stage variables
	 */
	const backendHttpsClientKeySecret = taskContext.evt.stageVariables.backendHttpsClientKeySecret;
	const backendHttpsClientCertificateSecret = taskContext.evt.stageVariables.backendHttpsClientCertificateSecret;
	/*
	 * This makes things very fast ... unfortunately it also makes things very unstable due to ECONNRESET errors
	 */
//	const backendHttpsKeepAlive = !(taskContext.evt.stageVariables.backendHttpsKeepAlive != "true"); //convoluted way of ensuring that "true" is the default value
//	const httpsOptions = {keepAlive:backendHttpsKeepAlive};	
	const httpsOptions = {};	
	if (backendHttpsClientKeySecret) httpsOptions.key = await awsUtils.getSecretValue(backendHttpsClientKeySecret);
	if (backendHttpsClientCertificateSecret) httpsOptions.cert = await awsUtils.getSecretValue(backendHttpsClientCertificateSecret);
		
	console.log('calling backend:',
		JSON.stringify({
			method: taskContext.evt.httpMethod,
			url: taskContext.requestURL, 
			headers: nodeHeaders, 
			body: localBody,
			backendHttpsClientKeySecret: backendHttpsClientKeySecret,
			backendHttpsClientCertificateSecret: backendHttpsClientCertificateSecret,
			backendHttpsKeepAlive: backendHttpsKeepAlive
		},(enableLoggingDebug ? null : lu.valueMasker)));

	taskContext.callTime = new Date().getTime();
	const response = await srq(
		taskContext.evt.httpMethod, 
		/*
		 * THIS IS LIKELY WRONG AT THE MOMENT
		 */
		taskContext.requestURL, 
		/*
		 * backend_request object has only the MV headers format
		 */
		nodeHeaders, 
		localBody,
		httpsOptions);
	taskContext.callReturnTime = new Date().getTime();

	console.log('backend responded: ', JSON.stringify(response,enableLoggingDebug ? null : lu.valueMasker));
	/*
	 * Produces AWS SV and MV versions of the Node headers
	 */ 
	taskContext.httpResponse = {
		statusCode: response.statusCode,
		multiValueHeaders: lu.convertNodeHeaders2AWSHeaders(response.headers).multiValueHeaders,
		body: response.body,
	};
	if(enableLoggingDebug) console.log('taskContext.httpResponse: ', JSON.stringify(taskContext.httpResponse));

	return taskContext;
};
