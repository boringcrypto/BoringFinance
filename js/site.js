Decimal.config({ precision: 36 })
Decimal.config({ toExpNeg: -1000 })
Decimal.config({ toExpPos: 1000 })
Decimal.prototype.toInt = function (decimals) {
    return BigInt(this.times(new Decimal("10").pow(new Decimal(decimals.toString()))).todp(0))
}
Vue.prototype.window = window
Vue.prototype.Decimal = Decimal

BigInt.min = function(a, b) {
    return a < b ? a : b
}

BigInt.prototype.toDec = function (divisor) {
    return new Decimal(this.toString()).dividedBy(new Decimal(10).toPower(divisor.toString()))
}
const bigIntMax = (...args) => args.reduce((m, e) => (e > m ? e : m))
const bigIntMin = (...args) => args.reduce((m, e) => (e < m ? e : m))

// Returns a string where the value is divided by 10^divisor and cut off to decimalPlaces decimal places
// Pass in sep to change the decimal point. No rounding done at the moment.
BigInt.prototype.print = function (divisor, decimalPlaces) {
    let powDivisor = new Decimal(10).toPower(divisor.toString())
    //Scale the number down by divisor
    let x = new Decimal(this.toString())
    x = x.dividedBy(powDivisor)
    if (x.decimalPlaces() - x.precision() > decimalPlaces - 4) {
        return new Intl.NumberFormat('default', {maximumFractionDigits: 18}).format(x.toSignificantDigits(4).toFixed())
    } else {
        return new Intl.NumberFormat('default', {maximumFractionDigits: 18}).format(x.toFixed(decimalPlaces))
    }
}

Object.defineProperty(Array.prototype, "sum", {
    value: function (start) {
        return this.reduce((a, b) => a + b, start)
    },
})

function rebase(value, from, to) {
    return from ? value * to / from : 0n
}

function ago(time, nd, s) {
    time = Number(time)
    const o = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 1000 * 60,
        day: 24 * 60 * 1000 * 60,
        week: 7 * 24 * 60 * 1000 * 60,
        month: 30 * 24 * 60 * 1000 * 60,
        year: 365 * 24 * 60 * 1000 * 60
      };
    
    var dir = ' ago'
    var pl = function(v, n) {
        return (s === undefined) ? n + ' ' + v + (n > 1 ? 's' : '') + dir : n + v.substring(0, 1)
    }
    var ts = Date.now() - new Date(nd).getTime()
    var ii
    if( ts < 0 ) {
        ts *= -1;
        dir = ' from now';
    }
    for (var i in o) {
        if (Math.round(ts) < o[i]) return pl(ii || 'm', Math.round(ts / (o[ii] || 1)))
        ii = i
    }
    return pl(i, Math.round(ts / o[i]))
}
Vue.prototype.ago = ago

let loaded_pages = {}

async function load_html(path) {
    $("html").append(await $.ajax(path))
}

async function load_page(path, name) {
    if (!loaded_pages[name]) {
        window.page_done = function () {
            app.page.template = $("#page_template").html()
            $("#page_template").remove()
            app.$router.addRoutes([{ path: path, component: app.page }])
        }
        await load_html("page/" + name + ".html")
        loaded_pages[name] = true
    }
}

async function load_component(name) {
    await load_html("components/" + name + ".html")
}

function addComponent(name, component, template) {
    component.template = $(template || "#component_template").html()
    Vue.component(name, component)
    $(template || "#component_template").remove()
}

Vue.component("web3", {
    props: ["manager", "isglobal", "init", "poll", "close"],
    data: function () {
        return {
            initialized: false,
            initializing: false,
            should_close: false,
        }
    },
    watch: {
        "manager.web3": "update",
        "manager.address": "update",
        "manager.block": "update",
    },
    methods: {
        do_init: async function () {
            if (this.init) {
                await this.init(this.manager.web3, this.manager)
            }
        },
        do_poll: async function () {
            if (this.poll) {
                await this.poll(this.manager.web3, this.manager)
            }
        },
        do_close: async function () {
            if (this.close) {
                await this.close(this.manager.web3, this.manager)
            }
        },
        update: async function () {
            if (
                !this.initialized &&
                !this.initializing &&
                !this.should_close &&
                this.manager &&
                this.manager.web3 &&
                this.manager.block &&
                (this.isglobal || this.manager.address)
            ) {
                this.initializing = true
                await this.do_init()
                this.initialized = true
                this.initializing = false
                if (this.should_close) {
                    await this.do_close()
                }
            }
            if (this.initialized && !this.should_close) {
                await this.do_poll()
            }
        },
    },
    mounted: function () {
        this.update()
    },
    beforeDestroy: async function () {
        if (this.initialized) {
            await this.do_close()
        } else {
            this.should_close = true
        }
    },
    template: "<div><slot :initialized='initialized'></slot></div>",
})

