vpcId="vpc-06880060"
subnetIds="SubnetIds=subnet-ba13cedc,subnet-b5001fee"
securityGroupIds="SecurityGroupIds=sg-05349f77df5885684"

vpcConfig="--vpc-config \"${subnetIds},${securityGroupIds}\""
executionRole="arn:aws:iam::334374624224:role/APIGatewayLambdaExecRole"
handler="index.handler"
timeout="60"

runtime="nodejs8.10"


