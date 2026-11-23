const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const CHARSET_INDEX = new Map([...CHARSET].map((character, index) => [character, index]));
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32M = 0x2bc830a3;
const HRPS = new Set(["mfcx", "tmfcx"]);
const VERSION = 0;

export class AddressError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AddressError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new AddressError(code, message);
}

function hrpExpand(hrp) {
  const expanded = [];
  for (const character of hrp) expanded.push(character.charCodeAt(0) >> 5);
  expanded.push(0);
  for (const character of hrp) expanded.push(character.charCodeAt(0) & 31);
  return expanded;
}

function polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index += 1) {
      if ((top >>> index) & 1) checksum ^= GENERATORS[index];
    }
  }
  return checksum >>> 0;
}

function convertBits(values, fromBits, toBits, pad) {
  let accumulator = 0;
  let bits = 0;
  const output = [];
  const maxValue = (1 << toBits) - 1;
  const maxAccumulator = (1 << (fromBits + toBits - 1)) - 1;
  for (const value of values) {
    if (value < 0 || value >>> fromBits !== 0) fail("invalid_character", "Value outside the source bit range");
    accumulator = ((accumulator << fromBits) | value) & maxAccumulator;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      output.push((accumulator >>> bits) & maxValue);
    }
  }
  if (pad) {
    if (bits > 0) output.push((accumulator << (toBits - bits)) & maxValue);
  } else if (bits >= fromBits || ((accumulator << (toBits - bits)) & maxValue) !== 0) {
    fail("invalid_padding", "Non-zero or incomplete Bech32m padding");
  }
  return output;
}

function accountIdBytes(accountId) {
  if (typeof accountId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(accountId)) {
    fail("invalid_account_id", "AccountId must be a 0x-prefixed 32-byte hex value");
  }
  return Uint8Array.from({ length: 32 }, (_, index) => parseInt(accountId.slice(2 + index * 2, 4 + index * 2), 16));
}

export function encodeAddress(hrp, accountId) {
  if (!HRPS.has(hrp)) fail("invalid_hrp", "Expected mfcx or tmfcx");
  const payload = [VERSION, ...accountIdBytes(accountId)];
  const data = convertBits(payload, 8, 5, true);
  const checksumInput = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const checksum = polymod(checksumInput) ^ BECH32M;
  const checksumValues = [];
  for (let index = 0; index < 6; index += 1) checksumValues.push((checksum >>> (5 * (5 - index))) & 31);
  return `${hrp}1${[...data, ...checksumValues].map(value => CHARSET[value]).join("")}`;
}

export function decodeAddress(address) {
  if (typeof address !== "string") fail("invalid_length", "Address must be a string");
  for (const character of address) {
    const code = character.charCodeAt(0);
    if (code < 33 || code > 126) fail("invalid_character", "Address contains a non-ASCII character");
    if (character >= "A" && character <= "Z") fail("invalid_case", "MFCoin addresses must be lowercase");
  }
  const separator = address.lastIndexOf("1");
  const hrp = separator < 0 ? "" : address.slice(0, separator);
  if (!HRPS.has(hrp)) fail("invalid_hrp", "Expected mfcx or tmfcx");
  const encoded = address.slice(separator + 1);
  const data = [...encoded].map(character => {
    const value = CHARSET_INDEX.get(character);
    if (value === undefined) fail("invalid_character", `Invalid Bech32 character: ${character}`);
    return value;
  });
  if (address.length !== hrp.length + 60) fail("invalid_length", "Incorrect address length");
  if (polymod([...hrpExpand(hrp), ...data]) !== BECH32M) {
    fail("invalid_checksum", "Bech32m checksum mismatch");
  }
  const payload = convertBits(data.slice(0, -6), 5, 8, false);
  if (payload.length !== 33) fail("invalid_length", "Incorrect binary payload length");
  if (payload[0] !== VERSION) fail("invalid_version", "Unsupported address version");
  return {
    hrp,
    network: hrp === "mfcx" ? "mainnet" : "testnet",
    accountId: `0x${payload.slice(1).map(byte => byte.toString(16).padStart(2, "0")).join("")}`
  };
}

export function validateAddress(expectedHrp, address) {
  const decoded = decodeAddress(address);
  if (decoded.hrp !== expectedHrp) fail("network_mismatch", `Expected ${expectedHrp}, received ${decoded.hrp}`);
  return decoded.accountId;
}
