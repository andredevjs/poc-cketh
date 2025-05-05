// https://github.com/dfinity/examples/blob/master/motoko/threshold-ecdsa/src/ecdsa_example_motoko/main.mo

import Text       "mo:base/Text";
import Principal  "mo:base/Principal";
import Blob "mo:base/Blob";
import Error "mo:base/Error";
import Hex "./utils/Hex";
import SHA256 "./utils/SHA256";
import Cycles "mo:base/ExperimentalCycles";
actor {
  // For testing, let's use a fixed principal.
  private let caller : Principal = Principal.fromText("udsqg-qo6cj-4agux-yt2kq-ke242-ylhwx-xio5v-nhsh3-dpjyj-sfqbi-kqe");

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

  let ic : IC = actor("aaaaa-aa");

  public shared func public_key() : async { #Ok : { public_key_hex: Text }; #Err : Text } {
    try {
      let { public_key } = await ic.ecdsa_public_key({
          canister_id = null;
          derivation_path = [ Principal.toBlob(caller) ];
          key_id = { curve = #secp256k1; name = "dfx_test_key" };
      });
      #Ok({ public_key_hex = Hex.encode(Blob.toArray(public_key)) })
    } catch (err) {
      #Err(Error.message(err))
    }
  };

  public shared func sign(message: Text) : async { #Ok : { signature_hex: Text }; #Err : Text } {
    try {
      let message_hash: Blob = Blob.fromArray(SHA256.sha256(Blob.toArray(Text.encodeUtf8(message))));
      Cycles.add<system>(30_000_000_000);
      let { signature } = await ic.sign_with_ecdsa({
          message_hash;
          derivation_path = [ Principal.toBlob(caller) ];
          key_id = { curve = #secp256k1; name = "dfx_test_key" };
      });
      #Ok({ signature_hex = Hex.encode(Blob.toArray(signature))})
    } catch (err) {
      #Err(Error.message(err))
    }
  };

  public query func greet(name : Text) : async Text {
    return "Hello, " # name # "!";
  };
}
