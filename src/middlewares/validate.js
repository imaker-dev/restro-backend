const Joi = require('joi');
const { ValidationError } = require('../utils/errors');

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[property];
    
    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
      errors: {
        wrap: {
          label: '',
        },
      },
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      // Build a human-readable summary from field errors
      const summary = errors.map(e => `${e.field}: ${e.message}`).join('; ');

      return res.status(422).json({
        success: false,
        status: 'fail',
        message: `Validation failed — ${summary}`,
        errors,
      });
    }

    req[property] = value;
    next();
  };
};

const validateQuery = (schema) => validate(schema, 'query');
const validateParams = (schema) => validate(schema, 'params');
const validateBody = (schema) => validate(schema, 'body');

module.exports = {
  validate,
  validateQuery,
  validateParams,
  validateBody,
};