Vue.component("eventreader", {
    props: ["manager", "isglobal", "address", "topics", "handler", "version", "step", "output", "abi", "synced"],
    data: function () {
        return {
            status: { loading: false },
        }
    },
    methods: {
        init: async function (web3, manager) {
            this.logs = new LogMonitor(
                this.manager,
                this.address,
                this.topics,
                this.handler,
                this.output,
                this.version,
                this.status,
                this.step,
                this.abi,
                this.synced
            )
            await this.logs.init()
        },
        close: async function (web3, manager) {
            if (this.logs) {
                this.logs.close()
            }
        },
    },
    template:
        "<web3 :manager='manager' :isglobal='isglobal' :init='init' :close='close'><slot v-if='status.loading'></slot></web3>",
})

class Value {
    constructor(value, name) {
        this.value = BigInt(value || 0n)
        this.name = name
    }

    get str() {
        if (this.value.print) {
            return this.value.print(this.asset.decimals, 2)
        }
        console.warn("Cannot print value for Value", this.name)
    }

    get number() {
        return this.value.toDec(this.asset.decimals)
    }

    get set() {
        return this.value != 0n
    }
}

class AssetValue extends Value {
    constructor(value, asset, name) {
        if (!asset) {
            console.warn("Missing asset")
        }
        super(value, name)
        this.asset = asset
    }
}

class Amount extends AssetValue {
    constructor(value, asset, name) {
        if (value instanceof Value) {
            if (value instanceof Amount) {
                value = value.value
            } else {
                console.warn("Wrong type, not Amount", this.name)
            }
        }
        super(value, asset, name)
    }

    get str() {
        if (this.value.print) {
            return this.value.print(this.asset.decimals, 2) + ' ' + this.asset.symbol
        }
        console.warn("Cannot print value for Amount", this.name)
    }

    get amount() {
        return this
    }

    get share() {
        return new Share(this.asset.bentoAmount ? this.value * this.asset.bentoShare / this.asset.bentoAmount : 0n, this.asset, this.name)
    }

    get usd() {
        return new USD(this.asset.rate > 0n ? this.value * (app.ethRate || 0n) / this.asset.rate : 0n, this.name)
    }
}

class Share extends AssetValue {
    constructor(value, asset, name) {
        if (value instanceof Value) {
            if (value instanceof Share) {
                value = value.value
            } else {
                console.warn("Wrong type, not Amount", this.name)
            }
        }
        super(value, asset, name)
    }

    get str() {
        if (this.value.print) {
            return this.value.print(0, 0) + ' ' + this.asset.symbol + ' shares'
        }
        console.warn("Cannot print value for Share", this.name)        
    }
    
    get amount() {
        return new Amount(this.asset.bentoShare ? this.value * this.asset.bentoAmount / this.asset.bentoShare : 0n, this.asset, this.name)
    }

    get share() {
        return this
    }

    get usd() {
        return this.amount.usd
    }
}

class USD extends Value {
    get str() {
        if (this.value.print) {
            return this.value.print(6, 2)
        }
        console.warn("Cannot print value for USD", this.name)
    }
}

