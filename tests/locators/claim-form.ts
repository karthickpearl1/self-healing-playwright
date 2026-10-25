// The locator map for the claim form: one entry per element the tests touch.
//
// primary   - the locator the test uses today (deliberately naive CSS ids, as many real suites are)
// fallbacks - better locators to try, in order, if the primary breaks
// intent    - what the element is, in plain English, for the LLM step and the report
//
// When the healing report suggests a patch, it is a change to a `primary:` line in this file.
// Not every element has every kind of fallback, just as in a real suite.

import type { ElementSpec } from '../../src/healing/types';

export const claimForm = {
  policyNumber: {
    key: 'claimForm.policyNumber',
    intent: 'Policy number box',
    primary: '#policyNumber',
    fallbacks: [
      { by: 'testId', value: 'policy-number' },
      { by: 'label', value: 'Policy number' },
    ],
  },
  claimType: {
    key: 'claimForm.claimType',
    intent: 'Type of claim dropdown',
    primary: '#claimType',
    fallbacks: [
      { by: 'testId', value: 'claim-type' },
      { by: 'label', value: 'Type of claim' },
    ],
  },
  incidentDate: {
    key: 'claimForm.incidentDate',
    intent: 'Date of incident picker',
    primary: '#incidentDate',
    fallbacks: [{ by: 'testId', value: 'incident-date' }],
  },
  description: {
    key: 'claimForm.description',
    intent: 'Description of what happened',
    primary: '#description',
    fallbacks: [
      { by: 'testId', value: 'description' },
      { by: 'label', value: 'What happened?' },
    ],
  },
  contactByPhone: {
    key: 'claimForm.contactByPhone',
    intent: 'Phone contact option',
    primary: '#contactPhone',
    fallbacks: [{ by: 'role', role: 'radio', name: 'Phone' }],
  },
  phoneNumber: {
    key: 'claimForm.phoneNumber',
    intent: 'Phone number box',
    primary: '#phoneNumber',
    fallbacks: [
      { by: 'testId', value: 'phone-number' },
      { by: 'label', value: 'Phone number' },
    ],
  },
  submit: {
    key: 'claimForm.submit',
    intent: 'Submit claim button',
    primary: '#submitClaim',
    fallbacks: [
      { by: 'testId', value: 'submit-claim' },
      { by: 'role', role: 'button', name: 'Submit claim' },
    ],
  },
  errorMessage: {
    key: 'claimForm.errorMessage',
    intent: 'Form error message',
    primary: '#formError',
    fallbacks: [{ by: 'role', role: 'alert' }],
  },
  confirmation: {
    key: 'claimForm.confirmation',
    intent: 'Claim confirmation message',
    primary: '#confirmation',
    fallbacks: [{ by: 'role', role: 'status' }],
  },
} satisfies Record<string, ElementSpec>;
