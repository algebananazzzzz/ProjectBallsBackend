import { PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, DeleteItemCommand, ScanCommand, BatchGetItemCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';

/**
 * @classdesc A higher-level abstraction class for performing CRUD operations on a DynamoDB table in an Apollo GraphQL server.
 *
 * This class encapsulates the logic for interacting with DynamoDB, providing a simplified interface for resolvers to perform common CRUD database operations.
 *
 */
class DynamoDBModel {
    /**
     * Create a new instance of the DynamoDBModel.
     * @param {Object} config - Configuration options for the model.
     */
    constructor(config, dynamodbClient) {
        if (typeof config !== 'object' || config === null) {
            throw new Error('Invalid config');
        }

        if (typeof dynamodbClient !== 'object' || dynamodbClient === null) {
            throw new Error('Invalid dynamodbClient');
        }

        this.config = config
        this.dynamodbClient = dynamodbClient;
    }

    /**
     * Converts an input object from DynamoDB format to a plain JavaScript object.
     * @param {Object} input - The input object to convert. It should be in DynamoDB format where each key represents a field name and the corresponding value is an object with a specific structure. Example: {"field_name": { S: "value"}}
     * @returns {Object} - The converted object in plain JavaScript format.
     * @throws {Error} - Throws an error if an unsupported value type is encountered.
     */
    static convertToObject(input) {
        // Validate input parameter
        if (typeof input !== 'object' || input === null) {
            throw new Error('Invalid input. The input parameter should be an object.');
        }

        // Create a new object to store the converted values
        const convertedObject = {};

        // Iterate over each key-value pair in the input object
        for (let [key, value] of Object.entries(input)) {
            // Check if the value is an object
            if (typeof value === 'object' && value !== null) {
                // Check for different value formats and convert accordingly
                if (value.S !== undefined) {
                    // Convert String value
                    convertedObject[key] = value.S;
                } else if (value.N !== undefined) {
                    // Convert Number value
                    convertedObject[key] = Number(value.N);
                } else if (value.BOOL !== undefined) {
                    // Convert Boolean value
                    convertedObject[key] = value.BOOL === true;
                } else if (value.NULL !== undefined) {
                    // Convert Null value
                    convertedObject[key] = null;
                } else if (value.SS !== undefined) {
                    // Convert String Set value
                    convertedObject[key] = value.SS;
                } else if (value.NS !== undefined) {
                    // Convert Number Set value
                    convertedObject[key] = value.NS.map(Number);
                } else if (value.BS !== undefined) {
                    // Convert Binary Set value
                    convertedObject[key] = value.BS;
                } else if (Array.isArray(value.L)) {
                    // Convert List value
                    convertedObject[key] = value.L.map((item) => DynamoDBModel.convertToObject({ item }).item);
                } else if (typeof value.M === 'object' && value.M !== null) {
                    // Convert Map (Object) value
                    convertedObject[key] = DynamoDBModel.convertToObject(value.M);
                } else {
                    // Throw an error for unsupported value format
                    throw new Error(`Unsupported value format for key '${key}'.`);
                }
            } else {
                // Throw an error for invalid value format
                throw new Error(`Invalid value format for key '${key}', ${value}, ${input}.`);
            }
        }

        return convertedObject;
    }


    /**
     * Converts a plain JavaScript object to a DynamoDB attribute value object.
     * @param {Object} obj - The input object to convert.
     * @returns {Object} - The converted object in DynamoDB attribute value format.
     * @throws {Error} - Throws an error if an unsupported value type is encountered.
     *
     * @example
     * // Input
     * const inputObject = {
     *     name: "John",
     *     age: 30,
     *     isActive: true,
     *     hobbies: ["reading", "coding"],
     *     address: {
     *         city: "New York",
     *         country: "USA"
     *     },
     *     nullableValue: null
     * };
     *
     * // Output
     * const outputObject = {
     *     name: { S: "John" },
     *     age: { N: "30" },
     *     isActive: { BOOL: true },
     *     hobbies: { L: [
     *         { S: "reading" },
     *         { S: "coding" }
     *     ] },
     *     address: { M: {
     *         city: { S: "New York" },
     *         country: { S: "USA" }
     *     } },
     *     nullableValue: { NULL: true }
     * };
     */
    convertToDynamoDBAttributeValue(obj, table_name = false) {
        const attributeValue = {};

        for (const [key, value] of Object.entries(obj)) {
            let attributeType;
            if (table_name) {
                const tableConfig = this.config[table_name];
                if (!tableConfig) {
                    throw new Error(`Table "${table_name}" is not defined in the configuration.`);
                }
                attributeType = tableConfig.attributes[key] || tableConfig.key_attributes[key] || null;
                if (!attributeType) {
                    throw new Error(`Attribute "${key}" is not defined for table "${table_name}".`);
                }
            }

            if (table_name) {
                switch (attributeType) {
                    case 'S':
                        if (typeof value !== 'string') {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected a string value.`);
                        }
                        attributeValue[key] = { S: value };
                        break;
                    case 'N':
                        if (typeof value !== 'number') {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected a number value.`);
                        }
                        attributeValue[key] = { N: value.toString() };
                        break;
                    case 'BOOL':
                        if (typeof value !== 'boolean') {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected a boolean value.`);
                        }
                        attributeValue[key] = { BOOL: value };
                        break;
                    case 'NULL':
                        if (value !== null) {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected a null value.`);
                        }
                        attributeValue[key] = { NULL: true };
                        break;
                    case 'L':
                        if (!Array.isArray(value)) {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected an array value.`);
                        }
                        attributeValue[key] = { L: value.map(item => this.convertToDynamoDBAttributeValue({ item }).item) };
                        break;
                    case 'M':
                        if (typeof value !== 'object' || value === null) {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected an object value.`);
                        }
                        attributeValue[key] = { M: this.convertToDynamoDBAttributeValue(value) };
                        break;
                    case 'B':
                        if (!Buffer.isBuffer(value)) {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected a Buffer value.`);
                        }
                        attributeValue[key] = { B: value };
                        break;
                    case 'SS':
                        if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected a Set of string values.`);
                        }
                        attributeValue[key] = { SS: value };
                        break;
                    case 'NS':
                        if (!Array.isArray(value) || !value.every(item => typeof item === 'number')) {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected a Set of number values.`);
                        }
                        attributeValue[key] = { NS: value.map(item => item.toString()) };
                        break;
                    case 'BS':
                        if (!Array.isArray(value) || !value.every(item => Buffer.isBuffer(item))) {
                            throw new Error(`Invalid value type for key "${key}" in table "${table_name}". Expected a Set of Buffer values.`);
                        }
                        attributeValue[key] = { BS: value };
                        break;
                    default:
                        throw new Error(`Unsupported attribute type ${obj} "${attributeType}" for key "${key}" in table "${table_name}".`);
                }
            } else {
                if (typeof value === 'string') {
                    attributeValue[key] = { S: value };
                } else if (typeof value === 'number') {
                    attributeValue[key] = { N: value.toString() };
                } else if (typeof value === 'boolean') {
                    attributeValue[key] = { BOOL: value };
                } else if (value === null) {
                    attributeValue[key] = { NULL: true };
                } else if (Array.isArray(value)) {
                    attributeValue[key] = { L: value.map(item => this.convertToDynamoDBAttributeValue({ item }).item) };
                } else if (typeof value === 'object' && value !== null) {
                    attributeValue[key] = { M: this.convertToDynamoDBAttributeValue(value) };
                } else if (Buffer.isBuffer(value)) {
                    attributeValue[key] = { B: value };
                } else {
                    throw new Error(`Unsupported value type for key "${key}" in table "${table_name}".`);
                }
            }
        }

        return attributeValue;
    }



    /**
     * Executes an operation with retry logic using an exponential backoff strategy for handling retryable errors.
     * @param {Function} operation - The operation to be executed. Should be an async function or a function returning a Promise.
     * @param {string[]} [retryableErrors=['ProvisionedThroughputExceededException', 'ThrottlingException']] - The list of retryable error codes. If not provided, defaults to ['ProvisionedThroughputExceededException', 'ThrottlingException'].
     * @param {Object} [retryOptions={ maxRetries: 3, baseDelay: 1000, exponent: 2 }] - The retry options object.
     * @param {number} [retryCount=0] - The current retry count. Used internally for tracking the number of retries.
     * @returns {Promise<any>} - The result of the operation if successful after retries, or throws an error if retries are exhausted.
     */
    static async retryWithBackoff(operation, retryableErrors = ['ProvisionedThroughputExceededException', 'ThrottlingException'], retryOptions = { maxRetries: 3, baseDelay: 1000, exponent: 2 }, retryCount = 0) {
        try {
            return await operation();
        } catch (error) {
            if (retryableErrors.includes(error.code)) {
                if (retryCount < retryOptions.maxRetries) {
                    // Calculate delay using exponential backoff formula
                    const delay = Math.pow(retryOptions.exponent, retryCount) * retryOptions.baseDelay;
                    console.error(`Error occurred during operation: ${error.message}. Retrying after ${delay}ms...`);

                    // Wait for the calculated delay
                    await new Promise((resolve) => setTimeout(resolve, delay));

                    // Recursive call to retry the operation with incremented retryCount
                    return await DynamoDBModel.retryWithBackoff(operation, retryableErrors, retryOptions, retryCount + 1);
                } else {
                    console.error(`Error occurred during operation: ${error.message}. Max retry attempts exceeded. Unable to complete operation.`);
                    throw error;
                }
            } else {
                // Throw error for non-retryable error codes
                console.error(`Non-retryable error occurred. Unable to complete operation.`);
                throw error;
            }
        }
    }

    /**
     * Creates an item in the DynamoDB table.
     * @param {String} table - The target table to perform operation on.
     * @param {Object} item - The item to be created. It should include the hash key and range key(s) of all indexes.
     * @param {boolean} [retry=false] - Whether to retry the operation on error. Retry parameters are set on model construction.
     * @returns {Promise<any>} - A promise that resolves to the result of the operation if successful, or throws an error if retries are exhausted or an error occurs.
     * @throws {Error} - If the item parameter is missing or not an object, or if it does not include the required key properties.
     *
     * @example
     * // Create a new item in the DynamoDB table
     * const item = {
     *   userId: 'abc123',
     *   date: '2023-06-14',
     *   name: 'John Doe',
     *   age: 30
     * };
     * 
     * const result = await DynamoDBModel.createItem(item, true);
     * console.log(result);
     */
    async createItem(table, item, retry = false) {
        if (!this.config.hasOwnProperty(table)) {
            throw new Error(`Table "${table}" does not exist`);
        }

        if (!item || typeof item !== 'object') {
            throw new Error('The item parameter must be an object.');
        }

        // Validate the presence of required key properties
        const { hash_key, range_key, table_name } = this.config[table];
        if (!item.hasOwnProperty(hash_key)) {
            throw new Error(`The item parameter must include the hash key property: ${hash_key}`);
        }
        if (range_key && !item.hasOwnProperty(range_key)) {
            throw new Error(`The item parameter must include the range key property: ${range_key}`);
        }

        const params = {
            TableName: table_name,
            Item: this.convertToDynamoDBAttributeValue(item, table),
        };

        const response = retry ? await DynamoDBModel.retryWithBackoff(async () => {
            return await this.dynamodbClient.send(new PutItemCommand(params))
        }) : await this.dynamodbClient.send(new PutItemCommand(params));
        return response
    }

    /**
     * Retrieves an item from the DynamoDB table based on the provided key.
     * @param {String} table - The target table to perform operation on.
     * @param {Object} key - The key object that contains the hash key and range key (if applicable) to perform the retrieval.
     * @param {boolean} [retry=false] - Whether to retry the operation on error.
     * @returns {Promise<any>} - A promise that resolves to the retrieved item if successful, or throws an error if retries are exhausted or an error occurs.
     * @throws {Error} - If the key parameter is missing or not an object, or if it does not include the required key properties.
     *
     * @example
     * // Retrieve an item from the DynamoDB table
     * const getParams = {
     *   key: {
     *     userId: 'abc123',
     *     date: '2023-06-14',
     *   },
     *   other_params: {
     *     ProjectionExpression: "Field_1, Field_2",
     *   }
     * };
     *
     * const result = await DynamoDBModel.getItem(getParams, true);
     * console.log(result);
     */
    async getItem(table, { key, other_params }, retry = false) {
        if (!this.config[table]) {
            throw new Error(`Table "${table}" does not exist`);
        }

        if (!key || typeof key !== 'object') {
            throw new Error('The key parameter must be an object.');
        }

        if (other_params && typeof other_params !== 'object') {
            throw new Error('The other_params parameter must be an object.');
        }

        const { hash_key, range_key, table_name } = this.config[table];

        if (!key.hasOwnProperty(hash_key)) {
            throw new Error(`The key parameter must include the hash key property: ${hash_key}`);
        }

        if (range_key && !key.hasOwnProperty(range_key)) {
            throw new Error(`The key parameter must include the range key property: ${range_key}`);
        }

        const params = {
            TableName: table_name,
            Key: this.convertToDynamoDBAttributeValue(key, table),
        };

        if (other_params) {
            const {
                ProjectionExpression,
                ExpressionAttributeNames,
                ...others
            } = other_params;

            params.ExpressionAttributeNames = {
                ...(params.ExpressionAttributeNames || {}),
                ...(ExpressionAttributeNames || {})
            };

            if (ProjectionExpression) {
                params.ProjectionExpression = ProjectionExpression
                    .split(', ')
                    .map((element) => {
                        params.ExpressionAttributeNames[`#${element}`] = element;
                        return `#${element}`;
                    })
                    .join(", ");
            }

            Object.assign(params, others);
        }

        const response = retry ? await DynamoDBModel.retryWithBackoff(async () => { return await this.dynamodbClient.send(new GetItemCommand(params)) }) : await this.dynamodbClient.send(new GetItemCommand(params));
        return response.Item ? DynamoDBModel.convertToObject(response.Item) : null;
    }


    /**
     * Queries items from the DynamoDB table based on the provided query parameters.
     * @param {String} table - The target table to perform operation on.
     * @param {Object} queryParams - The query parameters object.
     * @param {string} queryParams.hash_key - The hash key value to perform the query.
     * @param {Object} queryParams.range_key - The sort key conditions object.
     * @param {string} queryParams.range_key.operation - The operation to apply on the sort key (allowed values: "between," "gt," "lt", "ge", "le" "begins_with," "equals").
     * @param {*} queryParams.range_key.value - The value to use in the range key condition. Can be of any valid DynamoDB data type.
     * @param {string} [indexName=null] - The name of the index to query (optional).
     * @param {boolean} [retry=false] - Whether to retry the operation on error.
     * @returns {Promise<any>} - A promise that resolves to the query results if successful, or throws an error if retries are exhausted or an error occurs.
     * @throws {Error} - If the query parameters are missing or invalid, or if an unsupported operation is provided in the sort key conditions.
     *
     * @example
     * // Query items from the DynamoDB table
     * const queryParams = {
     *   hash_key: 'abc123',
     *   range_key: {
     *     operation: 'gt',
     *     value: 10,
     *   },
     * };
     * other_params: {
     *     ProjectionExpression: "Field_1, Field_2",
     *     Limit: 10,
     *     ExclusiveStartKey: LastEvaluatedKey,
     *     FilterExpression: "#NAME = :n",
     *     ExpressionAttributeNames: {
     *       "#NAME": "Name",
     *     },
     *     ExpressionAttributeValues: {
     *       ":n": "value"
     *     }
     *   }
     * };
     * 
     * const result = await DynamoDBModel.queryItems(queryParams, "exampleIndexName", true);
     * console.log(result);
     */
    async queryItems(table, { hash_key, range_key: sortKeyConditions, index_name: indexName, other_params }, retry = false) {
        if (!this.config[table]) {
            throw new Error(`Table "${table}" does not exist.`);
        }

        if (!hash_key) {
            throw new Error("Invalid query parameters. hash_key is required.");
        }

        if (sortKeyConditions && (!sortKeyConditions.operation || !sortKeyConditions.value)) {
            throw new Error("Invalid query parameters. range_key.operation and range_key.value are required.");
        }

        const tableConfig = this.config[table];
        const table_name = tableConfig.table_name;
        const { hash_key: hashKeyName, range_key: rangeKeyName } = indexName ? tableConfig.indexes[indexName] : tableConfig;
        const params = {
            TableName: table_name,
            IndexName: indexName,
            KeyConditionExpression: "#PK = :PartitionKey",
            ExpressionAttributeNames: {
                "#PK": hashKeyName,
            },
            ExpressionAttributeValues: {
                ":PartitionKey": this.convertToDynamoDBAttributeValue({ hash_key }).hash_key,
            },
        };

        if (other_params) {
            const {
                ProjectionExpression,
                ExpressionAttributeNames,
                ExpressionAttributeValues,
                ...others
            } = other_params;

            params.ExpressionAttributeNames = {
                ...(params.ExpressionAttributeNames || {}),
                ...(ExpressionAttributeNames || {})
            };

            params.ExpressionAttributeValues = {
                ...(params.ExpressionAttributeValues || {}),
                ...(ExpressionAttributeValues ? convertToDynamoDBAttributeValue(ExpressionAttributeValues, table) : {})
            };

            if (ProjectionExpression) {
                params.ProjectionExpression = ProjectionExpression
                    .split(', ')
                    .map((element) => {
                        params.ExpressionAttributeNames[`#${element}`] = element;
                        return `#${element}`;
                    })
                    .join(", ");
            }

            Object.assign(params, others);
        }

        if (sortKeyConditions && typeof sortKeyConditions === "object") {
            params.ExpressionAttributeNames["#SK"] = rangeKeyName;
            const expressionAttributeValues = params.ExpressionAttributeValues;
            const { operation, value } = sortKeyConditions;

            if (operation === "between" && Array.isArray(value) && value.length === 2) {
                const [start, end] = value;
                const startAttributeValue = this.convertToDynamoDBAttributeValue({ start }).start;
                const endAttributeValue = this.convertToDynamoDBAttributeValue({ end }).end;

                params.KeyConditionExpression += " AND #SK BETWEEN :start AND :end";
                expressionAttributeValues[":start"] = startAttributeValue;
                expressionAttributeValues[":end"] = endAttributeValue;
            } else if (["gt", "lt", "ge", "le"].includes(operation)) {
                const conditionAttributeValue = this.convertToDynamoDBAttributeValue({ value }).value;
                params.KeyConditionExpression += ` AND #SK ${operation === "gt" ? ">" : operation === "lt" ? "<" : operation === "ge" ? ">=" : "<="} :${operation}`;
                expressionAttributeValues[`:${operation}`] = conditionAttributeValue;
            } else if (operation === "begins_with" && typeof value === "string") {
                const conditionAttributeValue = this.convertToDynamoDBAttributeValue({ value }).value;
                params.KeyConditionExpression += ` AND begins_with(#SK, :begins_with)`;
                expressionAttributeValues[`:begins_with`] = conditionAttributeValue;
            } else if (operation === "equals") {
                const conditionAttributeValue = this.convertToDynamoDBAttributeValue({ value }).value;
                params.KeyConditionExpression += ` AND #SK = :equals`;
                expressionAttributeValues[`:equals`] = conditionAttributeValue;
            } else {
                if (operation === "between") {
                    throw new Error(`Invalid range_key operation "${operation}" with value "${value}". Value must be a non-null list of 2 elements.`);
                } else {
                    throw new Error(`Invalid range_key operation "${operation}". The range_key operation must be one of the following: "between", "gt", "lt", "ge", "le", "begins_with", or "equals".`);
                }
            }
        }

        const response = retry
            ? await DynamoDBModel.retryWithBackoff(async () => { return await this.dynamodbClient.send(new QueryCommand(params)) })
            : await this.dynamodbClient.send(new QueryCommand(params));

        return response.Items ? response.Items.map(DynamoDBModel.convertToObject) : [];
    }


    /**
     * Scan items in the model's table based on provided parameters.
     * @param {String} table - The target table to perform operation on.
     * @param {Object} scanParams - Scan parameters for the scan operation.
     * @param {Object} scanParams.ExpressionAttributeValues - Expression attribute values for the scan operation.
     * @param {Object} scanParams.ExpressionAttributeNames - Expression attribute names for the scan operation (optional).
     * @param {string} scanParams.FilterExpression - Filter expression for the scan operation (optional).
     * @param {Object} [scanParams.other_params] - Additional parameters for the scan operation (optional).
     * @param {boolean} [retry=false] - Whether to retry the operation in case of errors. Retry parameters are set on Model construction.
     * @returns {Promise<any>} - Promise resolving to the result of the scan operation.
     * @throws {Error} - If an error occurs during the scan operation.
     *
     * @example
     * const scanParams = {
     *   ExpressionAttributeValues: {
     *     ":value": "example",
     *   },
     *   ExpressionAttributeNames: {
     *     "#field": "fieldName",
     *   },
     *   FilterExpression: "attribute_exists(#field) AND begins_with(#field = :value)",
     *   other_params: {
     *     ProjectionExpression: "#field, otherField",
     *     Limit: 10,
     *     ExclusiveStartKey: LastEvaluatedKey,
     *   }
     * };
     * const result = await DynamoDBModel.scanItems(scanParams, true);
     * console.log(result);
     *
     * Accepted operations in FilterExpression:
     *   - comparator operand
     *   - BETWEEN operand AND operand
     *   - IN ( operand (',' operand (, ...) ))
     *   - function
     *   - condition AND condition
     *   - condition OR condition
     *   - NOT condition
     *   - ( condition )
     *
     * Accepted comparators:
     *   - =
     *   - <>
     *   - <
     *   - <=
     *   - >
     *   - >=
     *
     * Accepted functions:
     *   - attribute_exists (path)
     *   - attribute_not_exists (path)
     *   - attribute_type (path, type)
     *   - begins_with (path, substr)
     *   - contains (path, operand)
     *   - size (path)
     */
    async scanItems(table, { ExpressionAttributeValues, ExpressionAttributeNames, FilterExpression, other_params }, retry = false) {
        // Validate ExpressionAttributeValues parameter if provided
        if (ExpressionAttributeValues && typeof ExpressionAttributeValues !== 'object') {
            throw new Error('Invalid ExpressionAttributeValues parameter. Expected an object.');
        }

        // Validate ExpressionAttributeNames parameter if provided
        if (ExpressionAttributeNames && typeof ExpressionAttributeNames !== 'object') {
            throw new Error('Invalid ExpressionAttributeNames parameter. Expected an object.');
        }

        // Validate FilterExpression parameter if provided
        if (FilterExpression && typeof FilterExpression !== 'string') {
            throw new Error('Invalid FilterExpression parameter. Expected a string.');
        }

        // Validate other_params parameter if provided
        if (other_params && typeof other_params !== 'object') {
            throw new Error('Invalid other_params parameter. Expected an object.');
        }
        const table_name = this.config[table].table_name
        const params = {
            TableName: table_name,
            ExpressionAttributeValues: ExpressionAttributeValues ? this.convertToDynamoDBAttributeValue(ExpressionAttributeValues) : undefined,
            ExpressionAttributeNames: ExpressionAttributeNames || undefined,
            FilterExpression: FilterExpression || undefined,
        };

        if (other_params) {
            const {
                ProjectionExpression,
                ExpressionAttributeNames,
                ExpressionAttributeValues,
                ...others
            } = other_params;

            params.ExpressionAttributeNames = {
                ...(params.ExpressionAttributeNames || {}),
                ...(ExpressionAttributeNames || {})
            };

            params.ExpressionAttributeValues = {
                ...(params.ExpressionAttributeValues || {}),
                ...(ExpressionAttributeValues ? convertToDynamoDBAttributeValue(ExpressionAttributeValues, table) : {})
            };

            if (ProjectionExpression) {
                params.ProjectionExpression = ProjectionExpression
                    .split(', ')
                    .map((element) => {
                        params.ExpressionAttributeNames[`#${element}`] = element;
                        return `#${element}`;
                    })
                    .join(", ");
            }

            Object.assign(params, others);
        }

        const response = retry ? await DynamoDBModel.retryWithBackoff(async () => { }) : await this.dynamodbClient.send(new ScanCommand(params));

        return response.Items ? response.Items.map(DynamoDBModel.convertToObject) : []
    }

    /**
     * Update an item in the model's table based on the provided key and updates.
     * @param {String} table - The target table to perform operation on.
     * @param {Object} updateParams - Parameters for the update operation.
     * @param {Object} updateParams.key - Key of the item to be updated. Must include the hash key and range key if applicable.
     * @param {Object} updateParams.updates - Updates to be applied to the item.
     * @param {Object} [updateParams.other_params] - Additional parameters for the update operation (optional).
     * @param {boolean} [retry=false] - Whether to retry the operation in case of errors. Retry parameters are set on Model construction.
     * @returns {Promise<any>} - Promise resolving to the updated item.
     * @throws {Error} - If an error occurs during the update operation or required parameters are missing or invalid.
     *
     * @example
     * const updateParams = {
     *   key: {
     *     userId: "exampleUserId",
     *     date: "exampleDate",
     *   },
     *   updates: {
     *     field1: "updatedValue1",
     *     field2: "updatedValue2",
     *   },
     *   other_params: {
     *     ReturnValues: "ALL_NEW",
     *   },
     * };
     * const updatedItem = await DynamoDBModel.updateItem(updateParams, true);
     * console.log(updatedItem);
     */
    async updateItem(table, { key, updates, other_params = { ReturnValues: "ALL_NEW" } }, retry = false) {
        // Validate key parameter
        if (!key || typeof key !== "object") {
            throw new Error("Invalid key parameter. Expected an object.");
        }

        // Validate updates parameter
        if (!updates || typeof updates !== "object") {
            throw new Error("Invalid updates parameter. Expected an object.");
        }

        const { hash_key, range_key, table_name } = this.config[table];
        if (!key.hasOwnProperty(hash_key)) {
            throw new Error(`The key parameter must include the hash key property: ${hash_key}`);
        }
        if (range_key && !key.hasOwnProperty(range_key)) {
            throw new Error(`The key parameter must include the range key property: ${range_key}`);
        }

        const params = {
            TableName: table_name,
            Key: this.convertToDynamoDBAttributeValue(key, table),
            UpdateExpression: "SET ",
            ExpressionAttributeNames: {},
            ExpressionAttributeValues: {},
            ...other_params
        };

        const updateArray = []
        Object.entries(this.convertToDynamoDBAttributeValue(updates, table)).forEach(([key, value]) => {
            params.ExpressionAttributeNames[`#${key}`] = key
            params.ExpressionAttributeValues[`:${key}`] = value
            updateArray.push(`#${key} = :${key}`)
        });
        params.UpdateExpression += updateArray.join(", ")

        const response = retry ? await DynamoDBModel.retryWithBackoff(async () => { return await this.dynamodbClient.send(new UpdateItemCommand(params)) })
            : await this.dynamodbClient.send(new UpdateItemCommand(params));

        return response.Attributes ? DynamoDBModel.convertToObject(response.Attributes) : {}
    }

    /**
     * Delete an item from the model's table based on the provided key.
     * @param {String} table - The target table to perform operation on.
     * @param {Object} key - Key of the item to be deleted. Must include the hash key and range key if applicable.
     * @param {boolean} [retry=false] - Whether to retry the operation in case of errors. Retry parameters are set on Model construction.
     * @returns {Promise<any>} - Promise resolving to the deleted item.
     * @throws {Error} - If an error occurs during the delete operation or the key parameter is missing or invalid.
     *
     * @example
     * const key = {
     *   userId: "exampleUserId",
     *   date: "exampleDate",
     * };
     * const deletedItem = await DynamoDBModel.deleteItem(key, true);
     * console.log(deletedItem);
     */
    async deleteItem(table, { key, other_params = { ReturnValues: "NONE" } }, retry = false) {
        // Validate key parameter
        if (!key || typeof key !== "object") {
            throw new Error("Invalid key parameter. Expected an object.");
        }

        const { hash_key, range_key, table_name } = this.config[table];
        if (!key.hasOwnProperty(hash_key)) {
            throw new Error(`The key parameter must include the hash key property: ${hash_key}`);
        }
        if (range_key && !key.hasOwnProperty(range_key)) {
            throw new Error(`The key parameter must include the range key property: ${range_key}`);
        }

        const params = {
            TableName: table_name,
            Key: this.convertToDynamoDBAttributeValue(key, table),
            ...other_params
        }

        const response = retry ? await DynamoDBModel.retryWithBackoff(async () => { return await this.dynamodbClient.send(new DeleteItemCommand(params)) }) : await this.dynamodbClient.send(new DeleteItemCommand(params))
        return response.Attributes ? DynamoDBModel.convertToObject(response.Attributes) : {}
    }

    /**
     * Retrieve multiple items from the model's table based on the provided batch items.
     * @param {Object} batchGetParams - Parameters for the batch get operation
     * @param {Object} batchGetParams.batch_items - Batch items object containing a non-null 'get' field of type array, specifying the keys to retrieve.
     * @param {Array<Object>} batchGetParams.batch_items.get - Array of key objects representing the items to retrieve.
     * @param {Object} [batchGetParams.other_params={}] - Additional parameters to customize the batch get operation.
     * @param {boolean} [retry=false] - Whether to retry the operation in case of errors. Retry parameters are set on Model construction.
     * @returns {Promise<any>} - Promise resolving to the retrieved items.
     * @throws {Error} - If an error occurs during the batch get operation or the batch_items parameter is missing, invalid, or doesn't contain the 'get' field.
     *
     * @example
     * const batchGetParams = {
     *   batch_items: {
     *       tableName: {
     *         get: [
     *         { userId: "exampleUserId1", date: "exampleDate1" },
     *         { userId: "exampleUserId2", date: "exampleDate2" },
     *         // Add more keys as needed
     *       ],
     *     },
     *   },
     *   other_params: {
     *      ConsistentRead: true
     *   }
     * };
     * const retrievedItems = await DynamoDBModel.batchGetItem(batchGetParams, true);
     * console.log(retrievedItems);
     */
    async batchGetItem({ batch_items, other_params }, retry = false) {
        if (!batch_items || typeof batch_items !== "object") {
            throw new Error("Invalid batch_items parameter. Expected an non-null object.");
        }

        const params = {
            RequestItems: {},
        };

        if (other_params) {
            const {
                ProjectionExpression,
                ExpressionAttributeNames,
                ExpressionAttributeValues,
                ...others
            } = other_params;

            if (ProjectionExpression) {
                params.ProjectionExpression = ProjectionExpression
                    .split(', ')
                    .map((element) => {
                        params.ExpressionAttributeNames[`#${element}`] = element;
                        return `#${element}`;
                    })
                    .join(", ");
            }

            params.ExpressionAttributeNames = {
                ...(params.ExpressionAttributeNames || {}),
                ...(ExpressionAttributeNames || {})
            };

            params.ExpressionAttributeValues = {
                ...(params.ExpressionAttributeValues || {}),
                ...(ExpressionAttributeValues ? convertToDynamoDBAttributeValue(ExpressionAttributeValues, table) : {})
            };

            Object.assign(params, others);
        }

        const tableNameMap = {};

        for (const [tableName, tableData] of Object.entries(batch_items)) {
            const tableConfig = this.config[tableName];
            const table_name = tableConfig.table_name;
            tableNameMap[table_name] = tableName;

            if (!Array.isArray(tableData.get) || tableData.get.length === 0) {
                throw new Error(`Invalid get parameter for table ${tableName}. Expected a non-null list.`);
            }

            params.RequestItems[table_name] = {
                Keys: tableData.get.map(key => this.convertToDynamoDBAttributeValue(key, tableName))
            };
        }

        const response = retry
            ? await DynamoDBModel.retryWithBackoff(() => this.dynamodbClient.send(new BatchGetItemCommand(params)))
            : await this.dynamodbClient.send(new BatchGetItemCommand(params));

        const convertedItems = {};

        for (const [table_name, responseItems] of Object.entries(response.Responses)) {
            convertedItems[tableNameMap[table_name]] = responseItems.map(item => DynamoDBModel.convertToObject(item));
        }

        return convertedItems;
    }

    /**
     * Perform a batch operation to put or delete multiple items in the model's table.
     * @param {Object} batchWriteParams - Parameters for the batch write operation
     * @param {Object} batchWriteParams.batch_items - Batch items object specifying the items to put or delete.
     * @param {Array<Object>} [batchWriteParams.batch_items.put] - Array of items to put into the table.
     * @param {Array<Object>} [batchWriteParams.batch_items.delete] - Array of keys representing the items to delete from the table.
     * @param {Object} [batchWriteParams.other_params={}] - Additional parameters to customize the batch write operation.
     * @param {boolean} [retry=false] - Whether to retry the operation in case of errors. Retry parameters are set on Model construction.
     * @returns {Promise<any>} - Promise resolving to the result of the batch operation.
     * @throws {Error} - If an error occurs during the batch write operation or the batch_items parameter is missing or invalid.
     *
     * @example
     * const batchWriteParams = {
     *   batch_items: {
     *       tableName: {
     *         put: [
     *           { id: "exampleId1", name: "Item 1" },
     *           { id: "exampleId2", name: "Item 2" },
     *           // Add more items to put as needed
     *         ],
     *         delete: [
     *           { id: "exampleId3" },
     *           { id: "exampleId4" },
     *           // Add more keys to delete as needed
     *         ],
     *       }
     *   },
     *   other_params: {
     *     ReturnValues: "ALL_OLD"
     *   }
     * };
     * const result = await DynamoDBModel.batchPutOrDeleteItem(batchWriteParams, true);
     * console.log(result);
     */
    async batchWriteItem({ batch_items, other_params }, retry = false) {
        // Validate batch_items parameter
        if (!batch_items || typeof batch_items !== "object") {
            throw new Error("Invalid batch_items parameter. Expected an object.");
        }

        const params = {
            RequestItems: {},
            ...other_params
        };

        Object.entries(batch_items).forEach(([tableName, tableData]) => {
            const table_name = this.config[tableName].table_name
            const requests = [];

            // Validate put and delete arrays
            if (!tableData.put && !tableData.delete) {
                throw new Error("Invalid parameter. Either 'put' or 'delete' field must be provided.");
            }

            if (tableData.put) {
                if (!Array.isArray(tableData.put) || tableData.put.length === 0) {
                    throw new Error(`Invalid put parameter for table ${tableName}. Expected a non-null list.`);
                }

                const putRequests = tableData.put.map(item => ({
                    PutRequest: { Item: this.convertToDynamoDBAttributeValue(item, tableName) },
                }));

                requests.push(...putRequests);
            }


            if (tableData.delete) {
                if (!Array.isArray(tableData.delete) || tableData.delete.length === 0) {
                    throw new Error(`Invalid delete parameter for table ${tableName}. Expected a non-null list.`);
                }

                const deleteRequests = tableData.delete.map(item => ({
                    DeleteRequest: { Key: this.convertToDynamoDBAttributeValue(item, tableName) },
                }));

                requests.push(...deleteRequests);
            }

            params.RequestItems[table_name] = requests;
        });

        if (retry) {
            return await DynamoDBModel.retryWithBackoff(async () => {
                return await this.dynamodbClient.send(new BatchWriteItemCommand(params));
            }
            );
        } else {
            return await this.dynamodbClient.send(new BatchWriteItemCommand(params));
        }
    }
}

export default DynamoDBModel