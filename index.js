'use strict';

const Session = require('hof-behaviour-session');
const Hooks = require('hof-behaviour-hooks');
const Controller = require('./lib/controller');
const DeprecatedForm = require('./lib/deprecated-form');
const mix = require('mixwith').mix;

class FormController extends mix(Controller).with(Session, Hooks) {}

FormController.validators = require('./lib/validation/validators');
FormController.formatters = require('./lib/formatting/formatters');
DeprecatedForm.validators = require('./lib/validation/validators');
DeprecatedForm.formatters = require('./lib/formatting/formatters');

FormController.ValidationError = require('./lib/validation-error');
DeprecatedForm.Error = require('./lib/deprecated-error');

module.exports = FormController;
module.exports.DeprecatedForm = DeprecatedForm;
module.exports.Controller = Controller;
module.exports.BaseController = require('./lib/base-controller');
