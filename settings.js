module.exports = {
    hardhat: {
        networks: {
            hardhat: {
                forking: { 
                    blockNumber: 11964057 
                }
            },
        }        
    },
    solcover: {},
    prettier: {
        overrides: [
            {
                files: "*.html",
                options: {
                    printWidth: 145,
                    tabWidth: 4,
                    useTabs: false,
                    singleQuote: false,
                    explicitTypes: "always",
                },
            },
        ],
    },
}
