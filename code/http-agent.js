const URL = require('url').URL;
const https = require('https');
const http = require('http');

const httpsKeepAliveAgent = new https.Agent({
	keepAlive: true, 
	// Infinitity is read as 50 sockets
	maxSockets: Infinity
});


/*
 * Makes basic node http/https requests into promises and a whole lot
 * easier to handle because of it!
 *
 * httpsOptions is used only if the protocol is https (of course). If
 * the options contain key and/or cert then a new https agent is created
 * to handle the request.
 *
 * Returns a promise that resolves with an object containing the following properties:
 *	
 *		statusCode:	obvious - but note that ALL stati are returned, even 500s
 *		statusMessage: equally obvious
 *		headers:	again, obvious
 *		body:		a Buffer containing the body bytes, or null if there was no body
 */

const requiresNewAgent = {
	key: true,
	cert: true
};

const requiresKeepAliveAgent = {
	keepAlive: true,
};

module.exports = function(method, url, headers, requestBody, httpsOptions) {

	/*
	 * Create a promise out of the request
	 */
	return new Promise(function(resolve, reject) {
		/*
		 * Use the parsed URL as the basic options object
		 */
		const rqstUrl = new URL(url);
		const options = {};
		
		/*
		 * HTTPS has some special handling
		 */
		var isHttps = (rqstUrl.protocol.toLowerCase() == 'https:');

		/*
		 * Use the right library
		 */ 
		const lib = isHttps ? https : http;

		/*
		 * Complete the options object
		 */
		options.method = method;
		if (headers)
			options.headers = headers;

		if (isHttps && httpsOptions) {
			/*
			 * Include certificates and other https options
			 */
			var newAgentRequired = false;
			var keepAliveAgentRequired = false;
			for (var key in httpsOptions) {
//				options[key] = httpsOptions[key];
				newAgentRequired = (newAgentRequired || requiresNewAgent[key]);
				keepAliveAgentRequired =(keepAliveAgentRequired || (httpsOptions[key] == requiresKeepAliveAgent[key]));
			}
			if (newAgentRequired) {
				/*
				 * We need a separate agent
				 */
//				if (options.port === null) options.port = 443;
				options.agent = new https.Agent(httpsOptions);
			} else if (keepAliveAgentRequired) {
				/*
				 * This makes things very fast ... unfortunately it also makes things very unstable due to ECONNRESET errors
				 * So, for now, it is never activated in the calling code (call-backend.js)
				 */
				options.agent=httpsKeepAliveAgent;
			}
		}

		/*
		 * Create the request
		 */
		const request = lib.request(rqstUrl, options, function(response) {
			/*
			 *  Response buffer
			 */
			var responseBody = Buffer.alloc(0);

			/*
			 * Add each chuck to the buffer
			 */
			response.on('data', function(chunk) {
				responseBody = Buffer.concat([responseBody, chunk], responseBody.length + chunk.length);
			});

			/*
			 * Construct the response object and resolve with it.
			 */
			response.on('end', function() {
				resolve({
					statusCode: response.statusCode,
					statusMessage: response.statusMessage,
					headers: response.headers,
					body: responseBody.length > 0 ? responseBody : null
				});
			});
		});

		/*
		 * If there's a request biody, throw it out there
		 */
		if (requestBody)
			request.write(requestBody);
		
		/*
		 * Reject on errors
		 */
		request.on('error', function(err) { reject(err) });

		/*
		 * And get the whole thing going
		 */
		request.end();
	});
};
