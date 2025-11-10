import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from 'libphonenumber-js';

/**
 * Custom validator constraint for phone numbers with country code
 */
@ValidatorConstraint({ name: 'isPhoneNumberWithCountryCode', async: false })
export class IsPhoneNumberWithCountryCodeConstraint implements ValidatorConstraintInterface {
  validate(phoneNumber: any, args: ValidationArguments) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }

    try {
      // Check if phone number starts with '+'
      if (!phoneNumber.startsWith('+')) {
        return false;
      }

      // Validate the phone number
      const isValid = isValidPhoneNumber(phoneNumber);
      
      if (!isValid) {
        return false;
      }

      // Parse the phone number to ensure it has a country code
      const parsed = parsePhoneNumber(phoneNumber);
      
      // Check if country code exists
      if (!parsed || !parsed.country) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return 'Le numéro de téléphone doit être au format international avec le code pays (ex: +229 XX XX XX XX)';
  }
}

/**
 * Decorator for validating phone numbers with country code
 * @param validationOptions - Optional validation options
 */
export function IsPhoneNumberWithCountryCode(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPhoneNumberWithCountryCodeConstraint,
    });
  };
}