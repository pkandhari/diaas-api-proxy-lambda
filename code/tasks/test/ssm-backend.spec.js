ssmBackendTask = require("../pre-integration/set-ssm-backend");
eventRequest = require("../../../test-events/MockRequestMicroApi.json");
require("dotenv").config({ path: __dirname + `/.env` });
const AWSMock = require("aws-sdk-mock");
const AWS = require("aws-sdk");
AWSMock.setSDKInstance(AWS);


const SSMParamsFake = {
    Parameters: [
      {
        Name: '/dxcassure/feature-150/features/apis/i7sfjnnq71/routes/ANY/acl/ALL/BACKEND_URL',
        Type: 'String',
        Value: 'lambda:feature-150-assure-document-management-acl'
      },
      {
        Name: '/dxcassure/feature-150/features/apis/i7sfjnnq71/routes/ANY/attribute_classes/ALL/BACKEND_URL',
        Type: 'String',
        Value: 'lambda:feature-150-assure-document-management-attribute_classes'
      },
      {
        Name: '/dxcassure/feature-150/features/apis/i7sfjnnq71/routes/ANY/documents/ALL/BACKEND_URL',
        Type: 'String',
        Value: 'lambda:feature-150-assure-document-management-documents'
      },
      {
        Name: '/dxcassure/feature-150/features/apis/i7sfjnnq71/routes/ANY/groups/ALL/BACKEND_URL',
        Type: 'String',
        Value: 'lambda:feature-150-assure-document-management-groups'
      },
      {
        Name: '/dxcassure/feature-150/features/apis/i7sfjnnq71/routes/ANY/permission_resources/ALL/BACKEND_URL',
        Type: 'String',
        Value: 'lambda:feature-150-assure-document-management-permission_resources'
      },
      {
        Name: '/dxcassure/feature-150/features/apis/i7sfjnnq71/routes/ANY/structures/ALL/BACKEND_URL',
        Type: 'String',
        Value: 'lambda:feature-150-assure-document-management-library'
      },
      {
        Name: '/dxcassure/feature-150/features/apis/i7sfjnnq71/routes/ANY/templates/ALL/BACKEND_URL',
        Type: 'String',
        Value: 'lambda:feature-150-assure-document-management-templates'
      }
    ]
  }

beforeAll(async ()=> {
    console.error = jest.fn();
});

afterAll(()=> {

});

describe("SSM backend task test", () => {
   
    //permission_resources/libraries/permissions
    //permission_resources/documents/permissions
    //documents/


    test("First case", async () => {
        eventRequest.pathParameters["resource-id"] =  "permission_resources/documents/permissions";
        AWSMock.mock(
            'SSM',
            'getParametersByPath',
            SSMParamsFake
        );

        //mock schemaFactory.getDomains()  --> ["events"]
        const taskResult = await ssmBackendTask({evt: eventRequest});
        expect(taskResult).toBeDefined();
    });
});
