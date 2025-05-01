// ECDSA.mo
import Principal "mo:base/Principal";
import Blob "mo:base/Blob";
import Error "mo:base/Error";
import Hex "./Hex";
import SHA256 "./SHA256";
import Cycles "mo:base/ExperimentalCycles";
import Text "mo:base/Text";

module {
  // Define IC management canister interface type
  type IC = actor {
    ecdsa_public_key : ({
      canister_id : ?Principal;
      derivation_path : [Blob];
      key_id : { curve: { #secp256k1; } ; name: Text };
    }) -> async ({ public_key : Blob; chain_code : Blob; });

    sign_with_ecdsa : ({
      message_hash : Blob;
      derivation_path : [Blob];
      key_id : { curve: { #secp256k1; } ; name: Text };
    }) -> async ({ signature : Blob });
  };

  let ic : IC = actor("aaaaa-aa");

  public func getPublicKey(caller: Principal) : async { #Ok : { public_key_hex: Text }; #Err : Text } {
    try {
      let { public_key } = await ic.ecdsa_public_key({
        canister_id = null;
        derivation_path = [Principal.toBlob(caller)];
        key_id = { curve = #secp256k1; name = "dfx_test_key" };
      });
      #Ok({ public_key_hex = Hex.encode(Blob.toArray(public_key)) })
    } catch (err) {
      #Err(Error.message(err))
    }
  };

  public func signMessage(caller: Principal, message: Text) : async { #Ok : { signature_hex: Text }; #Err : Text } {
    try {
      let message_hash: Blob = Blob.fromArray(SHA256.sha256(Blob.toArray(Text.encodeUtf8(message))));
      Cycles.add<system>(30_000_000_000);
      let { signature } = await ic.sign_with_ecdsa({
        message_hash;
        derivation_path = [Principal.toBlob(caller)];
        key_id = { curve = #secp256k1; name = "dfx_test_key" };
      });
      #Ok({ signature_hex = Hex.encode(Blob.toArray(signature)) })
    } catch (err) {
      #Err(Error.message(err))
    }
  };
}
