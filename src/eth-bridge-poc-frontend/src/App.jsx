import { useEffect, useState } from "react";

import { eth_bridge_poc_backend } from "declarations/eth-bridge-poc-backend";
import { ethers } from "ethers";
import { useAccount, useConnect, useDisconnect, useWriteContract } from "wagmi";
import { parseEther, parseUnits } from "viem";
import { useSendTransaction } from "wagmi";
import { principalToBytes32, toEthHex, yParity, getEthAddress } from "./utils";

import ERC20_ABI from "./abi/ERC20_ABI";
import USDC_ABI from "./abi/USDC_ABI";

const provider = new ethers.providers.JsonRpcProvider(
  `https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_KEY}`,
);

const DevJourneyPrincipal =
  "fr33y-j5fe7-jcbom-vk5gq-6xupg-hvjn7-nagtz-jfxdf-fwouv-ffexu-jqe";
const OwnerPrincipal =
  "udsqg-qo6cj-4agux-yt2kq-ke242-ylhwx-xio5v-nhsh3-dpjyj-sfqbi-kqe";

const HANDLER_CONTRACT_ADDRESS = "0x2D39863d30716aaf2B7fFFd85Dd03Dda2BFC2E38";
const USDC_CONTRACT_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const TX_TYPES = {
  ETH: "eth",
  USDC: "usdc",
  APPROVE_USDC: "approve_usdc",
};

const contract = new ethers.Contract(
  HANDLER_CONTRACT_ADDRESS,
  ERC20_ABI,
  provider,
);

const usdcContract = new ethers.Contract(
  USDC_CONTRACT_ADDRESS,
  USDC_ABI,
  provider,
);

