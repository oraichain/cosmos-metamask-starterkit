import './App.css';
import { useState, useEffect } from 'react';
import detectEthereumProvider from '@metamask/detect-provider';
import {OfflineAminoSigner,  coins} from '@cosmjs/amino';
import {  GasPrice } from '@cosmjs/stargate';
import { SigningCosmWasmClient} from '@cosmjs/cosmwasm-stargate';
import { MetamaskOfflineSigner } from './MetamaskOfflineSigner';

const App = () => {
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const initialState = { accounts: [] };
  const [wallet, setWallet] = useState(initialState);
  const [amount, setAmount] = useState('1000000');
  // const [signedMessage, setSignedMessage] = useState('');
  const [cosmosAddress, setCosmosAddress] = useState('');
  const [targetBalance, setTargetBalance] = useState<object>({});
  const [balance, setBalance] = useState<object>({});
  // const [pubkey, setPubkey] = useState<Uint8Array | undefined>(undefined);
  // const [registry, setRegistry] = useState<Registry | undefined>(undefined);
  // const [aminoTypes, setAminoTypes] = useState<AminoTypes | undefined>(undefined);
  const [client, setClient] = useState<SigningCosmWasmClient>();
  const [offlineSigner, setOfflineSigner] = useState<OfflineAminoSigner>();

  useEffect(() => {
    (async () => {
      const provider = await detectEthereumProvider({ silent: true });
      setHasProvider(Boolean(provider));

      if(client){
        const balance = await client.getBalance('orai1cnza7u4g9nwl5algvjfzwdlry2gk8andwgh4q8', 'orai').catch(() => {
          return { amount: '0', denom: 'orai' };
        });
        setTargetBalance(balance);
      }
    })();

  }, [client]);

  const updateWallet = async (accounts: any) => {
    setWallet({ accounts });
  };

  const handleConnect = async () => {
    const metamaskOfflineSinger = await MetamaskOfflineSigner.connect(window.ethereum, 'orai');
    const signingClient = await SigningCosmWasmClient.connectWithSigner('http://localhost:26657', metamaskOfflineSinger, {
    gasPrice: GasPrice.fromString('0.002orai'),
    });
    setClient(signingClient);
    if(!metamaskOfflineSinger){
      throw new Error('MetamaskOfflineSinger is required');
    }
    updateWallet([metamaskOfflineSinger.ethAddress])
    setOfflineSigner(metamaskOfflineSinger) 
    
  };

  const showOraiAddress = async () => {
    if (!client || !offlineSigner) return;
    const accounts = await offlineSigner.getAccounts();
    const balance = await client.getBalance(accounts[0].address, 'orai');
    setBalance(balance);
    setCosmosAddress(accounts[0].address);
  };

  const transferOrai = async () => {
    const accounts = await offlineSigner?.getAccounts();
    if(!accounts) return;
    const result = await client?.sendTokens(accounts[0].address, 'orai1cnza7u4g9nwl5algvjfzwdlry2gk8andwgh4q8', coins(amount, 'orai'), 'auto','memo');
    console.log(result);
  };
  //
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
