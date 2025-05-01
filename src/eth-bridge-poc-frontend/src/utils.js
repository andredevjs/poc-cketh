import { keccak256 } from 'js-sha3';
import { Buffer } from 'buffer';
import { Principal } from '@dfinity/principal';

export function getEthereumAddress(publicKey) {
  // Ensure the public key is uncompressed and starts with '04'
  const uncompressedPublicKey = publicKey.startsWith('04') ? publicKey : '04' + publicKey;

  // Remove the '04' prefix
  const publicKeyWithoutPrefix = uncompressedPublicKey.slice(2);

  // Hash the public key using keccak256
  const publicKeyHash = keccak256(Buffer.from(publicKeyWithoutPrefix, 'hex'));

  // Get the last 20 bytes of the hash
  const addressBytes = publicKeyHash.slice(-40);

  // Add the '0x' prefix to create the Ethereum address
  const ethereumAddress = '0x' + addressBytes;

  return ethereumAddress;
}

export function principalToBytes32(principalStr) {
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
    const bytes32Hex = '0x' + Buffer.from(padded).toString('hex');


    return bytes32Hex;
}

