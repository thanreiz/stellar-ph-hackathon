import 'react-native-get-random-values';
import { Buffer } from 'buffer';

// Ensure global Buffer is always registered first
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

import { Transaction, FeeBumpTransaction, xdr } from '@stellar/stellar-sdk';

const overrideToXDR = function () {
  const xdrBytes = this.toEnvelope().toXDR();
  return Buffer.from(xdrBytes).toString('base64');
};

if (Transaction && Transaction.prototype) {
  Transaction.prototype.toXDR = overrideToXDR;
}
if (FeeBumpTransaction && FeeBumpTransaction.prototype) {
  FeeBumpTransaction.prototype.toXDR = overrideToXDR;
}

if (xdr && xdr.TransactionEnvelope) {
  const XdrTypeProto = Object.getPrototypeOf(xdr.TransactionEnvelope.prototype);
  if (XdrTypeProto && XdrTypeProto.toXDR) {
    const originalToXDR = XdrTypeProto.toXDR;
    XdrTypeProto.toXDR = function (format = 'raw') {
      const rawResult = originalToXDR.call(this, 'raw');
      if (format === 'raw') {
        return Buffer.from(rawResult);
      }
      return Buffer.from(rawResult).toString(format);
    };
  }
}

console.log('[Polyfills] Stellar SDK overrides successfully applied.');
