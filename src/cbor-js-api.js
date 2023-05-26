/////////////////////////////////////////////////////////////////////////////////
//                                                                             //
//                             CBOR JavaScript API                             //
//                                                                             //
// Defines a single global object CBOR to (in some way) mimic the JSON object. //
// Determinisic encoding aligned with Appendix A and 4.2.2 Rule 2 of RFC 8949. //
// Author: Anders Rundgren (https://github.com/cyberphone)                     //
/////////////////////////////////////////////////////////////////////////////////

'use strict';

class CBOR {

  // Super class for all CBOR types.
  static #CBORObject = class {

    constructor() {}

    getInt = function() {
      if (this instanceof CBOR.BigInt) {
        // During decoding, integers outside of Number.MAX_SAFE_INTEGER
        // automatically get "BigInt" representation. 
        throw Error("Integer is outside of Number.MAX_SAFE_INTEGER, use getBigInt()");
      }
      return this.#checkTypeAndGetValue(CBOR.Int);
    }

    getString = function() {
      return this.#checkTypeAndGetValue(CBOR.String);
    }

    getBytes = function() {
      return this.#checkTypeAndGetValue(CBOR.Bytes);
    }

    getFloat = function() {
      return this.#checkTypeAndGetValue(CBOR.Float);
    }

    getBool = function() {
      return this.#checkTypeAndGetValue(CBOR.Bool);
    }

    getNull = function() {
      return this instanceof CBOR.Null;
    }

    getBigInt = function() {
      if (this instanceof CBOR.Int) {
        return BigInt(this._get());
      }
      return this.#checkTypeAndGetValue(CBOR.BigInt);
    }

    getArray = function() {
      return this.#checkTypeAndGetValue(CBOR.Array);
    }
 
    getMap = function() {
      return this.#checkTypeAndGetValue(CBOR.Map);
    }
 
    getTag = function() {
      return this.#checkTypeAndGetValue(CBOR.Tag);
    }

    equals = function(object) {
      if (object && object instanceof CBOR.#CBORObject) {
        return CBOR.compareArrays(this.encode(), object.encode()) == 0;
      }
      return false;
    }

    clone = function() {
      return CBOR.decode(this.encode());
    }

    // Overridden by CBOR.Int and CBOR.String
    constrainedKeyType = function() {
      return true;
    }
 
    #checkTypeAndGetValue = function(className) {
      if (!(this instanceof className)) {
        throw Error("Invalid method call for object: CBOR." + this.constructor.name);
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

  static #ESCAPE_CHARACTERS = [
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

    #value;

    // Integers with a magnitude above 2^53 - 1, must use CBOR.BigInt. 
    constructor(value) {
      super();
      this.#value = CBOR.#intCheck(value);
    }
    
    encode = function() {
      let tag;
      let n = this.#value;
      if (n < 0) {
        tag = CBOR.#MT_NEGATIVE;
        n = -n - 1;
      } else {
        tag = CBOR.#MT_UNSIGNED;
      }
      return CBOR.#encodeTagAndN(tag, n);
    }

    toString = function() {
      return this.#value.toString();
    }

    constrainedKeyType = function() {
      return false;
    }

    _get = function() {
      return this.#value;
    }
  }

///////////////////////////
//     CBOR.BigInt       //
///////////////////////////
 
  static BigInt = class extends CBOR.#CBORObject {

    #value;

    // The CBOR.BigInt wrapper object implements the CBOR integer reduction algorithm.  The
    // JavaScript "BigInt" object is used for maintaining lossless represention of large integers.
    constructor(value) {
      super();
      this.#value = CBOR.#typeCheck(value, 'bigint');
    }
    
