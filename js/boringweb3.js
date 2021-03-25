﻿// Add ability to serialize BigInt as JSON
JSON.stringifyBigInt = function (obj) {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === "bigint") {
            return value.toString() + "n"
        } else {
            return value
        }
    })
}

JSON.parseBigInt = function (str) {
    return JSON.parse(str, (key, value) => {
        if (typeof value === "string" && /^-?\d+n$/.test(value)) {
            return BigInt(value.slice(0, -1))
        }
        return value
    })
}

objAssign = function (to, from) {
    if (window.Vue) {
        for (let i in from) {
            if (to[i] instanceof Value) {
                to[i].value = from[i] instanceof Value ? from[i].value : from[i]
            } else {
                Vue.set(to, i, from[i])
            }
        }
    } else {
        Object.assign(to, from)
    }
    return to
}

rpcToObj = function (rpc_obj, obj) {
    if (!obj) {
        obj = {}
    }
    if (typeof(rpc_obj) == "object") {
        if (Object.keys(rpc_obj).length && isNaN(Object.keys(rpc_obj)[Object.keys(rpc_obj).length - 1])) {
            for (let i in rpc_obj) {
                if (isNaN(i)) {
                    // Not always correct, but overall useful
                    try {
                        const value =
                            isNaN(rpc_obj[i]) ||
                            i.indexOf("name") != -1 ||
                            i.indexOf("symbol") != -1 ||
                            typeof rpc_obj[i] == "boolean" ||
                            (typeof rpc_obj[i] == "string" && rpc_obj[i].startsWith("0x")) ||
                            typeof rpc_obj[i] == "object"
                                ? rpcToObj(rpc_obj[i])
                                : BigInt(rpc_obj[i])

                        if (obj[i] instanceof Value) {
                            obj[i].value = value
                        } else {
                            obj[i] = value
                        }
                    } catch (e) {
                        console.log("rpcToObj error", rpc_obj[i], typeof rpc_obj[i])
                    }
                }
            }
            return obj
        }
        return rpc_obj.map(item => rpcToObj(item));
    }
    return rpc_obj
}

paramsToObj = function (params, obj) {
    if (!obj) {
        obj = {}
    }
    params.forEach(param => obj[param.name] = param.value)
    return obj
}

groupBy = function(data, key) {
    return data.reduce(function(rv, x) {
      (rv[x[key]] = rv[x[key]] || []).push(x);
      return rv;
    }, {});
};

// Makes calling contracts easier, by adding the contracts to every instance of Web3.
// Changing the network is automatically dealt with.
// New way of using: web3.contract_name.method_name(parameters).call() or .send()
function addContract(name, abi, addresses) {
    Object.defineProperty(Web3.prototype, name, {
        get: function () {
            let web3 = this
            let chainId = web3.currentProvider.chainId == "1" ? "0x1" : web3.currentProvider.chainId
            if (chainId == "0x7a69") {
                chainId = "0x1"
            }
            return new Proxy(
                {},
                {
                    get: function (target, method) {
                        if (method == "address") {
                            return addresses[chainId]
                        }

                        console.log("Running", name + "." + method)
                        return function (...params) {
                            let contract = new web3.eth.Contract(abi, addresses[chainId])
                            const result = contract.methods[method](...params)
                            return result
                        }
                    },
                }
            )
        },
        configurable: true,
    })
}

Web3.prototype.contract = function (abi_name, address) {
    return new this.eth.Contract(abis[abi_name], address)
}

// Add a decode method to all web3 instances
// To get the ABI decoder, use web3.decode.abi_name
Object.defineProperty(Web3.prototype, "decode", {
    get: function () {
        let web3 = this
        return new Proxy(
            {},
            {
                get: function (target, name) {
                    let decoder = new Decoder(web3)
                    decoder.addABI(abis[name])
                    return decoder
                },
            }
        )
    },
})

Object.defineProperty(Web3.prototype, "ens", {
    get: function () {
        return new ENS(this)
    },
})

const MAX_INT = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
const ETHEREUM_ADDRESS = "0x0000000000000000000000000000000000000000"

