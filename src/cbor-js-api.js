/////////////////////////////////////////////////////////////////////////////////
//                                                                             //
//                             CBOR JavaScript API                             //
//                                                                             //
// Defines a single global object CBOR to (in some way) mimic the JSON object. //
// Determinisic encoding aligned with Appendix A and 4.2.2 Rule 2 of RFC 8949. //
// Author: Anders Rundgren (https://github.com/cyberphone)                     //
/////////////////////////////////////////////////////////////////////////////////

class CBOR {

  // Super class for all CBOR types.
  static #CBORObject = class {

    // Overridden getter in derived classes.
    _get = function() {};

    constructor() {}

    getInt = function() {
      return this.#methodCompatibilityCheck(CBOR.Int);
    }

    getString = function() {
      return this.#methodCompatibilityCheck(CBOR.String);
    }

    getBytes = function() {
      return this.#methodCompatibilityCheck(CBOR.Bytes);
    }

    getFloat = function() {
      return this.#methodCompatibilityCheck(CBOR.Float);
    }

    getBool = function() {
      return this.#methodCompatibilityCheck(CBOR.Bool);
    }

    getNull = function() {
      return this instanceof CBOR.Null;
    }

    getBigInt = function() {
      if (this instanceof CBOR.Int) {
        return BigInt(this._get());
      }
      return this.#methodCompatibilityCheck(CBOR.BigInt);
    }

    getArray = function() {
      return this.#methodCompatibilityCheck(CBOR.Array);
    }
 
    getMap = function() {
      return this.#methodCompatibilityCheck(CBOR.Map);
    }
 
    getTag = function() {
      return this.#methodCompatibilityCheck(CBOR.Tag);
    }
 
    #methodCompatibilityCheck = function(className) {
      if (!(this instanceof className)) {
        throw Error("Invalid object for this method: CBOR." + this.constructor.name);
      }
      return this._get();
    }
  }

  static #MT_UNSIGNED     = 0x00;
  static #MT_NEGATIVE     = 0x20;
  static #MT_BYTES        = 0x40;
  static #MT_STRING       = 0x60;
  static #MT_ARRAY        = 0x80;
  static #MT_MAP          = 0xa0;
  static #MT_TAG          = 0xc0;
  static #MT_BIG_UNSIGNED = 0xc2;
  static #MT_BIG_NEGATIVE = 0xc3;
  static #MT_FALSE        = 0xf4;
  static #MT_TRUE         = 0xf5;
  static #MT_NULL         = 0xf6;
  static #MT_FLOAT16      = 0xf9;
  static #MT_FLOAT32      = 0xfa;
  static #MT_FLOAT64      = 0xfb;

  static #RANGES = [0xff, 0xffff, 0xffffffff];

  static #SPECIAL_CHARACTERS = [
 //   0    1    2    3    4    5    6    7    8    9    A    B    C    D    E    F
      1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 , 'b', 't', 'n',  1 , 'f', 'r',  1 ,  1 ,
      1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,  1 ,
      0 ,  0 , '"',  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,
      0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,
      0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,
      0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 ,  0 , '\\'];

  constructor() {
    throw Error("CBOR cannot be instantiated");
  }

///////////////////////////
//       CBOR.Int        //
///////////////////////////
 
  static Int = class extends CBOR.#CBORObject {
    #int;
    constructor(int) {
      super();
      this.#int = CBOR.#intCheck(int);
    }
    
    encode = function() {
      let tag;
      let n = this.#int;
      if (n < 0) {
        tag = CBOR.#MT_NEGATIVE;
        n = -n - 1;
      } else {
        tag = CBOR.#MT_UNSIGNED;
      }
      return CBOR.#encodeTagAndN(tag, n);
    }

    toString = function() {
      return this.#int;
    }

    _get = function() {
      return this.#int;
    }
  }

