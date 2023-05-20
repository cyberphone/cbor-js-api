# CBOR JavaScript API

This repository holds a JavaScript API _in development_.  The API
loosely mimics the "JSON" object by only exposing a single global object,
unsurprisingly named "CBOR".

<table align='center'><tr><td><i>Note that this API is not ready for external use!</i></td></tr></table>

### Components
- CBOR encoder
- CBOR decoder
- Diagnostic Notation decoder

### Encoding Example

```javascript
let cbor = new CBOR.Map()
               .set(new CBOR.Int(1), new CBOR.Float(45.7))
               .set(new CBOR.Int(2), new CBOR.String("Hi there!")).encode();
```

### Decoding Example

```javascript
let map = CBOR.decode(cbor);
console.log(map.toString());
----------------------------------------------------
{
  1: 45.7,
  2: "Hi there!"
}

console.log('Value=' + map.get(new CBOR.Int(1)).toString());
----------------------------------------------------
Value=45.7
```
