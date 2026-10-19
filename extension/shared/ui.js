"use strict";

import { loadTranslations } from "./locale.js";
import { renderApprovalView } from "./approval-popup.js";

/** Translation keys for bridge refusal codes sent by the desktop app. */
const BRIDGE_NOTICE_KEYS = {
  NOT_PAIRED: "extension.wallet.bridgeNotPaired",
};
const BRIDGE_NOTICE_FALLBACK =
  "This extension is not paired with CointMU Desktop. Update both apps, then choose Link to Desktop App.";

export async function initPopup() {
  const translations = await loadTranslations();

  const loginView = document.getElementById("login-view");
  const selectionView = document.getElementById("selection-view");
  const defaultView = document.getElementById("default-view");
  const approvalView = document.getElementById("approval-view");
  const addNetworkView = document.getElementById("add-network-view");

  const privKeyInput = document.getElementById("priv-key-input");
  const importBtn = document.getElementById("import-btn");
  const cancelImportBtn = document.getElementById("cancel-import-btn");
  const selectImportBtn = document.getElementById("select-import-btn");
  const selectLinkBtn = document.getElementById("select-link-btn");
  const cancelSelectionBtn = document.getElementById("cancel-selection-btn");

  const balanceValue = document.getElementById("balance-value");
  const fiatValue = document.getElementById("fiat-value");
  const assetsList = document.getElementById("assets-list");
  const assetsCount = document.getElementById("assets-count");
  const connectedStatus = document.getElementById("connected-status");
  const statusText = document.getElementById("status-text");
  const bridgeNotice = document.getElementById("bridge-notice");

  /**
   * Shows why the desktop app refused this extension, if it did.
   * @param {string | null} code - The stored bridge refusal code.
   * @returns {void}
   */
  const renderBridgeNotice = (code) => {
    if (!code) {
      bridgeNotice.classList.add("hidden");
      return;
    }
    bridgeNotice.textContent =
      translations[BRIDGE_NOTICE_KEYS[code]] || BRIDGE_NOTICE_FALLBACK;
    bridgeNotice.classList.remove("hidden");
  };

  const accountDropdown = document.getElementById("account-dropdown");
  const accountSelectedText = document.getElementById("account-selected-text");
  const accountOptions = document.getElementById("account-options");

  const networkDropdown = document.getElementById("network-dropdown");
  const networkSelectedText = document.getElementById("network-selected-text");
  const networkOptions = document.getElementById("network-options");

  const addNetworkBtn = document.getElementById("add-network-btn");
  const saveNetworkBtn = document.getElementById("save-network-btn");
  const cancelNetworkBtn = document.getElementById("cancel-network-btn");
  const chainIdInput = document.getElementById("chain-id-input");
  const networkErrorMsg = document.getElementById("network-error-msg");

  if (chainIdInput) {
    chainIdInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, "");
    });
  }

  const sendView = document.getElementById("send-view");
  const actionSendBtn = document.getElementById("action-send");
  const sendConfirmBtn = document.getElementById("send-confirm-btn");
  const sendCancelBtn = document.getElementById("send-cancel-btn");
  const sendToInput = document.getElementById("send-to-input");
  const sendAmountInput = document.getElementById("send-amount-input");

  const btnApproveConfirm = document.getElementById("btn-approve-confirm");
  const rejectTxBtn = document.getElementById("extension.wallet.rejectTx");

  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get("mode");
  const reqIdParam = urlParams.get("reqId");
  const reqId = reqIdParam ? parseInt(reqIdParam, 10) : null;

  // Dropdown state
  let currentNetworkId = "desktop_connection";
  let currentAccountAddress = "";
  let currentAccountMode = "desktop";

  // Toggle Dropdowns
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".kebab-trigger") &&
      !e.target.closest(".kebab-actions")
    ) {
      document.querySelectorAll(".kebab-actions").forEach((el) => {
        el.classList.add("hidden");
      });
    }
    if (networkDropdown && networkDropdown.contains(e.target)) {
      networkOptions.classList.toggle("hidden");
      if (accountOptions) accountOptions.classList.add("hidden");
    } else if (accountDropdown && accountDropdown.contains(e.target)) {
      accountOptions.classList.toggle("hidden");
      if (networkOptions) networkOptions.classList.add("hidden");
    } else {
      if (networkOptions) networkOptions.classList.add("hidden");
      if (accountOptions) accountOptions.classList.add("hidden");
    }
  });

  if (mode === "approve" && reqId) {
    loginView.classList.add("hidden");
    defaultView.classList.add("hidden");
    approvalView.classList.remove("hidden");

    const approvalElements = {
      title: document.getElementById("extension.wallet.approveTx"),
      rows: document.getElementById("approval-rows"),
      warning: document.getElementById("approval-warning"),
      approve: btnApproveConfirm,
    };
    // Stays disabled until the request details are shown.
    btnApproveConfirm.disabled = true;
    chrome.runtime.sendMessage(
      { action: "GET_PENDING_REQ", reqId },
      (response) => {
        renderApprovalView(
          approvalElements,
          translations,
          response && response.success ? response.view : null,
        );
      },
    );

    btnApproveConfirm.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        { action: "RESOLVE_REQ", reqId, approved: true },
        () => window.close(),
      );
    });

    rejectTxBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        { action: "RESOLVE_REQ", reqId, approved: false },
        () => window.close(),
      );
    });
    return;
  }

  const renderAssets = (balanceStr, symbol = "CMU") => {
    assetsList.innerHTML = "";

    balanceValue.textContent = `${balanceStr} ${symbol}`;
    fiatValue.textContent = `≈ $--`;

    const realAssets = [
      {
        symbol: symbol.charAt(0),
        name: symbol === "CMU" ? "CointMU" : symbol,
        bal: `${balanceStr || "0.00"} ${symbol}`,
        fiat: `--`,
      },
    ];

    assetsCount.textContent = realAssets.length;

    realAssets.forEach((asset) => {
      const item = document.createElement("div");
      item.className = "asset-item";
      item.innerHTML = `
        <div class="asset-icon">${asset.symbol}</div>
        <div class="asset-info">
          <span class="asset-name">${asset.name}</span>
          <span class="asset-balance">${asset.bal}</span>
        </div>
        <div class="asset-fiat">${asset.fiat}</div>
      `;
      assetsList.appendChild(item);
    });
  };

  const formatAddress = (addr) =>
    addr ? addr.substring(0, 6) + "..." + addr.substring(addr.length - 4) : "";

  // Confirm Modal
  const confirmModal = document.getElementById("confirm-modal");
  const confirmModalTitle = document.getElementById("confirm-modal-title");
  const confirmModalMessage = document.getElementById("confirm-modal-message");
  const confirmModalCancelBtn = document.getElementById("confirm-modal-cancel");
  const confirmModalConfirmBtn = document.getElementById(
    "confirm-modal-confirm",
  );

  const showConfirmModal = (message, title) => {
    return new Promise((resolve) => {
      confirmModalTitle.textContent = title || "Are you sure?";
      confirmModalMessage.textContent = message;
      confirmModal.classList.remove("hidden");

      const cleanup = (result) => {
        confirmModal.classList.add("hidden");
        confirmModalConfirmBtn.removeEventListener("click", onConfirm);
        confirmModalCancelBtn.removeEventListener("click", onCancel);
        resolve(result);
      };
      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);

      confirmModalConfirmBtn.addEventListener("click", onConfirm);
      confirmModalCancelBtn.addEventListener("click", onCancel);
    });
  };

  const updateUI = async (res) => {
    currentNetworkId = res.activeNetworkId || "desktop_connection";

    // Populate Custom Networks
    const baseNetworks = [
      {
        id: "desktop_connection",
        name:
          translations["extension.wallet.desktopConnection"] ||
          "Desktop Connection",
      },
    ];
    networkOptions.innerHTML = "";

    let activeNetName = "Unknown Network";
    [...baseNetworks, ...(res.customNetworks || [])].forEach((net) => {
      const li = document.createElement("li");
      li.dataset.value = net.id;
      if (res.activeNetworkId === net.id) {
        activeNetName = net.name;
      }

      if (net.id === "desktop_connection") {
        li.textContent = net.name;
        li.addEventListener("click", () => {
          networkSelectedText.textContent = net.name;
          currentNetworkId = net.id;
          chrome.runtime.sendMessage({
            action: "SWITCH_NETWORK",
            networkId: net.id,
          });
        });
      } else {
        const wrapper = document.createElement("div");
        wrapper.className = "net-item";

        const nameSpan = document.createElement("span");
        nameSpan.className = "net-item-name";
        nameSpan.textContent = net.name;

        const kebabBtn = document.createElement("button");
        kebabBtn.className = "kebab-trigger";
        kebabBtn.innerHTML = "&#8942;";
        kebabBtn.title = "Options";

        wrapper.appendChild(nameSpan);
        wrapper.appendChild(kebabBtn);
        li.appendChild(wrapper);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "kebab-actions hidden";

        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          actionsDiv.classList.add("hidden");
          const nameInput = document.getElementById("network-name-input");
          const rpcInput = document.getElementById("rpc-url-input");
          const chainInput = document.getElementById("chain-id-input");
          if (nameInput) nameInput.value = net.name || "";
          if (rpcInput) rpcInput.value = net.rpcUrl || "";
          if (chainInput) chainInput.value = net.chainId || "";
          defaultView.classList.add("hidden");
          addNetworkView.classList.remove("hidden");
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "kebab-delete";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          actionsDiv.classList.add("hidden");
          const confirmed = await showConfirmModal(
            "Are you sure you want to delete this network?",
            "Delete Network",
          );
          if (confirmed) {
            chrome.runtime.sendMessage({
              action: "DELETE_NETWORK",
              networkId: net.id,
            });
          }
        });

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        li.appendChild(actionsDiv);

        kebabBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          document.querySelectorAll(".kebab-actions").forEach((el) => {
            if (el !== actionsDiv) el.classList.add("hidden");
          });
          actionsDiv.classList.toggle("hidden");
        });

        nameSpan.addEventListener("click", () => {
          networkSelectedText.textContent = net.name;
          currentNetworkId = net.id;
          chrome.runtime.sendMessage({
            action: "SWITCH_NETWORK",
            networkId: net.id,
          });
        });
      }

      networkOptions.appendChild(li);
    });
    networkSelectedText.textContent = activeNetName;

    // Handle View Mode & Account Populate
    let currentAddress = null;
    accountOptions.innerHTML = "";

    const placeholderText =
      translations["extension.wallet.selectAccount"] || "Select Account";
    let activeAccName = placeholderText;

    let isStandaloneSelected = false;
    let isDesktopSelected = false;
    const trackingSet = new Set();

    // Local standalone wallets
    (res.wallets || []).forEach((w) => {
      if (w.address) trackingSet.add(w.address.toLowerCase());
      const li = document.createElement("li");
      li.dataset.mode = "standalone";
      li.dataset.value = w.address;
      const text = `${formatAddress(w.address)} (${translations["extension.wallet.imported"] || "Imported"})`;
      li.textContent = text;

      if (
        res.connectionMode === "standalone" &&
        w.address === res.activeStandaloneAddress
      ) {
        activeAccName = text;
        currentAddress = w.address;
        currentAccountMode = "standalone";
        isStandaloneSelected = true;
      }

      li.addEventListener("click", () => {
        chrome.runtime.sendMessage({
          action: "SWITCH_ACCOUNT",
          address: w.address,
          mode: "standalone",
        });
      });
      accountOptions.appendChild(li);
    });

    // Desktop wallets
    if (
      res.isLinked &&
      res.walletState &&
      Array.isArray(res.walletState.accounts) &&
      res.walletState.accounts.length > 0
    ) {
      res.walletState.accounts.forEach((acc) => {
        if (acc && trackingSet.has(acc.toLowerCase())) return;
        if (acc) trackingSet.add(acc.toLowerCase());
        const li = document.createElement("li");
        li.dataset.mode = "desktop";
        li.dataset.value = acc;
        const text = `${formatAddress(acc)} (${translations["extension.wallet.desktop"] || "Desktop"})`;
        li.textContent = text;

        if (
          res.connectionMode === "desktop" &&
          res.walletState.address === acc
        ) {
          activeAccName = text;
          currentAddress = acc;
          currentAccountMode = "desktop";
          isDesktopSelected = true;
        }

        li.addEventListener("click", () => {
          chrome.runtime.sendMessage({
            action: "SWITCH_ACCOUNT",
            address: acc,
            mode: "desktop",
          });
        });
        accountOptions.appendChild(li);
      });
    }

    // Add Wallet Option
    const addLi = document.createElement("li");
    addLi.dataset.value = "add_wallet";
    addLi.textContent = `+ ${translations["extension.wallet.addWallet"] || "Add Wallet"}`;
    addLi.addEventListener("click", () => {
      defaultView.classList.add("hidden");
      selectionView.classList.remove("hidden");
    });
    accountOptions.appendChild(addLi);

    accountSelectedText.textContent = activeAccName;
    currentAccountAddress = currentAddress || "";

    const deleteBtn = document.getElementById("delete-wallet-btn");
    if (
      res.connectionMode === "standalone" &&
      currentAddress &&
      (res.wallets || []).some((w) => w.address === currentAddress)
    ) {
      deleteBtn.classList.remove("hidden");
    } else {
      deleteBtn.classList.add("hidden");
    }

    // Adjust view layout and balances based on connection mode
    if (res.connectionMode === "standalone") {
      loginView.classList.add("hidden");
      selectionView.classList.add("hidden");
      defaultView.classList.remove("hidden");
      addNetworkView.classList.add("hidden");

      connectedStatus.style.borderColor = "var(--border-color)";
      statusText.textContent =
        translations["extension.wallet.standaloneMode"] || "Standalone Mode";
    } else {
      if (res.isLinked) {
        loginView.classList.add("hidden");
        selectionView.classList.add("hidden");
        defaultView.classList.remove("hidden");
        addNetworkView.classList.add("hidden");

        if (res.isReconnecting) {
          connectedStatus.style.borderColor = "var(--warning-color, orange)";
          statusText.textContent =
            translations["extension.wallet.reconnecting"] || "Reconnecting...";
        } else {
          connectedStatus.style.borderColor = "var(--border-color)";
          statusText.textContent =
            translations["extension.wallet.desktopMode"] ||
            "Connected to CointMU App";
        }
      } else {
        loginView.classList.add("hidden");
        selectionView.classList.remove("hidden");
        defaultView.classList.add("hidden");
        addNetworkView.classList.add("hidden");
      }
    }
    renderBridgeNotice(res.isLinked ? null : res.bridgeNotice);

    // Adaptive Asset Fetching
    const customNet = (res.customNetworks || []).find(
      (n) => n.id === res.activeNetworkId,
    );

    if (customNet && currentAddress) {
      renderAssets("--", "ETH");
      let rpcUrl = customNet.rpcUrl;
      if (!rpcUrl.startsWith("http")) {
        rpcUrl = "http://" + rpcUrl;
      }
      if (rpcUrl === "http://localhost") {
        rpcUrl = "http://127.0.0.1:8545";
      }
      try {
        const parsedChainId = Number(customNet.chainId);
        const validChainId =
          !isNaN(parsedChainId) && parsedChainId > 0
            ? parsedChainId
            : undefined;
        const provider = new globalThis.ethers.JsonRpcProvider(
          rpcUrl,
          validChainId,
          { staticNetwork: true },
        );
        provider
          .getBalance(currentAddress)
          .then((bal) => {
            if (currentAccountAddress === currentAddress) {
              renderAssets(globalThis.ethers.formatEther(bal), "ETH");
            }
          })
          .catch((err) => {
            console.error("Failed to fetch from custom RPC", err);
            if (currentAccountAddress === currentAddress) {
              renderAssets("--", "Offline");
            }
          });
      } catch (err) {
        console.error("Failed to initialize provider", err);
        renderAssets("--", "Offline");
      }
    } else if (
      res.activeNetworkId === "desktop_connection" &&
      res.connectionMode === "desktop" &&
      res.walletState
    ) {
      renderAssets(res.walletState.balance, "CMU");
    } else {
      renderAssets("0.00", "CMU");
    }
  };

  chrome.runtime.sendMessage({ action: "GET_CURRENT_STATE" }, (res) => {
    if (res) {
      updateUI(res);
      if (res.isLinked && res.connectionMode === "desktop") {
        chrome.runtime.sendMessage({ action: "AUTO_RECONNECT" });
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      chrome.runtime.sendMessage({ action: "GET_CURRENT_STATE" }, (res) => {
        if (res) updateUI(res);
      });
    }
  });

  importBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const pk = privKeyInput.value.trim();
    if (!pk) return;
    chrome.runtime.sendMessage(
      { action: "IMPORT_PRIVATE_KEY", privateKey: pk },
      (res) => {
        if (res && res.success) {
          privKeyInput.value = "";
          loginView.classList.add("hidden");
          defaultView.classList.remove("hidden");

          chrome.runtime.sendMessage(
            { action: "GET_CURRENT_STATE" },
            (newState) => {
              if (newState) updateUI(newState);
            },
          );
        } else {
          alert(
            translations["extension.wallet.importFailed"] ||
              "Failed to import key",
          );
        }
      },
    );
  });

  cancelImportBtn.addEventListener("click", () => {
    loginView.classList.add("hidden");
    defaultView.classList.remove("hidden");
  });

  selectImportBtn.addEventListener("click", () => {
    selectionView.classList.add("hidden");
    loginView.classList.remove("hidden");
  });

  selectLinkBtn.addEventListener("click", () => {
    selectLinkBtn.disabled = true;
    selectLinkBtn.querySelector("span").textContent =
      translations["extension.wallet.waitingApproval"] ||
      "Waiting for approval...";

    chrome.runtime.sendMessage({ action: "REQUEST_LINK" }, (res) => {
      selectLinkBtn.disabled = false;
      if (!res || !res.success) {
        selectLinkBtn.querySelector("span").textContent =
          translations["extension.wallet.selectLinkBtn"] ||
          "Link to Desktop App";
        alert(
          (res && res.error) ||
            "Could not reach CointMU Desktop App. Make sure it's running and try again.",
        );
      }
    });
  });

  cancelSelectionBtn.addEventListener("click", () => {
    selectionView.classList.add("hidden");
    defaultView.classList.remove("hidden");
  });

  addNetworkBtn.addEventListener("click", () => {
    defaultView.classList.add("hidden");
    addNetworkView.classList.remove("hidden");
  });

  const deleteBtn = document.getElementById("delete-wallet-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const confirmed = await showConfirmModal(
        translations["extension.wallet.deleteWalletConfirm"] ||
          "Are you sure you want to remove this wallet?",
      );
      if (confirmed && currentAccountAddress) {
        chrome.runtime.sendMessage({
          action: "DELETE_WALLET",
          address: currentAccountAddress,
        });
      }
    });
  }

  cancelNetworkBtn.addEventListener("click", () => {
    addNetworkView.classList.add("hidden");
    defaultView.classList.remove("hidden");
  });

  saveNetworkBtn.addEventListener("click", () => {
    const name = document.getElementById("network-name-input").value.trim();
    const rpcUrl = document.getElementById("rpc-url-input").value.trim();
    const chainId = document.getElementById("chain-id-input").value.trim();
    if (!name || !rpcUrl) {
      if (networkErrorMsg) {
        networkErrorMsg.textContent = "Name and RPC URL are required.";
        networkErrorMsg.classList.remove("hidden");
      }
      return;
    }

    const parsedChainId = Number(chainId);
    if (!chainId || isNaN(parsedChainId) || parsedChainId <= 0) {
      if (networkErrorMsg) {
        networkErrorMsg.textContent =
          "Chain ID must be a valid positive number.";
        networkErrorMsg.classList.remove("hidden");
      }
      return;
    }

    if (networkErrorMsg) {
      networkErrorMsg.classList.add("hidden");
    }

    chrome.runtime.sendMessage(
      { action: "ADD_CUSTOM_NETWORK", name, rpcUrl, chainId },
      (res) => {
        if (res && res.success) {
          document.getElementById("network-name-input").value = "";
          document.getElementById("rpc-url-input").value = "";
          document.getElementById("chain-id-input").value = "";
          addNetworkView.classList.add("hidden");
          defaultView.classList.remove("hidden");
        }
      },
    );
  });

  if (actionSendBtn) {
    actionSendBtn.addEventListener("click", () => {
      defaultView.classList.add("hidden");
      sendView.classList.remove("hidden");
    });
  }

  if (sendCancelBtn) {
    sendCancelBtn.addEventListener("click", () => {
      sendToInput.value = "";
      sendAmountInput.value = "";
      sendView.classList.add("hidden");
      defaultView.classList.remove("hidden");
    });
  }

  if (sendConfirmBtn) {
    sendConfirmBtn.addEventListener("click", () => {
      const to = sendToInput.value.trim();
      const amount = sendAmountInput.value.trim();
      if (!to || !amount || isNaN(amount)) {
        alert("Valid recipient and amount are required");
        return;
      }

      sendConfirmBtn.querySelector("span").textContent =
        translations["extension.wallet.sendInProgress"] || "Sending...";
      sendConfirmBtn.disabled = true;

      chrome.runtime.sendMessage(
        {
          action: "EXECUTE_SEND",
          to,
          amount,
          mode: currentAccountMode,
          networkId: currentNetworkId,
          from: currentAccountAddress,
        },
        (res) => {
          sendConfirmBtn.disabled = false;
          sendConfirmBtn.querySelector("span").textContent =
            translations["extension.wallet.sendConfirmBtn"] || "Confirm";
          if (res && res.success) {
            alert(
              (translations["extension.wallet.sendSuccess"] ||
                "Transaction Sent!") + (res.hash ? " Hash: " + res.hash : ""),
            );
            sendCancelBtn.click();
          } else {
            alert(
              (translations["extension.wallet.sendFailed"] ||
                "Transaction Failed") +
                ": " +
                (res?.error || "Unknown error"),
            );
          }
        },
      );
    });
  }
}
