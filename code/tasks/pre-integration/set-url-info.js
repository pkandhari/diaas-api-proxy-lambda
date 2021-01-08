'use strict';
const escapeStringRegexp = require('escape-string-regexp');
const url = require('url');
const utils = require('../../local-utils');
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');

const lambdaBackendHost = "assure.proxy.lambda";
const lambdaBackendPrefix = "lambda:";
const lambdaBackendURL = `https://${lambdaBackendHost}`;

/*
 * Establishes URI stuff in the taskContext.urlInfo
 *
 *	apiURL:     the full incoming API URL build from the Lambda event
 *	apiURLReplacePattern:
 *	            the RE needed to replace that URL with the backend when doing URI rewriting
 *	backendURL:  the URL to which to forward the request
 *	backendURLReplacePattern:
 *	            the RE needed to replace the backend URL with the API URL when doing URI rewriting
 *	resourcePath:
 *	            the evt.resourcePath but hydrated with the path variable values
 */
module.exports = async (taskContext) => {
	if (enableLoggingDebug) console.log('Running set-url-info task');
	initContext(taskContext);
	return taskContext;
};

/*
 * Add to the taskContext various bits from the event
 */
function initContext(taskContext) {

	taskContext.urlInfo = {};

	if (!taskContext.isProxyMode) {
		enableLoggingDebug && console.log(`Running in filter mode: Integration backend is an embedded Lambda`);
		taskContext.lambdaBackend = "__internal__";
		taskContext.urlInfo.backendURL = lambdaBackendURL;
		taskContext.urlInfo.lambdaHost = lambdaBackendHost;
	} else if (taskContext.backendURL) {
		if (taskContext.backendURL.startsWith(lambdaBackendPrefix)) {
			taskContext.lambdaBackend = taskContext.backendURL.substring(lambdaBackendPrefix.length);
			if (taskContext.lambdaBackend.length <= 0) {
				throw `invalid lambda name in backendURL value ${taskContext.backendURL}`;
			}
			if (enableLoggingDebug) console.log(`Integration backend is a lambda ${taskContext.lambdaBackend}`);
			taskContext.urlInfo.backendURL = lambdaBackendURL;
			taskContext.urlInfo.lambdaHost = lambdaBackendHost;
		} else {
			taskContext.urlInfo.backendURL = taskContext.backendURL;
			if (enableLoggingDebug) console.log(`Integration backend is http ${taskContext.backendURL}`);
		}
	} else {
		throw "Missing backendURL";
	}

	var techBackendURL = taskContext.lambdaBackend ? lambdaBackendURL : taskContext.urlInfo.backendURL;
	/*
	 * This has a subtle difference to URL.pathname - 
	 * URL.pathname, for an empty-string path, wil be "/", which messes with our RE based on this value
	 */
	var techBackendURLPath = techBackendURL.replace(/^http[s]?:\/\/[^/]+/,"");

	setApiURL(taskContext);

	const feURL = new url.URL(taskContext.urlInfo.apiURL);
	const beURL = new url.URL(techBackendURL);

	taskContext.urlInfo.frontendPrefix = feURL.pathname;
	taskContext.urlInfo.backendPrefix = beURL.pathname;

	taskContext.urlInfo.apiURLReplacePattern = new RegExp(escapeStringRegexp(taskContext.urlInfo.apiURL), "gm");
	taskContext.urlInfo.backendURLReplacePattern = new RegExp(escapeStringRegexp(techBackendURL), "gm");
	taskContext.urlInfo.backendAllURLReplacePattern = new RegExp(`http[s]?://[^/]+${escapeStringRegexp(techBackendURLPath)}`, "gm");
	if (enableLoggingDebug) console.log("URL info: ", JSON.stringify(taskContext.urlInfo, (key, value) => {return key.endsWith('Pattern') ? value.toString() : value}));
}

/*
 * Build the API URL - it doesn't come plainly in the event so we have to derive it from various
 * bits and pieces
 */
function setApiURL(taskContext) {

	let protocol;
	let host;
	let port;
	let contextPath;
	let resourcePath;
	let prefixURL;
	let originalURL;

	if (taskContext.evt.headers) {
		protocol = taskContext.normalizedHeaders["x-forwarded-proto"] ? taskContext.normalizedHeaders["x-forwarded-proto"][0] : null;
		host = taskContext.normalizedHeaders.host ? taskContext.normalizedHeaders.host[0] : null;
		port = taskContext.normalizedHeaders["x-forwarded-port"] ? taskContext.normalizedHeaders["x-forwarded-port"][0] : null;
		originalURL = taskContext.normalizedHeaders["x-dxc-original-url"] ? taskContext.normalizedHeaders["x-dxc-original-url"][0] : null;
	}

	if (originalURL) {
		/*
		 * We've been passed the full original URL, so use that instead of the default one
		 */
	} else {
		protocol = protocol ? protocol : "https";
		host = host ? host : "testgwapi";
		port = port ? (((protocol == "https" && port == "443") || port == "80") ? "" : (":" + port)) : "";
		contextPath = taskContext.evt.requestContext.path;

		originalURL = protocol + "://" + host + port + contextPath;
	}
	
	/*
	 * The prefix (before the resource path) should be the originalURL - context.resourcePath
	 */
	resourcePath = utils.getHydratedResourcePath(taskContext.evt);
	//The path shouldn't have an ending /
	originalURL = originalURL.endsWith("/") ? originalURL.slice(0, -1) : originalURL;
	
	if (enableLoggingDebug) console.log(`originalURL: ${originalURL}, resourcePath: ${resourcePath}`);

	prefixURL = originalURL.endsWith(resourcePath) ? originalURL.substr(0, originalURL.length - resourcePath.length) : originalURL;

	if (enableLoggingDebug) console.log(`prefixURL: ${prefixURL}`);

	taskContext.urlInfo.originalURL = originalURL;
	
	taskContext.urlInfo.apiURL = prefixURL;

	taskContext.urlInfo.resourcePath=resourcePath;

	taskContext.urlInfo.rewriteAllBackendURLs = (taskContext.stageVariables.rewriteAllBackendURLs && taskContext.stageVariables.rewriteAllBackendURLs.toLowerCase() == 'true');
}
