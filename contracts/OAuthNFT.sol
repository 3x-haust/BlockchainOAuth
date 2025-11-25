// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OAuthNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;
    
    struct AuthToken {
        address user;
        string clientId;
        string scope;
        uint256 expiresAt;
        bool revoked;
    }
    
    mapping(uint256 => AuthToken) public authTokens;
    mapping(address => uint256[]) public userTokens;
    mapping(string => address) public clientRegistry;
    
    event TokenMinted(uint256 indexed tokenId, address indexed user, string clientId, string scope);
    event TokenRevoked(uint256 indexed tokenId);
    event ClientRegistered(string clientId, address clientAddress);
    
    constructor() ERC721("OAuthToken", "OAUTH") Ownable(msg.sender) {}
    
    function registerClient(string memory clientId, address clientAddress) external onlyOwner {
        require(clientRegistry[clientId] == address(0), "Client already registered");
        clientRegistry[clientId] = clientAddress;
        emit ClientRegistered(clientId, clientAddress);
    }
    
    function mintAuthToken(
        address user,
        string memory clientId,
        string memory scope,
        uint256 expiresAt,
        string memory tokenURI
    ) external returns (uint256) {
        require(clientRegistry[clientId] != address(0), "Client not registered");
        require(expiresAt > block.timestamp, "Invalid expiration time");
        
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(user, tokenId);
        _setTokenURI(tokenId, tokenURI);
        
        authTokens[tokenId] = AuthToken({
            user: user,
            clientId: clientId,
            scope: scope,
            expiresAt: expiresAt,
            revoked: false
        });
        
        userTokens[user].push(tokenId);
        
        emit TokenMinted(tokenId, user, clientId, scope);
        return tokenId;
    }
    
    function revokeToken(uint256 tokenId) external {
        require(_ownerOf(tokenId) == msg.sender || owner() == msg.sender, "Not authorized");
        authTokens[tokenId].revoked = true;
        emit TokenRevoked(tokenId);
    }
    
    function isTokenValid(uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) return false;
        AuthToken memory token = authTokens[tokenId];
        return !token.revoked && token.expiresAt > block.timestamp;
    }
    
    function getTokenInfo(uint256 tokenId) external view returns (AuthToken memory) {
        require(_exists(tokenId), "Token does not exist");
        return authTokens[tokenId];
    }
    
    function getUserTokens(address user) external view returns (uint256[] memory) {
        return userTokens[user];
    }
    
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
