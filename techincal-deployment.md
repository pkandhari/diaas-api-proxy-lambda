**REQUIRES UPDATING**

## Technical Configuration for the basic functionality

We assume the following:

* You have a VPC
* It has public subnets that contain NAT gateways
* It has private subnets that have outbound routes through those NAT gateways
* You have the AWS CLI installed and configured for the correct account and default region where you want the Lambda and API to run

### In the API Gateway

API Gateway configuration is pretty simple

Firstly you *may* have to make sure that the API Gateway in your account has the `assumeRole` permission and can execute Lambda functions in general.

Martin Bartlett comment:

> Frankly, [this isn't very clear in the API Gateway doc](https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started.html#setting-up), and I haven't done it but API calls to Lambda functions appear to
> work fine. On the other hand, this may have been done automatically when I first set up a lambda integration years ago - so perhaps this is a step you will be directed through when so-doing.

Now, for the target API:

* Use a **Lambda Proxy Integration** for every resource/verb
* Set the name of the Lambda to be a stage variable (say, `${stageVariable.proxyLambda}`). The "add permission" message that you get is helpful, but we handle the task it instructs you to do later in this doc.
* Deploy to a stage
* Set the `proxyLambda` stage variable to be the name you give this function when you deploy it to Lambda
* Set a stage variable named `backendURL` with the backend URL prefix to which the resource path is attached when forwarding the call (e.g. for non-OAuth2 ABS EU that would be: `https://abs.url.com/abs/json`)
* You can also set a stage variable name `mock` to `true` in order to skip the forward calling and, instead, have the entire Lambda state context echoed back in JSON

### In IAM

You need to set up a Role that the Lambda can assume when running your function. This role needs to provide access to two things:

* CloudWatch Logging - for logging, obviously
* EC2 Network Interface creation - because that's how Lambda functions get to run in private VPC subnets

You only need to do this once per account, really. To do this:

* Go to the [IAM roles tab](https://console.aws.amazon.com/iam/home#/roles)
* Click `Create role`
* Select `AWS Service`, then Lambda, then Lambda again (in `Select your use case`)
* Click on `Next: Permissions`
* Search for the pre-built `AWSLambdaVPCAccessExecutionRole` policy and select it (don't click on the policy name, click in selection box on the left)
* Click on `Next: Review`
* Give your role a meaningful name and some doc to help recognize its function
* Click on `Create role`
* Make a note of the role's ARN (displayed on the summary page after creating the role)

This role will be use when deploying the function to Lambda

*NOTE: if you are using the secret header functionality, then you will ALSO have to add permissions for accessing the
Secrets Manager secrets that hold the secret header values - see below"

### In VPC Dashboard

You need to set up an "empty" security group in the VPC into which you want to deploy the Lambda function. This really only needs setting up once per VPC.

* Go to the [VPC Security Groups tab](https://console.aws.amazon.com/vpc/home#securityGroups)
* Click on `Create Security Group`
* Give your security group a meaningful name, tag (it's usually best to these be the same), and description
* Select the VPC into which you want to deploy the Lambda function (While you are at it, take a note of its ID - `vpc-xxxxxxxx`)
* Click on `Yes, Create`
* Take a note of the new group's ID (`sg-xxxxxxxxxxxxxxxx`)

That's it. You can look at the group settings - there should be no inbound rules, and one outbound rule allowing all outbound traffic. You *could* change
that outbound information - but don't - it *will* mess you up!

### In Lambda

To deploy to Lambda, the easiest thing is to use the [deployment script](../deploy-proxy-lambda.sh). 
You'll need to make a copy and change the following items at the top of the script:

* `vpcId`: this is ID (not the name, but the ID) of the VPC that contains the private subnet(s) into which you want to deploy the Lambda function.
* `subnetIds`: change the subnet IDs that are there to the ones you need. If you are using more that one, then comma-separate them. **Do not delete the `SubnetIds=` prefix of the value**.
* `securityGroupIds`: change the security group ID to the one you created (above). **Do not delete the `SecurityGroupIds=` prefix of the value**.
* `vpcENISetupRole`: this is the ARN of the Role you created, above.

The script is called as follows:

```
    deploy-proxy-lambda.sh <function-name> <function-code-folder>
```

where:
* `function-name`:         The name you want to give the function
* `function-code-folder`:  The path to the folder that contains the function code (i.e. this folder)

The script creates a zip of the the function code folder, and then uploads it into the Lambda service.

The function is updated if it already exists (after prompting for confirmation)

The function *is* published - so be careful!


You can test the function in the lambda console. A test API Gateway request body is provided [here](../lambda-test-event.json). This body has 
the `mock` stage variable set to `true` allowing testing without real end-point invocation:

* Go to the [Lambda Functions tab](https://console.aws.amazon.com/lambda/home#/functions)
* Find your function and click on it
* If you haven't already, 
    * Click on `Select a test event`, 
    * Click on `Configure test events`, 
    * Use the content of the [provided file](../lambda-test-event.json) as the content of a new test event.
    * Give your event a name
    * Click on `Create`
    
  Otherwise, simply select the event that you created
 
* Click on `Test`

It SHOULD "just work" :)

### Giving your API permission to execute the Lambda

The final step is to tell the Lambda service that your API can execute this function.

Every Lambda function has an IAM "policy" statement attached to it (visible using the `aws lambda get-policy` CLI command)... well, that is every executable
lambda. The way things stand at the moment, *your* function doesn't - and so cannot be executed outside of the Lambda console.

To add a permission statement to this policy (and thus create the policy if this is first statement to be added) [a script is available](../lambda-api-permissions.sh) 
to simplify the process a little ( but it isn't that complicated anyway. 

The script is called as follows:

```
    lambda-api-permissions.sh <api-name> <function-name>
```

where:
* `api-name`:              The name of the API you want to call the function with
* `function-name`:         The name of the function

As an alternative to this script, we can always update permissions using AWS CLI. We'll have to do this for each of the resources levels declared in our Proxy API (one for collection level and another one for resource proxy level).

As an example, these are the commands to update permission policies for the Proxy Lambda invoked by the *wut8ub2tw3* API on *US-EAST-1* region, for the *665158502186* account:

```
aws lambda add-permission --function-name omnichannel-dev-proxy-lambda --statement-id apigateway 
\ --principal apigateway.amazonaws.com
\ --action lambda:InvokeFunction 
\ --source-arn arn:aws:execute-api:us-east-1:665158502186:wut8ub2tw3/*/*/
```

and

```
aws lambda add-permission --function-name omnichannel-dev-proxy-lambda --statement-id apigateway2 
\ --principal apigateway.amazonaws.com 
\ --action lambda:InvokeFunction 
\ --source-arn arn:aws:execute-api:us-east-1:665158502186:wut8ub2tw3/*/*/*
```

Note that this will *add* a permission to the function policy. It won't check if the named API already has the permission. Of course, that also implies that an number of APIs can be given permission to execute the same function.