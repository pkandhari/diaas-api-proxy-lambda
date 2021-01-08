
"use strict";
/*
 * The "real" Proxy lambda logic outside of generic pre- and post-integration
 * wrapper functionality
 */
const PromiseCChain = require('promise-command-chain');
const integrationChainRunner =     PromiseCChain.factory(require("./integration-chain-config").tasks);

const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == "true");

module.exports = {
    /*
     * Call the appropriate integration
     *
     * This attempts to be as independent as possible 
     */
    handle: async function(event, context, filterContext) {
        enableLoggingDebug && console.log("Running integration command chain");
        const integrationContext = {evt:event,context:context};

        /*
         * If there is a lambda backend, but its value is "__internal__" then 
         * we have been wrapped by the REST/HTTP API lambda wrapper, and that wrapper
         * is running with an invalid configuration.
         * 
         * It's too late to fix the damage that has been done, so we have to return a 500
         * server error.
         * 
         * This is supposed to be the only place where direct dependence on the 
         * filter context is expressed.
         * 
         * In THEORY the two values we rely on - lambdaBackend and requestURL - _could_
         * be recalculated from the event in order to completely isolate the lambda
         * code from the wrapper code.
         * 
         * Interestingly, this MIGHT be possible by replacing the stage variables that
         * are used in SSM-based route integration selection with those used for
         * static declaration. This would need to be done in the pre-integration task
         * that creates the modified event passed to this handler... TODO!
         */
        if (filterContext.lambdaBackend == "__internal__") {
            console.error("The proxy lambda is wrapped, but the configuration is invalid (WrapperProxyMode not set to 'true')");
            return {
                statusCode:500,
                multiValueHeaders: {},
                body: null 
            };
        } else if (filterContext.lambdaBackend) {
            integrationContext.lambdaBackend = filterContext.lambdaBackend;
        } else {
            integrationContext.requestURL = filterContext.backend_request.requestURL;
        }
        await integrationChainRunner(integrationContext);
        filterContext.callTime = integrationContext.callTime;
        filterContext.callReturnTime = integrationContext.callReturnTime;
        return integrationContext.response;
    }
};