const KEY= 'e03dc628ed9a49aea610cb385defe991';
import { ethers } from 'ethers';

// Connect to an Ethereum provider (Infura, Alchemy, or public)
const provider = new ethers.JsonRpcProvider(`https://sepolia.infura.io/v3/${KEY}`);
const HANDLER_CONTRACT_ADDRESS = '0x2D39863d30716aaf2B7fFFd85Dd03Dda2BFC2E38';
const ERC20_ABI = [{"inputs":[{"internalType":"address","name":"_minterAddress","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"address","name":"target","type":"address"}],"name":"AddressEmptyCode","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"AddressInsufficientBalance","type":"error"},{"inputs":[],"name":"FailedInnerCall","type":"error"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"erc20ContractAddress","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":true,"internalType":"bytes32","name":"principal","type":"bytes32"},{"indexed":false,"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"ReceivedEthOrErc20","type":"event"},{"inputs":[{"internalType":"address","name":"erc20Address","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes32","name":"principal","type":"bytes32"},{"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"depositErc20","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"principal","type":"bytes32"},{"internalType":"bytes32","name":"subaccount","type":"bytes32"}],"name":"depositEth","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[],"name":"getMinterAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}];

export async function getTxDetails(hash) {
  const tx = await provider.getTransaction(hash);
  
  if (!tx) {
    console.log('Transaction not found');
    return;
  }

  const amount = ethers.formatEther(tx.value); // convert wei to ETH

  return {
      ...tx,
      amount,
  }
}

export const getETHTransaction = async (principal, subaccount, amount) => {
    const contract = new ethers.Contract(HANDLER_CONTRACT_ADDRESS, ERC20_ABI, provider);
    const txData = await contract.depositEth.populateTransaction(
      principal,
      subaccount,
      {
        value: amount
      },
      
    );

    return txData;
  };

  export const estimateGas = async (txHex) => {
    const tx = await provider.getTransaction(txHex);
    const gasLimit = await provider.estimateGas(tx);
    return gasLimit;
  };

  export const getFeeData = async () => {
    const feeData = await provider.getFeeData();
    console.log(feeData)
    return feeData;
  };


  export async function broadcastTransaction(txHex) {
    try {
      const txResponse = await provider.broadcastTransaction(txHex);
      console.log('Transaction Hash:', txResponse);
      
      // Wait for the transaction to be mined
      const receipt = await txResponse.wait();
      console.log('Transaction mined in block:', receipt.blockNumber);

      return receipt.blockNumber;
    } catch (err) {
      console.error('Error broadcasting transaction:', err);
    }
  }