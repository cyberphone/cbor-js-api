// JavaScript CBOR API

class CBORObject {
}

class CBOR {
  static #MT_UNSIGNED     = 0x00;
  static #MT_NEGATIVE     = 0x20;
  static #MT_BYTES        = 0x40;
  static #MT_STRING       = 0x60;
  static #MT_ARRAY        = 0x80;
  static #MT_MAP          = 0xa0;
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

  constructor() {}

///////////////////////////
//       CBOR.Int        //
///////////////////////////
 
  static Int = class extends CBORObject {
    #number;
    constructor(number) {
      super();
      if (typeof number != 'number') {
        throw Error("Must be a number");
      }
      if (!Number.isInteger(number)) {
        throw Error("Not an integer");
      }
      this.number = number;
    }
    
    encode = function() {
      let tag;
      let n = this.number;
      if (n < 0) {
        tag = CBOR.#MT_NEGATIVE;
        n = -n - 1;
      } else {
        tag = CBOR.#MT_UNSIGNED;
      }
      return CBOR.#encodeTagAndN(tag, n);
    }

    toString = function() {
      return this.number;
    }
  }

///////////////////////////
//     CBOR.BigInt       //
///////////////////////////
 
  static BigInt = class extends CBORObject {
    #bigInt;
    constructor(bigInt) {
      super();
      if (typeof bigInt != 'bigint') {
        throw Error("Must be a BigInt");
      }
      this.bigInt = bigInt;
    }
    
    encode = function() {
      let tag;
      let value = this.bigInt
      if (value < 0) {
        tag = CBOR.#MT_NEGATIVE;
        value = -value -1n;
      } else {
        tag = CBOR.#MT_UNSIGNED;
      }
      let hex = value.toString(16);
      if (hex.length % 2) {
        hex = '0' + hex;
      }
      let len = hex.length / 2;
      let offset = 0;
      if (len <= 8) {
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
      if (len <= 8) {
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
      return CBOR.#addArrays(new Uint8Array([tag == CBOR.#MT_NEGATIVE ?
                                                CBOR.#MT_BIG_NEGATIVE : CBOR.#MT_BIG_UNSIGNED]), 
                                            new CBOR.Bytes(u8).encode());
    }

    toString = function() {
      return this.bigInt.toString();
    }
  }


///////////////////////////
//      CBOR.Float       //
///////////////////////////
 
  static Float = class extends CBORObject {
    #number;
    #encoded;
    #tag;

    constructor(number) {
      super();
      if (typeof number != 'number') {
        throw Error("Must be a number");
      }
      this.number = number;
      this.#tag = CBOR.#MT_FLOAT16;
      if (Number.isNaN(number)) {
        this.#encoded = this.#f16(0x7e00);
      } else if (!Number.isFinite(number)) {
        this.#encoded = this.#f16(number < 0 ? 0xfc00 : 0x7c00);
      } else if (Math.abs(number) == 0) {
        this.#encoded = this.#f16(number == -0 ? 0x8000 : 0x0000);
      } else {
        // The following code depends on that Math.fround works as it should
        let f32 = Math.fround(number);
        let u8;
        let f32exp;
        let f32signif;
        while (true) {  // "goto" surely beats quirky loop/break/return/flag constructs
          if (f32 == number) {
            this.#tag = CBOR.#MT_FLOAT32;
            u8 = this.#d2b(f32);
            f32exp = ((u8[0] & 0x7f) << 4) + ((u8[1] & 0xf0) >> 4) - 1023 + 127;
            console.log("exp=" + f32exp);
            console.log("exp=" + (((u8[0] & 0x7f) << 4) + ((u8[1] & 0xf0) >> 4)));
            if (u8[4] & 0x1f || u8[5] || u8[6] || u8[7]) {
              console.log(u8.toString());
              throw Error("unexpected fraction: " + f32);
            }
            f32signif = ((u8[1] & 0x0f) << 18) + (u8[2] << 10) + (u8[3] << 2) + (u8[4] >> 6)
            // Check if we need to denormalize data.
            console.log("norm32=" + (f32exp <= 0));
            if (f32exp <= 0) {
              // The implicit "1" becomes explicit using subnormal representation.
              f32signif += 1 << 23;
              f32exp--;
              // Always perform at least one turn.
              do {
                if ((f32signif & 1) != 0) {
          console.log(u8.toString());
          throw Error("unexpected offscale: " + f32);
                }
                f32signif >>= 1;
              } while (++f32exp < 0);
            }
                        console.log("F32 S=" + ((u8[0] & 0x80) << 8) + " E=" + f32exp + " F=" + f32signif);
            // Verify if F16 can cope. Denormlized F32 and too much precision => No
            if (f32exp == 0 || f32signif & 0xfff) {
              break;
            }
            let f16exp = f32exp - 127 + 15;
            let f16signif = f32signif >> 12;
            console.log("F16 S=" + ((u8[0] & 0x80) << 8) + " E=" + f16exp + " F=" + f16signif);
           // Verify if F16 can cope. Too large => No
            if (f16exp > 0xfc) {
              break;
            }
            // Finally, is this value to small for F16?
            if (f16exp <= 0) {

                // The implicit "1" becomes explicit using subnormal representation.
              f16signif += 1 << 10;
              f16exp--;
              // Always perform at least one turn.
              do {
                if ((f16signif & 1) != 0) {
          console.log(u8.toString());
          console.log("offscale f16: " + f32);
                  break;
                }
                f16signif >>= 1;
              } while (++f16exp < 0);
            }
            // 16 bits is all you need.
            console.log("F16 S=" + ((u8[0] & 0x80) << 8) + " E=" + f16exp + " F=" + f16signif);
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
            this.#tag = CBOR.#MT_FLOAT64;
            this.#encoded = this.#d2b(number);
          }
          return;
        }
        let f32bin = 
            // Put sign bit in position.
            ((u8[0] & 0x80) << 24) +
            // Exponent.  Put it in front of significand.
            (f32exp << 23) +
            // Significand.
            f32signif;
            this.#encoded = CBOR.#addArrays(this.#f16(f32bin >> 16), this.#f16(f32bin & 0xffff));
      }
    }
    
    encode = function() {
      return CBOR.#addArrays(new Uint8Array([this.#tag]), this.#encoded);
    }

    toString = function() {
      return this.number.toString();
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
 
  static String = class extends CBORObject {
    #string;

    constructor(string) {
      super();
      if (typeof string != 'string') {
        throw Error("Must be a string");
      }
      this.string = string;
    }
    
    encode = function() {
      let utf8 = new TextEncoder().encode(this.string);
      return CBOR.#addArrays(CBOR.#encodeTagAndN(CBOR.#MT_STRING, utf8.length), utf8);
    }

    toString = function() {
      let buffer = '"';
      for (let q = 0; q < this.string.length; q++) {
        let c = this.string.charCodeAt(q);
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
  }

///////////////////////////
//      CBOR.Bytes       //
///////////////////////////
 
  static Bytes = class extends CBORObject {
    #bytes;

    constructor(bytes) {
      super();
      if (!(bytes instanceof Uint8Array)) {
        throw Error("Must be an Uint8Array");
      }
      this.bytes = bytes;
    }
    
    encode = function() {
      return CBOR.#addArrays(CBOR.#encodeTagAndN(CBOR.#MT_BYTES, this.bytes.length), this.bytes);
    }

    toString = function() {
      return "h'" + CBOR.toHex(this.bytes) + "'";
    }
  }

///////////////////////////
//       CBOR.Bool       //
///////////////////////////
 
  static Bool = class extends CBORObject {
    #boolean;

    constructor(boolean) {
      super();
      if (typeof boolean != 'boolean') {
        throw Error("Must be a boolean");
      }
      this.boolean = boolean;
    }
    
    encode = function() {
      return new Uint8Array([this.boolean ? CBOR.#MT_TRUE : CBOR.#MT_FALSE]);
    }

    toString = function() {
      return this.boolean;
    }
  }

///////////////////////////
//      CBOR.Null        //
///////////////////////////
 
  static Null = class extends CBORObject {
    
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

    static Array = class extends CBORObject {
    #objectList = [];

    add = function(value) {
      this.#objectList.push(CBOR.#check(value));
      return this;
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

    encode = function() {
      let encoded = CBOR.#encodeTagAndN(CBOR.#MT_ARRAY, this.#objectList.length);
      this.#objectList.forEach(value => {
        encoded = CBOR.#addArrays(encoded, value.encode());
      });
      return encoded;
    }
  }

///////////////////////////
//       CBOR.Map        //
///////////////////////////

  static Map = class extends CBORObject {
    #root;
    #lastEntry;
    #deterministicMode = false;

    set = function(key, value) {
      let newEntry = {};
      newEntry.key = CBOR.#check(key);
      newEntry.value = CBOR.#check(value);
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
  }

  //
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
    if (digit < 10) return String.fromCharCode(48 + digit);
    return String.fromCharCode(87 + digit);
  }

  static #twoHex = function(byte) {
    return CBOR.#oneHex(byte / 16) + CBOR.#oneHex(byte % 16);
  }

  static #check = function(value) {
    if (value instanceof CBORObject) {
      return value;
    }
    throw Error(value ? "Not CBOR object: " + value.toString() : "Argument is 'null'");
  }

  static toHex = function (bin) {
    let result = '';
    for (let i = 0; i < bin.length; i++) {
      result += CBOR.#twoHex(bin[i]);
    }
    return result;
  }

}

module.exports = CBOR;
