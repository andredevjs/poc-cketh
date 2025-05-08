import { useEffect, useState } from 'react';

import { eth_bridge_poc_backend } from 'declarations/eth-bridge-poc-backend';
import { ethers } from 'ethers';
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { parseEther } from "viem"
import { useSendTransaction, useWaitForTransactionReceipt } from "wagmi"
import { Principal } from '@dfinity/principal';
import { Buffer } from 'buffer';

const KEY= ''; // TODO: replace with your Infura key
const provider = new ethers.providers.JsonRpcProvider(`https://sepolia.infura.io/v3/${KEY}`);
const DevJourneyPrincipal = 'fr33y-j5fe7-jcbom-vk5gq-6xupg-hvjn7-nagtz-jfxdf-fwouv-ffexu-jqe';
const OwnerPrincipal = 'udsqg-qo6cj-4agux-yt2kq-ke242-ylhwx-xio5v-nhsh3-dpjyj-sfqbi-kqe';

const HANDLER_CONTRACT_ADDRESS = '0x2D39863d30716aaf2B7fFFd85Dd03Dda2BFC2E38';
const ERC20_ABI = [{"inputs":[{"internalType":"address","name":"_minterAddress","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"address","name":"target","type":"address"}],"name":"AddressEmptyCode","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"AddressInsufficientBalance","type":"error"},{"inputs":[],"name":"FailedInnerCall","type":"error"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"erc20ContractAddress","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":true,"internalType":"bytes32","name":"principal","type":"bytes32"},{"indexed":false,"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"ReceivedEthOrErc20","type":"event"},{"inputs":[{"internalType":"address","name":"erc20Address","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes32","name":"principal","type":"bytes32"},{"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"depositErc20","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"principal","type":"bytes32"},{"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"depositEth","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"getMinterAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}];

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
  const bytes32Hex = '0x' + Buffer.from(padded).toString('hex');


  return bytes32Hex;
}

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
  const [signerBalance, setSignerBalance] = useState(0);
  const [mintTxHash, setMintTxHash] = useState();
  const [mintTx, setMintTx] = useState();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { address } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect();
  const { 
    data: hash,
    error: hashError,
    isPending,
    sendTransaction
  } = useSendTransaction();

  const { 
    isLoading: isConfirming,
    isSuccess: isConfirmed 
  } = useWaitForTransactionReceipt({
    hash
  });

  useEffect(() => {
    async function fetchMintTxHash() {
      if (!mintTxHash) {
        return;
      }

      const tx = await provider.getTransaction(mintTxHash);
      setMintTx(tx);
    }
   
    fetchMintTxHash();
  }, [mintTxHash]);

  useEffect(() => {
    if (hashError) {
      setError(hashError?.message);
    }
  }, [hashError]);

  useEffect(() => {
    const fetchPublicKey = async () => {
      try  {

        const result = await eth_bridge_poc_backend.public_key();
        if (result.Err) {
          setError(result.Err);
          return;
        }

        const pb = result.Ok;
        setPublicKey(toEthHex(pb.public_key_hex));

        const addr = await getEthAddress(pb.public_key_hex);
        setSignerAddress(addr);

        const balance = await provider.getBalance(addr);
        setSignerBalance( ethers.utils.formatEther(balance) );

      } catch(err) {
        console.log(err);
      }
    }

    fetchPublicKey();
  }, []);

  const handleContractCall = async () => {
      if (!signerAddress) {
        return;
      }

    setLoading(true);
  
    const [balance, feeData, network] = await Promise.all([
      provider.getBalance(signerAddress),
      provider.getFeeData(),
      provider.getNetwork()
    ]);

    console.log("🌐 Network:", network.name, "(chainId:", network.chainId + ")");
    console.log("💰 Balance:", ethers.utils.formatEther(balance), "ETH");

    const nonce = await provider.getTransactionCount(signerAddress) 
    const chainId = network.chainId;
    const contract = new ethers.Contract(HANDLER_CONTRACT_ADDRESS, ERC20_ABI, provider);
    const txHash = '0x9cebf3130ea4353ff75641ca6025535669f0850b417dba2a695aba0d08d45104'// "0x2e893eea32b981b54a25c4fbf6e2f7a5c5c39f55e8c4c9b6cd4e5c9b8d2f1a2";
    const txData = await provider.getTransaction(txHash);
    const amount = txData.value;


    const contractTx  = await contract.populateTransaction.depositEth(
        principalToBytes32(OwnerPrincipal), 
        principalToBytes32(DevJourneyPrincipal),
        {
            value: amount,
            nonce,
        }
    );

    const tx = {
      ...contractTx,
      chainId,
      type: 2,
      gasLimit: 53600,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas,
      accessList: [],
    }
 
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

    const txResponse = await provider.sendTransaction(txHex);
    console.log('Transaction Hash:', txResponse);
    setMintTxHash(txResponse.hash);

    // Wait for the transaction to be mined
    const receipt = await txResponse.wait();
    console.log('Transaction mined in block:', receipt.blockNumber);

    setLoading(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await handleContractCall();
    return;
    if (!signerAddress) {
      return;
    }

    try {
      sendTransaction({
        to: signerAddress, 
        value: parseEther("0.015"),
        // chainId: 11155111
      });
    } catch(e) {
      console.error(e);
    }
  
  }

  useEffect(() => {
    if (!isConfirmed) {
      return;
    }

    // handleContractCall();
  }, [isConfirmed]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center justify-center px-36 py-12 space-y-10">
      <div className="w-full max-w-md space-y-4">
        {address ? (
          <div className="bg-gray-800 rounded-2xl p-6 shadow-lg space-y-4">
            <button
              onClick={() => disconnect()}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl transition"
            >
              Disconnect
            </button>
            <p className="text-sm text-gray-300 break-words">{address}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl transition"
              >
                {connector.name}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <form
        action="#"
        onSubmit={handleSubmit}
        className="w-full max-w-md flex justify-center"
      >
        <button
          type="submit"
          disabled={loading || !signerAddress || isPending}
          className="bg-green-600 cursor-pointer hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 px-6 rounded-xl transition"
        >
          {loading ? 'Loading...' : 'Convert (Eth -> ckEth)'}
        </button>

        {hash && (
          <div className="w-full max-w-md bg-gray-800 text-sm text-white rounded-xl shadow-md p-4 space-y-2">
            <h1>Deposit Transaction</h1>
            <p className="break-all">
              <span className="text-gray-400">Transaction Hash:</span> <a href={`https://sepolia.etherscan.io/tx/${hash}`} target='_blank' className="font-mono text-green-400">{hash}</a>
            </p>
            {isConfirming && (
              <div className="text-yellow-400 animate-pulse">⏳ Waiting for confirmation...</div>
            )}
            {isConfirmed && (
              <div className="text-green-500 font-semibold">✅ Transaction confirmed!</div>
            )}
          </div>
        )}

        {mintTx && (
          <div className="w-full max-w-md bg-gray-800 text-sm text-white rounded-xl shadow-md p-4 space-y-2">
            <h1>Mint Transaction</h1>
            <p className="break-all">
              <span className="text-gray-400">Transaction Hash:</span> <a href={`https://sepolia.etherscan.io/tx/${mintTx.hash}`} target='_blank'  className="font-mono text-green-400">{mintTx.hash}</a>
            </p>
            {mintTx.confirmations <= 0 && (
              <div className="text-yellow-400 animate-pulse">⏳ Waiting for confirmation...</div>
            )}
            {mintTx.confirmations > 0 && (
              <div className="text-green-500 font-semibold">✅ Transaction confirmed!</div>
            )}
          </div>
        )}
      </form>

      <section
        id="greeting"
        className="text-center space-y-2 text-sm text-gray-300"
      >
        <h1>Canister info:</h1>
        {publicKey === '' ? (
          <p>Loading...</p>
        ) : (
          <p>
            Public key: <span className="font-mono text-green-400">{publicKey}</span>
          </p>
        )}
        {signerAddress && (
          <>
          <p>
            Address: <a href={`https://sepolia.etherscan.io/address/${signerAddress}`} target='_blank' className="font-mono text-blue-400">{signerAddress}</a>
          </p>
          <p>
          Balance: <span className="font-mono text-blue-400">{signerBalance}</span> ETH
        </p>
        </>
        )}
      </section>

      {error && <p className="text-red-500 text-sm">Error: {error}</p>}
</main>
  );
}

export default App;