///////////////////////////
//     CBOR.BigInt       //
///////////////////////////
 
  static BigInt = class extends CBOR.#CBORObject {
    #bigInt;
    constructor(bigInt) {
      super();
      this.#bigInt = CBOR.#typeCheck(bigInt, 'bigint');
    }
    
    encode = function() {
      let tag;
      let value = this.#bigInt
      if (value < 0) {
        tag = CBOR.#MT_NEGATIVE;
        value = -value -1n;
      } else {
        tag = CBOR.#MT_UNSIGNED;
      }
      // Extremely awkward code for convertint BigInt to Uint8Array
      let hex = value.toString(16);
      if (hex.length % 2) {
        hex = '0' + hex;
      }
      let len = hex.length / 2;
      let offset = 0;
      if (len <= 8) {
        // Setting up for "Int" encoding
        if (len > 4) {
          offset = 8 - len;
        } else if (len ==  3) {
          offset = 1;
        }
      }
      let u8 = new Uint8Array(len + offset);
      let i = 0;
      let j = 0;
      while (i < len) {
        u8[i + offset] = parseInt(hex.slice(j, j+2), 16);
        i += 1;
        j += 2;
      }
      // Is this actually a "BigInt"?
      if (len <= 8) {
        // Apparently not so we encode as "Int"
        let modifier;
        switch (len + offset) {
          case 1: 
            if (u8[0] < 24) {
              return new Uint8Array([tag | u8[0]]);
            }
            modifier = 24;
            break;
          case 2:
            modifier = 25;
            break;
          case 4:
            modifier = 26;
            break;
          default:
            modifier = 27;
        }
        return CBOR.#addArrays(new Uint8Array([tag | modifier]), u8);
      }
      // True "BigInt"
      return CBOR.#addArrays(new Uint8Array([tag == CBOR.#MT_NEGATIVE ?
                                                CBOR.#MT_BIG_NEGATIVE : CBOR.#MT_BIG_UNSIGNED]), 
                                            new CBOR.Bytes(u8).encode());
    }

    toString = function() {
      return this.#bigInt.toString();
    }
 
    _get = function() {
      return this.#bigInt;
    }
  }


///////////////////////////
//      CBOR.Float       //
///////////////////////////
 
  static Float = class extends CBOR.#CBORObject {
    #float;
    #encoded;
    #tag;

    constructor(float) {
      super();
      this.#float = CBOR.#typeCheck(float, 'number');
      // Begin catching the F16 edge cases.
      this.#tag = CBOR.#MT_FLOAT16;
      if (Number.isNaN(float)) {
        this.#encoded = this.#f16(0x7e00);
      } else if (!Number.isFinite(float)) {
        this.#encoded = this.#f16(float < 0 ? 0xfc00 : 0x7c00);
      } else if (Math.abs(float) == 0) {
        this.#encoded = this.#f16(Object.is(float,-0) ? 0x8000 : 0x0000);
      } else {
        // Nope, it is apparently a genuine number...
        // The following code depends on that Math.fround works as it should.
        let f32 = Math.fround(float);
        let u8;
        let f32exp;
        let f32signif;
        while (true) {  // "goto" surely beats quirky loop/break/return/flag constructs
          if (f32 == float) {
            // Nothing lost => F32 or F16 is on the munu.
            this.#tag = CBOR.#MT_FLOAT32;
            u8 = this.#d2b(f32);
            f32exp = ((u8[0] & 0x7f) << 4) + ((u8[1] & 0xf0) >> 4) - 1023 + 127;
            if (u8[4] & 0x1f || u8[5] || u8[6] || u8[7]) {
              console.log(u8.toString());
              throw Error("unexpected fraction: " + f32);
            }
            f32signif = ((u8[1] & 0x0f) << 19) + (u8[2] << 11) + (u8[3] << 3) + (u8[4] >> 5)
  //          if (Math.abs(f32) == 5.960465188081798e-8) console.log("b=" + toBin(u8) + " e=" + (((u8[0] & 0x7f) << 4) + ((u8[1] & 0xf0) >> 4)) + " ec=" + f32exp + " f32signif=" + f32signif + " s=" + ((u8[0] & 0x80) * 16777216));
            if (f32exp <= 0) {
              // The implicit "1" becomes explicit using subnormal representation.
              f32signif += 1 << 23;
              // Always perform at least one turn.
              f32exp--;
              do {
                if ((f32signif & 1) != 0) {
                  throw Error("unexpected offscale: " + f32);
                }
                f32signif >>= 1;
              } while (++f32exp < 0);   
            }
            // Verify if F16 can cope. Denormlized F32 or too much precision => No.
            if (f32exp == 0 || f32signif & 0x1fff) {
              console.log('@@@ skip ' + (f32exp ? "f32prec" : "f32denorm"));
              break;
            }
            // Arrange for F16.
            let f16exp = f32exp - 127 + 15;
            let f16signif = f32signif >> 13;
            // Verify if F16 can cope. Too large => No.
            if (f16exp > 30) {
              console.log("@@@ skip above f16exp=" + f16exp);
              break;
            }
            // Finally, is this value too small for F16?
            if (f16exp <= 0) {
              // The implicit "1" becomes explicit using subnormal representation.
              f16signif += 1 << 10;
              // Always perform at least one turn.
              f16exp--;
              do {
                // Losing bits is not an option.
                if ((f16signif & 1) != 0) {
                  f16signif = 0;
                  console.log("@@@ skip under f16");
                  break;
                }
                f16signif >>= 1;
              } while (++f16exp < 0);
              // Too small, stick to F32.
              if (f16signif == 0) {
                break;
              }
              console.log("@@@ succeeded f16 denorm");
            }
            // 16 bits is all you need.
            this.#tag = CBOR.#MT_FLOAT16;
            let f16bin = 
                // Put sign bit in position.
                ((u8[0] & 0x80) << 8) +
                // Exponent.  Put it in front of significand.
                (f16exp << 10) +
                // Significand.
                f16signif;
                this.#encoded = this.#f16(f16bin);
          } else {
            // F32 returned a truncated result => Full 64-bit float is required.
            this.#tag = CBOR.#MT_FLOAT64;
            this.#encoded = this.#d2b(float);
          }
          return;
        }
        // 32 bits are apparently sufficient for maintaining magnitude and precision.
        let f32bin = 
            // Put sign bit in position. Why not << 24?  Sorry, JS is brain-dead above 2^31.
            ((u8[0] & 0x80) * 16777216) +
            // Exponent.  Put it in front of significand.
            (f32exp << 23) +
            // Significand.
            f32signif;
            this.#encoded = CBOR.#addArrays(this.#f16(f32bin / 0x10000), this.#f16(f32bin & 0xffff));
      }
    }
    
    encode = function() {
      return CBOR.#addArrays(new Uint8Array([this.#tag]), this.#encoded);
    }

    toString = function() {
      return this.#float.toString();
    }

    _get = function() {
      return this.#float;
    }

    #f16 = function(int16) {
      return new Uint8Array([int16 / 256, int16 % 256]);
    }

    #d2b = function(d) {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setFloat64(0, d, false);
      return [].slice.call(new Uint8Array(buffer))
    }
  }

