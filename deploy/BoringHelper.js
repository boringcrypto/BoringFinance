module.exports = async function (hre) {
  const chainId = await hre.getChainId()

  if (chainId == "31337") { 
    console.log("Deploying BoringHelper")
    const boringHelper = await hre.deployments.deploy("BoringHelper", {
        from: (await hre.getUnnamedAccounts())[0],
        args: [
            "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd",
            "0xE11fc0B43ab98Eb91e9836129d1ee7c3Bc95df50",
            "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
            "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
            "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
            "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
            "0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272",
            "0xB5891167796722331b7ea7824F036b3Bdcb4531C"
        ]
    })
  }
}
