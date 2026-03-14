// frontend/src/addNetwork.js

export async function addNetwork(network) {

  if (!window.ethereum) {
    alert("MetaMask is not installed.");
    return;
  }

  try {

    // First try switching
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainId }],
    });

  } catch (switchError) {

    // If network not installed → add it
    if (switchError.code === 4902) {

      try {

        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: network.chainId,
            chainName: network.chainName,
            nativeCurrency: network.nativeCurrency,
            rpcUrls: network.rpcUrls,
            blockExplorerUrls: network.blockExplorerUrls
          }]
        });

      } catch (addError) {

        console.error("Failed to add network:", addError);
        throw addError;

      }

    } else {

      console.error("Failed to switch network:", switchError);
      throw switchError;

    }

  }

}