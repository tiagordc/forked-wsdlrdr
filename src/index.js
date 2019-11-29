(() => {
    'use strict';

    const xmldoc = require('xmldoc');
    const deepmerge = require('deepmerge');
    const fs = require('fs');

    function getNameWithoutNamespace (name) {
        var attr = name.split(':');
        if (attr.length > 1) {
            return attr[1];
        }

        return name;
    }

    function getNamespace (name, suffix) {
        var attr = name.split(':');
        if (attr.length > 1) {
            if (suffix) {
                return attr[0] + ':';
            }

            return attr[0];
        }

        return '';
    }

    function getFormatedAttr (attr) {
        var namespace = '';
        if (attr.type) {
            attr.type = getNameWithoutNamespace(attr.type);
            namespace = getNamespace(attr.type);
        }

        if (attr.element) {
            attr.element = getNameWithoutNamespace(attr.element);
            namespace = getNamespace(attr.element);
        }

        if (namespace.length !== 0) {
            attr.namespace = namespace;
        }

        return attr;
    }

    function getComplexTypeAttrs ($complexType) {
        if ($complexType.children.length === 0) {
            return [];
        }

        var complexTypeName = $complexType.children[0].name;
        if (!complexTypeName) {
            const foundTypeItem = $complexType.children.find((typeItem) => typeItem.name);
            if (foundTypeItem) {
                complexTypeName = foundTypeItem.name;
            }
        }
        var schemaStruct = getNamespace(complexTypeName, true);

        var $sequence = $complexType.childNamed(schemaStruct + 'sequence');
        if ($sequence) {
            var sequenceChildrens = $sequence.children.filter((childItem) => childItem.name);
            return sequenceChildrens.map(($seqChild) => getFormatedAttr($seqChild.attr));
        }

        return getFormatedAttr($complexType.attr);
    }

    function getMessageAttrs ($message, $wsdl) {
        var wsdlStruct = getNamespace($wsdl.name, true);

        var $types = getWsdlChild($wsdl, 'types', wsdlStruct);
        var typeName = $types.children[0].name;
        if (!typeName) {
            const foundTypeItem = $types.children.find((typeItem) => typeItem.name);
            if (foundTypeItem) {
                typeName = foundTypeItem.name;
            }
        }

        var typesStruct = getNamespace(typeName, true);

        var $schema = $types.childNamed(typesStruct + 'schema');
        var $complexTypes = $schema.childrenNamed(typesStruct + 'complexType');

        var messageChildrens = $message.children.filter((childItem) => childItem.name);
        return messageChildrens.map(($messageChild) => {
            var messageAttr = $messageChild.attr;
            var typeName = getNameWithoutNamespace(messageAttr.type || messageAttr.element);
            var returnData = {
                name     : messageAttr.name,
                namespace: getNamespace(messageAttr.type || messageAttr.element)
            };

            //
            // first look if schema exists
            //

            // is simple type
            var $methodSchema = $schema.childWithAttribute('name', typeName);
            if ($methodSchema) {
                if ($methodSchema.children.length === 0) {
                    return Object.assign({
                        params: []
                    }, returnData, getFormatedAttr($methodSchema.attr));
                }

                // is complex type
                var $methodComplexType = $methodSchema.childNamed(typesStruct + 'complexType');
                if ($methodComplexType) {
                    return Object.assign({}, returnData, {
                        params: getComplexTypeAttrs($methodComplexType)
                    });
                }
            }

            //
            // search in complex types if exists
            //
            var $complexType = $complexTypes.find(($complexType) => $complexType.attr.name === typeName);
            if ($complexType) {
                return Object.assign({}, returnData, {
                    params: getComplexTypeAttrs($complexType)
                });
            }

            //
            // still no results
            // format message attribute and return this
            //

            return Object.assign({
                params: []
            }, returnData, getFormatedAttr($messageChild.attr));
        });
    }

    function getWsdl (params = {}) {
        return new Promise((resolve, reject) => {

            if (typeof params.contents === 'string') {
                resolve(params.contents);
            } else {
                fs.readFile(params.path, 'utf8', function (err, contents) {
                    if (err) reject(err);
                    else resolve(contents);
                });
            }

        });
    }

    function getValFromXmlElement ($xmlElement) {
        var elementName = getNameWithoutNamespace($xmlElement.name);
        if (!elementName) {
            throw new Error('no elementName');
        }

        let childValues = null;
        if ($xmlElement.children &&
            $xmlElement.children.length !== 0) {
            var xmlElementChildrens = $xmlElement.children.filter((xmlItem) => xmlItem.name);
            if (xmlElementChildrens.length !== 0) {
                childValues = xmlElementChildrens.reduce((store, $childItem) => {
                    if (store[elementName]) {
                        const addable = getValFromXmlElement($childItem);
                        if (addable) {
                            if (Object(store[elementName]) === store[elementName]) {
                                for (const addKey of Object.keys(addable)) {
                                    if (store[elementName][addKey]) {
                                        if (!Array.isArray(store[elementName][addKey])) {
                                            store[elementName][addKey] = [store[elementName][addKey]];
                                        }

                                        store[elementName][addKey].push(addable[addKey]);
                                    } else {
                                        store[elementName][addKey] = addable[addKey];
                                    }
                                }

                                return store;
                            }
                        }
                    } else {
                        store[elementName] = getValFromXmlElement($childItem);
                    }

                    return store;
                }, {});
            }
        }

        let response = {};

        const xmlValue = $xmlElement.val
            .replace(/[\n\r\t]/g, '')
            .trim();

        if (xmlValue.length !== 0) {
            // str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            response[elementName] = xmlValue;
        }

        // response[elementName] = $xmlElement.val;
        if ($xmlElement.attr && Object.keys($xmlElement.attr).length !== 0) {
            if (response[elementName]) {
                response[elementName] = { value: response[elementName] };
            }
            response[elementName] = Object.assign({}, response[elementName], $xmlElement.attr);
        }

        if (childValues) {
            response = deepmerge(response, childValues);
        }

        return response;
    }

    function getWsdlChild ($wsdlObj, name, wsdlStruct) {
        var $child = $wsdlObj.childNamed(wsdlStruct + name);

        // if not found try some default
        if (!$child) {
            $child = $wsdlObj.childNamed('wsdl:' + name);
        }

        return $child;
    }

    var Wsdlrdr = module.exports;

    Wsdlrdr.getXmlDataAsJson = function (xml) {
        var $xmlObj = new xmldoc.XmlDocument(xml);
        var xmlNamespace = getNamespace($xmlObj.name, true);

        var $extractNode = $xmlObj.childNamed(xmlNamespace + 'Body');
        if (!$extractNode) {
            $extractNode = $xmlObj;
        }

        var extractedData = getValFromXmlElement($extractNode);
        if (extractedData.Body) {
            return extractedData.Body;
        }

        return extractedData;
    };

    Wsdlrdr.getNamespaces = function (params, opts) {
        return getWsdl(params)
            .then(function (wsdl) {
                const $wsdlObj = new xmldoc.XmlDocument(wsdl);
                const wsdlObjAttrNames = Object.keys($wsdlObj.attr);
                return wsdlObjAttrNames.reduce((store, attrKey) => {
                    var attrNamespace = getNamespace(attrKey);
                    var attrName = getNameWithoutNamespace(attrKey);

                    // add namespace of attrs to list
                    if ($wsdlObj.attr[attrNamespace]) {
                        if (!store.find((storeItem) => storeItem.short === attrNamespace)) {
                            store.push({
                                short: attrNamespace,
                                full : $wsdlObj.attr[attrNamespace]
                            });
                        }
                    }

                    // add namespace to list
                    if (attrNamespace.length !== 0) {
                        store.push({
                            short: attrName,
                            full : $wsdlObj.attr[attrKey]
                        });
                    }

                    return store;
                }, []);
            });
    };

    Wsdlrdr.getMethodParamsByName = function (methodName, params, opts) {
        var getMessageNode = ($messages, nodeName) => $messages.find(($message) =>
            $message.attr.name === getNameWithoutNamespace(nodeName)
        );

        return getWsdl(params)
            .then(function (wsdl) {
                
                var $wsdlObj = new xmldoc.XmlDocument(wsdl);
                var wsdlStruct = getNamespace($wsdlObj.name, true);

                var $portType = $wsdlObj.childNamed(wsdlStruct + 'portType');
                var $messages = $wsdlObj.childrenNamed(wsdlStruct + 'message');

                var $types = getWsdlChild($wsdlObj, 'types', wsdlStruct);

                var typeName = $types.children[0].name;
                if (!typeName) {
                    const foundTypeItem = $types.children.find((typeItem) => typeItem.name);
                    if (foundTypeItem) {
                        typeName = foundTypeItem.name;
                    }
                }

                // try to get method node
                var $methodPortType = $portType.childWithAttribute('name', methodName);
                if (!$methodPortType) {
                    throw new Error('method ("' + methodName + '") not exists in wsdl');
                }

                var $input = $methodPortType.childNamed(wsdlStruct + 'input');
                var $output = $methodPortType.childNamed(wsdlStruct + 'output');

                var $inputMessage = getMessageNode($messages, getNameWithoutNamespace($input.attr.message));
                var $outputMessage = getMessageNode($messages, getNameWithoutNamespace($output.attr.message));

                return {
                    request : getMessageAttrs($inputMessage, $wsdlObj),
                    response: getMessageAttrs($outputMessage, $wsdlObj)
                };
            });
    };

    Wsdlrdr.getAllFunctions = function (params, opts) {
        return getWsdl(params)
            .then(function (wsdl) {
                var $wsdlObj = new xmldoc.XmlDocument(wsdl);
                var wsdlStruct = getNamespace($wsdlObj.name, true);

                var $binding = $wsdlObj.childNamed(wsdlStruct + 'binding');
                var $operations = $binding.childrenNamed(wsdlStruct + 'operation');

                return $operations.map((operationItem) => operationItem.attr.name).sort();
            });
    };
})();
