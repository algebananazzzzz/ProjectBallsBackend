import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import { createReadStream } from 'fs';
import { GraphQLError } from 'graphql';

// Initialize the S3 client
const s3Client = new S3Client();

export const getProjectionExpression = (info, child = null) => {
    if (child) {
        return Object.keys(parseResolveInfo(info).fieldsByTypeName[child]).join(', ');
    } else {
        return Object.keys(Object.keys(parseResolveInfo(info).fieldsByTypeName)[0]).join(', ');
    }
}

export const generateFilterExpression = (userId, labelArray, operand = "OR") => {
    const filterExpressions = [];
    const ExpressionAttributeValues = { ":userId": userId };
    const ExpressionAttributeNames = { "#labels": "labels", "#userId": "userId" };

    labelArray.forEach((value, index) => {
        filterExpressions.push(`contains(#labels, :value${index})`);
        ExpressionAttributeValues[`:value${index}`] = value;
    });

    const FilterExpression = `#userId = :userId AND ` + filterExpressions.join(` ${operand} `);
    return {
        FilterExpression,
        ExpressionAttributeValues,
        ExpressionAttributeNames
    };

}

export const cropVideoHandler = async ({ production, inputSource, localOutputPath, dataBucket, outputKey, startTime, endTime }) => {
    if (production) {
        const command = new GetObjectCommand({
            Bucket: dataBucket,
            Key: inputSource,
        });

        const response = await s3Client.send(command);
        await cropVideoFunction({ inputSource: response.Body, localOutputPath, dataBucket, outputKey, startTime, endTime })
    } else {
        await cropVideoFunction({ inputSource: inputSource, localOutputPath, dataBucket, outputKey, startTime, endTime })
    }
}

export const cropVideoFunction = async ({ inputSource, localOutputPath, dataBucket, outputKey, startTime, endTime }) => {
    try {
        // Perform the video cropping
        await new Promise((resolve, reject) => {
            ffmpeg(inputSource)
                .setStartTime(startTime)
                .setDuration(endTime - startTime)
                .output(localOutputPath)
                .on('end', () => {
                    resolve();
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();
        });

        // Upload the cropped video back to S3 using await
        const putObjectParams = {
            Bucket: dataBucket,
            Key: outputKey,
            Body: createReadStream(localOutputPath), // Use a readable stream of the local file
        };

        const putObjectCommand = new PutObjectCommand(putObjectParams);
        await s3Client.send(putObjectCommand);
    } catch (err) {
        console.log(err)
    }
};

export const deleteSnippetHandler = async ({ key, bucket }) => {
    const input = {
        "Bucket": bucket,
    };
    let command;
    if (typeof key === 'string') {
        input.Key = key
        command = new DeleteObjectCommand(input);
    } else if (typeof key === 'object' && Array.isArray(key)) {
        const keyArray = key.map((value) => ({ Key: value }));
        input.Delete = { Objects: keyArray }
        command = new DeleteObjectsCommand(input);
    }

    return await s3Client.send(command);
}