///////////////////////////
//     CBOR.String       //
///////////////////////////
 
  static String = class extends CBOR.#CBORObject {
    #string;

    constructor(string) {
      super();
      this.#string = CBOR.#typeCheck(string, 'string');
    }
    
    encode = function() {
      let utf8 = new TextEncoder().encode(this.#string);
      return CBOR.#addArrays(CBOR.#encodeTagAndN(CBOR.#MT_STRING, utf8.length), utf8);
    }

    toString = function() {
      let buffer = '"';
      for (let q = 0; q < this.#string.length; q++) {
        let c = this.#string.charCodeAt(q);
        if (c <= 0x5c) {
          let convertedCharacter;
          if ((convertedCharacter = CBOR.#SPECIAL_CHARACTERS[c]) != 0) {
            buffer += '\\';
            if (convertedCharacter == 1) {
              buffer += 'u00' + CBOR.#twoHex(c);
            } else {
              buffer += convertedCharacter;
            }
            continue;
          }
        }
        buffer += String.fromCharCode(c);
      }
      return buffer + '"';
    }

    _get = function() {
      return this.#string;
    }
  }

///////////////////////////
//      CBOR.Bytes       //
///////////////////////////
 
  static Bytes = class extends CBOR.#CBORObject {
    #bytes;

    constructor(bytes) {
      super();
      this.#bytes = CBOR.#bytesCheck(bytes);
    }
    
    encode = function() {
      return CBOR.#addArrays(CBOR.#encodeTagAndN(CBOR.#MT_BYTES, this.#bytes.length), this.#bytes);
    }

    toString = function() {
      return "h'" + CBOR.toHex(this.#bytes) + "'";
    }

    _get = function() {
      return this.#bytes;
    }
  }

///////////////////////////
//       CBOR.Bool       //
///////////////////////////
 
  static Bool = class extends CBOR.#CBORObject {
    #bool;

    constructor(bool) {
      super();
      this.#bool = CBOR.#typeCheck(bool, 'boolean');
    }
    
    encode = function() {
      return new Uint8Array([this.#bool ? CBOR.#MT_TRUE : CBOR.#MT_FALSE]);
    }

    toString = function() {
      return this.#bool.toString();
    }

    _get = function() {
      return this.#bool;
    }
  }

///////////////////////////
//      CBOR.Null        //
///////////////////////////
 
  static Null = class extends CBOR.#CBORObject {
    
    encode = function() {
      return new Uint8Array([CBOR.#MT_NULL]);
    }

    toString = function() {
      return 'null';
    }
  }

///////////////////////////
//      CBOR.Array       //
///////////////////////////

    static Array = class extends CBOR.#CBORObject {
    #objectList = [];

    add = function(value) {
      this.#objectList.push(CBOR.#cborArguentCheck(value));
      return this;
    }

    encode = function() {
      let encoded = CBOR.#encodeTagAndN(CBOR.#MT_ARRAY, this.#objectList.length);
      this.#objectList.forEach(value => {
        encoded = CBOR.#addArrays(encoded, value.encode());
      });
      return encoded;
    }

    toString = function(cborPrinter) {
      let buffer = '[';
      let notFirst = false;
      this.#objectList.forEach(value => {
        if (notFirst) {
          buffer += ', ';
        }
        notFirst = true;
        buffer += value.toString(cborPrinter);
      });
      return buffer + ']';
    }

    _get = function() {
      return this;
    }
  }

