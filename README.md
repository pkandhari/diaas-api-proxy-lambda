# api-proxy-lambda

This is an AWS Lambda function that takes an API request and 
forwards it to a configured backend, optionally applying various 
transformations to the requests and responses that it handles.

Its primary purposes are 

- to bring the API request into the context of a VPC so that it can then 
have normal VPC-like constraints applied to 
it, 
- to assure that URLs passed to the backend are in the 
expected format for that backend, and that URLs passed from the backend 
are presented to the caller in a format that is usable by the caller, a 
process known as *URL Rewriting*.
- to provide a common point of control and cross-cutting functionality for 
Assure platform services.

## The Forwarding functionality
The forwarding functionality forwards the API request to a service 
implementation that can be 

- an HTTP or HTTPS URL
- another Lambda function
- a Step Functions state machine [TO-DO]

In forwarding the request, the Proxy Lambda can apply certain 
transformations to the request that can help the backend process with the 
request.

### Why this functionality is needed

#### API endpoints exposed by Platform Integrated Services
HTTP(S) service endpoints exposed by ECS-backed platform integrated 
services are not accessible outside of a platform environment VPC - 
including the AWS API Gateway. Consequently a scheme must be used to bring 
API calls forwarded by the API Gateway into the context of the environment 
VPC.

The Proxy Lambda fulfills this role by being associated with (or, one can 
visualize this as "running in") the Assure platform environment's private 
application VPC. 

This configuration gives the function access to all the private 
functionality available in the environment, subject to security group 
restrictions, and, thus, allows the API gateway to execute that code.

_VPC Link_

An alternative to using a "proxy Lambda" to translate a request to a VPC 
context is to directly link the API itself to the private service endpoint 
via an API Gateway VPC Link configuration. However, in so doing, all the 
other functionality provided by the Proxy Lambda would be skipped and, so 
would require an implementation in the target service, resulting in dual 
maintenance.

#### API endpoints exposed by External Managed Services
Platform Managed External Service endpoints are similarly *usually* exposed 
as HTTPS endpoints accessible only to the private subnets of the Platform - 
a configuration enabled using AWS VPC Peering or AWS VPC Service Endpoints. 

Consequently these too require the API call to be "translated" into the VPC 
context before being able to be forwarded.

#### API endpoints exposed by Non-Managed Services
Non-managed external services expose their services by public HTTP(S) 
endpoint and so, in theory, could be directly routed from the API Gateway. 

However, frequently such services require that access to the endpoint be 
restricted to only a certain subset of IP addresses and netmasks. 

Assure platform does not control these parameters for the AWS API Gateway 
and so it would be impossible to provide reliable white lists to the 
external service provider. Again, the Proxy Lambda function, by *running 
in* the environment's application private subnets, can route requests to 
public endpoints via the environment's NAT gateways, whose IP addresses are 
both static and under the control of the Assure platform.

#### API integrations implemented via Lambda Functions and Step Function State Machines
The proxy lambda can also forward calls to AWS Lambda functions and, 
eventually, to AWS Step Function state machines. 

While the former can be easily invoked directly from the API Gateway 
(technically, the Proxy Lambda is, of course, itself a Lambda AWS API 
integration), the latter requires an intermediary such as the proxy lambda, 
and both can profit from the other functionality of the Proxy Lambda, both 
current and future.

### Configuring the backend for an integration
Telling the Proxy Lambda what backend to route the request to involves the 
setting of number of API Gateway Stage Variables.

#### `backendURL` Stage Variable

This provides the URL to which backend requests should be routed. 

##### HTTP(S) Integrations
For HTTP(S) endpoints the API resource path from the request is appended 
to the URL before emitting the backend request. 

For example, for a request that targeted at an API's 

    /policies/12345

resource, whose stage has a `backendURL` stage variable value of 

    https://my-nlb.amazon.com/policyengine/rest-api/v.1 
    
the request will be sent to 

    https://my-nlb.amazon.com/policyengine/rest-api/v.1/policies/12345

