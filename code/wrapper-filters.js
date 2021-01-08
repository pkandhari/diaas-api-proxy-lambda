
"use strict";
/*
 * The pre- and post-event-processing filters that the generic wrapper
 * needs to run.
 */
const lu = require("./local-utils.js");
const PromiseCChain = require('promise-command-chain');
const preIntegrationChainRunner =  PromiseCChain.factory(require("./pre-integration-chain-config").tasks);
const postIntegrationChainRunner = PromiseCChain.factory(require("./post-integration-chain-config").tasks);

const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == "true");

module.exports = {
    /*
     * Returns an event structure usable by the target integration
     */
    runPreProcessingFilter: async function(originalEvent, eventContext, filterContext) {
        filterContext.isProxyMode = Boolean(process.env.WrapperProxyMode == "true");
        filterContext.evt = originalEvent;
        filterContext.context = eventContext;
        filterContext.normalizedHeaders = lu.normalizeAWSHeaders2MultiValueHeaders(originalEvent.headers, originalEvent.multiValueHeaders);
        filterContext.stageVariables = originalEvent.stageVariables ? originalEvent.stageVariables : {};
        filterContext.additionalResponseHeaders = {};
        enableLoggingDebug && console.log("Running pre-integration command chain");
        await preIntegrationChainRunner(filterContext);
        return filterContext.integrationEvent;  
    },

    /*
     * Returns the response structure that is needed by the lambda caller
     */
    runPostProcessingFilter: async function(integrationResponse, originalEvent, eventContext, filterContext) {
        filterContext.lambdaResponse = integrationResponse;
        await postIntegrationChainRunner(filterContext);
        return filterContext.lambdaResponse;
    }
};