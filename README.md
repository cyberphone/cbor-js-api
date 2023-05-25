# CBOR JavaScript API

This repository holds a JavaScript API _in development_.  The API
loosely mimics the "JSON" object by _exposing a single global object_,
unsurprisingly named "CBOR".

<table align='center'><tr><td><i>Note that this API is not (at all) ready for external use!</i> 😏</td></tr></table>

### CBOR Components
- Encoder
- Decoder
- Diagnostic Notation decoder

### Encoding Example

```javascript
let cbor = CBOR.Map()
               .set(CBOR.Int(1), CBOR.Float(45.7))
               .set(CBOR.Int(2), CBOR.String("Hi there!")).encode();


console.log(CBOR.toHex(cbor));
------------------------------
a201fb4046d9999999999a0269486920746865726521
```
Note: chaining objects as shown above is just an alternative.

### Decoding Example

```javascript
let map = CBOR.decode(cbor);
console.log(map.toString());  // Diagnostic notation
----------------------------------------------------
{
  1: 45.7,
  2: "Hi there!"
}

console.log('Value=' + map.get(CBOR.Int(1)));
---------------------------------------------
Value=45.7
```

### Deterministic Encoding Rules

The JavaScript API implements deterministic encoding based on section 4.2 of [RFC8949](https://www.rfc-editor.org/rfc/rfc8949.html).
For maximum interoperability, the API also depends on Rule&nbsp;2 of section 4.2.2, as well as interpreting Appendix&nbsp;A as
_bidirectional_.  For a more thorough description and rationale, turn to: https://cyberphone.github.io/android-cbor/distribution/apidoc/org/webpki/cbor/package-summary.html#deterministic-encoding.

### Diagnostic Notation Support

Diagnostic notation permits displaying CBOR data as human-readable text.  This is practical for _logging_,
_documentation_, and _debugging_ purposes.  Diagnostic notation is an intrinsic part of the API through the `toString()` method.
However, diagnostic notation can also be used as input for creating _test data_ and for
_configuration files_.  A preliminary description can be found here: https://cyberphone.github.io/android-cbor/distribution/apidoc/org/webpki/cbor/package-summary.html#diagnostic-notation.

In the JavaScript API, diagnostic notation as input is tentatively supported by calling
the `CBOR.diagnosticNotation(`_string_`)` method.

Note: the intention with diagnostic notation is not using it as a "wire" format.

Updated: 2023-05-25

