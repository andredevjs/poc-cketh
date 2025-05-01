import { useEffect, useState } from 'react';
import { eth_bridge_poc_backend } from 'declarations/eth-bridge-poc-backend';
import { getEthereumAddress, principalToBytes32 } from './utils';
import { getTxDetails, getETHTransaction, broadcastTransaction, estimateGas, getFeeData } from './infura';
import { ethers } from 'ethers';
import { createTx } from '@ethereumjs/tx'
import { Common, Sepolia, Hardfork } from '@ethereumjs/common'

const DevJourneyPrincipal = 'fr33y-j5fe7-jcbom-vk5gq-6xupg-hvjn7-nagtz-jfxdf-fwouv-ffexu-jqe';
const OwnerPrincipal = 'udsqg-qo6cj-4agux-yt2kq-ke242-ylhwx-xio5v-nhsh3-dpjyj-sfqbi-kqe';


function App() {
  const [publicKey, setPublicKey] = useState('');
  const [address, setAddress] = useState('');
  const [tx, setTx] = useState({
    "accessList": [],
    "amount": "0.005",
    "blobVersionedHashes": null,
    "blockHash": "0xe87a63483a1370de7831d1705d5aae81fd9347ddcb286b6aaa7b406a5c28c6fc",
    "blockNumber": 8229106,
    "chainId": "11155111",
    "data": "0x",
    "from": "0x4BD55c4D51ba16420eD10c88fB87958d2107e5fA",
    "gasLimit": "21000",
    "gasPrice": "10168394376",
    "hash": "0x9e0fb0b9f0b7c2fda5f0ec676955f474103d24075b046613652735835445f77a",
    "index": 38,
    "maxFeePerBlobGas": null,
    "maxFeePerGas": "11896868724",
    "maxPriorityFeePerGas": "1500000000",
    "nonce": 0,
    "provider": {},
    "signature": {},
    "to": "0x23C5698148415a356c3c263730B799fd8FA07d11",
    "type": 2,
    "value": 5000000000000000n
  }
  );
  const [serializedTx, setSerializedTx] = useState('');

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

        const addr = getEthereumAddress(pb.public_key_hex);
        setAddress(addr);

      } catch(err) {
        console.log(err);
      }
    }

    fetchPublicKey();
  }, []);


  async function handleSubmit(event) {
    event.preventDefault();
   
    const principal = principalToBytes32(OwnerPrincipal);
    const subaccount = principalToBytes32(DevJourneyPrincipal);
    const amount = ethers.parseEther("0.01"); // Use the tx details to get the amount
    // const senderAddress = '0x23c5698148415a356c3c263730b799fd8fa07d11'

    const tx = await getETHTransaction(principal, subaccount, amount);
    const toSignTx = ethers.Transaction.from(tx).unsignedSerialized
    const result = await eth_bridge_poc_backend.sign(toSignTx);

    if (result.Err) {
      setError(result.Err);
      return;
    }

    const signatureHex = result.Ok.signature_hex;
    const signatureWithPrefix = "0x" + signatureHex;
    const signature = ethers.getBytes(signatureWithPrefix);

    // Step 2: Extract r, s, v from the signature
    const r = signature.slice(0, 32);  // First 32 bytes is r
    const s = signature.slice(32, 64); // Next 32 bytes is s
    const v = signature[64] || 27;  // Last byte is v (recovery id)

    // const feeData = await getFeeData();  // Fetch the current gas price from the network

    // Step 3: Create the signed transaction
    // const addedSignatureTx = ethers.Transaction.from({
    //   ...tx, // Copy all existing properties of the unsigned transaction

    //   // r: ethers.hexlify(r), 
    //   // s: ethers.hexlify(s),
    //   // v: v,

    //   chainId: 11155111, // const chainId = await provider.getNetwork().then(network => network.chainId);

    //   gasLimit: 54046,
    //   ...feeData,
    
    // });

    // const common = new Common({ chain: Sepolia, hardfork: Hardfork.London })
    // const signedTx = createTx(addedSignatureTx, { common }).addSignature(v,r,s);

    // const addedSignatureTxxx = ethers.Transaction.from({
    //   data:signedTx.data, // Copy all existing properties of the unsigned transaction
    //   value:signedTx.value,

    //   r: ethers.hexlify(r), 
    //   s: ethers.hexlify(s),
    //   v: v,

    //   chainId: 11155111, // const chainId = await provider.getNetwork().then(network => network.chainId);

    //   gasLimit: 54046,
    //   ...feeData,
    
    // });

    tx.signature = { r: ethers.hexlify(r), 
      s: ethers.hexlify(s),
      v: v,};
      
      tx.r = ethers.hexlify(r); 
      tx.s = ethers.hexlify(s);
      tx.v = v;

    // setLoading(true);

    debugger;
    const txHex = ethers.hexlify(ethers.Transaction.from(tx).serialized);
    const receipt = await broadcastTransaction(txHex);

    setSerializedTx(receipt);
    setLoading(false);
  }

  return (
    <main>
      <img src="/logo2.svg" alt="DFINITY logo" />
      <br />
      <br />
      <form action="#" onSubmit={handleSubmit}>
        <label htmlFor="tx">Enter your tx: &nbsp;</label>
        <input id="tx" alt="TX" type="text" defaultValue="0x9e0fb0b9f0b7c2fda5f0ec676955f474103d24075b046613652735835445f77a" />
        <button type="submit" disabled={loading}>{ loading ? 'Loading...' : 'Fund me!' }</button>
      </form>
      <section id="greeting">
        {publicKey === '' ? <p>Loading...</p> : <p>Public key: {' '}<span>{publicKey}</span></p>}
        {address && (<p>Address: {' '}<span>{address}</span></p>)}
        {serializedTx && (<p>Tx: {' '}<span>{serializedTx}</span></p>)}
      </section>

      {error && <p style={{color: 'red'}}>Error: {error}</p>}
    </main>
  );
}

export default App;
