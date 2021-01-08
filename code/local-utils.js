/*
 * Common routines used by multiple tasks - primarily translating between headers
 * of the AWS format and the Node format.
 */
'use strict';
//const u = require('util');

/*
 * From https://nodejs.org/api/http.html#http_message_headers
 */
const nodeSingleValueHeaders = [
	"age", 
	"authorization", 
	"content-length", 
	"content-type", 
	"etag", 
	"expires", 
	"from", 
	"host", 
	"if-modified-since", 
	"if-unmodified-since", 
	"last-modified", 
	"location", 
	"max-forwards", 
	"proxy-authorization", 
	"referer", 
	"retry-after", 
	"server", 
	"user-agent"
];

const utils = {
	/*
	 * Return a shallow copy of the object with all keys lower-cased
	 * duplicates get crushed, so be careful
	 */
	lowerCaseKeys: function (object) {
		if (object && typeof object === 'object') {
			return Object.keys(object).reduce(function(accum, key) {
				accum[(typeof key == 'string' ? key.toLowerCase() : key)] = object[key];
				return accum;
			}, {});
		} else {
			return {};
		}
	},

	/*
	 * From an array of values, produce a valid concatentation of values
	 * for a single HTTP header
	 */
	concatenateHTTPHeaderValues: function(valueArray, separator) {
		if (valueArray.length == 1)
			return valueArray[0];
		return valueArray.reduce((newValue, value) => {
			return (newValue + separator + ('"' + value.replace(/\\([\s\S])|(")/g, "\\$1$2") + '"'));
		}, "");
	},

	covertAWSHeaders2NodeHeaders(singleValueHeaders, multiValueHeaders) {
		/*
		 * References:
		 *		https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
		 *		https://nodejs.org/api/http.html#http_message_headers
		 *
		 * AWS headers can be "headers" and/or "multiValueHeaders", with camel-case keys
		 * Node HTTP response headers are comma-separated, single concatenated values
		 * with lower-case keys
		 * Internally we work with Node headers for responses, so we have to normalize 
		 * AWS headers into the internal structure.
		 * Multivalue headers take presidence in the case of matches
		 */

		/*
		 * Lower case the keys
		 */
		const mergedHeaders = Object.assign(
			singleValueHeaders ? utils.lowerCaseKeys(singleValueHeaders) : {},
			multiValueHeaders ? utils.lowerCaseKeys(multiValueHeaders) : {});

		/*
		 * Transform the values
		 */
		return Object.keys(mergedHeaders).reduce((accum, key) => {
			const value = mergedHeaders[key];
			if (Array.isArray(value)) {
				if (key == "set-cookie") {
					/*
					 * Always an array in Node headers
					 */
					accum[key] == value;
				} else if (key == "cookie") {
					accum[key] = utils.concatenateHTTPHeaderValues(value, "; ");
				} else if (nodeSingleValueHeaders.includes(key)) {
					accum[key] = value[0];
				} else {
					accum[key] = utils.concatenateHTTPHeaderValues(value, ", ");
				}
			} else {
				accum[key] = value;
			}
			return accum;
		}, {});
	},

	/*
	 * Turn an AWS multi-valued header object into an AWS single-value header object
	 *
	 * Where there are multiple values, only the first gets used
	 */
	getSingleValueHeaders: function(multiValueHeaders) {
		return Object.keys(multiValueHeaders).reduce((accum, key) => {
			var value = multiValueHeaders[key];
			if (Array.isArray(value)) {
				accum[key] = value[0];
			} else {
				/*
				 * This shouldn't happen, but we catch it just in case
				 */
				accum[key] = value;
			}
			return accum;
		},{});
	},

	/*
	 * While the API gateway has the same headers in MV and SV header objects,
	 * applications aren't obliged to do the same - they can mix and match. This
	 * is a bear for post processing, so this function makes sure the MV object has all
	 * the SV objects as single-element arrays, and then returns that
	 *
	 * We also convert to lower case for ease of use.
	 */
	normalizeAWSHeaders2MultiValueHeaders: function(singleValueHeaders, multiValueHeaders) {
		/*
		 * Convert to lower case and merge
		 */
		const mergedHeaders = Object.assign(
			singleValueHeaders ? utils.lowerCaseKeys(singleValueHeaders) : {},
			multiValueHeaders ? utils.lowerCaseKeys(multiValueHeaders) : {});
		return Object.keys(mergedHeaders).reduce((accum, key) => {
			var value = mergedHeaders[key];
			accum[key] = (Array.isArray(value) ? value : [value]);
			return accum;
		},{});
	},

	/*
	 * Return a multi-value and single-value object with the headers in
	 *
	 * All keys are already lower case, all values are already single value...
	 * EXCEPT set-cookie, which is an array... so...
	 */
	convertNodeHeaders2AWSHeaders: function(headers) {
		const rc = {
			headers: headers
		};
		rc.multiValueHeaders = Object.keys(headers).reduce((accum, key) => {
			var value = headers[key];
			if (Array.isArray(value)) {
				accum[key] = value;
				delete rc.headers[key];
			} else {
				accum[key] = [value];
			}
			return accum;
		}, {});
		return rc;
	},
	valueMasker: function(key, value) {
		const LCKey = key.toLowerCase();
		if (LCKey == "authorization" || LCKey == "x-api-key" || LCKey == "apikey" || LCKey == "principalid") {
			if (typeof value === 'string') {
				return "****";
			} else if (Array.isArray(value)) {
				return value.map(item => {
					if (typeof item === 'string') {
						return "****";
					} else {
						return item;
					}
				});
			}
		} else if (LCKey == "body" && value) {
			const strValue = ((typeof value === "string") ? value : JSON.stringify(value));
			if (strValue.length > 76) {
				return strValue.substring(0,75) + "....";
			} else {
				return value;
			}
		}
		else {
			return value;
		}
	}
	,
	
   getHydratedResourcePath:  function (evt) {
		var resourcePath = evt.requestContext.resourcePath;
		var pathParameters = evt.pathParameters ? evt.pathParameters : {};
		Object.keys(pathParameters).forEach(function(parm) {
			const rex = new RegExp(`{${parm}\\+?}`);
			resourcePath = resourcePath.replace(rex, pathParameters[parm]);
		});
		return resourcePath;
	}
};
module.exports = utils;
