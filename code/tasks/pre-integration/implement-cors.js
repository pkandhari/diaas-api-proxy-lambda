'use strict';
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');

const corsOptionsCache = {};

const simpleMethods = [ "post", "get", "head" ];

module.exports = async (taskContext) => {
	if (enableLoggingDebug) console.log('Running implement-cors task');

	if (taskContext.stageVariables.CORSEnforce == "true") {
		const origin = taskContext.normalizedHeaders['origin'] ? taskContext.normalizedHeaders['origin'][0] : null;
		if (origin != null) {
			const corsOptions = getCorsOptions(taskContext);
			if (originMatches(origin, corsOptions)) {
				taskContext.origin = origin;
				if (isSimpleRequest(taskContext)) {
					handleSimpleResponse(taskContext, corsOptions);
				} else if (isPreflightRequest(taskContext)) {
					/*
					 * Stop the chain if we have created the response
					 */
					if (handlePreflightResponse(taskContext, corsOptions)) return true;
				} else {
					handleSimpleResponse(taskContext, corsOptions);
				}
			} else {
				console.warn(`Cross-origin request to ${taskContext.urlInfo.apiURL} with origin ${origin} does not match allowed origins ${corsOptions.AccessControlAllowOrigin}`);
			}
		}
	}
	return taskContext;
};

const getCorsOptions = function(taskContext) {
	const now = new Date().getTime();
	var apiId = null;
	var stageName = null;

	const requestContext = taskContext.evt.requestContext;

	if (requestContext) {
		apiId = requestContext.apiId;
		stageName = requestContext.stage;

		if (apiId && stageName) {
			const options = corsOptionsCache[`${apiId}/${stageName}`];
			if (options && (options.cachedTime + options.cachedOptionsMaxAge < now)) {
				return options;
			}
		}
	}

	const stageVariables = taskContext.stageVariables;
	var options = {
		AccessControlAllowOrigin: stageVariables['CORSAccessControlAllowOrigin'],
		AccessControlAllowCredentials: stageVariables['CORSAccessControlAllowCredentials'],
		AccessControlAllowMethods: stageVariables['CORSAccessControlAllowMethods'],
		AccessControlAllowHeaders: stageVariables['CORSAccessControlAllowHeaders'],
		AccessControlExposeHeaders: stageVariables['CORSAccessControlExposeHeaders'],
		ForwardPreflight:  stageVariables['CORSForwardPreflight'],
		OptionsMaxAge: stageVariables['CORSOptionsMaxAge']
	};
	options.AccessControlAllowCredentials = (options.AccessControlAllowCredentials && options.AccessControlAllowCredentials.toLowerCase() == 'true') ? 'true' : 'false';
	options.ForwardPreflight = (options.ForwardPreflight && options.ForwardPreflight.toLowerCase() == 'true') ? 'true' : 'false';
	options.AccessControlAllowOrigin      = options.AccessControlAllowOrigin ? (options.AccessControlAllowOrigin == "all" ? "*" : options.AccessControlAllowOrigin) : "*";
	options.AccessControlAllowMethods     = options.AccessControlAllowMethods ? options.AccessControlAllowMethods : "GET,POST,HEAD";
	options.AccessControlAllowHeaders     = options.AccessControlAllowHeaders ? options.AccessControlAllowHeaders : "X-Requested-With,Content-Type,Accept,Origin";
	options.AccessControlExposeHeaders    = options.AccessControlExposeHeaders ? options.AccessControlExposeHeaders: "";
	options.OptionsMaxAge = options.OptionsMaxAge ? options.OptionsMaxAge : "30000";

	options.cachedOptionsMaxAge = parseInt(options.OptionsMaxAge, 10);
	if (isNaN(options.cachedOptionsMaxAge)) {
		options.cachedOptionsMaxAge = 30000;
	}

	options.anyOrigin = false;
	options.allowedOrigins = options.AccessControlAllowOrigin.split(/,\s*/).map(origin => {
		if (options.anyOrigin || origin == "*") {
			options.anyOrigin = true;
			return origin;
		} else {
			//converts the origin string to a regex string
			return ("^" + origin + "$").replace(".", "\\.").replace("*", ".*");
		}
	});

	options.allowCredentials = (options.AccessControlAllowCredentials == "true");
	options.forwardPreflight = (options.ForwardPreflight == "true");

	if (apiId && stageName) {
		options.cachedTime = now;
		corsOptionsCache[`${apiId}/${stageName}`] = options;
	}
	return options;
};

