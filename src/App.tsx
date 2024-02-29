import './App.css';
import { useState, useEffect } from 'react';
import detectEthereumProvider from '@metamask/detect-provider';
import { fromBase64, fromHex, toHex, toUtf8 } from '@cosmjs/encoding';
import { keccak256, ripemd160, sha256 } from '@cosmjs/crypto';
import * as secp256k1 from '@noble/secp256k1';
import bech32 from 'bech32';
import { AminoSignResponse, StdSignDoc, coins, encodeSecp256k1Pubkey, encodeSecp256k1Signature, makeSignDoc, serializeSignDoc } from '@cosmjs/amino';
import { AminoMsgSend, StargateClient, AminoTypes, calculateFee, createDefaultAminoConverters, defaultRegistryTypes as defaultStargateTypes } from '@cosmjs/stargate';
import { createWasmAminoConverters, wasmTypes } from '@cosmjs/cosmwasm-stargate';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { Registry, TxBodyEncodeObject, encodePubkey, makeAuthInfoBytes } from '@cosmjs/proto-signing';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { Int53 } from '@cosmjs/math';

function pubkeyToAddress(pubkey: Uint8Array, prefix: string = 'orai'): string {
  return bech32.encode(prefix, bech32.toWords(ripemd160(sha256(pubkey))));
}

const signAmino = async (ethProvider: any, ethAddress: string, signDoc: StdSignDoc): Promise<AminoSignResponse> => {
  const rawMsg = serializeSignDoc(signDoc);
  const msgToSign = `0x${toHex(rawMsg)}`;
  console.log('msgToSign', msgToSign);
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
  // const [signedMessage, setSignedMessage] = useState('');
  const [cosmosAddress, setCosmosAddress] = useState('');
  const [targetBalance, setTargetBalance] = useState<object>({});
  const [balance, setBalance] = useState<object>({});
  const [pubkey, setPubkey] = useState<Uint8Array | undefined>(undefined);
  const [registry, setRegistry] = useState<Registry | undefined>(undefined);
  const [aminoTypes, setAminoTypes] = useState<AminoTypes | undefined>(undefined);
  const [client, setClient] = useState<StargateClient>();

  useEffect(() => {
    (async () => {
      const client = await StargateClient.connect('http://localhost:26657');
      setClient(client);
      const provider = await detectEthereumProvider({ silent: true });
      setHasProvider(Boolean(provider));

      const balance = await client.getBalance('orai1jzgs4ws43pzphn7gqtkg03c53jpllkqm0jakq4', 'orai').catch(() => {
        return { amount: '0', denom: 'orai' };
      });
      setTargetBalance(balance);
    })();

    setAminoTypes(
      new AminoTypes({
        ...createDefaultAminoConverters(),
        ...createWasmAminoConverters()
      })
    );

    setRegistry(new Registry([...defaultStargateTypes, ...wasmTypes]));
  }, []);

  const updateWallet = async (accounts: any) => {
    setWallet({ accounts });
  };

  const handleConnect = async () => {
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts'
    });
    updateWallet(accounts);
  };

  const showOraiAddress = async () => {
    if (!client) return;
    const rawMsg = toUtf8('Get secret address');
    const msgToSign = `0x${toHex(rawMsg)}`;

    const sigResult: string = (await window.ethereum.request({
      method: 'personal_sign',
      params: [msgToSign, wallet.accounts[0]]
    }))!.toString();

    setPubkey(getPubkey(rawMsg, sigResult));
    console.log('showOraipubkey', getPubkey(rawMsg, sigResult));
    setCosmosAddress(pubkeyToAddress(getPubkey(rawMsg, sigResult)));

    const balance = await client.getBalance(pubkeyToAddress(getPubkey(rawMsg, sigResult)), 'orai').catch(() => {
      return { amount: '0', denom: 'orai' };
    });
    setBalance(balance);
  };

  const signMessage = async (ethProvider: any, ethAddress: string) => {
    if (!client) return;

    const { accountNumber, sequence } = await client.getSequence(cosmosAddress);
    const chainId = await client.getChainId();
    const signDoc = makeSignDoc(
      [
        {
          type: 'cosmos-sdk/MsgSend',
          value: {
            from_address: cosmosAddress,
            to_address: cosmosAddress,
            amount: coins(amount, 'orai')
          }
        } as AminoMsgSend
      ],
      calculateFee(20000, '0.001orai'),
      chainId,
      'memo',
      accountNumber,
      sequence
    );
    const res = await signAmino(ethProvider, ethAddress, signDoc);
    return res;
  };

  const signTransferMessage = async () => {
    const ethAddress = wallet.accounts[0];
    return await signMessage(window.ethereum, ethAddress);
    // setSignedMessage(JSON.stringify(message, null, 2));
  };

  const transferOrai = async () => {
    const signedMessage = await signTransferMessage();
    if (!client || !signedMessage) return;
    const { signed, signature } = signedMessage;
    // const any_pub_key = signature.pub_key;
    if (!pubkey) {
      throw new Error('Pubkey is required');
    }
    const any_pub_key = encodePubkey(encodeSecp256k1Pubkey(pubkey));
    if (!aminoTypes || !registry) {
      throw new Error('AminoTypes and Registry are required');
    }

    const signMode = SignMode.SIGN_MODE_EIP_191;
    const signedTxBody: TxBodyEncodeObject = {
      typeUrl: '/cosmos.tx.v1beta1.TxBody',
      value: {
        messages: signed.msgs.map((msg) => aminoTypes.fromAmino(msg)),
        memo: signed.memo
      }
    };
    const signedTxBodyBytes = registry.encode(signedTxBody);
    const signedGasLimit = Int53.fromString(signed.fee.gas).toNumber();
    const signedSequence = Int53.fromString(signed.sequence).toNumber();
    if (!pubkey) {
      throw new Error('Pubkey is required');
    }
    const signedAuthInfoBytes = makeAuthInfoBytes([{ pubkey: any_pub_key, sequence: signedSequence }], signed.fee.amount, signedGasLimit, signed.fee.granter, signed.fee.payer, signMode);
    const txRaw = TxRaw.fromPartial({
      bodyBytes: signedTxBodyBytes,
      authInfoBytes: signedAuthInfoBytes,
      signatures: [fromBase64(signature.signature)]
    });
    const txBytes = TxRaw.encode(txRaw).finish();

    const response = await client.broadcastTx(txBytes);
    console.log(response);
  };

  return (
    <div className="App">
      <div>Injected Provider {hasProvider ? 'DOES' : 'DOES NOT'} Exist</div>

      {hasProvider /* Updated */ && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button onClick={handleConnect}>Connect MetaMask</button>
          {wallet.accounts.length > 0 && <button onClick={showOraiAddress}>Show Orai Address</button>}
          {wallet.accounts.length > 0 && <button onClick={transferOrai}>Transfer</button>}

          <label>
            Amount: <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
      )}

      {wallet.accounts.length > 0 && <div>Wallet Accounts: {wallet.accounts[0]}</div>}
      {cosmosAddress && <div>CosmosAccount: {cosmosAddress} </div>}
      {balance && <div>Balance: {JSON.stringify(balance)} </div>}
      {targetBalance && <div>TargetAddress:orai1cnza7u4g9nwl5algvjfzwdlry2gk8andwgh4q8 </div>}
      {targetBalance && <div>TargetBalance: {JSON.stringify(targetBalance)} </div>}
    </div>
  );
};

export default App;
