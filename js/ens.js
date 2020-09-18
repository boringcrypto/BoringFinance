class ENS {
    constructor(web3) {
        this.web3 = web3;
        this.resolver_abi = [{ "inputs": [{ "internalType": "contract ENS", "name": "ensAddr", "type": "address" }], "payable": false, "stateMutability": "nonpayable", "type": "constructor" }, { "constant": true, "inputs": [], "name": "ens", "outputs": [{ "internalType": "contract ENS", "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "name": "name", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "internalType": "bytes32", "name": "node", "type": "bytes32" }, { "internalType": "string", "name": "_name", "type": "string" }], "name": "setName", "outputs": [], "payable": false, "stateMutability": "nonpayable", "type": "function" }];
        this.resolver_contract = new web3.eth.Contract(this.resolver_abi, "0xA2C122BE93b0074270ebeE7f6b7292C7deB45047");
        this.reverse_abi = [{ "inputs": [{ "internalType": "contract ENS", "name": "ensAddr", "type": "address" }, { "internalType": "contract Resolver", "name": "resolverAddr", "type": "address" }], "payable": false, "stateMutability": "nonpayable", "type": "constructor" }, { "constant": true, "inputs": [], "name": "ADDR_REVERSE_NODE", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": false, "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "claim", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": false, "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "address", "name": "resolver", "type": "address" }], "name": "claimWithResolver", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }, { "constant": true, "inputs": [], "name": "defaultResolver", "outputs": [{ "internalType": "contract Resolver", "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [], "name": "ens", "outputs": [{ "internalType": "contract ENS", "name": "", "type": "address" }], "payable": false, "stateMutability": "view", "type": "function" }, { "constant": true, "inputs": [{ "internalType": "address", "name": "addr", "type": "address" }], "name": "node", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "payable": false, "stateMutability": "pure", "type": "function" }, { "constant": false, "inputs": [{ "internalType": "string", "name": "name", "type": "string" }], "name": "setName", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "payable": false, "stateMutability": "nonpayable", "type": "function" }];
        this.reverse_contract = new web3.eth.Contract(this.reverse_abi, "0x084b1c3C81545d370f3634392De611CaaBFf8148");

        this.reverse_names = {}
    }

    async reverse(address, fallback) {
        if (!fallback) {
            fallback = (a) => a.substr(0, 14) + "...";
        }

        let node = await this.reverse_contract.methods.node(address).call();
        let name = await this.resolver_contract.methods.name(node).call();
        if (name) {
            return name;
        }

        return fallback(address);
    }
}