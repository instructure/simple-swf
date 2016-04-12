if (process.env.SSWF_USE_SOURCE) {
  module.exports = require('./src')
} else {
  module.exports = require('./lib')
}

