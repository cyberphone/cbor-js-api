// JavaScript CBOR API

class CBOR {
  static #MT_UNSIGNED = 0x00;
  static #MT_NEGATIVE = 0x32;
  static #MT_FLOAT16  = 0xf9;
  static #MT_FLOAT32  = 0xfa;
  static #MT_FLOAT64  = 0xfb;
  static #MT_STRING   = 0x60;
  static #MT_ARRAY    = 0x80;
  static #MT_MAP      = 0xa0;

  static #RANGES = [0xff, 0xffff, 0xffffffff];
  constructor() {}

///////////////////////////
//     CBOR.Integer      //
///////////////////////////
 
  static Integer = class {
    #number;
    constructor(number) {
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
      if (this.number < 0) {
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
//  CBOR.FloatingPoint   //
///////////////////////////
 
  static FloatingPoint = class {
    #number;
    #encoded;
    #tag;

    constructor(number) {
      if (typeof number != 'number') {
        throw Error("Must be a number");
      }
      this.number = number;
      this.#tag = CBOR.#MT_FLOAT16;
      if (Number.isNaN(number)) {
        this.#encoded = CBOR.FloatingPoint.#f16(0x7e00);
      } else if (!Number.isFinite(number)) {
        this.#encoded = CBOR.FloatingPoint.#f16(number < 0 ? 0xfc00 : 0x7c00);
      } else if (Math.abs(number) == 0) {
        this.#encoded = CBOR.FloatingPoint.#f16(number < 0 ? 0x8000 : 0x0000);
      }
      if (this.#encoded == null) {
        if (Math.fround(number) == number) {
          this.#encoded = CBOR.FloatingPoint.#f16(0x5678);
        } else {
        }
      }
    }
    
    encode = function() {
      return CBOR.#addArrays(new Uint8Array([this.#tag]), this.#encoded);
    }

    toString = function() {
      return this.number;
    }

    static #f16 = function(int16) {
      return new Uint8Array([int16 / 256, int16 % 256]);
    }
  }

///////////////////////////
//     CBOR.String       //
///////////////////////////
 
  static String = class {
    #string;
    constructor(string) {
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
      return '"' + this.string + '"';
    }
  }

///////////////////////////
//      CBOR.Array       //
///////////////////////////

    static Array = class {
    #objectList = [];

    add = function(value) {
      this.#objectList.push(value);
      return this;
    }

    toString = function(cborPrinter) {
      let output = '[';
      let notFirst = false;
      this.#objectList.forEach(value => {
        if (notFirst) {
          output += ', ';
        }
        notFirst = true;
        output += value.toString(cborPrinter);
      });
      return output + ']';
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

  static Map = class {
    #root;
    #lastEntry;
    #deterministicMode = false;

    set = function(key, value) {
      let newEntry = {};
      newEntry.key = key;
      newEntry.value = value;
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
      let output = cborPrinter.beginMap();
      for (let entry = this.#root; entry != null; entry = entry.next) {
        if (notFirst) {
          output += ',';
        }
        notFirst = true;
        output += cborPrinter.newlineAndIndent();
        output += entry.key.toString(cborPrinter) + ': ' + entry.value.toString(cborPrinter);
      }
      return output + cborPrinter.endMap(notFirst);
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
      let output = '\n';
      for (let i = 0; i < this.indentationLevel; i++) {
        output += '  ';
      }
      return output;
    }

    endMap = function(notEmpty) {
      this.indentationLevel--;
      if (notEmpty) {
        return this.newlineAndIndent() + '}';
      }
      return '}';
    }
  }

  static #bin2hex = function (digit) {
    if (digit < 10) return String.fromCharCode(48 + digit);
    return String.fromCharCode(87 + digit);
  }

  static hex = function (bin) {
    let result = '';
    for (let i = 0; i < bin.length; i++) {
      result += CBOR.#bin2hex(bin[i] / 16) + CBOR.#bin2hex(bin[i] % 16)
    }
    return result;
  }
}

module.exports = CBOR;
