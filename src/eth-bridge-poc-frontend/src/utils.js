import { Principal } from "@dfinity/principal";
import { Buffer } from "buffer";
import { ethers } from "ethers";

function principalToBytes32(principalStr) {
  // Step 1: Convert the principal to bytes
  const principal = Principal.fromText(principalStr);

  // Step 2: Add the length byte (0x1d for this principal)
  const principalBytes = principal.toUint8Array();
  const lengthPrefix = new Uint8Array([principalBytes.length]); // The first byte is the length of the principal
  const fullBytes = new Uint8Array(1 + principalBytes.length);
  fullBytes.set(lengthPrefix, 0); // Set the length byte
  fullBytes.set(principalBytes, 1); // Set the actual principal bytes

  // Step 3: Right-pad to 32 bytes
  const padded = new Uint8Array(32);
  padded.set(fullBytes);

  // Step 4: Convert to 0x-prefixed hex string
  const bytes32Hex = "0x" + Buffer.from(padded).toString("hex");

  return bytes32Hex;
}

const toEthHex = (text) => {
  return text.startsWith("0x") ? text : `0x${text}`;
};

function yParity(prehash, sig, pubkey) {
  // Normalize inputs to hex strings
  const hash =
    typeof prehash === "string" ? prehash : ethers.utils.hexlify(prehash);
  const sigHex = typeof sig === "string" ? sig : ethers.utils.hexlify(sig);
  const keyHex =
    typeof pubkey === "string" ? pubkey : ethers.utils.hexlify(pubkey);

  // Get the full, uncompressed reference key ("0x04..." + X + Y)
  const origKey = ethers.utils.computePublicKey(keyHex, false);

  // r is bytes 0–32, s is bytes 32–64
  const r = "0x" + sigHex.slice(2, 66);
  const s = "0x" + sigHex.slice(66, 130);

  for (let recoveryParam = 0; recoveryParam <= 1; recoveryParam++) {
    // Build a full 65-byte signature object
    const fullSig = ethers.utils.joinSignature({ r, s, recoveryParam });

    try {
      // Try to recover the public key
      const recovered = ethers.utils.recoverPublicKey(hash, fullSig);

      if (recovered.toLowerCase() === origKey.toLowerCase()) {
        return { r, s, recoveryParam };
      }
    } catch (e) {
      // ignore invalid recovery attempts
    }
  }

  throw new Error(
    `yParity: failed to recover a matching key\n` +
      ` sig: ${sigHex}\n pubkey: ${keyHex}`,
  );
}

function getEthAddress(publicKey) {
  const key = publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`;
  const uncompressed = ethers.utils.computePublicKey(
    key,
    /* compressed = */ false,
  );
  return ethers.utils.computeAddress(uncompressed);
}

export { principalToBytes32, toEthHex, yParity, getEthAddress };
