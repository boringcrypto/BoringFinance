# SushiSwapJs
Use SushiSwap from js with ease.

SushiSwapJs is a simple javascript library that uses a few helper smart contracts to make working with SushiSwap easier and much much faster.

- Get all info of all pools (including user data) in a single js call (2 web3 calls behind the scenes)
- Regularly requery to create a live dashboard (one single web3 call to update behind the scenes)
- Can return values in any token (default: USDT)
- Does *NOT* rely on price feeds, such as CoinGecko. Instead uses Uniswap pools to find all needed exchange rates.

## Usage
Create the SushiSwap instance:

    let sushiswap = new SushiSwap(web3);

Retrieve all info:

    sushiswap.getInfo(address);

This will populate **base** and **pools** on the sushiswap object. To get a user's pending SUSHI:

    sushiswap.base.pending

To get the monthly ROI on the Compound Truffle pool (nr. 4):

    sushiswap.pools[4].monthlyROI

To keep the data up to date, use auto_update:

    sushiswap.auto_update(() => {
        sushiswap.getInfo(address)

        // Your code to update the UI
    })

To check all info that is available, check this live demo:

Live data DEMO: https://bartjman.github.io/SushiSwapJs/

Live UI DEMO (WIP): https://bartjman.github.io/SushiSwapJs/pages/demo_ui.html