Note from this that the `backendURL` value should include any path segments 
that are application specific and not exposed to the "outside world" (here 
the `/policyengine/rest-api/v.1` segments).

Note *also* that if this API serves *only* the `policies` resources, then 
the `policies` segment above *should not be part of the resource path for 
that API's gateway definition*. Instead, `policies` (or some other 
distinguishing value such as `life-policies`) should be the name of the 
Custom Domain Name basepath to which the API's stages are linked, and the 
resource path will simply be `/12345`.

Given *that* (normal) situation, then, with a backend policies engine that *does* require the `policies` segment to appear in the application path, 
the `backendURL` stage variable should be set to 

    https://my-nlb.amazon.com/policyengine/rest-api/v.1/policies

HTTPS integrations also support TLS client certificate authentication. 

The certificate and its associated key are expected to be located in two plain text (i.e. _not_ JSON)
Sectrets Manager secrets. The IDs of these secrets (simple names or ARNs) must be provided as values
of their respective API Stage Variables:

    backendHttpsClientCertificateSecret
    backendHttpsClientKeySecret

##### Lambda Integrations

For Lambda execution, the `backendURL` takes on a special format:

    lambda:lambda-identifier

The `lambda-identifier` part of this value can be any value permitted 
as the [FunctionName](https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html#API_Invoke_RequestSyntax) property of the Lambda Invoke 
API.

The Lambda is passed a slightly sanitized version of the event that triggered the proxy lambda itself:

- Header names in the `event.headers` and `event.multiValueHeaders` objects 
are all lowercase.
- the `connection` and `transfer-encoding` headers are removed
- *normally* the `X-Forwarded-*` headers are also removed
- *normally* The original `host` header value is replaced with
`assure.proxy.lambda` which is used for request URL rewriting

For the latter two cases, see **URL Rewriting** below for more information

##### Step Function Integrations

**NOT YET IMPLEMENTED**

For AWS Step Function executions, the `backendURL` takes on a special format:

    step-function:state-machine-arn

The input to the state machine execution is the content of the event that 
triggered the proxy lambda itself, with the same "tweaks* as described 
above for Lambda backendURLs.

#### `HEADER_...` Stage Variables

You can cause the proxy lambda to add headers to the forwarded request by 
specifying stage variables with the prefix `HEADER_`. 

The remainder of the stage variable name will be used as the new header 
name, with underscores (`_`) converted to hyphens (`-`), and 
double-underscores (`__`) converted to single underscores.

The *value* of such a stage variable can be in one of three formats:

- plain text, which is then used as the new header's value
- `secret:<secret-name>:<secret-key>`, which then obtains the named AWS 
Secret (the value of which must be a JSON object string) and uses the named 
key from that secret as the value of the new header
- `jsonpath:<jsonpath expression>` where the `jsonpath expression` is 
applied to the event object that triggered the Proxy Lambda, with the 
result value being used as the value of the new header.

In the latter two cases, if the value resolves to something that is not a string, the value is converted to a JSON string.

So, to add a plain text header named `My-Plaintext-Header` with a value of 
`my plaintext value`, you simply include in the API stage variables:

| Stage Variable Name | Stage Variable Value |
|---------------------|----------------------|
| `HEADER_My_Plaintext_Header` | `my plaintext value` |

To add a header named `My-Secret-Header` with a value drawn from the 
`header-value` property of a secret named `diaas/api-proxy-lambda/secrets/ 
my-header-secrets` you would add a stage variable

| Stage Variable Name | Stage Variable Value |
|---------------------|----------------------|
| `HEADER_My_Secret_Header` | `secret:diaas/api-proxy-lambda/secrets/my-header-secrets:header-value` |

Finally, to add a header named `X-Auth-Username` with a value that is 
drawn from the user name found in the authorizer context of the API call, 
you would add a stage variable

| Stage Variable Name | Stage Variable Value |
|---------------------|----------------------|
| `HEADER_X_Auth_Username` | `jsonpath:requestContext.authorizer.cognito_username` |

(The latter case assumes that the Assure Platform API Authorizer is being 
used as the API Gateway Authorizer for the API).

Missing values cause the header to not be set. Errors in obtaining the 
value cause a token alluding to the error to be set as the header value.

#### Notes concerning access to secrets
AWS requires that a Lambda that needs to access a secret has specific 
permission to do so. This permission is provided as an IAM policy statement
added to the Proxy Lambda's IAM execution policy.

The Policy statement would look something like this:

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "",
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
                "secretsmanager:ListSecretVersionIds"
            ],
            "Resource": "arn:aws:secretsmanager:<region or *>:<account or *>:secret:<secret-name>"
        }
    ]
}
```

While the platform allows for API-specific execution roles to be used
in invoking the Proxy Lambda, the default platform role contains a policy 
that allows access to secrets with the with following ARN pattern:

```
arn:aws:secretsmanager:<region>:<account>:secret:*
```

## URL Rewriting
A Platform API exposed by the AWS API Gateway can be invoked from a number 
of different endpoints.

- The API's own stage endpoint - e.g. 

      https://{api-id}.execute-api.us-east-1.amazonaws.com/{stage-name}/{resource-path}

- The platform's own API Gateway Custom Domain Name - e.g. 

      https://api.{env-domain}.{account-domain}.assure.dxc.com/cdn-basepath/{resource-path}

- A platform CloudFront Distribution's API route - e.g.

      https://{customer-domain-name}/api/target-api-cdn-basepath/{resource-path}

An HTTPS endpoint, on the other hand, will see the request being directly 
addressed to its own domain, such as that of the platform environment's 
private Network Load Balancer - e.g. 

    http://{nlb-domain}.elb.{aws-region}.amazonaws.com:9876/{app-prefix}/{resource-path}

Request and response bodies can contain the URLs of multiple resources 
managed by the target service, in addition to that of the target resource 
of the request.

In requests, service backends can reasonably expect these other URLs to be 
in the same format as that of the target resource of the request. If a 
(admittedly somewhat naive) service backend were to attempt to access a 
secondary resource whose URL was presented in an external form (e.g. a 
CloudFront API reference) the request would be routed out of the server, 
out of the subnet, out of the VPC, even out of the AWS *Region* only to 
arrive back at the server some time later. 

The point being that the server may have a hard time recognizing a URL as 
referring to a resource that it controls if that URL is presented in terms 
of the original client's reference point rather than that of the service 
itself.

On the other hand API *clients* only deal with URLs that appear to be 
directly served by the endpoint that they directly address. So, for 
example, if an API client were to receive in a response a URL that included 
the network load balancer prefix, that URL would be completely inaccessible 
to the client. 

Consequently, *some* actor in the request chain must assure that the URLs 
in the service backend and in the client are meaningful and usable. And, 
because of the myriad sources from which an API may be invoked, such 
assurance cannot be statically configured.

To solve this problem, in its default configuration, the Proxy Lambda will 
perform *URL rewriting* on API requests and on backend responses before 
forwarding those messages to the target party (backend server for requests, 
client for responses). These transformations are performed on both message 
headers and message bodies.

### How default URL rewriting works

The default URL rewrite process is fairly basic in nature.

- firstly the Proxy Lambda works out which part of the request URL is "API 
related" (so the `{resource-path}` part of the URL in the above examples), 
and which part is the "Original request prefix" (so, for example, the 
`https://{customer-domain-name}/api/target-api-cdn-basepath` part of the 
CloudFront URL in the above examples);
- in the request headers and body it replaces every occurrence of the "Original request prefix" with the value of the `backendURL` stage variable 
value.
- the request is then forwarded to the service backend as described above 
and the response awaited
- in the response headers and body it replaces every occurrence of the 
`backendURL` stage variable value with the value of the "Original request 
prefix".
- the response is then forwarded back to the caller.

