import { useEffect, useState } from 'react';

import { eth_bridge_poc_backend } from 'declarations/eth-bridge-poc-backend';
import { ethers } from 'ethers';

const KEY= ''; // TODO: replace with your Infura key
const provider = new ethers.providers.JsonRpcProvider(`https://sepolia.infura.io/v3/${KEY}`);

const toEthHex = (text) => {
  return text.startsWith("0x") ? text : `0x${text}`;
}

function yParity(prehash, sig, pubkey) {
  // Normalize inputs to hex strings
  const hash = typeof prehash === "string" ? prehash : ethers.utils.hexlify(prehash);
  const sigHex = typeof sig === "string" ? sig : ethers.utils.hexlify(sig);
  const keyHex = typeof pubkey === "string" ? pubkey : ethers.utils.hexlify(pubkey);

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
        return {r, s,recoveryParam};
      }
    } catch (e) {
      // ignore invalid recovery attempts
    }
  }

  throw new Error(
    `yParity: failed to recover a matching key\n` +
    ` sig: ${sigHex}\n pubkey: ${keyHex}`
  );
}

 function getEthAddress (publicKey) {
  const key = publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`;
  const uncompressed = ethers.utils.computePublicKey(key, /* compressed = */ false);
  return ethers.utils.computeAddress(uncompressed);
}

function App() {
  const [publicKey, setPublicKey] = useState('');
  const [signerAddress, setSignerAddress] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPublicKey = async () => {
      try  {

        const result = await eth_bridge_poc_backend.public_key();
        if (result.Err) {
          setError(result.Err);
          return;
        }

        const pb = result.Ok;
        setPublicKey("0x" + pb.public_key_hex);

        const addr = getEthAddress(pb.public_key_hex);
        setSignerAddress(addr);

      } catch(err) {
        console.log(err);
      }
    }

    fetchPublicKey();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!signerAddress) {
      return;
    }

    setLoading(true);
   
    const amount = ethers.utils.parseEther("0.01"); 

    console.log("🔑 Derived address:", signerAddress);

    const [balance, feeData, network] = await Promise.all([
      provider.getBalance(signerAddress),
      provider.getFeeData(),
      provider.getNetwork()
    ]);

    console.log("🌐 Network:", network.name, "(chainId:", network.chainId + ")");
    console.log("💰 Balance:", ethers.utils.formatEther(balance), "ETH");

    const nonce = await provider.getTransactionCount(signerAddress) 
    const chainId = network.chainId;

    const tx = {
      type: 2,
      chainId,
      nonce,
      gasLimit: 53600,
      to:   '0x4BD55c4D51ba16420eD10c88fB87958d2107e5fA',
      value: amount,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas,
      accessList: [],
    };
 
    console.log('Unsigned transaction object:', JSON.stringify(tx));

    const unsignedSerialized = ethers.utils.serializeTransaction({...tx});
    console.log('Unsigned serialized tx:', unsignedSerialized);

    const digest = ethers.utils.keccak256(unsignedSerialized);
    console.log('Digest keccak256:', digest);

    const raw = await eth_bridge_poc_backend.sign(digest);

    const rawSignature = toEthHex(raw.Ok.signature_hex);
    const {r,s,recoveryParam} = yParity(digest, rawSignature, publicKey);
    const signatureHex = ethers.utils.joinSignature({ r,s, recoveryParam });

    const recoveredPubkey = ethers.utils.recoverPublicKey(digest, signatureHex);
    const recoveredAddress = ethers.utils.computeAddress(recoveredPubkey);
    console.log('Recovered public key:', recoveredPubkey);
    console.log('Recovered address:', recoveredAddress);

    if (recoveredAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error('Recovered address does not match signer address');
    }
    
    const txHex = ethers.utils.serializeTransaction(tx,  signatureHex);
    console.log("Full serialized transaction (txHex):", txHex);

    const parsedTransaction = ethers.utils.parseTransaction(txHex);
    console.log("From address (after signing):", parsedTransaction.from);

    setLoading(false);
  }

  return (
    <main>
      <img src="/logo2.svg" alt="DFINITY logo" />
      <br />
      <br />
      <form action="#" onSubmit={handleSubmit}>
        <button type="submit" disabled={loading || !signerAddress}>{ loading ? 'Loading...' : 'Fund me!' }</button>
      </form>
      <section id="greeting">
        {publicKey === '' ? <p>Loading...</p> : <p>Public key: {' '}<span>{publicKey}</span></p>}
        {signerAddress && (<p>Address: {' '}<span>{signerAddress}</span></p>)}
      </section>

      {error && <p style={{color: 'red'}}>Error: {error}</p>}
    </main>
  );
}

export default App;