class Pair {
    constructor(pair, web3) {
        this.address = pair.address
        this.collateralAddress = pair.collateralAddress
        this.assetAddress = pair.assetAddress
        this.oracle = pair.oracle
        this.oracleData = pair.oracleData
        this.added = false
        this.collateral = app.assetManager.addAsset({ address: pair.collateralAddress })
        this.asset = app.assetManager.addAsset({ address: pair.assetAddress })
        this.oracle = pair.oracle

        if (pair.oracle == web3.peggedoracle.address.toLowerCase()) {
            this.oracleName = "Pegged"
            this.oracleDescription = "The exchange rate is fixed and will never change. This oracle may be used when both collateral and asset are pegged to the same underlying asset, such as USDT and DAI. But if either the collateral or the asset loses it's peg permanently, no liquidiations will happen as the exchange rate will stay the same. The benefit is that this pair unaffected by market manipulation."
            this.oracleVerified = true
        }

        this.addCollateralAmount = ""
        this.addAssetAmount = ""
        this.borrowAmount = ""
        this.collateralFrom = ""
        this.supplyFrom = ""
    }

    update(pair) {
        Vue.set(this, "totalCollateral", new Share(pair.totalCollateralShare, this.collateral, "totalCollateral"))
        Vue.set(this, "userCollateral", new Share(pair.userCollateralShare, this.collateral, "userCollateral"))

        Vue.set(this, "totalAsset", new AssetRebase(pair.totalAsset, this))
        Vue.set(this, "userAsset", new Fraction(pair.userAssetFraction, this, "userAssetFraction"))

        Vue.set(this, "totalBorrow", new BorrowRebase(pair.totalBorrow, this))
        Vue.set(this, "userBorrow", new Part(pair.userBorrowPart, this, "userBorrowPart"))

        Vue.set(this, "currentExchangeRate", pair.currentExchangeRate)
        Vue.set(this, "oracleExchangeRate", pair.oracleExchangeRate)
        Vue.set(this, "accrueInfo", pair.accrueInfo)

        // Calculated
        Vue.set(this, "timeElapsed", app.timestamp - this.accrueInfo.lastAccrued)
        Vue.set(this, "interestPerYear", this.accrueInfo.interestPerSecond * 60n * 60n * 24n * 365n)

        Vue.set(this, "totalBorrowable", new Share(this.totalAsset.elastic > 1000n ? this.totalAsset.elastic - 1000n : 0n, this.asset, "totalBorrowable"))

        Vue.set(this, "fee", new Fraction(this.accrueInfo.feesEarnedFraction, this, "fee"))

        Vue.set(this, "checked", true)
    }

    accrue(amount) {
        return ((amount * this.accrueInfo.interestPerSecond * this.timeElapsed) / 1000000000000000000n)
    }

    interestAccrue(interest) {
        if (!this.totalBorrow.base) {
            return STARTING_INTEREST_PER_YEAR;
        }

        let currentInterest = interest
        if (this.timeElapsed <= 0) { return currentInterest }
        if (this.utilization < MINIMUM_TARGET_UTILIZATION) {
            const underFactor = (MINIMUM_TARGET_UTILIZATION - this.utilization) * FACTOR_PRECISION / MINIMUM_TARGET_UTILIZATION;
            const scale = INTEREST_ELASTICITY + underFactor * underFactor * this.timeElapsed;
            currentInterest = currentInterest * INTEREST_ELASTICITY / scale;

            if (currentInterest < MINIMUM_INTEREST_PER_YEAR) {
                currentInterest = MINIMUM_INTEREST_PER_YEAR; // 0.25% APR minimum
            }
        } else if (this.utilization > MAXIMUM_TARGET_UTILIZATION) {
            const overFactor = (this.utilization - MAXIMUM_TARGET_UTILIZATION) * FACTOR_PRECISION / FULL_UTILIZATION_MINUS_MAX;
            const scale = INTEREST_ELASTICITY + overFactor * overFactor * this.timeElapsed;
            currentInterest = currentInterest * scale / INTEREST_ELASTICITY;
            if (currentInterest > MAXIMUM_INTEREST_PER_YEAR) {
                currentInterest = MAXIMUM_INTEREST_PER_YEAR; // 1000% APR maximum
            }
        }
        return currentInterest
    }
}

class PairValue extends Value {
    constructor(value, pair, name) {
        if (!pair) {
            console.warn("Missing pair")
        }
        super(value, name)
        this.pair = pair
    }

    get share() {
        return this.amount.share
    }

    get usd() {
        return this.amount.usd
    }
}

class Part extends PairValue {
    constructor(value, pair, name) {
        if (value instanceof Value) {
            if (value instanceof Part) {
                value = value.value
            } else {
                console.warn("Wrong type, not Part", this.name, this.pair)
            }
        }
        super(value, pair, name)
    }

