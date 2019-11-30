# wsdl-to-rest

WSDL Parser and conversion from JS objects

## How to use

```javascript
const parser = require('wsdl-to-rest');
var fs = require('fs');

fs.readFile('LocalService.wsdl', 'utf8', function (err, wsdl) {

    var methods = parser.getFunctions(wsdl);
    console.log(methods);

    var method = parser.getFunction(wsdl, "GetStatus");
    var requestBody = {
        SimpleNode: 0,
        ComplexNode: {
          nodeAttribute: 0.55,
          InnerElement: 'abc'
        }
        Collection: {
          collectionAttribute: 'x',
          Item: [
            { attribute: 1, Child: 2 },
            { attribute: 3, Child: 4}
          ]
        }
    };
    
    var xml = parser.toXML(method.request, requestBody);
    console.log(xml);
    
});
```

## Tests

Unit testing in private repositories

