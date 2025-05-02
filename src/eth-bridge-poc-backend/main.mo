import Text "mo:base/Text";
import ECDSA "./utils/ECDSA";

actor {
  public shared (msg) func public_key() : async { #Ok : { public_key_hex: Text }; #Err : Text } {
    await ECDSA.getPublicKey(msg.caller);
  };

  public shared (msg) func sign(message: Text) : async { #Ok : { signature_hex: Text };  #Err : Text } {
    await ECDSA.sign(msg.caller, message);
  };

  public query func greet(name : Text) : async Text {
    return "Hello, " # name # "!";
  };
 
}