function App() {
  const [publicKey, setPublicKey] = useState("");
  const [signerAddress, setSignerAddress] = useState("");
  const [signerBalance, setSignerBalance] = useState(0);

  const [mintTx, setMintTx] = useState();
  const [depositTx, setDepositTx] = useState();
  const [approvalTx, setApprovalTx] = useState();

  const [minting, setMinting] = useState(false);
  const [depositing, setDepositing] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { address } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();

  const { sendTransactionAsync } = useSendTransaction();

  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
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
        setSignerBalance(ethers.utils.formatEther(balance));
      } catch (err) {
        console.error(err);
        if (err.message) {
          setError(err.message);
        }
      }
    };

    fetchPublicKey();
  }, [
    depositTx?.confirmations,
    approvalTx?.confirmations,
    mintTx?.confirmations,
  ]);

  const getContractCall = ({ type, tx }) => {
    if (type === TX_TYPES.ETH) {
      return contract.populateTransaction.depositEth(
        principalToBytes32(OwnerPrincipal),
        principalToBytes32(DevJourneyPrincipal),
        {
          value: tx.value,
        },
      );
    }

    const iface = new ethers.utils.Interface(USDC_ABI);
    const decoded = iface.decodeFunctionData("transfer", tx.data);
    // if (decoded[0] !== HANDLER_CONTRACT_ADDRESS || tx.to !== USDC_CONTRACT_ADDRESS) {
    //   throw new Error("Invalid contract address");
    // }

    if (type === TX_TYPES.APPROVE_USDC) {
      return usdcContract.populateTransaction.approve(
        HANDLER_CONTRACT_ADDRESS,
        decoded[1],
      );
    }

    return contract.populateTransaction.depositErc20(
      USDC_CONTRACT_ADDRESS,
      decoded[1] / 10 ** 6,
      principalToBytes32(OwnerPrincipal),
      principalToBytes32(DevJourneyPrincipal),
    );
  };

  const handleContractCall = async ({ type, depositTx }) => {
    if (!signerAddress) {
      return;
    }

    setLoading(true);
    setMinting(true);

    const [balance, feeData, network] = await Promise.all([
      provider.getBalance(signerAddress),
      provider.getFeeData(),
      provider.getNetwork(),
    ]);

    console.log(
      "🌐 Network:",
      network.name,
      "(chainId:",
      network.chainId + ")",
    );
    console.log("💰 Balance:", ethers.utils.formatEther(balance), "ETH");

    const nonce = await provider.getTransactionCount(signerAddress);
    const chainId = network.chainId;
    const contractTx = await getContractCall({ type, tx: depositTx });

    const tx = {
      ...contractTx,
      chainId,
      type: 2,
      nonce,
      gasLimit: 53600 * 2, // approve contract call is more expensive
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas,
      accessList: [],
    };

    console.log("Unsigned transaction object:", JSON.stringify(tx));

    const unsignedSerialized = ethers.utils.serializeTransaction({ ...tx });
    console.log("Unsigned serialized tx:", unsignedSerialized);

    const digest = ethers.utils.keccak256(unsignedSerialized);
    console.log("Digest keccak256:", digest);

    const raw = await eth_bridge_poc_backend.sign(digest);

    const rawSignature = toEthHex(raw.Ok.signature_hex);
    const { r, s, recoveryParam } = yParity(digest, rawSignature, publicKey);
    const signatureHex = ethers.utils.joinSignature({ r, s, recoveryParam });

    const recoveredPubkey = ethers.utils.recoverPublicKey(digest, signatureHex);
    const recoveredAddress = ethers.utils.computeAddress(recoveredPubkey);
    console.log("Recovered public key:", recoveredPubkey);
    console.log("Recovered address:", recoveredAddress);

    if (recoveredAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error("Recovered address does not match signer address");
    }

    const txHex = ethers.utils.serializeTransaction(tx, signatureHex);
    console.log("Full serialized transaction (txHex):", txHex);

    const parsedTransaction = ethers.utils.parseTransaction(txHex);
    console.log("From address (after signing):", parsedTransaction.from);

    const txResponse = await provider.sendTransaction(txHex);
    console.log("Transaction Hash:", txResponse);

    if (type === TX_TYPES.APPROVE_USDC) {
      setApprovalTx(txResponse);
    } else {
      setMintTx(txResponse);
    }

    // Wait for the transaction to be mined
    const receipt = await txResponse.wait();
    console.log("Transaction mined in block:", receipt);

    if (type === TX_TYPES.APPROVE_USDC) {
      setApprovalTx({ ...txResponse, confirmations: receipt.confirmations });
    } else {
      setMintTx({ ...txResponse, confirmations: receipt.confirmations });
    }

    setMinting(false);
    setLoading(false);
  };

  async function handleEthSubmit(event) {
    event.preventDefault();
    if (!signerAddress) {
      return;
    }

    setDepositTx(null);
    setApprovalTx(null);
    setMintTx(null);

    setDepositing(true);

    try {
      const depositHash = await sendTransactionAsync({
        to: signerAddress,
        value: parseEther("0.015"),
      });

      const tx = await provider.getTransaction(depositHash);
      setDepositTx(tx);

      const receipt = await tx.wait();
      setDepositTx({ ...tx, confirmations: receipt.confirmations });

      // Let's MINT woot woot
      await handleContractCall({ type: TX_TYPES.ETH, depositTx: tx });
    } catch (err) {
      console.error(err);
      if (err.message) {
        setError(err.message);
      }
    } finally {
      setDepositing(false);
    }
  }

  async function handleUsdcSubmit(event) {
    event.preventDefault();
    if (!signerAddress) {
      return;
    }

    setDepositTx(null);
    setApprovalTx(null);
    setMintTx(null);

    setDepositing(true);

    const network = await provider.getNetwork();
    try {
      const depositHash = await writeContractAsync({
        chainId: network.chainId,
        address: USDC_CONTRACT_ADDRESS,
        abi: USDC_ABI,
        functionName: "transfer",
        args: [signerAddress, parseUnits("1", 6)],
        wait: true,
      });

      const tx = await provider.getTransaction(depositHash);
      setDepositTx(tx);

      const receipt = await tx.wait();
      setDepositTx({ ...tx, confirmations: receipt.confirmations });

      // Let's approve the minter!
      await handleContractCall({ type: TX_TYPES.APPROVE_USDC, depositTx: tx });
      // Let's MINT woot woot
      await handleContractCall({ type: TX_TYPES.USDC, depositTx: tx });
    } catch (err) {
      console.error(err);
      if (err.message) {
        setError(err.message);
      }
    } finally {
      setDepositing(false);
    }
  }

  const TransactionBox = ({ tx, title }) => {
    return (
      <div className="w-full max-w-md bg-gray-800 text-sm text-white rounded-xl shadow-md p-4 space-y-2">
        <h1>{title}</h1>
        <p className="break-all">
          <span className="text-gray-400">Transaction Hash:</span>{" "}
          <a
            href={`https://sepolia.etherscan.io/tx/${tx.hash}`}
            target="_blank"
            className="font-mono text-green-400"
          >
            {tx.hash}
          </a>
        </p>
        {tx.confirmations <= 0 && (
          <div className="text-yellow-400 animate-pulse">
            ⏳ Waiting for confirmation...
          </div>
        )}
        {tx.confirmations > 0 && (
          <div className="text-green-500 font-semibold">
            ✅ Transaction confirmed!
          </div>
        )}
      </div>
    );
  };

  const WorkingBox = ({ title }) => {
    return (
      <div className="w-full max-w-md bg-gray-800 text-sm text-white rounded-xl shadow-md p-4 space-y-2">
        <div className="flex items-center justify-center">
          <div className="h-5 w-5 border-b-2 border-white animate-spin rounded-full"></div>
          <h1 className="ml-2">{title}...</h1>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white flex flex-col items-center  px-36 py-12">
      <div className="w-full max-w-md space-y-4">
        {address ? (
          <div className="bg-gray-800 rounded-2xl p-4 shadow-lg space-y-4">
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

      <form action="#" className="w-full flex justify-center">
        {address && (
          <div className="flex w-full gap-2 justify-center">
            <button
              type="button"
              onClick={handleEthSubmit}
              disabled={loading || !signerAddress}
              className="bg-blue-600 cursor-pointer hover:bg-blue-700 disabled:opacity-50 text-white text-md font-semibold py-1 px-6 rounded-xl transition"
            >
              {loading ? "Loading..." : "ETH -> ckEth"}
            </button>

            <button
              type="button"
              onClick={handleUsdcSubmit}
              disabled={loading || !signerAddress}
              className="bg-green-600 cursor-pointer hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 px-6 rounded-xl transition"
            >
              {loading ? "Loading..." : "USDC-> ckUsdc"}
            </button>
          </div>
        )}
        {depositTx && (
          <TransactionBox tx={depositTx} title="Deposit Transaction" />
        )}

        {approvalTx && (
          <TransactionBox tx={approvalTx} title="Approval Transaction" />
        )}

        {mintTx && <TransactionBox tx={mintTx} title="Mint Transaction" />}

        {minting && !mintTx && <WorkingBox title="Minting" />}

        {depositing && !depositTx && <WorkingBox title="Depositing" />}
      </form>

      <section
        id="greeting"
        className="text-center space-y-2 text-sm text-gray-300"
      >
        <h1>Canister info:</h1>
        {publicKey === "" ? (
          <p>Loading...</p>
        ) : (
          <p>
            Public key:{" "}
            <span className="font-mono text-green-400">{publicKey}</span>
          </p>
        )}
        {signerAddress && (
          <>
            <p>
              Address:{" "}
              <a
                href={`https://sepolia.etherscan.io/address/${signerAddress}`}
                target="_blank"
                className="font-mono text-blue-400"
              >
                {signerAddress}
              </a>
            </p>
            <p>
              Balance:{" "}
              <span className="font-mono text-blue-400">{signerBalance}</span>{" "}
              ETH
            </p>
          </>
        )}
      </section>

      {error && <p className="text-red-500 text-sm">Error: {error}</p>}
    </main>
  );
}

export default App;
