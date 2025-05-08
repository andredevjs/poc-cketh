use anyhow::Result;
use ic_agent::export::Principal;
use ic_agent::Agent;
use ic_utils::Canister;
use candid::{CandidType};
use serde::Deserialize;
use ethers_core::utils::{hex, keccak256};
use ethers_core::abi::ethereum_types::{Address, U256};
use ic_evm_utils::eth_send_raw_transaction::{contract_interaction, ContractDetails};
use evm_rpc_canister_types::{
    BlockTag, GetBlockByNumberResult, GetLogsArgs, GetLogsResult, HttpOutcallError,
    MultiGetBlockByNumberResult, MultiGetLogsResult, RejectionCode, RpcError, EVM_RPC,
    EvmRpcCanister
  };
#[derive(CandidType, Deserialize, Debug)]
enum PublicKeyResponse {
    /// matches `Err: text`
    Err(String),
    /// matches `Ok: record { public_key_hex: text }`
    Ok { public_key_hex: String },
}

pub fn pubkey_bytes_to_address(pubkey_bytes: &[u8]) -> String {
    use ethers_core::k256::elliptic_curve::sec1::ToEncodedPoint;
    use ethers_core::k256::PublicKey;

    let key =
        PublicKey::from_sec1_bytes(pubkey_bytes).expect("failed to parse the public key as SEC1");
    let point = key.to_encoded_point(false);
    // we re-encode the key to the decompressed representation.
    let point_bytes = point.as_bytes();
    assert_eq!(point_bytes[0], 0x04);

    let hash = keccak256(&point_bytes[1..]);

    ethers_core::utils::to_checksum(&Address::from_slice(&hash[12..32]), None)
}

#[tokio::main]
async fn main() -> Result<()> {
    // 1) Build the agent
    let agent = Agent::builder()
        .with_url("http://127.0.0.1:4943")
        .build()?;
    agent.fetch_root_key().await?;

    // 2) Wrap your canister
    let canister_id = Principal::from_text("bd3sg-teaaa-aaaaa-qaaba-cai")?;
    let canister = Canister::builder()
        .with_agent(&agent)
        .with_canister_id(canister_id)
        .build()?;

    let (pk_res,): (PublicKeyResponse,) = canister
        .update("public_key")
        .build()      // no `.with_arg()`
        .await?;     // yields `(PublicKeyResponse,)`

    // 5) match on the variant
    match pk_res {
        PublicKeyResponse::Ok { public_key_hex } => {
            println!("public_key → {}", public_key_hex);

            let pubkey_bytes = hex::decode(public_key_hex).unwrap();
            let pubkey_address = pubkey_bytes_to_address(&pubkey_bytes);
            println!("address → {}", pubkey_address);
        }
        PublicKeyResponse::Err(err) => {
            eprintln!("public_key returned error: {}", err);
        }
    }

    pub const CANISTER_ID: Principal =
    Principal::from_slice(b"\x00\x00\x00\x00\x02\x30\x00\xCC\x01\x01"); // 7hfb6-caaaa-aaaar-qadga-cai
    pub const EVM_RPC: EvmRpcCanister = EvmRpcCanister(CANISTER_ID);
   

    Ok(())
}
