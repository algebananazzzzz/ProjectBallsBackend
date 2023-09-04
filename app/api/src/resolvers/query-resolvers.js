import { v4 as uuid4 } from 'uuid';
import GraphQLJSON from 'graphql-type-json';
import { getProjectionExpression, generateFilterExpression } from './functions.js'

const resolvers = {
    Query: {
        // All of our resolvers can access our shared contextValue!
        videoByID: async (_, { id }, contextValue, info) => {
            const { userId } = contextValue.user
            const getParams = {
                key: {
                    userId: userId,
                    id: id
                },
                other_params: {
                    ProjectionExpression: getProjectionExpression(info, "Video")
                }
            };

            return await contextValue.models.DynamoDB.getItem("video", getParams);
        },
        videosByUser: async (_, __, contextValue, info) => {
            const { userId } = contextValue.user
            const queryParams = {
                hash_key: userId,
                other_params: {
                    ProjectionExpression: getProjectionExpression(info, "Video")
                }
            };
            return await contextValue.models.DynamoDB.queryItems("video", queryParams);
        },
        snippetByID: async (_, { id }, contextValue, info) => {
            const { userId } = contextValue.user
            const getParams = {
                key: {
                    userId: userId,
                    id: id
                },
                other_params: {
                    ProjectionExpression: getProjectionExpression(info, "Snippet")
                }
            };

            return await contextValue.models.DynamoDB.getItem("snippet", getParams);
        },
        snippetsByUser: async (_, __, contextValue, info) => {
            const { userId } = contextValue.user
            const queryParams = {
                hash_key: userId,
                other_params: {
                    ProjectionExpression: getProjectionExpression(info, "Snippet")
                }
            };

            const result = await contextValue.models.DynamoDB.queryItems("snippet", queryParams);
            return result
        },
        snippetsByVideoID: async (_, { videoId }, contextValue, info) => {
            const queryParams = {
                index_name: 'videoId-id',
                hash_key: videoId,
                other_params: {
                    ProjectionExpression: getProjectionExpression(info, "Snippet")
                }
            };

            return await contextValue.models.DynamoDB.queryItems("snippet", queryParams);
        },
        snippetsByLabels: async (_, { labels, operand }, contextValue, info) => {
            const { userId } = contextValue.user

            const scanExpression = generateFilterExpression(userId, labels, operand || "OR");

            const scanParams = {
                ...scanExpression,
                other_params: {
                    ProjectionExpression: getProjectionExpression(info, "Snippet")
                }
            }

            return await contextValue.models.DynamoDB.scanItems("snippet", scanParams);;
        },
        generateVideoIDKey: (_, __, contextValue) => {
            const { userId } = contextValue.user
            const id = uuid4()
            const key = `${userId}/video-${id}/videofile.mp4`
            return { userId: userId, id, key }
        },
        getLabels: (_, __, { user }) => {
            return { labels: user.labels }
        },
    },
    // Video: {
    //     snippets: async (parent, _, contextValue, info) => {
    //         const queryParams = {
    //             index_name: 'videoId-id',
    //             hash_key: parent.id,
    //             other_params: {
    //                 ProjectionExpression: getProjectionExpression(info)
    //             }
    //         };

    //         return await contextValue.models.DynamoDB.queryItems("snippet", queryParams);
    //     }
    // },
    JSON: GraphQLJSON,
};

export default resolvers;