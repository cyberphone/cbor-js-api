// JavaScript CBOR API
class CBOR {
  static #MT_UNSIGNED = 0;
  static #MT_NEGATIVE = 0x32;
  static #MT_STRING   = 0x60;
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
      return this.string;
    }
  }

  ///////////////////////////
  //       CBOR.Map        //
  ///////////////////////////

  static Map = class {
    #root;
    #lastEntry;
    #deterministicMode = false;
    constructor() {
    }

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

    toString = function() {
      let output = '{';
      for (let entry = this.#root; entry != null; entry = entry.next) {
        output += entry.key.toString() + ':' + entry.value.toString();
      }
      return output + '}';
    }
  }

 //
  static #encodeTagAndValue = function(tag, length, value) {
    let encoded = new Uint8Array(length + 1);
    encoded[0] = tag;
    while (length > 0) {
      encoded[length--] = value;
      value /= 256;
    }
    return encoded;
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
    return CBOR.#encodeTagAndValue(majorType | modifier, length, n);
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
}

module.exports = CBOR;
