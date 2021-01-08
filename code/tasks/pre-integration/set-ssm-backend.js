"use strict";
const utils = require("../../local-utils");
const aws_utils = require("../../aws-utils");
const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == "true");
const ssmParameterPrefixVar = process.env.SSMParameterPrefix;

module.exports = async (taskContext) => {
  if (enableLoggingDebug) console.log("Running set-ssm-backend task");

  if (!taskContext.isProxyMode) {
    enableLoggingDebug && console.log("Running in filter mode - no dynamic backend");
    return taskContext;
  }

  //Skip if we found backend stage variable
  if (taskContext.backendURL) {
    enableLoggingDebug && console.log("Backend already determined");
    return taskContext;
  } 

  const method = taskContext.evt.httpMethod;
  const route = utils.getHydratedResourcePath(taskContext.evt);

  const ssmBackendParams = await getBackendParamsFromSSM(
    taskContext.evt.requestContext.apiId
  );

  if (ssmBackendParams) {
    if (enableLoggingDebug) console.log("Backend config found in SSM");
    const ssmBackendConfig = getBackendConfigFromSSM({
      ssmBackendParams,
      method,
      route,
      apiId: taskContext.evt.requestContext.apiId,
    });
    if (!ssmBackendConfig) {
      if (enableLoggingDebug) console.log( `Backend config not found for requested route: ${method} on ${route}`);
      throw `method not allowed`;
    }
    
    if (enableLoggingDebug) console.log(`Backend config: ${ssmBackendConfig}`);
    taskContext.backendURL = ssmBackendConfig;
  }
  return taskContext;
};

const getBackendParamsFromSSM = async (apiId) => {
  let backendConfig = null;
  const ssmParameterPrefix = `${ssmParameterPrefixVar}/${apiId}`;
  if (enableLoggingDebug)
    console.log(`ssmParameterPrefix: ${ssmParameterPrefix}`);
  backendConfig = await aws_utils.getSSMParameters(ssmParameterPrefix);
  return backendConfig;
};

const getBackendConfigFromSSM = ({
  ssmBackendParams,
  method,
  route,
}) => {
  const exactMatch = () => {
    ssmBackendParams[`/routes/${method}${route}/BACKEND_URL`]
      ? ssmBackendParams[`/routes/${method}${route}/BACKEND_URL`]
      : ssmBackendParams[`/routes/ANY${route}/BACKEND_URL`]
      ? ssmBackendParams[`/routes/ANY${route}/BACKEND_URL`]
      : null;
  };

  const recursiveMatch = () => {
    //Just Looking for and ALL wildcard now. TOBE enhanced.
    let matchingKey = Object.keys(ssmBackendParams).filter((key) => {
      if (key.includes("ALL")) {
        //removing  /routes/method
        let routeconfig = sanitizeRouteConfig(key);
        return route.includes(routeconfig);
      }
    });

    //If multiple match, we will decide based on the weight of the segment
    if (matchingKey.length===0){
      matchingKey = null;
    }else{
      if(matchingKey.length===1) {
        matchingKey = matchingKey[0];
      }else{
        //Using a reducer to loop the matches and keep the one with more weight. 
        const reducer = (accumulator, currentValue, index) => {
          let routeconfig = sanitizeRouteConfig(currentValue);
          accumulator = route.indexOf(routeconfig) < accumulator.weight ? {weight:route.indexOf(routeconfig), index} : accumulator;
          return accumulator;
        };
        matchingKey = matchingKey[matchingKey.reduce(reducer, {weight:200, index: -1}).index];
      }
    } 
    return matchingKey ? ssmBackendParams[matchingKey] : null;
  };
    
      

  const exactMatchRet = exactMatch();
  const recursiveMatchRet = recursiveMatch();

  return exactMatchRet
    ? exactMatchRet
    : recursiveMatchRet
    ? recursiveMatchRet
    : ssmBackendParams[`/routes/ANY/ALL/BACKEND_URL`];
};

/*

{
  '/routes/ANY/route1/BACKEND_URL': 'lambda:feature-30-diaas-dcs-generation-doc-generation',
  '/routes/ANY/route2/BACKEND_URL': 'lambda:feature-30-diaas-dcs-data-model-dcs-data-model',
  '/routes/GET/route1/route11/BACKEND_URL': 'lambda:feature-30-diaas-dcs-generation-doc-generation'
}

/routes/ANY/generation/ALL/Backend_URL  ->  lambda:generation

GET : /generation/route1 ? 


*/

const sanitizeRouteConfig = (route) =>
  route
    .replace("/routes/", "/")
    .replace("/ANY/", "/")
    .replace("/ALL/", "/")
    .replace("/BACKEND_URL", "");
