# CBOR JavaScript API

This repository holds a JavaScript API _in development_.  The API
loosely mimics the "JSON" object by only exposing a single global object,
unsurprisingly named "CBOR".

<table align='center'><tr><td><i>Note that this API is not ready for external use!</i></td></tr></table>

### CBOR Components
- Encoder
- Decoder
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

### Deterministic Encoding Rules

This API implements deterministic encoding based on section 4.2 of [RFC8949](https://www.rfc-editor.org/rfc/rfc8949.html).
To maintain maximum interoperability, the API also depends on Rule&nbsp;2 of section 4.2.2, as well as interpreting Appendix&nbsp;A as
_bidirectional_.  For a more thorough description and rationale turn to: https://cyberphone.github.io/android-cbor/distribution/apidoc/org/webpki/cbor/package-summary.html#deterministic-encoding.

### Diagnostic Notation Support

Diagnostic notation permits displaying CBOR data as human-readable text.  This is practical for _logging_,
_documentation_, and _debugging_.  Diagnostic notation is an intrinsic part of the API through the `toString()` method.
However, diagnostic notation can also be used as input for _testing_ and
_configuration_ purposes.  A preliminary description can be found here: https://cyberphone.github.io/android-cbor/distribution/apidoc/org/webpki/cbor/package-summary.html#diagnostic-notation.

In the API, diagnostic notation as input is tentatively supported by
the `CBOR.diagnosticNotation(`_text_`)` method.
