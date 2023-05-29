// JavaScript source code
const CBOR = require('../src/cbor-js-api.js');

oneTurn = function(hex, dn) {
  try {
    CBOR.decode(CBOR.fromHex(hex));
    throw Error("Should not fail on: " + dn);
  } catch (error) {
    if (!error.toString().includes("Non-d")) {
      throw error;
    }
  }
  let decoder = CBOR.initExtended(CBOR.fromHex(hex), false, true, false);
  let object = CBOR.decodeExtended(decoder);
  if (object.toString() != dn.toString() || !object.equals(CBOR.decode(object.encode()))) {
    throw Error("non match:" + dn);
  }
  console.log(hex);
}

oneTurn('1900ff', '255');
oneTurn('1817', '23');
oneTurn('A2026374776F01636F6E65', '{\n  1: "one",\n  2: "two"\n}');
oneTurn('FB7FF8000000000000', 'NaN');
oneTurn('FB3ff0000000000000', '1.0');
oneTurn('f97e01', 'NaN');
oneTurn('c240', '0');

// This one is actually deterministic...
oneTurn('fa7f7fffff', '3.4028234663852886e+38');

