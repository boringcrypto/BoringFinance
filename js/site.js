Decimal.config({ precision: 36 })
Decimal.config({ toExpNeg: -1000 })
Decimal.config({ toExpPos: 1000 })
Decimal.prototype.toInt = function (decimals) {
    return BigInt(this.times(new Decimal("10").pow(new Decimal(decimals.toString()))).todp(0))
}
Vue.prototype.window = window
Vue.prototype.Decimal = Decimal

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
        return new Intl.NumberFormat().format(x.toSignificantDigits(4).toFixed())
    } else {
        return new Intl.NumberFormat().format(x.toFixed(decimalPlaces))
    }
}

Object.defineProperty(Array.prototype, "sum", {
    value: function (start) {
        return this.reduce((a, b) => a + b, start)
    },
})

function ago(nd, s) {
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
    return pl(i, r(ts / o[i]))
}

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
