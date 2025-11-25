import express, { Request, Response } from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.use(cors());
app.use(express.json());

const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
const contractAddress = process.env.CONTRACT_ADDRESS || '';

const contractABI = [
  "function mintAuthToken(address user, string clientId, string scope, uint256 expiresAt, string tokenURI) returns (uint256)",
  "function isTokenValid(uint256 tokenId) view returns (bool)",
  "function getTokenInfo(uint256 tokenId) view returns (tuple(address user, string clientId, string scope, uint256 expiresAt, bool revoked))",
  "function revokeToken(uint256 tokenId)",
  "function getUserTokens(address user) view returns (uint256[])"
];

interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  userAddress: string;
}

interface TokenRequest {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const authorizationCodes = new Map<string, AuthorizationRequest>();

app.post('/oauth/authorize', async (req: Request, res: Response) => {
  try {
    const { clientId, redirectUri, scope, state, userAddress } = req.body;
    
    if (!clientId || !redirectUri || !userAddress) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const code = ethers.hexlify(ethers.randomBytes(32));
    
    authorizationCodes.set(code, {
      clientId,
      redirectUri,
      scope: scope || 'read',
      state,
      userAddress
    });
    
    setTimeout(() => authorizationCodes.delete(code), 600000);
    
    res.json({
      code,
      state,
      redirectUri: `${redirectUri}?code=${code}&state=${state}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Authorization failed' });
  }
});

app.post('/oauth/token', async (req: Request, res: Response) => {
  try {
    const { code, clientId, clientSecret, redirectUri }: TokenRequest = req.body;
    
    if (!code || !clientId || !redirectUri) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const authRequest = authorizationCodes.get(code);
    
    if (!authRequest) {
      return res.status(400).json({ error: 'Invalid authorization code' });
    }
    
    if (authRequest.clientId !== clientId || authRequest.redirectUri !== redirectUri) {
      return res.status(400).json({ error: 'Client mismatch' });
    }
    
    authorizationCodes.delete(code);
    
    const signer = await provider.getSigner(0);
    const contract = new ethers.Contract(contractAddress, contractABI, signer);
    
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const tokenURI = `data:application/json,{"client":"${clientId}","scope":"${authRequest.scope}"}`;
    
    const tx = await contract.mintAuthToken(
      authRequest.userAddress,
      clientId,
      authRequest.scope,
      expiresAt,
      tokenURI
    );
    
    const receipt = await tx.wait();
    const tokenId = receipt.logs[0].topics[1];
    
    const accessToken = jwt.sign(
      {
        tokenId: ethers.toBigInt(tokenId).toString(),
        userAddress: authRequest.userAddress,
        clientId,
        scope: authRequest.scope
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      nft_token_id: ethers.toBigInt(tokenId).toString(),
      scope: authRequest.scope
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Token generation failed' });
  }
});

app.post('/oauth/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    const isValid = await contract.isTokenValid(decoded.tokenId);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Token is invalid or expired' });
    }
    
    const tokenInfo = await contract.getTokenInfo(decoded.tokenId);
    
    res.json({
      valid: true,
      userAddress: decoded.userAddress,
      clientId: decoded.clientId,
      scope: decoded.scope,
      tokenInfo: {
        user: tokenInfo.user,
        clientId: tokenInfo.clientId,
        scope: tokenInfo.scope,
        expiresAt: tokenInfo.expiresAt.toString(),
        revoked: tokenInfo.revoked
      }
    });
  } catch (error) {
    console.error(error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.post('/oauth/revoke', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    const signer = await provider.getSigner(0);
    const contract = new ethers.Contract(contractAddress, contractABI, signer);
    
    const tx = await contract.revokeToken(decoded.tokenId);
    await tx.wait();
    
    res.json({ success: true, message: 'Token revoked' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Revocation failed' });
  }
});

app.get('/oauth/user/tokens/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    const tokenIds = await contract.getUserTokens(address);
    
    const tokens = await Promise.all(
      tokenIds.map(async (tokenId: bigint) => {
        const info = await contract.getTokenInfo(tokenId);
        return {
          tokenId: tokenId.toString(),
          user: info.user,
          clientId: info.clientId,
          scope: info.scope,
          expiresAt: info.expiresAt.toString(),
          revoked: info.revoked
        };
      })
    );
    
    res.json({ tokens });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch user tokens' });
  }
});

app.listen(PORT, () => {
  console.log(`OAuth server running on port ${PORT}`);
});
