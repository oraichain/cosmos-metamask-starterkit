import { keccak256, ripemd160, sha256 } from '@cosmjs/crypto';
import { fromHex, toUtf8 } from '@cosmjs/encoding';
import * as secp256k1 from '@noble/secp256k1';
import bech32 from 'bech32';

export function pubkeyToBechAddress(pubkey: Uint8Array, prefix: string = 'orai'): string {
  return bech32.encode(prefix, bech32.toWords(ripemd160(sha256(pubkey))));
}

export function getPubkeyFromEthSignature(rawMsg:Uint8Array, sigResult:string){

  // On ETHland pubkeys are recovered from signatures, so we're going to:
  // 1. sign something
  // 2. recover the pubkey from the signature
  // 3. derive a secret address from the the pubkey

  // strip leading 0x and extract recovery id
  const sig = fromHex(sigResult.slice(2, -2));
  let recoveryId = parseInt(sigResult.slice(-2), 16) - 27;

  // When a Ledger is used, this value doesn't need to be adjusted
  if (recoveryId < 0) {
    recoveryId += 27;
  }

  const eip191MessagePrefix = toUtf8('\x19Ethereum Signed Message:\n');
  const rawMsgLength = toUtf8(String(rawMsg.length));

  const publicKey = secp256k1.recoverPublicKey(keccak256(new Uint8Array([...eip191MessagePrefix, ...rawMsgLength, ...rawMsg])), sig, recoveryId, true);

  return publicKey;
}
