const yaml = require('js-yaml');
const _ = require('lodash');
const fs = require('fs');

/**
 * Generates cleaned schema for use in application, based on provisioned dynamodb tables
 */
function appDynamodbConfig(config, applicationName) {
    const crudConfig = _.cloneDeep(config);

    function cleanIndexSchema(schema) {
        delete schema.read_capacity;
        delete schema.write_capacity;
        delete schema.projection_type;

        return schema;
    }

    for (const key in crudConfig) {
        const schema = crudConfig[key];
        for (const indexType of ['global_secondary_index', 'local_secondary_index']) {
            try {
                schema.indexes = Object.fromEntries(
                    Object.entries(schema[indexType]).map(([key, value]) => [key, cleanIndexSchema(value)])
                );
                delete schema[indexType];
            } catch (error) {
                // Handle KeyError (equivalent to catching an exception in Python)
            }
        }
        cleanIndexSchema(schema);
        schema.table_name = `${key}-${applicationName}`;
    }

    return crudConfig;
}

function convertDynamodbTypeToGraphql(dynamodbType) {
    switch (dynamodbType) {
        case 'S':
            return 'String';
        case 'N':
            return 'Float';
        case 'B':
            return 'Boolean';
        case 'BOOL':
            return 'Boolean';
        case 'NULL':
            return 'Null';
        case 'M':
            return 'JSON';
        case 'L':
            return '[JSON]';
        case 'SS':
            return '[String]';
        case 'NS':
            return '[Float]';
        case 'BS':
            return '[Boolean]';
        default:
            return 'String'; // Default to String if type is unknown
    }
}

function appGraphqlSchema(schema) {
    let graphqlSchema = '';

    for (const [tableName, tableConfig] of Object.entries(schema)) {
        const attributes = tableConfig.attributes;

        // Create object with field types
        const fieldTypes = {};
        for (const [attrName, attrType] of Object.entries(attributes)) {
            fieldTypes[attrName] = convertDynamodbTypeToGraphql(attrType);
        }

        // Check if fields are used as hash key or sort key
        const hashKey = tableConfig.hash_key;
        const rangeKey = tableConfig.range_key;
        if (hashKey) {
            fieldTypes[hashKey] = 'ID!';
        }
        if (rangeKey) {
            fieldTypes[rangeKey] = 'ID!';
        }

        // Check global secondary indexes
        if ('global_secondary_index' in tableConfig) {
            for (const [indexName, indexConfig] of Object.entries(tableConfig.global_secondary_index)) {
                const indexHashKey = indexConfig.hash_key;
                const indexRangeKey = indexConfig.range_key;
                if (indexHashKey) {
                    fieldTypes[indexHashKey] = 'ID!';
                }
                if (indexRangeKey) {
                    fieldTypes[indexRangeKey] = 'ID!';
                }
            }
        }

        // Generate GraphQL type
        graphqlSchema += `type ${tableName.charAt(0).toUpperCase() + tableName.slice(1)} {\n`;
        for (const [attrName, attrType] of Object.entries(fieldTypes)) {
            graphqlSchema += `    ${attrName}: ${attrType}\n`;
        }
        try {
            const child = tableConfig.child;
            graphqlSchema += `    ${child}s: [${child.charAt(0).toUpperCase() + child.slice(1)}]\n`;
        } catch (error) { }
        graphqlSchema += '}\n\n';
    }

    return graphqlSchema;
}

function dumpJson(filename, data) {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

function dumpGraphqlSchema(filename, schema) {
    fs.writeFileSync(filename, schema);
}

if (require.main === module) {
    try {
        const stream = fs.readFileSync('.polymer/infrastructure.yml', 'utf8');
        const config = yaml.load(stream);

        const applicationName = config.application_name;
        const fileConfig = config.schema_files;
        const appDynamodb = appDynamodbConfig(config.dynamodb, applicationName);
        const appGraphql = appGraphqlSchema(config.dynamodb);

        dumpJson(fileConfig.app_config_output, {
            application_name: applicationName,
            dynamodb: appDynamodb,
            s3: config.s3
        });

        dumpGraphqlSchema(fileConfig.graphql_schema_output, appGraphql);
    } catch (error) {
        console.error(error);
    }
}
