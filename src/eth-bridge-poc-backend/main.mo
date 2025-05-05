// https://github.com/dfinity/examples/blob/master/motoko/threshold-ecdsa/src/ecdsa_example_motoko/main.mo

import Text       "mo:base/Text";
import Principal  "mo:base/Principal";
import Blob "mo:base/Blob";
import Error "mo:base/Error";
import Hex "./utils/Hex";
import SHA256 "./utils/SHA256";
import Cycles "mo:base/ExperimentalCycles";
import Debug      "mo:base/Debug";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Address "mo:evm-txs/Address";
import IcEcdsaApi "./utils/IcEcdsaApi";
import Types "mo:evm-txs/Types";
import Transaction "mo:evm-txs/Transaction";
import Context "mo:evm-txs/Context";

actor {

type User = {
  nonce: Nat64;
  address: Text;
  publicKey: [Nat8];
};


  // For testing, let's use a fixed principal.
  private let caller : Principal = Principal.fromText("udsqg-qo6cj-4agux-yt2kq-ke242-ylhwx-xio5v-nhsh3-dpjyj-sfqbi-kqe");
  let keyName = "dfx_test_key";
  let derivationPath = [ Principal.toBlob(caller) ];
  let users = HashMap.HashMap<Principal, User>(10, Principal.equal, Principal.hash);
  let icEcdsaApi = IcEcdsaApi.IcEcdsaApi();
   let ecCtx = Context.allocECMultContext(null);
   

  type IC = actor { 
    ecdsa_public_key : ({
      canister_id      : ?Principal;
      derivation_path : [Blob];
      key_id           : { curve: { #secp256k1 }; name: Text };
    }) -> async ({ public_key : Blob; chain_code : Blob; });

    sign_with_ecdsa : ({
      message_hash     : Blob;
      derivation_path : [Blob];
      key_id           : { curve: { #secp256k1 }; name: Text };
    }) -> async ({ signature : Blob });
  };

  public type CreateAddressResponse = {
        address: Text;
    };

    public type SignTransactionResponse = {
        tx: [Nat8];
        tx_text: Text;
    };
    
  let ic : IC = actor("aaaaa-aa");

  public shared(_msg) func create_address(): async Result.Result<CreateAddressResponse, Text> {
      switch(await* Address.create(keyName, derivationPath, icEcdsaApi)) {
          case (#err(msg)) {
              return #err(msg);
          };
          case (#ok(res)) {
              users.put(caller, {
                  nonce = 0;
                  address = res.0;
                  publicKey = res.1;
              });

              return #ok({
                  address = res.0;
              });
          };
      };
  };

  public shared(msg) func sign_evm_tx(
        tx: Types.TransactionType,
        chain_id: Nat64
    ): async Result.Result<SignTransactionResponse, Text> {
        let principalId = msg.caller;
        let derivationPath = [Principal.toBlob(principalId)];

        let user = switch(users.get(principalId)) {
            case null return #err("Unknown user");
            case (?key) key;
        };

        switch(await* Transaction.signTx(
            tx, chain_id, 
            keyName, derivationPath, user.publicKey, 
            ecCtx, icEcdsaApi)) {
            case (#err(msg)) {
                return #err(msg);
            };
            case (#ok(tx)) {
                return #ok({
                    tx = tx.1;
                    tx_text = "0x" # AU.toText(tx.1);
                });
            };
        };
    };

  public shared func public_key() : async { #Ok : { public_key_hex: Text }; #Err : Text } {
    try {
      
      let { public_key } = await ic.ecdsa_public_key({
          canister_id = null;
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = "dfx_test_key" };
      });
      #Ok({ public_key_hex = Hex.encode(Blob.toArray(public_key)) })
    } catch (err) {
      #Err(Error.message(err))
    }
  };

  public shared func sign(message: Text) : async { #Ok : { signature_hex: Text }; #Err : Text } {
    try {
      // 1) Show the raw hex-string you received
      Debug.print("⚙️ sign() message text: " # message);
      // sign() message text: 0xb7d7aa5487461969adfeb8497bbd71ac2a05f8741037ffecb9fd5c460847c14a


        // 2) UTF8-encode it exactly as IC does
      let utf8Bytes : Blob = Text.encodeUtf8(message);
      Debug.print("⚙️ UTF8 bytes (hex): " # Hex.encode(Blob.toArray(utf8Bytes)));

       // 3) SHA-256 hash of those bytes
      let hashArray : [Nat8] = SHA256.sha256(Blob.toArray(utf8Bytes));
      let message_hash : Blob  = Blob.fromArray(hashArray);
      Debug.print("⚙️ SHA256(utf8) digest: " # Hex.encode(Blob.toArray(message_hash)));

      let message_hashComparson: Blob = Blob.fromArray(SHA256.sha256(Blob.toArray(Text.encodeUtf8(message))));
      Debug.print("⚙️ Comparsion: " # Hex.encode(Blob.toArray( message_hashComparson )));

      Cycles.add<system>(30_000_000_000);
      let { signature } = await ic.sign_with_ecdsa({
          message_hash;
          derivation_path = derivationPath;
          key_id = { curve = #secp256k1; name = "dfx_test_key" };
      });
      #Ok({ signature_hex = Hex.encode(Blob.toArray(signature))})
    } catch (err) {
      #Err(Error.message(err))
    }
  };
}