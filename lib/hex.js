bin2hex = function (digit) {
  if (digit < 10) return String.fromCharCode(48 + digit);
  return String.fromCharCode(87 + digit);
}

hex = function (bin) {
  let result = '';
  for (let i = 0; i < bin.length; i++) {
    result += bin2hex(bin[i] / 16) + bin2hex(bin[i] % 16)
  }
  return result;
}

module.exports = hex;