///////////////////////////
//       CBOR.Map        //
///////////////////////////

  static Map = class extends CBOR.#CBORObject {
    #root;
    #lastEntry;
    #deterministicMode = false;

    set = function(key, value) {
      let newEntry = {};
      newEntry.key = CBOR.#cborArguentCheck(key);
      newEntry.value = CBOR.#cborArguentCheck(value);
      newEntry.encodedKey = key.encode();
      newEntry.next = null;
      if (this.#root == null) {
        this.#root = newEntry;
      } else {
          if (this.#deterministicMode) {
            // Normal case for parsing.
            let diff = CBOR.#compare(this.#lastEntry, newEntry.encodedKey);
            if (diff >= 0) {
                throw Error((diff == 0 ? 
                  "Duplicate: " : "Non-deterministic order: ") + key.toString());
            }
            this.#lastEntry.next = newEntry;
          } else {
            // Programmatically created key or the result of unconstrained parsing.
            // Then we need to test and sort (always produce deterministic CBOR).
            let precedingEntry = null;
            let diff = 0;
            for (let entry = this.#root; entry != null; entry = entry.next) {
            diff = CBOR.#compare(entry, newEntry.encodedKey);
            if (diff == 0) {
              throw Error("Duplicate: " + key);                      
            }
            if (diff > 0) {
              // New key is less than a current entry.
              if (precedingEntry == null) {
                  // Less than root, means the root must be redefined.
                  newEntry.next = this.#root;
                  this.#root = newEntry;
              } else {
                  // Somewhere above root. Insert after preceding entry.
                  newEntry.next = entry;
                  precedingEntry.next = newEntry;
              }
              // Done, break out of the loop.
              break;
            }
            // No luck in this round, continue searching.
            precedingEntry = entry;
          }
          // Biggest key so far, insert at the end.
          if (diff < 0) {
            precedingEntry.next = newEntry;
          }
        }
      }
      this.#lastEntry = newEntry;
      return this;
    }

    encode = function() {
      let q = 0;
      let encoded = new Uint8Array();
      for (let entry = this.#root; entry != null; entry = entry.next) {
        q++;
        encoded = CBOR.#addArrays(encoded, 
                      CBOR.#addArrays(entry.key.encode(), entry.value.encode()));
      }
      return CBOR.#addArrays(CBOR.#encodeTagAndN(CBOR.#MT_MAP, q), encoded);
    }

    toString = function(cborPrinter) {
      if (cborPrinter == undefined) {
        cborPrinter = new CBOR.#Printer();
      }
      let notFirst = false;
      let buffer = cborPrinter.beginMap();
      for (let entry = this.#root; entry != null; entry = entry.next) {
        if (notFirst) {
          buffer += ',';
        }
        notFirst = true;
        buffer += cborPrinter.newlineAndIndent();
        buffer += entry.key.toString(cborPrinter) + ': ' + entry.value.toString(cborPrinter);
      }
      return buffer + cborPrinter.endMap(notFirst);
    }

    _get = function() {
      return this;
    }
  }

