class KashiCooker {
    constructor(pair, web3, userAddress) {
        this.web3 = web3
        this.pair = pair
        this.address = userAddress
        this.contract = this.web3.contract("kashipair", this.pair.address).methods

        this.actions = []
        this.values = []
        this.datas = []

        // Functions that need accrue to be called
        this.ACTION_ADD_ASSET = 1;
        this.ACTION_REPAY = 2;
        this.ACTION_REMOVE_ASSET = 3;
        this.ACTION_REMOVE_COLLATERAL = 4;
        this.ACTION_BORROW = 5;
        this.ACTION_GET_REPAY_SHARE = 6;
        this.ACTION_GET_REPAY_PART = 7;
        this.ACTION_ACCRUE = 8;

        // Functions that don't need accrue to be called
        this.ACTION_ADD_COLLATERAL = 10;
        this.ACTION_UPDATE_EXCHANGE_RATE = 11;

        // Function on BentoBox
        this.ACTION_BENTO_DEPOSIT = 20;
        this.ACTION_BENTO_WITHDRAW = 21;
        this.ACTION_BENTO_TRANSFER = 22;
        this.ACTION_BENTO_TRANSFER_MULTIPLE = 23;
        this.ACTION_BENTO_SETAPPROVAL = 24;

        // Any external call (except to BentoBox)
        this.ACTION_CALL = 30;
    }

    async approve() {
        const permit = await signMasterContractApproval(this.web3, this.web3.kashipair.address, this.address, true)

        this.actions.push(this.ACTION_BENTO_SETAPPROVAL)
        this.values.push(0)
        this.datas.push(this.web3.eth.abi.encodeParameters(["address", "address", "bool", "uint8", "bytes32", "bytes32"], [this.address, this.web3.kashipair.address, true, permit.v, permit.r, permit.s]))
        return this
    }

    async addCollateral(amountInput) {
        const amount = Decimal(amountInput).toInt(this.pair.collateral.decimals)
        const share = await this.web3.bentobox.toShare(this.pair.collateral.address, amount, true).call()

        this.actions.push(this.ACTION_ADD_COLLATERAL)
        this.values.push(0)
        this.datas.push(this.web3.eth.abi.encodeParameters(["int256", "address", "bool"], [share, this.address, false]))
        return this
    }

    async depositCollateral(amountInput) {
        // TODO: WETH
        const amount = Decimal(amountInput).toInt(this.pair.collateral.decimals)

        this.actions.push(this.ACTION_BENTO_DEPOSIT, this.ACTION_ADD_COLLATERAL)
        this.values.push(0, 0)
        this.datas.push(
            this.web3.eth.abi.encodeParameters(["address", "address", "int256", "int256"], [this.pair.collateral.address, this.address, amount, 0]),
            this.web3.eth.abi.encodeParameters(["int256", "address", "bool"], [-2, this.address, false])
        )
        return this
    }

    async addAsset(amountInput) {
        const amount = Decimal(amountInput).toInt(this.pair.asset.decimals)
        this.actions.push(this.ACTION_BENTO_DEPOSIT, this.ACTION_ADD_ASSET)
        this.values.push(0, 0)
        this.datas.push(
            this.web3.eth.abi.encodeParameters(["address", "address", "int256", "int256"], [this.pair.asset.address, this.address, amount, 0]),
            this.web3.eth.abi.encodeParameters(["int256", "address", "bool"], [-2, this.address, false])
        )
        return this
    }

    async borrow(amountInput) {
        const amount = Decimal(amountInput).toInt(this.pair.asset.decimals)
        this.actions.push(this.ACTION_BORROW)
        this.values.push(0)
        this.datas.push(this.web3.eth.abi.encodeParameters(["uint256", "address"], [amount, this.address]))
        return this
    }

    async cook() {
        return this.contract.cook(
            this.actions,
            this.values,
            this.datas
        ).send({ from: this.address })
    }
}

