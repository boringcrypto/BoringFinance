// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function owner() external view returns (address);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface ISushiSwapPoolNames {
    function logos(uint256) external view returns(string memory);
    function names(uint256) external view returns(string memory);
    function setPoolInfo(uint256 pid, string memory logo, string memory name) external;
}

interface ISushiToken is IERC20{
    function delegates(address who) external view returns(address);
    function getCurrentVotes(address who) external view returns(uint256);
    function nonces(address who) external view returns(uint256);
}

interface IMasterChef {
    function BONUS_MULTIPLIER() external view returns (uint256);
    function bonusEndBlock() external view returns (uint256);
    function devaddr() external view returns (address);
    function migrator() external view returns (address);
    function owner() external view returns (address);
    function startBlock() external view returns (uint256);
    function sushi() external view returns (address);
    function sushiPerBlock() external view returns (uint256);
    function totalAllocPoint() external view returns (uint256);

    function poolLength() external view returns (uint256);
    function poolInfo(uint256 nr) external view returns (address, uint256, uint256, uint256);
    function userInfo(uint256 nr, address who) external view returns (uint256, uint256);
    function pendingSushi(uint256 nr, address who) external view returns (uint256);
}


interface IUniswapFactory {
    function getPair(address token0, address token1) external view returns (address);
}

interface IUniswapPair is IERC20 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
}

library BoringMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256 c) {require((c = a + b) >= b, "BoringMath: Add Overflow");}
    function sub(uint256 a, uint256 b) internal pure returns (uint256 c) {require((c = a - b) <= a, "BoringMath: Underflow");}
    function mul(uint256 a, uint256 b) internal pure returns (uint256 c) {require(b == 0 || (c = a * b)/b == a, "BoringMath: Mul Overflow");}
}

contract Ownable {
    address public immutable owner;

    constructor () internal {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "Ownable: caller is not the owner");
        _;
    }
}


struct BaseInfo {
    uint256 BONUS_MULTIPLIER;
    uint256 bonusEndBlock;
    address devaddr;
    address migrator;
    address owner;
    uint256 startBlock;
    address sushi;
    uint256 sushiPerBlock;
    uint256 totalAllocPoint;
    
    uint256 sushiTotalSupply;
    address sushiOwner;
}

struct UserInfo {
    uint256 block;
    uint256 timestamp;
    uint256 eth_rate;
    uint256 sushiBalance;
    address delegates;
    uint256 currentVotes;
    uint256 nonces;
}

struct UserPoolInfo {
    uint256 lastRewardBlock;  // Last block number that SUSHIs distribution occurs.
    uint256 accSushiPerShare; // Accumulated SUSHIs per share, times 1e12. See below.
    uint256 balance; // Balance of pool tokens
    uint256 totalSupply; // Token staked lp tokens
    uint256 uniBalance; // Balance of uniswap lp tokens not staked
    uint256 uniTotalSupply; // TotalSupply of uniswap lp tokens
    uint256 uniAllowance; // UniSwap LP tokens approved for masterchef
    uint256 reserve0;
    uint256 reserve1;
    uint256 token0rate;
    uint256 token1rate;
    uint256 rewardDebt;
    uint256 pending; // Pending SUSHI
}

contract SushiSwapBaseInfo is Ownable {
    // Mainnet
    ISushiSwapPoolNames names = ISushiSwapPoolNames(0xb373a5def62A907696C0bBd22Dc512e2Fc8cfC7E);
    IMasterChef masterChef = IMasterChef(0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd);
    
    // Ropsten
    //ISushiSwapPoolNames names = ISushiSwapPoolNames(0x7685f4c573cE27C94F6aF70B330C29b9c41B8290);
    //IMasterChef masterChef = IMasterChef(0xFF281cEF43111A83f09C656734Fa03E6375d432A);
    
    function setContracts(address names_, address masterChef_) public onlyOwner {
        names = ISushiSwapPoolNames(names_);
        masterChef = IMasterChef(masterChef_);
    }

    function getInfo() public view returns(BaseInfo memory, PoolInfo[] memory) {
        BaseInfo memory info;
        info.BONUS_MULTIPLIER = masterChef.BONUS_MULTIPLIER();
        info.bonusEndBlock = masterChef.bonusEndBlock();
        info.devaddr = masterChef.devaddr();
        info.migrator = masterChef.migrator();
        info.owner = masterChef.owner();
        info.startBlock = masterChef.startBlock();
        info.sushi = masterChef.sushi();
        info.sushiPerBlock = masterChef.sushiPerBlock();
        info.totalAllocPoint = masterChef.totalAllocPoint();
        
        info.sushiTotalSupply = IERC20(info.sushi).totalSupply();
        info.sushiOwner = IERC20(info.sushi).owner();

        uint256 poolLength = masterChef.poolLength();
        PoolInfo[] memory pools = new PoolInfo[](poolLength);
        for (uint256 i = 0; i < poolLength; i++) {
            (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accSushiPerShare) = masterChef.poolInfo(i);
            IUniswapPair uniV2 = IUniswapPair(lpToken);
            pools[i].lpToken = uniV2;
            pools[i].allocPoint = allocPoint;
            pools[i].lastRewardBlock = lastRewardBlock;
            pools[i].accSushiPerShare = accSushiPerShare;
            
            IERC20 token0 = IERC20(uniV2.token0());
            pools[i].token0 = token0;
            IERC20 token1 = IERC20(uniV2.token1());
            pools[i].token1 = token1;
            
            pools[i].token0name = token0.name();
            pools[i].token0symbol = token0.symbol();
            pools[i].token0decimals = token0.decimals();
            
            pools[i].token1name = token1.name();
            pools[i].token1symbol = token1.symbol();
            pools[i].token1decimals = token1.decimals();
            
            pools[i].logo = names.logos(i);
            pools[i].name = names.names(i);
        }
        return (info, pools);
    }
}