    encode = function() {
      let tag;
      let value = this.#value
      if (value < 0) {
        tag = CBOR.#MT_NEGATIVE;
        value = ~value;
      } else {
        tag = CBOR.#MT_UNSIGNED;
      }
      // Convert BigInt to Uint8Array (but with a twist).
      let array = [];
      let temp = BigInt(value);
      do {
        array.push(Number(temp & 255n));
        temp >>= 8n;
      } while (temp);
      let length = array.length;
      // Prepare for "Int" encoding (1, 2, 4, 8).  Only 3, 5, 6, and 7 need an action.
      while (length < 8 && length > 2 && length != 4) {
        array.push(0);
        length++;
      }
      let byteArray = new Uint8Array(array.reverse());
      // Does this number qualify as a "BigInt"?
      if (length <= 8) {
        // Apparently not, encode it as "Int".
        if (length == 1 && byteArray[0] < 24) {
          return new Uint8Array([tag | byteArray[0]]);
        }
        let modifier = 24;
        while (length >>= 1) {
           modifier++;
        }
        return CBOR.addArrays(new Uint8Array([tag | modifier]), byteArray);
      }
      // True "BigInt".
      return CBOR.addArrays(new Uint8Array([tag == CBOR.#MT_NEGATIVE ?
                                               CBOR.#MT_BIG_NEGATIVE : CBOR.#MT_BIG_UNSIGNED]), 
                                           CBOR.Bytes(byteArray).encode());
    }

    toString = function() {
      return this.#value.toString();
    }
 
    _get = function() {
      return this.#value;
    }
  }


///////////////////////////
//      CBOR.Float       //
///////////////////////////
 
  static Float = class extends CBOR.#CBORObject {

    #value;
    #encoded;
    #tag;

    constructor(value) {
      super();
      this.#value = CBOR.#typeCheck(value, 'number');
      // Begin catching the F16 edge cases.
      this.#tag = CBOR.#MT_FLOAT16;
      if (Number.isNaN(value)) {
        this.#encoded = CBOR.#int16ToByteArray(0x7e00);
      } else if (!Number.isFinite(value)) {
        this.#encoded = CBOR.#int16ToByteArray(value < 0 ? 0xfc00 : 0x7c00);
      } else if (Math.abs(value) == 0) {
        this.#encoded = CBOR.#int16ToByteArray(Object.is(value,-0) ? 0x8000 : 0x0000);
      } else {
        // It is apparently a genuine (non-zero) number.
        // The following code depends on that Math.fround works as expected.
        let f32 = Math.fround(value);
        let u8;
        let f32exp;
        let f32signif;
        while (true) {  // "goto" surely beats quirky loop/break/return/flag constructs...
          if (f32 == value) {
            // Nothing was lost during the conversion, F32 or F16 is on the menu.
            this.#tag = CBOR.#MT_FLOAT32;
            // However, JavaScript always defer to F64 for "Number".
            u8 = CBOR.#f64ToByteArray(value);
            f32exp = ((u8[0] & 0x7f) << 4) + ((u8[1] & 0xf0) >> 4) - 1023 + 127;
// FOR REMOVAL
            if (u8[4] & 0x1f || u8[5] || u8[6] || u8[7]) {
              throw Error("unexpected fraction: " + f32);
            }
            f32signif = ((u8[1] & 0x0f) << 19) + (u8[2] << 11) + (u8[3] << 3) + (u8[4] >> 5)
            // Very small F32 numbers may require subnormal representation.
            if (f32exp <= 0) {
              // The implicit "1" becomes explicit using subnormal representation.
              f32signif += 1 << 23;
              // Always perform at least one turn.
              f32exp--;
              do {
// FOR REMOVAL
                if ((f32signif & 1) != 0) {
                  throw Error("unexpected offscale: " + f32);
                }
                f32signif >>= 1;
              } while (++f32exp < 0);   
            }
            // If it is a subnormal F32 or if F16 would lose precision, stick to F32.
            if (f32exp == 0 || f32signif & 0x1fff) {
// FOR REMOVAL
              console.log('@@@ skip ' + (f32exp ? "f32prec" : "f32denorm"));
              break;
            }
            // Arrange for F16.
            let f16exp = f32exp - 127 + 15;
            let f16signif = f32signif >> 13;
            // If too large for F16, stick to F32.
            if (f16exp > 30) {
// FOR REMOVAL
              console.log("@@@ skip above f16exp=" + f16exp);
              break;
            }
            // Finally, is value too small for F16?
            if (f16exp <= 0) {
              // The implicit "1" becomes explicit using subnormal representation.
              f16signif += 1 << 10;
              // Always perform at least one turn.
              f16exp--;
              do {
                // Losing bits is not an option.
                if ((f16signif & 1) != 0) {
                  f16signif = 0;
// FOR REMOVAL
                  console.log("@@@ skip under f16");
                  break;
                }
                f16signif >>= 1;
              } while (++f16exp < 0);
              // If too small for F16, stick to F32.
              if (f16signif == 0) {
                break;
              }
// FOR REMOVAL
              console.log("@@@ succeeded f16 denorm");
            }
            // A rarity, 16 bits turned out being sufficient for representing value.
            this.#tag = CBOR.#MT_FLOAT16;
            let f16bin = 
                // Put sign bit in position.
                ((u8[0] & 0x80) << 8) +
                // Exponent.  Put it in front of significand.
                (f16exp << 10) +
                // Significand.
                f16signif;
                this.#encoded = CBOR.#int16ToByteArray(f16bin);
          } else {
            // Converting to F32 returned a truncated result.
            // Full 64-bit representation is required.
            this.#tag = CBOR.#MT_FLOAT64;
            this.#encoded = CBOR.#f64ToByteArray(value);
          }
          // Common F16 and F64 return point.
          return;
        }
        // Broken loop: 32 bits are apparently needed for maintaining magnitude and precision.
        let f32bin = 
            // Put sign bit in position. Why not << 24?  JS shift doesn't work above 2^31...
            ((u8[0] & 0x80) * 0x1000000) +
            // Exponent.  Put it in front of significand (<< 23).
            (f32exp * 0x800000) +
            // Significand.
            f32signif;
            this.#encoded = CBOR.addArrays(CBOR.#int16ToByteArray(f32bin / 0x10000), 
                                           CBOR.#int16ToByteArray(f32bin % 0x10000));
      }
    }
    
    encode = function() {
      return CBOR.addArrays(new Uint8Array([this.#tag]), this.#encoded);
    }

    toString = function() {
      return this.#value.toString();
    }

    _get = function() {
      return this.#value;
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
      return CBOR.addArrays(CBOR.#encodeTagAndN(CBOR.#MT_STRING, utf8.length), utf8);
    }

    toString = function() {
      let buffer = '"';
      for (let q = 0; q < this.#string.length; q++) {
        let c = this.#string.charCodeAt(q);
        if (c <= 0x5c) {
          let escapedCharacter;
          if (escapedCharacter = CBOR.#ESCAPE_CHARACTERS[c]) {
            buffer += '\\';
            if (escapedCharacter == 1) {
              buffer += 'u00' + CBOR.#twoHex(c);
            } else {
              buffer += escapedCharacter;
            }
            continue;
          }
        }
        buffer += String.fromCharCode(c);
      }
      return buffer + '"';
    }

    constrainedKeyType = function() {
      return false;
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
      return CBOR.addArrays(CBOR.#encodeTagAndN(CBOR.#MT_BYTES, this.#bytes.length), this.#bytes);
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

    #elements = [];

    add = function(element) {
      this.#elements.push(CBOR.#cborArguentCheck(element));
      return this;
    }

    get = function(index) {
      index = CBOR.#intCheck(index);
      if (index < 0 || index >= this.#elements.length) {
        throw Error("Array index out of range: " + index);
      }
      return this.#elements[index];
    }

    toArray = function() {
      let array = [];
      this.#elements.forEach(element => array.push(element));
      return array;
    }

    encode = function() {
      let encoded = CBOR.#encodeTagAndN(CBOR.#MT_ARRAY, this.#elements.length);
      this.#elements.forEach(object => {
        encoded = CBOR.addArrays(encoded, object.encode());
      });
      return encoded;
    }

    toString = function(cborPrinter) {
      let buffer = '[';
      let notFirst = false;
      this.#elements.forEach(object => {
        if (notFirst) {
          buffer += ', ';
        }
        notFirst = true;
        buffer += object.toString(cborPrinter);
      });
      return buffer + ']';
    }

    size = function() {
      return this.#elements.length;
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
    #numberOfEntries = 0;
    _constrainedKeys = false;
    _deterministicMode = false;

    static Entry = class {

       constructor(key, value) {
         this.key = key;
         this.encodedKey = key.encode();
         this.value = value;
         this.next = null;
       }

       compare = function(encodedKey) {
         return CBOR.compareArrays(this.encodedKey, encodedKey);
       }
    }

    set = function(key, value) {
      let newEntry = new CBOR.Map.Entry(this.#getKey(key), CBOR.#cborArguentCheck(value));
      if (this._constrainedKeys && key.constrainedKeyType()) {
        throw Error("Constrained key option disallows: " + key.constructor.name);
      }
      if (this.#root) {
        // Second key etc.
        if (this._constrainedKeys &&
            this.#lastEntry.key.constructor.name != key.constructor.name) {
          throw Error("Constrained key option disallows mixing types: " + key.constructor.name);
        }
        if (this._deterministicMode) {
          // Normal case for parsing.
          let diff = this.#lastEntry.compare(newEntry.encodedKey);
          if (diff >= 0) {
            throw Error((diff ? "Non-deterministic order: " : "Duplicate: ") + key);
          }
          this.#lastEntry.next = newEntry;
        } else {
          // Programmatically created key or the result of unconstrained parsing.
          // Then we need to test and sort (always produce deterministic CBOR).
          let precedingEntry = null;
          let diff = 0;
          for (let entry = this.#root; entry; entry = entry.next) {
            diff = entry.compare(newEntry.encodedKey);
            if (diff == 0) {
              throw Error("Duplicate: " + key);                      
            }
            if (diff > 0) {
              // New key is (lexicographically) smaller than current entry.
              if (precedingEntry == null) {
                // New key is smaller than root. New key becomes root.
                newEntry.next = this.#root;
                this.#root = newEntry;
              } else {
                // New key is smaller than an entry above root. Insert before current entry.
                newEntry.next = entry;
                precedingEntry.next = newEntry;
              }
              // Done, break out of the loop.
              break;
            }
            // No luck in this round, continue searching.
            precedingEntry = entry;
          }
          // Biggest key so far, insert it at the end.
          if (diff < 0) {
            precedingEntry.next = newEntry;
          }
        }
      } else {
        // First key, take it as is.
        this.#root = newEntry;
      }
      this.#lastEntry = newEntry;
      this.#numberOfEntries++;
      return this;
    }

    #getKey = function(key) {
      return CBOR.#cborArguentCheck(key);
    }

    #missingKey = function(key) {
      throw Error("Missing key: " + key);
    }

    #lookup(key, mustExist) {
      let encodedKey = this.#getKey(key).encode();
      for (let entry = this.#root; entry; entry = entry.next) {
        if (entry.compare(encodedKey) == 0) {
          return entry;
        }
      }
      if (mustExist) {
        this.#missingKey(key);
      }
      return null;
    }

    get = function(key) {
      return this.#lookup(key, true).value;
    }

    getConditionally = function(key, defaultValue) {
      let entry = this.#lookup(key, false);
      // Note: defaultValue my be 'null'
      defaultValue = defaultValue ? CBOR.#cborArguentCheck(defaultValue) : null;
      return entry ? entry.value : defaultValue;
    }

    getKeys = function() {
      let keys = [];
      for (let entry = this.#root; entry; entry = entry.next) {
        keys.push(entry.key);
      }
      return keys;
    }

    remove = function(key) {
      let encodedKey = this.#getKey(key).encode();
      let precedingEntry = null;
      for (let entry = this.#root; entry; entry = entry.next) {
        if (entry.compare(encodedKey) == 0) {
          if (precedingEntry == null) {
            // Remove root key.  It may be alone.
            this.#root = entry.next;
          } else {
            // Remove key somewhere above root.
            precedingEntry.next = entry.next;
          }
          this.#numberOfEntries--;
          return entry.value;
        }
        precedingEntry = entry;
      }
      this.#missingKey(key);
    }

    size = function() {
      return this.#numberOfEntries;
    }

    containsKey = function(key) {
      return this.#lookup(key, false) != null;
    }

    encode = function() {
    console.log("nr=" + this.#numberOfEntries);
      let encoded = CBOR.#encodeTagAndN(CBOR.#MT_MAP, this.#numberOfEntries);
      for (let entry = this.#root; entry; entry = entry.next) {
        encoded = CBOR.addArrays(encoded, 
                                 CBOR.addArrays(entry.key.encode(), entry.value.encode()));
      }
      return encoded;
    }

    toString = function(cborPrinter) {
      if (cborPrinter == undefined) {
        cborPrinter = new CBOR.#Printer();
      }
      let notFirst = false;
      let buffer = cborPrinter.beginMap();
      for (let entry = this.#root; entry; entry = entry.next) {
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
      return CBOR.addArrays(CBOR.#encodeTagAndN(CBOR.#MT_TAG, this.#tagNumber),
                            this.#object.encode());
    }

    toString = function(cborPrinter) {
      return this.#tagNumber.toString() + '(' + this.#object.toString(cborPrinter) + ')';
    }

    _get = function() {
      return this;
    }
  }

///////////////////////////
//        Proxy          //
///////////////////////////

  // The Proxy concept enables checks for invocation by "new" and number of arguments.
  static #handler = class {

    constructor(numberOfArguments) {
      this.numberOfArguments = numberOfArguments;
    }

    apply(target, thisArg, argumentsList) {
      if (argumentsList.length != this.numberOfArguments) {
        throw Error("CBOR." + target.name + " expects " + 
        (this.numberOfArguments ? this.numberOfArguments.toString() : "no") + " arguments");
      }
      return new target(...argumentsList);
    }

    construct(target, args) {
      throw Error("CBOR." + target.name + " does not permit \"new\"");
    }
  }

  static Int = new Proxy(CBOR.Int, new CBOR.#handler(1));
  static BigInt = new Proxy(CBOR.BigInt, new CBOR.#handler(1));
  static Float = new Proxy(CBOR.Float, new CBOR.#handler(1));
  static String = new Proxy(CBOR.String, new CBOR.#handler(1));
  static Bytes = new Proxy(CBOR.Bytes, new CBOR.#handler(1));
  static Bool = new Proxy(CBOR.Bool, new CBOR.#handler(1));
  static Null = new Proxy(CBOR.Null, new CBOR.#handler(0));
  static Array = new Proxy(CBOR.Array, new CBOR.#handler(0));
  static Map = new Proxy(CBOR.Map, new CBOR.#handler(0));
  static Tag = new Proxy(CBOR.Tag, new CBOR.#handler(2));


///////////////////////////
//     Decoder Core      //
///////////////////////////

  static #_decoder = class {

    constructor(cbor,
                sequenceFlag,
                acceptNonDeterministic,
                constrainedKeys) {
      this.cbor = CBOR.#bytesCheck(cbor);
      this.counter = 0;
      this.sequenceFlag = sequenceFlag;
      this.deterministicMode = !acceptNonDeterministic;
      this.constrainedKeys = constrainedKeys;
    }

    readByte = function() {
      if (this.counter >= this.cbor.length) {
        if (this.sequenceFlag && this.atFirstByte) {
          return CBOR.#MT_NULL;
        }
        throw Error("Reading past end of buffer");
      }
      this.atFirstByte = false;
      return this.cbor[this.counter++];
    }
        
    readBytes = function (length) {
      let result = new Uint8Array(length);
      let q = -1; 
      while (++q < length) {
        result[q] = this.readByte();
      }
      return result;
    }
/*

        private CBORFloat checkDoubleConversion(int tag, long bitFormat, long rawDouble)
                 {
            CBORFloat value = new CBORFloat(Double.longBitsToDouble(rawDouble));
            if ((value.tag != tag || value.bitFormat != bitFormat) && deterministicMode) {
                reportError(String.format(STDERR_NON_DETERMINISTIC_FLOAT + "%2x", tag));
            }
            return value;
        }
*/
    unsupportedTag = function(tag) {
      throw Error("Unsupported tag: " + CBOR.#twoHex(tag));
    }

    rangeLimitedBigInt = function(value) {
      if (value > 0xffffffffn) {
        throw Error("Length limited to 0xffffffff");
      }
      return Number(value);
    }

    getObject = function() {
      let tag = this.readByte();

      // Begin with CBOR types that are uniquely defined by the tag byte.
      switch (tag) {
        case CBOR.#MT_BIG_NEGATIVE:
        case CBOR.#MT_BIG_UNSIGNED:
          let byteArray = this.getObject().getBytes();
          if ((byteArray.length == 0 || byteArray[0] == 0 || byteArray.length <= 8) && 
              this.deterministicMode) {
            throw Error("Non-deterministic big integer encoding");
          }
          let value = 0n;
          byteArray.forEach(byte => {
            value <<= 8n;
            value += BigInt(byte);
          });
          if (tag == CBOR.#MT_BIG_NEGATIVE) {
            value = ~value;
          }
          return CBOR.BigInt(value);
/*
        case CBOR.#MT_FLOAT16:
          this.floatConversion(0);
            let float16 = readNumber(2);
            let unsignedf16 = float16 & ~FLOAT16_NEG_ZERO;

            // Begin with the edge cases.
                    
            if ((unsignedf16 & FLOAT16_POS_INFINITY) == FLOAT16_POS_INFINITY) {
                // Special "number"
                f64Bin = (unsignedf16 == FLOAT16_POS_INFINITY) ?
                    // Non-deterministic representations of NaN will be flagged later.
                    // NaN "signaling" is not supported, "quiet" NaN is all there is.

                    FLOAT64_POS_INFINITY : FLOAT64_NOT_A_NUMBER;

            } else if (unsignedf16 == 0) {
                    f64Bin = FLOAT64_ZERO;
            } else {

                // It is a "regular" non-zero number.
                    
                // Get the bare (but still biased) float16 exponent.
                let exponent = (unsignedf16 >> FLOAT16_SIGNIFICAND_SIZE);
                // Get the float16 significand bits.
                let significand = unsignedf16;
                if (exponent == 0) {
                    // Subnormal float16 - In float64 that must translate to normalized.
                    exponent++;
                    do {
                        exponent--;
                        significand <<= 1;
                        // Continue until the implicit "1" is in the proper position.
                    } while ((significand & (1 << FLOAT16_SIGNIFICAND_SIZE)) == 0);
                }
//                     significand & ((1 << FLOAT16_SIGNIFICAND_SIZE) - 1);
                f64Bin = mapValues(exponent + FLOAT64_EXPONENT_BIAS - FLOAT16_EXPONENT_BIAS,
                                    significand, FLOAT16_SIGNIFICAND_SIZE);
                mapVau
                unsignedResult = 
                // Exponent.  Set the proper bias and put result in front of significand.
                ((exponent + (FLOAT64_EXPONENT_BIAS - FLOAT16_EXPONENT_BIAS)) 
                    << FLOAT64_SIGNIFICAND_SIZE) +
                // Significand.  Remove everything above.
                (significand & ((1l << FLOAT64_SIGNIFICAND_SIZE) - 1));
            }
              return checkDoubleConversion(tag,
                                            float16, 
                                            f64Bin,
                                            // Put sign bit in position.
                                            ((float16 & FLOAT16_NEG_ZERO) << (64 - 16)));

        case CBOR.#MT_FLOAT32:
              long float32 = getLongFromBytes(4);
              return checkDoubleConversion(tag, 
                                              float32,
                                              Double.doubleToLongBits(
                                                      Float.intBitsToFloat((int)float32)));
 
            case CBOR.#MT_FLOAT64:
                long float64 = getLongFromBytes(8);
                return checkDoubleConversion(tag, float64, float64);
*/
        case CBOR.#MT_NULL:
          return CBOR.Null();
                    
        case CBOR.#MT_TRUE:
        case CBOR.#MT_FALSE:
          return CBOR.Bool(tag == CBOR.#MT_TRUE);
      }
      // Then decode CBOR types that blend length of data in the tag byte.
      let n = tag & 0x1f;
      let bigN = BigInt(n);
      if (n > 27) {
        this.unsupportedTag(tag);
      }
      if (n > 23) {
        // For 1, 2, 4, and 8 byte N.
        let q = 1 << (n - 24);
        let mask = 0xffffffffn << BigInt((q >> 1) * 8);
        console.log('mask=' + mask.toString(16));
        bigN = 0n;
        while (--q >= 0) {
          bigN <<= 8n;
          bigN += BigInt(this.readByte());
        }
        console.log("bigN=" + bigN);
        // If the upper half (for 2, 4, 8 byte N) of N or a single byte
        // N is zero, a shorter variant should have been used.
        // In addition, N must be > 23. 
        if ((bigN < 24n || !(mask & bigN)) && this.deterministicMode) {
          throw Error("Non-deterministic N encoding for tag: 0x" + CBOR.#twoHex(tag));
        }
      }
            console.log("N=" + bigN + " " + (typeof BigN == 'bigint'));
            console.log(bigN);
      // N successfully decoded, now switch on major type (upper three bits).
      switch (tag & 0xe0) {
        case CBOR.#MT_TAG:
          let tagData = getObject();
          /*
          if (bigN == CBORTag.RESERVED_TAG_COTX) {
            let holder = tagData.getArray(2);
            if (holder.get(0).getType() != CBORTypes.TEXT_STRING) {
                reportError("Tag syntax " +  CBORTag.RESERVED_TAG_COTX +
                            "([\"string\", CBOR object]) expected");
            }
          }
          */
          return CBOR.Tag(bigN, tagData);

        case CBOR.#MT_UNSIGNED:
          if (bigN > BigInt(Number.MAX_SAFE_INTEGER)) {
            return CBOR.BigInt(bigN);
          }
          return CBOR.Int(Number(bigN));
    
        case CBOR.#MT_NEGATIVE:
          bigN = ~bigN;
          if (bigN < BigInt(-Number.MAX_SAFE_INTEGER)) {
            return CBOR.BigInt(bigN);
          }
          return CBOR.Int(Number(bigN));
    
        case CBOR.#MT_BYTES:
          return CBOR.Bytes(this.readBytes(this.rangeLimitedBigInt(bigN)));
    
        case CBOR.#MT_STRING:
          return CBOR.String(new TextDecoder('utf-8', {fatal: true}).decode(
                                     this.readBytes(this.rangeLimitedBigInt(bigN))));
    
        case CBOR.#MT_ARRAY:
          let cborArray = CBOR.Array();
          for (let q = this.rangeLimitedBigInt(bigN); --q >= 0;) {
            cborArray.add(this.getObject());
          }
          return cborArray;
    
        case CBOR.#MT_MAP:
          let cborMap = CBOR.Map();
          cborMap._deterministicMode = this.deterministicMode;
          cborMap._constrainedKeys = this.constrainedKeys;
          for (let q = this.rangeLimitedBigInt(bigN); --q >= 0;) {
            cborMap.set(this.getObject(), this.getObject());
          }
          // Programmatically added elements sort automatically. 
          cborMap._deterministicMode = false;
          return cborMap;
    
        default:
          this.unsupportedTag(tag);
      }
    }
  }

  static #getObject = function(decoder) {
    decoder.atFirstByte = true;
    let object = decoder.getObject();
    if (decoder.sequenceFlag) {
      if (decoder.atFirstByte) {
        return null;
      }
    } else if (decoder.counter < decoder.cbor.length) {
      throw Error("Unexpected data encountered after CBOR object");
    }
    return object;
  }

///////////////////////////
//     CBOR.decode()     //
///////////////////////////

  static decode = function(cbor) {
    let decoder = new CBOR.#_decoder(cbor, false, false, false);
    return CBOR.#getObject(decoder);
  }

///////////////////////////
//  CBOR.initExtended()  //
///////////////////////////

  static initExtended = function(cbor, sequenceFlag, acceptNonDeterministic, constrainedKeys) {
    return new CBOR.#_decoder(cbor, 
                              sequenceFlag,
                              acceptNonDeterministic, 
                              constrainedKeys);
  }

///////////////////////////
// CBOR.decodeExtended() //
///////////////////////////

  static decodeExtended = function(decoder) {
    return CBOR.#getObject(decoder);
  }

//================================//
//    Internal Support Methods    //
//================================//

  static #encodeTagAndN = function(majorType, n) {
    let modifier = n;
    let length = 0;
    if (n > 23) {
      modifier = 24;
      length = 1;
      let nextRange = 0x100;
      while (length < 8 && n >= nextRange) {
        modifier++;
        length <<= 1;
        // The last multiplication will not be an integer but "length < 8" handles this.
        nextRange *= nextRange;
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

  static #bytesCheck = function(byteArray) {
    if (byteArray instanceof Uint8Array) {
      return byteArray;
    }
    throw Error("Argument is not an 'Uint8Array'");
  }

  static #typeCheck = function(object, type) {
    if (typeof object != type) {
      throw Error("Argument is not a '" + type + "'");
    }
    return object;
  }

  static #intCheck = function(value) {
    CBOR.#typeCheck(value, 'number');
    if (!Number.isSafeInteger(value)) {
      throw Error(Number.isInteger(value) ?
        "Argument is outside of Number.MAX_SAFE_INTEGER" : "Argument is not an integer");
    }
    return value;
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
      return notEmpty ? this.newlineAndIndent() + '}' : '}';
    }
  }
  
  static #int16ToByteArray = function(int16) {
    return new Uint8Array([int16 / 256, int16 % 256]);
  }

  static #f64ToByteArray = function(value) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, false);
    return [].slice.call(new Uint8Array(buffer))
  }

  static #oneHex = function(digit) {
    return String.fromCharCode(digit < 10 ? (0x30 + digit) : (0x57 + digit));
  }

  static #twoHex = function(byte) {
    return CBOR.#oneHex(byte / 16) + CBOR.#oneHex(byte % 16);
  }

  static #cborArguentCheck = function(object) {
    if (object instanceof CBOR.#CBORObject) {
      return object;
    }
    throw Error(object ? "Argument is not a CBOR object: " + object.constructor.name : "'null'");
  }

  static #decodeOneHex(charCode) {
    if (charCode >= 0x30 && charCode <= 0x39) return charCode - 0x30;
    if (charCode >= 0x61 && charCode <= 0x66) return charCode - 0x57;
    if (charCode >= 0x41 && charCode <= 0x46) return charCode - 0x37;
    throw Error("Bad hex character: " + String.fromCharCode(charCode));
  }

//================================//
//     Public Support Methods     //
//================================//

  static addArrays = function(a, b) {
  let result = new Uint8Array(a.length + b.length);
    let q = 0;
    while (q < a.length) {
      result[q] = a[q++];
    }
    for (let i = 0; i < b.length; i++) {
      result[q + i] = b[i];
    }
    return result;
  }

  static compareArrays = function(a, b) {
    let minIndex = Math.min(a.length, b.length);
    for (let i = 0; i < minIndex; i++) {
      let diff = a[i] - b[i];
      if (diff != 0) {
        return diff;
      }
    }
    return a.length - b.length;
  }
  
  static toHex = function (byteArray) {
    let result = '';
    for (let i = 0; i < byteArray.length; i++) {
      result += CBOR.#twoHex(byteArray[i]);
    }
    return result;
  }

  static fromHex = function (hexString) {
    let length = hexString.length;
    if (length & 1) {
      throw Error("Uneven number of characters in hex string");
    }
    let result = new Uint8Array(length >> 1);
    for (let q = 0; q < length; q += 2) {
      result[q >> 1] = (CBOR.#decodeOneHex(hexString.charCodeAt(q)) << 4) +
                        CBOR.#decodeOneHex(hexString.charCodeAt(q + 1));
    }
    return result;
  }

  static toBase64Url = function(byteArray) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(byteArray)))
               .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  static fromBase64Url = function(base64) {
    if (!base64.includes('=')) {
      base64 = base64 +  '===='.substring(0, (4 - (base64.length % 4)) % 4);
    }
    return Uint8Array.from(atob(base64.replace(/-/g, '+').replace(/_/g, '/')),
                           c => c.charCodeAt(0));
  }

}

module.exports = CBOR;
