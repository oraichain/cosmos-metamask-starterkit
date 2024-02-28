import './App.css';
import { useState, useEffect } from 'react';
import detectEthereumProvider from '@metamask/detect-provider';
import { fromHex, toHex, toUtf8 } from '@cosmjs/encoding';
import { keccak256, ripemd160, sha256 } from '@cosmjs/crypto';
import * as secp256k1 from '@noble/secp256k1';
import bech32 from 'bech32';
import { AminoSignResponse, StdSignDoc, coins, encodeSecp256k1Signature } from '@cosmjs/amino';
import { AminoMsgSend } from '@cosmjs/stargate';

export function sortObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  // NOTE: Use forEach instead of reduce for performance with large objects eg Wasm code
  sortedKeys.forEach((key) => {
    result[key] = sortObject(obj[key]);
  });
  return result;
}

/** Returns a JSON string with objects sorted by key, used for pretty Amino EIP191 signing */
function prettyJsonSortedStringify(obj: any): string {
  return JSON.stringify(sortObject(obj), null, 4);
}

function prettySerializeStdSignDoc(signDoc: StdSignDoc): Uint8Array {
  return toUtf8(prettyJsonSortedStringify(signDoc));
}

function pubkeyToAddress(pubkey: Uint8Array, prefix: string = 'orai'): string {
  return bech32.encode(prefix, bech32.toWords(ripemd160(sha256(pubkey))));
}

const signAmino = async (ethProvider: any, ethAddress: string, signDoc: StdSignDoc): Promise<AminoSignResponse> => {
  const rawMsg = prettySerializeStdSignDoc(signDoc);
  const msgToSign = `0x${toHex(rawMsg)}`;
  const sigResult: string = await ethProvider.request({
    method: 'personal_sign',
    params: [msgToSign, ethAddress]
  });

  // strip leading 0x and trailing recovery id
  const sig = fromHex(sigResult.slice(2, -2));

  const pubkey = getPubkey(rawMsg, sigResult);

  return {
    signed: signDoc,
    signature: encodeSecp256k1Signature(pubkey, sig)
  };
};

const getPubkey = (rawMsg: Uint8Array, sigResult: string): Uint8Array => {
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
};

const App = () => {
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const initialState = { accounts: [] };
  const [wallet, setWallet] = useState(initialState);
  const [amount, setAmount] = useState('1000000');
  const [signedMessage, setSignedMessage] = useState('');

  useEffect(() => {
    const getProvider = async () => {
      const provider = await detectEthereumProvider({ silent: true });
      setHasProvider(Boolean(provider));
    };

    getProvider();
  }, []);

  const updateWallet = async (accounts: any) => {
    setWallet({ accounts });
  };

  const handleConnect = async () => {
    let accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });
    updateWallet(accounts);
  };

  const showOraiAddress = async () => {
    const rawMsg = toUtf8('Get secret address');
    const msgToSign = `0x${toHex(rawMsg)}`;

    const sigResult: string = (await window.ethereum.request({
      method: 'personal_sign',
      params: [msgToSign, wallet.accounts[0]]
    }))!.toString();

    const pubkey = getPubkey(rawMsg, sigResult);
    window.alert(pubkeyToAddress(pubkey));
  };

  const signMessage = async (ethProvider: any, ethAddress: string) => {
    const signDoc: StdSignDoc = {
      chain_id: 'Oraichain',
      account_number: '0', // Must be 0
      sequence: '0', // Must be 0
      fee: {
        amount: coins('1000', 'orai'),
        gas: '0.01' // Must be 1
      },
      msgs: [
        {
          type: 'cosmos-sdk/MsgSend',
          value: {
            from_address: 'orai1jzgs4ws43pzphn7gqtkg03c53jpllkqm0jakq4',
            to_address: 'orai1jzgs4ws43pzphn7gqtkg03c53jpllkqm0jakq4',
            amount: coins(amount, 'orai')
          }
        } as AminoMsgSend
      ],
      memo: ''
    };
    const res = await signAmino(ethProvider, ethAddress, signDoc);
    return res;
  };

  const signTransferMessage = async () => {
    const ethAddress = wallet.accounts[0];
    const message = await signMessage(window.ethereum, ethAddress);
    setSignedMessage(JSON.stringify(message, null, 2));
  };

  return (
    <div className="App">
      <div>Injected Provider {hasProvider ? 'DOES' : 'DOES NOT'} Exist</div>

      {hasProvider /* Updated */ && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button onClick={handleConnect}>Connect MetaMask</button>
          {wallet.accounts.length > 0 && <button onClick={showOraiAddress}>Show Orai Address</button>}
          {wallet.accounts.length > 0 && <button onClick={signTransferMessage}>Sign Transfer Message</button>}

          <label>
            Amount: <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
      )}

      {wallet.accounts.length > 0 && <div>Wallet Accounts: {wallet.accounts[0]}</div>}
      {signedMessage && <pre>Signed Message: {signedMessage}</pre>}
    </div>
  );
};

export default App;