///////////////////////////
//       CBOR.Tag        //
///////////////////////////

  static Tag = class extends CBOR.#CBORObject {

      #tagNumber;
      #object;

      constructor(tagNumber, object) {
        super();
        this.#tagNumber = CBOR.#intCheck(tagNumber);
        if (tagNumber < 0) {
          throw Error("Tag is negative");
        }
        this.#object = CBOR.#cborArguentCheck(object);
      }

    encode = function() {
      return CBOR.#addArrays(CBOR.#encodeTagAndN(CBOR.#MT_TAG, this.#tagNumber),
                             this.#object.encode());
    }

    toString = function(cborPrinter) {
      return this.#tagNumber.toString() + '(' + this.#object.toString(cborPrinter) + ')';
    }

    _get = function() {
      return this;
    }
  }


  static #_decoder = class {

    cbor;
    constructor(cbor) {
      this.cbor = cbor;
    }
  }

///////////////////////////
//     CBOR.decode()     //
///////////////////////////

  static decode = function(cbor) {
    let decoder = new CBOR.#_decoder(CBOR.#bytesCheck(cbor));
  }

///////////////////////////
//    Support Methods    //
///////////////////////////

  static #encodeTagAndN = function(majorType, n) {
    let modifier = n;
    let length = 0;
    if (n > 23) {
      modifier = 24;
      length = 1;
      let q = 0;
      while (q < 3 && n > CBOR.#RANGES[q++]) {
        modifier++;
        length <<= 1;
      }
    }
    let encoded = new Uint8Array(length + 1);
    encoded[0] = majorType | modifier;
    while (length > 0) {
      encoded[length--] = n;
      n /= 256;
    }
    return encoded;
  }

  static #addArrays = function(a1, a2) {
  let res = new Uint8Array(a1.length + a2.length);
    let q = 0;
    while (q < a1.length) {
      res[q] = a1[q++];
    }
    for (let i = 0; i < a2.length; i++) {
      res[q + i] = a2[i];
    }
    return res;
  }

  static #compare = function(entry, testKey) {
    let encodedKey = entry.encodedKey;
    let minIndex = Math.min(encodedKey.length, testKey.length);
    for (let i = 0; i < minIndex; i++) {
      let diff = encodedKey[i] - testKey[i];
      if (diff != 0) {
        return diff;
      }
    }
    return encodedKey.length - testKey.length;
  }

  static #bytesCheck = function(bytes) {
    if (bytes instanceof Uint8Array) {
      return bytes;
    }
    throw Error("Argument is not an 'Uint8Array'");
  }

  static #typeCheck = function(object, type) {
    if (typeof object != type) {
      throw Error("Argument is not a '" + type + "'");
    }
    return object;
  }

  static #intCheck = function(int) {
    CBOR.#typeCheck(int, 'number');
    if (!Number.isInteger(int)) {
      throw Error("Argument is not an integer");
    }
    return int;
  }

  static #Printer = class {
    indentationLevel = 0;

    beginMap = function() {
      this.indentationLevel++;
      return '{';
    }

    newlineAndIndent = function() {
      let buffer = '\n';
      for (let i = 0; i < this.indentationLevel; i++) {
        buffer += '  ';
      }
      return buffer;
    }

    endMap = function(notEmpty) {
      this.indentationLevel--;
      if (notEmpty) {
        return this.newlineAndIndent() + '}';
      }
      return '}';
    }
  }

  static #oneHex = function (digit) {
    return String.fromCharCode(digit < 10 ? (48 + digit) : (87 + digit));
  }

  static #twoHex = function(byte) {
    return CBOR.#oneHex(byte / 16) + CBOR.#oneHex(byte % 16);
  }

  static #cborArguentCheck = function(value) {
    if (value instanceof CBOR.#CBORObject) {
      return value;
    }
    throw Error(value ? "Argument is not a CBOR object: " + value.constructor.name : "'null'");
  }

  static toHex = function (bin) {
    let result = '';
    for (let i = 0; i < bin.length; i++) {
      result += CBOR.#twoHex(bin[i]);
    }
    return result;
  }

}

// To be DELETED

toBin = function(bin) {
  let exppos = bin.length == 8 ? 4 : 7;
  let res = '';
  for (let q = 0; q < bin.length; q++) {
    for (let s = 7; s >= 0; s--) {
       res += String.fromCharCode(48 + ((bin[q] >> s) & 1));
       if ((q == 0 && s == 7) || (q == 1 && s == exppos)) {
         res += ' ';
       }
    }
  }
  return res;
}

module.exports = CBOR;