This ensures that the backend sees URLs that are correct from its local 
HTTP host perspective, while the client will see URLs that are correct from 
the perspective of the request endpoint that client is using.

For Lambda and Step Function integrations, a "fake original prefix" is used 
in this process:

    https://assure.proxy.lambda

which ensures that the target Lambda, too, can benefit from the URL 
rewriting provided by the Proxy Lambda.

#### The `rewriteAllBackendURLs` Stage Variable
Some legacy, or badly behaved service backends don't generate correct 
local-server-context URLs. The most frequent 'sin' is adding a port when 
the `backendURL` value does not contain a port. 

If this particular 'sin' is committed uniformly, it can be eliminated by 
adding the port to the `backendURL` value.

However if that sin is inconsistently committed (i.e. some URLs have the 
port, while others do not), *or* the protocol, or even the *server* 
segments are wrong, then the Proxy Lambda cannot reliably perform URL 
rewrites.

The `rewriteAllBackendURLs` stage variable, then, when set to true, will 
relax the Proxy Lambda's rewrite algorithm to "ignore" the protocol, 
server, and port when performing URL rewrites in responses. 

To be clear, URLs must *still* start with `http` and must still contain the 
path prefix declared in the `backendURL` stage variable value, but the 
algorithm will transform all strings conforming to that pattern, regardless 
of whether the source URL is `http` or `https`, and regardless of what 
server and port segments are presented.

