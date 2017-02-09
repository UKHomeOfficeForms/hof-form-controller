'use strict';
/*eslint no-unused-vars: [2, {"vars": "all", "args": "none"}]*/

const express = require('express');
const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');
const debug = require('debug')('hof:form');
const dataFormatter = require('./formatting');
const dataValidator = require('./validation');
const ErrorClass = require('./base-error');

module.exports = class Form extends EventEmitter {
  constructor(options) {
    if (!options) {
      throw new Error('Options must be provided');
    }
    if (!options.template) {
      debug('No template provided');
    }
    options.defaultFormatters = options.defaultFormatters || ['trim', 'singlespaces', 'hyphens'];
    options.fields = options.fields || {};
    this.options = options;
    this.Error = ErrorClass;

    this.router = express.Router({ mergeParams: true });
  }

  requestHandler () {
    const methods = ['get', 'post', 'put', 'delete'];
    methods.forEach(method => {
      if (typeof this[method] === 'function') {
        this.router[method]('*', this[method].bind(this));
      } else {
        this.router[method]('*', (req, res, next) => {
          const err = new Error('Method not supported');
          err.statusCode = 405;
          next(err);
        });
      }
    }, this);
    this.router.use(this.errorHandler.bind(this));
    return this.router;
  }

  use() {
    this.router.use.apply(this.router, arguments);
  }

  get(req, res, callback) {
    return express.Router({ mergeParams: true })
      .use([
        this._configure.bind(this),
        this._getErrors.bind(this),
        this._getValues.bind(this),
        this._locals.bind(this),
        this._checkEmpty.bind(this),
        this.render.bind(this),
        (err, req, res, next) => {
          callback(err);
        }
      ]).handle(req, res, callback);
  }

  post(req, res, callback) {
    this.setErrors(null, req, res);
    return express.Router({ mergeParams: true })
      .use([
        this._configure.bind(this),
        this._process.bind(this),
        this._validate.bind(this),
        this.saveValues.bind(this),
        this.successHandler.bind(this),
        (err, req, res, next) => {
          callback(err);
        }
      ]).handle(req, res, callback);
  }

  _locals(req, res, callback) {
    Object.assign(res.locals, {
      errors: req.form.errors,
      errorlist: _.map(req.form.errors, _.identity),
      values: req.form.values,
      options: req.form.options,
      action: req.baseUrl !== '/' ? req.baseUrl + req.path : req.path
    }, this.locals(req, res));
    callback();
  }

  locals(/*req, res*/) {
    return {};
  }

  render(req, res, callback) {
    if (!req.form.options.template) {
      callback(new Error('A template must be provided'));
    } else {
      res.render(req.form.options.template);
    }
  }

  _getErrors(req, res, callback) {
    req.form.errors = this.getErrors(req, res);
    callback();
  }

  // placeholder methods for persisting error messages between POST and GET
  getErrors(/*req, res*/) {
    return {};
  }

  setErrors(/*err, req, res*/) {}

  _validate(req, res, callback) {
    debug('Validating...');

    const errors = {};

    const formatter = dataFormatter(req.form.options.fields, req.form.options.defaultFormatters, req.form.options.formatters);
    const validator = dataValidator(req.form.options.fields);

    _.each(req.form.values, (value, key) => {
      const error = this.validateField(key, req, validator, formatter);
      if (error) {
        if (error.group) {
          errors[error.group] = new this.Error(error.group, error, req, res);
        } else {
          errors[error.key] = new this.Error(error.key, error, req, res);
        }
      }
    });

    if (!_.isEmpty(errors)) {
      callback(errors);
    } else {
      this.validate(req, res, callback);
    }
  }

  validate(req, res, callback) {
    callback();
  }

  validateField(key, req, validator, formatter) {
    formatter = formatter || dataFormatter(req.form.options.fields, req.form.options.defaultFormatters, req.form.options.formatters);
    validator = validator || dataValidator(req.form.options.fields);
    const emptyValue = formatter(key, '');
    return validator(key, req.form.values[key], req.form.values, emptyValue);
  }

  _process(req, res, callback) {
    req.form.values = req.form.values || {};
    var formatter = dataFormatter(req.form.options.fields, req.form.options.defaultFormatters, req.form.options.formatters);
    _.each(req.form.options.fields, function (value, key) {
      req.form.values[key] = formatter(key, req.body[key] || '');
    });
    this.process(req, res, callback);
  }

  process(req, res, callback) {
    callback();
  }

  _configure(req, res, callback) {
    req.form = req.form || {};
    req.form.options = _.clonedeep(this.options);
    this.configure(req, res, callback);
  }

  configure(req, res, callback) {
    callback();
  }

  _getValues(req, res, callback) {
    this.getValues(req, res, (err, values) => {
      req.form.values = values || {};
      callback(err);
    });
  }

  getValues(req, res, callback) {
    callback();
  }

  saveValues(req, res, callback) {
    callback();
  }

  _getForkTarget(req, res) {
    function evalCondition(condition) {
      return _.isFunction(condition) ?
      condition(req, res) :
      condition.value === req.form.values[condition.field];
    }

    // If a fork condition is met, its target supercedes the next property
    return req.form.options.forks.reduce((result, value) => {
      return evalCondition(value.condition) ?
      value.target :
      result;
    }, req.form.options.next);
  }

  getForkTarget(req, res) {
    return this._getForkTarget(req, res);
  }

  _checkEmpty(req, res, callback) {
    if (_.isEmpty(req.form.options.fields) && req.form.options.next) {
      this.emit('complete', req, res);
    }
    callback();
  }

  getNextStep(req, res) {
    let next = req.form.options.next || req.path;
    if (req.form.options.forks && Array.isArray(req.form.options.forks)) {
      next = this._getForkTarget(req, res);
    }
    if (req.baseUrl !== '/') {
      next = req.baseUrl + next;
    }
    return next;
  }

  getErrorStep(err, req) {
    const redirectError = _.all(err, error => error.redirect);
    let redirect = req.path;

    if (redirectError) {
      redirect = _.find(err, error => error.redirect).redirect;
    }
    if (req.baseUrl !== '/' && !redirect.match(/^https?:\/\//)) {
      redirect = req.baseUrl + redirect;
    }
    return redirect;
  }

  isValidationError(err) {
    return !_.isEmpty(err) && _.all(err, e => e instanceof this.Error);
  }

  errorHandler(err, req, res, callback) {
    if (this.isValidationError(err)) {
      this.setErrors(err, req, res);
      res.redirect(this.getErrorStep(err, req));
    } else {
      // if the error is not a validation error then throw and let the error handler pick it up
      return callback(err);
    }
  }

  successHandler(req, res) {
    this.emit('complete', req, res);
    res.redirect(this.getNextStep(req, res));
  }
}