import { useEffect, useState } from 'react';

import { eth_bridge_poc_backend } from 'declarations/eth-bridge-poc-backend';
import { ethers } from 'ethers';
import { serialize } from "@ethersproject/transactions";
import { keccak256 } from "@ethersproject/keccak256";
import  {computePublicKey} from "@ethersproject/signing-key";
import { Principal } from '@dfinity/principal';
import { Buffer } from 'buffer';

const KEY= 'e03dc628ed9a49aea610cb385defe991';
const provider = new ethers.JsonRpcProvider(`https://sepolia.infura.io/v3/${KEY}`);
const HANDLER_CONTRACT_ADDRESS = '0x2D39863d30716aaf2B7fFFd85Dd03Dda2BFC2E38';
const ERC20_ABI = [{"inputs":[{"internalType":"address","name":"_minterAddress","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"address","name":"target","type":"address"}],"name":"AddressEmptyCode","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"AddressInsufficientBalance","type":"error"},{"inputs":[],"name":"FailedInnerCall","type":"error"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"erc20ContractAddress","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":true,"internalType":"bytes32","name":"principal","type":"bytes32"},{"indexed":false,"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"ReceivedEthOrErc20","type":"event"},{"inputs":[{"internalType":"address","name":"erc20Address","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes32","name":"principal","type":"bytes32"},{"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"depositErc20","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"principal","type":"bytes32"},{"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"depositEth","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"getMinterAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}];
const contract = new ethers.Contract(HANDLER_CONTRACT_ADDRESS, ERC20_ABI, provider);

const DevJourneyPrincipal = 'fr33y-j5fe7-jcbom-vk5gq-6xupg-hvjn7-nagtz-jfxdf-fwouv-ffexu-jqe';
const OwnerPrincipal = 'udsqg-qo6cj-4agux-yt2kq-ke242-ylhwx-xio5v-nhsh3-dpjyj-sfqbi-kqe';

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

 function getEthAddress (publicKey) {
    // 1) decompress to uncompressed form (prefix 0x04)
  //    if pubkeyBytes is already uncompressed it just normalizes it
  const key = publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`;
  const uncompressed = computePublicKey(key, /* compressed = */ false);

  // 2) computeAddress does exactly:
  //    keccak256(uncompressed.slice(1)) → take last 20 bytes → toChecksumAddress
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
   
    const principal = principalToBytes32(OwnerPrincipal);
    const subaccount = principalToBytes32(DevJourneyPrincipal);
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

    const tx = await contract.depositEth.populateTransaction(
      principal,
      subaccount,
      {
        value: amount,
        gasLimit: 23600,
        gasPrice: feeData.gasPrice,
      },
    );
   
    const unsignedSerialized = serialize(tx);
    const unsignedBytes = ethers.getBytes(unsignedSerialized);
    const digest = keccak256(unsignedBytes);

    const result = await eth_bridge_poc_backend.sign(digest);

    const signatureHex ='0x' + result.Ok.signature_hex;
    const signature = ethers.Signature.from(signatureHex);

    const txHex = serialize({...tx}, signature);
    console.log(ethers.Transaction.from(txHex).from);

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
