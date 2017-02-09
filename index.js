var Controller = require('./lib/controller');

Controller.validators = require('./lib/validation/validators');
Controller.formatters = require('./lib/formatting/formatters');

Controller.Error = require('./lib/error');

module.exports = Controller;