#### The `skipBodyRewrite` Stage Variable

The `skipBodyRewrite` stage variable considers the Request body as Business data, so the proxy lambda does not take it into account when doing the url rewriting.

### What about the X-Forwarded-* headers?
Common software HTTP frameworks, when used as the basis for backend service 
implementation, will usually generate URLs based *either* upon the values 
of the HTTP standard `X-Forwarded-Host`, `X-Forwarded-Protocol`, and 
`X-Forwarded-Port` headers or, in their absence, upon the host, protocol 
and port of the local HTTP server.

By default, these headers are *not* forwarded to backend by the Proxy 
Lambda. This is for three reasons:

- Blindly allowing frameworks to use these headers in URL construction will 
result in erroneous URLs that the Proxy Lambda cannot correct.

  The problem is that these headers do not take into account the path 
  prefix part of any URLs that must be presented to client, but they would 
  also make it much more difficult for the Proxy Lambda to *see* URLs that 
  need to be corrected.

  Thus by *not* sending these headers common URL generation algorithms will 
  to only generate URLs using the local host "prefix", which is 
  (effectively) the same as the `backendURL` stage variable value.

- Similarly, the server software itself is likely to try and generate URLs 
that contain the the path prefix of the presented URL rather than any path 
prefix that the client expects, or no prefix at all.

- Finally, AWS has a few quirks! 

    In the first place AWS API Gateway never provides the `X-Forwarded-Host` header. 

    Secondly *nowhere* in the trigger event can the host name of the 
    original endpoint be found when that endpoint is a CloudFront 
    distribution. Specifically, the `host` header is set to the CDN host 
    name (which is normal) but the context does not hold any equivalent of 
    the `X-Forwarded-Host` value.

For a large majority of the service backends that platform deals with, 
*not* passing these headers, then, allows the service components to ignore 
the complexities of URL generation and simply work in their simplest 
context. This is especially true of external services, managed or not.

However...

#### "Smart" Backends

The Proxy Lambda's URL rewriting is *still* something that *could* be 
avoided if the service backend itself could implement the generation of 
URLs that are pertinent to the requesting client, and parse presented URLs 
in such a way that they are utilized properly according to the local server 
context.

Bypassing what is effectively four string-replace loops in the Proxy Lambda 
can reduce the performance overhead it imposes upon a request. That 
overhead is very small in production configurations, but an HTTP body with, 
maybe, thousands of URLs to rewrite can still add noticeably to that 
overhead, and for performance-critical backends this may be unacceptable.

Consequently, the Proxy Lambda *can* be configured, on an API-by-API 
basis, to *not* perform URL rewrites and to "trust" that the backend 
service URL processing and generation are correctly dynamically adapted to 
the request context.

This is done using the `forwardXForwarded` stage variable for the API.

#### The `forwardXForwarded` Stage Variable
The default value of this stage variable is `false`, meaning that the
URL rewrite algorithm as presented above is executed.