contract SushiSwapUserInfo is Ownable
{
    using SafeMath for uint256;

    // Ropsten
    IUniswapFactory uniFactory = IUniswapFactory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    IMasterChef masterChef = IMasterChef(0xFF281cEF43111A83f09C656734Fa03E6375d432A);
    ISushiToken sushi = ISushiToken(0x81DB9C598b3ebbdC92426422fc0A1d06E77195ec);
    address WETH = 0x078A84ee7991699DD198B7b95055AEd0C782A6eE;

    function setContracts(address uniFactory_, address masterChef_, address sushi_, address WETH_) public onlyOwner {
        uniFactory = IUniswapFactory(uniFactory_);
        masterChef = IMasterChef(masterChef_);
        sushi = ISushiToken(sushi_);
        WETH = WETH_;
    }

    function getETHRate(address token) public view returns(uint256) {
        uint256 eth_rate = 1e18;
        if (token != WETH)
        {
            IUniswapPair pair = IUniswapPair(uniFactory.getPair(token, WETH));
            (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
            if (pair.token0() == WETH) {
                eth_rate = uint256(reserve1).mul(1e18).div(reserve0);
            } else {
                eth_rate = uint256(reserve0).mul(1e18).div(reserve1);
            }
        }
        return eth_rate;
    }
    
    function _getUserInfo(address who, address currency) private view returns(UserInfo memory) {
        UserInfo memory user;
        
        user.block = block.number;
        user.timestamp = block.timestamp;
        user.sushiBalance = sushi.balanceOf(who);
        user.delegates = sushi.delegates(who);
        user.currentVotes = sushi.getCurrentVotes(who);
        user.nonces = sushi.nonces(who);
        user.eth_rate = getETHRate(currency);
        
        return user;
    }
    
    function getUserInfo(address who, address currency) public view returns(UserInfo memory, UserPoolInfo[] memory) {
        uint256 poolLength = masterChef.poolLength();
        UserPoolInfo[] memory pools = new UserPoolInfo[](poolLength);

        for (uint256 i = 0; i < poolLength; i++) {
            (uint256 amount, uint256 rewardDebt) = masterChef.userInfo(i, who);
            pools[i].balance = amount;
            pools[i].rewardDebt = rewardDebt;
            pools[i].pending = masterChef.pendingSushi(i, who);

            (address lpToken, , uint256 lastRewardBlock, uint256 accSushiPerShare) = masterChef.poolInfo(i);
            IUniswapPair uniV2 = IUniswapPair(lpToken);
            pools[i].totalSupply = uniV2.balanceOf(address(masterChef));
            pools[i].uniAllowance = uniV2.allowance(who, address(masterChef));
            pools[i].lastRewardBlock = lastRewardBlock;
            pools[i].accSushiPerShare = accSushiPerShare;
            pools[i].uniBalance = uniV2.balanceOf(who);
            pools[i].uniTotalSupply = uniV2.totalSupply();
            pools[i].token0rate = getETHRate(uniV2.token0());
            pools[i].token1rate = getETHRate(uniV2.token1());
            
            (uint112 reserve0, uint112 reserve1,) = uniV2.getReserves();
            pools[i].reserve0 = reserve0;
            pools[i].reserve1 = reserve1;
        }
        return (_getUserInfo(who, currency), pools);
    }
    
    function getMyInfoInUSDT() public view returns(UserInfo memory, UserPoolInfo[] memory) {
        return getUserInfo(msg.sender, 0x292c703A980fbFce4708864Ae6E8C40584DAF323);
    }
}


struct BaseInfo {
    uint256 BONUS_MULTIPLIER;
    uint256 bonusEndBlock;
    address devaddr;
    address migrator;
    address owner;
    uint256 startBlock;
    address sushi;
    uint256 sushiPerBlock;
    uint256 totalAllocPoint;
    
    uint256 sushiTotalSupply;
    address sushiOwner;
}

struct PoolInfo {
    string logo;
    string name;
    IPair lpToken;           // Address of LP token contract.
    uint256 allocPoint;       // How many allocation points assigned to this pool. SUSHIs to distribute per block.
    uint256 lastRewardBlock;  // Last block number that SUSHIs distribution occurs.
    uint256 accSushiPerShare; // Accumulated SUSHIs per share, times 1e12. See below.
    IERC20 token0;
    IERC20 token1;
    string token0name;
    string token1name;
    string token0symbol;
    string token1symbol;
    uint256 token0decimals;
    uint256 token1decimals;
}

struct UserInfo {
    uint256 block;
    uint256 timestamp;
    uint256 eth_rate;
    uint256 sushiBalance;
    address delegates;
    uint256 currentVotes;
    uint256 nonces;
}

struct UserPoolInfo {
    uint256 lastRewardBlock;  // Last block number that SUSHIs distribution occurs.
    uint256 accSushiPerShare; // Accumulated SUSHIs per share, times 1e12. See below.
    uint256 balance; // Balance of pool tokens
    uint256 totalSupply; // Token staked lp tokens
    uint256 uniBalance; // Balance of uniswap lp tokens not staked
    uint256 uniTotalSupply; // TotalSupply of uniswap lp tokens
    uint256 uniAllowance; // UniSwap LP tokens approved for masterchef
    uint256 reserve0;
    uint256 reserve1;
    uint256 token0rate;
    uint256 token1rate;
    uint256 rewardDebt;
    uint256 pending; // Pending SUSHI
}

contract SushiSwapBaseInfo is Ownable {
    // Mainnet
    //ISushiSwapPoolNames names = ISushiSwapPoolNames(0xb373a5def62A907696C0bBd22Dc512e2Fc8cfC7E);
    //IMasterChef masterChef = IMasterChef(0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd);
    
    // Ropsten
    ISushiSwapPoolNames names = ISushiSwapPoolNames(0x7685f4c573cE27C94F6aF70B330C29b9c41B8290);
    IMasterChef masterChef = IMasterChef(0xFF281cEF43111A83f09C656734Fa03E6375d432A);
    
    function setContracts(address names_, address masterChef_) public onlyOwner {
        names = ISushiSwapPoolNames(names_);
        masterChef = IMasterChef(masterChef_);
    }

    function getInfo() public view returns(BaseInfo memory, PoolInfo[] memory) {
        BaseInfo memory info;
        info.BONUS_MULTIPLIER = masterChef.BONUS_MULTIPLIER();
        info.bonusEndBlock = masterChef.bonusEndBlock();
        info.devaddr = masterChef.devaddr();
        info.migrator = masterChef.migrator();
        info.owner = masterChef.owner();
        info.startBlock = masterChef.startBlock();
        info.sushi = masterChef.sushi();
        info.sushiPerBlock = masterChef.sushiPerBlock();
        info.totalAllocPoint = masterChef.totalAllocPoint();
        
        info.sushiTotalSupply = IERC20(info.sushi).totalSupply();
        info.sushiOwner = IERC20(info.sushi).owner();

        uint256 poolLength = masterChef.poolLength();
        PoolInfo[] memory pools = new PoolInfo[](poolLength);
        for (uint256 i = 0; i < poolLength; i++) {
            (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accSushiPerShare) = masterChef.poolInfo(i);
            IPair uniV2 = IPair(lpToken);
            pools[i].lpToken = uniV2;
            pools[i].allocPoint = allocPoint;
            pools[i].lastRewardBlock = lastRewardBlock;
            pools[i].accSushiPerShare = accSushiPerShare;
            
            IERC20 token0 = IERC20(uniV2.token0());
            pools[i].token0 = token0;
            IERC20 token1 = IERC20(uniV2.token1());
            pools[i].token1 = token1;
            
            pools[i].token0name = token0.name();
            pools[i].token0symbol = token0.symbol();
            pools[i].token0decimals = token0.decimals();
            
            pools[i].token1name = token1.name();
            pools[i].token1symbol = token1.symbol();
            pools[i].token1decimals = token1.decimals();
            
            pools[i].logo = names.logos(i);
            pools[i].name = names.names(i);
        }
        return (info, pools);
    }
}

contract SushiSwapUserInfo is Ownable
{
    using SafeMath for uint256;

    IFactory factory = IFactory(0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac);
    IMasterChef masterChef = IMasterChef(0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd);
    ISushiToken sushi = ISushiToken(0x6B3595068778DD592e39A122f4f5a5cF09C90fE2);
    address WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    function setContracts(address factory_, address masterChef_, address sushi_, address WETH_) public onlyOwner {
        factory = IFactory(factory_);
        masterChef = IMasterChef(masterChef_);
        sushi = ISushiToken(sushi_);
        WETH = WETH_;
    }

    function getETHRate(address token) public view returns(uint256) {
        uint256 eth_rate = 1e18;
        if (token != WETH)
        {
            IPair pair = IPair(factory.getPair(token, WETH));
            (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
            if (pair.token0() == WETH) {
                eth_rate = uint256(reserve1).mul(1e18).div(reserve0);
            } else {
                eth_rate = uint256(reserve0).mul(1e18).div(reserve1);
            }
        }
        return eth_rate;
    }
    
    function _getUserInfo(address who, address currency) private view returns(UserInfo memory) {
        UserInfo memory user;
        
        user.block = block.number;
        user.timestamp = block.timestamp;
        user.sushiBalance = sushi.balanceOf(who);
        user.delegates = sushi.delegates(who);
        user.currentVotes = sushi.getCurrentVotes(who);
        user.nonces = sushi.nonces(who);
        user.eth_rate = getETHRate(currency);
        
        return user;
    }
    
    function getUserInfo(address who, address currency) public view returns(UserInfo memory, UserPoolInfo[] memory) {
        uint256 poolLength = masterChef.poolLength();
        UserPoolInfo[] memory pools = new UserPoolInfo[](poolLength);

        for (uint256 i = 0; i < poolLength; i++) {
            (uint256 amount, uint256 rewardDebt) = masterChef.userInfo(i, who);
            pools[i].balance = amount;
            pools[i].rewardDebt = rewardDebt;
            pools[i].pending = masterChef.pendingSushi(i, who);

            (address lpToken, , uint256 lastRewardBlock, uint256 accSushiPerShare) = masterChef.poolInfo(i);
            IPair uniV2 = IPair(lpToken);
            pools[i].totalSupply = uniV2.balanceOf(address(masterChef));
            pools[i].uniAllowance = uniV2.allowance(who, address(masterChef));
            pools[i].lastRewardBlock = lastRewardBlock;
            pools[i].accSushiPerShare = accSushiPerShare;
            pools[i].uniBalance = uniV2.balanceOf(who);
            pools[i].uniTotalSupply = uniV2.totalSupply();
            pools[i].token0rate = getETHRate(uniV2.token0());
            pools[i].token1rate = getETHRate(uniV2.token1());
            
            (uint112 reserve0, uint112 reserve1,) = uniV2.getReserves();
            pools[i].reserve0 = reserve0;
            pools[i].reserve1 = reserve1;
        }
        return (_getUserInfo(who, currency), pools);
    }
    
    function getMyInfoInUSDT() public view returns(UserInfo memory, UserPoolInfo[] memory) {
        return getUserInfo(msg.sender, 0x292c703A980fbFce4708864Ae6E8C40584DAF323);
    }
}

struct PairInfo {
    string logo;
    string name;
    IPair lpToken;
    IERC20 token0;
    IERC20 token1;
    string token0name;
    string token1name;
    string token0symbol;
    string token1symbol;
    uint256 token0decimals;
    uint256 token1decimals;
    
    uint256 makerBalance;
    uint256 totalSupply;
    uint256 reserve0;
    uint256 reserve1;
    uint256 token0rate;
    uint256 token1rate;
}

contract SushiMakerInfo is Ownable
{
    using SafeMath for uint256;

  
    function getETHRate(IFactory factory, address token) public view returns(uint256) {
        uint256 eth_rate = 1e18;
        if (token != WETH)
        {
            IPair pair;
            pair = IPair(factory.getPair(token, WETH));
            if (address(pair) == address(0)) {
                return 0;
            }
            (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
            if (pair.token0() == WETH) {
                eth_rate = uint256(reserve1).mul(1e18).div(reserve0);
            } else {
                eth_rate = uint256(reserve0).mul(1e18).div(reserve1);
            }
        }
        return eth_rate;
    }
    
    function getPair(uint256 pid, IFactory factory) public view returns(PairInfo memory) {
        PairInfo memory info;

        (address lpToken,,,) = masterChef.poolInfo(pid);
        IPair pair = IPair(lpToken);
        info.lpToken = pair;

        IERC20 token0 = IERC20(pair.token0());
        info.token0 = token0;
        IERC20 token1 = IERC20(pair.token1());
        info.token1 = token1;
        
        info.token0name = token0.name();
        info.token0symbol = token0.symbol();
        info.token0decimals = token0.decimals();
        
        info.token1name = token1.name();
        info.token1symbol = token1.symbol();
        info.token1decimals = token1.decimals();
        
        info.logo = names.logos(pid);
        info.name = names.names(pid);

        info.makerBalance = pair.balanceOf(sushiMaker);
        info.totalSupply = pair.totalSupply();
        
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        info.reserve0 = reserve0;
        info.reserve1 = reserve1;

        info.token0rate = getETHRate(factory, address(token0));
        info.token1rate = getETHRate(factory, address(token1));

        return info;
    }    
    
    function getPairs(uint256[] calldata pids, address currency, IFactory factory) public view returns(uint256, PairInfo[] memory) {
        PairInfo[] memory infos = new PairInfo[](pids.length);

        for (uint256 i = 0; i < pids.length; i++) {
            (address lpToken,,,) = masterChef.poolInfo(pids[i]);
            IPair pair = IPair(lpToken);
            infos[i].lpToken = pair;

            IERC20 token0 = IERC20(pair.token0());
            infos[i].token0 = token0;
            IERC20 token1 = IERC20(pair.token1());
            infos[i].token1 = token1;
            
            infos[i].token0name = token0.name();
            infos[i].token0symbol = token0.symbol();
            infos[i].token0decimals = token0.decimals();
            
            infos[i].token1name = token1.name();
            infos[i].token1symbol = token1.symbol();
            infos[i].token1decimals = token1.decimals();
            
            infos[i].logo = names.logos(pids[i]);
            infos[i].name = names.names(pids[i]);

            infos[i].makerBalance = pair.balanceOf(sushiMaker);
            infos[i].totalSupply = pair.totalSupply();
            
            (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
            infos[i].reserve0 = reserve0;
            infos[i].reserve1 = reserve1;

            infos[i].token0rate = getETHRate(factory, address(token0));
            infos[i].token1rate = getETHRate(factory, address(token1));
        }
        return (getETHRate(factory, currency), infos);
    }
}

interface IFactory {
    function allPairsLength() external view returns (uint256);
    function allPairs(uint256 i) external view returns (address);
    function getPair(address token0, address token1) external view returns (address);
    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);
}

interface IPair is IERC20 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
}


contract BoringCryptoTokenScanner
{
    using SafeMath for uint256;

    struct Balance {
        address token;
        uint256 balance;
    }
    
    struct BalanceFull {
        address token;
        uint256 balance;
        uint256 rate;
    }
    
    struct TokenInfo {
        address token;
        uint256 decimals;
        string name;
        string symbol;
    }

    function getTokenInfo(address[] calldata addresses) public view returns(TokenInfo[] memory) {
        TokenInfo[] memory infos = new TokenInfo[](addresses.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            IERC20 token = IERC20(addresses[i]);
            infos[i].token = address(token);
            
            infos[i].name = token.name();
            infos[i].symbol = token.symbol();
            infos[i].decimals = token.decimals();
        }

        return infos;
    }

    function findBalances(address who, address[] calldata addresses) public view returns(Balance[] memory) {
        uint256 balanceCount;

        for (uint256 i = 0; i < addresses.length; i++) {
            if (IERC20(addresses[i]).balanceOf(who) > 0) {
                balanceCount++;
            }
        }

        Balance[] memory balances = new Balance[](balanceCount);

        balanceCount = 0;
        for (uint256 i = 0; i < addresses.length; i++) {
            IERC20 token = IERC20(addresses[i]);
            uint256 balance = token.balanceOf(who);
            if (balance > 0) {
                balances[balanceCount].token = address(token);
                balances[balanceCount].balance = token.balanceOf(who);
                balanceCount++;
            }
        }

        return balances;
    }
    
    function getBalances(address who, address[] calldata addresses, IFactory factory, address currency) public view returns(BalanceFull[] memory) {
        BalanceFull[] memory balances = new BalanceFull[](addresses.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            IERC20 token = IERC20(addresses[i]);
            balances[i].token = address(token);
            balances[i].balance = token.balanceOf(who);

            IPair pair = IPair(factory.getPair(addresses[i], currency));
            if(address(pair) != address(0))
            {
                uint256 reserveCurrency;
                uint256 reserveToken;
                if (pair.token0() == currency) {
                    (reserveCurrency, reserveToken,) = pair.getReserves();
                }
                else
                {
                    (reserveToken, reserveCurrency,) = pair.getReserves();
                }
                balances[i].rate = reserveToken * 1e18 / reserveCurrency;
            }
        }

        return balances;
    }

    struct Factory {
        IFactory factory;
        uint256 allPairsLength;
        address feeTo;
        address feeToSetter;
    }
    
    function getFactoryInfo(IFactory[] calldata addresses) public view returns(Factory[] memory) {
        Factory[] memory factories = new Factory[](addresses.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            IFactory factory = addresses[i];
            factories[i].factory = factory;
            
            factories[i].allPairsLength = factory.allPairsLength();
            factories[i].feeTo = factory.feeTo();
            factories[i].feeToSetter = factory.feeToSetter();
        }

        return factories;
    }

    struct Pair {
        address token;
        address token0;
        address token1;
    }
    
    function getPairs(IFactory factory, uint256 fromID, uint256 toID) public view returns(Pair[] memory) {
        if (toID == 0){
            toID = factory.allPairsLength();
        }
        
        Pair[] memory pairs = new Pair[](toID - fromID);

        for(uint256 id = fromID; id < toID; id++) {
            address token = factory.allPairs(id);
            uint256 i = id - fromID;
            pairs[i].token = token;
            pairs[i].token0 = IPair(token).token0();
            pairs[i].token1 = IPair(token).token1();
        }
        return pairs;
    }

    function findPairs(address who, IFactory factory, uint256 fromID, uint256 toID) public view returns(Pair[] memory) {
        if (toID == 0){
            toID = factory.allPairsLength();
        }
        
        uint256 pairCount;

        for(uint256 id = fromID; id < toID; id++) {
            address token = factory.allPairs(id);
            if (IERC20(token).balanceOf(who) > 0) {
                pairCount++;
            }
        }

        Pair[] memory pairs = new Pair[](pairCount);

        pairCount = 0;
        for(uint256 id = fromID; id < toID; id++) {
            address token = factory.allPairs(id);
            uint256 balance = IERC20(token).balanceOf(who);
            if (balance > 0) {
                pairs[pairCount].token = token;
                pairs[pairCount].token0 = IPair(token).token0();
                pairs[pairCount].token1 = IPair(token).token1();
                pairCount++;
            }
        }

        return pairs;
    }

    struct PairFull {
        address token;
        address token0;
        address token1;
        uint256 reserve0;
        uint256 reserve1;
        uint256 totalSupply;
        uint256 balance;
    }

    function getPairsFull(address who, address[] calldata addresses) public view returns(PairFull[] memory) {
        PairFull[] memory pairs = new PairFull[](addresses.length);
        for (uint256 i = 0; i < addresses.length; i++) {
            address token = addresses[i];
            pairs[i].token = token;
            pairs[i].token0 = IPair(token).token0();
            pairs[i].token1 = IPair(token).token1();
            (uint256 reserve0, uint256 reserve1,) = IPair(token).getReserves();
            pairs[i].reserve0 = reserve0;
            pairs[i].reserve1 = reserve1;
            pairs[i].balance = IERC20(token).balanceOf(who);
        }
        return pairs;
    }
}

library BoringERC20
{
    function symbol(IERC20 token) internal view returns(string memory) {
        (bool success, bytes memory data) = address(token).staticcall(abi.encodeWithSelector(0x95d89b41));
        return success && data.length > 0 ? abi.decode(data, (string)) : "???";
    }    

    function name(IERC20 token) internal view returns(string memory) {
        (bool success, bytes memory data) = address(token).staticcall(abi.encodeWithSelector(0x06fdde03));
        return success && data.length > 0 ? abi.decode(data, (string)) : "???";
    }

    function decimals(IERC20 token) public view returns (uint8) {
        (bool success, bytes memory data) = address(token).staticcall(abi.encodeWithSelector(0x313ce567));
        return success && data.length == 32 ? abi.decode(data, (uint8)) : 18;
    }
}

contract BoringHelper
{
    using BoringMath for uint256;
    using BoringERC20 for IERC20;

    IMasterChef public chef = IMasterChef(0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd);
    ISushiMaker public maker = ISushiMaker(0xE11fc0B43ab98Eb91e9836129d1ee7c3Bc95df50);
    ISushiToken public sushi = ISushiToken(0x6B3595068778DD592e39A122f4f5a5cF09C90fE2);
    address public WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    IFactory public sushiFactory = IFactory(0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac);
    IFactory public uniV2Factory = IFactory(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    IERC20 public bar = 0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272;

    function setContracts(IMasterChef chef_, ISushiMaker maker_, ISushiToken sushi_, address WETH_, address WBTC_, IFactory sushiFactory_, IFactory uniV2Factory_, IERC20 bar_) public onlyOwner {
        chef = chef_;
        maker = maker_;
        sushi = sushi_;
        WETH = WETH_;
        WBTC = WBTC_;
        sushiFactory = sushiFactory_;
        uniV2Factory = uniV2Factory_;
        bar = bar_;
    }

    function getETHRate(address token) public view returns(uint256) {
        uint256 eth_rate = 1e18;
        if (token != WETH)
        {
            IPair pairUniV2 = IPair(uniV2Factory.getPair(token, WETH));
            IPair pairSushi = IPair(sushiFactory.getPair(token, WETH));
            if (address(pairUniV2) == address(0) && address(pairSushi) == address(0)) {
                return 0;
            }
            
            uint112 reserve0; uint112 reserve1;
            if (address(pairUniV2) != address(0)) {
                (uint256 reserve0UniV2, uint256 reserve1UniV2,) = pairUniV2.getReserves();
                reserve0 += reserve0UniV2;
                reserve1 += reserve1UniV2;
            }

            if (address(pairSushi) != address(0)) {
                (uint256 reserve0Sushi, uint256 reserve1Sushi,) = pairSushi.getReserves();
                reserve0 += reserve0Sushi;
                reserve1 += reserve1Sushi;
            }
            
            if (pairUniV2.token0() == WETH) { 
                eth_rate = uint256(reserve1).mul(1e18).div(reserve0); 
            } else { 
                eth_rate = uint256(reserve0).mul(1e18).div(reserve1); 
            }
        }
        return eth_rate;
    }

    struct Factory {
        IFactory factory;
        uint256 allPairsLength;
        address feeTo;
        address feeToSetter;
    }
    
    struct UIInfo {
        uint256 ethBalance;
        uint256 sushiBalance;
        uint256 sushiBarBalance;
        uint256 xsushiBalance;
        uint256 xsushiSupply;
        uint256 sushiBarAllowance;
        Factory[] factories;
        uint256 ethRate;
        uint256 sushiRate;
        uint256 btcRate;
    }

    function getUIInfo(address who, IFactory[] calldata factoryAddresses, address currency) public view returns(UIInfo) {
        UIInfo memory info;
        info.ethBalance = who.balance;

        info.factories = new Factory[](factoryAddresses.length);

        for (uint256 i = 0; i < factoryAddresses.length; i++) {
            IFactory factory = factoryAddresses[i];
            info.factories[i].factory = factory;
            info.factories[i].allPairsLength = factory.allPairsLength();
            info.factories[i].feeTo = factory.feeTo();
            info.factories[i].feeToSetter = factory.feeToSetter();
        }

        info.ethRate = getETHRate(currency);
        info.sushiRate = getETHRate(address(sushi));
        info.btcRate = getBTCRate(WBTC);

        info.sushiBalance = sushi.balanceOf(who);
        info.sushiBarBalance = sushi.balanceOf(bar);
        info.xsushiBalance = bar.balanceOf(who);
        info.xsushiSupply = bar.totalSupply();
        info.sushiBarAllowance = sushi.allowance(who, bar);

        return info;
    }

    struct Balance {
        address token;
        uint256 balance;
    }
    
    struct BalanceFull {
        address token;
        uint256 balance;
        uint256 rate;
    }
    
    struct TokenInfo {
        address token;
        uint256 decimals;
        string name;
        string symbol;
    }

    function getTokenInfo(address[] calldata addresses) public view returns(TokenInfo[] memory) {
        TokenInfo[] memory infos = new TokenInfo[](addresses.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            IERC20 token = IERC20(addresses[i]);
            infos[i].token = address(token);
            
            infos[i].name = token.name();
            infos[i].symbol = token.symbol();
            infos[i].decimals = token.decimals();
        }

        return infos;
    }

    function findBalances(address who, address[] calldata addresses) public view returns(Balance[] memory) {
        uint256 balanceCount;

        for (uint256 i = 0; i < addresses.length; i++) {
            if (IERC20(addresses[i]).balanceOf(who) > 0) {
                balanceCount++;
            }
        }

        Balance[] memory balances = new Balance[](balanceCount);

        balanceCount = 0;
        for (uint256 i = 0; i < addresses.length; i++) {
            IERC20 token = IERC20(addresses[i]);
            uint256 balance = token.balanceOf(who);
            if (balance > 0) {
                balances[balanceCount].token = address(token);
                balances[balanceCount].balance = token.balanceOf(who);
                balanceCount++;
            }
        }

        return balances;
    }

    function getBalances(address who, address[] calldata addresses, IFactory factory) public view returns(BalanceFull[] memory) {
        BalanceFull[] memory balances = new BalanceFull[](addresses.length);

        for (uint256 i = 0; i < addresses.length; i++) {
            address token = IERC20(addresses[i]);
            balances[i].token = token;
            balances[i].balance = IERC20(token).balanceOf(who);
            balances[i].rate = getETHRate(token);
        }

        return balances;
    }

    struct Pair {
        address token;
        address token0;
        address token1;
    }
    
    function getPairs(IFactory factory, uint256 fromID, uint256 toID) public view returns(Pair[] memory) {
        Pair[] memory pairs = new Pair[](toID - fromID);

        for(uint256 id = fromID; id < toID; id++) {
            address token = factory.allPairs(id);
            uint256 i = id - fromID;
            pairs[i].token = token;
            pairs[i].token0 = IPair(token).token0();
            pairs[i].token1 = IPair(token).token1();
        }
        return pairs;
    }

    function findPairs(address who, IFactory factory, uint256 fromID, uint256 toID) public view returns(Pair[] memory) {
        uint256 pairCount;

        for(uint256 id = fromID; id < toID; id++) {
            address token = factory.allPairs(id);
            if (IERC20(token).balanceOf(who) > 0) {
                pairCount++;
            }
        }

        Pair[] memory pairs = new Pair[](pairCount);

        pairCount = 0;
        for(uint256 id = fromID; id < toID; id++) {
            address token = factory.allPairs(id);
            uint256 balance = IERC20(token).balanceOf(who);
            if (balance > 0) {
                pairs[pairCount].token = token;
                pairs[pairCount].token0 = IPair(token).token0();
                pairs[pairCount].token1 = IPair(token).token1();
                pairCount++;
            }
        }

        return pairs;
    }

    struct PairPoll {
        address token;
        uint256 reserve0;
        uint256 reserve1;
        uint256 totalSupply;
        uint256 balance;
    }

    function pollPairs(address who, address[] calldata addresses) public view returns(PairPoll[] memory) {
        PairPoll[] memory pairs = new PairFull[](addresses.length);
        for (uint256 i = 0; i < addresses.length; i++) {
            address token = addresses[i];
            pairs[i].token = token;
            pairs[i].token0 = IPair(token).token0();
            pairs[i].token1 = IPair(token).token1();
            (uint256 reserve0, uint256 reserve1,) = IPair(token).getReserves();
            pairs[i].reserve0 = reserve0;
            pairs[i].reserve1 = reserve1;
            pairs[i].balance = IERC20(token).balanceOf(who);
            pairs[i].totalSupply = IERC20(token).totalSupply();
        }
        return pairs;
    }

    struct PoolsInfo {
        uint256 totalAllocPoint;
        uint256 poolLength;
    }

    struct PoolInfo {
        uint256 pid;
        IPair lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. SUSHIs to distribute per block.
        address token0;
        address token1;
    }
    
    function getPools(uint256[] calldata pids) public view returns(PoolsInfo memory, PoolInfo[] memory) {
        PoolsInfo memory info;
        info.totalAllocPoint = chef.totalAllocPoint();
        uint256 poolLength = chef.poolLength();
        info.poolLength = poolLength;
        
        PoolInfo[] memory pools = new PoolInfo[](pids.length);

        for (uint256 i = 0; i < pids.length; i++) {
            pools[i].pid = pids[i];
            (address lpToken, uint256 allocPoint,,) = chef.poolInfo(pids[i]);
            IPair uniV2 = IPair(lpToken);
            pools[i].lpToken = uniV2;
            pools[i].allocPoint = allocPoint;

            pools[i].token0 = uniV2.token0();
            pools[i].token1 = uniV2.token1();
        }
        return (info, pools);
    }
    
    function findPools(address who, uint256[] calldata pids) public view returns(PoolInfo[] memory) {
        uint256 count;

        for (uint256 i = 0; i < pids.length; i++) {
            (uint256 balance,) = chef.userInfo(pids[i], who);
            if (balance > 0) {
                count++;
            }
        }

        PoolInfo[] memory pools = new PoolInfo[](count);

        count = 0;
        for (uint256 i = 0; i < pids.length; i++) {
            (uint256 balance,) = chef.userInfo(pids[i], who);
            if (balance > 0) {
                pools[count].pid = pids[i];
                (address lpToken, uint256 allocPoint,,) = chef.poolInfo(pids[i]);
                IPair uniV2 = IPair(lpToken);
                pools[count].lpToken = uniV2;
                pools[count].allocPoint = allocPoint;
    
                pools[count].token0 = uniV2.token0();
                pools[count].token1 = uniV2.token1();
                count++;
            }
        }

        return pools;
    }
    
    struct UserPoolInfo {
        uint256 pid;
        uint256 balance; // Balance of pool tokens
        uint256 totalSupply; // Token staked lp tokens
        uint256 lpBalance; // Balance of lp tokens not staked
        uint256 lpTotalSupply; // TotalSupply of lp tokens
        uint256 lpAllowance; // LP tokens approved for masterchef
        uint256 reserve0;
        uint256 reserve1;
        uint256 token0rate;
        uint256 token1rate;
        uint256 rewardDebt;
        uint256 pending; // Pending SUSHI
    }    
    
    function pollPools(address who, uint256[] calldata pids) public view returns(UserPoolInfo[] memory) {
        UserPoolInfo[] memory pools = new UserPoolInfo[](pids.length);

        for (uint256 i = 0; i < pids.length; i++) {
            (uint256 amount,) = chef.userInfo(pids[i], who);
            pools[i].balance = amount;
            pools[i].pending = chef.pendingSushi(pids[i], who);

            (address lpToken,,,) = chef.poolInfo(pids[i]);
            pools[i].pid = pids[i];
            IPair uniV2 = IPair(lpToken);
            pools[i].totalSupply = uniV2.balanceOf(address(chef));
            pools[i].lpAllowance = uniV2.allowance(who, address(chef));
            pools[i].lpBalance = uniV2.balanceOf(who);
            pools[i].lpTotalSupply = uniV2.totalSupply();
            pools[i].token0rate = getETHRate(uniV2.token0());
            pools[i].token1rate = getETHRate(uniV2.token1());
            
            (uint112 reserve0, uint112 reserve1,) = uniV2.getReserves();
            pools[i].reserve0 = reserve0;
            pools[i].reserve1 = reserve1;
        }
        return pools;
    }
}