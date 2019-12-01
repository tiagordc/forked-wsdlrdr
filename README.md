# wsdl-to-rest

WSDL Parser and conversion from JS objects

## How to use

npm install wsdl-to-rest

```javascript
const parser = require('wsdl-to-rest');
const fs = require('fs');

fs.readFile('LocalService.wsdl', 'utf8', function (err, wsdl) {

    var methods = parser.getFunctions(wsdl);
    console.log(methods);

    var method = parser.getFunction(wsdl, "GetStatus");
    console.log(method);

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
            { attribute: 3, Child: 4 }
          ]
        }
    };
    var xml = parser.requestBody(wsdl, "GetStatus", requestBody, true);
    console.log(xml);
    
});
```

## Tests

Unit testing in private repositories