When this stage variable is set to `true`, the following occurs:

- URL rewriting is completely bypassed in the Proxy Lambda
- the `X-Forwarded-Protcol` header value in the forwarded request is set to 
`https` (the correct value for API endpoints)
- the `X-Forwarded-Port` header value in the forwarded request is not set 
(the correct value for API endpoints)
- the `X-Forwarded-Host` header value in the forwarded request is set to 
the correct derived value, depending on the original source of the request. 

  In the case of CloudFront distributions, this is ascertained using a special header added to Origin Requests by Assure Platform CloudFront
  distributions.

- the *non-standard* `X-Forwarded-fe-Prefix` header value in the forwarded request is set to the path prefix presented by the front end:

  - for CloudFront origins this is `/api/cdn-basepath`
  - for Custom Domain Name origins, this is `/cdn-basepath`
  - for API stage origins, this is `/stage-name`

- the *non-standard* `X-Forwarded-be-Prefix` header value in the forwarded 
request is set to the path prefix extracted from `backendURL` stage 
variable value - so everything between the `{protocol}://host:port` and the 
`/{resource-path}` segments in the examples presented above.

In principle, then, the service implementation can establish the external 
prefix that must be removed from URLs received in the request, and be used
to generate URLs that are sent in the response, by concatenating:

- The value of the `X-Forwarded-Protocol` header from the incoming request
- The value of the `X-Forwarded-Host` header from the incoming request
- The value of the `X-Forwarded-fe-Prefix` header from the incoming request

It can also generate the local-context prefix that must be applied to URLs
received in the request after the external prefix has been removed, by 
concatenating

- The protocol with which the request was invoked,
- The value of the `host` header in the incoming request
- The value of the `X-Forwarded-be-Prefix` header in the incoming request

Where the HTTP framework that is being used to build URLs can handle the 
standard `X-Forwarded-*` headers, the service implementation need only 
concern itself with ensuring that it understands the API Gateway's view of 
the `{resource-path}` and prefixing that with the value of the 
`X-Forwarded-fe-Prefix` header.

## Other functionality

The Proxy Lambda has two more capabilities that are more 'fringe' than the 
above core functionality:

* It can perform CORS preflight OPTIONS call processing, obviating the need 
to pass such calls to the backend. (note that it *always* handles responses 
in a CORS-compatible manner (adding the necessary CORS headers to responses 
as necessary)
* It can "mock" the invocation of the backend. The response you get, in 
this case, is a JSON object detailing the request event content and other 
internal state of the Lambda at the point that it would invoke the backend, 
which can be very useful for debugging.

### CORS functionality

Normally, Platform APIs are defined in the API Gateway without CORS 
configuration - so if the CDN or API Stage endpoints were to be called by a 
browser these would likely fall foul of browser-imposed Cross Origin 
Request restrictions.

The reason for this is that, if configured in the API Gateway, the Gateway 
co-opts *all* OPTIONS requests which then become unusable as true API 
invocations

To solve this problem, for standard platform configurations, the CloudFront 
distributions include functionality to handle such formalities without ever 
passing the CORS preflight requests to the API Gateway.

Consequently, in a *normal* platform configuration, the server side can 
completely ignore the necessity of processing CORS preflight requests.

However, if needed (for non-platform deployments, for example) you can make 
the Lambda serve CORS Preflight responses without invoking the backend. 

It does this in a more discerning fashion than the API Gateway, properly
filtering the OPTIONS invocations that match the standard CORS pre-flight
request pattern, while letting those that do not match that pattern pass
through to the backend.

This feature is, again, configured using API stage variables

The relevant stage variables for this functionality are:

- **`CORSEnforce`**  
  **Possible Values:** `true` or `false`  
  **Default Value**: `false`  
  **Notes**: Activate CORS preflight response processing.  
    With this set, the Lambda will recognize CORS preflight 
    requests and construct the response based on the settings of the other 
    CORS-related stage variables.  

- **`CORSAccessControlAllowCredentials`**  
  **Possible Values:** `true` or `false`  
  **Default Value**: `false`  
  **Notes**: The setting to be used for the `Access-Control-Allow-Credentials` response header.  
  Note that a value of `false` will cause the header to be omitted from the response.  
  See [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials)  

- **`CORSAccessControlAllowHeaders`**  
  **Possible Values:** A list of header names that are permitted on 
  requests  
  **Default Value**: `X-Requested-With,Content-Type,Accept,Origin`  
  **Notes**: The setting to used for the `Access-Control-Allow-Headers` 
  response header, as well as to check whether a standard request is 
  allowed.  
  See [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Headers)  

- **`CORSAccessControlAllowMethods`**  
  **Possible Values:** A list of methods allowed to be used  
  **Default Value**: `GET,POST,HEAD`  
  **Notes**: The setting to be used for the `Access-Control-Allow-Methods` 
  response header, as well as to check whether a standard request is 
  allowed.  
  See [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Methods)  

- **`CORSAccessControlAllowOrigin`**  
  **Possible Values:** A list of origin names or IP addresses, or the word 
  `all`  
  **Default Value**: `all`  
  **Notes**: The setting to be used to derive the 
  `Access-Control-Allow-Origin` response header, as well as to check 
  whether a standard request is allowed.  

  The value `all` is equivalent to the standard value of an asterisk - but 
  you cannot use the asterisk character in a stage variable value. 
  
  Note that the setting value is never reflected back to the caller. 
  Instead, if the value of the request `Origin` header is allowed by this 
  list, then the value of that header is reflected back as the value of the 
  `Access-Control-Allow-Origin` header. Otherwise the 
  `Access-Control-Allow-Origin` header is not returned.  
  
  See [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin)  

- **`CORSAccessControlExposeHeaders`**  
  **Possible Values:** A list of headers that the server may return which 
  the caller is allowed to access.  
  **Default Value**: empty  
  **Notes**: The setting to used for the `Access-Control-Expose-Headers` 
  response header.  
  See [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Expose-Headers)  

- **`CORSForwardPreflight`**  
  **Possible Values:** `true` or `false`  
  **Default Value**: `false`  
  **Notes**: Whether or not to forward CORS preflight requests to the 
  backend server.  
  If set to `true`, the CORS response headers are added to the backend 
  server's response.  

- **`CORSOptionsMaxAge`**  
  **Possible Values:** a timeout value in milliseconds  
  **Default Value**: `30,000` (30 seconds)  
  **Notes**: In order to not have to calculate the CORS preflight state for 
  every call from an API/Stage, the Lambda keeps a cache of the values of 
  the CORS-related stage variables.  
  This has the effect of subtly improving performance at the expense of 
  responsiveness to changes in stage variable values. In testing, this can 
  be kept quite low since stage variable values are subject to change.  
  In production, you can set this ridiculously high because stage variable 
  values are not expected to be at all volatile.  


### Request mocking
Instead of actually calling your backend, you can configure the lambda to simply return a representation of its internal state when it gets to the point where it would call the backend.

You do this using BOTH of the following two values:

- **Environment Variable `ALLOW_MOCKING`**  
  **Possible Values:** `true` or `false`  
  **Default Value**: `false`  
  **Notes**: A value of `true` will allow mocking to be used. Any other 
  value (including not having the variable set at all) will prevent mocked 
  responses from being generated.  
  This setting is required for security reasons: mocking can expose 
  sensitive data. Consequently it should not be enabled by default, nor 
  should it be used in production-grade environments.  

- **Stage Variable `mock`**  
  **Possible Values:** `true` or `false`  
  **Default Value**: `false`  
  **Notes**: A value of `true` will prevent the `backendURL` endpoint from being invoked and, instead, return a representation of the Lambda's current state as a JSON object - always assuming the the environment variable `ALLOW_MOCKING` has also been set to `true`.

## TO-DO
 - Implement Step Function invocation
 - Allow for per-verb/path differences in `backendURL`
 - Add Lambda and Step Function permissions doc to this file
 - Proof read
 - Add architectural images