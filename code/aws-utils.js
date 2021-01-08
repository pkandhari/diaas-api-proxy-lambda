/*
 * Common functions wrapping AWS SDK methods
 */
"use strict";

const AWS = require("aws-sdk");
const ssm = new AWS.SSM();
const secretsmanager = new AWS.SecretsManager();

const enableLoggingDebug = Boolean(process.env.EnableLoggingDebug == "true");

const ssmParametersCache = {};

const ssmPamaterCacheTimeoutMinutes = 5;

const ssmPamaterCacheTimeoutMillis = ssmPamaterCacheTimeoutMinutes * 60000;

const aws_utils = {
  getSecretValue: async function (secret_id) {
    /*
     * Get the value of a secrets manager secret
     *
     * THESE ARE NOT CACHED for security reasons
     */
    const secretValueResponse = await secretsmanager.getSecretValue({SecretId: secret_id}).promise();
    return secretValueResponse.SecretString;
  },
  getSSMParameters: async function (ssm_parameter_prefix) {
    /*
     * We need to do the SSM thing
     */
    if (!ssm_parameter_prefix) {
      console.warn("No SSM parameter prefix provided");
      return {};
    }

    if (ssmParametersCache[ssm_parameter_prefix]) {
      if (
        ssmParametersCache[ssm_parameter_prefix]._timestamp +
          ssmPamaterCacheTimeoutMillis >
        Date.now()
      ) {
        return ssmParametersCache[ssm_parameter_prefix];
      }
      /*
       * Cache entry has timed out - lose it
       */
      delete ssmParametersCache[ssm_parameter_prefix];
    }

    let prefixLength = ssm_parameter_prefix.length;
    if (enableLoggingDebug) console.log(`SSM prefix ${ssm_parameter_prefix}`);

    try {
      let nextToken = 1;
      let dataSet = [];
      while (nextToken) {
        const _data = await ssm
          .getParametersByPath({
            Path: ssm_parameter_prefix,
            Recursive: true,
            WithDecryption: false,
            NextToken: nextToken === 1 ? null : nextToken,
          })
          .promise();
        nextToken = _data.NextToken;
        dataSet.push(_data);
      }
      /*
       * The parameter tree exists - extract the parameters and save them
       */
      const data = dataSet.reduce(
        (result, item) => {
          result.Parameters = result.Parameters.concat(item.Parameters);
          return result;
        },
        { Parameters: [] }
      );

      if (enableLoggingDebug) console.log(`SSM data`);
      if (enableLoggingDebug) console.log(data);

      var ssmData = data.Parameters.reduce((accum, value) => {
        accum[value.Name.substr(prefixLength)] = value.Value;
        return accum;
      }, {});
      //ssmData._timestamp = Date.now();
      ssmParametersCache[ssm_parameter_prefix] = ssmData;
      console.log(`SSM data for ${ssm_parameter_prefix}: `, ssmData);
      return ssmData;
    } catch (err) {
      console.log(`Failed to get SSM paremeter ${ssm_parameter_prefix}`, err);
      throw "Invalid configuration";
    }
  },
};

module.exports = aws_utils;