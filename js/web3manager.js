// Handles connecting to wallets, changing address, chain and subscribes to new block notifications.
class Web3Manager {
    constructor(web3) {
        this.web3 = web3
        this.addresses = []

        this.block = 0n
        this.address = null
        this.currency = null
        this.provider = "Unknown"
        this.connected = false
        this.chainId = ""

        let self = this

        if (window.ethereum) {
            this.web3 = new Web3(window.ethereum)
            if (window.ethereum.isMetaMask) {
                console.log("MetaMask detected.")
                this.provider = "MetaMask"
            } else {
                console.log("Non MetaMask provider detected.")
                this.provider = "Other"
            }

            // This code is for MetaMask, but trying also for others.
            ethereum.on("connect", (info) => this.onConnected(self, info.chainId))
            ethereum.on("disconnect", (error) => this.onDisconnected(self, error))
            ethereum.on("accountsChanged", (addresses) => this.handleAccountsChanged(self, addresses))
            ethereum.on('chainChanged', (_chainId) => this.onConnected(self, _chainId));
            this.connected = window.ethereum.isConnected()

            if (this.connected) {
                console.log("Ethereum connected to ", window.ethereum.selectedAddress)
                this.onConnected(this, this.chainId)
            }
        } else {
            console.log("No Ethereum provider found")
            this.provider = "None"
        }
    }

    async onConnected(self, chainId) {
        try {
            ethereum.autoRefreshOnNetworkChange = false;
            chainId = window.ethereum.chainId || chainId
            if (chainId == "0x7a69") {
                console.log("Overriding hardhat chainId with 0x1")
                chainId = "0x1"

                $.getJSON( "/deployments/localhost/BoringHelper.json", function( data ) {
                    addContract("boringHelper", data.abi, {"0x1": data.address })
                });                
            }
            self.chainId = chainId
            objAssign(self, settings[chainId])
            console.log("Connected to Web3... chain: " + self.chainId)
            self.connected = window.ethereum.isConnected()
            if (window.ethereum.selectedAddress) {
                this.handleAccountsChanged(self, [window.ethereum.selectedAddress])
            }
        } catch(e) {
            self.chainId = "0x1"
            console.log("ERROR:", e)
        }

        self.hash = ""
        self.header = {}

        self.subscription = self.web3.eth.subscribe("newBlockHeaders", (error, result) => {
            if (error) {
                return
            }

            self.block = result.number
            self.hash = result.hash
            self.header = result.header
            console.log("Current block is", self.block)
        })

        self.block = await this.web3.eth.getBlockNumber()
        console.log("Current block is", self.block)
    }

    onDisconnected(self) {
        self.connected = window.ethereum.isConnected()
        console.log("Disconnected")
    }

    addAddresses(self, addresses) {
        for (let i in addresses) {
            if (self.addresses.indexOf(addresses[i].toLowerCase()) == -1) {
                self.addresses.push(addresses[i].toLowerCase())
            }
        }
    }

    handleAccountsChanged(self, addresses) {
        if (addresses && addresses.length) {
            self.address = addresses[0]
            console.log("Address set to", this.address)
            self.addAddresses(self, addresses)
        }
    }

    async connect() {
        let addresses = await window.ethereum.request({ method: "eth_accounts" })
        if (addresses && addresses.length) {
            this.handleAccountsChanged(this, addresses)
        } else {
            console.log("No address was retrieved. Fallback to .enable()")
            let addresses = await window.ethereum.enable()
            this.handleAccountsChanged(this, addresses)
        }
    }

    async connectWC() {
        this.wcProvider = await new WalletConnectProvider.default({
            infuraId: "0b35757c1ff44e90" + "b2494118a98962dc",
        })

        this.wcProvider.on("disconnect", (code, reason) => {
            this.onWCDisconnected()
            console.log(code, reason)
        })

        try {
            await this.wcProvider.enable()
        } catch (err) {
            return
        }
        this.connected = true
        this.provider = "WalletConnect"
        this.web3 = new Web3(this.wcProvider)
        this.handleAccountsChanged(this, await this.web3.eth.getAccounts())
        this.onConnected(this)
    }

    onWCDisconnected() {
        this.connected = false
    }

    close() {
        if (this.subscription) {
            this.subscription.unsubscribe()
        }
    }
}
