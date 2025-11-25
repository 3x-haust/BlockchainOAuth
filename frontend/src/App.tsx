import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

interface TokenInfo {
  tokenId: string;
  user: string;
  clientId: string;
  scope: string;
  expiresAt: string;
  revoked: boolean;
}

function App() {
  const [account, setAccount] = useState<string>('');
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [clientId, setClientId] = useState<string>('client_001');
  const [scope, setScope] = useState<string>('read write');
  const [accessToken, setAccessToken] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  useEffect(() => {
    initEthereum();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
  };

  const initEthereum = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const web3Provider = new ethers.BrowserProvider(window.ethereum);
        setProvider(web3Provider);
        
        window.ethereum.on('accountsChanged', (accounts: string[]) => {
          if (accounts.length > 0) {
            setAccount(accounts[0]);
            loadUserTokens(accounts[0]);
          } else {
            setAccount('');
            setTokens([]);
          }
        });

        const accounts = await web3Provider.listAccounts();
        if (accounts.length > 0) {
          setAccount(accounts[0].address);
          await loadUserTokens(accounts[0].address);
        }
      } catch (error) {
        console.error('Ethereum initialization failed:', error);
      }
    } else {
      alert('MetaMask가 설치되어 있지 않습니다. MetaMask를 설치해주세요.');
    }
  };

  const connectWallet = async () => {
    if (!provider) {
      alert('MetaMask가 감지되지 않습니다. 페이지를 새로고침해주세요.');
      return;
    }

    if (isConnecting) {
      alert('이미 연결 요청이 진행 중입니다. MetaMask 팝업을 확인해주세요.');
      return;
    }
    
    setIsConnecting(true);
    
    try {
      const accounts = await provider.send('eth_requestAccounts', []);
      
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        await loadUserTokens(accounts[0]);
      } else {
        alert('계정을 찾을 수 없습니다. MetaMask에서 계정을 선택해주세요.');
      }
    } catch (error: any) {
      console.log('Error message:', error.message);
      
      if (error.code === 4001) {
        showNotification('지갑 연결이 거부되었습니다', 'error');
      } else if (error.code === -32002) {
        showNotification('MetaMask 팝업을 확인해주세요', 'info');
      } else {
        showNotification('지갑 연결에 실패했습니다', 'error');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const requestAuthorization = async () => {
    if (!account) {
      showNotification('먼저 지갑을 연결해주세요', 'error');
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          redirectUri: 'http://localhost:3000/callback',
          scope,
          state: ethers.hexlify(ethers.randomBytes(16)),
          userAddress: account
        })
      });
      
      if (!response.ok) throw new Error('Authorization failed');
      
      const data = await response.json();
      showNotification('권한 승인이 완료되었습니다', 'success');
      await exchangeCodeForToken(data.code);
      setShowAuthModal(false);
    } catch (error) {
      console.error('Authorization failed:', error);
      showNotification('권한 승인에 실패했습니다', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const exchangeCodeForToken = async (code: string) => {
    try {
      const response = await fetch('http://localhost:3001/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          clientId,
          clientSecret: 'secret',
          redirectUri: 'http://localhost:3000/callback'
        })
      });
      
      if (!response.ok) throw new Error('Token exchange failed');
      
      const data = await response.json();
      setAccessToken(data.access_token);
      showNotification(`OAuth 토큰이 발급되었습니다 (NFT #${data.nft_token_id})`, 'success');
      await loadUserTokens(account);
    } catch (error) {
      console.error('Token exchange failed:', error);
      showNotification('토큰 발급에 실패했습니다', 'error');
    }
  };

  const loadUserTokens = async (address: string) => {
    try {
      const response = await fetch(`http://localhost:3001/oauth/user/tokens/${address}`);
      if (response.ok) {
        const data = await response.json();
        setTokens(data.tokens || []);
      }
    } catch (error) {
      console.error('Failed to load tokens:', error);
      setTokens([]);
    }
  };

  const verifyToken = async () => {
    if (!accessToken) {
      showNotification('검증할 토큰이 없습니다', 'error');
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/oauth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken })
      });
      
      const data = await response.json();
      if (data.valid) {
        showNotification('토큰이 유효합니다', 'success');
      } else {
        showNotification('토큰이 만료되었거나 유효하지 않습니다', 'error');
      }
    } catch (error) {
      console.error('Verification failed:', error);
      showNotification('토큰 검증에 실패했습니다', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const revokeToken = async () => {
    if (!accessToken) {
      showNotification('폐기할 토큰이 없습니다', 'error');
      return;
    }
    
    if (!confirm('정말 이 토큰을 폐기하시겠습니까?')) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken })
      });
      
      if (!response.ok) throw new Error('Revocation failed');
      
      await response.json();
      showNotification('토큰이 성공적으로 폐기되었습니다', 'success');
      setAccessToken('');
      await loadUserTokens(account);
    } catch (error) {
      console.error('Revocation failed:', error);
      showNotification('토큰 폐기에 실패했습니다', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('클립보드에 복사되었습니다', 'success');
  };

  const disconnectWallet = () => {
    setAccount('');
    setTokens([]);
    setAccessToken('');
    showNotification('지갑 연결이 해제되었습니다', 'info');
  };

  return (
    <div className="App">
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}

      <header className="header">
        <div className="container">
          <h1>🔐 Blockchain OAuth</h1>
          <p className="subtitle">ERC-721 기반 분산 인증 시스템</p>
        </div>
      </header>

      <main className="container">
        {!account ? (
          <div className="welcome-section">
            <div className="welcome-card">
              <h2>지갑 연결</h2>
              <p>블록체인 OAuth를 사용하려면 MetaMask 지갑을 연결해주세요</p>
              <button 
                className="btn btn-primary btn-large" 
                onClick={connectWallet} 
                disabled={isConnecting}
              >
                {isConnecting ? '연결 중...' : '🦊 MetaMask 연결'}
              </button>
              <div className="features">
                <div className="feature">
                  <span className="icon">🔒</span>
                  <h3>안전한 인증</h3>
                  <p>블록체인 기반 토큰 관리</p>
                </div>
                <div className="feature">
                  <span className="icon">🎨</span>
                  <h3>NFT 토큰</h3>
                  <p>ERC-721 표준 OAuth 토큰</p>
                </div>
                <div className="feature">
                  <span className="icon">⚡</span>
                  <h3>빠른 검증</h3>
                  <p>실시간 토큰 검증</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="account-section">
              <div className="account-info">
                <span className="status-badge">연결됨</span>
                <span className="account-address" onClick={() => copyToClipboard(account)}>
                  {account.substring(0, 6)}...{account.substring(38)}
                  <span className="copy-icon">📋</span>
                </span>
                <button className="btn btn-secondary btn-small" onClick={disconnectWallet}>
                  연결 해제
                </button>
              </div>
            </div>

            <div className="grid">
              <div className="card">
                <h2>OAuth 권한 요청</h2>
                <div className="form-group">
                  <label>클라이언트 ID</label>
                  <input 
                    type="text" 
                    value={clientId} 
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="client_001"
                  />
                </div>
                <div className="form-group">
                  <label>권한 범위 (Scope)</label>
                  <input 
                    type="text" 
                    value={scope} 
                    onChange={(e) => setScope(e.target.value)}
                    placeholder="read write"
                  />
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={() => setShowAuthModal(true)}
                  disabled={isLoading}
                >
                  권한 요청
                </button>
              </div>

              {accessToken && (
                <div className="card">
                  <h2>액세스 토큰</h2>
                  <div className="token-display" onClick={() => copyToClipboard(accessToken)}>
                    <code>{accessToken.substring(0, 40)}...</code>
                    <span className="copy-icon">📋</span>
                  </div>
                  <div className="button-group">
                    <button 
                      className="btn btn-success" 
                      onClick={verifyToken}
                      disabled={isLoading}
                    >
                      토큰 검증
                    </button>
                    <button 
                      className="btn btn-danger" 
                      onClick={revokeToken}
                      disabled={isLoading}
                    >
                      토큰 폐기
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <h2>내 OAuth NFT 토큰</h2>
                <span className="badge">{tokens.length}</span>
              </div>
              {tokens.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <p>발급된 토큰이 없습니다</p>
                  <small>권한 요청을 통해 새 토큰을 발급받으세요</small>
                </div>
              ) : (
                <div className="token-list">
                  {tokens.map((token) => {
                    const isExpired = Number(token.expiresAt) * 1000 < Date.now();
                    const isValid = !token.revoked && !isExpired;
                    return (
                      <div key={token.tokenId} className={`token-item ${isValid ? 'active' : 'inactive'}`}>
                        <div className="token-header">
                          <h3>Token #{token.tokenId}</h3>
                          <span className={`status ${isValid ? 'active' : 'inactive'}`}>
                            {token.revoked ? '폐기됨' : isExpired ? '만료됨' : '활성'}
                          </span>
                        </div>
                        <div className="token-details">
                          <div className="detail-row">
                            <span className="label">Client ID:</span>
                            <span className="value">{token.clientId}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">Scope:</span>
                            <span className="value">{token.scope}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">만료 시간:</span>
                            <span className="value">
                              {new Date(Number(token.expiresAt) * 1000).toLocaleString('ko-KR')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>권한 승인 확인</h2>
            <div className="modal-content">
              <p><strong>클라이언트:</strong> {clientId}</p>
              <p><strong>권한 범위:</strong> {scope}</p>
              <p><strong>요청 주소:</strong> {account.substring(0, 10)}...{account.substring(34)}</p>
              <div className="modal-info">
                이 애플리케이션에 다음 권한을 부여합니다:
                <ul>
                  {scope.split(' ').map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowAuthModal(false)}
                disabled={isLoading}
              >
                취소
              </button>
              <button 
                className="btn btn-primary" 
                onClick={requestAuthorization}
                disabled={isLoading}
              >
                {isLoading ? '처리 중...' : '승인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
