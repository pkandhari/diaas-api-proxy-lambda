'use strict';
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == 'true');

/*
 * Allow mockong only if told to do so
 *
 * Certified independent of the wrapper task context!
 */
const allow_mocking = process.env.ALLOW_MOCKING == "true";

if (allow_mocking) {
	console.warn("Mocking has been enabled. If a mock call is made sensisitve information may be publicly visible");
}

module.exports = async (taskContext) => {
	if (enableLoggingDebug) console.log('Running implement-mock task');

	if (taskContext.response) {
		if(enableLoggingDebug)console.log('Running implement-mock task ending early - response already present');
		return taskContext;
	}

	if (taskContext.evt.stageVariables.mock && taskContext.evt.stageVariables.mock == "true") {
		if (!allow_mocking) {
			console.warn('Blocking mocking attempt');
			
			taskContext.response =  {
				"statusCode": 400,
				"multiValueHeaders": {
					"Content-Type": ["text/plain"]
				},
				"body": "Mocking has been disabled"
			};
			/*
			 * Stop the chain here
			 */
			return true;
		} else {
			taskContext.callTime = new Date().getTime();
			console.log('Creating mock response');

			var response = {
				"taskContext": taskContext
			};
			
			var responseStr = JSON.stringify(response);
			taskContext.response =  {
				"statusCode": 200,
				"multiValueHeaders": {
					"Content-Type": ["application/json"]
				},
				"body": responseStr
			};
			taskContext.callReturnTime = new Date().getTime();
			/*
			 * Stop the chain here
			 */
			return true;
		}
	}
	return taskContext;
};
