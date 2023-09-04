import { ApolloServer } from '@apollo/server';
import { startServerAndCreateLambdaHandler, handlers } from '@as-integrations/aws-lambda';
import DynamoDBModel from "./models/DynamoDBModel.js"
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { GraphQLError } from 'graphql';
import ServerArgs from './serverargs.js'

const config = CONFIG
const dynamodbClient = new DynamoDBClient()
const cognitoClient = new CognitoIdentityProviderClient()
const model = new DynamoDBModel(config.dynamodb, dynamodbClient)

const server = new ApolloServer(ServerArgs);

export const graphqlHandler = startServerAndCreateLambdaHandler(server,
    handlers.createAPIGatewayProxyEventRequestHandler(),
    {
        middleware: [
            async (event) => {
                console.log(JSON.stringify(event))
            }
        ],
        context: async ({ event }) => {
            const { authorization } = event.headers;
            if (!authorization || !authorization.startsWith('Bearer ')) {
                throw new GraphQLError('Authorization header not present or malformed', {
                    extensions: {
                        code: 'UNAUTHENTICATED',
                        http: { status: 401 },
                    },
                });
            }

            const token = authorization.replace('Bearer ', '');
            const getUserCommand = new GetUserCommand({ AccessToken: token });

            try {
                const response = await cognitoClient.send(getUserCommand);
                const user = response.UserAttributes.reduce((result, { Name, Value }) => {
                    const key = Name === 'sub' ? 'userId' : (Name === 'custom:labels' ? 'labels' : Name);
                    const parsedValue = Name === 'custom:labels' ? JSON.parse(Value) : Value;
                    result[key] = parsedValue;
                    return result;
                }, {});

                return {
                    user,
                    production: true,
                    models: {
                        DynamoDB: model,
                    },
                    config: {
                        S3DataBucket: config.s3.data_bucket.name
                    }
                };
            } catch (error) {
                if (error.name === 'NotAuthorizedException') {
                    throw new GraphQLError('User is not authenticated', {
                        extensions: {
                            code: 'UNAUTHENTICATED',
                            http: { status: 401 },
                        },
                    });
                } else {
                    console.error('An unexpected error occurred:', error);
                    throw new GraphQLError('Internal Server Error', {
                        extensions: {
                            code: 'INTERNAL_SERVER_ERROR',
                            http: { status: 500 },
                        },
                    });
                }
            }
        }
    }
);