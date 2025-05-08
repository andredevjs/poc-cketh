import Text       "mo:base/Text";
import Principal  "mo:base/Principal";
import Blob       "mo:base/Blob";
import Error      "mo:base/Error";
import Hex        "./utils/Hex";
import Result     "mo:base/Result";
import Address    "mo:evm-txs/Address";
import IcEcdsaApi "./utils/IcEcdsaApi";
import AU         "mo:evm-txs/utils/ArrayUtils";

actor {
    let keyName = "dfx_test_key";
    let icEcdsaApi = IcEcdsaApi.IcEcdsaApi();
 
    private let caller: Principal = Principal.fromText(
        "udsqg-qo6cj-4agux-yt2kq-ke242-ylhwx-xio5v-nhsh3-dpjyj-sfqbi-kqe"
    );
    let derivationPath = [Principal.toBlob(caller)];
    type IC = actor {
        ecdsa_public_key: ({
            canister_id: ?Principal;
            derivation_path: [Blob];
            key_id: {
                curve: { #secp256k1 };
                name: Text
            };
        }) -> async ({ public_key: Blob; chain_code: Blob; });

        sign_with_ecdsa: ({
            message_hash: Blob;
            derivation_path: [Blob];
            key_id: {
                curve: { #secp256k1 };
                name: Text
            };
        }) -> async ({ signature: Blob });
    };

    let ic: IC = actor("aaaaa-aa");

    public shared(msg) func create_address(): async Result.Result<{address: Text}, Text> {
        switch (await* Address.create(keyName, [Principal.toBlob(msg.caller)], icEcdsaApi)) {
            case (#err(msg)) {
                return #err(msg);
            };
            case (#ok(res)) {
                return #ok({ address = res.0 });
            };
        };
    };

    public shared(_msg) func public_key(): async { #Ok: { public_key_hex: Text }; #Err: Text } {
        try {
            let { public_key } =
                await ic.ecdsa_public_key({
                    canister_id = null;
                    // derivation_path = [Principal.toBlob(msg.caller)];
                    derivation_path = derivationPath;
                    
                    key_id = { curve = #secp256k1; name = "dfx_test_key" };
                });
            #Ok({ public_key_hex = Hex.encode(Blob.toArray(public_key)) })
        } catch (err) {
            #Err(Error.message(err))
        }
    };

    public shared(_msg) func sign(digest: Text):  async { #Ok: { signature_hex: Text }; #Err: Text } {
       try {
            let { signature } = await ic.sign_with_ecdsa({
                message_hash = Blob.fromArray(AU.fromText(digest));
                // derivation_path = [Principal.toBlob(msg.caller)];
                derivation_path = derivationPath;
                key_id = { curve = #secp256k1; name = keyName };
            });

            return #Ok({ signature_hex = Hex.encode(Blob.toArray(signature));  });
         } catch (err) {
            #Err(Error.message(err))
        }
    };   
}