async function signERC2612Permit(web3, token, owner, spender, value, deadline, nonce) {
    const message = {
        owner,
        spender,
        value,
        nonce: nonce || (await web3.contract("pair", token).methods.nonces(owner).call()),
        deadline: deadline || MAX_INT,
    }

    const typedData = {
        types: {
            EIP712Domain: [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" },
            ],
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        },
        primaryType: "Permit",
        domain: {
            name: await web3.contract("erc20", token).methods.name().call(),
            version: "1",
            chainId: 1,
            verifyingContract: token,
        },
        message: message,
    }

    return new Promise((resolutionFunc, rejectionFunc) => {
        web3.currentProvider.sendAsync(
            {
                method: "eth_signTypedData_v4",
                params: [owner, JSON.stringify(typedData)],
                from: owner,
            },
            function (error, result) {
                if (!error) {
                    const signature = result.result.substring(2)
                    const r = "0x" + signature.substring(0, 64)
                    const s = "0x" + signature.substring(64, 128)
                    const v = parseInt(signature.substring(128, 130), 16)
                    resolutionFunc({ r, s, v, deadline: message.deadline })
                }
            }
        )
    })
}

async function signMasterContractApproval(web3, masterContract, user, approved, nonce) {
    const warning = approved 
        ? "Give FULL access to funds in (and approved to) BentoBox?" 
        : "Revoke access to BentoBox?"
    if (!nonce) {
        console.log("Getting nonce")
        nonce = await web3.bentobox.nonces(user).call()
    }
    const message = {
        warning,
        user,
        masterContract,
        approved,
        nonce
    }

    // EIP712Domain(string name,uint256 chainId,address verifyingContract)
    // SetMasterContractApproval(string warning,address user,address masterContract,bool approved,uint256 nonce)
    const typedData = {
        types: {
            EIP712Domain: [
                { name: "name", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" },
            ],
            SetMasterContractApproval: [
                { name: "warning", type: "string" },
                { name: "user", type: "address" },
                { name: "masterContract", type: "address" },
                { name: "approved", type: "bool" },
                { name: "nonce", type: "uint256" },
            ],
        },
        primaryType: "SetMasterContractApproval",
        domain: {
            name: "BentoBox V1",
            chainId: web3.utils.hexToNumber(app.manager.chainId),
            verifyingContract: web3.bentobox.address,
        },
        message: message,
    }

    return new Promise((resolutionFunc, rejectionFunc) => {
        web3.currentProvider.sendAsync(
            {
                method: "eth_signTypedData_v4",
                params: [user, JSON.stringify(typedData)],
                from: user,
            },
            function (error, result) {
                if (!error) {
                    const signature = result.result.substring(2)
                    const r = "0x" + signature.substring(0, 64)
                    const s = "0x" + signature.substring(64, 128)
                    const v = parseInt(signature.substring(128, 130), 16)
                    resolutionFunc({ r, s, v })
                }
            }
        )
    })
}

// Registered contracts
addContract("sushi", abis.sushi, {
    "0x1": "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
    "0x3": "0x07be118a973287c1CaA58AE0c2443a2f37CC06FC",
})

addContract("chef", abis.chef, {
    "0x1": "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd",
    "0x3": "0x80c7dd17b01855a6d2347444a0fcc36136a314de",
})

addContract("factory", abis.factory, {
    "0x1": "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
    "0x3": "0xEF2B6f8fDd5c264f2fAAFa1F911486EF7Ac0cF11",
    "0x2a": "0xEF2B6f8fDd5c264f2fAAFa1F911486EF7Ac0cF11",
})

addContract("router", abis.router, {
    "0x1": "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    "0x3": "0xE411Ff7aAb910Fd471866cfE67D12C06fac18084",
    "0x2a": "0xE411Ff7aAb910Fd471866cfE67D12C06fac18084",
})

addContract("bar", abis.bar, {
    "0x1": "0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272",
    "0x3": "0xD1c50c6597f0800c6669B17a678c52ED477E4Bd3",
})

addContract("maker", abis.maker, {
    "0x1": "0xE11fc0B43ab98Eb91e9836129d1ee7c3Bc95df50",
    "0x3": "0x06F1E375aB9eE8D6fD10F85217ceEA1DE",
})

addContract("bentobox", abis.bentobox, {
    "0x1": "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966",
    "0x3": "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966",
    "0x2a": "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966"
})

addContract("timelock", abis.timelock, {
    "0x1": "0x9a8541ddf3a932a9a922b607e9cf7301f1d47bd1",
})

addContract("kashipair", abis.kashipair, { 
    "0x1": "0x74A81CB5b6996d9347b864b9a1492a6509e51e65",
    "0x3": "0x74A81CB5b6996d9347b864b9a1492a6509e51e65",
    "0x2a": "0x74A81CB5b6996d9347b864b9a1492a6509e51e65"
});

addContract("peggedoracle", abis.peggedoracle, {
    "0x1": "0x6cbfbB38498Df0E1e7A4506593cDB02db9001564",
    "0x3": "0x6cbfbB38498Df0E1e7A4506593cDB02db9001564",
    "0x2a": "0x6cbfbB38498Df0E1e7A4506593cDB02db9001564"
})

addContract("chainlinkoraclev1", abis.chainlinkoracle, {
    "0x1": "0xD766147Bc5A0044a6b4f4323561B162870FcBb48",
    "0x3": "0xD766147Bc5A0044a6b4f4323561B162870FcBb48",
    "0x2a": "0xD766147Bc5A0044a6b4f4323561B162870FcBb48"
})

addContract("chainlinkoracle", abis.chainlinkoracle, {
    "0x1": "0x00632CFe43d8F9f8E6cD0d39Ffa3D4fa7ec73CFB",
    "0x3": "0x00632CFe43d8F9f8E6cD0d39Ffa3D4fa7ec73CFB",
    "0x2a": "0x00632CFe43d8F9f8E6cD0d39Ffa3D4fa7ec73CFB"
})

addContract("boringhelper", abis.boringhelper, { 
    "0x1": "0x11Ca5375AdAfd6205E41131A4409f182677996E6",
    "0x3": "0x11Ca5375AdAfd6205E41131A4409f182677996E6",
    "0x2a": "0x11Ca5375AdAfd6205E41131A4409f182677996E6",
});

addContract("faucet", abis.faucet, { 
    "0x3": "0xe62661131645fcdf45b17910e490ea845201e819",
    "0x2a": "0x5546e0295c7bb85b2fC00883B6025BA0Db06e50A"
});

addContract("salary", abis.salary, { 
    "0x507": "0xF0635e49Dd9dDeE706A34259befFEBf6466c6eAD"
});

settings = {
    "0x1": {
        chainName: "Ethereum",
        native_token: { "address": ETHEREUM_ADDRESS, "name": "Ethereum", "symbol": "ETH", "decimals": 18n, "rate": 1000000000000000000n },
        currency: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        wrappedNative: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
    },
    "0x3": {
        chainName: "Ropsten",
        native_token: { "address": ETHEREUM_ADDRESS, "name": "Ethereum", "symbol": "ETH", "decimals": 18n, "rate": 1000000000000000000n },
        currency: "0x292c703A980fbFce4708864Ae6E8C40584DAF323"
    },
    "0x2a": {
        chainName: "Kovan",
        native_token: { "address": ETHEREUM_ADDRESS, "name": "Ethereum", "symbol": "ETH", "decimals": 18n, "rate": 1000000000000000000n },
        currency: "0x07de306FF27a2B630B1141956844eB1552B956B5",
        wrappedNative: "0xd0A1E359811322d97991E03f863a0C30C2cF029C"
    },
    "0x507": {
        chainName: "Moonbeam Alpha",
        native_token: { "address": ETHEREUM_ADDRESS, "name": "Moonbeam Alphanet", "symbol": "DEV", "decimals": 18n, "rate": 1000000000000000000n },
        currency: "0x292c703A980fbFce4708864Ae6E8C40584DAF323",
        wrappedNative: "0xe73763db808eccdc0e36bc8e32510ed126910394"
    }
}

//addContract("peggedoracle", abis.peggedoracle, { "0x1": "0x461386ec09FfDd372af72f1f278ff7a730E5b8D1", "0x3": "0xb5C8A2d1C8d393Dace7b3C1D98f35d645A1cD1fc" });
//addContract("compoundoracle", abis.compoundoracle, { "0x1": "0x70f4EF6cC5f7B2c29056d1b4dbfd26D5cAf857Cc", "0x3": "0xf1EFAf821B7FE3CCdFA1dC2b7c553B08BC53d707" });
//addContract("sushiswapslp0oracle", abis.sushiswapslporacle, { "0x3": "0x66F03B0d30838A3fee971928627ea6F59B236065" });
//addContract("sushiswapslp1oracle", abis.sushiswapslporacle, { "0x3": "0x0D51b575591F8f74a2763Ade75D3CDCf6789266f" });
//const masterContract = "0x2bc401e64Be212E435339872208E7b07F5eB3Eb6";
//const sushiswapper = "0x1766733112408b95239aD1951925567CB1203084";
const WETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab".toLowerCase()

/*addContract("univ2tosushi", abis.univ2tosushi, { "0x1": "0x81660B6731bEa5f9c08266331241c900bF2936FC" });
addContract("multicall", abis.multicall, {
    "0x1": "0x5eb3fa2dfecdde21c950813c665e9364fa609bd2",
})*/

window.DB = {
    get: function (key, callback) {
        if (typeof Storage !== "undefined") {
            let data = JSON.parseBigInt(localStorage.getItem(key))
            callback(data)
            return true
        }
        return false
    },
    set: function (key, data) {
        if (typeof Storage !== "undefined") {
            localStorage.setItem(key, JSON.stringifyBigInt(data))
            return true
        }
        return false
    },
    del: function (key) {
        if (typeof Storage !== "undefined") {
            localStorage.removeItem(key)
            return true
        }
        return false
    },
    clear: function () {
        if (typeof Storage !== "undefined") {
            localStorage.clear()
            return true
        }
        return false
    },
}

appVersion = 3

DB.get("version", (version) => {
    if (version != appVersion) {
        DB.clear()
        DB.set("version", appVersion)
    }
})

class LogMonitor {
    constructor(manager, address, topics, process, output, version, status, step, abi, onSynced) {
        this.manager = manager
        this.web3 = manager.web3
        this.address = address
        this.topics = topics.map((t) => (t === null ? t : t.length == 42 ? "0x000000000000000000000000" + t.substr(2) : t))
        this.process = process
        this.key = manager.chainId + address + JSON.stringify(topics) + version
        this.status = status
        this.step = step
        this.onSynced = onSynced

        this.output = output || []
        this.seen = {}
        this.local = []
        this.lastBlock = this.manager.chainId == "0x1" ? 10750000 : 0
        this.should_close = false
        DB.get(this.key, (data) => {
            if (data) {
                this.lastBlock = data.lastBlock
                this.local = data.output
                this.output.push(...data.output)
            }
        })
        if (abi) {
            this.decoder = new Decoder(this.web3)
            this.decoder.addABI(abi)
        }
    }

    async init() {
        this._getPastLogsAndSubscribe()
    }

    async _getPastLogs(params) {
        let raw_logs = null
        let oldParams = {}
        Object.assign(oldParams, params)
        while (!raw_logs) {
            try {
                let raw_logs = await this.web3.eth.getPastLogs(params)
                Object.assign(params, oldParams)
                return raw_logs
            } catch (e) {
                if (e.code == -32005) {
                    Object.assign(params, oldParams)
                    params.toBlock -= Math.floor((params.toBlock - params.fromBlock) / 1.25)
                } else {
                    throw e
                }
            }
        }
    }

    async _getPastLogsAndSubscribe() {
        let finished = false
        while (!finished && !this.should_close) {
            let params = {
                fromBlock: this.lastBlock + 1,
                address: this.address,
                topics: this.topics,
            }
            if (this.step && this.lastBlock + this.step < this.manager.block) {
                params.toBlock = this.lastBlock + this.step
            } else {
                finished = true
            }
            let raw_logs = await this._getPastLogs(params)

            if (this.status && raw_logs.length) {
                this.status.loading = true
            }
            for (var i in raw_logs) {
                await this._processLog(raw_logs[i])
                if (this.should_close) {
                    break
                }
            }

            this._save()

            if (params.toBlock) {
                this.lastBlock = params.toBlock
                finished = false
            }
        }

        if (this.status) {
            this.status.loading = false
        }

        if (this.should_close) {
            console.log("Skip Subscribe")
            return
        }
        console.log("Subscribe")
        if (this.onSynced) {
            await this.onSynced()
        }

        this.subscription = this.web3.eth.subscribe("logs", { address: this.address, topics: this.topics }, async (error, log) => {
            if (!error) {
                await this._processLog(log)
                if (this.onSynced) {
                    await this.onSynced()
                }
                this._save()
            } else {
                this.subscription = null
            }
        })
    }

    async _processLog(log) {
        if (!this.seen[log.blockNumber + "-" + log.logIndex]) {
            let row = {
                block: log.blockNumber,
                txid: log.transactionHash,
            }
            let decoded = null
            if (this.decoder) {
                decoded = this.decoder.decodeLog(log)
                decoded.events.forEach((e) => (decoded[e.name] = e.value))
            }
            let result = await this.process(log, this.web3, row, rpcToObj(decoded))
            if (result) {
                this.local.push(result)
                this.output.push(result)
                this.lastBlock = Math.max(this.lastBlock, log.blockNumber)
            }
        }
        this.seen[log.blockNumber + "-" + log.logIndex] = true
    }

    async _save() {
        DB.set(this.key, {
            lastBlock: this.lastBlock,
            output: this.local,
        })
    }

    refresh() {
        if (this.subscription) {
            DB.del(this.key)
            this.output.length = 0
            this.seen = {}
            this.local = []
            this.lastBlock = 10750000

            this.subscription.unsubscribe((error, success) => {
                if (success) {
                    this.subscription = null
                    this._getPastLogsAndSubscribe()
                }
            })
        }
    }

    close() {
        this.should_close = true
        if (this.subscription) {
            console.log("Unsubscribe")
            this.subscription.unsubscribe((error, success) => {
                if (success) {
                    this.subscription = null
                }
            })
        }
    }
}

class Web3Component {
    constructor(options) {
        this.options = options
    }

    get web3() {
        return this.options.web3
    }

    get address() {
        return this.options.address
    }

    get currency() {
        return this.options.currency
    }

    get chainId() {
        return this.options.chainId
    }
}

class SushiPools extends Web3Component {
    constructor(options) {
        super(options)

        this.base = { loaded: false }
        this.pools = []
    }

    ETHtoCurrency(value) {
        return (value * this.base.eth_rate) / BigInt("1000000000000000000")
    }

    async getInfo(currency) {
        if (!this.base.loaded) {
            var result = await this.web3.baseInfo.getInfo().call()
            this.base = {}
            this.base.BONUS_MULTIPLIER = BigInt(result[0].BONUS_MULTIPLIER) // Multiplier during the bonus period
            this.base.bonusEndBlock = BigInt(result[0].bonusEndBlock) // Last block of the bonus period
            this.base.devaddr = result[0].devaddr // Address that receives 10% of SUSHI distributed
            this.base.migrator = result[0].migrator // Address of migration contract
            this.base.owner = result[0].owner // Address of the owner of the masterchef contract
            this.base.startBlock = BigInt(result[0].startBlock) // Block at which SUSHI distribution started
            this.base.sushi = result[0].sushi // Address of the sushi token contract
            this.base.sushiPerBlock = BigInt(result[0].sushiPerBlock) // Base number of sushi distributed per block (not including dev share)
            this.base.totalAllocPoint = BigInt(result[0].totalAllocPoint) // Total allocPoints of all pools, this must match adding all the pool allocPoints

            this.base.sushiTotalSupply = BigInt(result[0].sushiTotalSupply) // Total amount of minted SUSHI
            this.base.sushiOwner = result[0].sushiOwner // Owner of the SUSHI token contract

            this.pools = []
            for (var i in result[1]) {
                let pool = {}
                pool.id = this.pools.length
                pool.logo = result[1][i].logo // The character used as logo for the pool
                pool.name = result[1][i].name // The name of the pool, like Tutle Tether
                pool.lpToken = result[1][i].lpToken // Address of LP token contract. Currently uniswap, soon SushiSwap
                pool.allocPoint = BigInt(result[1][i].allocPoint) // How many allocation points assigned to this pool. Share of allocPoints out of total determines sushi/block.
                pool.lastRewardBlock = BigInt(result[1][i].lastRewardBlock) // Last block number that SUSHIs accululation occured.
                pool.accSushiPerShare = BigInt(result[1][i].accSushiPerShare) // Accumulated SUSHIs per share, times 1e12.
                pool.token0 = result[1][i].token0 // Token address (first) of the token in the LP pair
                pool.token1 = result[1][i].token1 // Token address (second) of the token in the LP pair
                pool.token0name = result[1][i].token0name // Name of the first token
                pool.token1name = result[1][i].token1name // Name of the second token
                pool.token0symbol = result[1][i].token0symbol // Symbol of the first token
                pool.token1symbol = result[1][i].token1symbol // Symbol of the second token
                pool.token0decimals = BigInt(result[1][i].token0decimals) // Decimals of the first token
                pool.token1decimals = BigInt(result[1][i].token1decimals) // Decimals of the scond token
                this.pools.push(pool)
            }
        }

        var result = await this.web3.userInfo.getUserInfo(this.address, currency).call()
        this.base.block = BigInt(result[0].block) // The block for which this info it valid
        this.base.timestamp = BigInt(result[0].timestamp) // The timestamp of that block?
        this.base.eth_rate = BigInt(result[0].eth_rate) // The 'price' of 1 wrapped Ether expressed in currency token
        this.base.sushiBalance = BigInt(result[0].sushiBalance) // User's balance of SUSHI (not pending)
        this.base.delegates = result[0].delegates // See smart contract, just included it for completeness
        this.base.currentVotes = BigInt(result[0].currentVotes) // See smart contract, just included it for completeness
        this.base.nonces = BigInt(result[0].nonces) // See smart contract, just included it for completeness
        this.base.pending = BigInt(0) // Total pending SUSHI
        this.base.multiplier = this.base.block < this.base.bonusEndBlock ? this.base.BONUS_MULTIPLIER : BigInt(1) // Current base multiplier

        this.base.sushiRate = BigInt(result[1][12].token0rate) // The amount of SUSHIs in 1 wrapped Ether, times 1e18. This is taken from the ETH/SUSHI pool
        this.base.sushiValueInETH = (BigInt("1000000000000000000") * BigInt("1000000000000000000")) / this.base.sushiRate
        this.base.sushiValueInCurrency = this.ETHtoCurrency(this.base.sushiValueInETH)

        for (i in result[1]) {
            let pool = this.pools[i]
            pool.lastRewardBlock = BigInt(result[1][i].lastRewardBlock) // Last block number that SUSHIs accululation occured
            pool.accSushiPerShare = BigInt(result[1][i].accSushiPerShare) // Accumulated SUSHIs per share, times 1e12
            pool.balance = BigInt(result[1][i].balance) // User's balance of pool tokens staked in the Masterchef contract
            pool.totalSupply = BigInt(result[1][i].totalSupply) // Total balance of pool tokens in the Masterchef contract
            pool.uniBalance = BigInt(result[1][i].uniBalance) // Users's balance of lp tokens not staked
            pool.uniTotalSupply = BigInt(result[1][i].uniTotalSupply) // TotalSupply of lp tokens
            pool.reserve0 = BigInt(result[1][i].reserve0) // Reserve of token0 in lp token pool
            pool.reserve1 = BigInt(result[1][i].reserve1) // Reserve of token1 in lp token pool
            pool.token0rate = BigInt(result[1][i].token0rate) // The amount of token0 in 1 wrapped Ether, times 1e18.
            pool.token1rate = BigInt(result[1][i].token1rate) // The amount of token1 in 1 wrapped Ether, times 1e18.
            pool.rewardDebt = BigInt(result[1][i].rewardDebt) // Used internally to calculate pending SUSHI, just use pending.
            pool.pending = BigInt(result[1][i].pending) // Pending SUSHI
            this.base.pending += pool.pending

            pool.sushiReward = (this.base.sushiPerBlock * this.base.multiplier * pool.allocPoint) / this.base.totalAllocPoint // SUSHI rewarded to this pool every block
            pool.sushiRewardInETH = (pool.sushiReward * BigInt("1000000000000000000")) / this.base.sushiRate // SUSHI value rewarded to this pool every block in ETH
            pool.sushiRewardInCurrency = (pool.sushiRewardInETH * this.base.eth_rate) / BigInt("1000000000000000000") // SUSHI value rewarded to this pool every block in currncy tokens
            pool.devShare = pool.sushiReward / BigInt("10") // SUSHI rewarded to the dev every block
            pool.totalSushiPerBlock = pool.devShare + pool.sushiReward

            pool.shareOfUniswapPool = pool.uniTotalSupply ? (pool.totalSupply * BigInt("1000000000000000000")) / pool.uniTotalSupply : 0n // Staked share of all lp tokens. 100% = 1e18.
            pool.totalStakedToken0 = (pool.reserve0 * pool.shareOfUniswapPool) / BigInt("1000000000000000000") // Staked lp tokens contain this much of token0.
            pool.totalStakedToken1 = (pool.reserve1 * pool.shareOfUniswapPool) / BigInt("1000000000000000000") // Staked lp tokens contain this much of token1.
            pool.valueStakedToken0 = (pool.totalStakedToken0 * BigInt("1000000000000000000")) / pool.token0rate // Value of token0 in staked lp tokens in wrapped Ether
            pool.valueStakedToken1 = (pool.totalStakedToken1 * BigInt("1000000000000000000")) / pool.token1rate // Value of token1 in staked lp tokens in wrapped Ether
            pool.valueStakedToken0InCurrency = this.ETHtoCurrency(pool.valueStakedToken0)
            pool.valueStakedToken1InCurrency = this.ETHtoCurrency(pool.valueStakedToken1)

            pool.shareOfPool = pool.totalSupply ? (pool.balance * BigInt("1000000000000000000")) / pool.totalSupply : 0n
            pool.userStakedToken0 = (pool.totalStakedToken0 * pool.shareOfPool) / BigInt("1000000000000000000") // Staked lp tokens contain this much of token0.
            pool.userStakedToken1 = (pool.totalStakedToken1 * pool.shareOfPool) / BigInt("1000000000000000000") // Staked lp tokens contain this much of token1.
            pool.valueUserStakedToken0 = (pool.userStakedToken0 * BigInt("1000000000000000000")) / pool.token0rate // Value of token0 in staked lp tokens in wrapped Ether
            pool.valueUserStakedToken1 = (pool.userStakedToken1 * BigInt("1000000000000000000")) / pool.token1rate // Value of token1 in staked lp tokens in wrapped Ether

            pool.hourlyROI =
                pool.valueStakedToken0 + pool.valueStakedToken1
                    ? (pool.sushiRewardInETH * BigInt(276000000)) / (pool.valueStakedToken0 + pool.valueStakedToken1)
                    : 0n // Hourly ROI
            pool.dailyROI =
                pool.valueStakedToken0 + pool.valueStakedToken1
                    ? (pool.sushiRewardInETH * BigInt(6613000000)) / (pool.valueStakedToken0 + pool.valueStakedToken1)
                    : 0n // Daily ROI
            pool.monthlyROI = pool.dailyROI * BigInt(30) // Monthly ROI
            pool.yearlyROI = pool.dailyROI * BigInt(365) // Yearly ROI

            pool.hourlyInCurrency = (pool.sushiRewardInCurrency * pool.shareOfPool * BigInt(276)) / BigInt("1000000000000000000")
            pool.dailyInCurrency = (pool.sushiRewardInCurrency * pool.shareOfPool * BigInt(6613)) / BigInt("1000000000000000000")
            pool.monthlyInCurrency = pool.dailyInCurrency * BigInt(30)
            pool.yearlyInCurrency = pool.dailyInCurrency * BigInt(365)

            pool.valueInCurrency = ((pool.valueStakedToken0 + pool.valueStakedToken1) * this.base.eth_rate) / BigInt("1000000000000000000") // Value of lp tokens staked in currency
        }

        this.base.sushiBalanceInETH = (this.base.sushiBalance * BigInt("1000000000000000000")) / this.base.sushiRate
        this.base.sushiBalanceInCurrency = this.ETHtoCurrency(this.base.sushiBalanceInETH)
        this.base.pendingInETH = (this.base.pending * BigInt("1000000000000000000")) / this.base.sushiRate
        this.base.pendingInCurrency = this.ETHtoCurrency(this.base.pendingInETH)

        this.base.loaded = true
        return this
    }

    async harvest(from, pool_id) {
        await this.web3.chef.withdraw(pool_id, 0).send({ from: from })
    }
}