/*
 * A simple request simply has certain headers added to the normal response
 */
const isSimpleRequest = function(taskContext) {
	/*
	 * GET, POST, HEAD and no Access-Control-Request-Method header
	 */
	return (simpleMethods.includes(taskContext.evt.httpMethod.toLowerCase()) && taskContext.normalizedHeaders['access-control-request-method'] == null);
};

/*
 * A preflight request has a bunch more headers added to it, and usually shortcuts the request
 */
const isPreflightRequest = function(taskContext) {
	/*
	 * OPTIONS and a Access-Control-Request-Method header
	 */
	return (taskContext.evt.httpMethod.toLowerCase() == "options" && taskContext.normalizedHeaders['access-control-request-method'] != null);
};


/*
 * TODO: Implement a check on the requested method
 * Note that method will be null or an array
 */
const methodAllowed = function(method, corsOptions) {
	if (enableLoggingDebug) console.log("methodAllowed called :", JSON.stringify([method, corsOptions]));
	return true;
};

/*
 * TODO: Implement a check on the requested headers
 * Note that headers will be null or an array of one element
 */
const headersAllowed = function(headers, corsOptions) {
	if (enableLoggingDebug) console.log("headersAllowed called :", JSON.stringify([headers, corsOptions]));
	return true;
};

/*
 * Check if the declared Origin is allowed
 */
const originMatches = function(origin, corsOptions) {
	/*
	 * Origin is an array of key/value object - we only take the first one and we only need the value
	 */
	return corsOptions.anyOrigin ? true :
		corsOptions.allowedOrigins.find(allowed => {
			return new RegExp(allowed, 'i').test(origin);	
		}) !== undefined;
};

/*
 * Specify the response headers to add to a passed-through request
 */
const handleSimpleResponse = function(taskContext,corsOptions) {
	taskContext.additionalResponseHeaders['access-control-allow-origin'] = [taskContext.origin];
	if (corsOptions.allowCredentials) {
		taskContext.additionalResponseHeaders['access-control-allow-credentials'] = [corsOptions.AccessControlAllowCredentials];
	}
	if (corsOptions.AccessControlExposeHeaders != "")  {
		taskContext.additionalResponseHeaders['access-control-expose-headers'] = [corsOptions.AccessControlExposeHeaders];
	}
};
/*
 * Build a preflight response (or specify the headers to add to a passed-through preflight request)
 *
 * Stop the "pre-handle" chain if we are creating the response
 */
const handlePreflightResponse = function(taskContext,corsOptions) {
	if (methodAllowed(taskContext.normalizedHeaders['access-control-request-method'], corsOptions)
	&& headersAllowed(taskContext.normalizedHeaders['access-control-request-headers'], corsOptions)) {
		taskContext.additionalResponseHeaders['access-control-allow-methods'] = [corsOptions.AccessControlAllowMethods];
		taskContext.additionalResponseHeaders['access-control-allow-origin'] = [taskContext.origin];
		taskContext.additionalResponseHeaders['access-control-allow-headers'] = [corsOptions.AccessControlAllowHeaders];
		if (corsOptions.allowCredentials) {
			taskContext.additionalResponseHeaders['access-control-allow-credentials'] = [corsOptions.AccessControlAllowCredentials];
		}
		if (!corsOptions.forwardPreflight) {
			taskContext.response = {
				'statusCode': 204,
				'body': '',
				'multiValueHeaders' : {}
			};
			return true;
		}
	}
	return false;
};
