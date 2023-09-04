import { GraphQLError } from 'graphql';
import { getProjectionExpression, cropVideoHandler, deleteSnippetHandler } from './functions.js'

const resolvers = {
    Mutation: {
        createVideo: async (_, { description, ...args }, contextValue) => {
            const { userId } = contextValue.user
            const videoItem = {
                userId,
                description: description ? description : "",
                ...args
            }
            await contextValue.models.DynamoDB.createItem("video", videoItem)

            return videoItem
        },
        updateVideo: async (_, { id, ...updates }, contextValue, info) => {
            const { userId } = contextValue.user
            const videoUpdateParams = {
                key: { userId, id: id },
                updates: updates,
                other_params: {
                    ProjectionExpression: getProjectionExpression(info, "Video"),
                    ReturnValues: 'ALL_NEW'
                }
            }
            return await contextValue.models.DynamoDB.updateItem("video", videoUpdateParams);
        },
        deleteVideo: async (_, { id }, contextValue) => {
            const { userId } = contextValue.user
            const videoKey = {
                userId,
                id,
            }
            const response = await contextValue.models.DynamoDB.deleteItem("video", { key: videoKey, other_params: { ReturnValues: "ALL_OLD" } })
            await deleteSnippetHandler({ bucket: contextValue.config.S3DataBucket, key: response.key })
            return id

        },
        createSnippet: async (_, { videoId, videoKey, start_time, end_time, id, ...args }, { user, production, models, config }) => {
            const { userId } = user
            const key = `${userId}/video-${videoId}/snippets/${id}.mp4`
            const snippetItem = {
                userId,
                videoId,
                key,
                start_time,
                end_time,
                id,
                ...args
            }

            if (snippetItem.labels.length === 0) {
                snippetItem.labels = [-1];
            }

            if (start_time && end_time) {
                if (!videoKey) {
                    throw new GraphQLError(`Unable to update snippet: missing required videoKey parameter`, {
                        extensions: {
                            code: 'BAD REQUEST',
                            http: { status: 400 },
                        },
                    });
                }

                await cropVideoHandler({ production, inputSource: videoKey, localOutputPath: `/tmp/${id}.mp4`, dataBucket: config.S3DataBucket, outputKey: key, startTime: start_time, endTime: end_time })
            }

            await models.DynamoDB.createItem("snippet", snippetItem)

            return snippetItem
        },
        updateSnippet: async (_, { id, videoKey, key, ...updates }, { user, production, models, config }, info) => {
            const { userId } = user

            if (updates.labels.length === 0) {
                updates.labels = [-1];
            }

            if (updates.start_time && updates.end_time && key) {
                if (!videoKey) {
                    throw new GraphQLError(`Unable to update snippet: missing required videoKey parameter`, {
                        extensions: {
                            code: 'BAD REQUEST',
                            http: { status: 400 },
                        },
                    });
                }
                await cropVideoHandler({ production, inputSource: videoKey, localOutputPath: `/tmp/${id}.mp4`, dataBucket: config.S3DataBucket, outputKey: key, startTime: updates.start_time, endTime: updates.end_time })
            }

            const snippetUpdateParams = {
                key: { userId, id: id },
                updates: updates,
                other_params: {
                    ProjectionExpression: getProjectionExpression(info, "Snippet"),
                    ReturnValues: 'ALL_NEW'
                }
            }
            return await models.DynamoDB.updateItem("snippet", snippetUpdateParams);
        },
        deleteSnippet: async (_, { id }, contextValue) => {
            const { userId } = contextValue.user
            const snippetKey = {
                userId,
                id,
            }
            const response = await contextValue.models.DynamoDB.deleteItem("snippet", { key: snippetKey, other_params: { ReturnValues: "ALL_OLD" } })
            await deleteSnippetHandler({ bucket: contextValue.config.S3DataBucket, key: response.key })

            return id
        },
        deleteSnippets: async (_, { snippets }, { user, models, config }) => {
            const { userId } = user
            const snippetArray = snippets.map(({ id }) => ({ id, userId }));
            const keyArray = snippets.map(({ key }) => key);
            const batchSize = 25;

            const deleteArray = snippetArray.reduce((acc, obj, index) => {
                const batchIndex = Math.floor(index / batchSize);
                if (!acc[batchIndex]) {
                    acc[batchIndex] = [];
                }
                acc[batchIndex].push(obj);
                return acc;
            }, []);

            await Promise.all(deleteArray.map(async (snippets) => {
                const batchWriteParams = {
                    batch_items: {
                        snippet: {
                            delete: snippets
                        }
                    },
                };
                await models.DynamoDB.batchWriteItem(batchWriteParams, true);
            }));
            await deleteSnippetHandler({ bucket: config.S3DataBucket, key: keyArray })
            return snippets.map(({ id }) => id);
        },
    }
}

export default resolvers;