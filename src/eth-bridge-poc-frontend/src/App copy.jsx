import { useEffect, useState } from 'react';

import { eth_bridge_poc_backend } from 'declarations/eth-bridge-poc-backend';
import { ethers } from 'ethers';
import {Buffer} from 'buffer';

const KEY= 'f73cb9db4112430da6338705124793b4'; // TODO: replace with your Infura key
const provider = new ethers.providers.JsonRpcProvider(`https://sepolia.infura.io/v3/${KEY}`);

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
        setPublicKey(pb.public_key_hex);

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
   
    const amount = ethers.utils.parseEther("0.01"); 

    console.log("🔑 Derived address:", signerAddress);

    // 2) Fetch balance, fee data, and network in parallel
    const [balance, feeData, network] = await Promise.all([
      provider.getBalance(signerAddress),
      provider.getFeeData(),
      provider.getNetwork()
    ]);

    console.log("🌐 Network:", network.name, "(chainId:", network.chainId + ")");
    console.log("💰 Balance:", ethers.utils.formatEther(balance), "ETH");

    const nonce = await provider.getTransactionCount(signerAddress) 
    const chainId = Number(network.chainId);

    const tx = {
      type: 2,
      chainId,
      nonce,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas,
      gasLimit: 53600,
      to:    '0x4BD55c4D51ba16420eD10c88fB87958d2107e5fA',
      value: amount,
      gasPrice: null,
      accessList: [],
    };
    
    console.log('Unsigned transaction object:', tx);

    const unsignedSerialized = ethers.utils.serializeTransaction(tx);
    console.log('Unsigned serialized tx:', unsignedSerialized);

    const unsignedBytes = ethers.utils.arrayify(unsignedSerialized);
    const digest = ethers.utils.keccak256(unsignedSerialized);
    console.log('Digest being sent for signing:', digest);

    // 3) SHA-256 hash of those UTF-8 bytes
    const sha256OfHex = ethers.utils.sha256(digest);
    console.log("SHA256(utf8) digest:", sha256OfHex);
    // 83045984785c9c331820356d00518232ddfd94c1e39da491a2fe5be826cee80c
    // 0x3a1027da644f02903708078bf33f7253c3f7a5b400f12abc5b1fc99a059c9f8c

    const result = await eth_bridge_poc_backend.sign(digest);
    const signatureHex ='0x' + result.Ok.signature_hex;
    
    const recoveredPubkey = ethers.utils.recoverPublicKey(digest, signatureHex);
    const recoveredAddress = ethers.utils.computeAddress(recoveredPubkey);
    console.log('Recovered public key:', recoveredPubkey);
    console.log('Recovered address:', recoveredAddress);

    if (recoveredAddress !== signerAddress) {
      console.error('Recovered address does not match signer address');
    }

    const signature = ethers.utils.splitSignature(signatureHex);
    const txHex = ethers.utils.serializeTransaction(tx, signature);
    console.log("Full serialized transaction (txHex):", txHex);

    const parsedTransaction = ethers.utils.parseTransaction(txHex);
    console.log(parsedTransaction);
    console.log("From address (after signing):", parsedTransaction.from);
    
    const txResponse = await provider.sendTransaction(txHex);
    console.log('Transaction Hash:', txResponse);
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
