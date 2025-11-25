import { expect } from "chai";
import { ethers } from "hardhat";
import { OAuthNFT } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OAuthNFT", function () {
  let oauthNFT: OAuthNFT;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let client: SignerWithAddress;

  beforeEach(async function () {
    [owner, user, client] = await ethers.getSigners();
    
    const OAuthNFT = await ethers.getContractFactory("OAuthNFT");
    oauthNFT = await OAuthNFT.deploy();
    await oauthNFT.waitForDeployment();
  });

  describe("Client Registration", function () {
    it("Should register a client", async function () {
      await oauthNFT.registerClient("client_001", client.address);
      expect(await oauthNFT.clientRegistry("client_001")).to.equal(client.address);
    });

    it("Should not allow duplicate client registration", async function () {
      await oauthNFT.registerClient("client_001", client.address);
      await expect(
        oauthNFT.registerClient("client_001", user.address)
      ).to.be.revertedWith("Client already registered");
    });
  });

  describe("Token Minting", function () {
    beforeEach(async function () {
      await oauthNFT.registerClient("client_001", client.address);
    });

    it("Should mint an auth token", async function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(
        oauthNFT.mintAuthToken(
          user.address,
          "client_001",
          "read write",
          expiresAt,
          "ipfs://test"
        )
      ).to.emit(oauthNFT, "TokenMinted");
    });

    it("Should not mint with unregistered client", async function () {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      
      await expect(
        oauthNFT.mintAuthToken(
          user.address,
          "invalid_client",
          "read",
          expiresAt,
          "ipfs://test"
        )
      ).to.be.revertedWith("Client not registered");
    });
  });

  describe("Token Validation", function () {
    let tokenId: bigint;

    beforeEach(async function () {
      await oauthNFT.registerClient("client_001", client.address);
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      
      const tx = await oauthNFT.mintAuthToken(
        user.address,
        "client_001",
        "read",
        expiresAt,
        "ipfs://test"
      );
      
      const receipt = await tx.wait();
      tokenId = BigInt(receipt!.logs[0].topics[1]);
    });

    it("Should validate active token", async function () {
      expect(await oauthNFT.isTokenValid(tokenId)).to.be.true;
    });

    it("Should invalidate revoked token", async function () {
      await oauthNFT.connect(user).revokeToken(tokenId);
      expect(await oauthNFT.isTokenValid(tokenId)).to.be.false;
    });
  });

  describe("Token Revocation", function () {
    let tokenId: bigint;

    beforeEach(async function () {
      await oauthNFT.registerClient("client_001", client.address);
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      
      const tx = await oauthNFT.mintAuthToken(
        user.address,
        "client_001",
        "read",
        expiresAt,
        "ipfs://test"
      );
      
      const receipt = await tx.wait();
      tokenId = BigInt(receipt!.logs[0].topics[1]);
    });

    it("Should allow owner to revoke token", async function () {
      await expect(oauthNFT.connect(user).revokeToken(tokenId))
        .to.emit(oauthNFT, "TokenRevoked")
        .withArgs(tokenId);
    });

    it("Should not allow unauthorized revocation", async function () {
      await expect(
        oauthNFT.connect(client).revokeToken(tokenId)
      ).to.be.revertedWith("Not authorized");
    });
  });
});
