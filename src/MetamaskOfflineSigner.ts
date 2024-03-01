import { fromHex, toHex, toUtf8 } from '@cosmjs/encoding';
import {AccountData} from '@cosmjs/proto-signing'
import { getPubkeyFromEthSignature, pubkeyToBechAddress } from './helper';
import { AminoSignResponse, OfflineAminoSigner, StdSignDoc, encodeSecp256k1Signature, serializeSignDoc } from '@cosmjs/amino';

export interface IEthProvider {
    request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
}

const GET_COSMOS_ADDRESS_MESSAGE = 'Get cosmos address';

type CosmosToEvm = {
  [key:string]:string
}

export class MetamaskOfflineSigner implements OfflineAminoSigner {
    cosmosToEvm: CosmosToEvm = {};
    accounts: AccountData[] = []
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private constructor(public readonly ethProvider:IEthProvider,public readonly ethAddress:string, public readonly prefix:string = 'cosmos'){
    }

    public static async connect(ethProvider:IEthProvider, prefix:string='cosmos'):Promise<MetamaskOfflineSigner> {
      // all address in the metamask
      const accounts = await ethProvider.request({ method: 'eth_requestAccounts' }) as string[];

      // always get the first address
      return new MetamaskOfflineSigner(ethProvider, accounts[0], prefix);
    }


    async getAccounts(): Promise<readonly AccountData[]> {
      if(this.accounts.length < 1){
      const pubKey = await this.getPubkeyFromEthSignature();
      this.cosmosToEvm[pubkeyToBechAddress(pubKey, this.prefix)] = this.ethAddress;
      this.accounts = [
          {
            address: pubkeyToBechAddress(pubKey, this.prefix),
            algo: 'secp256k1',
            pubkey: pubKey
          }
        ]
      }
      return this.accounts
    }

    async signAmino(signerAddress: string, signDoc: StdSignDoc):Promise<AminoSignResponse> {
      const ethAddress = this.cosmosToEvm[signerAddress];
      return this.signEip191(ethAddress, signDoc);

    }

    async signEip191(ethAddress: string, signDoc:StdSignDoc):Promise<AminoSignResponse> {
        const rawMsg = serializeSignDoc(signDoc);
        const msgToSign = `0x${toHex(rawMsg)}`;
        const sigResult = await this.ethProvider.request({
          method: 'personal_sign',
          params: [msgToSign, ethAddress]
        })as string;

        // strip leading 0x and trailing recovery id
        const sig = fromHex(sigResult.slice(2, -2));
        const pubkey = getPubkeyFromEthSignature(rawMsg, sigResult);

        return {
          signed: signDoc,
          signature: encodeSecp256k1Signature(pubkey, sig)
        };
      }

    private async getPubkeyFromEthSignature(): Promise<Uint8Array> {
      if(!this.ethProvider){
        throw new Error('No ethProvider');
      }
      const rawMsg = toUtf8(GET_COSMOS_ADDRESS_MESSAGE);
      const msgToSign = `0x${toHex(rawMsg)}`;
      const sigResult = await this.ethProvider.request({ method: 'personal_sign', params: [msgToSign, this.ethAddress] }) as string;
      return getPubkeyFromEthSignature(rawMsg, sigResult)

    }

    


}
