import fs from 'fs';
import { join } from 'path';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';

function objectToConstant(obj, indentLevel = 0) {
    const indent = ' '.repeat(indentLevel * 2);
    let constantString = '{\n';

    Object.entries(obj).forEach(([key, value]) => {
        const valueType = typeof value;
        let valueString;

        if (valueType === 'object' && value !== null) {
            valueString = objectToConstant(value, indentLevel + 1);
        } else if (valueType === 'function') {
            valueString = value.toString();
        } else {
            valueString = JSON.stringify(value);
        }

        constantString += `${indent}  ${key}: ${valueString},\n`;
    });

    constantString += `${indent}}`;

    return constantString;
}


export const generateTypeDefsAndResolvers = async (folderPaths) => {
    const typeDefs = [];
    const resolvers = [];

    for (const folderPath of folderPaths) {
        const folderContent = fs.readdirSync(folderPath, { withFileTypes: true });

        for (const content of folderContent) {
            const contentPath = join(folderPath, content.name);

            if (content.isFile()) {
                if (content.name.endsWith('.graphql')) {
                    const schema = fs.readFileSync(contentPath, 'utf-8');
                    typeDefs.push(schema);
                }

                if (content.name.endsWith('.js') && !content.name.endsWith('functions.js')) {
                    try {
                        const resolverModule = await import(`../${contentPath}`);
                        const defaultResolver = resolverModule.default;

                        if (defaultResolver && typeof defaultResolver === 'object') {
                            resolvers.push(defaultResolver);
                        } else {
                            console.warn(`Skipping resolver file '${contentPath}' due to missing or invalid default export.`);
                        }
                    } catch (error) {
                        console.error(`Error importing resolver file '${contentPath}':`, error);
                    }
                }
            }
        }
    }

    return { typeDefs: mergeTypeDefs(typeDefs), resolvers: mergeResolvers(resolvers) };
};

export const generateServerArgsFile = async (folderPaths) => {
    const typeDefs = [];
    const resolvers = [];
    var resolver_function_imports = ["import { GraphQLError } from 'graphql';",
        "import { v4 as uuid4 } from 'uuid';",
        "import { parseResolveInfo } from 'graphql-parse-resolve-info';"];
    const resolver_functions = [];

    for (const folderPath of folderPaths) {
        const folderContent = fs.readdirSync(folderPath, { withFileTypes: true });

        for (const content of folderContent) {
            const contentPath = join(folderPath, content.name);

            if (content.isFile()) {
                if (content.name.endsWith('.graphql')) {
                    const schema = fs.readFileSync(contentPath, 'utf-8');
                    typeDefs.push(schema);
                }

                if (content.name.endsWith('functions.js')) {
                    const functions = await import(`../${contentPath}`)
                    const imports = fs.readFileSync(contentPath, 'utf8').match(/^import.*?['"];/gm) || [];
                    resolver_function_imports = Array.from(new Set([...imports, ...resolver_function_imports]))
                    Object.entries(functions).map(
                        (fn) => {
                            resolver_functions.push(`const ${fn[0]} = ${fn[1].toString()}`)
                        }
                    );
                } else {
                    if (content.name.endsWith('.js')) {
                        try {
                            const resolverModule = await import(`../${contentPath}`);
                            const defaultResolver = resolverModule.default;

                            if (defaultResolver && typeof defaultResolver === 'object') {
                                resolvers.push(defaultResolver);
                            } else {
                                console.warn(`Skipping resolver file '${contentPath}' due to missing or invalid default export.`);
                            }
                        } catch (error) {
                            console.error(`Error importing resolver file '${contentPath}':`, error);
                        }
                    }
                }
            }
        }
    }

    // Convert the object to a string representation using JSON.stringify with the custom replacer
    const resolverString = objectToConstant(mergeResolvers(resolvers))
    const serverArgsContent = `${resolver_function_imports.join('\n')}

const s3Client = new S3Client();

${resolver_functions.join('\n\n')}\n\nconst typeDefs = \`${typeDefs.join('\n\n')}\`;\n\nconst resolvers = ${resolverString}\n\nconst ServerArgs = {typeDefs, resolvers}\n\nexport default ServerArgs`

    fs.writeFile('src/serverargs.js', serverArgsContent, (err) => {
        if (err) {
            console.error('Error creating file:', err);
        } else {
            console.log(`File 'serverargs.js' with the exported default variable has been created.`);
        }
    });


    return { typeDefs: mergeTypeDefs(typeDefs), resolvers: mergeResolvers(resolvers) };
};