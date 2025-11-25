import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with account:", deployer.address);
  
  const OAuthNFT = await ethers.getContractFactory("OAuthNFT");
  const oauthNFT = await OAuthNFT.deploy();
  
  await oauthNFT.waitForDeployment();
  
  const contractAddress = await oauthNFT.getAddress();
  console.log("OAuthNFT deployed to:", contractAddress);
  
  await oauthNFT.registerClient("client_001", deployer.address);
  console.log("Test client registered");
  
  console.log("\n=================================");
  console.log("Copy this address to .env file:");
  console.log("CONTRACT_ADDRESS=" + contractAddress);
  console.log("=================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
