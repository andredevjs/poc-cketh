import { useEffect, useState } from 'react';

import { eth_bridge_poc_backend } from 'declarations/eth-bridge-poc-backend';
import { ethers } from 'ethers';
import { serialize } from "@ethersproject/transactions";
import { keccak256 } from "@ethersproject/keccak256";
import  {computePublicKey} from "@ethersproject/signing-key";

const KEY= ''; // TODO: replace with your Infura key
const provider = new ethers.JsonRpcProvider(`https://sepolia.infura.io/v3/${KEY}`);

 function getEthAddress (publicKey) {
  const key = publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`;
  const uncompressed = computePublicKey(key, /* compressed = */ false);
  return ethers.computeAddress(uncompressed);
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
   
    const amount = ethers.parseEther("0.01"); 

    console.log("🔑 Derived address:", signerAddress);

    // 2) Fetch balance, fee data, and network in parallel
    const [balance, feeData, network] = await Promise.all([
      provider.getBalance(signerAddress),
      provider.getFeeData(),
      provider.getNetwork()
    ]);

    console.log("🌐 Network:", network.name, "(chainId:", network.chainId + ")");
    console.log("💰 Balance:", ethers.formatEther(balance), "ETH");

    const tx = {
      to:    '0x4BD55c4D51ba16420eD10c88fB87958d2107e5fA',
      value: amount,
      gasLimit: 23600,
      gasPrice: feeData.gasPrice,
    };
    console.log('Unsigned transaction object:', tx);

    const unsignedSerialized = serialize(tx);
    console.log('Unsigned serialized tx:', unsignedSerialized);

    const unsignedBytes = ethers.getBytes(unsignedSerialized);
    const digest = keccak256(unsignedBytes);
    console.log('Digest being sent for signing:', digest);

    const result = await eth_bridge_poc_backend.sign(digest);

    const signatureHex ='0x' + result.Ok.signature_hex;
    console.log('Signed tx hex:', signatureHex);

    const signature = ethers.Signature.from(signatureHex);
    const { r, s, v } = signature;
    console.log('Signature components:',  { r, s, v });

    const recovered = ethers.recoverAddress(digest, signature);
    console.log('Recovered address:', recovered);

    const txHex = serialize({...tx}, signature);
    console.log("Full serialized transaction (txHex):", txHex);
    console.log("From address (after signing):", ethers.Transaction.from(txHex).from);

    const txResponse = await provider.broadcastTransaction(txHex);
    console.log('Transaction Hash:', txResponse);
    
    // Wait for the transaction to be mined
    const receipt = await txResponse.wait();
    console.log('Transaction mined in block:', receipt.blockNumber);

    setLoading(false);
  }

  return (
    <main>
      <img src="/logo2.svg" alt="DFINITY logo" />
      <br />
      <br />
      <form action="#" onSubmit={handleSubmit}>
        <button type="submit" disabled={loading}>{ loading ? 'Loading...' : 'Fund me!' }</button>
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
