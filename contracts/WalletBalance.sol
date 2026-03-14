// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title WalletBalance
 * @dev Fetches native coin balance + multiple ERC-20 token balances
 *      for any wallet address in a single on-chain call.
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function decimals()                 external view returns (uint8);
    function symbol()                   external view returns (string memory);
    function name()                     external view returns (string memory);
}

contract WalletBalance {

    struct TokenInfo {
        address contractAddress;
        string  name;
        string  symbol;
        uint8   decimals;
        uint256 balance;
    }

    // ── Native coin balance ──────────────────────────────────────────────
    function getNativeBalance(address wallet)
        external
        view
        returns (uint256)
    {
        return wallet.balance;
    }

    // ── Single ERC-20 token info + balance ───────────────────────────────
   function getTokenBalance(address wallet, address tokenContract)
    external
    view
    returns (TokenInfo memory info)
{
    info = TokenInfo({
        contractAddress: tokenContract,
        name:     _safeString(tokenContract, abi.encodeWithSignature("name()")),
        symbol:   _safeString(tokenContract, abi.encodeWithSignature("symbol()")),
        decimals: _safeDecimals(tokenContract),
        balance:  _safeBalance(wallet, tokenContract)
    });
}

    // ── Batch: multiple ERC-20 tokens in ONE call ────────────────────────
    function getMultipleTokenBalances(
        address   wallet,
        address[] calldata tokenContracts
    )
        external
        view
        returns (TokenInfo[] memory infos)
    {
        infos = new TokenInfo[](tokenContracts.length);
        for (uint256 i = 0; i < tokenContracts.length; i++) {
            address tc = tokenContracts[i];
            infos[i] = TokenInfo({
                contractAddress: tc,
                name:     _safeString(tc, abi.encodeWithSignature("name()")),
                symbol:   _safeString(tc, abi.encodeWithSignature("symbol()")),
                decimals: _safeDecimals(tc),
                balance:  _safeBalance(wallet, tc)
            });
        }
    }

    // ── Native + batch ERC-20 in ONE call ────────────────────────────────
    function getFullPortfolio(
        address   wallet,
        address[] calldata tokenContracts
    )
        external
        view
        returns (uint256 nativeBalance, TokenInfo[] memory tokens)
    {
        nativeBalance = wallet.balance;
        tokens = new TokenInfo[](tokenContracts.length);
        for (uint256 i = 0; i < tokenContracts.length; i++) {
            address tc = tokenContracts[i];
            tokens[i] = TokenInfo({
                contractAddress: tc,
                name:     _safeString(tc, abi.encodeWithSignature("name()")),
                symbol:   _safeString(tc, abi.encodeWithSignature("symbol()")),
                decimals: _safeDecimals(tc),
                balance:  _safeBalance(wallet, tc)
            });
        }
    }

    // ── Internal safe-call helpers (won't revert on bad tokens) ──────────
    function _safeBalance(address wallet, address tc)
        internal view returns (uint256)
    {
        (bool ok, bytes memory data) = tc.staticcall(
            abi.encodeWithSignature("balanceOf(address)", wallet)
        );
        if (ok && data.length >= 32) return abi.decode(data, (uint256));
        return 0;
    }

    function _safeDecimals(address tc)
        internal view returns (uint8)
    {
        (bool ok, bytes memory data) = tc.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        if (ok && data.length >= 32) return abi.decode(data, (uint8));
        return 18;
    }

    function _safeString(address tc, bytes memory callData)
        internal view returns (string memory)
    {
        (bool ok, bytes memory data) = tc.staticcall(callData);
        if (!ok || data.length == 0) return "";
        // Some tokens return bytes32 instead of string — handle both
        if (data.length == 32) {
            bytes32 raw = abi.decode(data, (bytes32));
            uint8 len = 0;
            while (len < 32 && raw[len] != 0) len++;
            bytes memory trimmed = new bytes(len);
            for (uint8 j = 0; j < len; j++) trimmed[j] = raw[j];
            return string(trimmed);
        }
        return abi.decode(data, (string));
    }
}
