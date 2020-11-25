// Handles connecting to wallets, changing address, chain and subscribes to new block notifications.
class Web3Manager {
    constructor(web3) {
        this.web3 = web3;
        this.addresses = [];

        this.block = 0n;
        this.address = null;
        this.currency = null;
        this.provider = "Unknown";
        this.connected = false;
        this.chainId = "";

        let self = this;

        if (window.ethereum) {
            this.web3 = new Web3(window.ethereum);
            if (window.ethereum.isMetaMask) {
                console.log("MetaMask detected.")

                this.provider = 'MetaMask';
            }
            
            else {
                console.log("Non MetaMask provider detected.")

                this.provider = 'Other';
            }

            // This code is for MetaMask, but trying also for others.
            ethereum.on('connect', (info) => this.onConnected(self, info));
            ethereum.on('disconnect', (error) => this.onDisconnected(self, error));
            ethereum.on('accountsChanged', (a) => this.handleAccountsChanged(self, a));
            //ethereum.on('chainChanged', () => window.location.reload());
            this.connected = window.ethereum.isConnected();
            window.ethereum.autoRefreshOnNetworkChange = false;

            if (this.connected) {
                this.onConnected(this);
            }
        }
        else {
            this.provider = "None";
        }
    }

    async onConnected(self) {
        try {
            self.chainId = this.web3.givenProvider.chainId;
            console.log("Connected to Web3... chain: " + self.chainId);
            self.connected = window.ethereum.isConnected();
            if (self.chainId == "0x1") {
                self.currency = "0xdac17f958d2ee523a2206206994597c13d831ec7";
            }
            else if (self.chainId == "0x3") {
                self.currency = "0x292c703A980fbFce4708864Ae6E8C40584DAF323";
            }
        }
        catch { 
            self.chainId = "0x1";
            self.currency = "0xdac17f958d2ee523a2206206994597c13d831ec7";
            console.log(self.connected, "connected")
        }

        self.hash = "";
        self.header = {};

        self.subscription = self.web3.eth.subscribe('newBlockHeaders', (error, result) => {
            if (error) { return };

            self.block = result.number;
            self.hash = result.hash;
            self.header = result.header;
        });

        console.log('Setting block...');
        self.block = await this.web3.eth.getBlockNumber();
        console.log('Set block.', self.block, self);
    }

    onDisconnected(self) {
        self.connected = window.ethereum.isConnected();
        console.log("Disconnected");
        // Force reload? Even better, prompt user to reload.
    }

    handleAccountsChanged(self, addresses) {
        if (addresses && addresses.length) {
            self.address = addresses[0];
            for (let i in addresses) {
                if (self.addresses.indexOf(addresses[i].toLowerCase()) == -1) {
                    self.addresses.push(addresses[i].toLowerCase());
                }
            }
        }
    }

    async connect() {
        let addresses = await window.ethereum.request({ method: 'eth_accounts' });
        if (addresses && addresses.length) {
            this.handleAccountsChanged(this, addresses);
        }
        else {
            console.log("No address was retrieved. Fallback to .enable()");
            let addresses = await window.ethereum.enable();
            this.handleAccountsChanged(this, addresses);
        }
    }

    async connectWC() {
        this.wcProvider = await new WalletConnectProvider.default({
            infuraId: "3f78f4c272f34d399b8529f5cc84438f"
        });

        this.wcProvider.on("disconnect", (code, reason) => {
            this.onWCDisconnected();
            console.log(code, reason);
          });

        try { await this.wcProvider.enable(); }
        catch(err) {
            return;
        }
        this.connected = true;
        this.provider = "WalletConnect"
        this.web3 = new Web3(this.wcProvider)
        this.handleAccountsChanged(this, await this.web3.eth.getAccounts());
        this.onConnected(this)
    }

    onWCDisconnected() {
        this.connected = false;
    }

    close() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
    }
}