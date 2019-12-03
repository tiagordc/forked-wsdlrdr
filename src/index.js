(() => {
    'use strict';

    const xmldoc = require('xmldoc');

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

        var result = {};
        Object.assign(result, attr);

        var namespace = '';

        if (result.type) {
            namespace = getNamespace(result.type);
            result.type = getNameWithoutNamespace(result.type);
        }

        if (result.element) {
            namespace = getNamespace(result.element);
            result.element = getNameWithoutNamespace(result.element);
        }

        if (namespace.length !== 0) {
            result.namespace = namespace;
        }

        return result;

    }

    function getTypeSequences (root, type) {

        var result = [];

        if (type.children.length === 0) {
            return result;
        }

        var sequenceCol = type.childNamed(root.typeNamespace + 'sequence');

        if (sequenceCol) {
            result = sequenceCol.children.filter(x => x.name).map(x => {

                let element = getFormatedAttr(x.attr);

                if (typeof element.type === 'string') {
                    var innerType = getType(root, element.type);
                    element.typeDef = innerType;
                }

                if (typeof element.ref === 'string') {
                    var eleNamespace = getNamespace(element.ref, false);
                    var eleName = getNameWithoutNamespace(element.ref);
                    var eleObj = root.schema.childWithAttribute('name', eleName);
                    if (eleObj && eleObj.attr) {
                        Object.assign(element, getFormatedAttr(eleObj.attr));
                        element.namespace = eleNamespace;
                    }
                }

                if (typeof element.minOccurs === 'string' && element.minOccurs !== 'unbounded') {
                    element.minOccurs = parseInt(element.minOccurs);
                }
                if (typeof element.maxOccurs === 'string' && element.maxOccurs !== 'unbounded') {
                    element.maxOccurs = parseInt(element.maxOccurs);
                }

                return element;

            });
        }

        return result;

    }

    function getTypeAttributes (root, type) {

        var result = [];

        if (type.children.length === 0) {
            return result;
        }

        var attributeCol = type.childrenNamed(root.typeNamespace  + 'attribute');

        if (attributeCol && attributeCol.length > 0) {
            result = attributeCol.filter(x => x.name).map(x => {

                var formatted = getFormatedAttr(x.attr);

                if (formatted.ref) {
                    var ref = getNameWithoutNamespace(formatted.ref);
                    var refObj = root.schema.childWithAttribute('name', ref);
                    if (refObj) Object.assign(formatted, getFormatedAttr(refObj.attr));
                }

                return formatted;
                
            });
        }

        return result;

    }

    function getTypeAttributesGroups(root, type) {

        var result = [];

        if (type.children.length === 0) {
            return result;
        }

        var groups = type.childrenNamed(root.typeNamespace + 'attributeGroup');

        if (groups && groups.length > 0) {
            groups.filter(x => x.name && x.attr && x.attr.ref).forEach(x => {
                
                var ref = getNameWithoutNamespace(x.attr.ref);
                var refObj = root.schema.childWithAttribute('name', ref);

                if (refObj) {
                    var atts = getTypeAttributes(root, refObj);
                    result.push(...atts);
                }
                
            });
        }

        return result;

    }

    function getType (root, type) {

        var result = {};

        var complexTypes = root.schema.childrenNamed(root.typeNamespace + 'complexType');
        var methodSchema = root.schema.childWithAttribute('name', type);
        var complexType;

        if (methodSchema) {

            if (methodSchema.children.length === 0) {
                var formatted = getFormatedAttr(methodSchema.attr);
                if (formatted.type) {
                    Object.assign(result, formatted);
                    complexType = complexTypes.find((x => x.attr.name === result.type));
                }
                else {
                    return formatted; //simple type
                }
            }

            if (!complexType) 
                complexType = methodSchema.childNamed(root.typeNamespace + 'complexType');
                
        }

        if (!complexType) 
            complexType = complexTypes.find(x => x.attr.name === type);

        if (complexType) {
            var seqs = getTypeSequences(root, complexType);
            var atts = getTypeAttributes(root, complexType);
            var attsGroups = getTypeAttributesGroups(root, complexType);
            result.elements = seqs;
            result.attributes = [...atts, ...attsGroups];
        }

        return result; //no results

    }
    
    function getMessageAttrs (message, root) {

        var messageChildrens = message.children.filter((childItem) => childItem.name);

        var result = messageChildrens.map(x => {

            var messageAttr = x.attr;
            var typeName = getNameWithoutNamespace(messageAttr.type || messageAttr.element);

            var returnData = {
                name     : messageAttr.name,
                namespace: getNamespace(messageAttr.type || messageAttr.element)
            };

            var complexType = getType(root, typeName);

            if (complexType && complexType.type) {
                returnData.type = complexType.type;
                returnData.typeDef = complexType;
            }

            return returnData;
            
        });

        if (result && result.length === 1) return result[0];
        return result;

    }

    function getWsdlChild (wsdl, name, wsdlStruct) {

        var child = wsdl.childNamed(wsdlStruct + name);

        // if not found try some default
        if (!child) {
            child = wsdl.childNamed('wsdl:' + name);
        }

        return child;

    }

    function parseRecursive (spec, object) {

        var result = {};

        if (spec.typeDef && Object.keys(spec.typeDef).length > 0) {

            const def = spec.typeDef;
            let currentObj = {};

            for (var key in object) {

                if (key === '$') continue;
                if (key === '_') continue;

                var element = def.elements.filter(x => x.name === key);

                if (element.length === 1) {

                    var el = element[0];
                    let val = object[key];

                    if (el.maxOccurs === "unbounded" || val instanceof Array) {

                        let valArray = [];

                        for (var i = 0; i < val.length; i++) {
                            const arrayItem = parseRecursive(el, val[i]); 
                            valArray.push(arrayItem);
                        }

                        currentObj[key] = valArray;

                    }
                    else {
                        currentObj[key] = parseRecursive(el, val);
                    }

                }

            }

            if (object['$']) {

                for (var key in object['$']) {

                    var attributes = def.attributes.filter(x => x.name === key);
                    if (attributes.length === 1) {
                        currentObj[key] = object['$'][key];
                    }

                }

            }

            if (def.name) result[def.name] = currentObj;
            else Object.assign(result, currentObj);

        }
        else {
            return object;
        }

        return result;

    }

    function printRecursive (spec, object, level, namespaces) {

        var result = "";

        if (spec.typeDef && Object.keys(spec.typeDef).length > 0) {

            let def = spec.typeDef;
            let tag = "";

            result = '\t'.repeat(2 + level) + "<";
            
            if (def.name) {
                if (namespaces && def.namespace) {
                    if (namespaces.indexOf(def.namespace) === -1) namespaces.push(def.namespace);
                    tag = def.namespace + ':';
                }
                tag += def.name;
                result += tag;
            }
            else {
                if (namespaces && spec.namespace) {
                    if (namespaces.indexOf(spec.namespace) === -1) namespaces.push(spec.namespace);
                    tag = spec.namespace + ':';
                }
                tag += spec.name;
                result += tag;
            }

            var innerContents = "";

            for (var key in object) {
                
                var val = object[key];

                var element = def.elements.filter(x => x.name === key);
                if (element.length === 1) {
                    var el = element[0];
                    if (el.maxOccurs === "unbounded" || val instanceof Array) {
                        for (var i = 0; i < val.length; i++) {
                            innerContents += printRecursive(el, val[i], level + 1, namespaces);
                        }
                    }
                    else {
                        innerContents += printRecursive(el, val, level + 1, namespaces);
                    }
                }

                var attributes = def.attributes.filter(x => x.name === key);
                if (attributes.length === 1) {
                    result += " " + attributes[0].name + "='" + val.toString() + "'";
                }

            }

            if (innerContents.length > 0) {
                result += ">\n" + innerContents;
                result += '\t'.repeat(2 + level) + "</" + tag + ">\n";
            }
            else {
                result += " />\n";
            }

        }
        else {

            var namespace = '';

            if (namespaces && spec.namespace) {
                if (namespaces.indexOf(spec.namespace) === -1) namespaces.push(spec.namespace);
                namespace = spec.namespace + ':';
            }

            if (object == null) result = '\t'.repeat(2 + level) + "<" + namespace + spec.name + " />\n";
            else result = '\t'.repeat(2 + level) + "<" + namespace + spec.name + ">" + object.toString() + "</" + namespace + spec.name + ">\n";

        }

        return result;

    }

    var wsdlParser = module.exports;

    wsdlParser.read = function (wsdl) {

        let wsdlObj;

        if (typeof wsdl === 'string') {
            wsdl = new xmldoc.XmlDocument(wsdl);
        }

        if (wsdl instanceof xmldoc.XmlDocument) {

            var wsdlNamespace = getNamespace(wsdl.name, true);
            var wsdlTypes = getWsdlChild(wsdl, 'types', wsdlNamespace);
            
            var typeName;
            const childWithName = wsdlTypes.children.find((typeItem) => typeItem.name);
            if (childWithName) typeName = childWithName.name; //most likely the schema object
            var typeNamespace = getNamespace(typeName, true);
    
            var schema = wsdlTypes.childNamed(typeNamespace + 'schema');
    
            wsdlObj = { wsdl: wsdl, namespace: wsdlNamespace, schema, typeNamespace };

        }
        else if (typeof wsdl === 'object' && wsdl.wsdl && wsdl.namespace) {
            wsdlObj = wsdl;
        }

        return wsdlObj;

    };

    wsdlParser.getFunctions = function (wsdl) {

        var wsdlObj = this.read(wsdl);

        var binding = wsdlObj.wsdl.childNamed(wsdlObj.namespace + 'binding');
        var operations = binding.childrenNamed(wsdlObj.namespace + 'operation');

        return operations.map(x => x.attr.name).sort();

    };

    wsdlParser.getFunction = function (wsdl, methodName) {

        var getMessageNode = ($messages, nodeName) => $messages.find(($message) => $message.attr.name === getNameWithoutNamespace(nodeName) );
        
        var wsdlObj = this.read(wsdl);

        var portType = wsdlObj.wsdl.childNamed(wsdlObj.namespace + 'portType');
        var messages = wsdlObj.wsdl.childrenNamed(wsdlObj.namespace + 'message');

        // try to get method node
        var methodPortType = portType.childWithAttribute('name', methodName);
        if (!methodPortType) throw new Error('method not exists in wsdl');
        
        var input = methodPortType.childNamed(wsdlObj.namespace + 'input');
        var output = methodPortType.childNamed(wsdlObj.namespace + 'output');

        var inputMsg = getMessageNode(messages, getNameWithoutNamespace(input.attr.message));
        var outputMsg = getMessageNode(messages, getNameWithoutNamespace(output.attr.message));

        var request = getMessageAttrs(inputMsg, wsdlObj);
        var response = getMessageAttrs(outputMsg, wsdlObj);

        return { name: methodName, request, response };
      
    };

    wsdlParser.readResponse = function(wsdl, methodName, xmlString) {

        let result;

        const method = this.getFunction(wsdl, methodName).response;

        const xml2js = require('xml2js');
        xml2js.parseString(xmlString, { async: false, attrkey: '$', charkey: '_', explicitArray: false, normalizeTags: false, normalize: false, tagNameProcessors: [xml2js.processors.stripPrefix], attrNameProcessors: [xml2js.processors.stripPrefix] }, function (parseErr, parseResult) {
            if (!parseErr) { 
                
                const root = parseResult.Envelope.Body;
                const keys = Object.keys(root);

                if (keys.length === 1) {
                    result = parseRecursive(method, root[keys[0]]);
                }
                
            }
        });
        
        return result;
        
    };

    wsdlParser.requestBody = function(wsdl, methodName, object, namespaces) {
        
        let wsdlObj = this.read(wsdl);
        let method = this.getFunction(wsdlObj, methodName).request;
        let ns = namespaces === false ? null : [];

        var result = "<?xml version='1.0' encoding='utf-8'?>\n<soapenv:Envelope xmlns:soapenv='http://schemas.xmlsoap.org/soap/envelope/'>\n\t<soapenv:Body";;

        var contents = printRecursive(method, object, 0, ns);

        if (ns && ns.length > 0) {
            ns.forEach(x => {
                result += " xmlns:" + x + "='" + wsdlObj.wsdl.attr["xmlns:" + x] + "'";
            });
        }

        result += ">\n" + contents;

        result += "\t</soapenv:Body>\n</soapenv:Envelope>";

        return result;

    };

})();