    get str() {
        if (this.value.print) {
            return this.value.print(0, 0) + ' ' + this.asset.symbol + ' parts'
        }
        console.warn("Cannot print value for Part", this.name, this.pair)        
    }
    
    get amount() {
        return new Amount(this.pair.totalBorrow.base ? this.value * this.pair.totalBorrow.elastic / this.pair.totalBorrow.base : 0n, this.pair.asset, this.name)
    }

    get part() {
        return this
    }
}

class BorrowAmount extends PairValue {
    constructor(value, pair, name) {
        if (value instanceof Value) {
            if (value instanceof BorrowAmount) {
                value = value.value
            } else {
                console.warn("Wrong type, not BorrowAmount", this.name, this.pair)
            }
        }
        super(value, pair, name)
    }

    get str() {
        return this.amount.str
    }
    
    get amount() {
        return new Amount(this.value, this.pair.asset, this.name)
    }

    get part() {
        return new Part(this.pair.totalBorrow.elastic ? this.value * this.pair.totalBorrow.base / this.pair.totalBorrow.elastic : 0n, this.pair, this.name)
    }

    get currentAmount() {
        //amount * 9n / 10n
        const accrued = ((this.amount * this.pair.accrueInfo.interestPerSecond * (app.timestamp - this.pair.accrueInfo.lastAccrued)) / 1000000000000000000n)

        return this.amount.value + takeFee(pair.accrue(pair.userBorrow.amount.value))
    }
}

class Fraction extends PairValue {
    constructor(value, pair, name) {
        if (value instanceof Value) {
            if (value instanceof Fraction) {
                value = value.value
            } else {
                console.warn("Wrong type, not Fraction", this.name, this.pair)
            }
        }
        super(value, pair, name)
    }

    get str() {
        if (this.value.print) {
            return this.value.print(0, 0) + ' ' + this.pair.asset.symbol + ' fractions'
        }
        console.warn("Cannot print value for Fraction", this.name, this.pair)        
    }
    
    get amount() {
        return this.share.amount
    }

    get share() {
        return new Share(this.pair.totalAsset.toElastic(this.value), this.pair.asset, this.name)
    }

    get usd() {
        return this.amount.usd
    }
}

class AssetShare extends PairValue {
    constructor(value, pair, name) {
        if (value instanceof Value) {
            if (value instanceof Fraction) {
                value = value.value
            } else {
                console.warn("Wrong type, not Fraction", this.name, this.pair)
            }
        }
        super(value, pair, name)
    }

    get str() {
        if (this.value.print) {
            return this.value.print(0, 0) + ' ' + this.asset.symbol + ' fractions'
        }
        console.warn("Cannot print value for Fraction", this.name, this.pair)        
    }
    
    get amount() {
        return this.share.amount
    }

    get share() {
        return new Share(this.pair.totalAsset.toElastic(this.value), this.pair.asset, this.name)
    }

    get usd() {
        return this.amount.usd
    }
}

class Rebase {
    constructor(rebase, pair, name) {
        this.base = rebase.base
        this.elastic = rebase.elastic
        this.pair = pair
        this.name = name
    }

    toElastic(base) {
        return rebase(base, this.base, this.elastic)
    }

    toBase(elastic, rebaseObj) {
        return rebase(elastic, this.elastic, this.base)
    }
}

class AssetRebase extends Rebase {
    constructor(rebase, pair) {
        super(rebase, pair, "totalAsset")
    }

    get fraction() {
        return new Fraction(this.base, this.pair, this.name)
    }

    get amount() {
        return this.share.amount
    }

    get share() {
        return new AssetShare(this.elastic, this.pair, this.name)
    }
}

class BorrowRebase extends Rebase {
    constructor(rebase, pair) {
        super(rebase, pair, "totalBorrow")
    }

    get part() {
        return new Part(this.base, this.pair, this.name)
    }

    get amount() {
        return new BorrowAmount(this.elastic, this.pair, this.name)
    }

    get current() {
        return new BorrowAmount(this.elastic + this.pair.accrue(this.elastic), this.pair, "current" + this.name)
    }
}
