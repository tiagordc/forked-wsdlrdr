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
                    result.type = formatted.type;
                    result.name = formatted.name;
                    complexType = complexTypes.find((x => x.attr.name === formatted.type));
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

            return Object.assign({}, returnData, complexType);
            
        });

        if (result && result.length === 1) return result[0];
        return result;

    }

    function getWsdlChild ($wsdlObj, name, wsdlStruct) {
        var $child = $wsdlObj.childNamed(wsdlStruct + name);

        // if not found try some default
        if (!$child) {
            $child = $wsdlObj.childNamed('wsdl:' + name);
        }

        return $child;
    }

    var wsdlParser = module.exports;

    wsdlParser.getFunctions = function (wsdl) {

        var wsdlObj = new xmldoc.XmlDocument(wsdl);
        var wsdlStruct = getNamespace(wsdlObj.name, true);

        var binding = wsdlObj.childNamed(wsdlStruct + 'binding');
        var operations = binding.childrenNamed(wsdlStruct + 'operation');

        return operations.map(x => x.attr.name).sort();

    };

    wsdlParser.getFunction = function (wsdl, methodName) {

        var getMessageNode = ($messages, nodeName) => $messages.find(($message) => $message.attr.name === getNameWithoutNamespace(nodeName) );
        
        var wsdlXML = new xmldoc.XmlDocument(wsdl);

        var wsdlNamespace = getNamespace(wsdlXML.name, true);
        var wsdlTypes = getWsdlChild(wsdlXML, 'types', wsdlNamespace);
        
        var typeName;
        const childWithName = wsdlTypes.children.find((typeItem) => typeItem.name);
        if (childWithName) typeName = childWithName.name; //most likely the schema object
        var typeNamespace = getNamespace(typeName, true);

        var schema = wsdlTypes.childNamed(typeNamespace + 'schema');

        var wsdlObj = { wsdl: wsdlXML, schema, typeNamespace };

        var portType = wsdlXML.childNamed(wsdlNamespace + 'portType');
        var messages = wsdlXML.childrenNamed(wsdlNamespace + 'message');

        // try to get method node
        var methodPortType = portType.childWithAttribute('name', methodName);
        if (!methodPortType) {
            throw new Error('method ("' + methodName + '") not exists in wsdl');
        }

        var input = methodPortType.childNamed(wsdlNamespace + 'input');
        var output = methodPortType.childNamed(wsdlNamespace + 'output');

        var inputMsg = getMessageNode(messages, getNameWithoutNamespace(input.attr.message));
        var outputMsg = getMessageNode(messages, getNameWithoutNamespace(output.attr.message));

        var request = getMessageAttrs(inputMsg, wsdlObj);
        var response = getMessageAttrs(outputMsg, wsdlObj);

        return { name: methodName, request, response };
      
    };

    wsdlParser.toXML = function(method, object) {

        if (typeof method !== 'object') throw new Error('Method is either the request or response object');

        var result = "<?xml version='1.0' encoding='utf-8'?>\n<soapenv:Envelope xmlns:soapenv='http://schemas.xmlsoap.org/soap/envelope/'>\n\t<soapenv:Body>\n\t\t";

        result += "<" + method.name + ">\n";

        result += "\t\t</" + method.name + ">\n\t</soapenv:Body>\n</soapenv:Envelope>";
        return result;

    }

})();
